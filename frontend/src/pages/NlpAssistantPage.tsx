import { AlertTriangle, Bot, Building2, Cable, CloudSun, Lightbulb, SendHorizontal, Sparkles, Sun, Trash2, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnswerCard } from "../components/nlp/NlpAnswer";
import { Button } from "../components/ui/Button";
import { Card, PageHeader } from "../components/ui/Card";
import { BackendRequired, Loader } from "../components/ui/States";
import { Tabs } from "../components/ui/Tabs";
import { useBackend } from "../context/BackendContext";
import { useAsync } from "../hooks/useAsync";
import { nlpService } from "../services/nlpService";
import type { NlpDomainKey, NlpResponse } from "../types";
import { errorMessage } from "../utils/errors";
import { isNlpDomain, NLP_DOMAINS, nlpDomain } from "../utils/nlpDomains";

const ICONS: Record<NlpDomainKey, React.ReactNode> = {
  sources: <Sun size={15} />,
  batiments: <Building2 size={15} />,
  lignes: <Cable size={15} />,
  meteo: <CloudSun size={15} />,
};

interface Turn {
  id: number;
  question: string;
  pending: boolean;
  response?: NlpResponse;
  networkError?: string;
}

type Conversations = Record<NlpDomainKey, Turn[]>;

export default function NlpAssistantPage() {
  const { demo } = useBackend();
  const [params, setParams] = useSearchParams();
  const param = params.get("domain");
  const domain: NlpDomainKey = isNlpDomain(param) ? param : "sources";
  const meta = nlpDomain(domain);

  const info = useAsync(() => (demo ? Promise.resolve(null) : nlpService.info()), [demo]);
  const domainInfo = info.data?.domains.find((d) => d.key === domain);

  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<Conversations>({
    sources: [],
    batiments: [],
    lignes: [],
    meteo: [],
  });
  const turns = conversations[domain];
  const endRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.pending);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const setTurns = (d: NlpDomainKey, update: (turns: Turn[]) => Turn[]) =>
    setConversations((c) => ({ ...c, [d]: update(c[d]) }));

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const id = Date.now();
    const d = domain;
    setTurns(d, (t) => [...t, { id, question: text, pending: true }]);
    setQuestion("");
    try {
      const response = await nlpService.ask(text, d);
      setTurns(d, (t) => t.map((x) => (x.id === id ? { ...x, pending: false, response } : x)));
    } catch (err) {
      setTurns(d, (t) => t.map((x) => (x.id === id ? { ...x, pending: false, networkError: errorMessage(err) } : x)));
    }
  };

  if (demo) {
    return (
      <div className="page">
        <PageHeader title="Assistant NLP" icon={<Bot size={22} />} description="Posez vos questions en français sur le réseau." />
        <BackendRequired feature="L'assistant NLP" />
      </div>
    );
  }

  const examples = domainInfo?.examples ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Assistant NLP"
        icon={<Bot size={22} />}
        description="Quatre assistants spaCy, un par domaine : posez une question en français, l'assistant détecte l'intention et les entités, génère une requête SPARQL et l'exécute sur l'ontologie."
        actions={
          turns.length > 0 && (
            <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setTurns(domain, () => [])} disabled={busy}>
              Effacer la conversation
            </Button>
          )
        }
      />

      <Tabs
        items={NLP_DOMAINS.map((d) => ({
          key: d.key,
          label: d.label,
          icon: ICONS[d.key],
          count: conversations[d.key].length || undefined,
        }))}
        active={domain}
        onChange={(key) => setParams({ domain: key }, { replace: true })}
      />

      <div className="assistant-layout">
        <Card className="chat-card" padded={false}>
          <div className="chat-scroll">
            {turns.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">{ICONS[domain]}</div>
                <h3>Assistant « {meta.label} »</h3>
                <p className="muted">Choisissez un exemple ou écrivez votre propre question sur ce domaine.</p>
                <div className="example-chips">
                  {examples.slice(0, 4).map((ex) => (
                    <button key={ex} className="example-chip" onClick={() => ask(ex)}>
                      « {ex} »
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t) => (
                <div key={t.id} className="turn">
                  <div className="bubble bubble-user">
                    <User size={16} />
                    <span>{t.question}</span>
                  </div>
                  <div className="bubble bubble-bot">
                    <div className="bot-avatar">
                      <Bot size={16} />
                    </div>
                    {t.pending ? (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                        <em className="muted">Analyse de la question et génération de la requête…</em>
                      </div>
                    ) : t.networkError ? (
                      <div className="alert alert-danger">
                        <AlertTriangle size={16} />
                        <span>{t.networkError}</span>
                        <Button variant="ghost" size="sm" onClick={() => ask(t.question)}>
                          Réessayer
                        </Button>
                      </div>
                    ) : (
                      t.response && <AnswerCard r={t.response} />
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              className="input"
              value={question}
              maxLength={500}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={meta.placeholder}
              aria-label="Votre question"
              disabled={busy}
            />
            <Button type="submit" icon={<SendHorizontal size={16} />} loading={busy} disabled={!question.trim()}>
              Envoyer
            </Button>
          </form>
        </Card>

        <div className="stack">
          <Card title="Exemples de questions">
            {info.loading && !info.data ? (
              <Loader />
            ) : (
              <ul className="example-list compact">
                {examples.map((ex) => (
                  <li key={ex}>
                    <button onClick={() => ask(ex)} disabled={busy}>
                      <Lightbulb size={14} />
                      <span>{ex}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={<span className="row gap-sm"><Sparkles size={16} /> Fonctionnement</span>}>
            <ol className="how-list">
              <li><strong>spaCy</strong> (fr_core_news_sm) découpe la question : tokens, lemmes, catégories, dépendances.</li>
              <li>Chaque mot est normalisé (lemme sans accents + règles de suffixes) pour reconnaître pluriels et conjugaisons.</li>
              <li>Des <em>PhraseMatchers</em> spaCy reconnaissent les classes, individus, propriétés et relations du domaine ; les nombres, unités et comparateurs sont extraits.</li>
              <li>Un classifieur <strong>spaCy TextCategorizer</strong>, propre à ce domaine, prédit l'intention ; la requête SPARQL est construite à partir de modèles.</li>
              <li>La requête est vérifiée (lecture seule : SELECT ou ASK) puis exécutée par RDFLib sur l'ontologie.</li>
            </ol>
            {domainInfo && (
              <p className="muted small">
                Assistant « {domainInfo.label} » : {domainInfo.training_examples} questions d'entraînement
                {domainInfo.cv_accuracy !== null && (
                  <> · précision en validation croisée : <strong>{(domainInfo.cv_accuracy * 100).toFixed(1)} %</strong></>
                )}
                . Aucune API de LLM n'est utilisée.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
