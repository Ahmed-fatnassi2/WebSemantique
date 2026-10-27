import { BookOpen, Eraser, History, Pencil, Play, ShieldAlert, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { ResultView } from "../components/sparql/ResultView";
import { SparqlBlock, SparqlEditor } from "../components/sparql/SparqlEditor";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, PageHeader } from "../components/ui/Card";
import { CopyButton } from "../components/ui/CopyButton";
import { ConfirmDialog } from "../components/ui/Modal";
import { BackendRequired, EmptyState, ErrorState, Loader } from "../components/ui/States";
import { Tabs } from "../components/ui/Tabs";
import { useBackend } from "../context/BackendContext";
import { useToast } from "../context/ToastContext";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { sparqlService } from "../services/sparqlService";
import type { QueryType, SparqlResult } from "../types";
import { parseError } from "../utils/errors";
import { timeAgo } from "../utils/format";
import { EXAMPLE_QUERIES, QUERY_TYPE_LABEL, SG_PREFIXES, detectQueryType } from "../utils/sparql";

interface HistoryEntry {
  query: string;
  type: QueryType | null;
  ok: boolean;
  summary: string;
  at: string;
}

const DEFAULT_QUERY = EXAMPLE_QUERIES[0].query;

export default function SparqlConsolePage() {
  const { demo } = useBackend();
  const { notify } = useToast();
  const [query, setQuery] = useLocalStorage("sparql.current", DEFAULT_QUERY);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("sparql.history", []);
  const [result, setResult] = useState<SparqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [side, setSide] = useState<"examples" | "history">("examples");

  const detected = detectQueryType(query);
  const isMutation = detected === "update";

  const record = (entry: Omit<HistoryEntry, "at">) =>
    setHistory((h) => [{ ...entry, at: new Date().toISOString() }, ...h.filter((x) => x.query !== entry.query)].slice(0, 30));

  const execute = async (allowUpdate: boolean) => {
    if (!query.trim()) {
      setError("La requête est vide.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await sparqlService.execute(query, allowUpdate);
      setResult(res);
      const summary =
        res.query_type === "ask"
          ? `ASK → ${res.boolean ? "vrai" : "faux"}`
          : res.query_type === "update"
            ? `${(res.triples_after ?? 0) - (res.triples_before ?? 0)} triplets`
            : `${res.count} ligne(s)`;
      record({ query, type: res.query_type, ok: true, summary });
      if (res.query_type === "update") notify("Mise à jour SPARQL appliquée et enregistrée");
    } catch (err) {
      const info = parseError(err);
      if (info.code === "CONFIRMATION_REQUIRED") {
        // The server detected a mutation the client did not: ask now.
        setConfirmOpen(true);
      } else {
        setError(info.message);
        setResult(null);
        record({ query, type: detected, ok: false, summary: "Erreur" });
      }
    } finally {
      setRunning(false);
    }
  };

  const run = () => {
    if (running) return;
    if (isMutation) setConfirmOpen(true);
    else void execute(false);
  };

  if (demo) {
    return (
      <div className="page">
        <PageHeader title="Console SPARQL" icon={<Terminal size={22} />} description="Interrogez le graphe RDF avec SPARQL 1.1." />
        <BackendRequired feature="La console SPARQL" />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Console SPARQL"
        icon={<Terminal size={22} />}
        description="Interrogez le graphe RDF de l'ontologie SmartGrid avec SPARQL 1.1 (exécuté par RDFLib)."
      />

      <div className="console-layout">
        <div className="stack">
          <Card
            title={
              <span className="row gap-sm">
                Éditeur
                {detected && (
                  <Badge tone={isMutation ? "danger" : "success"} mono>
                    {QUERY_TYPE_LABEL[detected]}
                  </Badge>
                )}
              </span>
            }
            actions={
              <>
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setQuery(SG_PREFIXES + "\n" + query.replace(/^(PREFIX[^\n]*\n)+/i, ""))}>
                  Préfixes
                </Button>
                <CopyButton text={query} />
                <Button variant="ghost" size="sm" icon={<Eraser size={14} />} onClick={() => setQuery(SG_PREFIXES + "\nSELECT * WHERE {\n  ?s ?p ?o\n}\nLIMIT 25")}>
                  Effacer
                </Button>
              </>
            }
          >
            <SparqlEditor value={query} onChange={setQuery} onRun={run} />
            <div className="editor-footer">
              <span className="muted">
                Ctrl + Entrée pour exécuter · préfixe <code className="inline-code">sg:</code> disponible
              </span>
              <Button
                variant={isMutation ? "danger" : "primary"}
                icon={isMutation ? <ShieldAlert size={16} /> : <Play size={16} />}
                onClick={run}
                loading={running}
              >
                {isMutation ? "Exécuter la modification…" : "Exécuter"}
              </Button>
            </div>
            {isMutation && (
              <div className="alert alert-warning">
                <ShieldAlert size={16} />
                <span>
                  Cette requête <strong>modifie le graphe</strong> (INSERT / DELETE…). Une confirmation sera demandée,
                  puis le changement sera enregistré dans le nouveau fichier SmartGrid_new.owl (le fichier OWL original n'est pas modifié).
                </span>
              </div>
            )}
          </Card>

          <Card title="Résultats">
            {running ? (
              <Loader label="Exécution de la requête…" />
            ) : error ? (
              <ErrorState message={error} />
            ) : result ? (
              <ResultView result={result} />
            ) : (
              <EmptyState icon={<Play size={20} />} title="Aucune requête exécutée" message="Écrivez une requête ou choisissez un exemple, puis cliquez sur Exécuter." />
            )}
          </Card>
        </div>

        <Card padded={false} className="console-side">
          <div className="toolbar">
            <Tabs
              active={side}
              onChange={setSide}
              items={[
                { key: "examples", label: "Exemples", icon: <BookOpen size={14} /> },
                { key: "history", label: "Historique", icon: <History size={14} />, count: history.length },
              ]}
            />
          </div>
          {side === "examples" ? (
            <ul className="example-list">
              {EXAMPLE_QUERIES.map((ex) => (
                <li key={ex.title}>
                  <button
                    onClick={() => {
                      setQuery(ex.query);
                      setResult(null);
                      setError(null);
                    }}
                  >
                    <span className="row gap-sm">
                      <strong>{ex.title}</strong>
                      {ex.mutation && <Badge tone="danger">modification</Badge>}
                    </span>
                    <small className="muted">{ex.description}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : history.length === 0 ? (
            <EmptyState icon={<History size={20} />} title="Historique vide" message="Les requêtes exécutées sont conservées dans ce navigateur." />
          ) : (
            <>
              <ul className="example-list">
                {history.map((h, i) => (
                  <li key={i}>
                    <button onClick={() => setQuery(h.query)}>
                      <span className="row gap-sm">
                        {h.type && <Badge tone={h.type === "update" ? "danger" : "info"} mono>{h.type.toUpperCase()}</Badge>}
                        <Badge tone={h.ok ? "success" : "danger"}>{h.summary}</Badge>
                        <small className="muted">{timeAgo(h.at)}</small>
                      </span>
                      <code className="history-query">{h.query.replace(/PREFIX[^\n]*\n/gi, "").trim().slice(0, 140)}</code>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="side-footer">
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setHistory([])}>
                  Vider l'historique
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmer la modification du graphe"
        confirmLabel="Appliquer la modification"
        loading={running}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await execute(true);
          setConfirmOpen(false);
        }}
        message={
          <p>
            Cette requête SPARQL UPDATE va modifier les triplets du graphe. Le changement est enregistré dans SmartGrid_new.owl et visible sur toutes les pages. Vous pourrez revenir au fichier OWL d'origine depuis les Paramètres.
          </p>
        }
      >
        <SparqlBlock query={query} />
      </ConfirmDialog>
    </div>
  );
}
