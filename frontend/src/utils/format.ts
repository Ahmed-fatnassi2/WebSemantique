const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return unit ? `${nf.format(value)} ${unit}` : nf.format(value);
}

export function formatCompact(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return unit ? `${compact.format(value)} ${unit}` : compact.format(value);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** "2021-03-15" -> "15/03/2021" (dates of the ontology, xsd:date). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(diff)) return iso;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

/** "BatterieLithium" -> "Batterie Lithium", "Eolien_Terrestre" -> "Eolien Terrestre". */
export function humanize(id: string | null | undefined): string {
  if (!id) return "—";
  return id
    .replace(/_/g, " ")
    .replace(/([a-zà-ÿ0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortUri(uri: string): string {
  const i = Math.max(uri.lastIndexOf("#"), uri.lastIndexOf("/"));
  return i >= 0 ? uri.slice(i + 1) : uri;
}
