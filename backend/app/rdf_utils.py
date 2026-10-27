"""Small helpers to read the RDF graph."""
from typing import Any, Iterable

from rdflib import OWL, RDF, RDFS, BNode, Graph, Literal, URIRef

from .store import SG

XSD_NS = "http://www.w3.org/2001/XMLSchema#"


def local_name(term: Any) -> str:
    s = str(term)
    if "#" in s:
        return s.rsplit("#", 1)[1]
    return s.rstrip("/").rsplit("/", 1)[-1]


def label_of(g: Graph, term: URIRef) -> str:
    labels = list(g.objects(term, RDFS.label))
    for lab in labels:
        if isinstance(lab, Literal) and lab.language == "fr":
            return str(lab)
    if labels:
        return str(labels[0])
    nom = g.value(term, SG.nom)
    if nom is not None:
        return str(nom)
    return local_name(term)


def comment_of(g: Graph, term: URIRef) -> str | None:
    c = g.value(term, RDFS.comment)
    return str(c) if c is not None else None


def to_python(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Literal):
        py = value.toPython()
        if isinstance(py, (int, float, bool, str)):
            return py
        return str(value)
    return str(value)


def term_to_json(term: Any) -> dict | None:
    """JSON form of an RDF term used for SPARQL result cells."""
    if term is None:
        return None
    if isinstance(term, URIRef):
        return {"type": "uri", "value": str(term), "short": local_name(term)}
    if isinstance(term, BNode):
        return {"type": "bnode", "value": str(term), "short": f"_:{term}"}
    if isinstance(term, Literal):
        return {
            "type": "literal",
            "value": str(term),
            "datatype": str(term.datatype) if term.datatype else None,
            "lang": term.language,
            "short": str(term),
        }
    return {"type": "literal", "value": str(term), "short": str(term)}


def subclasses(g: Graph, cls: URIRef) -> set:
    """cls and all its subclasses (transitive)."""
    return set(g.transitive_subjects(RDFS.subClassOf, cls))


def superclasses(g: Graph, cls: URIRef) -> list:
    """cls and all its ancestors (transitive), closest first."""
    return list(g.transitive_objects(cls, RDFS.subClassOf))


def individual_types(g: Graph, ind: URIRef) -> list:
    return [
        t
        for t in g.objects(ind, RDF.type)
        if isinstance(t, URIRef) and t not in (OWL.NamedIndividual, OWL.Thing)
    ]


def is_instance_of(g: Graph, ind: URIRef, base: URIRef) -> bool:
    return any(base in superclasses(g, t) for t in individual_types(g, ind))


def all_individuals(g: Graph) -> list:
    """Every named individual in the graph (declared, or typed with a declared class)."""
    classes = set(g.subjects(RDF.type, OWL.Class))
    found = set(s for s in g.subjects(RDF.type, OWL.NamedIndividual) if isinstance(s, URIRef))
    for s, o in g.subject_objects(RDF.type):
        if isinstance(s, URIRef) and o in classes:
            found.add(s)
    return sorted(found, key=lambda u: local_name(u).lower())


def inverse_map(g: Graph) -> dict:
    """prop -> set of inverse props (both directions)."""
    inv: dict = {}
    for p, q in g.subject_objects(OWL.inverseOf):
        inv.setdefault(p, set()).add(q)
        inv.setdefault(q, set()).add(p)
    return inv


def pick_main_type(g: Graph, types: Iterable[URIRef], base: URIRef | None = None) -> URIRef | None:
    """The most specific type (the one with the most ancestors), optionally under base."""
    candidates = [t for t in types if base is None or base in superclasses(g, t)]
    if not candidates:
        candidates = list(types)
    if not candidates:
        return None
    return max(candidates, key=lambda t: len(superclasses(g, t)))


def family_of(g: Graph, cls: URIRef, base: URIRef) -> URIRef | None:
    """The ancestor of cls that sits directly under base (e.g. Solaire for Photovoltaique)."""
    chain = superclasses(g, cls)
    if base not in chain:
        return None
    for c in chain:
        if (c, RDFS.subClassOf, base) in g:
            return c
    return cls if cls != base else None
