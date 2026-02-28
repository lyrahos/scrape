"""Transform downloaded CSVs into SQLite pricing rows.

Handles the CMS Hospital Price Transparency v3 format where payer-specific
negotiated rates are in separate columns like:
    standard_charge|Aetna|Commercial|negotiated_dollar
    standard_charge|Blue Cross|Medicare Advantage|negotiated_percentage

These get "unpivoted" into normalized rows: one row per procedure per payer.
"""

import csv
import json
import re
import sys
from pathlib import Path

from tqdm import tqdm

from database import insert_pricing_batch, get_loaded_files

BATCH_SIZE = 5000
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

# Pattern to match payer-specific negotiated charge columns
# e.g., "standard_charge|Aetna|Commercial|negotiated_dollar"
PAYER_COL_RE = re.compile(
    r"^standard[_ ]charge\|(.+?)\|(.+?)\|(negotiated[_ ](?:dollar|percentage|algorithm)|methodology)$",
    re.IGNORECASE,
)

# Pattern for additional payer notes
PAYER_NOTES_RE = re.compile(
    r"^additional[_ ]payer[_ ]notes\|(.+?)\|(.+?)$",
    re.IGNORECASE,
)


def _normalize(h: str) -> str:
    return h.strip().strip("\ufeff").lower()


def _parse_float(val: str | None):
    if not val:
        return None
    val = val.strip().replace(",", "").replace("$", "").replace("%", "")
    if not val or val in ("-", "") or val.lower() in ("n/a", "na", "null", "none"):
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _find_header_row(reader) -> tuple[list[str] | None, int]:
    """Skip metadata rows and find the actual header row."""
    for row_num, row in enumerate(reader):
        if not row or all(not c.strip() for c in row):
            continue
        lower_row = [c.strip().lower() for c in row]
        # The header row should contain "description" and some charge column
        if any("description" in c for c in lower_row):
            return row, row_num
    return None, -1


def _parse_headers(headers: list[str]):
    """Parse headers into standard columns and payer-specific columns.

    Returns:
        base_map: {col_index: field_name} for standard columns
        payer_map: {(payer, plan): {field_type: col_index}} for payer columns
        code_cols: [(index, code_num)] for code columns
        code_type_cols: [(index, code_num)] for code type columns
    """
    base_map = {}
    payer_map = {}  # (payer, plan) -> {"negotiated_dollar": idx, ...}
    code_cols = []
    code_type_cols = []

    BASE_FIELDS = {
        "description": "description",
        "setting": "setting",
        "standard_charge|gross": "gross_charge",
        "standard charge | gross": "gross_charge",
        "standard_charge|discounted_cash": "discounted_cash",
        "standard charge | discounted cash": "discounted_cash",
        "standard_charge|min": "min_negotiated",
        "standard charge | min": "min_negotiated",
        "standard_charge|max": "max_negotiated",
        "standard charge | max": "max_negotiated",
        "additional_generic_notes": "additional_generic_notes",
        "additional generic notes": "additional_generic_notes",
        "modifiers": "modifiers",
        "hospital_name": "hospital_name",
        "hospital name": "hospital_name",
        "drug_unit_of_measurement": "drug_unit",
        "drug_type_of_measurement": "drug_type",
    }

    for i, h in enumerate(headers):
        norm = _normalize(h)

        # Check base fields
        if norm in BASE_FIELDS:
            base_map[i] = BASE_FIELDS[norm]
            continue

        # Check code columns: code|1, code|2, etc.
        code_match = re.match(r"^code\|(\d+)$", norm)
        if code_match:
            code_cols.append((i, int(code_match.group(1))))
            continue

        code_type_match = re.match(r"^code\|(\d+)\|type$", norm)
        if code_type_match:
            code_type_cols.append((i, int(code_type_match.group(1))))
            continue

        # Check payer-specific columns
        payer_match = PAYER_COL_RE.match(norm)
        if payer_match:
            payer, plan, field_type = payer_match.groups()
            key = (payer, plan)
            if key not in payer_map:
                payer_map[key] = {}
            payer_map[key][field_type.replace(" ", "_")] = i
            continue

        # Check payer notes
        notes_match = PAYER_NOTES_RE.match(norm)
        if notes_match:
            payer, plan = notes_match.groups()
            key = (payer, plan)
            if key not in payer_map:
                payer_map[key] = {}
            payer_map[key]["notes"] = i
            continue

    return base_map, payer_map, code_cols, code_type_cols


def _get_val(row: list[str], idx: int) -> str:
    if idx < len(row):
        return row[idx].strip()
    return ""


