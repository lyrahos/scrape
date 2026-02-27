# Hospital Price Transparency Intelligence Platform — Architecture

## System Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ELECTRON DESKTOP APP                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  IPC Bridge  ┌──────────────────────────────────┐ │
│  │  RENDERER    │◄────────────►│         MAIN PROCESS             │ │
│  │  (React)     │              │                                  │ │
│  │             │              │  ┌────────────────────────────┐  │ │
│  │  ┌─────────┐│              │  │     INGESTION LAYER        │  │ │
│  │  │ Search  ││              │  │  ┌──────────┐ ┌─────────┐ │  │ │
│  │  │ State   ││              │  │  │Discovery │ │Detector │ │  │ │
│  │  │ Update  ││              │  │  │(CMS Data)│ │(Crawler)│ │  │ │
│  │  │Analytics││              │  │  └──────────┘ └─────────┘ │  │ │
│  │  │ Query   ││              │  │  ┌──────────────────────┐ │  │ │
│  │  │Settings ││              │  │  │  Download Manager     │ │  │ │
│  │  └─────────┘│              │  │  │  (Queue+Retry+Rate)   │ │  │ │
│  │             │              │  │  └──────────────────────┘ │  │ │
│  │  Zustand    │              │  └────────────────────────────┘  │ │
│  │  Store      │              │                                  │ │
│  │             │              │  ┌────────────────────────────┐  │ │
│  └─────────────┘              │  │    PROCESSING LAYER        │  │ │
│                               │  │  ┌──────────┐ ┌─────────┐ │  │ │
│                               │  │  │Normalizer│ │Deduper  │ │  │ │
│                               │  │  │CSV/JSON/ │ │Composite│ │  │ │
│                               │  │  │XML/XLSX  │ │Key+Fuzzy│ │  │ │
│                               │  │  └──────────┘ └─────────┘ │  │ │
│                               │  └────────────────────────────┘  │ │
│                               │                                  │ │
│                               │  ┌────────────────────────────┐  │ │
│                               │  │      STORAGE LAYER         │  │ │
│                               │  │  SQLite (local) or Postgres│  │ │
│                               │  │  ┌──────┐ ┌────────────┐  │  │ │
│                               │  │  │CRUD  │ │ Analytics  │  │  │ │
│                               │  │  │Repos │ │ Queries    │  │  │ │
│                               │  │  └──────┘ └────────────┘  │  │ │
│                               │  └────────────────────────────┘  │ │
│                               │                                  │ │
│                               │  ┌────────────────────────────┐  │ │
│                               │  │    SERVICE LAYER           │  │ │
│                               │  │  ┌──────────┐ ┌─────────┐ │  │ │
│                               │  │  │ Update   │ │Scheduler│ │  │ │
│                               │  │  │ Engine   │ │(Cron)   │ │  │ │
│                               │  │  └──────────┘ └─────────┘ │  │ │
│                               │  └────────────────────────────┘  │ │
│                               │                                  │ │
│                               │  ┌────────────────────────────┐  │ │
│                               │  │   SEMANTIC QUERY LAYER     │  │ │
│                               │  │  NLP Parser → SQL Gen      │  │ │
│                               │  │  Keyword extraction         │  │ │
│                               │  │  Guardrailed queries        │  │ │
│                               │  └────────────────────────────┘  │ │
│                               └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema (ER Diagram)

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│  hospitals   │     │transparency_files │     │pricing_data_current  │
├──────────────┤     ├───────────────────┤     ├──────────────────────┤
│ hospital_id  │──┐  │ file_id           │──┐  │ record_id            │
│ name         │  │  │ hospital_id  (FK) │  │  │ hospital_id (FK)     │
│ address      │  │  │ file_url          │  │  │ billing_code         │
│ city         │  └──│ file_type         │  │  │ billing_code_type    │
│ state        │     │ file_hash         │  │  │ service_description  │
│ zip          │     │ file_size         │  └──│ payer                │
│ county       │     │ discovered_at     │     │ price_type           │
│ area_code    │     │ last_checked_at   │     │ price                │
│ latitude     │     │ is_active         │     │ file_id (FK)         │
│ longitude    │     │ status            │     │ row_hash             │
│ hospital_type│     └───────────────────┘     │ inserted_at          │
│ website_url  │                               └──────────────────────┘
└──────────────┘                                         │
       │                                                 │ (versioned)
       │         ┌──────────────────────┐                ▼
       │         │    update_log        │     ┌──────────────────────┐
       │         ├──────────────────────┤     │pricing_data_history  │
       └─────────│ hospital_id (FK)     │     ├──────────────────────┤
                 │ file_id (FK)         │     │ version_id           │
                 │ update_attempted_at  │     │ record_id            │
                 │ result               │     │ (same fields)        │
                 │ rows_added           │     │ superseded_at        │
                 │ rows_changed         │     │ is_current           │
                 │ rows_removed         │     │ (PARTITIONED yearly) │
                 │ error_message        │     └──────────────────────┘
                 └──────────────────────┘
