import axios from "axios";

/** Base URL of the FastAPI backend, from VITE_API_BASE_URL. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90_000,
  headers: { "Content-Type": "application/json" },
});

// ------------------------------------------------------------ demo mode state
// Demo mode is switched on only when the backend cannot be reached.
// Every page shows a banner while it is active, and mutations are disabled.

type Listener = (demo: boolean) => void;
let demoMode = false;
const listeners = new Set<Listener>();

export const demoState = {
  get: () => demoMode,
  set(value: boolean) {
    if (value === demoMode) return;
    demoMode = value;
    listeners.forEach((l) => l(value));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export class DemoModeError extends Error {
  constructor(message = "Action indisponible en mode démo : le backend n'est pas connecté.") {
    super(message);
    this.name = "DemoModeError";
  }
}

export function assertLive(): void {
  if (demoMode) throw new DemoModeError();
}

/** Drop empty values so they are not sent as query parameters. */
export function cleanParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

// ------------------------------------------------------------- session token
// The token returned by /auth/login or /auth/signup is kept in localStorage and
// sent with every request. A 401 answer means the session is over: listeners
// (the AuthContext) sign the user out.

const TOKEN_KEY = "sg.auth.token";

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: the session lasts until the page is closed */
    }
  },
};

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url ?? "";
    if (error?.response?.status === 401 && !url.startsWith("/auth/login") && !url.startsWith("/auth/signup")) {
      unauthorizedListeners.forEach((l) => l());
    }
    return Promise.reject(error);
  },
);
