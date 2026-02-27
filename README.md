# Hospital Price Transparency Intelligence Platform

A production-grade desktop application that discovers, downloads, normalizes, and analyzes hospital price transparency data across 6,000+ U.S. hospitals. Built as an Electron app with a React frontend, it turns the fragmented landscape of hospital pricing files into a searchable, analyzable, and comparable data product — accessible to non-technical users through a polished macOS-style UI.

This is not a simple scraper. It is a **scalable data intelligence platform** with multi-format ingestion, OCR fallback for scanned PDFs, fuzzy deduplication, append-only version history, natural language querying, a geographic heat map, trend analysis, a REST API for external tool integration, and cross-platform desktop packaging.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Key Capabilities](#key-capabilities)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Layer-by-Layer Deep Dive](#layer-by-layer-deep-dive)
  - [1. Ingestion Layer](#1-ingestion-layer)
  - [2. Processing Layer](#2-processing-layer)
  - [3. Storage Layer](#3-storage-layer)
  - [4. Service Layer](#4-service-layer)
  - [5. Semantic Query Layer](#5-semantic-query-layer)
  - [6. UI Layer](#6-ui-layer)
  - [7. Packaging & Distribution](#7-packaging--distribution)
- [Database Schema](#database-schema)
- [REST API](#rest-api)
- [Analytics & Visualizations](#analytics--visualizations)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Docker Support](#docker-support)
- [Scaling Strategy](#scaling-strategy)
- [Configuration](#configuration)
- [Future Roadmap](#future-roadmap)

---

## Why This Exists

Since January 2021, the U.S. CMS (Centers for Medicare & Medicaid Services) has required all hospitals to publicly disclose their pricing. The reality is messy:

- Hospitals publish files in **wildly different formats** — CSV, JSON, XML, Excel, PDF, and compressed archives
- Column names are non-standard (`charge`, `standard_charge`, `gross_charge`, `Gross Charges`, `charge_amount`...)
- Some hospitals embed pricing in **scanned PDF chargemasters** with no machine-readable text
- Files move, URLs break, formats change without notice
- There is no single source of truth — data is fragmented across 6,000+ hospital websites

This platform solves all of that. It discovers hospitals from CMS datasets and state registries, crawls their websites for transparency files, downloads and normalizes heterogeneous formats, deduplicates records, tracks changes over time, and presents everything through an intuitive desktop interface with powerful analytics.

---

## Key Capabilities

| Capability | Description |
|-----------|-------------|
| **Hospital Discovery** | Downloads the CMS Hospital General Information dataset + 5 state registries to build a comprehensive hospital database |
| **Intelligent File Detection** | Crawls hospital websites using common transparency URL paths, sitemap analysis, and page-level link extraction — all while respecting `robots.txt` |
| **Multi-Format Normalization** | Parses CSV (auto-delimiter), JSON (including CMS MRF format), XML, Excel (multi-sheet), PDF (text extraction + OCR fallback), and GZIP archives |
| **Smart Deduplication** | Composite key (hospital + billing code + payer + price type + date) with SHA-256 row hashing and Fuse.js fuzzy matching for description normalization |
| **Append-Only History** | Every price change is preserved. Current snapshot for fast queries + immutable history partitioned by year. Never overwrites data |
| **Change Detection** | HEAD request hash comparison (ETag/Last-Modified), full diff engine tracking added/changed/removed records per update cycle |
| **Dead Link Recovery** | Automatically detects broken file URLs and re-crawls hospital websites to find relocated files |
| **Natural Language Queries** | Type "average knee replacement cost in California" and get results — NLP parser extracts CPT codes, states, dates, and generates guardrailed SQL |
| **Geographic Heat Map** | Interactive US choropleth with filters for CPT/DRG code, payer, price type, and date range |
| **Trend Analysis** | Two modes: Min/Avg/Max area chart, and Regional Comparison (hospital vs area code vs state vs national averages) |
| **Variability Analysis** | Horizontal stacked bar chart showing price spread + standard deviation across hospitals for each procedure |
| **Historical Comparison** | Multi-line chart comparing local area pricing against state and national averages over time |
| **REST API** | 16+ endpoints for PowerBI, Tableau, and other external integrations |
| **OCR Fallback** | Tesseract-based text extraction for scanned PDF chargemasters |
| **Background Scheduler** | Automatic periodic updates with configurable intervals and price alert detection |
| **HTTP Audit Trail** | Every file URL check is logged with HTTP status, response time, ETag, and error details |
| **Desktop Packaging** | Electron-based app with single-click installer for macOS, Windows, and Linux |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ELECTRON DESKTOP APP                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  IPC Bridge  ┌──────────────────────────────────┐ │
│  │  RENDERER    │◄────────────►│         MAIN PROCESS             │ │
│  │  (React 18)  │              │                                  │ │
│  │              │              │  ┌────────────────────────────┐  │ │
│  │  ┌─────────┐ │              │  │     INGESTION LAYER        │  │ │
│  │  │ Search  │ │              │  │  CMS Discovery + 5 State   │  │ │
│  │  │ State   │ │              │  │  Registries + Web Crawler  │  │ │
│  │  │ Update  │ │              │  │  Download Queue + Retry    │  │ │
│  │  │Analytics│ │              │  └────────────────────────────┘  │ │
│  │  │ Query   │ │              │                                  │ │
│  │  │Settings │ │              │  ┌────────────────────────────┐  │ │
│  │  └─────────┘ │              │  │    PROCESSING LAYER        │  │ │
│  │              │              │  │  Normalizer (6 formats)    │  │ │
│  │  Zustand     │              │  │  OCR Fallback (Tesseract)  │  │ │
│  │  Store       │              │  │  Deduplicator + Fuzzy      │  │ │
│  └─────────────┘              │  └────────────────────────────┘  │ │
│                               │                                  │ │
│                               │  ┌────────────────────────────┐  │ │
│                               │  │      STORAGE LAYER         │  │ │
│                               │  │  SQLite (local) / Postgres │  │ │
│                               │  │  7 Repositories + History  │  │ │
│                               │  │  HTTP Status Audit Trail   │  │ │
│                               │  └────────────────────────────┘  │ │
│                               │                                  │ │
│                               │  ┌────────────────────────────┐  │ │
│                               │  │    SERVICE LAYER           │  │ │
│                               │  │  Update Engine + Scheduler │  │ │
│                               │  │  REST API Server (:3001)   │  │ │
│                               │  └────────────────────────────┘  │ │
│                               │                                  │ │
│                               │  ┌────────────────────────────┐  │ │
│                               │  │   SEMANTIC QUERY LAYER     │  │ │
│                               │  │  NLP → SQL with guardrails │  │ │
│                               │  └────────────────────────────┘  │ │
│                               └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

The application follows a strict **separation of concerns**:

- **Renderer process** (React): UI only — no data access, no file I/O
- **Main process** (Node.js): All backend logic — ingestion, processing, storage, services
- **IPC bridge** (`preload.ts`): Secure `contextBridge` API — the renderer can only call explicitly exposed methods
- **Shared types** (`types.ts` + `constants.ts`): Type-safe contracts between processes, including all IPC channel definitions

---

## Tech Stack

### Core

| Component | Technology |
|----------|-----------|
| Desktop Framework | Electron 31 |
| Frontend | React 18, TypeScript 5.5, Vite 5 |
| State Management | Zustand 4 |
| Local Database | better-sqlite3 (WAL mode) |
| Production Database | PostgreSQL 16 + PostGIS + pg_trgm |
| HTTP Client | Axios |
| Web Scraping | Cheerio, robots-parser |

### Data Processing

| Component | Technology |
|----------|-----------|
| CSV | csv-parse (auto-delimiter detection) |
| JSON | Native `JSON.parse` + CMS MRF flattener |
| XML | fast-xml-parser |
| Excel | SheetJS (xlsx), multi-sheet |
| PDF | pdf-parse + Tesseract OCR fallback |
| Compression | Node.js zlib (GZIP) |
| Fuzzy Matching | Fuse.js |
| Hashing | Node.js crypto (SHA-256, MD5) |

### Visualization

| Component | Technology |
|----------|-----------|
| Charts | Recharts (Area, Line, Bar) |
| Geographic Map | react-simple-maps + d3-scale |
| Animations | Framer Motion |
| Icons | Lucide React |

### Packaging & DevOps

| Component | Technology |
|----------|-----------|
| Packaging | electron-builder (DMG, NSIS, AppImage, DEB) |
| Auto Updates | electron-updater (GitHub releases) |
| Containerization | Docker + docker-compose (PostGIS) |
| Testing | Vitest + Playwright |
| Linting | ESLint 9 |

---

## Getting Started

### Prerequisites

- **Node.js** 20+ and npm
- **Tesseract OCR** (optional, for scanned PDF support):
  - macOS: `brew install tesseract`
  - Linux: `apt install tesseract-ocr`
- **Poppler** (optional, for PDF-to-image conversion for OCR):
  - macOS: `brew install poppler`
  - Linux: `apt install poppler-utils`

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd hospital-price-transparency

# Install dependencies
npm install

# Initialize the database with sample data
npm run db:migrate
npm run db:seed
```

### Development

```bash
# Start both the Vite dev server and Electron in parallel
npm run dev

# Or start them separately:
npm run dev:renderer    # Vite dev server on :3000
npm run dev:electron    # Electron main process
```

### Build & Package

```bash
# Build for production
npm run build

# Package for your platform
npm run package          # Auto-detect platform
npm run package:mac      # macOS (DMG + ZIP)
npm run package:win      # Windows (NSIS installer + ZIP)
npm run package:linux    # Linux (AppImage + DEB)
```

### Testing

```bash
npm test                 # Run unit tests
npm run test:watch       # Watch mode
npm run test:e2e         # Playwright end-to-end tests
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint
```

---

## Project Structure

```
hospital-price-transparency/
├── electron/                          # Electron entry points
│   ├── main.ts                        # App lifecycle, window, IPC handler registration
│   └── preload.ts                     # contextBridge API + TypeScript declarations
├── src/
│   ├── main/                          # Backend (runs in Electron main process)
│   │   ├── ingestion/                 # Data acquisition
│   │   │   ├── hospital-discovery.ts  # CMS dataset download + CSV parsing
│   │   │   ├── state-registries.ts    # 5 state-specific data sources (CA, NY, TX, FL, PA)
│   │   │   ├── file-detector.ts       # Website crawling for transparency files
│   │   │   └── file-downloader.ts     # Async queue with retry + rate limiting
│   │   ├── processing/                # Data transformation
│   │   │   ├── normalizer.ts          # Multi-format parser (CSV/JSON/XML/Excel/PDF/GZIP)
│   │   │   ├── deduplicator.ts        # Composite key dedup + fuzzy description matching
│   │   │   └── ocr-fallback.ts        # Tesseract OCR for scanned PDFs
│   │   ├── storage/                   # Data persistence
│   │   │   ├── database.ts            # SQLite adapter (WAL mode) + UUID generation
│   │   │   └── repositories.ts        # 7 repository modules with typed queries
│   │   ├── services/                  # Business logic
│   │   │   ├── update-engine.ts       # Change detection, diffing, dead link recovery
│   │   │   ├── scheduler.ts           # Background interval runner + price alerts
│   │   │   └── api-server.ts          # REST API (16+ endpoints, CORS enabled)
│   │   ├── semantic/                  # Natural language query engine
│   │   │   └── query-engine.ts        # NLP parser -> SQL generator -> result formatter
│   │   └── utils/
│   │       └── errors.ts              # Typed error classes + retry with backoff
│   ├── renderer/                      # Frontend (runs in Electron renderer)
│   │   ├── App.tsx                    # Root layout with sidebar navigation
│   │   ├── main.tsx                   # React entry point
│   │   ├── store/
│   │   │   └── appStore.ts            # Zustand global state
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx        # Navigation with stats footer
│   │   │   │   └── UpdatePage.tsx     # Discovery + update controls with progress
│   │   │   ├── search/
│   │   │   │   └── SearchPage.tsx     # Hospital search with pricing detail table
│   │   │   ├── map/
│   │   │   │   └── StatePage.tsx      # State browser with hospital grid
│   │   │   ├── analytics/
│   │   │   │   ├── AnalyticsPage.tsx  # 4-tab view (heat map, trends, variability, comparison)
│   │   │   │   └── USMap.tsx          # Interactive choropleth component
│   │   │   ├── query/
│   │   │   │   └── QueryPage.tsx      # Natural language query interface
│   │   │   ├── settings/
│   │   │   │   └── SettingsPage.tsx   # Database, scraping, and update config
│   │   │   └── common/               # Reusable UI primitives
│   │   │       ├── Card.tsx           # Shadow container with hover
│   │   │       ├── Button.tsx         # Primary/secondary/ghost with loading state
│   │   │       ├── Notifications.tsx  # Toast system with auto-dismiss
│   │   │       └── SearchInput.tsx    # Input with focus ring
│   │   ├── hooks/
│   │   │   └── useElectronAPI.ts      # useSearch, useAsyncData, useDebounce, useIPCListener
│   │   ├── utils/
│   │   │   └── formatters.ts          # Price, date, count, percentage formatting
│   │   └── styles/
│   │       └── global.css             # CSS custom properties design system
│   └── shared/                        # Shared between main + renderer
│       ├── types.ts                   # All interfaces + IPC channel constants
│       └── constants.ts               # US states, CPT codes, CMS URLs, billing patterns
├── database/
│   └── migrations/
│       ├── 001_initial_schema.sql         # PostgreSQL (PostGIS, partitioning, materialized views)
│       ├── 001_initial_schema_sqlite.sql  # SQLite equivalent
│       └── 002_http_status_history.sql    # HTTP check audit trail
├── test/
│   └── unit/
│       ├── deduplicator.test.ts       # Composite key, hashing, fuzzy matching, diffing
│       ├── normalizer.test.ts         # CSV/JSON parsing, price extraction, code detection
│       └── query-engine.test.ts       # NLP parsing, SQL generation, injection prevention
├── scripts/
│   ├── migrate.js                     # Database migration runner (SQLite + PostgreSQL)
│   └── seed.js                        # 10 hospitals, 12 procedures, ~2,880 records
├── docs/
│   ├── ARCHITECTURE.md                # System diagrams, ER diagram, design decisions
│   └── ERROR_HANDLING.md              # Error categories, recovery strategies, user messages
├── docker-compose.yml                 # PostGIS 16 + app service
├── Dockerfile                         # Multi-stage Node.js build
├── package.json                       # Dependencies + electron-builder config
├── tsconfig.json                      # Renderer TypeScript config
├── tsconfig.electron.json             # Main process TypeScript config
├── vite.config.ts                     # Vite bundler + React plugin
└── vitest.config.ts                   # Test config with v8 coverage
```

---

## Layer-by-Layer Deep Dive

### 1. Ingestion Layer

The ingestion layer discovers hospitals and locates their pricing files.

#### Hospital Discovery (`hospital-discovery.ts`)

Downloads the CMS Hospital General Information CSV dataset (~6,000 hospitals), parses it with `csv-parse`, extracts area codes from phone numbers, and batch-upserts into the database.

```
CMS CSV (data.cms.gov) -> Parse -> Extract Area Codes -> Batch Upsert (500/batch) -> Database
```

#### State Registries (`state-registries.ts`)

Supplements CMS data with 5 state-specific registries (California, New York, Texas, Florida, Pennsylvania). Each registry has its own CSV URL and field name mappings with fuzzy field matching to handle non-standard column names. Runs best-effort — failures don't block the main discovery flow.

#### File Detection (`file-detector.ts`)

Three strategies to find transparency files on hospital websites:

1. **Common paths** — Checks ~20 known URL patterns like `/chargemaster.csv`, `/price-transparency/charges.json`
2. **Page crawling** — Downloads the hospital's homepage, parses with Cheerio, extracts links matching transparency file patterns (`.csv`, `.json`, `.xml`, `.xlsx`, `.pdf` with transparency keywords)
3. **Sitemap search** — Fetches `/sitemap.xml`, searches for transparency-related URLs

All crawling respects `robots.txt` via the `robots-parser` library.

#### File Downloader (`file-downloader.ts`)

`DownloadManager` class with:

- **Concurrency control** — Configurable max parallel downloads (default: 3)
- **Rate limiting** — Configurable delay between requests (default: 1s)
- **HEAD pre-check** — Validates URL, checks Content-Length before downloading
- **SHA-256 hashing** — Computes file hash during download for change detection
- **Exponential backoff** — Retries failed downloads up to 3 times with increasing delays
- **robots.txt compliance** — Checks before every request

### 2. Processing Layer

#### Normalizer (`normalizer.ts` — 600+ lines)

The central parser that handles 6 file formats and extracts structured pricing records:

| Format | Parser | Notable Features |
|--------|--------|-----------------|
| **CSV** | csv-parse | Auto-delimiter detection (comma, tab, pipe, semicolon), relaxed quoting, BOM handling |
| **JSON** | Native | CMS Machine-Readable File (MRF) format flattening: `standard_charge_information` with nested `billing_code_information` and `standard_charges` arrays flattened into rows |
| **XML** | fast-xml-parser | Recursive flattening of arbitrarily nested structures into leaf-node rows |
| **Excel** | SheetJS | Multi-sheet extraction — each sheet parsed independently, records merged |
| **PDF** | pdf-parse + OCR | Sync text extraction from PDF operators (BT/ET/Tj); async version with Tesseract OCR fallback for scanned documents |
| **GZIP** | Node.js zlib | Decompresses, detects inner format from filename extension or content heuristics, delegates to appropriate parser |

**Column mapping** uses 60+ aliases per field. For example, `billing_code` matches: `code`, `cpt`, `cpt_code`, `hcpcs`, `procedure_code`, `proc_code`, `drg`, `charge_code`, `item_code`, `revenue_code`, and more.

**Price parsing** handles: `$1,234.56`, `1234.56`, `$1234`, comma-separated thousands, `N/A`, `-`, and empty strings.

**Billing code detection** uses regex patterns to classify codes as CPT (`^\d{5}$`), HCPCS (`^[A-V]\d{4}$`), DRG (`^\d{3}$`), ICD-10 (`^[A-Z]\d{2}`), NDC (`^\d{11}$`), or OTHER.

#### OCR Fallback (`ocr-fallback.ts`)

For hospitals that publish scanned PDF chargemasters (images, not text):

1. Checks if Tesseract is installed on the system
2. Converts PDF pages to 300 DPI PNG images using `pdftoppm` (from poppler-utils)
3. Runs Tesseract OCR on each page with `--psm 6` (assume uniform block of text)
4. Parses OCR output with 3 pattern matchers optimized for chargemaster layouts:
   - `CODE DESCRIPTION $PRICE`
   - `CODE DESCRIPTION $GROSS $CASH` (multi-price)
   - Flexible whitespace-separated fields
5. Falls back gracefully with informative error messages if dependencies aren't installed

The OCR fallback is **automatically triggered** by `normalizePDFAsync()` when standard text extraction yields no content or no parseable records.

#### Deduplicator (`deduplicator.ts`)

Ensures data quality through:

- **Composite key** — `hospital_id + billing_code + payer + price_type + effective_date`
- **SHA-256 row hashing** — Detects whether a record has actually changed between update cycles
- **Completeness scoring** — When duplicates exist, keeps the most complete record (more non-null fields wins)
- **Fuzzy description grouping** — Uses Fuse.js (threshold 0.3) to merge records with similar service descriptions (e.g., "Total Knee Replacement" and "TOTAL KNEE ARTHROPLASTY")
- **Description normalization** — Standardizes service names using the most common description per billing code
- **Diff engine** — Compares old vs new record sets to produce added/changed/removed/unchanged counts for audit logging

### 3. Storage Layer

#### Database Adapter (`database.ts`)

Abstracts database access behind a `DatabaseAdapter` interface:

```typescript
interface DatabaseAdapter {
  run(sql: string, params?: unknown[]): void;
  get<T>(sql: string, params?: unknown[]): T | undefined;
  all<T>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  close(): void;
  transaction<T>(fn: () => T): T;
}
```

**SQLiteAdapter** implementation:
- WAL mode for concurrent reads during writes
- Foreign keys enforced
- 5-second busy timeout
- UUID v4 generation via Node.js `crypto.randomBytes`
- Schema initialized from migration files with inline fallback for packaged apps

The singleton `getDatabase()` returns the active adapter.

#### Repositories (`repositories.ts`)

Seven repository modules with typed queries:

| Repository | Key Methods |
|-----------|------------|
| **HospitalRepo** | `upsert`, `upsertBatch` (transaction-wrapped), `search` (LIKE on name/city/zip/state), `listByState`, `getStaleHospitals` (LEFT JOIN with update_log), `getStats` |
| **FileRepo** | `upsert` (ON CONFLICT DO UPDATE), `updateStatus`, `updateHash`, `getByHospital` |
| **PricingRepo** | `upsertCurrent` (with automatic history archival), `getByHospital`, `searchByCode` (JOIN hospitals for location) |
| **UpdateLogRepo** | `insert`, `getRecent` |
| **HttpStatusRepo** | `insert`, `getByFile`, `getRecent` — audit trail for every HTTP check |
| **AnalyticsRepo** | `getStateAverages` (payer/date filtering, switches to history table for date ranges), `getTrends`, `getTrendsComparison` (hospital vs area vs state vs national), `getVariability` (with `std_dev` via SQLite-compatible formula), `getComparison`, `getDashboardStats` |

**Upsert with history archival**: When `PricingRepo.upsertCurrent()` detects a changed record (via composite key conflict), it automatically:
1. Archives the old value to `pricing_data_history` (marked `is_current = 0`)
2. Updates the current record with the new value
3. Returns counts of added vs changed records

### 4. Service Layer

#### Update Engine (`update-engine.ts`)

Orchestrates the entire update lifecycle for each hospital:

```
For each stale hospital:
  1. HEAD request to check file URL -> Log to http_status_history
  2. Compare hash (ETag or Content-Length + Last-Modified)
  3. If changed -> Download -> Normalize -> Deduplicate -> Diff -> Upsert
  4. If unchanged -> Mark as checked, skip
  5. If dead URL -> Mark as stale -> Re-crawl website -> Attempt rediscovery
  6. Log everything to update_log with duration, row counts, errors
```

Reports progress to the UI via IPC callbacks during each phase (checking, downloading, processing, complete, error).

#### Scheduler (`scheduler.ts`)

Background interval-based task runner:

- Configurable update interval (default: 24 hours)
- Configurable staleness threshold (default: 30 days since last update)
- **Price alert detection** — flags when any procedure's price spread exceeds 100%
- Sends alerts and progress updates to the renderer via `BrowserWindow.webContents`
- Graceful start/stop lifecycle tied to Electron app events

#### REST API Server (`api-server.ts`)

Optional HTTP server (port 3001) for external integrations. Built on Node.js `http` module with CORS enabled for all origins.

**16 endpoints** organized by domain — see [REST API](#rest-api) section below.

### 5. Semantic Query Layer

#### Query Engine (`query-engine.ts`)

Translates natural language into SQL queries:

**Input**: `"average knee replacement cost in California"`

**Pipeline**:
1. **CPT extraction** — Detects direct CPT codes (`27447`) or maps procedure keywords from a dictionary of 20+ common procedures (`knee replacement` -> `27447`, `mri` -> `70553`, `colonoscopy` -> `45380`, etc.)
2. **State extraction** — Matches full state names ("California") and abbreviations ("CA")
3. **Area code / ZIP extraction** — Detects 3-digit area codes and 5-digit ZIP codes
4. **Date range detection** — Parses `since 2024`, `last 6 months`, `2023 to 2025`, year ranges
5. **SQL generation** — Builds parameterized SELECT with sanitized inputs; switches to `pricing_data_history` when date ranges are specified
6. **Execution** — Runs the generated query with a 500-row limit
7. **Chart data generation** — Produces appropriate chart type (line for temporal, bar for hospital comparison)
8. **Summary builder** — Creates a human-readable result summary

**Safety guardrails**:
- Input sanitized to alphanumeric characters only
- Only SELECT queries permitted (no INSERT, UPDATE, DELETE, DROP)
- All conditions parameterized (no string concatenation into SQL)
- Results limited to 500 rows

### 6. UI Layer

Six pages with a persistent sidebar navigation, built with React 18 + Zustand for state management.

#### Search Page
- Debounced type-ahead hospital search
- Results list showing name, city, state, ZIP, hospital type
- Detail panel with hospital metadata and full pricing table
- "Scrape" button to trigger file discovery + download + processing for a specific hospital

#### State Browser
- Scrollable list of all 50 US states + territories
- Hospital grid for the selected state
- Quick navigation to hospital details

#### Update Page
- **Discover** button — triggers CMS + state registry ingestion with real-time progress bar
- **Run Update** button — executes full update cycle across all stale hospitals
- Phase-by-phase progress indicators (checking, downloading, processing, complete)
- Update log display with results and error messages

#### Analytics Page (4 tabs)

**Heat Map**
- Interactive US choropleth with color gradient based on average price
- Filters: Code Type (CPT/DRG), procedure code dropdown (19 CPT / 10 DRG codes), Price Type (Gross Charge, Cash, Min/Max Negotiated, Payer-Specific), Payer (8 major insurers), Date Range (Start/End)
- Color-coded state tiles below the map sorted by price

**Trends** (Two modes)
- *Min/Avg/Max*: Recharts AreaChart with gradient fill showing the price band over time, filterable by CPT code, state, and area code
- *Regional Comparison*: Multi-line LineChart comparing Hospital, Area Code, State, and National averages over time — with a data table below

**Variability**
- Horizontal stacked BarChart showing min/avg/max ranges for the most variable procedures
- Detail cards with billing code, description, hospital count, and **standard deviation**

**Comparison**
- Historical multi-line LineChart: Local (your area) vs State Average vs National Average
- Data table with period-by-period percentage difference vs national
- Filters: CPT code, area code, date range

#### Query Page
- Natural language input box
- 6 example query chips for quick starts
- Results displayed as: summary card, bar/line chart (auto-selected), and data table
- CSV export button for downloading results

#### Settings Page
- Database configuration: SQLite toggle, PostgreSQL connection string
- Scraping settings: Max concurrent downloads, delay between requests, timeout
- Auto-update toggle with interval configuration
- About section with version info

### 7. Packaging & Distribution

Configured via `electron-builder` in `package.json`:

| Platform | Format | Notes |
|----------|--------|-------|
| **macOS** | DMG + ZIP | `hiddenInset` titlebar for native feel, Healthcare & Fitness category |
| **Windows** | NSIS one-click installer + ZIP | Silent install mode |
| **Linux** | AppImage + DEB | Office category |

Auto-updates via `electron-updater` with GitHub releases as the publish provider.

---

## Database Schema

### Entity Relationship

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
                          │
       ┌──────────────────────────┐
       │  http_status_history     │
       ├──────────────────────────┤
       │ check_id                 │
       │ file_id (FK)             │
       │ hospital_id (FK)         │
       │ checked_at               │
       │ http_status              │
       │ response_time_ms         │
       │ content_length           │
       │ etag                     │
       │ last_modified            │
       │ error_message            │
       └──────────────────────────┘
```

### Tables

| Table | Purpose | Key Features |
|-------|---------|-------------|
| `hospitals` | Hospital master data (6,000+) | Indexes on state, zip, area_code, name (trigram for fuzzy), geom (GiST for PostGIS) |
| `transparency_files` | Discovered file URLs and status | UNIQUE(hospital_id, file_url), status enum tracking |
| `pricing_data_current` | Latest price snapshot for fast queries | UNIQUE composite dedup index on (hospital_id, billing_code, payer, price_type, effective_date) |
| `pricing_data_history` | Immutable append-only history | **Partitioned by year** (2024-2027), `is_current` flag, `superseded_at` timestamp |
| `update_log` | Audit trail for every update attempt | Tracks result, row counts, duration, errors |
| `http_status_history` | Audit trail for every HTTP file check | Records HTTP status, response time, ETag, content-length |

### PostgreSQL-Specific Features

- **PostGIS** — `geom` column with GiST index for geographic queries; auto-populated via trigger from lat/lng
- **pg_trgm** — GIN index on hospital names for fuzzy search
- **Table partitioning** — `pricing_data_history` partitioned by year for query performance
- **Materialized views** — `mv_state_pricing_summary` and `mv_monthly_trends` with concurrent refresh function
- **Check constraints** — Enforced enums for file_type, status, billing_code_type, price_type

### Deduplication Key

```sql
UNIQUE(hospital_id, billing_code, payer, price_type, COALESCE(effective_date, '1900-01-01'))
```

This ensures exactly one current price per hospital + procedure + payer + price type combination, while the history table preserves every historical value.

---

## REST API

The REST API starts automatically on port 3001 when the Electron app launches. It is **read-only** (GET endpoints only) and designed for integration with business intelligence tools.

### Endpoints

| Category | Endpoint | Description |
|----------|---------|-------------|
| Hospitals | `GET /api/hospitals/search?q=&limit=50` | Full-text search |
| | `GET /api/hospitals/stats` | Database-wide statistics |
| | `GET /api/hospitals/state/:ST` | List by state |
| | `GET /api/hospitals/:id` | Single hospital detail |
| Pricing | `GET /api/pricing/search?billing_code=&state=` | Search by billing code |
| | `GET /api/pricing/hospital/:id?limit=100` | All prices for a hospital |
| Analytics | `GET /api/analytics/state-averages?billing_code=&price_type=&payer=` | State-level averages for heat map |
| | `GET /api/analytics/trends?billing_code=&state=&area_code=` | Monthly trends |
| | `GET /api/analytics/variability?limit=` | Most variable procedures |
| | `GET /api/analytics/comparison?billing_code=&area_code=&start_date=&end_date=` | Local vs state vs national |
| | `GET /api/analytics/dashboard` | Dashboard summary stats |
| Semantic | `GET /api/query?q=` | Natural language query |
| Updates | `GET /api/updates/log?limit=100` | Recent update history |
| Export | `GET /api/export/pricing?billing_code=&state=` | Flat JSON for PowerBI/Tableau |
| | `GET /api/export/hospitals?state=` | Hospital export |
| System | `GET /api/health` | Health check |
| | `GET /api/` | Self-documenting endpoint list |

### PowerBI / Tableau Integration

The `/api/export/*` endpoints return **flat JSON arrays** without wrapper objects — ideal for direct import:

```bash
# Get all knee replacement prices in California
curl http://localhost:3001/api/export/pricing?billing_code=27447&state=CA

# Get all hospitals in New York
curl http://localhost:3001/api/export/hospitals?state=NY
```

### Natural Language via API

```bash
curl "http://localhost:3001/api/query?q=average%20MRI%20cost%20in%20Texas"
```

---

## Analytics & Visualizations

### US Heat Map

Built with `react-simple-maps` and `d3-scale`:

- Renders all 50 states + DC from TopoJSON data
- Linear color scale from light blue (#E0EDFF) to deep blue (#003399) based on average price
- Hover tooltips showing state name, average price, and hospital count
- Complete FIPS-to-state code mapping for accurate data binding
- Legend with min/max price labels

### Charts (Recharts)

- **AreaChart** — Trends view with gradient fill (`linearGradient`) and min/avg/max bands
- **LineChart** — Regional comparison (4 lines: hospital/area/state/national in distinct colors + dash patterns) and historical comparison view
- **BarChart** — Horizontal stacked bars for variability analysis (green=min, blue=avg range, red=max range)
- All charts wrapped in `ResponsiveContainer` for fluid resizing
- Consistent tooltip styling with rounded corners and soft shadows

---

## Error Handling

The platform uses a structured error handling system with typed error classes (`src/main/utils/errors.ts`):

### Error Hierarchy

```typescript
AppError (base)          // code: ErrorCode, context: Record<string, unknown>
├── NetworkError         // httpStatus: number
├── ParseError           // fileType: string, rowNumber: number
└── DatabaseError        // operation: string
```

### Recovery Strategies

| Error Type | Recovery | User Message |
|-----------|----------|-------------|
| `NETWORK_ERROR` | Retry with exponential backoff (2s, 4s, 8s) + jitter | "Couldn't reach the hospital's website. Will retry automatically." |
| `PARSE_ERROR` | Skip corrupted rows, continue processing | "The pricing file had some formatting issues. We extracted what we could." |
| `DB_ERROR` | Transaction rollback, notify user | "A database error occurred. Please restart the application." |
| `FILE_NOT_FOUND` | Mark stale, re-crawl hospital website | "This hospital's pricing file has moved. We'll try to find the new location." |
| `RATE_LIMITED` | Pause download queue, increase delay | "Slowing down to respect the hospital's servers." |
| `TIMEOUT` | Retry with longer timeout | "The connection timed out. Retrying..." |
| `ROBOTS_BLOCKED` | Respect robots.txt, skip site | N/A (silent skip) |

### Audit Trail

Every error is logged to the `update_log` table with:
- Hospital context (which hospital was being processed)
- Operation phase (checking, downloading, processing)
- Error message and duration at time of failure
- File hash state before/after

See `docs/ERROR_HANDLING.md` for the complete error handling design document.

---

## Testing

### Unit Tests

| Test File | Coverage |
|----------|---------|
| `deduplicator.test.ts` | Composite key generation (null payer, effective dates), SHA-256 hash consistency, deduplication (keeps most complete record), diff engine (added/removed/changed/unchanged), fuzzy description grouping |
| `normalizer.test.ts` | CSV/JSON format parsing, `parsePrice()` edge cases ($, plain, null, N/A, dashes, commas), `detectBillingCodeType()` (CPT/HCPCS/DRG/ICD-10/OTHER), `detectDelimiter()` (comma/tab/pipe) |
| `query-engine.test.ts` | CPT extraction from text, keyword mapping (12+ procedures), state extraction, date range parsing, SQL generation (history vs current table), SQL injection prevention |

### Seed Data

The seed script (`scripts/seed.js`) creates realistic test data:

- **10 hospitals** — Johns Hopkins, Mayo Clinic, Cleveland Clinic, Mass General, UCLA, NYU Langone, UCSF, Penn Medicine, Cedars-Sinai, Mount Sinai
- **12 procedures** — Knee/hip replacement ($30K/$28K base), deliveries ($8K/$14K), ER visits ($2.5K), colonoscopy ($3.5K), brain MRI ($2.8K), chest X-ray ($350), echo ($1.8K), CBC ($35), metabolic panel ($45)
- **6 payers** — null (uninsured), Aetna, BlueCross BlueShield, Cigna, UnitedHealthcare, Humana
- **4 price types** — Gross charge, discounted cash (0.6x), min negotiated (0.4x), max negotiated (0.85x)
- **~2,880 pricing records** with realistic variation (0.6x-1.4x per hospital)
- Records inserted into both `pricing_data_current` and `pricing_data_history`

---

## Docker Support

For production deployments with PostgreSQL:

```bash
# Start PostGIS + app services
docker-compose up -d

# The database is automatically initialized from migration 001
# The REST API server is available at http://localhost:3001
```

### Docker Architecture

- **PostGIS 16** (Alpine) with health checks (pg_isready every 10s)
- **Multi-stage build** — Build stage compiles TypeScript + bundles Vite; runtime stage copies only production artifacts
- **Auto-migration** — Runs `scripts/migrate.js --postgres` on startup
- **Volume persistence** — PostgreSQL data persists across container restarts via `pgdata` volume

---

## Scaling Strategy

| Dimension | Local (Default) | Production (Cloud) |
|-----------|----------------|-------------------|
| Database | SQLite WAL mode | PostgreSQL 16 + PostGIS |
| Partitioning | N/A | Yearly on `pricing_data_history` |
| Indexing | B-tree | B-tree + GiST (geographic) + GIN (trigram) |
| Search | LIKE queries | pg_trgm fuzzy + full-text search |
| Concurrency | 3-5 download workers | 50+ workers with Redis queue |
| Caching | In-memory | Materialized views (concurrent refresh) + Redis |
| File Storage | Local disk | S3 / GCS |
| Analytics | Direct queries | Materialized views + pre-aggregation |

---

## Configuration

### In-App Settings

- **Database**: Toggle between SQLite and PostgreSQL, configure connection parameters
- **Scraping**: Max concurrent downloads, delay between requests, request timeout
- **Auto-update**: Enable/disable automatic periodic hospital updates
- **Update interval**: How frequently to re-check hospitals (default: 24 hours)

### Environment Variables (Docker / Production)

| Variable | Default | Description |
|---------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `hospital_transparency` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `NODE_ENV` | `development` | Environment mode |

---

## Future Roadmap

1. **Cloud Sync** — Optional cloud backend for multi-device access and team collaboration
2. **ML Price Prediction** — Forecast future pricing trends using historical data
3. **Email/Push Notifications** — Alerts for significant price changes beyond in-app toasts
4. **Multi-language NLP** — Support Spanish language natural language queries
5. **Data Quality Scoring** — Confidence metrics per hospital based on file freshness, format quality, and completeness
6. **GraphQL API** — Alternative to REST for more flexible external queries
7. **Browser Extension** — Quick price lookup while browsing hospital websites
8. **FHIR Integration** — Connect to healthcare interoperability standards
