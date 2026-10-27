import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBackend } from "../../context/BackendContext";
import { useToast } from "../../context/ToastContext";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import type { BaseEntity, TypeOption } from "../../types";
import { errorMessage } from "../../utils/errors";
import { humanize } from "../../utils/format";
import { NlpQuickAsk } from "../nlp/NlpQuickAsk";
import { Badge, StatusBadge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Card, PageHeader } from "../ui/Card";
import { ConfirmDialog, Modal } from "../ui/Modal";
import { Pagination } from "../ui/Pagination";
import { SearchInput } from "../ui/SearchInput";
import { EmptyState, ErrorState, Loader } from "../ui/States";
import { EntityForm } from "./EntityForm";
import type { EntityConfig } from "./types";

const DEMO_TITLE = "Indisponible en mode démo : démarrez le backend pour modifier les données";

export function EntityManager<T extends BaseEntity>({ config }: { config: EntityConfig<T> }) {
  const { demo, version } = useBackend();
  const { notify } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState(config.defaultSort);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debounced = useDebounce(search);

  const [editing, setEditing] = useState<T | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const list = useAsync(
    () =>
      config.service.list({ search: debounced, type: typeFilter, status, sort, order, page, page_size: pageSize }),
    [debounced, typeFilter, status, sort, order, page, pageSize, version],
  );
  const all = useAsync(() => config.service.all(), [version, list.data]);
  const types = useAsync<TypeOption[]>(() => config.service.types(), [version]);

  const familyOptions = useMemo(() => {
    const fams = new Map<string, TypeOption[]>();
    for (const t of types.data ?? []) {
      const f = t.family ?? "Autres";
      fams.set(f, [...(fams.get(f) ?? []), t]);
    }
    return [...fams.entries()];
  }, [types.data]);

  const resetPage = <V,>(setter: (v: V) => void) => (v: V) => {
    setter(v);
    setPage(1);
  };

  const toggleSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (item: T) => {
    setEditing(item);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await config.service.remove(deleting.id);
      notify(`${deleting.nom ?? deleting.id} supprimé(e) de l'ontologie`);
      setDeleting(null);
      if (list.data && list.data.items.length === 1 && page > 1) setPage(page - 1);
      else list.reload();
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  // "?action=new" (dashboard quick action) opens the creation form once.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("action") !== "new") return;
    if (!demo) openCreate();
    searchParams.delete("action");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, demo]);

  const summary = all.data && config.summary ? config.summary(all.data) : [];
  const hasFilters = Boolean(search || typeFilter || status);

  return (
    <div className="page">
      <PageHeader
        title={config.plural}
        description={config.description}
        icon={config.icon}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={list.reload}>
              Actualiser
            </Button>
            <Button icon={<Plus size={16} />} onClick={openCreate} disabled={demo} title={demo ? DEMO_TITLE : undefined}>
              Ajouter
            </Button>
          </>
        }
      />

      {summary.length > 0 && (
        <div className="kpi-strip">
          {summary.map((s) => (
            <div key={s.label} className="kpi">
              <span>{s.label}</span>
              <strong>{s.value}</strong>
            </div>
          ))}
        </div>
      )}

      <Card padded={false}>
        <div className="toolbar">
          <SearchInput value={search} onChange={resetPage(setSearch)} placeholder={config.searchPlaceholder} />
          <select className="input input-sm" value={typeFilter} onChange={(e) => resetPage(setTypeFilter)(e.target.value)} aria-label="Filtrer par classe">
            <option value="">Toutes les classes</option>
            {familyOptions.map(([family, opts]) => (
              <optgroup key={family} label={humanize(family)}>
                {opts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {humanize(t.id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select className="input input-sm" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} aria-label="Filtrer par statut">
            <option value="">Tous les statuts</option>
            {config.statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setTypeFilter("");
                setStatus("");
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          )}
        </div>

        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.data && list.loading ? (
          <Loader />
        ) : list.data && list.data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "Aucun résultat pour ces filtres" : `Aucun(e) ${config.singular.toLowerCase()}`}
            message={hasFilters ? "Modifiez la recherche ou les filtres." : "Ajoutez un premier élément à l'ontologie."}
            action={
              !hasFilters && !demo ? (
                <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
                  Ajouter
                </Button>
              ) : undefined
            }
          />
        ) : (
          list.data && (
            <>
              <div className={`table-wrap ${list.loading ? "is-refreshing" : ""}`}>
                <table className="table">
                  <thead>
                    <tr>
                      {config.columns.map((c) => (
                        <th key={c.key} className={c.align === "right" ? "align-right" : ""}>
                          {c.sortable ? (
                            <button className="th-sort" onClick={() => toggleSort(c.key)}>
                              {c.label}
                              {sort === c.key ? (
                                order === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                              ) : (
                                <ArrowUpDown size={12} className="muted" />
                              )}
                            </button>
                          ) : (
                            c.label
                          )}
                        </th>
                      ))}
                      <th className="align-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((item) => (
                      <tr key={item.id}>
                        {config.columns.map((c) => (
                          <td key={c.key} className={c.align === "right" ? "align-right num" : ""}>
                            {c.render(item)}
                          </td>
                        ))}
                        <td className="align-right">
                          <div className="row-actions">
                            <IconButton label="Détails" onClick={() => setViewing(item)}>
                              <Eye size={16} />
                            </IconButton>
                            <IconButton label={demo ? DEMO_TITLE : "Modifier"} onClick={() => openEdit(item)} disabled={demo}>
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton
                              label={demo ? DEMO_TITLE : "Supprimer"}
                              className="danger"
                              onClick={() => setDeleting(item)}
                              disabled={demo}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={list.data.page}
                pages={list.data.pages}
                total={list.data.total}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </>
          )
        )}
      </Card>

      {config.nlpDomain && <NlpQuickAsk domain={config.nlpDomain} />}

      <EntityForm
        config={config}
        item={editing}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(saved, created) => {
          setFormOpen(false);
          notify(created ? `${saved.nom} ajouté(e) à l'ontologie` : `${saved.nom} mis(e) à jour`);
          list.reload();
        }}
      />

      <EntityDetails config={config} item={viewing} onClose={() => setViewing(null)} onEdit={demo ? undefined : openEdit} />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Supprimer cet élément ?"
        confirmLabel="Supprimer"
        loading={deleteLoading}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        message={
          <>
            <p>
              <strong>{deleting?.nom}</strong> (<code className="inline-code">sg:{deleting?.id}</code>) sera retiré du
              graphe, ainsi que tous les triplets qui le mentionnent.
            </p>
            <p className="muted">Les autres individus ne sont pas supprimés.</p>
          </>
        }
      />
    </div>
  );
}

