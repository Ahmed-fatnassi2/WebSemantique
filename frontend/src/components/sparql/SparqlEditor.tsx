import { useMemo, useRef, type KeyboardEvent } from "react";
import { highlightSparql } from "../../utils/sparql";

/**
 * Textarea with SPARQL syntax highlighting (a highlighted <pre> sits under a
 * transparent textarea) and line numbers. Ctrl/Cmd+Enter runs the query.
 */
export function SparqlEditor({
  value,
  onChange,
  onRun,
  readOnly = false,
  minRows = 12,
}: {
  value: string;
  onChange?: (value: string) => void;
  onRun?: () => void;
  readOnly?: boolean;
  minRows?: number;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => highlightSparql(value), [value]);
  const lineCount = Math.max(minRows, value.split("\n").length);

  const syncScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }
    if (e.key === "Tab" && !readOnly) {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = ta;
      const next = value.slice(0, s) + "  " + value.slice(end);
      onChange?.(next);
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div className="code-editor" style={{ minHeight: `${minRows * 1.6 + 1.5}em` }}>
      <div className="code-gutter" ref={gutterRef} aria-hidden>
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="code-area">
        <pre ref={preRef} className="code-highlight" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          className="code-input"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Requête SPARQL"
        />
      </div>
    </div>
  );
}

/** Read-only highlighted block, sized to its content. */
export function SparqlBlock({ query }: { query: string }) {
  const html = useMemo(() => highlightSparql(query), [query]);
  return <pre className="code-block" dangerouslySetInnerHTML={{ __html: html }} />;
}
