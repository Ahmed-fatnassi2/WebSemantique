"""Three natural-language assistants (Sources, Bâtiments, Lignes): French question -> SPARQL -> results.

Built only with spaCy; no LLM API is used.
"""
import re
import time

from .. import sparql_service
from .core import DOMAINES, analyse, engine_info, get_engine

__all__ = ["DOMAINES", "ask", "engine_info", "warm_up"]


def warm_up() -> None:
    """Load the spaCy model and train the three intent classifiers (called at startup)."""
    get_engine()


def _run_read_only(query: str) -> dict:
    qtype = sparql_service.analyze(query)
    if qtype not in ("select", "ask"):
        raise sparql_service.SparqlError(f"Requête générée de type {qtype.upper()} refusée : lecture seule.")
    code = re.sub(r'"(?:[^"\\]|\\.)*"', '""', query)  # ignore string literals such as "Hors service"
    if re.search(r"\bSERVICE\b", code, re.IGNORECASE):
        raise sparql_service.SparqlError("Les requêtes fédérées (SERVICE) ne sont pas autorisées.")
    return sparql_service.execute(query, read_only=True)


def ask(question: str, domain: str) -> dict:
    started = time.perf_counter()
    question = (question or "").strip()
    dom = DOMAINES[domain]
    response: dict = {
        "question": question,
        "domain": domain,
        "domain_label": dom.label,
        "engine": "spacy",
        "model": None,
        "intent": None,
        "intent_label": None,
        "entities": [],
        "sparql": None,
        "explanation": None,
        "result": None,
        "error": None,
        "warnings": [],
        "analysis": None,
    }
    if not question:
        response["error"] = "La question est vide."
        return response

    out = analyse(question, domain)
    out_of_domain = out.pop("out_of_domain")
    response.update(out)
    response["model"] = engine_info()["spacy_model"]
    if out_of_domain:
        other = next((d.label for d in DOMAINES.values() if d.family == out_of_domain), None)
        hint = f" Posez-la dans l'assistant « {other} »." if other else ""
        response["warnings"].append(f"Cette question ne porte pas sur le domaine « {dom.label} ».{hint}")
    elif out["intent"] == "hors_sujet":
        response["warnings"].append(
            f"La question ne semble pas porter sur le domaine « {dom.label} » (aucune classe ni propriété reconnue)."
        )
    elif out["sparql"]:
        try:
            response["result"] = _run_read_only(out["sparql"])
        except sparql_service.SparqlError as exc:
            response["error"] = str(exc)
    response["duration_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return response
