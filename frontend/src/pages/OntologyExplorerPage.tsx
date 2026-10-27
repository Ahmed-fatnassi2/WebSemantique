import { ArrowLeft, ArrowRight, Boxes, Download, GitBranch, Link2, ListTree, Tag, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClassTree } from "../components/ontology/ClassTree";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, PageHeader } from "../components/ui/Card";
import { CopyButton } from "../components/ui/CopyButton";
import { SearchInput } from "../components/ui/SearchInput";
import { BackendRequired, EmptyState, ErrorState, Loader } from "../components/ui/States";
import { Tabs } from "../components/ui/Tabs";
import { useBackend } from "../context/BackendContext";
import { useToast } from "../context/ToastContext";
import { useAsync } from "../hooks/useAsync";
import { ontologyService } from "../services/ontologyService";
import type { DataProperty, ObjectProperty, OntologyClass, UriRef } from "../types";
import { errorMessage } from "../utils/errors";
import { humanize } from "../utils/format";
import { CATEGORY_META } from "../utils/labels";

type TabKey = "classes" | "object" | "data" | "individuals";

function UriChips({ items, onClick }: { items: UriRef[]; onClick?: (id: string) => void }) {
  if (!items.length) return <span className="muted">—</span>;
  return (
    <div className="chips">
      {items.map((x) =>
        onClick ? (
          <button key={x.uri} className="chip chip-link" onClick={() => onClick(x.id)} title={x.uri}>
            {x.id}
          </button>
        ) : (
          <span key={x.uri} className="chip mono" title={x.uri}>
            {x.id}
          </span>
        ),
      )}
    </div>
  );
}

// ------------------------------------------------------------- classes tab

