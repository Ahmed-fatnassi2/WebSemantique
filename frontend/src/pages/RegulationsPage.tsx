import { Scale } from "lucide-react";
import { EntityManager } from "../components/entities/EntityManager";
import type { EntityConfig } from "../components/entities/types";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { buildingsService, mobilityService, regulationsService, sourcesService } from "../services/entities";
import type { Regulation } from "../types";
import { formatDate, formatNumber, humanize } from "../utils/format";

const config: EntityConfig<Regulation> = {
  key: "regulations",
  singular: "Texte réglementaire",
  plural: "Réglementation",
  description: "Lois, directives, normes, labels, certifications et subventions qui encadrent le réseau (sous-classes de sg:Reglementation).",
  icon: <Scale size={22} />,
  service: regulationsService,
  defaultSort: "nom",
  searchPlaceholder: "Rechercher par nom, référence ou organisme…",
  fields: [
    { name: "nom", label: "Nom", kind: "text", required: true, placeholder: "Ex. Norme ISO 01" },
    { name: "reference", label: "Référence", kind: "text", placeholder: "Ex. IEC 61851" },
    { name: "organisme", label: "Organisme", kind: "text", placeholder: "Ex. ANME, IEC" },
    { name: "dateEntreeVigueur", label: "Entrée en vigueur", kind: "date" },
    { name: "dureeValiditeAnnees", label: "Durée de validité", kind: "integer", unit: "ans", min: 0 },
    { name: "montantAide", label: "Montant de l'aide", kind: "number", unit: "DT", min: 0, help: "Subventions et crédits d'impôt" },
    { name: "obligatoire", label: "Obligatoire", kind: "boolean" },
  ],
  relations: [
    { key: "encadre", label: "Sources encadrées", property: "sg:encadre", service: sourcesService, help: "Inverse : sg:estEncadreePar" },
    { key: "certifie", label: "Bâtiments certifiés", property: "sg:certifie", service: buildingsService, help: "Inverse : sg:estCertifiePar" },
    { key: "sAppliqueA", label: "S'applique à (mobilité)", property: "sg:sAppliqueA", service: mobilityService },
  ],
  columns: [
    {
      key: "nom",
      label: "Nom",
      sortable: true,
      render: (r) => (
        <div className="cell-title">
          <div>
            <strong>{r.nom}</strong>
            <small className="muted">{r.reference ?? "Sans référence"}</small>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Classe", sortable: true, render: (r) => <Badge tone="info">{humanize(r.type)}</Badge> },
    { key: "organisme", label: "Organisme", sortable: true, render: (r) => r.organisme ?? "—" },
    { key: "dateEntreeVigueur", label: "En vigueur depuis", sortable: true, render: (r) => formatDate(r.dateEntreeVigueur) },
    { key: "dureeValiditeAnnees", label: "Validité", sortable: true, align: "right", render: (r) => formatNumber(r.dureeValiditeAnnees, "ans") },
    {
      key: "relations",
      label: "Concerne",
      render: (r) => (
        <span className="muted">
          {[...r.relations.encadre, ...r.relations.certifie, ...r.relations.sAppliqueA].map((x) => x.nom).join(", ") || "—"}
        </span>
      ),
    },
    { key: "status", label: "Statut", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
  ],
  statusOptions: [
    { value: "obligatoire", label: "Obligatoire" },
    { value: "facultatif", label: "Facultatif" },
  ],
  summary: (items) => [
    { label: "Textes", value: String(items.length) },
    { label: "Obligatoires", value: String(items.filter((r) => r.status === "obligatoire").length) },
    { label: "Subventions", value: formatNumber(items.reduce((a, r) => a + (r.montantAide ?? 0), 0), "DT") },
    { label: "Organismes", value: String(new Set(items.map((r) => r.organisme).filter(Boolean)).size) },
  ],
};

export default function RegulationsPage() {
  return <EntityManager<Regulation> config={config} />;
}
