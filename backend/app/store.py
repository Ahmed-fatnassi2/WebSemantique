"""In-memory RDF graph loaded from the OWL file; every change is saved to SmartGrid_new.owl (RDF/XML)."""
import threading
from collections import deque
from datetime import datetime, timezone

from rdflib import OWL, RDF, RDFS, XSD, Graph, Namespace

from .config import ONTOLOGY_PATH, WORKING_GRAPH_PATH

SG = Namespace("http://www.esprit.tn/ontologies/smartgrid#")
ONTOLOGY_IRI = "http://www.esprit.tn/ontologies/smartgrid"
PREFIXES = {"sg": SG, "rdf": RDF, "rdfs": RDFS, "owl": OWL, "xsd": XSD}


class GraphStore:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.graph = Graph()
        self.loaded_from = ""
        self.loaded_at = ""
        self.activity: deque = deque(maxlen=100)
        self.load()

    @staticmethod
    def _new_graph() -> Graph:
        g = Graph()
        for prefix, ns in PREFIXES.items():
            g.bind(prefix, ns, override=True)
        return g

    def load(self) -> None:
        with self.lock:
            g = self._new_graph()
            if WORKING_GRAPH_PATH.exists():
                g.parse(WORKING_GRAPH_PATH, format="xml")
                self.loaded_from = "working_copy"
            else:
                if not ONTOLOGY_PATH.exists():
                    raise FileNotFoundError(f"Fichier OWL introuvable : {ONTOLOGY_PATH}")
                g.parse(ONTOLOGY_PATH, format="xml")
                self.loaded_from = "ontology_file"
            self.graph = g
            self.loaded_at = _now()

    def save(self) -> None:
        with self.lock:
            WORKING_GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = WORKING_GRAPH_PATH.with_suffix(".tmp")
            self.graph.serialize(destination=str(tmp), format="xml")
            tmp.replace(WORKING_GRAPH_PATH)
            self.loaded_from = "working_copy"

    def reset(self) -> None:
        """Delete SmartGrid_new.owl and reload the original OWL file."""
        with self.lock:
            if WORKING_GRAPH_PATH.exists():
                WORKING_GRAPH_PATH.unlink()
            self.load()
            self.log("reset", "graphe", None, "Graphe réinitialisé depuis le fichier OWL")

    def log(self, action: str, entity_type: str, entity_id: str | None, message: str) -> None:
        self.activity.appendleft(
            {
                "timestamp": _now(),
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "message": message,
            }
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


store = GraphStore()