function EntityDetails<T extends BaseEntity>({
  config,
  item,
  onClose,
  onEdit,
}: {
  config: EntityConfig<T>;
  item: T | null;
  onClose: () => void;
  onEdit?: (item: T) => void;
}) {
  if (!item) return null;
  const record = item as unknown as Record<string, unknown>;
  return (
    <Modal
      open
      title={item.nom ?? item.id}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Link className="btn btn-ghost btn-md" to={`/ontology?individual=${encodeURIComponent(item.id)}`}>
            Voir dans l'ontologie
          </Link>
          {onEdit && (
            <Button
              icon={<Pencil size={14} />}
              onClick={() => {
                onClose();
                onEdit(item);
              }}
            >
              Modifier
            </Button>
          )}
        </>
      }
    >
      <div className="detail-head">
        <Badge tone="info">{humanize(item.type)}</Badge>
        {item.family && item.family !== item.type && <Badge>{humanize(item.family)}</Badge>}
        <StatusBadge status={item.status} />
      </div>
      <code className="uri-line">{item.uri}</code>
      <dl className="detail-list">
        {config.fields.map((f) => {
          const v = record[f.name];
          const shown =
            v === null || v === undefined || v === ""
              ? "—"
              : typeof v === "boolean"
                ? v
                  ? "Oui"
                  : "Non"
                : typeof v === "number"
                  ? `${v.toLocaleString("fr-FR")}${f.unit ? " " + f.unit : ""}`
                  : String(v);
          return (
            <div key={f.name}>
              <dt>
                {f.label} <span className="mono muted">sg:{f.name}</span>
              </dt>
              <dd>{shown}</dd>
            </div>
          );
        })}
      </dl>
      {config.relations.map((r) => (
        <div key={r.key} className="detail-relations">
          <h4>
            {r.label} <code className="inline-code">{r.property}</code>
          </h4>
          {item.relations[r.key]?.length ? (
            <div className="chips">
              {item.relations[r.key].map((x) => (
                <span key={x.id} className="chip">
                  {x.nom} <small>{humanize(x.type)}</small>
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">Aucune relation</p>
          )}
        </div>
      ))}
    </Modal>
  );
}
