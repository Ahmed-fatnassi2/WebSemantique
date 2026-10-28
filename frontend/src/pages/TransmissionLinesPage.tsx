import { Cable } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import { PairCell } from "../components/entities/PairCell";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { linesService, sourcesService, weatherService } from "../services/entities";
import type { TransmissionLine } from "../types";
import { formatNumber, humanize } from "../utils/format";

const config: EntityConfig<TransmissionLine> = {
  key: "lines",
  singular: "Ligne de transport",
  plural: "Lignes de transport",
  description: "Lignes haute, moyenne et basse tension, interconnexions et raccordements (sous-classes de sg:LigneTransport).",
  icon: <Cable size={22} />,
  service: linesService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher une ligne…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Ligne 04" },
    { name: "capaciteTransport", label: "Capacité de transport", kind: "number", unit: "kW", required: true, min: 0 },
    { name: "longueur", label: "Longueur", kind: "number", unit: "km", required: true, min: 0 },
    { name: "tension", label: "Tension", kind: "number", unit: "kV", min: 0 },
    { name: "pertes", label: "Pertes", kind: "number", unit: "%", min: 0, max: 100 },
    { name: "anneePose", label: "Année de pose", kind: "integer", min: 1800, max: 2100 },
    { name: "etatLigne", label: "État opérationnel", kind: "select", options: ["Bon", "Moyen", "Mauvais", "Hors service"] },
  ],
  relations: [
    { key: "connecteeA", label: "Lignes connectées", property: "sg:estConnecteA", service: linesService, help: "Propriété symétrique" },
    { key: "recoitDe", label: "Sources injectant dans la ligne", property: "sg:injecteDans", service: sourcesService, help: "Enregistré sous la forme « source sg:injecteDans ligne »" },
    {
      key: "perturbeePar",
      label: "Perturbée par",
      property: "sg:estPerturbeePar",
      service: weatherService,
      help: "Conditions météo qui perturbent cette ligne (inverse de sg:perturbe)",
    },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (l) => (
        <div className="cell-title">
          <div>
            <strong>{l.nom}</strong>
            <small className="mono muted">sg:{l.id}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (l) => <Badge tone="info">{humanize(l.type)}</Badge> },
    { key: "capaciteTransport", label: "Capacité", sortable: true, align: "right", render: (l) => formatNumber(l.capaciteTransport, "kW") },
    { key: "longueur", label: "Longueur", sortable: true, align: "right", render: (l) => formatNumber(l.longueur, "km") },
    { key: "tension", label: "Tension", sortable: true, align: "right", render: (l) => formatNumber(l.tension, "kV") },
    {
      key: "relations",
      label: "Connexions",
      render: (l) => {
        const all = [...l.relations.connecteeA.map((x) => x.nom), ...l.relations.recoitDe.map((x) => `← ${x.nom}`)];
        return <span className="muted">{all.join(", ") || "—"}</span>;
      },
    },
    { key: "pair", label: "Perturbée par", hint: "sg:estPerturbeePar", render: (l) => <PairCell refs={l.relations.perturbeePar} /> },
    { key: "status", label: "État", sortable: true, render: (l) => <StatusBadge status={l.status} /> },
  ],
  statusOptions: [
    { value: "Bon", label: "Bon" },
    { value: "Moyen", label: "Moyen" },
    { value: "Mauvais", label: "Mauvais" },
    { value: "Hors service", label: "Hors service" },
  ],
  nlpDomain: "lignes",
  summary: (items) => [
    { label: "Lignes", value: String(items.length) },
    { label: "Longueur totale", value: formatNumber(items.reduce((a, l) => a + (l.longueur ?? 0), 0), "km") },
    { label: "Capacité cumulée", value: formatNumber(items.reduce((a, l) => a + (l.capaciteTransport ?? 0), 0), "kW") },
    { label: "En bon état", value: String(items.filter((l) => l.status === "Bon").length) },
  ],
};

export default function TransmissionLinesPage() {
  return <EntityManager<TransmissionLine> config={config} />;
}
