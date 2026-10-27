import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BatteryCharging, Building2, Cable, Car, CloudSun, Cpu, Maximize2, Network, RefreshCw, Scale, Sun, X, Zap } from "lucide-react";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import { PageHeader } from "../components/ui/Card";
import { SearchInput } from "../components/ui/SearchInput";
import { EmptyState, ErrorState, Loader } from "../components/ui/States";
import { useBackend } from "../context/BackendContext";
import { useAsync } from "../hooks/useAsync";
import { gridService } from "../services/dashboardService";
import type { GridCategory, GridData, GridNode } from "../types";
import { humanize } from "../utils/format";
import { CATEGORY_META, PROPERTY_LABELS, statusMeta } from "../utils/labels";

const CATEGORY_ICONS: Record<GridCategory, ReactNode> = {
  sources: <Sun size={16} />,
  storage: <BatteryCharging size={16} />,
  lines: <Cable size={16} />,
  buildings: <Building2 size={16} />,
  mobility: <Car size={16} />,
  smart: <Cpu size={16} />,
  weather: <CloudSun size={16} />,
  regulation: <Scale size={16} />,
  other: <Zap size={16} />,
};

// Same groups as the sidebar. Network: left-to-right flow (supervision -> storage -> production
// -> transport -> consumption -> mobility). Context: one row per table, above the network.
const GROUPS: { label: string; categories: GridCategory[] }[] = [
  { label: "Gestion du réseau", categories: ["smart", "storage", "sources", "lines", "buildings", "mobility"] },
  { label: "Contexte", categories: ["regulation", "weather"] },
  { label: "Autres", categories: ["other"] },
];
const NETWORK = [...GROUPS[0].categories, "other"] as GridCategory[];
const CONTEXT = GROUPS[1].categories;
const COLUMN_ORDER: GridCategory[] = GROUPS.flatMap((g) => g.categories);
const COL_WIDTH = 260;
const ROW_HEIGHT = 96;
const CONTEXT_ROW_GAP = 110;

interface NodeData extends Record<string, unknown> {
  node: GridNode;
  dimmed: boolean;
  highlighted: boolean;
}

interface LabelData extends Record<string, unknown> {
  text: string;
  kind: "section" | "column";
  color?: string;
}

/** Group title ("Contexte") or table title above a column, drawn in the canvas. */
const LabelNodeView = memo(function LabelNodeView({ data }: NodeProps<Node<LabelData>>) {
  return (
    <div className={`flow-label flow-label-${data.kind}`}>
      {data.color && <i style={{ background: data.color }} />}
      {data.text}
    </div>
  );
});

const GridNodeView = memo(function GridNodeView({ data, selected }: NodeProps<Node<NodeData>>) {
  const { node, dimmed, highlighted } = data;
  const meta = CATEGORY_META[node.category];
  const status = node.status ? statusMeta(node.status) : null;
  return (
    <div
      className={`flow-node ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${highlighted ? "highlighted" : ""}`}
      style={{ ["--node-color" as string]: meta.color }}
    >
      <Handle id="left" type="target" position={Position.Left} />
      <Handle id="top" type="target" position={Position.Top} />
      <div className="flow-node-icon">{CATEGORY_ICONS[node.category]}</div>
      <div className="flow-node-text">
        <strong>{node.label}</strong>
        <small>{humanize(node.type)}</small>
      </div>
      {status && <span className={`flow-status tone-${status.tone}`} title={status.label} />}
      <Handle id="right" type="source" position={Position.Right} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
    </div>
  );
});

const nodeTypes = { grid: GridNodeView, label: LabelNodeView };

interface Layout {
  pos: Map<string, { x: number; y: number }>;
  labels: { id: string; category?: GridCategory; group?: string; data: LabelData; x: number; y: number }[];
}

