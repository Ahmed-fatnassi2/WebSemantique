import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../utils/errors";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (data: T | null) => void;
}

/**
 * Run an async loader whenever deps change. Stale responses are ignored,
 * so fast typing in a search box never shows an older result.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const callId = useRef(0);

  useEffect(() => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (id === callId.current) setData(result);
      })
      .catch((err) => {
        if (id === callId.current) setError(errorMessage(err));
      })
      .finally(() => {
        if (id === callId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}