```

## Folder Structure

```
hospital-price-transparency/
├── electron/                    # Electron main process entry
│   ├── main.ts                 # App lifecycle, window management
│   └── preload.ts              # Secure IPC bridge
├── src/
│   ├── main/                   # Backend (Node.js, runs in main process)
│   │   ├── ingestion/          # Data acquisition
│   │   │   ├── hospital-discovery.ts   # CMS dataset download
│   │   │   ├── file-detector.ts        # Website crawling for files
│   │   │   └── file-downloader.ts      # Queued async downloader
│   │   ├── processing/         # Data transformation
│   │   │   ├── normalizer.ts           # Multi-format parser
│   │   │   └── deduplicator.ts         # Composite key dedup + fuzzy
│   │   ├── storage/            # Data persistence
│   │   │   ├── database.ts             # SQLite adapter
│   │   │   └── repositories.ts         # CRUD + analytics queries
│   │   ├── services/           # Business logic
│   │   │   ├── update-engine.ts        # Change detection + diffing
│   │   │   └── scheduler.ts           # Background task runner
│   │   └── semantic/           # NLP query engine
│   │       └── query-engine.ts         # Text → SQL with guardrails
│   ├── renderer/               # Frontend (React, runs in renderer)
│   │   ├── App.tsx             # Root layout
│   │   ├── main.tsx            # Entry point
│   │   ├── store/              # Zustand state management
│   │   ├── components/         # UI components
│   │   │   ├── layout/         # Sidebar, UpdatePage
│   │   │   ├── search/         # Hospital search
│   │   │   ├── map/            # State browser
│   │   │   ├── analytics/      # Charts and insights
│   │   │   ├── query/          # Semantic query interface
│   │   │   ├── settings/       # Configuration
│   │   │   └── common/         # Card, Button, etc.
│   │   └── styles/             # Global CSS
│   └── shared/                 # Shared types and constants
│       ├── types.ts
│       └── constants.ts
├── database/
│   └── migrations/             # SQL schema files
├── scripts/                    # CLI utilities
├── config/                     # Default configuration
├── docs/                       # Architecture documentation
├── docker-compose.yml          # Optional PostgreSQL setup
├── Dockerfile
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Design Decisions

### 1. Dual Database Strategy
- **SQLite** for zero-config local usage (default)
- **PostgreSQL** for production scale with PostGIS, partitioning, and materialized views
- Single `DatabaseAdapter` interface abstracts both

### 2. Append-Only History
- `pricing_data_current` = fast snapshot for queries
- `pricing_data_history` = immutable log, partitioned by year
- Never overwrite history; mark old versions as superseded

### 3. Composite Deduplication Key
- `hospital_id + billing_code + payer + price_type + effective_date`
- Row-level SHA-256 hash for change detection
- Fuzzy matching on service descriptions via Fuse.js

### 4. Update Engine Flow
```
For each stale hospital:
  1. Check file URL → HEAD request
  2. Compare hash (ETag or content-length+last-modified)
  3. If changed → download → normalize → deduplicate → diff → upsert
  4. If same → mark checked
  5. If dead → crawl website → attempt rediscovery
  6. Log everything to update_log
```

### 5. Semantic Query Safety
- Input sanitization (alphanumeric only)
- Only SELECT queries permitted
- Parameterized conditions
- Result limited to 500 rows

## Scaling Strategy

| Dimension | Current (Local) | Production (Cloud) |
|-----------|-----------------|-------------------|
| Database | SQLite WAL | PostgreSQL + PostGIS |
| Partitioning | N/A | Yearly on pricing_data_history |
| Indexing | B-tree | B-tree + GiST (geo) + GIN (trigram) |
| Concurrency | 5 workers | 50+ workers with Redis queue |
| Caching | In-memory | Materialized views + Redis |
| File Storage | Local disk | S3 / GCS |

## Future Roadmap

1. **Cloud Sync** — Optional cloud backend for multi-device access
2. **API Layer** — REST/GraphQL API for external integrations
3. **PowerBI/Tableau Export** — Direct connector plugins
4. **OCR Pipeline** — PDF price list extraction via Tesseract
5. **ML Price Prediction** — Forecast future pricing trends
6. **Notification System** — Email/push alerts for significant price changes
7. **Multi-language NLP** — Support Spanish language queries
8. **Data Quality Scoring** — Confidence metrics per hospital
