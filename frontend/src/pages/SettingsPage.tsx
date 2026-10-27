import { Database, FileCode2, Info, RefreshCw, RotateCcw, Server, Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, PageHeader } from "../components/ui/Card";
import { CopyButton } from "../components/ui/CopyButton";
import { ConfirmDialog } from "../components/ui/Modal";
import { ErrorState, Loader } from "../components/ui/States";
import { useBackend } from "../context/BackendContext";
import { useToast } from "../context/ToastContext";
import { useAsync } from "../hooks/useAsync";
import { API_BASE_URL } from "../services/api";
import { systemService } from "../services/systemService";
import { errorMessage } from "../utils/errors";
import { formatDateTime, formatNumber } from "../utils/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const backend = useBackend();
  const { notify } = useToast();
  const info = useAsync(() => (backend.demo ? Promise.resolve(null) : systemService.info()), [backend.version, backend.demo]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      const res = await systemService.reset();
      notify(`Graphe rechargé depuis le fichier OWL (${res.triples} triplets)`);
      setConfirmReset(false);
      await backend.retry();
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setResetting(false);
    }
  };

  const statusBadge =
    backend.status === "online" ? (
      <Badge tone="success">
        <span className="dot" />
        Connecté
      </Badge>
    ) : backend.status === "checking" ? (
      <Badge tone="neutral">Vérification…</Badge>
    ) : (
      <Badge tone="danger">
        <span className="dot" />
        Injoignable
      </Badge>
    );

  return (
    <div className="page">
      <PageHeader title="Paramètres" icon={<Settings size={22} />} description="Informations sur l'application, la connexion au backend et l'ontologie chargée." />

      <div className="grid-2">
        <Card title={<span className="row gap-sm"><Server size={16} /> Connexion au backend</span>} actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void backend.retry()} loading={backend.status === "checking"}>
            Tester
          </Button>
        }>
          <dl className="settings-list">
            <Row label="Statut">{statusBadge}</Row>
            <Row label="URL de l'API">
              <span className="row gap-sm">
                <code className="inline-code">{API_BASE_URL}</code>
                <CopyButton text={API_BASE_URL} />
              </span>
            </Row>
            <Row label="Variable d'environnement">
              <code className="inline-code">VITE_API_BASE_URL</code>
            </Row>
            <Row label="Dernière vérification">{backend.lastChecked ? formatDateTime(backend.lastChecked.toISOString()) : "—"}</Row>
            <Row label="Mode démo">
              {backend.demo ? (
                <Badge tone="warning">Actif : données fictives, modifications désactivées</Badge>
              ) : (
                <Badge tone="success">Inactif : données réelles de l'ontologie</Badge>
              )}
            </Row>
          </dl>
          {backend.demo && (
            <p className="muted small">
              Le mode démo s'active automatiquement quand le backend est injoignable et se désactive dès qu'il répond
              (vérification toutes les 20 secondes).
            </p>
          )}
        </Card>

        <Card title={<span className="row gap-sm"><Info size={16} /> Application</span>}>
          <dl className="settings-list">
            <Row label="Nom">SmartGrid Semantic</Row>
            <Row label="Frontend">React 18 · TypeScript · Vite · React Router · Recharts · React Flow</Row>
            <Row label="Backend">{info.data ? `${info.data.app} v${info.data.version}` : "FastAPI · RDFLib"}</Row>
            <Row label="Langue">Français</Row>
          </dl>
        </Card>
      </div>

      {backend.demo ? null : info.error ? (
        <ErrorState message={info.error} onRetry={info.reload} />
      ) : !info.data ? (
        <Loader />
      ) : (
        <div className="grid-2">
          <Card title={<span className="row gap-sm"><FileCode2 size={16} /> Ontologie</span>} actions={
            <Button variant="danger" size="sm" icon={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)} disabled={!info.data.working_copy_exists}>
              Réinitialiser
            </Button>
          }>
            <dl className="settings-list">
              <Row label="Titre">{info.data.ontology.label}</Row>
              <Row label="IRI"><code className="inline-code">{info.data.ontology.iri}</code></Row>
              <Row label="Fichier OWL">{info.data.ontology_file}</Row>
              <Row label="Source chargée">
                {info.data.loaded_from === "working_copy" ? (
                  <Badge tone="warning">SmartGrid_new.owl (avec vos modifications)</Badge>
                ) : (
                  <Badge tone="success">Fichier OWL original</Badge>
                )}
              </Row>
              <Row label="Fichier des modifications"><code className="inline-code small">{info.data.working_copy}</code></Row>
              <Row label="Chargé le">{formatDateTime(info.data.loaded_at)}</Row>
              <Row label="Contenu">
                {formatNumber(info.data.ontology.triples)} triplets · {info.data.ontology.classes} classes ·{" "}
                {info.data.ontology.object_properties + info.data.ontology.data_properties} propriétés · {info.data.ontology.individuals} individus
              </Row>
            </dl>
            <p className="muted small">
              Le fichier OWL d'origine n'est jamais modifié. Les créations, modifications et requêtes UPDATE sont
              enregistrées dans le nouveau fichier SmartGrid_new.owl (RDF/XML, ouvrable dans Protégé). « Réinitialiser » le supprime et recharge le fichier OWL d'origine.
            </p>
          </Card>

          <Card title={<span className="row gap-sm"><Sparkles size={16} /> Assistant NLP & SPARQL</span>}>
            <dl className="settings-list">
              <Row label="Analyse linguistique">
                <Badge tone="info">spaCy · {info.data.nlp.spacy_model}</Badge>
              </Row>
              <Row label="Normalisation">{info.data.nlp.normalisation}</Row>
              <Row label="Classifieur d'intention">{info.data.nlp.classifier}</Row>
              {info.data.nlp.domains.map((d) => (
                <Row key={d.key} label={`Assistant « ${d.label} »`}>
                  {d.training_examples} questions d'entraînement
                  {d.cv_accuracy !== null ? (
                    <> · validation croisée (5 plis) : <strong>{(d.cv_accuracy * 100).toFixed(1)} %</strong></>
                  ) : (
                    <span className="muted"> · évaluation en cours…</span>
                  )}
                </Row>
              ))}
              <Row label="API de LLM">Aucune : tout le traitement est local</Row>
              <Row label="Requêtes générées">Lecture seule : SELECT et ASK</Row>
              <Row label="Moteur SPARQL"><span className="row gap-sm"><Database size={14} /> RDFLib (SPARQL 1.1)</span></Row>
              <Row label="Lignes max. par requête">{formatNumber(info.data.sparql_max_rows)}</Row>
            </dl>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Réinitialiser l'ontologie ?"
        confirmLabel="Réinitialiser"
        loading={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={reset}
        message={<p>Toutes les modifications (CRUD et SPARQL UPDATE) seront perdues et le graphe sera rechargé depuis le fichier OWL d'origine.</p>}
      />
    </div>
  );
}
