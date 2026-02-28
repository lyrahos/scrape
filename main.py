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
    python main.py stats                 # Show database stats
    python main.py all                   # Run full pipeline
"""

import argparse
import sys

from tqdm import tqdm

from api_client import APIClient, STATES
from database import connect, create_schema, upsert_facility, upsert_file, get_stats
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

    with APIClient() as client:
        with tqdm(target, desc="States", unit="state") as pbar:
            for state in pbar:
                facilities = client.search_facilities(state)
                for fac in facilities:
                    upsert_facility(conn, fac)
                    for fi in fac.get("files", []):
                        upsert_file(conn, fac["id"], fi)
                        total_files += 1
                    total_facilities += 1
                conn.commit()
                pbar.set_postfix(facilities=total_facilities, files=total_files)

    print(f"Scraped {total_facilities} facilities with {total_files} files")
    _print_stats(conn)
    conn.close()


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
    conn.close()


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

    # all
    p_all = sub.add_parser("all", help="Run full pipeline (scrape + download + transform)")
    p_all.add_argument("--states", nargs="+", help="Limit to these states")
    p_all.add_argument("--workers", type=int, default=4, help="Parallel download threads")

    # stats
    sub.add_parser("stats", help="Show database statistics")

    args = parser.parse_args()

    commands = {
        "scrape": cmd_scrape,
        "download": cmd_download,
        "transform": cmd_transform,
        "all": cmd_all,
        "stats": cmd_stats,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
