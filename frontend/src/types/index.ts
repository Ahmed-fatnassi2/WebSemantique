// ---------------------------------------------------------------- common

export type EntityKey =
  | "sources"
  | "storage"
  | "buildings"
  | "lines"
  | "mobility"
  | "systems"
  | "weather"
  | "regulations";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ListParams {
  search?: string;
  type?: string;
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface EntityRef {
  id: string;
  nom: string;
  type: string | null;
}

export interface BaseEntity {
  id: string;
  uri: string;
  type: string | null;
  family: string | null;
  nom: string | null;
  status: string;
  relations: Record<string, EntityRef[]>;
}

export interface EnergySource extends BaseEntity {
  puissance: number | null;
  rendement: number | null;
  anneeMiseService: number | null;
  emissionCO2: number | null;
  productionAnnuelle: number | null;
  actif: boolean | null;
}

export interface StorageSystem extends BaseEntity {
  capacite: number | null;
  tauxCharge: number | null;
  dureeVieAnnees: number | null;
  rendementStockage: number | null;
  tempsRechargeHeures: number | null;
  puissanceStockage: number | null;
}

export interface Building extends BaseEntity {
  consommation: number | null;
  adresse: string | null;
  surface: number | null;
  nbOccupants: number | null;
  anneeConstruction: number | null;
  classeEnergetique: string | null;
}

export interface TransmissionLine extends BaseEntity {
  capaciteTransport: number | null;
  longueur: number | null;
  tension: number | null;
  pertes: number | null;
  anneePose: number | null;
  etatLigne: string | null;
}

export interface MobilityItem extends BaseEntity {
  puissanceCharge: number | null;
  tempsChargeMinutes: number | null;
  capaciteVehicule: number | null;
  tarifKWh: number | null;
  typeConnecteur: string | null;
  disponible: boolean | null;
}

export interface SmartSystem extends BaseEntity {
  protocole: string | null;
  versionLogiciel: string | null;
  frequenceMesure: number | null;
  precisionMesure: number | null;
  valeurMesuree: number | null;
  /** ISO date, e.g. "2021-03-15" */
  dateInstallation: string | null;
}

export interface WeatherCondition extends BaseEntity {
  valeurMeteo: number | null;
  unite: string | null;
  region: string | null;
  dateReleve: string | null;
  dureeHeures: number | null;
  extreme: boolean | null;
}

export interface Regulation extends BaseEntity {
  reference: string | null;
  organisme: string | null;
  dateEntreeVigueur: string | null;
  dureeValiditeAnnees: number | null;
  montantAide: number | null;
  obligatoire: boolean | null;
}

export type AnyEntity =
  | EnergySource
  | StorageSystem
  | Building
  | TransmissionLine
  | MobilityItem
  | SmartSystem
  | WeatherCondition
  | Regulation;

export interface EntityPayload {
  id?: string;
  type: string;
  relations: Record<string, string[]>;
  [field: string]: unknown;
}

export interface TypeOption {
  id: string;
  uri: string;
  family: string | null;
  is_family: boolean;
}

// -------------------------------------------------------------- dashboard

export interface ActivityEntry {
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  message: string;
}

export interface DashboardStats {
  counts: {
    sources: number;
    sources_actives: number;
    storage: number;
    buildings: number;
    buildings_alimentes: number;
    lines: number;
    individuals: number;
  };
  totals: {
    puissance_kw: number;
    production_annuelle: number;
    capacite_stockage_kwh: number;
    charge_moyenne: number | null;
    consommation_kwh: number;
    longueur_lignes_km: number;
    capacite_transport_kw: number;
  };
  production_by_source: {
    id: string;
    nom: string;
    family: string | null;
    type: string | null;
    puissance: number | null;
    productionAnnuelle: number | null;
    status: string;
  }[];
  production_by_family: { family: string; count: number; puissance: number; productionAnnuelle: number }[];
  consumption_by_building: { id: string; nom: string; type: string | null; consommation: number | null }[];
  storage_levels: {
    id: string;
    nom: string;
    type: string | null;
    capacite: number | null;
    tauxCharge: number | null;
    status: string;
  }[];
  status: Record<"sources" | "storage" | "lines" | "buildings", Record<string, number>>;
  graph: { triples: number; classes: number; object_properties: number; data_properties: number };
  activity: ActivityEntry[];
}

// --------------------------------------------------------------- ontology

export interface UriRef {
  id: string;
  uri: string;
}

export interface OntologySummary {
  iri: string;
  namespace: string;
  label: string;
  comment: string | null;
  triples: number;
  classes: number;
  object_properties: number;
  data_properties: number;
  individuals: number;
  loaded_from: string;
}

export interface OntologyClass {
  id: string;
  uri: string;
  label: string;
  comment: string | null;
  parents: UriRef[];
  children: UriRef[];
  direct_instances: number;
  total_instances: number;
}

export interface ObjectProperty {
  id: string;
  uri: string;
  label: string;
  comment: string | null;
  domain: UriRef[];
  range: UriRef[];
  inverse: UriRef[];
  characteristics: string[];
  super_properties: UriRef[];
  usage: number;
}

export interface DataProperty {
  id: string;
  uri: string;
  label: string;
  comment: string | null;
  domain: UriRef[];
  range: UriRef[];
  characteristics: string[];
  usage: number;
}

export type GridCategory =
  | "sources"
  | "storage"
  | "buildings"
  | "lines"
  | "mobility"
  | "smart"
  | "weather"
  | "regulation"
  | "other";

export interface IndividualSummary {
  id: string;
  uri: string;
  label: string;
  types: UriRef[];
  category: GridCategory;
}

export interface IndividualDetail extends IndividualSummary {
  ancestors: UriRef[];
  data: { property: string; property_uri: string; value: unknown; datatype: string | null }[];
  outgoing: { property: string; property_uri: string; target: string; target_uri: string; target_label: string }[];
  incoming: { property: string; property_uri: string; source: string; source_uri: string; source_label: string }[];
}

// ------------------------------------------------------------------- grid

export interface GridNode {
  id: string;
  uri: string;
  label: string;
  type: string | null;
  category: GridCategory;
  status: string | null;
  properties: Record<string, unknown>;
}

export interface GridEdge {
  id: string;
  source: string;
  target: string;
  property: string;
  property_uri: string;
  symmetric: boolean;
}

export interface GridData {
  nodes: GridNode[];
  edges: GridEdge[];
}

// ----------------------------------------------------------------- sparql

export type QueryType = "select" | "ask" | "construct" | "describe" | "update";

export interface RdfTerm {
  type: "uri" | "literal" | "bnode";
  value: string;
  short: string;
  datatype?: string | null;
  lang?: string | null;
}

export interface SparqlResult {
  query_type: QueryType;
  columns: string[];
  rows: Record<string, RdfTerm | null>[];
  boolean: boolean | null;
  truncated: boolean;
  count: number;
  duration_ms: number;
  triples_before?: number;
  triples_after?: number;
}

export interface SparqlAnalysis {
  valid: boolean;
  query_type: QueryType | null;
  is_mutation: boolean;
  error: string | null;
}

// -------------------------------------------------------------------- nlp

export interface NlpEntity {
  type: string;
  value: string;
  text: string;
}

export interface NlpToken {
  text: string;
  lemma: string;
  pos: string;
  dep: string;
  head: string;
  norm: string;
}

export interface NlpAnalysis {
  tokens: NlpToken[];
  /** Question with ontology words replaced by CLASSE, INDIVIDU, NOMBRE… (classifier input). */
  delexicalised: string;
  classifier: { intent: string; label: string; score: number }[];
  /** Coherence rules applied after the classifier. */
  rules: string[];
}

/** One NLP assistant per domain (membre 1, 2, 3). */
export type NlpDomainKey = "sources" | "batiments" | "lignes" | "meteo";

export interface NlpResponse {
  question: string;
  domain: NlpDomainKey;
  domain_label: string;
  engine: "spacy";
  model: string | null;
  intent: string | null;
  intent_label: string | null;
  entities: NlpEntity[];
  sparql: string | null;
  explanation: string | null;
  result: SparqlResult | null;
  error: string | null;
  warnings: string[];
  analysis: NlpAnalysis | null;
  duration_ms?: number;
}

export interface NlpDomainInfo {
  key: NlpDomainKey;
  label: string;
  /** Top ontology class of the domain, e.g. "SourceProduction". */
  family: string;
  training_examples: number;
  /** 5-fold cross-validation accuracy (null while it is being computed). */
  cv_accuracy: number | null;
  examples: string[];
}

export interface NlpEngineInfo {
  engine: string;
  spacy_model: string;
  normalisation: string;
  classifier: string;
  intents: string[];
  domains: NlpDomainInfo[];
  loaded: boolean;
}

// ----------------------------------------------------------------- system

export interface AppInfo {
  app: string;
  version: string;
  ontology_file: string;
  ontology_path: string;
  working_copy: string;
  working_copy_exists: boolean;
  loaded_from: string;
  loaded_at: string;
  sparql_max_rows: number;
  nlp: NlpEngineInfo;
  ontology: OntologySummary;
}

// ------------------------------------------------------------------- auth

export interface User {
  id: string;
  nom: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
