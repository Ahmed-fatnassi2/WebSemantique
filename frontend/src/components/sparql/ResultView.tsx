import { CheckCircle2, Download, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RdfTerm, SparqlResult } from "../../types";
import { formatNumber, shortUri } from "../../utils/format";
import { EmptyState } from "../ui/States";

const XSD = "http://www.w3.org/2001/XMLSchema#";

function Cell({ term, showUris }: { term: RdfTerm | null; showUris: boolean }) {
  if (!term) return <span className="muted">—</span>;
  if (term.type === "uri") {
    return (
      <span className="rdf-uri" title={term.value}>
        {showUris ? term.value : shortUri(term.value)}
      </span>
    );
  }
  if (term.type === "bnode") return <span className="muted mono">{term.short}</span>;
  const dt = term.datatype?.replace(XSD, "xsd:");
  return (
    <span className="rdf-literal" title={dt ?? undefined}>
      {term.value}
      {term.lang && <span className="rdf-lang">@{term.lang}</span>}
    </span>
  );
}

function toCsv(result: SparqlResult): string {
  const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [result.columns.join(",")];
  for (const row of result.rows) lines.push(result.columns.map((c) => esc(row[c]?.value ?? "")).join(","));
  return lines.join("\n");
}

export function ResultView({ result }: { result: SparqlResult }) {
  const [showUris, setShowUris] = useState(false);

  const csvUrl = useMemo(() => {
    if (result.query_type === "ask" || result.query_type === "update" || result.rows.length === 0) return null;
    return URL.createObjectURL(new Blob([toCsv(result)], { type: "text/csv;charset=utf-8" }));
  }, [result]);
  useEffect(() => () => {
    if (csvUrl) URL.revokeObjectURL(csvUrl);
  }, [csvUrl]);

  if (result.query_type === "ask") {
    return (
      <div className={`ask-result ${result.boolean ? "ask-true" : "ask-false"}`}>
        {result.boolean ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
        <div>
          <strong>{result.boolean ? "VRAI" : "FAUX"}</strong>
          <span>Réponse de la requête ASK · {formatNumber(result.duration_ms)} ms</span>
        </div>
      </div>
    );
  }

  if (result.query_type === "update") {
    const delta = (result.triples_after ?? 0) - (result.triples_before ?? 0);
    return (
      <div className="ask-result ask-true">
        <CheckCircle2 size={28} />
        <div>
          <strong>Mise à jour appliquée</strong>
          <span>
            {formatNumber(result.triples_before)} → {formatNumber(result.triples_after)} triplets (
            {delta >= 0 ? "+" : ""}
            {delta}) · enregistré dans SmartGrid_new.owl · {formatNumber(result.duration_ms)} ms
          </span>
        </div>
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        title="Aucun résultat"
        message="La requête est valide mais ne correspond à aucun triplet du graphe."
      />
    );
  }

  return (
    <div className="result-view">
      <div className="result-toolbar">
        <span className="muted">
          {result.count} ligne{result.count > 1 ? "s" : ""} · {formatNumber(result.duration_ms)} ms
          {result.truncated && " · résultats tronqués"}
        </span>
        <div className="row gap-sm">
          <label className="checkbox">
            <input type="checkbox" checked={showUris} onChange={(e) => setShowUris(e.target.checked)} />
            URI complètes
          </label>
          {csvUrl && (
            <a className="btn btn-ghost btn-sm" href={csvUrl} download="resultats-sparql.csv">
              <Download size={14} />
              <span>CSV</span>
            </a>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th className="col-index">#</th>
              {result.columns.map((c) => (
                <th key={c} className="mono">
                  ?{c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                <td className="col-index muted">{i + 1}</td>
                {result.columns.map((c) => (
                  <td key={c}>
                    <Cell term={row[c]} showUris={showUris} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
