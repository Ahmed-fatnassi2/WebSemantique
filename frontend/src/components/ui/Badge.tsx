import type { ReactNode } from "react";
import { statusMeta, type Tone } from "../../utils/labels";

export function Badge({ tone = "neutral", children, mono = false }: { tone?: Tone; children: ReactNode; mono?: boolean }) {
  return <span className={`badge badge-${tone}${mono ? " mono" : ""}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const meta = statusMeta(status);
  return (
    <span className={`badge badge-${meta.tone}`}>
      <span className="dot" />
      {meta.label}
    </span>
  );
}

/** Horizontal gauge for a percentage (e.g. battery charge). */
export function Gauge({ value, label }: { value: number | null | undefined; label?: string }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  const v = Math.max(0, Math.min(100, value));
  const tone = v < 20 ? "danger" : v < 60 ? "warning" : "success";
  return (
    <div className="gauge" title={label ?? `${v} %`}>
      <div className="gauge-track">
        <div className={`gauge-fill gauge-${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="gauge-value">{v.toLocaleString("fr-FR")} %</span>
    </div>
  );
}
