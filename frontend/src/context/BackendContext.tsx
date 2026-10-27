import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { demoState } from "../services/api";
import { systemService } from "../services/systemService";

export type BackendStatus = "checking" | "online" | "offline";

interface BackendContextValue {
  status: BackendStatus;
  demo: boolean;
  lastChecked: Date | null;
  triples: number | null;
  /** Bumped every time the connection changes, so pages can reload their data. */
  version: number;
  retry: () => Promise<void>;
}

const BackendContext = createContext<BackendContextValue | null>(null);

export function BackendProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [demo, setDemo] = useState(demoState.get());
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [triples, setTriples] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const health = await systemService.health();
      demoState.set(false);
      setStatus("online");
      setTriples(health.triples);
    } catch {
      demoState.set(true);
      setStatus("offline");
      setTriples(null);
    } finally {
      setLastChecked(new Date());
      setVersion((v) => v + 1);
    }
  }, []);

  useEffect(() => demoState.subscribe(setDemo), []);

  useEffect(() => {
    void check();
  }, [check]);

  // While offline, check again every 20 s so the app recovers by itself.
  useEffect(() => {
    if (status !== "offline") return;
    const t = setInterval(() => {
      systemService
        .health()
        .then(() => check())
        .catch(() => undefined);
    }, 20_000);
    return () => clearInterval(t);
  }, [status, check]);

  return (
    <BackendContext.Provider value={{ status, demo, lastChecked, triples, version, retry: check }}>
      {children}
    </BackendContext.Provider>
  );
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error("useBackend must be used inside BackendProvider");
  return ctx;
}
