import type { DashboardStats, GridData } from "../types";
import { demoDashboard, demoGrid } from "../utils/demoData";
import { api, demoState } from "./api";

export const dashboardService = {
  async stats(): Promise<DashboardStats> {
    if (demoState.get()) return demoDashboard();
    const { data } = await api.get<DashboardStats>("/dashboard/stats");
    return data;
  },
};

export const gridService = {
  /** Every individual and every object-property assertion between them. */
  async network(): Promise<GridData> {
    if (demoState.get()) return demoGrid();
    const { data } = await api.get<GridData>("/grid");
    return data;
  },
};
