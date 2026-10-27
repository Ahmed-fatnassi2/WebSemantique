import type { QueryType } from "../types";

export const SG_PREFIXES = `PREFIX sg: <http://www.esprit.tn/ontologies/smartgrid#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

const MUTATION_RE = /\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY)\b/i;

/** Remove comments, IRIs and string literals, so keywords inside them are ignored. */
function stripNoise(query: string): string {
  return query
    .replace(/<[^>\s]*>/g, "<>")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/#[^\n]*/g, "");
}

/** Client-side hint only. The backend decides and refuses unconfirmed updates. */
export function detectQueryType(query: string): QueryType | null {
  const q = stripNoise(query);
  if (MUTATION_RE.test(q)) return "update";
  const m = q.match(/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i);
  return m ? (m[1].toLowerCase() as QueryType) : null;
}

export const QUERY_TYPE_LABEL: Record<QueryType, string> = {
  select: "SELECT · lecture",
  ask: "ASK · lecture",
  construct: "CONSTRUCT · lecture",
  describe: "DESCRIBE · lecture",
  update: "UPDATE · modification",
};

// ------------------------------------------------------------ highlighting

const KEYWORDS =
  "SELECT|DISTINCT|REDUCED|WHERE|FILTER|OPTIONAL|UNION|MINUS|GRAPH|SERVICE|BIND|VALUES|AS|ORDER|BY|ASC|DESC|LIMIT|OFFSET|GROUP|HAVING|PREFIX|BASE|ASK|CONSTRUCT|DESCRIBE|INSERT|DELETE|DATA|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY|WITH|USING|NAMED|INTO|COUNT|SUM|AVG|MIN|MAX|SAMPLE|GROUP_CONCAT|STR|LANG|DATATYPE|BOUND|IF|COALESCE|REGEX|CONTAINS|STRSTARTS|STRENDS|LCASE|UCASE|NOT|EXISTS|IN|a";

const TOKEN_RE = new RegExp(
  [
    "(#[^\\n]*)", // 1 comment
    "(<[^>\\s]*>)", // 2 IRI
    "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')", // 3 string
    "([?$][A-Za-z_][\\w]*)", // 4 variable
    `\\b(${KEYWORDS})\\b`, // 5 keyword
    "([A-Za-z][\\w-]*:[\\w-]*)", // 6 prefixed name
    "(\\b\\d+(?:\\.\\d+)?\\b)", // 7 number
  ].join("|"),
  "gi",
);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function highlightSparql(query: string): string {
  let out = "";
  let last = 0;
  for (const m of query.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    out += escapeHtml(query.slice(last, idx));
    const cls = m[1] ? "tk-comment" : m[2] ? "tk-iri" : m[3] ? "tk-string" : m[4] ? "tk-var" : m[5] ? "tk-kw" : m[6] ? "tk-pname" : "tk-num";
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
    last = idx + m[0].length;
  }
  out += escapeHtml(query.slice(last));
  return out + "\n";
}

// ---------------------------------------------------------------- examples

export interface ExampleQuery {
  title: string;
  description: string;
  query: string;
  mutation?: boolean;
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    title: "Sources et puissance",
    description: "Toutes les sources de production avec leur type et puissance",
    query: `${SG_PREFIXES}
SELECT ?source ?nom ?type ?puissance WHERE {
  ?source a/rdfs:subClassOf* sg:SourceProduction ;
          a ?type ;
          sg:puissance ?puissance .
  ?type rdfs:subClassOf* sg:SourceProduction .
  OPTIONAL { ?source sg:nom ?nom }
}
ORDER BY DESC(?puissance)`,
  },
  {
    title: "Qui alimente quoi ?",
    description: "Relations sg:alimente entre sources et bâtiments",
    query: `${SG_PREFIXES}
SELECT ?nomSource ?nomBatiment ?consommation WHERE {
  { ?source sg:alimente ?bat } UNION { ?bat sg:estAlimentePar ?source }
  ?source sg:nom ?nomSource .
  ?bat sg:nom ?nomBatiment .
  OPTIONAL { ?bat sg:consommation ?consommation }
}`,
  },
  {
    title: "Hiérarchie des classes",
    description: "Classes OWL et leur super-classe directe",
    query: `${SG_PREFIXES}
SELECT ?classe ?parent WHERE {
  ?classe a owl:Class .
  OPTIONAL { ?classe rdfs:subClassOf ?parent }
}
ORDER BY ?parent ?classe`,
  },
  {
    title: "Batteries peu chargées",
    description: "Systèmes de stockage avec une charge inférieure à 70 %",
    query: `${SG_PREFIXES}
SELECT ?stockage ?nom ?charge ?capacite WHERE {
  ?stockage a/rdfs:subClassOf* sg:Stockage ;
            sg:tauxCharge ?charge ;
            sg:capacite ?capacite .
  OPTIONAL { ?stockage sg:nom ?nom }
  FILTER(?charge < 70)
}
ORDER BY ?charge`,
  },
  {
    title: "Consommation par famille",
    description: "Agrégation : consommation totale par type de bâtiment",
    query: `${SG_PREFIXES}
SELECT ?type (COUNT(?b) AS ?nombre) (SUM(?c) AS ?consommationTotale) WHERE {
  ?b a ?type ; sg:consommation ?c .
  ?type rdfs:subClassOf* sg:Batiment .
}
GROUP BY ?type
ORDER BY DESC(?consommationTotale)`,
  },
  {
    title: "Une source dépasse-t-elle 1 MW ?",
    description: "Requête ASK (réponse booléenne)",
    query: `${SG_PREFIXES}
ASK {
  ?s a/rdfs:subClassOf* sg:SourceProduction ;
     sg:puissance ?p .
  FILTER(?p > 1000)
}`,
  },
  {
    title: "Propriétés objet (domaine / portée)",
    description: "Schéma OWL : ObjectProperties avec domain et range",
    query: `${SG_PREFIXES}
SELECT ?propriete ?domaine ?portee WHERE {
  ?propriete a owl:ObjectProperty .
  OPTIONAL { ?propriete rdfs:domain ?domaine }
  OPTIONAL { ?propriete rdfs:range ?portee }
}
ORDER BY ?propriete`,
  },
  {
    title: "Mettre une ligne hors service",
    description: "Exemple de modification (DELETE/INSERT) — confirmation requise",
    mutation: true,
    query: `${SG_PREFIXES}
DELETE { sg:Ligne_03 sg:etatLigne ?ancien }
INSERT { sg:Ligne_03 sg:etatLigne "Hors service"^^xsd:string }
WHERE  { OPTIONAL { sg:Ligne_03 sg:etatLigne ?ancien } }`,
  },
];
