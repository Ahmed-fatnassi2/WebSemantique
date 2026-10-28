"""Read-only views of the ontology: classes, properties, individuals, network graph."""
from rdflib import OWL, RDF, RDFS, Literal, URIRef

from .rdf_utils import (
    all_individuals,
    comment_of,
    individual_types,
    inverse_map,
    label_of,
    local_name,
    pick_main_type,
    superclasses,
    to_python,
)
from .store import ONTOLOGY_IRI, SG, store

CHARACTERISTICS = {
    OWL.SymmetricProperty: "Symétrique",
    OWL.TransitiveProperty: "Transitive",
    OWL.FunctionalProperty: "Fonctionnelle",
    OWL.InverseFunctionalProperty: "Fonctionnelle inverse",
    OWL.AsymmetricProperty: "Asymétrique",
    OWL.ReflexiveProperty: "Réflexive",
    OWL.IrreflexiveProperty: "Irréflexive",
}

CATEGORY_BASES = [
    ("sources", SG.SourceProduction),
    ("storage", SG.Stockage),
    ("buildings", SG.Batiment),
    ("lines", SG.LigneTransport),
    ("mobility", SG.MobiliteElectrique),
    ("smart", SG.SystemeIntelligent),
    ("weather", SG.ConditionMeteo),
    ("regulation", SG.Reglementation),
]


def _uris(values) -> list[dict]:
    return [{"id": local_name(v), "uri": str(v)} for v in values if isinstance(v, URIRef)]


def summary() -> dict:
    with store.lock:
        g = store.graph
        onto = URIRef(ONTOLOGY_IRI)
        return {
            "iri": ONTOLOGY_IRI,
            "namespace": str(SG),
            "label": label_of(g, onto) if (onto, None, None) in g else "SmartGrid",
            "comment": comment_of(g, onto),
            "triples": len(g),
            "classes": len(set(g.subjects(RDF.type, OWL.Class))),
            "object_properties": len(set(g.subjects(RDF.type, OWL.ObjectProperty))),
            "data_properties": len(set(g.subjects(RDF.type, OWL.DatatypeProperty))),
            "individuals": len(all_individuals(g)),
            "loaded_from": store.loaded_from,
        }


def classes() -> list[dict]:
    with store.lock:
        g = store.graph
        all_classes = sorted(
            {c for c in g.subjects(RDF.type, OWL.Class) if isinstance(c, URIRef)},
            key=lambda c: local_name(c),
        )
        direct: dict = {c: 0 for c in all_classes}
        for ind in all_individuals(g):
            for t in individual_types(g, ind):
                if t in direct:
                    direct[t] += 1
        out = []
        for c in all_classes:
            parents = [p for p in g.objects(c, RDFS.subClassOf) if isinstance(p, URIRef)]
            children = [s for s in g.subjects(RDFS.subClassOf, c) if isinstance(s, URIRef)]
            descendants = set(g.transitive_subjects(RDFS.subClassOf, c))
            out.append(
                {
                    "id": local_name(c),
                    "uri": str(c),
                    "label": label_of(g, c),
                    "comment": comment_of(g, c),
                    "parents": _uris(parents),
                    "children": _uris(sorted(children, key=local_name)),
                    "direct_instances": direct.get(c, 0),
                    "total_instances": sum(direct.get(d, 0) for d in descendants),
                }
            )
        return out


def _usage(g, prop) -> int:
    return sum(1 for _ in g.triples((None, prop, None)))


def object_properties() -> list[dict]:
    with store.lock:
        g = store.graph
        inv = inverse_map(g)
        out = []
        for p in sorted(set(g.subjects(RDF.type, OWL.ObjectProperty)), key=local_name):
            out.append(
                {
                    "id": local_name(p),
                    "uri": str(p),
                    "label": label_of(g, p),
                    "comment": comment_of(g, p),
                    "domain": _uris(g.objects(p, RDFS.domain)),
                    "range": _uris(g.objects(p, RDFS.range)),
                    "inverse": _uris(sorted(inv.get(p, set()), key=local_name)),
                    "characteristics": [
                        name for t, name in CHARACTERISTICS.items() if (p, RDF.type, t) in g
                    ],
                    "super_properties": _uris(g.objects(p, RDFS.subPropertyOf)),
                    "usage": _usage(g, p),
                }
            )
        return out


def data_properties() -> list[dict]:
    with store.lock:
        g = store.graph
        out = []
        for p in sorted(set(g.subjects(RDF.type, OWL.DatatypeProperty)), key=local_name):
            ranges = list(g.objects(p, RDFS.range))
            out.append(
                {
                    "id": local_name(p),
                    "uri": str(p),
                    "label": label_of(g, p),
                    "comment": comment_of(g, p),
                    "domain": _uris(g.objects(p, RDFS.domain)),
                    "range": [
                        {"id": "xsd:" + local_name(r), "uri": str(r)}
                        for r in ranges
                        if isinstance(r, URIRef)
                    ],
                    "characteristics": [
                        name for t, name in CHARACTERISTICS.items() if (p, RDF.type, t) in g
                    ],
                    "usage": _usage(g, p),
                }
            )
        return out