function layout(data: GridData): Layout {
  const byCat = new Map<GridCategory, GridNode[]>();
  for (const n of data.nodes) byCat.set(n.category, [...(byCat.get(n.category) ?? []), n]);
  const sorted = (c: GridCategory) => byCat.get(c)!.sort((a, b) => a.label.localeCompare(b.label));
  const pos = new Map<string, { x: number; y: number }>();
  const labels: Layout["labels"] = [];

  // "Gestion du réseau": one column per table
  const columns = NETWORK.filter((c) => byCat.has(c));
  const tallest = Math.max(1, ...columns.map((c) => byCat.get(c)!.length));
  columns.forEach((cat, col) => {
    const items = sorted(cat);
    const offset = ((tallest - items.length) * ROW_HEIGHT) / 2;
    items.forEach((n, row) => pos.set(n.id, { x: col * COL_WIDTH, y: offset + row * ROW_HEIGHT }));
    labels.push({
      id: `col-${cat}`,
      category: cat,
      data: { text: CATEGORY_META[cat].label, kind: "column", color: CATEGORY_META[cat].color },
      x: col * COL_WIDTH,
      y: -44,
    });
  });
  labels.push({ id: "section-network", group: GROUPS[0].label, data: { text: GROUPS[0].label, kind: "section" }, x: 0, y: -96 });

  // "Contexte": one row per table, centred above the network
  const width = Math.max(1, columns.length) * COL_WIDTH;
  const rows = CONTEXT.filter((c) => byCat.has(c));
  rows.forEach((cat, r) => {
    const items = sorted(cat);
    const y = -130 - (rows.length - r) * CONTEXT_ROW_GAP;
    const start = Math.max(COL_WIDTH * 0.7, (width - items.length * COL_WIDTH) / 2);
    items.forEach((n, i) => pos.set(n.id, { x: start + i * COL_WIDTH, y }));
    labels.push({
      id: `row-${cat}`,
      category: cat,
      data: { text: CATEGORY_META[cat].label, kind: "column", color: CATEGORY_META[cat].color },
      x: start - COL_WIDTH * 0.7,
      y: y + 16,
    });
  });
  if (rows.length) {
    labels.push({
      id: "section-context",
      group: GROUPS[1].label,
      data: { text: GROUPS[1].label, kind: "section" },
      x: 0,
      y: -130 - rows.length * CONTEXT_ROW_GAP - 56,
    });
  }
  return { pos, labels };
}

