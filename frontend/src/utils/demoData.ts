/**
 * DEMO DATA — fictional values, used only when the backend is unreachable.
 * Every page shows a "Mode démo" banner while this data is displayed.
 * It is NOT the content of the ontology.
 */
import type {
  BaseEntity,
  Building,
  DashboardStats,
  EnergySource,
  EntityKey,
  GridData,
  GridEdge,
  ListParams,
  Paginated,
  StorageSystem,
  TransmissionLine,
  TypeOption,
} from "../types";

const ref = (id: string, nom: string, type: string) => ({ id, nom, type });
const NS = "urn:demo#";

const sources: EnergySource[] = [
  {
    id: "Demo_Solaire_A", uri: NS + "Demo_Solaire_A", type: "Photovoltaique", family: "Solaire",
    nom: "Centrale solaire A (démo)", status: "actif", puissance: 420, rendement: 19, anneeMiseService: 2020,
    emissionCO2: 40, productionAnnuelle: 700, actif: true,
    relations: { alimente: [ref("Demo_Maison_A", "Maison A (démo)", "Maison")], injecteDans: [], stockeePar: [ref("Demo_Batterie_A", "Batterie A (démo)", "BatterieLithium")] },
  },
  {
    id: "Demo_Eolien_B", uri: NS + "Demo_Eolien_B", type: "EolienTerrestre", family: "Eolien",
    nom: "Parc éolien B (démo)", status: "actif", puissance: 650, rendement: 33, anneeMiseService: 2016,
    emissionCO2: 11, productionAnnuelle: 1600, actif: true,
    relations: { alimente: [ref("Demo_Usine_C", "Usine C (démo)", "Usine")], injecteDans: [ref("Demo_Ligne_A", "Ligne A (démo)", "LigneAerienneHT")], stockeePar: [] },
  },
  {
    id: "Demo_Eolien_C", uri: NS + "Demo_Eolien_C", type: "EolienOffshore", family: "Eolien",
    nom: "Parc offshore C (démo)", status: "inactif", puissance: 900, rendement: 41, anneeMiseService: 2022,
    emissionCO2: 9, productionAnnuelle: 0, actif: false,
    relations: { alimente: [], injecteDans: [ref("Demo_Ligne_A", "Ligne A (démo)", "LigneAerienneHT")], stockeePar: [] },
  },
];

const storage: StorageSystem[] = [
  {
    id: "Demo_Batterie_A", uri: NS + "Demo_Batterie_A", type: "BatterieLithium", family: "Batterie",
    nom: "Batterie A (démo)", status: "faible", capacite: 1500, tauxCharge: 15, dureeVieAnnees: 10,
    rendementStockage: 91, tempsRechargeHeures: 3, puissanceStockage: 400,
    relations: { stocke: [ref("Demo_Solaire_A", "Centrale solaire A (démo)", "Photovoltaique")] },
  },
  {
    id: "Demo_Volant_B", uri: NS + "Demo_Volant_B", type: "VolantAcier", family: "VolantInertie",
    nom: "Volant d'inertie B (démo)", status: "eleve", capacite: 80, tauxCharge: 88, dureeVieAnnees: 20,
    rendementStockage: 85, tempsRechargeHeures: 0.5, puissanceStockage: 150, relations: { stocke: [] },
  },
];

