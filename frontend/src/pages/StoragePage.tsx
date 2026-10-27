import { BatteryCharging } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import type { EntityConfig } from "../components/entities/types";
import { Badge, Gauge, StatusBadge } from "../components/ui/Badge";
import { sourcesService, storageService } from "../services/entities";
import type { StorageSystem } from "../types";
import { formatNumber, humanize } from "../utils/format";

const config: EntityConfig<StorageSystem> = {
  key: "storage",
  singular: "Système de stockage",
  plural: "Stockage d'énergie",
  description: "Batteries, stockage hydraulique, hydrogène, supercondensateurs et volants d'inertie (sous-classes de sg:Stockage).",
  icon: <BatteryCharging size={22} />,
  service: storageService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher un système de stockage…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Batterie 02" },
    { name: "capacite", label: "Capacité", kind: "number", unit: "kWh", required: true, min: 0 },
    { name: "tauxCharge", label: "Taux de charge", kind: "number", unit: "%", required: true, min: 0, max: 100 },
    { name: "puissanceStockage", label: "Puissance", kind: "integer", unit: "kW", min: 0 },
    { name: "rendementStockage", label: "Rendement", kind: "number", unit: "%", min: 0, max: 100 },
    { name: "tempsRechargeHeures", label: "Temps de recharge", kind: "number", unit: "h", min: 0 },
    { name: "dureeVieAnnees", label: "Durée de vie", kind: "integer", unit: "ans", min: 0 },
  ],
  relations: [
    { key: "stocke", label: "Sources stockées", property: "sg:stocke", service: sourcesService, help: "Sources dont ce système stocke l'énergie" },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (s) => (
        <div className="cell-title">
          <div>
            <strong>{s.nom}</strong>
            <small className="mono muted">sg:{s.id}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (s) => <Badge tone="info">{humanize(s.type)}</Badge> },
    { key: "capacite", label: "Capacité", sortable: true, align: "right", render: (s) => formatNumber(s.capacite, "kWh") },
    { key: "tauxCharge", label: "Charge", sortable: true, render: (s) => <Gauge value={s.tauxCharge} /> },
    { key: "puissanceStockage", label: "Puissance", sortable: true, align: "right", render: (s) => formatNumber(s.puissanceStockage, "kW") },
    {
      key: "relations",
      label: "Stocke",
      render: (s) => <span className="muted">{s.relations.stocke.map((x) => x.nom).join(", ") || "—"}</span>,
    },
    { key: "status", label: "Niveau", sortable: true, render: (s) => <StatusBadge status={s.status} /> },
  ],
  statusOptions: [
    { value: "faible", label: "Charge faible (< 20 %)" },
    { value: "moyen", label: "Charge moyenne (20–60 %)" },
    { value: "eleve", label: "Charge élevée (≥ 60 %)" },
  ],
  summary: (items) => {
    const charges = items.map((s) => s.tauxCharge).filter((c): c is number => c !== null);
    return [
      { label: "Systèmes", value: String(items.length) },
      { label: "Capacité totale", value: formatNumber(items.reduce((a, s) => a + (s.capacite ?? 0), 0), "kWh") },
      { label: "Charge moyenne", value: charges.length ? formatNumber(charges.reduce((a, b) => a + b, 0) / charges.length, "%") : "—" },
      { label: "Charge faible", value: String(items.filter((s) => s.status === "faible").length) },
    ];
  },
};

export default function StoragePage() {
  return <EntityManager<StorageSystem> config={config} />;
}
