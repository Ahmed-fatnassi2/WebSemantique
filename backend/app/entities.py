"""Ontology-driven CRUD for the eight entity families.

Each entity is an owl:NamedIndividual typed with a subclass of a base class
(SourceProduction, Stockage, Batiment, LigneTransport, MobiliteElectrique,
SystemeIntelligent, ConditionMeteo, Reglementation). Data properties and
relations follow the domains/ranges declared in the OWL file.
"""
import re
import unicodedata
from datetime import date
from dataclasses import dataclass, field
from typing import Any, Callable

from rdflib import OWL, RDF, RDFS, XSD, Literal, URIRef

from .rdf_utils import (
    family_of,
    individual_types,
    inverse_map,
    is_instance_of,
    label_of,
    local_name,
    pick_main_type,
    subclasses,
    to_python,
)
from .store import SG, store


class ValidationError(Exception):
    def __init__(self, message: str, errors: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.errors = errors or {}


class NotFoundError(Exception):
    pass


@dataclass
class Field:
    name: str
    datatype: URIRef
    required: bool = False
    min: float | None = None
    max: float | None = None
    choices: list | None = None


@dataclass
class Relation:
    key: str
    prop: URIRef
    target_base: URIRef
    direction: str = "out"  # out: ind -> target, in: target -> ind, sym: both


@dataclass
class EntitySpec:
    key: str
    label: str
    base: URIRef
    fields: list
    relations: list
    status: Callable[[dict], str]
    search_fields: list = field(default_factory=lambda: ["nom"])


def _source_status(d: dict) -> str:
    if d.get("actif") is True:
        return "actif"
    if d.get("actif") is False:
        return "inactif"
    return "inconnu"


def _storage_status(d: dict) -> str:
    charge = d.get("tauxCharge")
    if charge is None:
        return "inconnu"
    if charge < 20:
        return "faible"
    if charge < 60:
        return "moyen"
    return "eleve"


def _line_status(d: dict) -> str:
    return (d.get("etatLigne") or "inconnu").strip() or "inconnu"


def _building_status(d: dict) -> str:
    return "alimente" if d["relations"].get("sources") else "non_alimente"


def _bool_status(prop: str, yes: str, no: str) -> Callable[[dict], str]:
    def status(d: dict) -> str:
        if d.get(prop) is True:
            return yes
        if d.get(prop) is False:
            return no
        return "inconnu"

    return status


def _linked_status(d: dict) -> str:
    return "relie" if any(d["relations"].values()) else "non_relie"


LINE_STATES = ["Bon", "Moyen", "Mauvais", "Hors service"]
ENERGY_CLASSES = ["A", "B", "C", "D", "E", "F", "G"]

SPECS: dict[str, EntitySpec] = {
    "sources": EntitySpec(
        key="sources",
        label="Source de production",
        base=SG.SourceProduction,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("puissance", XSD.int, required=True, min=0),
            Field("rendement", XSD.float, min=0, max=100),
            Field("anneeMiseService", XSD.int, min=1800, max=2100),
            Field("emissionCO2", XSD.float, min=0),
            Field("productionAnnuelle", XSD.float, min=0),
            Field("actif", XSD.boolean),
        ],
        relations=[
            Relation("alimente", SG.alimente, SG.Batiment, "out"),
            Relation("injecteDans", SG.injecteDans, SG.LigneTransport, "out"),
            Relation("stockeePar", SG.stocke, SG.Stockage, "in"),
        ],
        status=_source_status,
    ),
    "storage": EntitySpec(
        key="storage",
        label="Système de stockage",
        base=SG.Stockage,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("capacite", XSD.float, required=True, min=0),
            Field("tauxCharge", XSD.float, required=True, min=0, max=100),
            Field("dureeVieAnnees", XSD.int, min=0),
            Field("rendementStockage", XSD.float, min=0, max=100),
            Field("tempsRechargeHeures", XSD.float, min=0),
            Field("puissanceStockage", XSD.int, min=0),
        ],
        relations=[Relation("stocke", SG.stocke, SG.SourceProduction, "out")],
        status=_storage_status,
    ),
    "buildings": EntitySpec(
        key="buildings",
        label="Bâtiment consommateur",
        base=SG.Batiment,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("consommation", XSD.float, required=True, min=0),
            Field("adresse", XSD.string),
            Field("surface", XSD.float, min=0),
            Field("nbOccupants", XSD.int, min=0),
            Field("anneeConstruction", XSD.int, min=1000, max=2100),
            Field("classeEnergetique", XSD.string, choices=ENERGY_CLASSES),
        ],
        relations=[Relation("sources", SG.alimente, SG.SourceProduction, "in")],
        status=_building_status,
        search_fields=["nom", "adresse"],
    ),
    "lines": EntitySpec(
        key="lines",
        label="Ligne de transport",
        base=SG.LigneTransport,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("capaciteTransport", XSD.float, required=True, min=0),
            Field("longueur", XSD.float, required=True, min=0),
            Field("tension", XSD.float, min=0),
            Field("pertes", XSD.float, min=0, max=100),
            Field("anneePose", XSD.int, min=1800, max=2100),
            Field("etatLigne", XSD.string, choices=LINE_STATES),
        ],
        relations=[
            Relation("connecteeA", SG.estConnecteA, SG.LigneTransport, "sym"),
            Relation("recoitDe", SG.injecteDans, SG.SourceProduction, "in"),
        ],
        status=_line_status,
    ),
    "mobility": EntitySpec(
        key="mobility",
        label="Équipement de mobilité électrique",
        base=SG.MobiliteElectrique,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("puissanceCharge", XSD.int, min=0),
            Field("tempsChargeMinutes", XSD.int, min=0),
            Field("capaciteVehicule", XSD.float, min=0),
            Field("tarifKWh", XSD.float, min=0),
            Field("typeConnecteur", XSD.string),
            Field("disponible", XSD.boolean),
        ],
        relations=[
            Relation("recharge", SG.recharge, SG.VehiculeElectrique, "out"),
            Relation("raccordeeA", SG.estRaccordeeA, SG.LigneTransport, "out"),
            Relation("restitueA", SG.restitueA, SG.LigneTransport, "out"),
        ],
        status=_bool_status("disponible", "disponible", "indisponible"),
        search_fields=["nom", "typeConnecteur"],
    ),
    "systems": EntitySpec(
        key="systems",
        label="Système intelligent",
        base=SG.SystemeIntelligent,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("protocole", XSD.string),
            Field("versionLogiciel", XSD.string),
            Field("frequenceMesure", XSD.int, min=0),
            Field("precisionMesure", XSD.float, min=0, max=100),
            Field("valeurMesuree", XSD.float),
            Field("dateInstallation", XSD.date),
        ],
        relations=[
            Relation("surveille", SG.surveille, SG.LigneTransport, "out"),
            Relation("mesure", SG.mesure, SG.Batiment, "out"),
            Relation("gere", SG.gere, SG.Stockage, "out"),
            Relation("predit", SG.predit, SG.SourceProduction, "out"),
        ],
        status=_linked_status,
        search_fields=["nom", "protocole"],
    ),
    "weather": EntitySpec(
        key="weather",
        label="Condition météo",
        base=SG.ConditionMeteo,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("valeurMeteo", XSD.float, required=True),
            Field("unite", XSD.string),
            Field("region", XSD.string),
            Field("dateReleve", XSD.date),
            Field("dureeHeures", XSD.float, min=0),
            Field("extreme", XSD.boolean),
        ],
        relations=[
            Relation("influence", SG.influence, SG.SourceProduction, "out"),
            Relation("perturbe", SG.perturbe, SG.LigneTransport, "out"),
        ],
        status=_bool_status("extreme", "extreme", "normal"),
        search_fields=["nom", "region"],
    ),
    "regulations": EntitySpec(
        key="regulations",
        label="Texte réglementaire",
        base=SG.Reglementation,
        fields=[
            Field("nom", XSD.string, required=True),
            Field("reference", XSD.string),
            Field("organisme", XSD.string),
            Field("dateEntreeVigueur", XSD.date),
            Field("dureeValiditeAnnees", XSD.int, min=0),
            Field("montantAide", XSD.float, min=0),
            Field("obligatoire", XSD.boolean),
        ],
        relations=[
            Relation("encadre", SG.encadre, SG.SourceProduction, "out"),
            Relation("certifie", SG.certifie, SG.Batiment, "out"),
            Relation("sAppliqueA", SG.sAppliqueA, SG.MobiliteElectrique, "out"),
        ],
        status=_bool_status("obligatoire", "obligatoire", "facultatif"),
        search_fields=["nom", "reference", "organisme"],
    ),
}


