import { Sun } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import { PairCell } from "../components/entities/PairCell";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { buildingsService, linesService, sourcesService, storageService } from "../services/entities";
import type { EnergySource } from "../types";
import { formatNumber, humanize } from "../utils/format";
import { familyColor } from "../utils/labels";

const config: EntityConfig<EnergySource> = {
  key: "sources",
  singular: "Source de production",
  plural: "Sources de production",
  description: "Centrales solaires, éoliennes, hydrauliques, biomasse et géothermiques (sous-classes de sg:SourceProduction).",
  icon: <Sun size={22} />,
  service: sourcesService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher une centrale…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Ferme Solaire 02" },
    { name: "puissance", label: "Puissance installée", kind: "integer", unit: "kW", required: true, min: 0 },
    { name: "productionAnnuelle", label: "Production annuelle", kind: "number", min: 0, help: "Valeur de sg:productionAnnuelle (unité non précisée dans l'ontologie)" },
    { name: "rendement", label: "Rendement", kind: "number", unit: "%", min: 0, max: 100 },
    { name: "emissionCO2", label: "Émissions CO₂", kind: "number", min: 0, help: "Unité non précisée dans l'ontologie" },
    { name: "anneeMiseService", label: "Année de mise en service", kind: "integer", min: 1800, max: 2100 },
    { name: "actif", label: "Source active (en service)", kind: "boolean" },
  ],
  relations: [
    { key: "alimente", label: "Bâtiments alimentés", property: "sg:alimente", service: buildingsService },
    { key: "injecteDans", label: "Lignes d'injection", property: "sg:injecteDans", service: linesService },
    {
      key: "stockeePar",
      label: "Stockée par",
      property: "sg:estStockePar",
      service: storageService,
      help: "Systèmes de stockage qui stockent l'énergie de cette source (inverse de sg:stocke)",
    },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (s) => (
        <div className="cell-title">
          <span className="family-dot" style={{ background: familyColor(s.family) }} />
          <div>
            <strong>{s.nom}</strong>
            <small className="mono muted">sg:{s.id}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (s) => <Badge tone="info">{humanize(s.type)}</Badge> },
    { key: "puissance", label: "Puissance", sortable: true, align: "right", render: (s) => formatNumber(s.puissance, "kW") },
    { key: "productionAnnuelle", label: "Prod. annuelle", sortable: true, align: "right", render: (s) => formatNumber(s.productionAnnuelle) },
    { key: "rendement", label: "Rendement", sortable: true, align: "right", render: (s) => formatNumber(s.rendement, "%") },
    {
      key: "relations",
      label: "Alimente",
      render: (s) =>
        s.relations.alimente.length ? (
          <span className="muted">{s.relations.alimente.map((b) => b.nom).join(", ")}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: "pair", label: "Stockée par", hint: "sg:estStockePar", render: (s) => <PairCell refs={s.relations.stockeePar} /> },
    { key: "status", label: "Statut", sortable: true, render: (s) => <StatusBadge status={s.status} /> },
  ],
  statusOptions: [
    { value: "actif", label: "Actif" },
    { value: "inactif", label: "Inactif" },
  ],
  nlpDomain: "sources",
  summary: (items) => [
    { label: "Sources", value: String(items.length) },
    { label: "Actives", value: String(items.filter((s) => s.actif).length) },
    { label: "Puissance totale", value: formatNumber(items.reduce((a, s) => a + (s.puissance ?? 0), 0), "kW") },
    { label: "Solaires / éoliennes", value: `${items.filter((s) => s.family === "Solaire").length} / ${items.filter((s) => s.family === "Eolien").length}` },
  ],
};

export default function EnergySourcesPage() {
  return <EntityManager<EnergySource> config={config} />;
}

