import type { ReactNode } from "react";
import type { BaseEntity, EntityKey, NlpDomainKey } from "../../types";
import type { EntityService } from "../../services/entityService";

export interface FieldConfig {
  name: string;
  label: string;
  kind: "text" | "number" | "integer" | "boolean" | "select" | "date";
  unit?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  placeholder?: string;
  help?: string;
}

export interface RelationConfig {
  key: string;
  label: string;
  /** Ontology property shown to the user, e.g. "sg:alimente". */
  property: string;
  service: EntityService<BaseEntity>;
  help?: string;
  /** Only for these second-level classes (rdfs:domain of the property), e.g. ["BorneRecharge"]. */
  families?: string[];
  /** Only propose targets of these second-level classes (rdfs:range), e.g. ["CompteurIntelligent"]. */
  optionFamilies?: string[];
}

export interface ColumnConfig<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "right";
  render: (item: T) => ReactNode;
  /** Small text under the title, e.g. the OWL property of a relation column. */
  hint?: string;
}

export interface EntityConfig<T extends BaseEntity> {
  key: EntityKey;
  singular: string;
  plural: string;
  description: string;
  icon: ReactNode;
  service: EntityService<T>;
  fields: FieldConfig[];
  relations: RelationConfig[];
  columns: ColumnConfig<T>[];
  statusOptions: { value: string; label: string }[];
  defaultSort: string;
  searchPlaceholder: string;
  /** Small KPI strip computed from the full list. */
  summary?: (items: T[]) => { label: string; value: string }[];
  /** NLP assistant of this page ("Demander en français" box under the table). */
  nlpDomain?: NlpDomainKey;
}
