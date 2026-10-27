import type { AppInfo } from "../types";
import { api, assertLive } from "./api";

export const systemService = {
  /** Health check that ignores demo mode, used to detect the backend. */
  async health(): Promise<{ status: string; triples: number; loaded_at: string }> {
    return (await api.get("/health", { timeout: 5000 })).data;
  },
  async info(): Promise<AppInfo> {
    assertLive();
    return (await api.get<AppInfo>("/info")).data;
  },
  /** Delete SmartGrid_new.owl and reload the original OWL file. */
  async reset(): Promise<{ status: string; triples: number }> {
    assertLive();
    return (await api.post("/system/reset")).data;
  },
};
