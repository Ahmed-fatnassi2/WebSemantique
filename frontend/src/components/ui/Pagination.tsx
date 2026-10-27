import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span className="muted">
        {from}–{to} sur {total}
      </span>
      <div className="pagination-controls">
        <label className="pagination-size">
          <span>Par page</span>
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente">
          <ChevronLeft size={16} />
        </button>
        <span className="pagination-page">
          {page} / {pages}
        </span>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
