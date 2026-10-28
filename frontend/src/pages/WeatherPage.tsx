import { CloudSun } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import { PairCell } from "../components/entities/PairCell";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { linesService, sourcesService, weatherService } from "../services/entities";
import type { WeatherCondition } from "../types";
import { formatDate, formatNumber, humanize } from "../utils/format";

const config: EntityConfig<WeatherCondition> = {
  key: "weather",
  singular: "Condition météo",
  plural: "Conditions météo",
  description: "Ensoleillement, températures, vents, précipitations et humidité qui influencent la production ou perturbent les lignes (sous-classes de sg:ConditionMeteo).",
  icon: <CloudSun size={22} />,
  service: weatherService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher par nom ou région…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Vent Bizerte 01" },
    { name: "valeurMeteo", label: "Valeur mesurée", kind: "number", required: true },
    { name: "unite", label: "Unité", kind: "text", placeholder: "Ex. °C, km/h, mm, W/m2" },
    { name: "region", label: "Région", kind: "text", placeholder: "Ex. Sfax" },
    { name: "dateReleve", label: "Date du relevé", kind: "date" },
    { name: "dureeHeures", label: "Durée", kind: "number", unit: "h", min: 0 },
    { name: "extreme", label: "Phénomène extrême", kind: "boolean" },
  ],
  relations: [
    {
      key: "influence",
      label: "Sources influencées",
      property: "sg:influence",
      service: sourcesService,
      help: "Production affectée par ce phénomène (inverse : sg:estInfluenceePar)",
    },
    {
      key: "perturbe",
      label: "Lignes perturbées",
      property: "sg:perturbe",
      service: linesService,
      help: "Inverse : sg:estPerturbeePar",
    },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (w) => (
        <div className="cell-title">
          <div>
            <strong>{w.nom}</strong>
            <small className="muted">{w.region ?? "Région non renseignée"}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (w) => <Badge tone="info">{humanize(w.type)}</Badge> },
    {
      key: "valeurMeteo",
      label: "Valeur",
      sortable: true,
      align: "right",
      render: (w) => (w.valeurMeteo === null ? "—" : `${formatNumber(w.valeurMeteo)} ${w.unite ?? ""}`.trim()),
    },
    { key: "dureeHeures", label: "Durée", sortable: true, align: "right", render: (w) => formatNumber(w.dureeHeures, "h") },
    { key: "dateReleve", label: "Relevé le", sortable: true, render: (w) => formatDate(w.dateReleve) },
    { key: "pair", label: "Perturbe", hint: "sg:perturbe", render: (w) => <PairCell refs={w.relations.perturbe} /> },
    {
      key: "relations",
      label: "Sources influencées",
      render: (w) => <span className="muted">{w.relations.influence.map((x) => x.nom).join(", ") || "—"}</span>,
    },
    { key: "status", label: "Statut", sortable: true, render: (w) => <StatusBadge status={w.status} /> },
  ],
  statusOptions: [
    { value: "extreme", label: "Extrême" },
    { value: "normal", label: "Normal" },
  ],
  summary: (items) => [
    { label: "Relevés", value: String(items.length) },
    { label: "Extrêmes", value: String(items.filter((w) => w.status === "extreme").length) },
    { label: "Régions", value: String(new Set(items.map((w) => w.region).filter(Boolean)).size) },
    { label: "Lignes perturbées", value: String(new Set(items.flatMap((w) => w.relations.perturbe.map((l) => l.id))).size) },
  ],
};

export default function WeatherPage() {
  return <EntityManager<WeatherCondition> config={config} />;
}