def category_of(g, ind) -> str:
    types = individual_types(g, ind)
    for key, base in CATEGORY_BASES:
        if any(base in superclasses(g, t) for t in types):
            return key
    return "other"


def individuals(class_id: str | None = None) -> list[dict]:
    with store.lock:
        g = store.graph
        allowed = None
        if class_id:
            allowed = set(g.transitive_subjects(RDFS.subClassOf, SG[class_id]))
        out = []
        for ind in all_individuals(g):
            types = individual_types(g, ind)
            if allowed is not None and not any(t in allowed for t in types):
                continue
            out.append(
                {
                    "id": local_name(ind),
                    "uri": str(ind),
                    "label": label_of(g, ind),
                    "types": _uris(types),
                    "category": category_of(g, ind),
                }
            )
        return out


def individual_detail(ind_id: str) -> dict | None:
    with store.lock:
        g = store.graph
        ind = SG[ind_id]
        if (ind, None, None) not in g and (None, None, ind) not in g:
            return None
        types = individual_types(g, ind)
        main = pick_main_type(g, types)
        data, outgoing, incoming = [], [], []
        for p, o in sorted(g.predicate_objects(ind), key=lambda po: local_name(po[0])):
            if p == RDF.type:
                continue
            if isinstance(o, Literal):
                data.append(
                    {
                        "property": local_name(p),
                        "property_uri": str(p),
                        "value": to_python(o),
                        "datatype": ("xsd:" + local_name(o.datatype)) if o.datatype else None,
                    }
                )
            elif isinstance(o, URIRef):
                outgoing.append(
                    {
                        "property": local_name(p),
                        "property_uri": str(p),
                        "target": local_name(o),
                        "target_uri": str(o),
                        "target_label": label_of(g, o),
                    }
                )
        for s, p in sorted(g.subject_predicates(ind), key=lambda sp: local_name(sp[1])):
            if isinstance(s, URIRef) and p != RDF.type:
                incoming.append(
                    {
                        "property": local_name(p),
                        "property_uri": str(p),
                        "source": local_name(s),
                        "source_uri": str(s),
                        "source_label": label_of(g, s),
                    }
                )
        return {
            "id": ind_id,
            "uri": str(ind),
            "label": label_of(g, ind),
            "types": _uris(types),
            "ancestors": _uris(superclasses(g, main)[1:]) if main is not None else [],
            "category": category_of(g, ind),
            "data": data,
            "outgoing": outgoing,
            "incoming": incoming,
        }


STATUS_FIELDS = {
    "sources": lambda g, i: (
        "actif" if to_python(g.value(i, SG.actif)) is True
        else "inactif" if to_python(g.value(i, SG.actif)) is False else "inconnu"
    ),
    "lines": lambda g, i: str(g.value(i, SG.etatLigne) or "inconnu"),
    "storage": lambda g, i: _charge_status(to_python(g.value(i, SG.tauxCharge))),
    "mobility": lambda g, i: (
        "disponible" if to_python(g.value(i, SG.disponible)) is True
        else "indisponible" if to_python(g.value(i, SG.disponible)) is False else "inconnu"
    ),
}


def _charge_status(c) -> str:
    if c is None:
        return "inconnu"
    return "faible" if c < 20 else "moyen" if c < 60 else "eleve"


def network() -> dict:
    """All individuals as nodes, all object-property assertions between them as edges."""
    with store.lock:
        g = store.graph
        obj_props = set(g.subjects(RDF.type, OWL.ObjectProperty))
        symmetric = set(g.subjects(RDF.type, OWL.SymmetricProperty))
        # canonical direction for inverse pairs: the property that declares owl:inverseOf
        canonical = {}
        for p, q in g.subject_objects(OWL.inverseOf):
            canonical[q] = p
        inds = [i for i in all_individuals(g) if (i, RDF.type, SG.Utilisateur) not in g]
        ind_set = set(inds)
        nodes = []
        for ind in inds:
            types = individual_types(g, ind)
            main = pick_main_type(g, types)
            cat = category_of(g, ind)
            props = {
                local_name(p): to_python(o)
                for p, o in g.predicate_objects(ind)
                if isinstance(o, Literal)
            }
            status_fn = STATUS_FIELDS.get(cat)
            nodes.append(
                {
                    "id": local_name(ind),
                    "uri": str(ind),
                    "label": label_of(g, ind),
                    "type": local_name(main) if main is not None else None,
                    "category": cat,
                    "status": status_fn(g, ind) if status_fn else None,
                    "properties": props,
                }
            )
        seen = set()
        edges = []
        for s, p, o in g:
            if p not in obj_props or s not in ind_set or o not in ind_set:
                continue
            prop, src, dst = p, s, o
            if p in canonical:
                prop, src, dst = canonical[p], o, s
            key = (prop, src, dst)
            if prop in symmetric:
                key = (prop, *sorted([src, dst]))
            if key in seen:
                continue
            seen.add(key)
            edges.append(
                {
                    "id": f"{local_name(src)}-{local_name(prop)}-{local_name(dst)}",
                    "source": local_name(src),
                    "target": local_name(dst),
                    "property": local_name(prop),
                    "property_uri": str(prop),
                    "symmetric": prop in symmetric,
                }
            )
        return {"nodes": nodes, "edges": edges}
