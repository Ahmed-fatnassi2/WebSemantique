import { AlertTriangle, Brain, Cpu, ExternalLink, Microscope } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { NlpAnalysis, NlpResponse } from "../../types";
import { formatNumber, humanize } from "../../utils/format";
import { ResultView } from "../sparql/ResultView";
import { SparqlBlock } from "../sparql/SparqlEditor";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CopyButton } from "../ui/CopyButton";
import { EmptyState } from "../ui/States";

const ENTITY_TONES: Record<string, "info" | "success" | "warning" | "neutral" | "danger"> = {
  classe: "info",
  individu: "success",
  propriete: "warning",
  comparateur: "neutral",
  valeur: "neutral",
  unite: "neutral",
  relation: "danger",
  statut: "success",
  agregation: "info",
  superlatif: "info",
};

const POS_LABELS: Record<string, string> = {
  NOUN: "nom", VERB: "verbe", ADJ: "adjectif", DET: "déterminant", ADP: "préposition", ADV: "adverbe",
  PRON: "pronom", PROPN: "nom propre", NUM: "nombre", AUX: "auxiliaire", PUNCT: "ponctuation", CCONJ: "conjonction",
  SCONJ: "subordonnant",
};

/** What the spaCy pipeline computed: tokens, classifier scores, coherence rules. */
function AnalysisPanel({ a }: { a: NlpAnalysis }) {
  return (
    <details className="analysis">
      <summary>
        <Microscope size={14} />
        Analyse linguistique (spaCy)
      </summary>
      <div className="analysis-body">
        <h5>1. Tokens, lemmes et étiquettes (spaCy fr_core_news_sm)</h5>
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Token</th>
                <th>Lemme</th>
                <th>Catégorie</th>
                <th>Dépendance</th>
                <th>Forme normalisée</th>
              </tr>
            </thead>
            <tbody>
              {a.tokens.map((t, i) => (
                <tr key={i}>
                  <td><strong>{t.text}</strong></td>
                  <td className="mono">{t.lemma}</td>
                  <td>
                    <span className="mono">{t.pos}</span> <small className="muted">{POS_LABELS[t.pos] ?? ""}</small>
                  </td>
                  <td className="mono muted">
                    {t.dep} → {t.head}
                  </td>
                  <td className="mono">{t.norm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Forme normalisée = lemme spaCy sans accents, puis règles de suffixes (pluriel, féminin, terminaisons verbales).
          Elle sert à reconnaître les termes de l'ontologie avec les PhraseMatchers spaCy.
        </p>

        <h5>2. Entrée du classifieur d'intention</h5>
        <code className="uri-line">{a.delexicalised}</code>
        <p className="muted small">
          Les mots de l'ontologie et les indices de la question sont remplacés par des étiquettes (CLASSE, PROPRIETE,
          COMPARATEUR, SUPERLATIF…) : le classifieur apprend la forme de la question, pas le vocabulaire.
        </p>

        <h5>3. Probabilités du classifieur (spaCy TextCategorizer)</h5>
        <ul className="score-list">
          {a.classifier.map((c) => (
            <li key={c.intent}>
              <span>{c.label}</span>
              <div className="score-track">
                <div className="score-fill" style={{ width: `${Math.max(2, c.score * 100)}%` }} />
              </div>
              <strong className="num">{(c.score * 100).toFixed(1)} %</strong>
            </li>
          ))}
        </ul>

        {a.rules.length > 0 && (
          <>
            <h5>4. Règles de cohérence appliquées</h5>
            <ul className="how-list">
              {a.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

/** One-sentence French summary of the result, built from the returned rows. */
function answerSummary(r: NlpResponse): string | null {
  const res = r.result;
  if (!res) return null;
  if (res.query_type === "ask") return res.boolean ? "Oui." : "Non.";
  if (res.count === 0) return null;
  const countCol = res.columns.find((c) => /nombre|count|total|moyenne|maximum|minimum/i.test(c));
  if (res.count === 1 && countCol) return `Résultat : ${res.rows[0][countCol]?.value ?? "—"}.`;
  const nameCol = res.columns.find((c) => /^nom/i.test(c)) ?? res.columns[0];
  const names = [...new Set(res.rows.map((row) => row[nameCol]?.short).filter(Boolean))] as string[];
  const shown = names.slice(0, 6).join(", ");
  return `${res.count} résultat${res.count > 1 ? "s" : ""} : ${shown}${names.length > 6 ? "…" : ""}.`;
}

/** Full answer of an NLP assistant: intent, entities, analysis, SPARQL and results. */
export function AnswerCard({ r }: { r: NlpResponse }) {
  const navigate = useNavigate();
  const summary = answerSummary(r);

  const openConsole = (q: string) => {
    try {
      window.localStorage.setItem("sparql.current", JSON.stringify(q));
    } catch {
      /* ignore */
    }
    navigate("/sparql");
  };

  return (
    <div className="answer">
      <div className="answer-meta">
        <Badge tone="info">
          <Cpu size={12} />
          spaCy · {r.domain_label}
        </Badge>
        {r.intent && (
          <Badge tone="success">
            <Brain size={12} />
            Intention : {r.intent_label ?? r.intent}
            {r.analysis?.classifier[0] && r.analysis.classifier[0].intent === r.intent && (
              <> ({(r.analysis.classifier[0].score * 100).toFixed(0)} %)</>
            )}
          </Badge>
        )}
        {r.duration_ms !== undefined && <span className="muted">{formatNumber(r.duration_ms)} ms</span>}
      </div>

      {r.warnings.map((w, i) => (
        <div key={i} className="alert alert-warning">
          <AlertTriangle size={16} />
          <span>{w}</span>
        </div>
      ))}

      {summary && <p className="answer-summary">{summary}</p>}
      {r.explanation && <p className="muted">{r.explanation}</p>}

      <div className="answer-section">
        <h4>Entités extraites</h4>
        {r.entities.length === 0 ? (
          <span className="muted">Aucune entité reconnue.</span>
        ) : (
          <div className="chips">
            {r.entities.map((e, i) => (
              <span key={i} className={`entity-chip badge badge-${ENTITY_TONES[e.type] ?? "neutral"}`} title={`« ${e.text} »`}>
                <small>{e.type}</small>
                <strong className="mono">{e.type === "classe" ? humanize(e.value) : e.value}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {r.analysis && <AnalysisPanel a={r.analysis} />}

      {r.sparql && (
        <div className="answer-section">
          <div className="row space-between">
            <h4>Requête SPARQL générée</h4>
            <div className="row gap-sm">
              <CopyButton text={r.sparql} label="Copier la requête" />
              <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => openConsole(r.sparql!)}>
                Ouvrir dans la console
              </Button>
            </div>
          </div>
          <SparqlBlock query={r.sparql} />
        </div>
      )}

      {(r.sparql || r.error) && (
        <div className="answer-section">
          <h4>Résultats</h4>
          {r.error ? (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>{r.error}</span>
            </div>
          ) : r.result ? (
            r.result.count === 0 && r.result.query_type === "select" ? (
              <EmptyState
                title="Aucun résultat dans l'ontologie"
                message="La requête est valide, mais aucun individu du graphe ne correspond. Essayez un autre seuil ou une autre classe."
              />
            ) : (
              <ResultView result={r.result} />
            )
          ) : (
            <span className="muted">Aucune requête exécutée pour cette question.</span>
          )}
        </div>
      )}
    </div>
  );
}
