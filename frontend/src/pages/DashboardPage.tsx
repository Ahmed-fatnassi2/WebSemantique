import {
  Activity,
  BatteryCharging,
  Bot,
  Building2,
  Cable,
  LayoutDashboard,
  Network,
  Plus,
  RefreshCw,
  Sun,
  Terminal,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gauge, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, PageHeader, StatCard } from "../components/ui/Card";
import { EmptyState, ErrorState, Loader } from "../components/ui/States";
import { useBackend } from "../context/BackendContext";
import { useAsync } from "../hooks/useAsync";
import { dashboardService } from "../services/dashboardService";
import type { DashboardStats } from "../types";
import { formatCompact, formatNumber, humanize, timeAgo } from "../utils/format";
import { familyColor, statusMeta } from "../utils/labels";

const AXIS = { fontSize: 12, fill: "var(--text-muted)" };

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Record<string, unknown>; value: number; name: string }[]; unit?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <strong>{String(p.payload.nom ?? p.payload.family ?? "")}</strong>
      {p.payload.family && p.payload.nom ? <span className="muted">{humanize(String(p.payload.family))}</span> : null}
      <span>
        {formatNumber(p.value)} {unit}
      </span>
    </div>
  );
}

function FamilyLegend({ families }: { families: string[] }) {
  return (
    <div className="chart-legend">
      {families.map((f) => (
        <span key={f}>
          <i style={{ background: familyColor(f) }} />
          {humanize(f)}
        </span>
      ))}
    </div>
  );
}

