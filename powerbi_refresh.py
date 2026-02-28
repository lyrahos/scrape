"""
PowerBI Python Data Source
==========================
Use this script in PowerBI Desktop:
    Get Data > Python script > paste this script

It runs an incremental sync (checks for new/updated pricing files),
then returns DataFrames that PowerBI loads as tables.

Requirements:
    pip install pandas httpx tqdm

Set DB_PATH below to your database location.
"""

import os
import sqlite3
import subprocess
import sys

# --- CONFIGURATION ---
# Set this to the full path of your hospital_pricing.db file
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hospital_pricing.db")
# Set to True to auto-sync before loading (checks for new pricing data)
AUTO_SYNC = True
# ---------------------

try:
    import pandas as pd
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas"])
    import pandas as pd


def run_sync():
    """Run the sync command to check for updates."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    main_py = os.path.join(script_dir, "main.py")
    if os.path.exists(main_py):
        subprocess.run(
            [sys.executable, main_py, "sync", "--db", DB_PATH],
            cwd=script_dir,
            timeout=7200,  # 2 hour max
        )


if AUTO_SYNC:
    run_sync()

conn = sqlite3.connect(DB_PATH)

# --- Tables PowerBI will import ---

# Facilities dimension table
facilities = pd.read_sql_query("""
    SELECT id, name, address, city, state, zip, phone,
           beds, lat, long, ccn, url
    FROM facilities
""", conn)

# Pricing fact table (core data for analysis)
pricing = pd.read_sql_query("""
    SELECT p.facility_id, p.hospital_name, p.description,
           p.code, p.code_type, p.payer, p.plan,
           p.gross_charge, p.discounted_cash, p.negotiated_rate,
           p.min_negotiated, p.max_negotiated,
           f.name AS facility_name, f.state, f.city
    FROM pricing p
    JOIN facilities f ON p.facility_id = f.id
""", conn)

# Files metadata (for tracking data freshness)
files = pd.read_sql_query("""
    SELECT f.fileid, f.facility_id, f.filename, f.retrieved,
           f.size, f.downloaded, fac.name, fac.state
    FROM files f
    JOIN facilities fac ON f.facility_id = fac.id
    WHERE f.filesuffix = 'csv'
""", conn)

# Sync history (for monitoring the pipeline)
sync_log = pd.read_sql_query("""
    SELECT started_at, finished_at, new_files, updated_files,
           new_pricing_rows, status
    FROM sync_log
    ORDER BY id DESC
    LIMIT 30
""", conn)

conn.close()
