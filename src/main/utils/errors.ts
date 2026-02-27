// ============================================================================
// Error Handling — Typed errors and error recovery strategies
// ============================================================================

/**
 * Base application error with structured context
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly context?: Record<string, unknown>,
    public readonly recoverable: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'DB_ERROR'
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'RATE_LIMITED'
  | 'ROBOTS_BLOCKED'
  | 'INVALID_DATA'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class NetworkError extends AppError {
  constructor(message: string, public readonly statusCode?: number, public readonly url?: string) {
    super(message, 'NETWORK_ERROR', { statusCode, url }, true);
    this.name = 'NetworkError';
  }
}

export class ParseError extends AppError {
  constructor(message: string, public readonly fileType?: string, public readonly row?: number) {
    super(message, 'PARSE_ERROR', { fileType, row }, true);
    this.name = 'ParseError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public readonly operation?: string) {
    super(message, 'DB_ERROR', { operation }, false);
    this.name = 'DatabaseError';
  }
}

/**
 * Wrap an async function with structured error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, error: err };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: new AppError(`${context}: ${message}`, 'UNKNOWN', { originalError: err }),
    };
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * delay * 0.1;
        await new Promise((r) => setTimeout(r, delay + jitter));
      }
    }
  }

  throw lastError ?? new Error('All retries exhausted');
}

/**
 * Log error with structured context (for update_log and console)
 */
export function formatError(error: unknown): { message: string; code: ErrorCode; details?: string } {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      details: JSON.stringify(error.context),
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN',
      details: error.stack,
    };
  }
  return {
    message: String(error),
    code: 'UNKNOWN',
  };
}