function GridCanvas({ data }: { data: GridData }) {
  const { fitView } = useReactFlow();
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<GridCategory>>(new Set());
  const [statusFilter, setStatusFilter] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { pos: positions, labels } = useMemo(() => layout(data), [data]);

  const categories = useMemo(() => COLUMN_ORDER.filter((c) => data.nodes.some((n) => n.category === c)), [data]);
  const statuses = useMemo(() => [...new Set(data.nodes.map((n) => n.status).filter(Boolean))] as string[], [data]);

  const q = search.trim().toLowerCase();
  const { visibleIds, matchIds, computedNodes } = useMemo(() => {
    const visible = data.nodes.filter((n) => !hidden.has(n.category) && (!statusFilter || n.status === statusFilter));
    const matches = new Set(
      q ? visible.filter((n) => `${n.label} ${n.id} ${n.type}`.toLowerCase().includes(q)).map((n) => n.id) : [],
    );
    const neighbours = new Set<string>();
    if (selectedId) {
      for (const e of data.edges) {
        if (e.source === selectedId) neighbours.add(e.target);
        if (e.target === selectedId) neighbours.add(e.source);
      }
    }
    const computed: Node<NodeData | LabelData>[] = visible.map((n) => ({
      id: n.id,
      type: "grid",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      selected: n.id === selectedId,
      data: {
        node: n,
        highlighted: matches.has(n.id),
        dimmed: (q !== "" && !matches.has(n.id)) || (selectedId !== null && n.id !== selectedId && !neighbours.has(n.id)),
      },
    }));
    // Group and table titles, only for what is shown
    const shownCats = new Set(visible.map((n) => n.category));
    for (const l of labels) {
      const show = l.category
        ? shownCats.has(l.category)
        : GROUPS.some((g) => g.label === l.group && g.categories.some((c) => shownCats.has(c)));
      if (show) computed.push({ id: l.id, type: "label", position: { x: l.x, y: l.y }, data: l.data, draggable: false, selectable: false });
    }
    return { visibleIds: new Set(visible.map((n) => n.id)), matchIds: matches, computedNodes: computed };
  }, [data, hidden, statusFilter, q, selectedId, positions, labels]);

  // React Flow owns positions/measurements; we merge our data in, keeping dragged positions.
  const [nodes, setNodes] = useState<Node<NodeData | LabelData>[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return computedNodes.map((n) => {
        const p = old.get(n.id);
        return p ? { ...p, data: n.data, selected: n.selected } : n;
      });
    });
  }, [computedNodes]);
  const onNodesChange = (changes: NodeChange<Node<NodeData | LabelData>>[]) => setNodes((nds) => applyNodeChanges(changes, nds));
  const categoryOf = useMemo(() => new Map(data.nodes.map((n) => [n.id, n.category])), [data]);

  const edges: Edge[] = data.edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => {
      const active = selectedId !== null && (e.source === selectedId || e.target === selectedId);
      const faded = selectedId !== null && !active;
      // Context tables (above) connect from their bottom to the top of network nodes
      const fromContext = CONTEXT.includes(categoryOf.get(e.source)!);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: fromContext ? "bottom" : "right",
        targetHandle: fromContext ? "top" : "left",
        label: showLabels || active ? PROPERTY_LABELS[e.property] ?? e.property : undefined,
        animated: active || e.property === "injecteDans",
        className: `${active ? "edge-active" : ""} ${faded ? "edge-faded" : ""}`,
        markerEnd: e.symmetric ? undefined : { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      };
    });

  // Zoom onto search matches
  useEffect(() => {
    if (!q || matchIds.size === 0) return;
    const t = setTimeout(() => fitView({ nodes: [...matchIds].map((id) => ({ id })), duration: 400, padding: 0.6, maxZoom: 1.3 }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, matchIds.size]);

  const selected = data.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedEdges = selected ? data.edges.filter((e) => e.source === selected.id || e.target === selected.id) : [];
  const labelOf = (id: string) => data.nodes.find((n) => n.id === id)?.label ?? id;

  const toggleCat = (c: GridCategory) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  // Clicking a group title shows or hides all its tables
  const toggleGroup = (cats: GridCategory[]) =>
    setHidden((h) => {
      const next = new Set(h);
      const allHidden = cats.every((c) => next.has(c));
      cats.forEach((c) => (allHidden ? next.delete(c) : next.add(c)));
      return next;
    });

  return (
    <div className="grid-explorer">
      <div className="grid-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un composant…" />
        <div className="legend-groups">
          {GROUPS.map((g) => {
            const cats = g.categories.filter((c) => categories.includes(c));
            if (cats.length === 0) return null;
            const allHidden = cats.every((c) => hidden.has(c));
            return (
              <div key={g.label} className="legend-group">
                <button
                  className={`legend-group-title ${allHidden ? "off" : ""}`}
                  onClick={() => toggleGroup(cats)}
                  title={allHidden ? "Afficher tout le groupe" : "Masquer tout le groupe"}
                >
                  {g.label}
                </button>
                <div className="legend-toggles">
                  {cats.map((c) => (
                    <button
                      key={c}
                      className={`legend-toggle ${hidden.has(c) ? "off" : ""}`}
                      onClick={() => toggleCat(c)}
                      aria-pressed={!hidden.has(c)}
                    >
                      <i style={{ background: CATEGORY_META[c].color }} />
                      {CATEGORY_META[c].label}
                      <span className="muted">{data.nodes.filter((n) => n.category === c).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <select className="input input-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusMeta(s).label}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          Libellés des relations
        </label>
        <Button variant="ghost" size="sm" icon={<Maximize2 size={14} />} onClick={() => fitView({ duration: 400, padding: 0.15 })}>
          Recentrer
        </Button>
      </div>

      <div className="grid-body">
        <div className="flow-wrap">
          {q && matchIds.size === 0 && <div className="flow-notice">Aucun composant ne correspond à « {search} »</div>}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => n.type === "grid" && setSelectedId(n.id === selectedId ? null : n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodesConnectable={false}
            nodesDraggable
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="var(--border)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.type === "grid" ? CATEGORY_META[(n.data as NodeData).node.category].color : "transparent")} maskColor="rgba(11,27,51,0.08)" />
          </ReactFlow>
        </div>

        {selected && (
          <aside className="grid-panel">
            <div className="grid-panel-head">
              <div className="flow-node-icon" style={{ ["--node-color" as string]: CATEGORY_META[selected.category].color }}>
                {CATEGORY_ICONS[selected.category]}
              </div>
              <div>
                <h3>{selected.label}</h3>
                <span className="muted">{CATEGORY_META[selected.category].label}</span>
              </div>
              <IconButton label="Fermer" onClick={() => setSelectedId(null)}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="chips">
              <Badge tone="info">{humanize(selected.type)}</Badge>
              {selected.status && <StatusBadge status={selected.status} />}
            </div>
            <code className="uri-line">{selected.uri}</code>

            <h4 className="section-title">Propriétés</h4>
            <dl className="detail-list compact">
              {Object.entries(selected.properties).map(([k, v]) => (
                <div key={k}>
                  <dt className="mono">sg:{k}</dt>
                  <dd>{typeof v === "boolean" ? (v ? "Oui" : "Non") : String(v)}</dd>
                </div>
              ))}
            </dl>

            <h4 className="section-title">Relations ({selectedEdges.length})</h4>
            {selectedEdges.length === 0 ? (
              <p className="muted">Aucune relation.</p>
            ) : (
              <ul className="relation-list">
                {selectedEdges.map((e) => {
                  const out = e.source === selected.id;
                  const other = out ? e.target : e.source;
                  return (
                    <li key={e.id}>
                      {!out && <button className="chip chip-link" onClick={() => setSelectedId(other)}>{labelOf(other)}</button>}
                      <span className="mono">sg:{e.property}</span>
                      {out && <button className="chip chip-link" onClick={() => setSelectedId(other)}>{labelOf(other)}</button>}
                    </li>
                  );
                })}
              </ul>
            )}
            <Link className="btn btn-secondary btn-sm" to={`/ontology?individual=${encodeURIComponent(selected.id)}`}>
              Voir dans l'ontologie
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function GridExplorerPage() {
  const { version } = useBackend();
  const grid = useAsync(() => gridService.network(), [version]);

  return (
    <div className="page page-full">
      <PageHeader
        title="Explorateur Smart Grid"
        icon={<Network size={22} />}
        description="Les tables de la gestion du réseau et du contexte (météo, réglementation), reliées par les relations de l'ontologie (alimente, injecteDans, influence, perturbe, encadre…). Cliquez sur un nœud pour voir ses détails."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={grid.reload}>
            Actualiser
          </Button>
        }
      />
      {grid.error ? (
        <ErrorState message={grid.error} onRetry={grid.reload} />
      ) : !grid.data ? (
        <Loader label="Construction du graphe…" />
      ) : grid.data.nodes.length === 0 ? (
        <EmptyState title="Aucun composant" message="L'ontologie ne contient aucun individu." />
      ) : (
        <ReactFlowProvider>
          <GridCanvas data={grid.data} />
        </ReactFlowProvider>
      )}
    </div>
  );
}
