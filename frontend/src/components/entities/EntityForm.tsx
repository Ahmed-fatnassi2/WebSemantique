import { useEffect, useMemo, useState } from "react";
import type { BaseEntity, EntityPayload, TypeOption } from "../../types";
import { humanize } from "../../utils/format";
import { parseError } from "../../utils/errors";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { EntityConfig, FieldConfig, RelationConfig } from "./types";

type Values = Record<string, string | boolean>;

function initialValues<T extends BaseEntity>(config: EntityConfig<T>, item: T | null): Values {
  const v: Values = { type: item?.type ?? "", id: "" };
  for (const f of config.fields) {
    const raw = item ? (item as unknown as Record<string, unknown>)[f.name] : undefined;
    if (f.kind === "boolean") v[f.name] = raw === undefined || raw === null ? true : Boolean(raw);
    else v[f.name] = raw === undefined || raw === null ? "" : String(raw);
  }
  return v;
}

function validateField(f: FieldConfig, value: string | boolean): string | null {
  if (f.kind === "boolean") return null;
  const s = String(value).trim();
  if (!s) return f.required ? "Champ obligatoire" : null;
  if (f.kind === "number" || f.kind === "integer") {
    const n = Number(s.replace(",", "."));
    if (Number.isNaN(n)) return "Nombre attendu";
    if (f.kind === "integer" && !Number.isInteger(n)) return "Nombre entier attendu";
    if (f.min !== undefined && n < f.min) return `Minimum ${f.min}`;
    if (f.max !== undefined && n > f.max) return `Maximum ${f.max}`;
  }
  if (f.kind === "text" && s.length > 200) return "200 caractères maximum";
  if (f.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Date attendue (AAAA-MM-JJ)";
  return null;
}

function RelationPicker({
  relation,
  selected,
  onChange,
  excludeId,
}: {
  relation: RelationConfig;
  selected: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
}) {
  const [options, setOptions] = useState<BaseEntity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    relation.service
      .all()
      .then(setOptions)
      .catch((e) => setError(parseError(e).message));
  }, [relation.service]);

  const visible = (options ?? []).filter(
    (o) => o.id !== excludeId && `${o.nom} ${o.id}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="field field-full">
      <span className="field-label">
        {relation.label} <code className="inline-code">{relation.property}</code>
      </span>
      {relation.help && <span className="field-help">{relation.help}</span>}
      <div className="relation-picker">
        {error && <span className="field-error">{error}</span>}
        {!options && !error && <span className="muted">Chargement…</span>}
        {options && options.length > 6 && (
          <input className="input input-sm" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
        {options && visible.length === 0 && <span className="muted">Aucune ressource disponible</span>}
        <div className="relation-options">
          {visible.map((o) => (
            <label key={o.id} className={`chip-check ${selected.includes(o.id) ? "checked" : ""}`}>
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{o.nom ?? o.id}</span>
              <small>{humanize(o.type)}</small>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EntityForm<T extends BaseEntity>({
  config,
  item,
  open,
  onClose,
  onSaved,
}: {
  config: EntityConfig<T>;
  item: T | null;
  open: boolean;
  onClose: () => void;
  onSaved: (saved: T, created: boolean) => void;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(config, item));
  const [relations, setRelations] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [typesError, setTypesError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(initialValues(config, item));
    setRelations(
      Object.fromEntries(config.relations.map((r) => [r.key, (item?.relations[r.key] ?? []).map((x) => x.id)])),
    );
    setErrors({});
    setFormError(null);
  }, [open, item, config]);

  useEffect(() => {
    if (!open) return;
    config.service
      .types()
      .then(setTypes)
      .catch((e) => setTypesError(parseError(e).message));
  }, [open, config.service]);

  const grouped = useMemo(() => {
    const groups = new Map<string, TypeOption[]>();
    for (const t of types) {
      const g = t.family ?? "Autres";
      groups.set(g, [...(groups.get(g) ?? []), t]);
    }
    return [...groups.entries()];
  }, [types]);

  // Relations allowed for the selected class (e.g. "recharge" only for a charging station)
  const selectedFamily = types.find((t) => t.id === values.type)?.family ?? null;
  const relationAllowed = (r: RelationConfig) =>
    !r.families || (selectedFamily !== null && r.families.includes(selectedFamily));

  const set = (name: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => {
      if (!(name in e)) return e;
      const rest = { ...e };
      delete rest[name];
      return rest;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!values.type) nextErrors.type = "Choisissez une classe";
    for (const f of config.fields) {
      const err = validateField(f, values[f.name]);
      if (err) nextErrors[f.name] = err;
    }
    const id = String(values.id ?? "").trim();
    if (!item && id && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
      nextErrors.id = "Lettres, chiffres, _ ou -, en commençant par une lettre";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFormError("Corrigez les champs signalés.");
      return;
    }

    // A relation hidden for this class is sent empty, so old links are removed when the class changes
    const sentRelations = Object.fromEntries(
      config.relations.map((r) => [r.key, relationAllowed(r) ? (relations[r.key] ?? []) : []]),
    );
    const payload: EntityPayload = { type: String(values.type), relations: sentRelations };
    if (!item && id) payload.id = id;
    for (const f of config.fields) {
      const v = values[f.name];
      if (f.kind === "boolean") payload[f.name] = Boolean(v);
      else if (f.kind === "number" || f.kind === "integer") {
        const s = String(v).trim();
        payload[f.name] = s ? Number(s.replace(",", ".")) : null;
      } else payload[f.name] = String(v).trim() || null;
    }

    setSaving(true);
    setFormError(null);
    try {
      const saved = item ? await config.service.update(item.id, payload) : await config.service.create(payload);
      onSaved(saved, !item);
    } catch (err) {
      const info = parseError(err);
      setErrors(info.fieldErrors);
      setFormError(info.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? `Modifier · ${item.nom ?? item.id}` : `Ajouter ${config.singular.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" form="entity-form" loading={saving}>
            {item ? "Enregistrer" : "Créer"}
          </Button>
        </>
      }
    >
      <form id="entity-form" className="form-grid" onSubmit={submit} noValidate>
        {formError && <div className="alert alert-danger field-full">{formError}</div>}

        <label className="field">
          <span className="field-label">
            Classe OWL <span className="req">*</span>
          </span>
          <select className="input" value={String(values.type)} onChange={(e) => set("type", e.target.value)}>
            <option value="">— Choisir —</option>
            {grouped.map(([family, opts]) => (
              <optgroup key={family} label={humanize(family)}>
                {opts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {humanize(t.id)}
                    {t.is_family ? " (générique)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {typesError && <span className="field-error">{typesError}</span>}
          {errors.type && <span className="field-error">{errors.type}</span>}
        </label>

        {item ? (
          <div className="field">
            <span className="field-label">Identifiant (URI)</span>
            <code className="input input-readonly mono">sg:{item.id}</code>
          </div>
        ) : (
          <label className="field">
            <span className="field-label">Identifiant (optionnel)</span>
            <input
              className="input mono"
              placeholder="Généré depuis le nom"
              value={String(values.id)}
              onChange={(e) => set("id", e.target.value)}
            />
            {errors.id && <span className="field-error">{errors.id}</span>}
          </label>
        )}

        {config.fields.map((f) => (
          <label key={f.name} className={`field ${f.kind === "boolean" ? "field-inline" : ""}`}>
            {f.kind === "boolean" ? (
              <>
                <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />
                <span className="field-label">{f.label}</span>
              </>
            ) : (
              <>
                <span className="field-label">
                  {f.label}
                  {f.unit && <span className="muted"> ({f.unit})</span>}
                  {f.required && <span className="req"> *</span>}
                </span>
                {f.kind === "select" ? (
                  <select className="input" value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">— Non renseigné —</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`input ${errors[f.name] ? "input-invalid" : ""}`}
                    type={f.kind === "text" ? "text" : f.kind === "date" ? "date" : "number"}
                    inputMode={f.kind === "text" || f.kind === "date" ? undefined : "decimal"}
                    step={f.kind === "integer" ? 1 : f.step ?? "any"}
                    min={f.min}
                    max={f.max}
                    placeholder={f.placeholder}
                    value={String(values[f.name])}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </>
            )}
            {f.help && <span className="field-help">{f.help}</span>}
            {errors[f.name] && <span className="field-error">{errors[f.name]}</span>}
          </label>
        ))}

        {config.relations.filter(relationAllowed).map((r) => (
          <RelationPicker
            key={r.key}
            relation={r}
            selected={relations[r.key] ?? []}
            onChange={(ids) => setRelations((prev) => ({ ...prev, [r.key]: ids }))}
            excludeId={item?.id}
          />
        ))}
        {Object.entries(errors)
          .filter(([k]) => config.relations.some((r) => r.key === k))
          .map(([k, msg]) => (
            <div key={k} className="field-error field-full">
              {msg}
            </div>
          ))}
      </form>
    </Modal>
  );
}
