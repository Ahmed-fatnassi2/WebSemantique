import { ChevronDown, ChevronRight, Circle } from "lucide-react";
import { useMemo, useState } from "react";
import type { OntologyClass } from "../../types";
import { humanize } from "../../utils/format";

/** Top classes grouped like the sidebar (each one is a table of the app). */
const TREE_GROUPS: { label: string; roots: { id: string; label: string }[] }[] = [
  {
    label: "Gestion du réseau",
    roots: [
      { id: "SourceProduction", label: "Sources de production" },
      { id: "Stockage", label: "Stockage" },
      { id: "Batiment", label: "Bâtiments" },
      { id: "LigneTransport", label: "Lignes de transport" },
      { id: "MobiliteElectrique", label: "Mobilité électrique" },
      { id: "SystemeIntelligent", label: "Systèmes intelligents" },
    ],
  },
  {
    label: "Contexte",
    roots: [
      { id: "ConditionMeteo", label: "Conditions météo" },
      { id: "Reglementation", label: "Réglementation" },
    ],
  },
  {
    label: "Application",
    roots: [{ id: "Utilisateur", label: "Utilisateurs" }],
  },
];
const ROOT_LABELS = new Map(TREE_GROUPS.flatMap((g) => g.roots.map((r) => [r.id, r.label] as const)));

interface TreeNode {
  cls: OntologyClass;
  children: TreeNode[];
}

export function buildTree(classes: OntologyClass[]): TreeNode[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const build = (c: OntologyClass, seen: Set<string>): TreeNode => ({
    cls: c,
    children: c.children
      .map((ch) => byId.get(ch.id))
      .filter((x): x is OntologyClass => Boolean(x) && !seen.has(x!.id))
      .map((x) => build(x, new Set([...seen, x.id]))),
  });
  return classes
    .filter((c) => c.parents.filter((p) => byId.has(p.id)).length === 0)
    .map((c) => build(c, new Set([c.id])));
}

function matches(node: TreeNode, q: string): boolean {
  return node.cls.id.toLowerCase().includes(q) || node.children.some((c) => matches(c, q));
}

function Node({
  node,
  depth,
  selected,
  onSelect,
  expanded,
  toggle,
  query,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  query: string;
}) {
  if (query && !matches(node, query)) return null;
  const open = query ? true : expanded.has(node.cls.id);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div
        className={`tree-row ${selected === node.cls.id ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(node.cls.id)}
        role="treeitem"
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={selected === node.cls.id}
      >
        {hasChildren ? (
          <button
            className="tree-toggle"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.cls.id);
            }}
            aria-label={open ? "Replier" : "Déplier"}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="tree-leaf">
            <Circle size={6} />
          </span>
        )}
        <span className="tree-label">
          {depth === 0 && ROOT_LABELS.has(node.cls.id) ? (
            <>
              {ROOT_LABELS.get(node.cls.id)} <small className="tree-owl">sg:{node.cls.id}</small>
            </>
          ) : (
            humanize(node.cls.id)
          )}
        </span>
        {node.cls.total_instances > 0 && <span className="tree-count">{node.cls.total_instances}</span>}
      </div>
      {hasChildren && open && (
        <ul>
          {node.children.map((c) => (
            <Node key={c.cls.id} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} expanded={expanded} toggle={toggle} query={query} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ClassTree({
  classes,
  selected,
  onSelect,
  filter,
}: {
  classes: OntologyClass[];
  selected: string | null;
  onSelect: (id: string) => void;
  filter: string;
}) {
  const tree = useMemo(() => buildTree(classes), [classes]);
  // The 8 tables start folded, so they are all visible at once
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => {
    const byId = new Map(tree.map((t) => [t.cls.id, t]));
    const grouped = TREE_GROUPS.map((g) => ({
      label: g.label,
      nodes: g.roots.map((r) => byId.get(r.id)).filter((n): n is TreeNode => Boolean(n)),
    }));
    const known = new Set(TREE_GROUPS.flatMap((g) => g.roots.map((r) => r.id)));
    const others = tree.filter((t) => !known.has(t.cls.id));
    return others.length ? [...grouped, { label: "Autres classes", nodes: others }] : grouped;
  }, [tree]);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(new Set(classes.map((c) => c.id)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="class-tree">
      <div className="tree-actions">
        <button className="link-btn" onClick={expandAll}>
          Tout déplier
        </button>
        <button className="link-btn" onClick={collapseAll}>
          Tout replier
        </button>
      </div>
      <ul role="tree">
        {groups.map((g) => {
          const q = filter.toLowerCase();
          if (g.nodes.length === 0 || (q && !g.nodes.some((n) => matches(n, q)))) return null;
          return (
            <li key={g.label} className="tree-group">
              <span className="tree-group-title">{g.label}</span>
              <ul>
                {g.nodes.map((n) => (
                  <Node key={n.cls.id} node={n} depth={0} selected={selected} onSelect={onSelect} expanded={expanded} toggle={toggle} query={q} />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