def get_spec(key: str) -> EntitySpec:
    spec = SPECS.get(key)
    if spec is None:
        raise NotFoundError(f"Type d'entité inconnu : {key}")
    return spec


# --------------------------------------------------------------------------- read


def _relation_targets(g, ind: URIRef, rel: Relation, inv: dict) -> set:
    targets: set = set()
    inverses = inv.get(rel.prop, set())
    if rel.direction in ("out", "sym"):
        targets |= set(g.objects(ind, rel.prop))
        for q in inverses:
            targets |= set(g.subjects(q, ind))
    if rel.direction in ("in", "sym"):
        targets |= set(g.subjects(rel.prop, ind))
        for q in inverses:
            targets |= set(g.objects(ind, q))
    return {t for t in targets if isinstance(t, URIRef) and t != ind}


def _ref(g, target: URIRef) -> dict:
    t = pick_main_type(g, individual_types(g, target))
    return {
        "id": local_name(target),
        "nom": label_of(g, target),
        "type": local_name(t) if t else None,
    }


def serialize(spec: EntitySpec, ind: URIRef, inv: dict | None = None) -> dict:
    g = store.graph
    inv = inv if inv is not None else inverse_map(g)
    main = pick_main_type(g, individual_types(g, ind), spec.base)
    fam = family_of(g, main, spec.base) if main is not None else None
    item: dict[str, Any] = {
        "id": local_name(ind),
        "uri": str(ind),
        "type": local_name(main) if main is not None else None,
        "family": local_name(fam) if fam is not None else None,
    }
    for f in spec.fields:
        item[f.name] = to_python(g.value(ind, SG[f.name]))
    item["relations"] = {
        rel.key: sorted(
            (_ref(g, t) for t in _relation_targets(g, ind, rel, inv)), key=lambda r: r["id"]
        )
        for rel in spec.relations
    }
    item["status"] = spec.status(item)
    return item