function StatusList({ title, counts, icon }: { title: string; counts: Record<string, number>; icon: React.ReactNode }) {
  const entries = Object.entries(counts);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return (
    <div className="status-block">
      <div className="status-block-head">
        {icon}
        <strong>{title}</strong>
        <span className="muted">{total}</span>
      </div>
      {entries.length === 0 ? (
        <span className="muted">Aucun élément</span>
      ) : (
        <div className="status-bar" aria-hidden>
          {entries.map(([s, n]) => (
            <span key={s} className={`seg seg-${statusMeta(s).tone}`} style={{ flex: n }} />
          ))}
        </div>
      )}
      <div className="status-items">
        {entries.map(([s, n]) => (
          <div key={s}>
            <StatusBadge status={s} />
            <span className="num">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardContent({ stats }: { stats: DashboardStats }) {
  const { demo } = useBackend();
  const families = stats.production_by_family.map((f) => f.family);
  const sourcesSorted = [...stats.production_by_source].sort((a, b) => (b.puissance ?? 0) - (a.puissance ?? 0));
  const renewable = stats.production_by_source.filter((s) => s.family === "Solaire" || s.family === "Eolien");

  return (
    <>
      <div className="stats-grid">
        <StatCard
          icon={<Sun size={20} />}
          accent="amber"
          label="Sources de production"
          value={stats.counts.sources}
          hint={`${stats.counts.sources_actives} actives`}
        />
        <StatCard
          icon={<Zap size={20} />}
          accent="emerald"
          label="Capacité de production"
          value={formatNumber(stats.totals.puissance_kw, "kW")}
          hint="Somme de sg:puissance"
        />
        <StatCard
          icon={<BatteryCharging size={20} />}
          accent="violet"
          label="Capacité de stockage"
          value={formatNumber(stats.totals.capacite_stockage_kwh, "kWh")}
          hint={stats.totals.charge_moyenne !== null ? `Charge moyenne ${formatNumber(stats.totals.charge_moyenne, "%")}` : `${stats.counts.storage} systèmes`}
        />
        <StatCard
          icon={<Building2 size={20} />}
          accent="sky"
          label="Bâtiments"
          value={stats.counts.buildings}
          hint={`${formatNumber(stats.totals.consommation_kwh, "kWh")} consommés`}
        />
        <StatCard
          icon={<Cable size={20} />}
          accent="slate"
          label="Lignes de transport"
          value={stats.counts.lines}
          hint={`${formatNumber(stats.totals.longueur_lignes_km, "km")} au total`}
        />
      </div>

      <div className="grid-2-1">
        <Card title="Puissance installée par source" subtitle="sg:puissance (kW), couleur = famille de source">
          {sourcesSorted.length === 0 ? (
            <EmptyState title="Aucune source" />
          ) : (
            <>
              <FamilyLegend families={families} />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sourcesSorted} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="nom" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<ChartTooltip unit="kW" />} cursor={{ fill: "var(--hover)" }} />
                  <Bar dataKey="puissance" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {sourcesSorted.map((s) => (
                      <Cell key={s.id} fill={familyColor(s.family)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>

        <Card title="Mix énergétique" subtitle="Part de la puissance installée par famille">
          {stats.production_by_family.length === 0 ? (
            <EmptyState title="Aucune source" />
          ) : (
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={stats.production_by_family}
                    dataKey="puissance"
                    nameKey="family"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  >
                    {stats.production_by_family.map((f) => (
                      <Cell key={f.family} fill={familyColor(f.family)} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip unit="kW" />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="donut-legend">
                {stats.production_by_family.map((f) => (
                  <li key={f.family}>
                    <i style={{ background: familyColor(f.family) }} />
                    <span>{humanize(f.family)}</span>
                    <strong className="num">
                      {stats.totals.puissance_kw ? Math.round((f.puissance / stats.totals.puissance_kw) * 100) : 0} %
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Production solaire et éolienne" subtitle="sg:productionAnnuelle des sources Solaire et Eolien">
          {renewable.length === 0 ? (
            <EmptyState title="Aucune source solaire ou éolienne" />
          ) : (
            <>
              <FamilyLegend families={[...new Set(renewable.map((s) => s.family ?? ""))]} />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={renewable} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nom" tick={AXIS} tickLine={false} axisLine={false} width={120} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--hover)" }} />
                  <Bar dataKey="productionAnnuelle" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {renewable.map((s) => (
                      <Cell key={s.id} fill={familyColor(s.family)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>

        <Card title="Consommation énergétique" subtitle="sg:consommation par bâtiment (kWh)">
          {stats.consumption_by_building.length === 0 ? (
            <EmptyState title="Aucun bâtiment" />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.consumption_by_building} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="nom" tick={AXIS} tickLine={false} axisLine={false} width={110} />
                <Tooltip content={<ChartTooltip unit="kWh" />} cursor={{ fill: "var(--hover)" }} />
                <Bar dataKey="consommation" fill="var(--chart-primary)" radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid-2-1">
        <Card title="État opérationnel" subtitle="Statuts calculés à partir des propriétés de l'ontologie">
          <div className="status-grid">
            <StatusList title="Sources" counts={stats.status.sources} icon={<Sun size={16} />} />
            <StatusList title="Lignes" counts={stats.status.lines} icon={<Cable size={16} />} />
            <StatusList title="Stockage" counts={stats.status.storage} icon={<BatteryCharging size={16} />} />
            <StatusList title="Bâtiments" counts={stats.status.buildings} icon={<Building2 size={16} />} />
          </div>
          {stats.storage_levels.length > 0 && (
            <div className="storage-levels">
              <h4>Niveau de charge du stockage</h4>
              {stats.storage_levels.map((s) => (
                <div key={s.id} className="storage-level">
                  <span>{s.nom}</span>
                  <Gauge value={s.tauxCharge} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Actions rapides">
            <div className="quick-actions">
              <Link to="/sources?action=new" className={`quick-action ${demo ? "disabled" : ""}`} aria-disabled={demo} onClick={(e) => demo && e.preventDefault()}>
                <Plus size={18} />
                <span>Ajouter une source</span>
              </Link>
              <Link to="/assistant" className="quick-action">
                <Bot size={18} />
                <span>Poser une question</span>
              </Link>
              <Link to="/sparql" className="quick-action">
                <Terminal size={18} />
                <span>Console SPARQL</span>
              </Link>
              <Link to="/grid" className="quick-action">
                <Network size={18} />
                <span>Explorer le réseau</span>
              </Link>
            </div>
          </Card>

          <Card title="Activité récente" subtitle="Modifications depuis le démarrage du serveur">
            {stats.activity.length === 0 ? (
              <EmptyState
                icon={<Activity size={20} />}
                title="Aucune modification"
                message={demo ? "Non disponible en mode démo." : "Les créations, modifications et requêtes UPDATE apparaîtront ici."}
              />
            ) : (
              <ul className="activity-list">
                {stats.activity.map((a, i) => (
                  <li key={i}>
                    <span className={`activity-dot act-${a.action}`} />
                    <div>
                      <span>{a.message}</span>
                      <small className="muted">{timeAgo(a.timestamp)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!demo && (
            <Card title="Graphe RDF">
              <div className="mini-stats">
                <div>
                  <strong>{formatNumber(stats.graph.triples)}</strong>
                  <span>triplets</span>
                </div>
                <div>
                  <strong>{stats.graph.classes}</strong>
                  <span>classes</span>
                </div>
                <div>
                  <strong>{stats.graph.object_properties + stats.graph.data_properties}</strong>
                  <span>propriétés</span>
                </div>
                <div>
                  <strong>{stats.counts.individuals}</strong>
                  <span>individus</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { version } = useBackend();
  const stats = useAsync(() => dashboardService.stats(), [version]);

  return (
    <div className="page">
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble du réseau électrique intelligent, calculée à partir de l'ontologie SmartGrid."
        icon={<LayoutDashboard size={22} />}
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={stats.reload} loading={stats.loading && Boolean(stats.data)}>
            Actualiser
          </Button>
        }
      />
      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : !stats.data ? (
        <Loader label="Calcul des indicateurs…" />
      ) : (
        <DashboardContent stats={stats.data} />
      )}
    </div>
  );
}

