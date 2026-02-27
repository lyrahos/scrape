# Error Handling Design

## Error Categories

| Category | Code | Recoverable | Strategy |
|----------|------|-------------|----------|
| Network failures | `NETWORK_ERROR` | Yes | Retry with exponential backoff (2s, 4s, 8s) |
| File parse failures | `PARSE_ERROR` | Yes | Skip corrupted rows, log per-row errors |
| Database errors | `DB_ERROR` | No | Transaction rollback, notify user |
| File not found | `FILE_NOT_FOUND` | Yes | Attempt rediscovery via website crawl |
| File too large | `FILE_TOO_LARGE` | No | Skip file, log warning |
| Unsupported format | `UNSUPPORTED_FORMAT` | Partial | Fall back to text extraction |
| Rate limiting | `RATE_LIMITED` | Yes | Pause queue, increase delay |
| Robots.txt blocked | `ROBOTS_BLOCKED` | No | Respect robots.txt, skip site |
| Invalid data | `INVALID_DATA` | Yes | Skip row, continue processing |
| Timeout | `TIMEOUT` | Yes | Retry with longer timeout |

## Error Flow

```
User Action → Service Layer → Error Caught
                                   │
                          ┌────────┼────────┐
                          ▼        ▼        ▼
                      Recoverable  Log   Non-recoverable
                          │        │        │
                     Retry/Skip   DB     Notify User
                          │      Log       │
                          ▼                ▼
                      Continue        Show Error Toast
```

## Per-Layer Error Handling

### Ingestion Layer
- **Network errors**: Retry up to 3 times with exponential backoff
- **Invalid URLs**: Validate before request, skip invalid
- **robots.txt denial**: Log and skip respectfully
- **Oversized files**: Check Content-Length header before download

### Processing Layer
- **CSV parse errors**: Try alternative delimiters, relax quoting rules
- **JSON parse errors**: Try streaming parser, detect encoding
- **Excel errors**: Try each sheet independently
- **PDF errors**: Fall back to basic text extraction, flag for OCR
- **Row-level errors**: Wrap each row in try/catch, continue on failure
- **Column mapping failures**: Use fuzzy matching, log unmapped columns

### Storage Layer
- **Unique constraint violations**: Upsert (INSERT ON CONFLICT)
- **Foreign key violations**: Ensure parent records exist first
- **Transaction failures**: Automatic rollback via transaction wrapper
- **Disk space**: Check available space before large batch inserts

### Update Engine
- **Dead file URLs**: Mark as stale, attempt rediscovery
- **Hash comparison failures**: Force re-download
- **Diff errors**: Skip hospital, log for manual review

### Semantic Query Layer
- **Unrecognized queries**: Return helpful suggestions
- **SQL injection attempts**: Sanitize all inputs, only allow SELECT
- **Empty results**: Return explanatory message with suggestions
- **Query timeout**: Limit to 500 rows, use indexed queries

## Error Logging

All errors are persisted in the `update_log` table:

```sql
INSERT INTO update_log (hospital_id, result, error_message, duration_ms)
VALUES (?, 'error', ?, ?);
```

Errors include:
- Hospital context (which hospital was being processed)
- Operation context (which step failed)
- Error message and stack trace
- Duration at time of failure
- File hash state before/after

## User-Facing Error Messages

Errors are translated to non-technical messages:

| Internal | User Message |
|----------|-------------|
| `NETWORK_ERROR` | "Couldn't reach the hospital's website. Will retry automatically." |
| `PARSE_ERROR` | "The pricing file had some formatting issues. We extracted what we could." |
| `FILE_NOT_FOUND` | "This hospital's pricing file has moved. We'll try to find the new location." |
| `RATE_LIMITED` | "Slowing down to respect the hospital's servers. This may take a moment." |
| `DB_ERROR` | "A database error occurred. Please restart the application." |

## Recovery Strategies

1. **Automatic retry**: Network errors, timeouts → retry with backoff
2. **Graceful degradation**: Parse errors → extract partial data, log skips
3. **Rediscovery**: Dead URLs → re-crawl hospital website
4. **User notification**: Non-recoverable → toast notification with action
5. **Background healing**: Scheduler re-attempts failed hospitals
