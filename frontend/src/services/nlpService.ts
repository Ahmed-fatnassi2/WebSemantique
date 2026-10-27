import type { NlpDomainKey, NlpEngineInfo, NlpResponse } from "../types";
import { api, assertLive } from "./api";

/** French questions -> intent, entities, SPARQL and results (computed by the backend). */
export const nlpService = {
  async ask(question: string, domain: NlpDomainKey): Promise<NlpResponse> {
    assertLive();
    return (await api.post<NlpResponse>("/nlp/ask", { question, domain })).data;
  },
  async info(): Promise<NlpEngineInfo> {
    assertLive();
    return (await api.get<NlpEngineInfo>("/nlp/info")).data;
  },
};
