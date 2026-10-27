import { Bot, Network, Terminal, TriangleAlert, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBackend } from "../../context/BackendContext";
import { Button } from "../ui/Button";

/** Two-column page used by sign in and sign up: brand panel + form card. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const { status, retry } = useBackend();
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="brand">
          <div className="brand-logo">
            <Zap size={20} />
          </div>
          <div>
            <strong>SmartGrid</strong>
            <span>Semantic</span>
          </div>
        </div>
        <div className="auth-pitch">
          <h2>Le réseau électrique intelligent, décrit par une ontologie OWL.</h2>
          <ul>
            <li>
              <Network size={18} />
              <span>Sources, stockage, bâtiments et lignes reliés dans un graphe RDF.</span>
            </li>
            <li>
              <Terminal size={18} />
              <span>Requêtes SPARQL et modifications enregistrées dans le fichier OWL.</span>
            </li>
            <li>
              <Bot size={18} />
              <span>Questions en français traduites en SPARQL avec spaCy.</span>
            </li>
          </ul>
        </div>
        <small className="auth-foot">Projet Web sémantique · FastAPI · RDFLib · React</small>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-card-logo brand-logo">
            <Zap size={20} />
          </div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>

          {status === "offline" && (
            <div className="alert alert-warning">
              <TriangleAlert size={16} />
              <div>
                <strong>Backend injoignable.</strong> La connexion est impossible tant que le serveur n'est pas démarré.
                <div className="row gap-sm auth-offline-actions">
                  <Button variant="secondary" size="sm" onClick={() => void retry()}>
                    Réessayer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                    Continuer en mode démo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {children}
          <p className="auth-switch">{footer}</p>
        </div>
      </main>
    </div>
  );
}