def list_all(spec: EntitySpec) -> list[dict]:
    with store.lock:
        g = store.graph
        inv = inverse_map(g)
        members = subclasses(g, spec.base)
        inds = set()
        for cls in members:
            inds |= {s for s in g.subjects(RDF.type, cls) if isinstance(s, URIRef)}
        return [serialize(spec, i, inv) for i in sorted(inds, key=lambda u: local_name(u).lower())]


def _sort_key(value: Any):
    if value is None:
        return (1, "")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (0, value)
    return (0, str(value).lower())


def query_list(
    spec: EntitySpec,
    search: str | None = None,
    type_filter: str | None = None,
    status: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    page: int = 1,
    page_size: int = 10,
) -> dict:
    items = list_all(spec)
    if search:
        needle = _fold(search)
        items = [
            it
            for it in items
            if any(needle in _fold(str(it.get(f) or "")) for f in spec.search_fields)
            or needle in _fold(it["id"])
            or needle in _fold(it.get("type") or "")
        ]
    if type_filter:
        with store.lock:
            allowed = {local_name(c) for c in subclasses(store.graph, SG[type_filter])}
        items = [it for it in items if it.get("type") in allowed]
    if status:
        items = [it for it in items if it["status"] == status]
    if sort:
        reverse = order == "desc"
        if sort == "id" or sort in {f.name for f in spec.fields} or sort in ("type", "status"):
            items.sort(key=lambda it: _sort_key(it.get(sort)), reverse=reverse)
    total = len(items)
    page_size = max(1, min(page_size, 500))
    page = max(1, page)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


def get_one(spec: EntitySpec, entity_id: str) -> dict:
    with store.lock:
        ind = _existing(spec, entity_id)
        return serialize(spec, ind)


