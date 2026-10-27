import { Car } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import { PairCell } from "../components/entities/PairCell";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { linesService, mobilityService, regulationsService } from "../services/entities";
import type { MobilityItem } from "../types";
import { formatNumber, humanize } from "../utils/format";

const config: EntityConfig<MobilityItem> = {
  key: "mobility",
  singular: "Équipement de mobilité",
  plural: "Mobilité électrique",
  description: "Bornes et stations de recharge, véhicules électriques, parkings intelligents et services V2G (sous-classes de sg:MobiliteElectrique).",
  icon: <Car size={22} />,
  service: mobilityService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher par nom ou connecteur…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Borne 03" },
    { name: "puissanceCharge", label: "Puissance de charge", kind: "integer", unit: "kW", min: 0, help: "Bornes et stations" },
    { name: "tempsChargeMinutes", label: "Temps de charge", kind: "integer", unit: "min", min: 0 },
    { name: "capaciteVehicule", label: "Capacité de batterie", kind: "number", unit: "kWh", min: 0, help: "Véhicules" },
    { name: "tarifKWh", label: "Tarif", kind: "number", unit: "DT/kWh", min: 0 },
    { name: "typeConnecteur", label: "Type de connecteur", kind: "text", placeholder: "Ex. CCS2, Type2" },
    { name: "disponible", label: "Disponible", kind: "boolean" },
  ],
  relations: [
    {
      key: "recharge",
      label: "Véhicules rechargés",
      property: "sg:recharge",
      service: mobilityService,
      families: ["BorneRecharge"],
      help: "Pour une borne de recharge : les véhicules qu'elle recharge (inverse : sg:estRechargePar)",
    },
    {
      key: "raccordeeA",
      label: "Raccordée à la ligne",
      property: "sg:estRaccordeeA",
      service: linesService,
      families: ["BorneRecharge"],
    },
    {
      key: "restitueA",
      label: "Restitue de l'énergie à",
      property: "sg:restitueA",
      service: linesService,
      families: ["VehiculeElectrique"],
      help: "Vehicle-to-Grid : le véhicule réinjecte de l'énergie dans ces lignes",
    },
    {
      key: "reglementations",
      label: "Réglementations applicables",
      property: "sg:sAppliqueA",
      service: regulationsService,
      help: "Normes, lois ou labels qui s'appliquent à cet équipement (« texte sg:sAppliqueA équipement »)",
    },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (m) => (
        <div className="cell-title">
          <div>
            <strong>{m.nom}</strong>
            <small className="mono muted">sg:{m.id}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (m) => <Badge tone="info">{humanize(m.type)}</Badge> },
    { key: "puissanceCharge", label: "Puissance", sortable: true, align: "right", render: (m) => formatNumber(m.puissanceCharge, "kW") },
    { key: "capaciteVehicule", label: "Batterie", sortable: true, align: "right", render: (m) => formatNumber(m.capaciteVehicule, "kWh") },
    { key: "typeConnecteur", label: "Connecteur", sortable: true, render: (m) => m.typeConnecteur ?? "—" },
    {
      key: "relations",
      label: "Liens",
      render: (m) => {
        const links = [
          ...m.relations.recharge.map((x) => `recharge ${x.nom}`),
          ...m.relations.raccordeeA.map((x) => `→ ${x.nom}`),
          ...m.relations.restitueA.map((x) => `V2G → ${x.nom}`),
        ];
        return <span className="muted">{links.join(", ") || "—"}</span>;
      },
    },
    { key: "pair", label: "Réglementations", hint: "sg:sAppliqueA", render: (m) => <PairCell refs={m.relations.reglementations} /> },
    { key: "status", label: "Statut", sortable: true, render: (m) => <StatusBadge status={m.status} /> },
  ],
  statusOptions: [
    { value: "disponible", label: "Disponible" },
    { value: "indisponible", label: "Indisponible" },
  ],
  nlpDomain: "mobilite",
  summary: (items) => [
    { label: "Équipements", value: String(items.length) },
    { label: "Bornes", value: String(items.filter((m) => m.family === "BorneRecharge").length) },
    { label: "Véhicules", value: String(items.filter((m) => m.family === "VehiculeElectrique").length) },
    { label: "Disponibles", value: String(items.filter((m) => m.status === "disponible").length) },
  ],
};

export default function MobilityPage() {
  return <EntityManager<MobilityItem> config={config} />;
}
