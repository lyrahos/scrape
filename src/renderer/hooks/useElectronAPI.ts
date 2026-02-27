// ============================================================================
// Custom React Hooks for Electron API interactions
// ============================================================================
import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../store/appStore';

/**
 * Hook for performing searches with loading state and error handling
 */
export function useSearch<T>(searchFn: (query: string) => Promise<T[] | undefined>) {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchFn(query);
      setResults((res as T[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchFn]);

  return { results, loading, error, search };
}

/**
 * Hook for async data fetching with automatic loading state
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T | undefined>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFn()
      .then((result) => {
        if (!cancelled && result !== undefined) {
          setData(result as T);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Fetch failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, deps);

  return { data, loading, error };
}

/**
 * Hook for performing async actions with notifications
 */
export function useAction() {
  const addNotification = useAppStore((s) => s.addNotification);

  const execute = useCallback(async <T>(
    action: () => Promise<T>,
    successMessage?: string,
  ): Promise<T | null> => {
    try {
      const result = await action();
      if (successMessage) addNotification('success', successMessage);
      return result;
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Action failed');
      return null;
    }
  }, [addNotification]);

  return { execute };
}

/**
 * Hook for debounced values (useful for search-as-you-type)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for listening to Electron IPC events
 */
export function useIPCListener(channel: string, handler: (data: unknown) => void) {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Map channel to listener method
    const listeners: Record<string, ((cb: (data: unknown) => void) => void) | undefined> = {
      'ingestion:progress': api.onIngestionProgress,
      'update:status': api.onUpdateStatus,
      'update:complete': api.onUpdateComplete,
    };

    const listener = listeners[channel];
    if (listener) {
      listener(handler);
    }
  }, [channel, handler]);
}