const buildings: Building[] = [
  {
    id: "Demo_Maison_A", uri: NS + "Demo_Maison_A", type: "Maison", family: "Residentiel", nom: "Maison A (démo)",
    status: "alimente", consommation: 4800, adresse: "Adresse fictive 1", surface: 140, nbOccupants: 4,
    anneeConstruction: 2012, classeEnergetique: "B",
    relations: { sources: [ref("Demo_Solaire_A", "Centrale solaire A (démo)", "Photovoltaique")] },
  },
  {
    id: "Demo_Usine_C", uri: NS + "Demo_Usine_C", type: "Usine", family: "Industriel", nom: "Usine C (démo)",
    status: "alimente", consommation: 520000, adresse: "Adresse fictive 2", surface: 6000, nbOccupants: 180,
    anneeConstruction: 2001, classeEnergetique: "D",
    relations: { sources: [ref("Demo_Eolien_B", "Parc éolien B (démo)", "EolienTerrestre")] },
  },
  {
    id: "Demo_Universite_D", uri: NS + "Demo_Universite_D", type: "Universite", family: "Educatif",
    nom: "Université D (démo)", status: "non_alimente", consommation: 310000, adresse: "Adresse fictive 3",
    surface: 12000, nbOccupants: 3000, anneeConstruction: 1995, classeEnergetique: "C", relations: { sources: [] },
  },
];

const lines: TransmissionLine[] = [
  {
    id: "Demo_Ligne_A", uri: NS + "Demo_Ligne_A", type: "LigneAerienneHT", family: "HauteTension", nom: "Ligne A (démo)",
    status: "Bon", capaciteTransport: 350, longueur: 90, tension: 225, pertes: 2.1, anneePose: 2005, etatLigne: "Bon",
    relations: { connecteeA: [ref("Demo_Ligne_B", "Ligne B (démo)", "ReseauDistributionBT")], recoitDe: [ref("Demo_Eolien_B", "Parc éolien B (démo)", "EolienTerrestre"), ref("Demo_Eolien_C", "Parc offshore C (démo)", "EolienOffshore")] },
  },
  {
    id: "Demo_Ligne_B", uri: NS + "Demo_Ligne_B", type: "ReseauDistributionBT", family: "BasseTension", nom: "Ligne B (démo)",
    status: "Moyen", capaciteTransport: 8, longueur: 4, tension: 0.4, pertes: 3.8, anneePose: 2014, etatLigne: "Moyen",
    relations: { connecteeA: [ref("Demo_Ligne_A", "Ligne A (démo)", "LigneAerienneHT")], recoitDe: [] },
  },
];

const DATA: Partial<Record<EntityKey, BaseEntity[]>> = { sources, storage, buildings, lines };

const TYPES: Partial<Record<EntityKey, TypeOption[]>> = {
  sources: ["Photovoltaique", "EolienTerrestre", "EolienOffshore"].map((id) => ({ id, uri: NS + id, family: id.startsWith("Eolien") ? "Eolien" : "Solaire", is_family: false })),
  storage: ["BatterieLithium", "VolantAcier"].map((id) => ({ id, uri: NS + id, family: null, is_family: false })),
  buildings: ["Maison", "Usine", "Universite"].map((id) => ({ id, uri: NS + id, family: null, is_family: false })),
  lines: ["LigneAerienneHT", "ReseauDistributionBT"].map((id) => ({ id, uri: NS + id, family: null, is_family: false })),
};

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function demoList(key: EntityKey, p: ListParams): Paginated<BaseEntity> {
  let items = [...(DATA[key] ?? [])];
  if (p.search) {
    const n = fold(p.search);
    items = items.filter((it) => fold(`${it.nom} ${it.id} ${it.type}`).includes(n));
  }
  if (p.type) items = items.filter((it) => it.type === p.type || it.family === p.type);
  if (p.status) items = items.filter((it) => it.status === p.status);
  if (p.sort) {
    const k = p.sort as keyof BaseEntity;
    const dir = p.order === "desc" ? -1 : 1;
    items.sort((a, b) => {
      const va = a[k] as unknown, vb = b[k] as unknown;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
    });
  }
  const page_size = p.page_size ?? 10;
  const page = p.page ?? 1;
  return {
    items: items.slice((page - 1) * page_size, page * page_size),
    total: items.length,
    page,
    page_size,
    pages: Math.max(1, Math.ceil(items.length / page_size)),
  };
}

export function demoGet(key: EntityKey, id: string): BaseEntity {
  const found = (DATA[key] ?? []).find((it) => it.id === id);
  if (!found) throw new Error("Élément introuvable (mode démo)");
  return found;
}

