import {
  BatteryCharging,
  Bot,
  Building2,
  Cable,
  Car,
  CloudSun,
  Cpu,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  Network,
  RefreshCw,
  Scale,
  Settings,
  Sun,
  Terminal,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBackend } from "../../context/BackendContext";
import { Button } from "../ui/Button";
import { Loader } from "../ui/States";

const NAV = [
  {
    section: "Supervision",
    items: [
      { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
      { to: "/grid", label: "Explorateur Smart Grid", icon: Network },
    ],
  },
  {
    section: "Gestion du réseau",
    items: [
      { to: "/sources", label: "Sources de production", icon: Sun },
      { to: "/storage", label: "Stockage", icon: BatteryCharging },
      { to: "/buildings", label: "Bâtiments", icon: Building2 },
      { to: "/lines", label: "Lignes de transport", icon: Cable },
      { to: "/mobility", label: "Mobilité électrique", icon: Car },
      { to: "/systems", label: "Systèmes intelligents", icon: Cpu },
    ],
  },
  {
    section: "Contexte",
    items: [
      { to: "/weather", label: "Conditions météo", icon: CloudSun },
      { to: "/regulations", label: "Réglementation", icon: Scale },
    ],
  },
  {
    section: "Web sémantique",
    items: [
      { to: "/ontology", label: "Ontologie", icon: ListTree },
      { to: "/sparql", label: "Console SPARQL", icon: Terminal },
      { to: "/assistant", label: "Assistant NLP", icon: Bot },
    ],
  },
  {
    section: "Système",
    items: [{ to: "/settings", label: "Paramètres", icon: Settings }],
  },
];

function ConnectionPill() {
  const { status, triples } = useBackend();
  const label = status === "online" ? "Backend connecté" : status === "checking" ? "Connexion…" : "Mode démo";
  return (
    <div className={`conn-pill conn-${status}`}>
      <span className="dot" />
      <div>
        <strong>{label}</strong>
        <small>{status === "online" && triples !== null ? `${triples} triplets RDF` : status === "offline" ? "Backend injoignable" : "Vérification"}</small>
      </div>
    </div>
  );
}

function UserCard() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.nom
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="user-card">
      <span className="user-avatar" aria-hidden>
        {initials}
      </span>
      <div className="user-info">
        <strong>{user.nom}</strong>
        <small>{user.email}</small>
      </div>
      <button className="icon-btn user-logout" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter">
        <LogOut size={16} />
      </button>
    </div>
  );
}

function DemoBanner() {
  const { demo, retry, status } = useBackend();
  if (!demo) return null;
  return (
    <div className="demo-banner" role="alert">
      <TriangleAlert size={18} />
      <div>
        <strong>Mode démo : données fictives.</strong> Le backend n'est pas joignable. Les valeurs affichées ne
        proviennent pas de l'ontologie, et les modifications, l'ontologie, SPARQL et l'assistant NLP sont désactivés.
      </div>
      <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void retry()} loading={status === "checking"}>
        Réessayer
      </Button>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { lastChecked } = useBackend();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`app-shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <div className="brand-logo">
            <Zap size={20} />
          </div>
          <div>
            <strong>SmartGrid</strong>
            <span>Semantic</span>
          </div>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          {NAV.map((group) => (
            <div key={group.section} className="nav-group">
              <span className="nav-section">{group.section}</span>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <UserCard />
        <ConnectionPill />
      </aside>
      <div className="sidebar-backdrop" onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <span className="topbar-title">Énergies renouvelables & réseau intelligent</span>
          <span className="topbar-spacer" />
          <span className="topbar-tag">Ontologie OWL · RDFLib · SPARQL</span>
        </header>
        <DemoBanner />
        <main className="content">{lastChecked ? (
            <Suspense fallback={<Loader />}>
              <Outlet />
            </Suspense>
          ) : (
            <Loader label="Connexion au backend…" />
          )}</main>
      </div>
    </div>
  );
}
