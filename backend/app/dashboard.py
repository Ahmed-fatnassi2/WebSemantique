"""Aggregated statistics for the dashboard, computed from the graph."""
from collections import Counter

from . import entities, ontology
from .rdf_utils import all_individuals
from .store import store


def _sum(items, key) -> float:
    return round(sum(it.get(key) or 0 for it in items), 2)


def stats() -> dict:
    sources = entities.list_all(entities.SPECS["sources"])
    storage = entities.list_all(entities.SPECS["storage"])
    buildings = entities.list_all(entities.SPECS["buildings"])
    lines = entities.list_all(entities.SPECS["lines"])

    by_family: dict = {}
    for s in sources:
        fam = s.get("family") or "Autre"
        f = by_family.setdefault(fam, {"family": fam, "count": 0, "puissance": 0, "productionAnnuelle": 0})
        f["count"] += 1
        f["puissance"] += s.get("puissance") or 0
        f["productionAnnuelle"] += s.get("productionAnnuelle") or 0

    charges = [s["tauxCharge"] for s in storage if s.get("tauxCharge") is not None]
    with store.lock:
        g = store.graph
        individual_count = len(all_individuals(g))
        triple_count = len(g)
        activity = list(store.activity)[:10]
    summary = ontology.summary()

    return {
        "counts": {
            "sources": len(sources),
            "sources_actives": sum(1 for s in sources if s["status"] == "actif"),
            "storage": len(storage),
            "buildings": len(buildings),
            "buildings_alimentes": sum(1 for b in buildings if b["status"] == "alimente"),
            "lines": len(lines),
            "individuals": individual_count,
        },
        "totals": {
            "puissance_kw": _sum(sources, "puissance"),
            "production_annuelle": _sum(sources, "productionAnnuelle"),
            "capacite_stockage_kwh": _sum(storage, "capacite"),
            "charge_moyenne": round(sum(charges) / len(charges), 1) if charges else None,
            "consommation_kwh": _sum(buildings, "consommation"),
            "longueur_lignes_km": _sum(lines, "longueur"),
            "capacite_transport_kw": _sum(lines, "capaciteTransport"),
        },
        "production_by_source": [
            {
                "id": s["id"],
                "nom": s["nom"],
                "family": s["family"],
                "type": s["type"],
                "puissance": s.get("puissance"),
                "productionAnnuelle": s.get("productionAnnuelle"),
                "status": s["status"],
            }
            for s in sources
        ],
        "production_by_family": sorted(by_family.values(), key=lambda f: -f["puissance"]),
        "consumption_by_building": [
            {"id": b["id"], "nom": b["nom"], "type": b["type"], "consommation": b.get("consommation")}
            for b in sorted(buildings, key=lambda b: -(b.get("consommation") or 0))
        ],
        "storage_levels": [
            {
                "id": s["id"],
                "nom": s["nom"],
                "type": s["type"],
                "capacite": s.get("capacite"),
                "tauxCharge": s.get("tauxCharge"),
                "status": s["status"],
            }
            for s in storage
        ],
        "status": {
            "sources": dict(Counter(s["status"] for s in sources)),
            "storage": dict(Counter(s["status"] for s in storage)),
            "lines": dict(Counter(line["status"] for line in lines)),
            "buildings": dict(Counter(b["status"] for b in buildings)),
        },
        "graph": {
            "triples": triple_count,
            "classes": summary["classes"],
            "object_properties": summary["object_properties"],
            "data_properties": summary["data_properties"],
        },
        "activity": activity,
    }