def transform_csv(conn, facility_id: str, fileid: str, csv_path: Path,
                  hospital_name: str = "") -> int:
    """Parse a CMS v3 CSV and insert normalized rows into pricing table."""
    total = 0
    batch = []

    try:
        with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
            sample = f.read(16384)
        dialect = csv.Sniffer().sniff(sample, delimiters=",|\t")
    except csv.Error:
        dialect = csv.excel

    with open(csv_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f, dialect)
        headers, header_row = _find_header_row(reader)
        if not headers:
            return 0

        base_map, payer_map, code_cols, code_type_cols = _parse_headers(headers)

        if not base_map:
            return 0

        for row in reader:
            if not row or all(not c.strip() for c in row):
                continue

            # Extract base fields
            desc = _get_val(row, next((i for i, f in base_map.items() if f == "description"), -1))
            hosp = _get_val(row, next((i for i, f in base_map.items() if f == "hospital_name"), -1)) or hospital_name
            gross = _parse_float(_get_val(row, next((i for i, f in base_map.items() if f == "gross_charge"), -1)))
            discounted = _parse_float(_get_val(row, next((i for i, f in base_map.items() if f == "discounted_cash"), -1)))
            min_neg = _parse_float(_get_val(row, next((i for i, f in base_map.items() if f == "min_negotiated"), -1)))
            max_neg = _parse_float(_get_val(row, next((i for i, f in base_map.items() if f == "max_negotiated"), -1)))
            notes = _get_val(row, next((i for i, f in base_map.items() if f == "additional_generic_notes"), -1))

            # Get primary code (first non-empty code column)
            code = ""
            code_type = ""
            for col_idx, code_num in sorted(code_cols, key=lambda x: x[1]):
                val = _get_val(row, col_idx)
                if val:
                    code = val
                    # Find matching type column
                    for type_idx, type_num in code_type_cols:
                        if type_num == code_num:
                            code_type = _get_val(row, type_idx)
                            break
                    break

            if payer_map:
                # Create one row per payer/plan combination
                for (payer, plan), col_indices in payer_map.items():
                    neg_dollar_idx = col_indices.get("negotiated_dollar")
                    neg_pct_idx = col_indices.get("negotiated_percentage")

                    neg_rate = None
                    if neg_dollar_idx is not None:
                        neg_rate = _parse_float(_get_val(row, neg_dollar_idx))
                    if neg_rate is None and neg_pct_idx is not None:
                        neg_rate = _parse_float(_get_val(row, neg_pct_idx))

                    # Skip payer rows with no negotiated rate
                    if neg_rate is None and gross is None and discounted is None:
                        continue

                    pricing_row = (
                        facility_id, fileid, hosp, desc,
                        code, code_type, payer, plan,
                        gross, discounted, neg_rate, min_neg, max_neg,
                        notes, None,
                    )
                    batch.append(pricing_row)
            else:
                # No payer columns — store as a single row
                pricing_row = (
                    facility_id, fileid, hosp, desc,
                    code, code_type, None, None,
                    gross, discounted, None, min_neg, max_neg,
                    notes, None,
                )
                batch.append(pricing_row)

            if len(batch) >= BATCH_SIZE:
                insert_pricing_batch(conn, batch)
                total += len(batch)
                batch.clear()

        if batch:
            insert_pricing_batch(conn, batch)
            total += len(batch)

    conn.commit()
    return total


def transform_all(conn, states: list[str] | None = None):
    """Transform all downloaded CSVs that haven't been loaded yet."""
    already_loaded = get_loaded_files(conn)

    query = """
        SELECT f.fileid, f.facility_id, f.local_path, f.filename, fac.name, fac.state
        FROM files f
        JOIN facilities fac ON f.facility_id = fac.id
        WHERE f.downloaded = 1 AND f.filesuffix = 'csv'
    """
    params = []
    if states:
        placeholders = ",".join("?" for _ in states)
        query += f" AND fac.state IN ({placeholders})"
        params.extend(states)

    cur = conn.execute(query, params)
    files = cur.fetchall()

    to_process = [(fid, facid, path, fname, name, state)
                  for fid, facid, path, fname, name, state in files
                  if fid not in already_loaded and path and Path(path).exists()]

    if not to_process:
        print("No CSVs to transform.")
        return

    print(f"Transforming {len(to_process)} CSVs into SQLite...")
    total_rows = 0

    for fileid, facility_id, local_path, filename, hosp_name, state in tqdm(
        to_process, desc="Transforming", unit="file"
    ):
        try:
            rows = transform_csv(conn, facility_id, fileid, Path(local_path), hosp_name)
            total_rows += rows
        except Exception as e:
            tqdm.write(f"  ERROR {filename}: {e}")

    print(f"Loaded {total_rows:,} pricing rows from {len(to_process)} files")