def type_options(spec: EntitySpec) -> list[dict]:
    """Classes an entity of this family can be typed with (whole sub-hierarchy)."""
    with store.lock:
        g = store.graph
        out = []
        for cls in subclasses(g, spec.base):
            if cls == spec.base:
                continue
            fam = family_of(g, cls, spec.base)
            out.append(
                {
                    "id": local_name(cls),
                    "uri": str(cls),
                    "family": local_name(fam) if fam is not None else None,
                    "is_family": fam == cls,
                }
            )
        return sorted(out, key=lambda c: (c["family"] or "", not c["is_family"], c["id"]))


# -------------------------------------------------------------------------- write


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def _slug(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", _fold(text)).strip("_")
    s = "_".join(part.capitalize() if not part.isdigit() else part for part in s.split("_"))
    if not s or not s[0].isalpha():
        s = "Ind_" + s
    return s


def _existing(spec: EntitySpec, entity_id: str) -> URIRef:
    ind = SG[entity_id]
    if not is_instance_of(store.graph, ind, spec.base):
        raise NotFoundError(f"{spec.label} introuvable : {entity_id}")
    return ind


def _cast(f: Field, raw: Any) -> Literal:
    if f.datatype == XSD.boolean:
        if isinstance(raw, bool):
            return Literal(raw, datatype=XSD.boolean)
        if str(raw).lower() in ("true", "1", "oui"):
            return Literal(True, datatype=XSD.boolean)
        if str(raw).lower() in ("false", "0", "non"):
            return Literal(False, datatype=XSD.boolean)
        raise ValueError("doit être vrai ou faux")
    if f.datatype == XSD.int:
        if isinstance(raw, bool):
            raise ValueError("doit être un entier")
        num = float(raw)
        if not num.is_integer():
            raise ValueError("doit être un entier")
        value: Any = int(num)
    elif f.datatype == XSD.float:
        if isinstance(raw, bool):
            raise ValueError("doit être un nombre")
        value = float(raw)
    elif f.datatype == XSD.date:
        try:
            return Literal(date.fromisoformat(str(raw).strip()[:10]), datatype=XSD.date)
        except ValueError:
            raise ValueError("doit être une date (AAAA-MM-JJ)") from None
    else:
        value = str(raw).strip()
        if f.choices and value not in f.choices:
            raise ValueError("valeur non autorisée (" + ", ".join(f.choices) + ")")
        return Literal(value, datatype=XSD.string)
    if f.min is not None and value < f.min:
        raise ValueError(f"doit être ≥ {f.min:g}")
    if f.max is not None and value > f.max:
        raise ValueError(f"doit être ≤ {f.max:g}")
    return Literal(value, datatype=f.datatype)


def _validate(spec: EntitySpec, payload: dict) -> tuple[URIRef, dict, dict]:
    g = store.graph
    errors: dict[str, str] = {}

    type_id = payload.get("type")
    cls = SG[type_id] if type_id else None
    if not type_id:
        errors["type"] = "Le type est obligatoire"
    elif (cls, RDF.type, OWL.Class) not in g or spec.base not in set(
        g.transitive_objects(cls, RDFS.subClassOf)
    ) or cls == spec.base:
        errors["type"] = f"Classe invalide pour {spec.label}"

    values: dict[str, Literal | None] = {}
    for f in spec.fields:
        raw = payload.get(f.name)
        if raw is None or (isinstance(raw, str) and raw.strip() == ""):
            if f.required:
                errors[f.name] = "Champ obligatoire"
            values[f.name] = None
            continue
        try:
            values[f.name] = _cast(f, raw)
        except (TypeError, ValueError) as exc:
            msg = str(exc)
            errors[f.name] = msg if msg.startswith(("doit", "valeur")) else "Format invalide"

    relations: dict[str, list[URIRef]] = {}
    raw_rel = payload.get("relations") or {}
    if not isinstance(raw_rel, dict):
        errors["relations"] = "Format invalide"
        raw_rel = {}
    for rel in spec.relations:
        if rel.key not in raw_rel:
            continue
        ids = raw_rel.get(rel.key) or []
        if not isinstance(ids, list):
            errors[rel.key] = "Liste attendue"
            continue
        if ids and cls is not None and "type" not in errors:
            # The relation must be allowed for this class by the ontology (rdfs:domain / rdfs:range)
            ends = g.objects(rel.prop, RDFS.domain if rel.direction != "in" else RDFS.range)
            allowed = [e for e in ends if isinstance(e, URIRef)]
            ancestors = set(g.transitive_objects(cls, RDFS.subClassOf))
            if allowed and not ancestors & set(allowed):
                names = ", ".join(local_name(a) for a in allowed)
                errors[rel.key] = f"Relation réservée à : {names}"
                continue
        targets = []
        for tid in ids:
            t = SG[str(tid)]
            if not is_instance_of(g, t, rel.target_base):
                errors[rel.key] = f"Ressource invalide : {tid}"
                break
            targets.append(t)
        relations[rel.key] = targets

    if errors:
        raise ValidationError("Certains champs sont invalides", errors)
    assert cls is not None
    return cls, values, relations


def _write(spec: EntitySpec, ind: URIRef, cls: URIRef, values: dict, relations: dict) -> None:
    g = store.graph
    for t in individual_types(g, ind):
        g.remove((ind, RDF.type, t))
    g.add((ind, RDF.type, OWL.NamedIndividual))
    g.add((ind, RDF.type, cls))

    for f in spec.fields:
        g.remove((ind, SG[f.name], None))
        lit = values.get(f.name)
        if lit is not None:
            g.add((ind, SG[f.name], lit))

    inv = inverse_map(g)
    for rel in spec.relations:
        if rel.key not in relations:
            continue
        inverses = inv.get(rel.prop, set())
        for target in _relation_targets(g, ind, rel, inv):
            # remove both the canonical triple and any asserted inverse
            if rel.direction in ("out", "sym"):
                g.remove((ind, rel.prop, target))
                for q in inverses:
                    g.remove((target, q, ind))
            if rel.direction in ("in", "sym"):
                g.remove((target, rel.prop, ind))
                for q in inverses:
                    g.remove((ind, q, target))
        for target in relations[rel.key]:
            if rel.direction == "in":
                g.add((target, rel.prop, ind))
            else:
                g.add((ind, rel.prop, target))


def create(spec: EntitySpec, payload: dict) -> dict:
    with store.lock:
        g = store.graph
        cls, values, relations = _validate(spec, payload)
        wanted = (payload.get("id") or "").strip()
        if wanted:
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_\-]*", wanted):
                raise ValidationError(
                    "Identifiant invalide",
                    {"id": "Lettres, chiffres, _ ou - uniquement, commençant par une lettre"},
                )
            if (SG[wanted], None, None) in g:
                raise ValidationError("Identifiant déjà utilisé", {"id": "Cet identifiant existe déjà"})
            base_id = wanted
        else:
            base_id = _slug(str(values["nom"]))
            n = 2
            candidate = base_id
            while (SG[candidate], None, None) in g or (None, None, SG[candidate]) in g:
                candidate = f"{base_id}_{n}"
                n += 1
            base_id = candidate
        ind = SG[base_id]
        _write(spec, ind, cls, values, relations)
        store.save()
        store.log("create", spec.key, base_id, f"{spec.label} créé(e) : {values['nom']}")
        return serialize(spec, ind)


def update(spec: EntitySpec, entity_id: str, payload: dict) -> dict:
    with store.lock:
        ind = _existing(spec, entity_id)
        cls, values, relations = _validate(spec, payload)
        _write(spec, ind, cls, values, relations)
        store.save()
        store.log("update", spec.key, entity_id, f"{spec.label} modifié(e) : {values['nom']}")
        return serialize(spec, ind)


def delete(spec: EntitySpec, entity_id: str) -> None:
    with store.lock:
        g = store.graph
        ind = _existing(spec, entity_id)
        name = label_of(g, ind)
        g.remove((ind, None, None))
        g.remove((None, None, ind))
        store.save()
        store.log("delete", spec.key, entity_id, f"{spec.label} supprimé(e) : {name}")
