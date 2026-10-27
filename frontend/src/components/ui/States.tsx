import { CircleAlert, Inbox, Loader2, PlugZap, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useBackend } from "../../context/BackendContext";
import { Button } from "./Button";

export function Loader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <Loader2 size={22} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title = "Aucun résultat",
  message,
  icon,
  action,
}: {
  title?: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state state-empty">
      <div className="state-icon">{icon ?? <Inbox size={22} />}</div>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <div className="state-icon">
        <CircleAlert size={22} />
      </div>
      <strong>Une erreur est survenue</strong>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Shown on pages whose data must come from the backend (ontology, SPARQL, NLP). */
export function BackendRequired({ feature }: { feature: string }) {
  const { retry, status } = useBackend();
  return (
    <div className="state state-offline">
      <div className="state-icon">
        <PlugZap size={24} />
      </div>
      <strong>{feature} nécessite le backend</strong>
      <p>
        Cette fonctionnalité interroge directement l'ontologie OWL via RDFLib. Elle n'a pas de version démo, afin de ne
        jamais afficher de données inventées. Démarrez le backend FastAPI puis réessayez.
      </p>
      <code className="inline-code">cd backend &amp;&amp; uvicorn app.main:app --reload --port 8000</code>
      <Button icon={<RefreshCw size={14} />} onClick={() => void retry()} loading={status === "checking"}>
        Vérifier la connexion
      </Button>
    </div>
  );
}