function ClassDetail({
  cls,
  classes,
  objectProps,
  dataProps,
  onSelectClass,
  onSelectIndividual,
}: {
  cls: OntologyClass;
  classes: OntologyClass[];
  objectProps: ObjectProperty[];
  dataProps: DataProperty[];
  onSelectClass: (id: string) => void;
  onSelectIndividual: (id: string) => void;
}) {
  // ancestors, to show properties inherited from super-classes
  const ancestors = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    const out: string[] = [];
    const walk = (id: string) => {
      for (const p of byId.get(id)?.parents ?? []) {
        if (!out.includes(p.id)) {
          out.push(p.id);
          walk(p.id);
        }
      }
    };
    walk(cls.id);
    return out;
  }, [cls, classes]);

  const scope = [cls.id, ...ancestors];
  const asDomainObj = objectProps.filter((p) => p.domain.some((d) => scope.includes(d.id)));
  const asRangeObj = objectProps.filter((p) => p.range.some((r) => scope.includes(r.id)));
  const asDomainData = dataProps.filter((p) => p.domain.length === 0 || p.domain.some((d) => scope.includes(d.id)));
  const instances = useAsync(() => ontologyService.individuals(cls.id), [cls.id]);

  return (
    <div className="class-detail">
      <div className="detail-title">
        <h2>{humanize(cls.id)}</h2>
        <Badge tone="info" mono>
          owl:Class
        </Badge>
      </div>
      <div className="uri-row">
        <code className="uri-line">{cls.uri}</code>
        <CopyButton text={cls.uri} label="URI" />
      </div>
      {cls.comment && <p>{cls.comment}</p>}

      <div className="breadcrumb-classes">
        {[...ancestors].reverse().map((a) => (
          <span key={a}>
            <button className="link-btn" onClick={() => onSelectClass(a)}>
              {a}
            </button>
            <ArrowRight size={12} />
          </span>
        ))}
        <strong>{cls.id}</strong>
      </div>

      <dl className="detail-list two-cols">
        <div>
          <dt>Super-classes directes</dt>
          <dd>
            <UriChips items={cls.parents} onClick={onSelectClass} />
          </dd>
        </div>
        <div>
          <dt>Sous-classes directes</dt>
          <dd>
            <UriChips items={cls.children} onClick={onSelectClass} />
          </dd>
        </div>
        <div>
          <dt>Instances directes</dt>
          <dd className="num">{cls.direct_instances}</dd>
        </div>
        <div>
          <dt>Instances (sous-classes incluses)</dt>
          <dd className="num">{cls.total_instances}</dd>
        </div>
      </dl>

      <h4 className="section-title">Propriétés applicables {ancestors.length > 0 && <span className="muted">(héritées incluses)</span>}</h4>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Propriété</th>
              <th>Type</th>
              <th>Domaine</th>
              <th>Portée / type de données</th>
            </tr>
          </thead>
          <tbody>
            {asDomainObj.map((p) => (
              <tr key={p.uri}>
                <td className="mono">sg:{p.id}</td>
                <td><Badge tone="info">ObjectProperty</Badge></td>
                <td className="mono">{p.domain.map((d) => d.id).join(", ")}</td>
                <td className="mono">{p.range.map((r) => r.id).join(", ")}</td>
              </tr>
            ))}
            {asDomainData.map((p) => (
              <tr key={p.uri}>
                <td className="mono">sg:{p.id}</td>
                <td><Badge tone="success">DatatypeProperty</Badge></td>
                <td className="mono">{p.domain.map((d) => d.id).join(", ") || "—"}</td>
                <td className="mono">{p.range.map((r) => r.id).join(", ")}</td>
              </tr>
            ))}
            {asDomainObj.length + asDomainData.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Aucune propriété n'a cette classe (ou ses ancêtres) pour domaine.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {asRangeObj.length > 0 && (
        <>
          <h4 className="section-title">Cible des propriétés</h4>
          <div className="chips">
            {asRangeObj.map((p) => (
              <span key={p.uri} className="chip mono">
                {p.domain.map((d) => d.id).join("|")} → sg:{p.id} → {cls.id}
              </span>
            ))}
          </div>
        </>
      )}

      <h4 className="section-title">Individus</h4>
      {instances.loading ? (
        <Loader />
      ) : instances.error ? (
        <ErrorState message={instances.error} onRetry={instances.reload} />
      ) : !instances.data?.length ? (
        <p className="muted">Aucun individu de cette classe (ni de ses sous-classes).</p>
      ) : (
        <div className="chips">
          {instances.data.map((i) => (
            <button key={i.uri} className="chip chip-link" onClick={() => onSelectIndividual(i.id)}>
              {i.label} <small>{i.types.map((t) => t.id).join(", ")}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- properties tabs

function ObjectPropertiesTable({ items, filter, onClass }: { items: ObjectProperty[]; filter: string; onClass: (id: string) => void }) {
  const rows = items.filter((p) => p.id.toLowerCase().includes(filter.toLowerCase()));
  if (!rows.length) return <EmptyState title="Aucune propriété objet" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Propriété</th>
            <th>Domaine</th>
            <th>Portée</th>
            <th>Inverse</th>
            <th>Caractéristiques</th>
            <th className="align-right">Assertions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.uri}>
              <td>
                <div className="cell-title">
                  <div>
                    <strong className="mono">sg:{p.id}</strong>
                    <small className="muted mono" title={p.uri}>{p.uri}</small>
                  </div>
                </div>
              </td>
              <td><UriChips items={p.domain} onClick={onClass} /></td>
              <td><UriChips items={p.range} onClick={onClass} /></td>
              <td><UriChips items={p.inverse} /></td>
              <td>
                {p.characteristics.length ? (
                  <div className="chips">
                    {p.characteristics.map((c) => (
                      <Badge key={c} tone="warning">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="align-right num">{p.usage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataPropertiesTable({ items, filter, onClass }: { items: DataProperty[]; filter: string; onClass: (id: string) => void }) {
  const rows = items.filter((p) => p.id.toLowerCase().includes(filter.toLowerCase()));
  if (!rows.length) return <EmptyState title="Aucune propriété de données" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Propriété</th>
            <th>Domaine</th>
            <th>Type de données (range)</th>
            <th className="align-right">Assertions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.uri}>
              <td>
                <div className="cell-title">
                  <div>
                    <strong className="mono">sg:{p.id}</strong>
                    <small className="muted mono">{p.uri}</small>
                  </div>
                </div>
              </td>
              <td>{p.domain.length ? <UriChips items={p.domain} onClick={onClass} /> : <span className="muted">Non restreint</span>}</td>
              <td>
                {p.range.map((r) => (
                  <Badge key={r.uri} tone="success" mono>
                    {r.id}
                  </Badge>
                ))}
              </td>
              <td className="align-right num">{p.usage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------- individuals tab

function IndividualsPanel({
  selected,
  onSelect,
  filter,
  onClass,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onClass: (id: string) => void;
}) {
  const list = useAsync(() => ontologyService.individuals(), []);
  const detail = useAsync(() => (selected ? ontologyService.individual(selected) : Promise.resolve(null)), [selected]);
  const rows = (list.data ?? []).filter((i) => `${i.label} ${i.id} ${i.types.map((t) => t.id).join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="split">
      <div className="split-list">
        {list.loading ? (
          <Loader />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun individu" />
        ) : (
          <ul className="list-select">
            {rows.map((i) => (
              <li key={i.uri}>
                <button className={selected === i.id ? "selected" : ""} onClick={() => onSelect(i.id)}>
                  <span className="family-dot" style={{ background: CATEGORY_META[i.category].color }} />
                  <span>
                    <strong>{i.label}</strong>
                    <small className="mono muted">{i.types.map((t) => t.id).join(", ")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="split-detail">
        {!selected ? (
          <EmptyState icon={<Users size={22} />} title="Sélectionnez un individu" message="Ses propriétés et relations s'afficheront ici." />
        ) : detail.loading ? (
          <Loader />
        ) : detail.error ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : (
          detail.data && (
            <div className="class-detail">
              <div className="detail-title">
                <h2>{detail.data.label}</h2>
                <Badge tone="info" mono>
                  owl:NamedIndividual
                </Badge>
              </div>
              <div className="uri-row">
                <code className="uri-line">{detail.data.uri}</code>
                <CopyButton text={detail.data.uri} label="URI" />
              </div>
              <dl className="detail-list two-cols">
                <div>
                  <dt>rdf:type</dt>
                  <dd><UriChips items={detail.data.types} onClick={onClass} /></dd>
                </div>
                <div>
                  <dt>Classes ancêtres (inférées)</dt>
                  <dd><UriChips items={detail.data.ancestors} onClick={onClass} /></dd>
                </div>
              </dl>

              <h4 className="section-title"><Tag size={14} /> Propriétés de données</h4>
              {detail.data.data.length === 0 ? (
                <p className="muted">Aucune.</p>
              ) : (
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Propriété</th>
                      <th>Valeur</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.data.map((d, idx) => (
                      <tr key={idx}>
                        <td className="mono">sg:{d.property}</td>
                        <td>{String(d.value)}</td>
                        <td className="mono muted">{d.datatype ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 className="section-title"><ArrowRight size={14} /> Relations sortantes</h4>
              {detail.data.outgoing.length === 0 ? (
                <p className="muted">Aucune.</p>
              ) : (
                <ul className="relation-list">
                  {detail.data.outgoing.map((r, idx) => (
                    <li key={idx}>
                      <span className="mono">sg:{r.property}</span>
                      <ArrowRight size={14} />
                      <button className="chip chip-link" onClick={() => onSelect(r.target)}>{r.target_label}</button>
                    </li>
                  ))}
                </ul>
              )}

              <h4 className="section-title"><ArrowLeft size={14} /> Relations entrantes</h4>
              {detail.data.incoming.length === 0 ? (
                <p className="muted">Aucune.</p>
              ) : (
                <ul className="relation-list">
                  {detail.data.incoming.map((r, idx) => (
                    <li key={idx}>
                      <button className="chip chip-link" onClick={() => onSelect(r.source)}>{r.source_label}</button>
                      <ArrowRight size={14} />
                      <span className="mono">sg:{r.property}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- page

export default function OntologyExplorerPage() {
  const { demo, version } = useBackend();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(params.get("individual") ? "individuals" : "classes");
  const [filter, setFilter] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(params.get("class") ?? "SourceProduction");
  const [selectedInd, setSelectedInd] = useState<string | null>(params.get("individual"));
  const [exporting, setExporting] = useState(false);

  const data = useAsync(async () => {
    if (demo) return null;
    const [summary, classes, objectProps, dataProps] = await Promise.all([
      ontologyService.summary(),
      ontologyService.classes(),
      ontologyService.objectProperties(),
      ontologyService.dataProperties(),
    ]);
    return { summary, classes, objectProps, dataProps };
  }, [version, demo]);

  // keep the URL in sync, so a selection can be shared or bookmarked
  useEffect(() => {
    const next = new URLSearchParams();
    if (tab === "individuals" && selectedInd) next.set("individual", selectedInd);
    if (tab === "classes" && selectedClass) next.set("class", selectedClass);
    setParams(next, { replace: true });
  }, [tab, selectedInd, selectedClass, setParams]);

  const goClass = (id: string) => {
    setSelectedClass(id);
    setTab("classes");
    setFilter("");
  };
  const goIndividual = (id: string) => {
    setSelectedInd(id);
    setTab("individuals");
    setFilter("");
  };

  const exportGraph = async (format: "turtle" | "xml") => {
    setExporting(true);
    try {
      const blob = await ontologyService.export(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "xml" ? "smartgrid.owl" : "smartgrid.ttl";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setExporting(false);
    }
  };

  if (demo) {
    return (
      <div className="page">
        <PageHeader title="Explorateur d'ontologie" icon={<ListTree size={22} />} description="Classes, propriétés et individus OWL." />
        <BackendRequired feature="L'explorateur d'ontologie" />
      </div>
    );
  }

  const d = data.data;
  const cls = d?.classes.find((c) => c.id === selectedClass) ?? null;

  return (
    <div className="page">
      <PageHeader
        title="Explorateur d'ontologie"
        icon={<ListTree size={22} />}
        description={d ? d.summary.comment ?? d.summary.label : "Classes, propriétés et individus OWL."}
        actions={
          <>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportGraph("turtle")} loading={exporting}>
              Turtle
            </Button>
            <Button variant="secondary" icon={<Download size={16} />} onClick={() => exportGraph("xml")} disabled={exporting}>
              RDF/XML
            </Button>
          </>
        }
      />

      {data.error ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : !d ? (
        <Loader label="Lecture de l'ontologie…" />
      ) : (
        <>
          <div className="onto-summary">
            <div className="onto-iri">
              <span className="muted">IRI</span>
              <code>{d.summary.iri}</code>
              <CopyButton text={d.summary.namespace} label="Namespace" />
            </div>
            <div className="kpi-strip compact">
              <div className="kpi"><span>Triplets</span><strong>{d.summary.triples}</strong></div>
              <div className="kpi"><span>Classes</span><strong>{d.summary.classes}</strong></div>
              <div className="kpi"><span>ObjectProperties</span><strong>{d.summary.object_properties}</strong></div>
              <div className="kpi"><span>DataProperties</span><strong>{d.summary.data_properties}</strong></div>
              <div className="kpi"><span>Individus</span><strong>{d.summary.individuals}</strong></div>
            </div>
          </div>

          <Card padded={false}>
            <div className="toolbar">
              <Tabs<TabKey>
                active={tab}
                onChange={(k) => {
                  setTab(k);
                  setFilter("");
                }}
                items={[
                  { key: "classes", label: "Classes", icon: <GitBranch size={14} />, count: d.summary.classes },
                  { key: "object", label: "ObjectProperties", icon: <Link2 size={14} />, count: d.summary.object_properties },
                  { key: "data", label: "DataProperties", icon: <Tag size={14} />, count: d.summary.data_properties },
                  { key: "individuals", label: "Individus", icon: <Boxes size={14} />, count: d.summary.individuals },
                ]}
              />
              <SearchInput value={filter} onChange={setFilter} placeholder="Filtrer…" />
            </div>

            {tab === "classes" && (
              <div className="split">
                <div className="split-list">
                  <ClassTree classes={d.classes} selected={selectedClass} onSelect={setSelectedClass} filter={filter} />
                </div>
                <div className="split-detail">
                  {cls ? (
                    <ClassDetail
                      cls={cls}
                      classes={d.classes}
                      objectProps={d.objectProps}
                      dataProps={d.dataProps}
                      onSelectClass={setSelectedClass}
                      onSelectIndividual={goIndividual}
                    />
                  ) : (
                    <EmptyState title="Sélectionnez une classe" />
                  )}
                </div>
              </div>
            )}
            {tab === "object" && <ObjectPropertiesTable items={d.objectProps} filter={filter} onClass={goClass} />}
            {tab === "data" && <DataPropertiesTable items={d.dataProps} filter={filter} onClass={goClass} />}
            {tab === "individuals" && <IndividualsPanel selected={selectedInd} onSelect={setSelectedInd} filter={filter} onClass={goClass} />}
          </Card>
        </>
      )}
    </div>
  );
}
