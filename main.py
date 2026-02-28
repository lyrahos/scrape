#!/usr/bin/env python3
"""
Hospital Pricing Scraper
========================
Scrapes hospitalpricingfiles.org for hospital price transparency CSVs
and loads them into SQLite for PowerBI analysis.

Usage:
    python main.py scrape               # Scrape all facility metadata
    python main.py scrape --states TX CA # Scrape specific states only
    python main.py download              # Download all pending CSVs
    python main.py download --workers 8  # Download with 8 threads
    python main.py transform             # Load downloaded CSVs into SQLite
    python main.py sync                  # Check for updates, download new, transform
    python main.py stats                 # Show database stats
    python main.py all                   # Run full pipeline
    python main.py schedule              # Print cron / Task Scheduler setup
"""

import argparse
import os
import sys

from tqdm import tqdm

from api_client import APIClient, STATES
from database import (
    connect, create_schema, upsert_facility, upsert_file, get_stats,
    start_sync_log, finish_sync_log, get_last_sync,
)
from downloader import download_pending
from transformer import transform_all


def cmd_scrape(args):
    """Scrape facility metadata from the API into SQLite."""
    states = [s.upper() for s in args.states] if args.states else None
    target = states or STATES
    print(f"Scraping facilities for {len(target)} states...")

    conn = connect(args.db)
    create_schema(conn)

    total_facilities = 0
    total_files = 0
    new_files = 0
    updated_files = 0

    with APIClient() as client:
        with tqdm(target, desc="States", unit="state") as pbar:
            for state in pbar:
                facilities = client.search_facilities(state)
                for fac in facilities:
                    upsert_facility(conn, fac)
                    for fi in fac.get("files", []):
                        status = upsert_file(conn, fac["id"], fi)
                        if status == "new":
                            new_files += 1
                        elif status == "updated":
                            updated_files += 1
                        total_files += 1
                    total_facilities += 1
                conn.commit()
                pbar.set_postfix(facilities=total_facilities, files=total_files)

    print(f"Scraped {total_facilities} facilities with {total_files} files")
    if new_files or updated_files:
        print(f"  New files: {new_files}, Updated files: {updated_files}")
    _print_stats(conn)
    conn.close()
    return new_files, updated_files


def cmd_download(args):
    """Download pending CSV files."""
    states = [s.upper() for s in args.states] if args.states else None
    conn = connect(args.db)
    create_schema(conn)

    with APIClient() as client:
        download_pending(conn, client, states=states, workers=args.workers)

    _print_stats(conn)
    conn.close()


def cmd_transform(args):
    """Transform downloaded CSVs into SQLite pricing rows."""
    states = [s.upper() for s in args.states] if args.states else None
    conn = connect(args.db)
    create_schema(conn)
    transform_all(conn, states=states)
    _print_stats(conn)
    conn.close()


def cmd_sync(args):
    """Incremental sync: check for updates, download new/changed files, transform."""
    states = [s.upper() for s in args.states] if args.states else None
    conn = connect(args.db)
    create_schema(conn)

    log_id = start_sync_log(conn)

    last = get_last_sync(conn)
    if last and last["status"] == "done":
        print(f"Last sync: {last['started_at']}")
        print(f"  Found {last['new_files']} new + {last['updated_files']} updated files")

    # Step 1: Scrape metadata and detect changes
    target = states or STATES
    print(f"\n[1/3] Checking {len(target)} states for pricing updates...")
    total_new = 0
    total_updated = 0

    with APIClient() as client:
        with tqdm(target, desc="Checking", unit="state") as pbar:
            for state in pbar:
                facilities = client.search_facilities(state)
                for fac in facilities:
                    upsert_facility(conn, fac)
                    for fi in fac.get("files", []):
                        status = upsert_file(conn, fac["id"], fi)
                        if status == "new":
                            total_new += 1
                        elif status == "updated":
                            total_updated += 1
                conn.commit()
                pbar.set_postfix(new=total_new, updated=total_updated)

    if total_new == 0 and total_updated == 0:
        print("No new or updated files found. Database is up to date.")
        finish_sync_log(conn, log_id, 0, 0, 0)
        conn.close()
        return

    print(f"Found {total_new} new + {total_updated} updated files")

    # Step 2: Download new/changed files
    print(f"\n[2/3] Downloading new files...")
    with APIClient() as client:
        download_pending(conn, client, states=states, workers=args.workers)

    # Step 3: Transform new downloads into pricing rows
    print(f"\n[3/3] Loading new data into SQLite...")
    pricing_before = conn.execute("SELECT COUNT(*) FROM pricing").fetchone()[0]
    transform_all(conn, states=states)
    pricing_after = conn.execute("SELECT COUNT(*) FROM pricing").fetchone()[0]
    new_rows = pricing_after - pricing_before

    finish_sync_log(conn, log_id, total_new, total_updated, new_rows)

    print(f"\nSync complete: {total_new} new files, {total_updated} updated, {new_rows:,} new pricing rows")
    _print_stats(conn)
    conn.close()


