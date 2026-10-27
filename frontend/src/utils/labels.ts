import type { GridCategory } from "../types";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/** Status values returned by the backend -> French label + colour. */
export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  actif: { label: "Actif", tone: "success" },
  inactif: { label: "Inactif", tone: "danger" },
  faible: { label: "Charge faible", tone: "danger" },
  moyen: { label: "Charge moyenne", tone: "warning" },
  eleve: { label: "Charge élevée", tone: "success" },
  Bon: { label: "Bon état", tone: "success" },
  Moyen: { label: "État moyen", tone: "warning" },
  Mauvais: { label: "Mauvais état", tone: "danger" },
  "Hors service": { label: "Hors service", tone: "danger" },
  alimente: { label: "Alimenté", tone: "success" },
  non_alimente: { label: "Non alimenté", tone: "warning" },
  disponible: { label: "Disponible", tone: "success" },
  indisponible: { label: "Indisponible", tone: "danger" },
  relie: { label: "Relié au réseau", tone: "success" },
  non_relie: { label: "Non relié", tone: "warning" },
  extreme: { label: "Extrême", tone: "danger" },
  normal: { label: "Normal", tone: "success" },
  obligatoire: { label: "Obligatoire", tone: "info" },
  facultatif: { label: "Facultatif", tone: "neutral" },
  inconnu: { label: "Inconnu", tone: "neutral" },
};

export function statusMeta(status: string | null | undefined) {
  if (!status) return STATUS_META.inconnu;
  return STATUS_META[status] ?? { label: status, tone: "neutral" as Tone };
}

export const CATEGORY_META: Record<GridCategory, { label: string; color: string }> = {
  sources: { label: "Sources de production", color: "#f59e0b" },
  storage: { label: "Stockage", color: "#8b5cf6" },
  lines: { label: "Lignes de transport", color: "#0ea5e9" },
  buildings: { label: "Bâtiments", color: "#10b981" },
  mobility: { label: "Mobilité électrique", color: "#ec4899" },
  smart: { label: "Systèmes intelligents", color: "#64748b" },
  weather: { label: "Conditions météo", color: "#06b6d4" },
  regulation: { label: "Réglementation", color: "#a16207" },
  other: { label: "Autres", color: "#94a3b8" },
};

/** Colours for source families in charts. */
export const FAMILY_COLORS: Record<string, string> = {
  Solaire: "#f59e0b",
  Eolien: "#0ea5e9",
  Hydraulique: "#2563eb",
  Biomasse: "#84cc16",
  Geothermique: "#ef4444",
};

export function familyColor(family: string | null | undefined): string {
  return (family && FAMILY_COLORS[family]) || "#10b981";
}

export const PROPERTY_LABELS: Record<string, string> = {
  alimente: "alimente",
  stocke: "stocke",
  injecteDans: "injecte dans",
  estConnecteA: "connectée à",
  recharge: "recharge",
  estRaccordeeA: "raccordée à",
  restitueA: "restitue à",
  mesure: "mesure",
  surveille: "surveille",
  predit: "prédit",
  gere: "gère",
  estPlusPuissantQue: "plus puissant que",
  influence: "influence",
  perturbe: "perturbe",
  encadre: "encadre",
  certifie: "certifie",
  sAppliqueA: "s'applique à",
};
