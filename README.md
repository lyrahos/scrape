# Hospital Price Transparency Intelligence Platform

A production-grade desktop application for discovering, normalizing, and analyzing U.S. hospital pricing data under the CMS Price Transparency Rule.

## Features

- **Hospital Discovery** — Automatically downloads 6,000+ hospitals from CMS datasets
- **Transparency File Detection** — Crawls hospital websites to find machine-readable pricing files
- **Multi-Format Normalization** — Parses CSV, JSON, XML, XLS/XLSX with intelligent column mapping
- **Smart Deduplication** — Composite key dedup with fuzzy matching on service descriptions
- **Historical Versioning** — Append-only pricing history that never overwrites old data
- **Change Detection** — Tracks price changes over time with diff-based updates
- **Semantic Search** — Ask pricing questions in plain English
- **Analytics Dashboard** — Heat maps, trends, variability analysis, and historical comparisons
- **Apple-Quality UI** — Clean, minimal interface accessible to non-technical users

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package installer
npm run package
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design, database schema, and scaling strategy.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron |
| Frontend | React 18 + TypeScript |
| State | Zustand |
| Database | SQLite (local) / PostgreSQL (production) |
| Scraping | Axios + Cheerio + robots-parser |
| Processing | csv-parse + xlsx + fast-xml-parser |
| Packaging | electron-builder |

## Docker (Optional PostgreSQL)

```bash
docker-compose up -d
npm run db:migrate -- --postgres
```

## Database

The app uses SQLite by default for zero-configuration local storage. Switch to PostgreSQL in Settings for production workloads with PostGIS geospatial indexing and table partitioning.

## License

MIT