def cmd_all(args):
    """Run full pipeline: scrape -> download -> transform."""
    cmd_scrape(args)
    cmd_download(args)
    cmd_transform(args)


def cmd_stats(args):
    """Print database statistics."""
    conn = connect(args.db)
    create_schema(conn)
    _print_stats(conn)

    last = get_last_sync(conn)
    if last:
        print(f"  Last sync:     {last['started_at']}")
        print(f"  Sync status:   {last['status']}")
        if last["new_files"] or last["updated_files"]:
            print(f"  Last changes:  {last['new_files']} new, {last['updated_files']} updated files")
        print()
    conn.close()


def cmd_schedule(args):
    """Print instructions for scheduling automatic syncs."""
    script_path = os.path.abspath(__file__)
    db_path = os.path.abspath(args.db)
    python_path = sys.executable
    work_dir = os.path.dirname(script_path)

    print("=" * 60)
    print("  AUTOMATIC SYNC SCHEDULING")
    print("=" * 60)

    print("\n--- Linux/Mac (cron) ---")
    print("Run: crontab -e")
    print("Add this line to check daily at 2 AM:\n")
    print(f'0 2 * * * cd {work_dir} && {python_path} {script_path} sync --db {db_path} >> sync.log 2>&1')

    print("\n--- Windows (Task Scheduler) ---")
    print("Run in PowerShell as Admin:\n")
    print(f'''$action = New-ScheduledTaskAction -Execute "{python_path}" `
    -Argument "{script_path} sync --db {db_path}" `
    -WorkingDirectory "{work_dir}"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "HospitalPricingSync" `
    -Action $action -Trigger $trigger `
    -Description "Sync hospital pricing data from hospitalpricingfiles.org"''')

    print("\n--- PowerBI Auto-Refresh ---")
    print("1. Open PowerBI Desktop")
    print("2. Get Data > Python script")
    print(f"3. Paste the contents of: {os.path.join(work_dir, 'powerbi_refresh.py')}")
    print("4. Select the tables you want (facilities, pricing, etc.)")
    print("5. Publish to PowerBI Service")
    print("6. Set up a Personal Gateway + scheduled refresh")
    print(f"   The gateway will run the sync + serve fresh data automatically")
    print()


def _print_stats(conn):
    stats = get_stats(conn)
    print("\n--- Database Stats ---")
    print(f"  Facilities:    {stats['facilities']:,}")
    print(f"  Files total:   {stats['files']:,}")
    print(f"  CSV files:     {stats['csv_files']:,}")
    print(f"  Downloaded:    {stats['downloaded']:,}")
    print(f"  Pricing rows:  {stats['pricing_rows']:,}")
    print(f"  Total CSV size: {stats['total_size_gb']:.1f} GB")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Scrape hospital pricing CSVs and load into SQLite"
    )
    parser.add_argument(
        "--db", default="hospital_pricing.db",
        help="SQLite database path (default: hospital_pricing.db)"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # scrape
    p_scrape = sub.add_parser("scrape", help="Scrape facility metadata")
    p_scrape.add_argument("--states", nargs="+", help="Limit to these states (e.g. TX CA NY)")

    # download
    p_dl = sub.add_parser("download", help="Download pending CSVs")
    p_dl.add_argument("--states", nargs="+", help="Limit to these states")
    p_dl.add_argument("--workers", type=int, default=4, help="Parallel download threads (default: 4)")

    # transform
    p_tf = sub.add_parser("transform", help="Load CSVs into SQLite pricing table")
    p_tf.add_argument("--states", nargs="+", help="Limit to these states")

    # sync
    p_sync = sub.add_parser("sync", help="Check for updates and sync new data")
    p_sync.add_argument("--states", nargs="+", help="Limit to these states")
    p_sync.add_argument("--workers", type=int, default=4, help="Parallel download threads")

    # all
    p_all = sub.add_parser("all", help="Run full pipeline (scrape + download + transform)")
    p_all.add_argument("--states", nargs="+", help="Limit to these states")
    p_all.add_argument("--workers", type=int, default=4, help="Parallel download threads")

    # stats
    sub.add_parser("stats", help="Show database statistics")

    # schedule
    sub.add_parser("schedule", help="Print scheduling instructions for auto-sync")

    args = parser.parse_args()

    commands = {
        "scrape": cmd_scrape,
        "download": cmd_download,
        "transform": cmd_transform,
        "sync": cmd_sync,
        "all": cmd_all,
        "stats": cmd_stats,
        "schedule": cmd_schedule,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
