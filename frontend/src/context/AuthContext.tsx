import axios from "axios";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { onUnauthorized, tokenStore } from "../services/api";
import { authService } from "../services/authService";
import type { User } from "../types";
import { useBackend } from "./BackendContext";

type AuthStatus = "checking" | "signed-in" | "signed-out";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (nom: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(tokenStore.get() ? "checking" : "signed-out");

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setStatus("signed-out");
  }, []);

  // Any 401 from the API (expired or invalid token) signs the user out.
  useEffect(() => onUnauthorized(logout), [logout]);

  // Check the saved token once the backend is reachable.
  useEffect(() => {
    if (backend.status !== "online" || !tokenStore.get() || user) return;
    let cancelled = false;
    setStatus("checking");
    authService
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus("signed-in");
      })
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) logout();
        else setStatus("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, [backend.status, user, logout]);

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password);
    tokenStore.set(res.token);
    setUser(res.user);
    setStatus("signed-in");
  };

  const signup = async (nom: string, email: string, password: string) => {
    const res = await authService.signup(nom, email, password);
    tokenStore.set(res.token);
    setUser(res.user);
    setStatus("signed-in");
  };

  return <AuthContext.Provider value={{ status, user, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
