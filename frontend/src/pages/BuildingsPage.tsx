import { Building2 } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import { PairCell } from "../components/entities/PairCell";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { buildingsService, sourcesService, systemsService } from "../services/entities";
import type { Building } from "../types";
import { formatNumber, humanize } from "../utils/format";

const config: EntityConfig<Building> = {
  key: "buildings",
  singular: "Bâtiment",
  plural: "Bâtiments consommateurs",
  description: "Maisons, immeubles, usines, commerces, hôpitaux, écoles et universités (sous-classes de sg:Batiment).",
  icon: <Building2 size={22} />,
  service: buildingsService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher par nom ou adresse…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Université 01" },
    { name: "consommation", label: "Consommation", kind: "number", unit: "kWh", required: true, min: 0 },
    { name: "adresse", label: "Adresse / localisation", kind: "text", placeholder: "Rue, ville" },
    { name: "surface", label: "Surface", kind: "number", unit: "m²", min: 0 },
    { name: "nbOccupants", label: "Occupants", kind: "integer", min: 0 },
    { name: "anneeConstruction", label: "Année de construction", kind: "integer", min: 1000, max: 2100 },
    { name: "classeEnergetique", label: "Classe énergétique", kind: "select", options: ["A", "B", "C", "D", "E", "F", "G"] },
  ],
  relations: [
    {
      key: "sources",
      label: "Sources connectées",
      property: "sg:alimente",
      service: sourcesService,
      help: "Enregistré sous la forme « source sg:alimente bâtiment » (inverse : sg:estAlimentePar)",
    },
    {
      key: "mesurePar",
      label: "Mesuré par",
      property: "sg:estMesurePar",
      service: systemsService,
      help: "Systèmes intelligents (compteurs, capteurs, plateformes…) qui mesurent ce bâtiment (inverse de sg:mesure)",
    },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (b) => (
        <div className="cell-title">
          <div>
            <strong>{b.nom}</strong>
            <small className="muted">{b.adresse ?? "Adresse non renseignée"}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (b) => <Badge tone="info">{humanize(b.type)}</Badge> },
    { key: "consommation", label: "Consommation", sortable: true, align: "right", render: (b) => formatNumber(b.consommation, "kWh") },
    { key: "surface", label: "Surface", sortable: true, align: "right", render: (b) => formatNumber(b.surface, "m²") },
    {
      key: "classeEnergetique",
      label: "Classe éner.",
      sortable: true,
      render: (b) => (b.classeEnergetique ? <span className={`energy-class ec-${b.classeEnergetique}`}>{b.classeEnergetique}</span> : "—"),
    },
    {
      key: "relations",
      label: "Sources connectées",
      render: (b) => <span className="muted">{b.relations.sources.map((s) => s.nom).join(", ") || "—"}</span>,
    },
    { key: "pair", label: "Mesuré par", hint: "sg:estMesurePar", render: (b) => <PairCell refs={b.relations.mesurePar} /> },
    { key: "status", label: "Statut", sortable: true, render: (b) => <StatusBadge status={b.status} /> },
  ],
  statusOptions: [
    { value: "alimente", label: "Alimenté" },
    { value: "non_alimente", label: "Non alimenté" },
  ],
  nlpDomain: "batiments",
  summary: (items) => [
    { label: "Bâtiments", value: String(items.length) },
    { label: "Consommation totale", value: formatNumber(items.reduce((a, b) => a + (b.consommation ?? 0), 0), "kWh") },
    { label: "Alimentés", value: String(items.filter((b) => b.status === "alimente").length) },
    { label: "Occupants", value: formatNumber(items.reduce((a, b) => a + (b.nbOccupants ?? 0), 0)) },
  ],
};

export default function BuildingsPage() {
  return <EntityManager<Building> config={config} />;
}
