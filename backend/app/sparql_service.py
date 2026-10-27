"""Execute SPARQL queries and updates against the in-memory graph."""
import time

from pyparsing import ParseException
from rdflib.plugins.sparql import prepareQuery
from rdflib.plugins.sparql.parser import parseUpdate

from .config import SPARQL_MAX_ROWS
from .rdf_utils import term_to_json
from .store import PREFIXES, store

QUERY_TYPES = {
    "SelectQuery": "select",
    "AskQuery": "ask",
    "ConstructQuery": "construct",
    "DescribeQuery": "describe",
}


class SparqlError(Exception):
    pass


class ConfirmationRequired(Exception):
    pass


def analyze(query: str) -> str:
    """Return select | ask | construct | describe | update. Raises SparqlError on bad syntax."""
    if not query or not query.strip():
        raise SparqlError("La requête est vide.")
    try:
        prepared = prepareQuery(query, initNs=PREFIXES)
        return QUERY_TYPES.get(prepared.algebra.name, "select")
    except ParseException as query_exc:
        try:
            parseUpdate(query)
            return "update"
        except ParseException:
            raise SparqlError(f"Erreur de syntaxe SPARQL : {query_exc}") from None
    except Exception as exc:  # noqa: BLE001 - rdflib raises many types
        raise SparqlError(f"Requête invalide : {exc}") from None


def execute(query: str, allow_update: bool = False, read_only: bool = False) -> dict:
    qtype = analyze(query)
    if qtype == "update":
        if read_only:
            raise SparqlError("Seules les requêtes de lecture (SELECT/ASK) sont autorisées ici.")
        if not allow_update:
            raise ConfirmationRequired()
        return _update(query)
    return _read(query, qtype)


def _read(query: str, qtype: str) -> dict:
    started = time.perf_counter()
    with store.lock:
        try:
            result = store.graph.query(query, initNs=PREFIXES)
        except Exception as exc:  # noqa: BLE001
            raise SparqlError(f"Erreur d'exécution : {exc}") from None
        out: dict = {"query_type": qtype, "columns": [], "rows": [], "boolean": None, "truncated": False}
        if qtype == "ask":
            out["boolean"] = bool(result.askAnswer)
        elif qtype == "select":
            cols = [str(v) for v in (result.vars or [])]
            out["columns"] = cols
            for i, row in enumerate(result):
                if i >= SPARQL_MAX_ROWS:
                    out["truncated"] = True
                    break
                out["rows"].append({c: term_to_json(row[c]) for c in cols})
        else:  # construct / describe -> triples
            out["columns"] = ["sujet", "predicat", "objet"]
            for i, (s, p, o) in enumerate(result):
                if i >= SPARQL_MAX_ROWS:
                    out["truncated"] = True
                    break
                out["rows"].append(
                    {"sujet": term_to_json(s), "predicat": term_to_json(p), "objet": term_to_json(o)}
                )
    out["count"] = len(out["rows"])
    out["duration_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return out


def _update(query: str) -> dict:
    started = time.perf_counter()
    with store.lock:
        before = len(store.graph)
        try:
            store.graph.update(query, initNs=PREFIXES)
        except Exception as exc:  # noqa: BLE001
            raise SparqlError(f"Erreur lors de la mise à jour : {exc}") from None
        after = len(store.graph)
        store.save()
        store.log("sparql_update", "graphe", None, f"Mise à jour SPARQL ({after - before:+d} triplets)")
    return {
        "query_type": "update",
        "columns": [],
        "rows": [],
        "boolean": None,
        "truncated": False,
        "count": 0,
        "triples_before": before,
        "triples_after": after,
        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
    }
