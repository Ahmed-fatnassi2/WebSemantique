import { AlertTriangle, Bot, ExternalLink, Lightbulb, SendHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useBackend } from "../../context/BackendContext";
import { useAsync } from "../../hooks/useAsync";
import { nlpService } from "../../services/nlpService";
import type { NlpDomainKey, NlpResponse } from "../../types";
import { errorMessage } from "../../utils/errors";
import { nlpDomain } from "../../utils/nlpDomains";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { AnswerCard } from "./NlpAnswer";

/** "Ask in French" box shown on a CRUD page, using that page's NLP assistant. */
export function NlpQuickAsk({ domain }: { domain: NlpDomainKey }) {
  const { demo } = useBackend();
  const meta = nlpDomain(domain);
  const info = useAsync(() => (demo ? Promise.resolve(null) : nlpService.info()), [demo]);
  const examples = info.data?.domains.find((d) => d.key === domain)?.examples.slice(0, 4) ?? [];

  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<NlpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    try {
      setAnswer(await nlpService.ask(text, domain));
    } catch (err) {
      setAnswer(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className="quick-ask"
      title={
        <span className="row gap-sm">
          <Bot size={16} /> Demander en français · {meta.label}
        </span>
      }
      actions={
        <Link className="btn btn-ghost btn-sm" to={`/assistant?domain=${domain}`}>
          <ExternalLink size={14} />
          Ouvrir l'assistant
        </Link>
      }
    >
      {demo ? (
        <p className="muted small">L'assistant NLP a besoin du backend : il est indisponible en mode démo.</p>
      ) : (
        <div className="stack">
          <form
            className="quick-ask-form"
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
              aria-label={`Question sur : ${meta.label}`}
              disabled={busy}
            />
            <Button type="submit" icon={<SendHorizontal size={16} />} loading={busy} disabled={!question.trim()}>
              Demander
            </Button>
          </form>

          {!answer && !error && examples.length > 0 && (
            <div className="example-chips left">
              {examples.map((ex) => (
                <button key={ex} className="example-chip" onClick={() => ask(ex)} disabled={busy}>
                  <Lightbulb size={13} />« {ex} »
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="alert alert-danger">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {answer && (
            <>
              <div className="row space-between">
                <strong className="small">« {answer.question} »</strong>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<X size={14} />}
                  onClick={() => {
                    setAnswer(null);
                    setQuestion("");
                  }}
                >
                  Effacer
                </Button>
              </div>
              <AnswerCard r={answer} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}