export function demoTypes(key: EntityKey): TypeOption[] {
  return TYPES[key] ?? [];
}

const count = (arr: { status: string }[]) =>
  arr.reduce<Record<string, number>>((acc, it) => ({ ...acc, [it.status]: (acc[it.status] ?? 0) + 1 }), {});
const sum = (arr: (number | null)[]) => arr.reduce<number>((a, b) => a + (b ?? 0), 0);

export function demoDashboard(): DashboardStats {
  const families: Record<string, { family: string; count: number; puissance: number; productionAnnuelle: number }> = {};
  for (const s of sources) {
    const f = (families[s.family ?? "Autre"] ??= { family: s.family ?? "Autre", count: 0, puissance: 0, productionAnnuelle: 0 });
    f.count += 1;
    f.puissance += s.puissance ?? 0;
    f.productionAnnuelle += s.productionAnnuelle ?? 0;
  }
  const charges = storage.map((s) => s.tauxCharge ?? 0);
  return {
    counts: {
      sources: sources.length,
      sources_actives: sources.filter((s) => s.actif).length,
      storage: storage.length,
      buildings: buildings.length,
      buildings_alimentes: buildings.filter((b) => b.status === "alimente").length,
      lines: lines.length,
      individuals: sources.length + storage.length + buildings.length + lines.length,
    },
    totals: {
      puissance_kw: sum(sources.map((s) => s.puissance)),
      production_annuelle: sum(sources.map((s) => s.productionAnnuelle)),
      capacite_stockage_kwh: sum(storage.map((s) => s.capacite)),
      charge_moyenne: charges.length ? sum(charges) / charges.length : null,
      consommation_kwh: sum(buildings.map((b) => b.consommation)),
      longueur_lignes_km: sum(lines.map((l) => l.longueur)),
      capacite_transport_kw: sum(lines.map((l) => l.capaciteTransport)),
    },
    production_by_source: sources.map((s) => ({ id: s.id, nom: s.nom ?? s.id, family: s.family, type: s.type, puissance: s.puissance, productionAnnuelle: s.productionAnnuelle, status: s.status })),
    production_by_family: Object.values(families),
    consumption_by_building: buildings.map((b) => ({ id: b.id, nom: b.nom ?? b.id, type: b.type, consommation: b.consommation })),
    storage_levels: storage.map((s) => ({ id: s.id, nom: s.nom ?? s.id, type: s.type, capacite: s.capacite, tauxCharge: s.tauxCharge, status: s.status })),
    status: { sources: count(sources), storage: count(storage), lines: count(lines), buildings: count(buildings) },
    graph: { triples: 0, classes: 0, object_properties: 0, data_properties: 0 },
    activity: [],
  };
}

export function demoGrid(): GridData {
  const cat: Partial<Record<EntityKey, GridData["nodes"][number]["category"]>> = { sources: "sources", storage: "storage", buildings: "buildings", lines: "lines" };
  const nodes = (Object.keys(DATA) as EntityKey[]).flatMap((k) =>
    (DATA[k] ?? []).map((it) => ({ id: it.id, uri: it.uri, label: it.nom ?? it.id, type: it.type, category: cat[k] ?? "other", status: it.status, properties: {} })),
  );
  const edges: GridEdge[] = [];
  const add = (source: string, property: string, target: string, symmetric = false) => {
    const id = symmetric ? [source, target].sort().join(`-${property}-`) : `${source}-${property}-${target}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source, target, property, property_uri: NS + property, symmetric });
  };
  sources.forEach((s) => {
    s.relations.alimente.forEach((b) => add(s.id, "alimente", b.id));
    s.relations.injecteDans.forEach((l) => add(s.id, "injecteDans", l.id));
  });
  storage.forEach((st) => st.relations.stocke.forEach((s) => add(st.id, "stocke", s.id)));
  lines.forEach((l) => l.relations.connecteeA.forEach((o) => add(l.id, "estConnecteA", o.id, true)));
  return { nodes, edges };
}
