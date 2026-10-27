import { Cpu } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { buildingsService, linesService, sourcesService, storageService, systemsService } from "../services/entities";
import type { SmartSystem } from "../types";
import { formatDate, formatNumber, humanize } from "../utils/format";

const config: EntityConfig<SmartSystem> = {
  key: "systems",
  singular: "Système intelligent",
  plural: "Systèmes intelligents",
  description: "Capteurs IoT, compteurs intelligents, plateformes de gestion, modèles de prévision et systèmes d'alerte (sous-classes de sg:SystemeIntelligent).",
  icon: <Cpu size={22} />,
  service: systemsService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher par nom ou protocole…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Capteur 02" },
    { name: "protocole", label: "Protocole", kind: "text", placeholder: "Ex. MQTT, Modbus" },
    { name: "versionLogiciel", label: "Version logicielle", kind: "text", placeholder: "Ex. v2.1" },
    { name: "frequenceMesure", label: "Fréquence de mesure", kind: "integer", unit: "s", min: 0 },
    { name: "precisionMesure", label: "Précision", kind: "number", unit: "%", min: 0, max: 100 },
    { name: "valeurMesuree", label: "Dernière valeur mesurée", kind: "number" },
    { name: "dateInstallation", label: "Date d'installation", kind: "date" },
  ],
  relations: [
    { key: "surveille", label: "Lignes surveillées", property: "sg:surveille", service: linesService, families: ["CapteurIoT"] },
    {
      key: "mesure",
      label: "Bâtiments mesurés",
      property: "sg:mesure",
      service: buildingsService,
      families: ["CompteurIntelligent"],
      help: "Inverse : sg:estMesurePar",
    },
    { key: "gere", label: "Stockages gérés", property: "sg:gere", service: storageService, families: ["PlateformeGestion"] },
    { key: "predit", label: "Production prédite", property: "sg:predit", service: sourcesService, families: ["ModelePrediction"] },
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
    { key: "protocole", label: "Protocole", sortable: true, render: (s) => s.protocole ?? "—" },
    { key: "precisionMesure", label: "Précision", sortable: true, align: "right", render: (s) => formatNumber(s.precisionMesure, "%") },
    { key: "dateInstallation", label: "Installé le", sortable: true, render: (s) => formatDate(s.dateInstallation) },
    {
      key: "relations",
      label: "Cible",
      render: (s) => (
        <span className="muted">
          {[...s.relations.surveille, ...s.relations.mesure, ...s.relations.gere, ...s.relations.predit].map((x) => x.nom).join(", ") || "—"}
        </span>
      ),
    },
    { key: "status", label: "Statut", sortable: true, render: (s) => <StatusBadge status={s.status} /> },
  ],
  statusOptions: [
    { value: "relie", label: "Relié au réseau" },
    { value: "non_relie", label: "Non relié" },
  ],
  summary: (items) => [
    { label: "Systèmes", value: String(items.length) },
    { label: "Capteurs", value: String(items.filter((s) => s.family === "CapteurIoT").length) },
    { label: "Compteurs", value: String(items.filter((s) => s.family === "CompteurIntelligent").length) },
    { label: "Reliés au réseau", value: String(items.filter((s) => s.status === "relie").length) },
  ],
};

export default function SmartSystemsPage() {
  return <EntityManager<SmartSystem> config={config} />;
}
