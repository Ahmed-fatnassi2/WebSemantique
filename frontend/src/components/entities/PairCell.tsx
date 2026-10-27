import type { EntityRef } from "../../types";

/** Table cell listing the linked items of the paired table (e.g. the storages of a source). */
export function PairCell({ refs }: { refs: EntityRef[] | undefined }) {
  if (!refs || refs.length === 0) return <span className="muted">—</span>;
  return (
    <div className="pair-cell">
      {refs.map((r) => (
        <span key={r.id} className="pair-chip" title={`sg:${r.id}`}>
          {r.nom ?? r.id}
        </span>
      ))}
    </div>
  );
}
