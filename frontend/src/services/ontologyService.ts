import type {
  DataProperty,
  IndividualDetail,
  IndividualSummary,
  ObjectProperty,
  OntologyClass,
  OntologySummary,
} from "../types";
import { api, assertLive, cleanParams } from "./api";

// Ontology data always comes from the backend: there is no demo version.
export const ontologyService = {
  async summary(): Promise<OntologySummary> {
    assertLive();
    return (await api.get<OntologySummary>("/ontology/summary")).data;
  },
  async classes(): Promise<OntologyClass[]> {
    assertLive();
    return (await api.get<OntologyClass[]>("/ontology/classes")).data;
  },
  async objectProperties(): Promise<ObjectProperty[]> {
    assertLive();
    return (await api.get<ObjectProperty[]>("/ontology/object-properties")).data;
  },
  async dataProperties(): Promise<DataProperty[]> {
    assertLive();
    return (await api.get<DataProperty[]>("/ontology/data-properties")).data;
  },
  async individuals(classId?: string): Promise<IndividualSummary[]> {
    assertLive();
    const params = cleanParams({ class: classId });
    return (await api.get<IndividualSummary[]>("/ontology/individuals", { params })).data;
  },
  async individual(id: string): Promise<IndividualDetail> {
    assertLive();
    return (await api.get<IndividualDetail>(`/ontology/individuals/${encodeURIComponent(id)}`)).data;
  },
  async export(format: "turtle" | "xml" | "json-ld" | "nt"): Promise<Blob> {
    assertLive();
    return (await api.get<Blob>("/ontology/export", { params: { format }, responseType: "blob" })).data;
  },
};
