import type { NlpDomainKey } from "../types";

/** The three NLP assistants: one per domain, each linked to its CRUD page. */
export const NLP_DOMAINS: { key: NlpDomainKey; label: string; path: string; placeholder: string }[] = [
  {
    key: "sources",
    label: "Sources de production",
    path: "/sources",
    placeholder: "Ex. Quelles centrales solaires produisent plus de 100 kW ?",
  },
  {
    key: "batiments",
    label: "Bâtiments",
    path: "/buildings",
    placeholder: "Ex. Quels bâtiments consomment plus de 300 kWh ?",
  },
  {
    key: "lignes",
    label: "Lignes de transport",
    path: "/lines",
    placeholder: "Ex. Quelles lignes mesurent plus de 50 km ?",
  },
  {
    key: "mobilite",
    label: "Mobilité électrique",
    path: "/mobility",
    placeholder: "Ex. Quelles bornes ont une puissance supérieure à 50 kW ?",
  },
];

export function isNlpDomain(value: string | null): value is NlpDomainKey {
  return NLP_DOMAINS.some((d) => d.key === value);
}

export function nlpDomain(key: NlpDomainKey) {
  return NLP_DOMAINS.find((d) => d.key === key)!;
}
