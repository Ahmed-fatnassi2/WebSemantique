import type { SparqlAnalysis, SparqlResult } from "../types";
import { api, assertLive } from "./api";

export const sparqlService = {
  /**
   * Run a query. Updates are refused by the backend (HTTP 409, code
   * CONFIRMATION_REQUIRED) unless allowUpdate is true.
   */
  async execute(query: string, allowUpdate = false): Promise<SparqlResult> {
    assertLive();
    return (await api.post<SparqlResult>("/sparql", { query, allow_update: allowUpdate })).data;
  },
  async analyze(query: string): Promise<SparqlAnalysis> {
    assertLive();
    return (await api.post<SparqlAnalysis>("/sparql/analyze", { query })).data;
  },
};
