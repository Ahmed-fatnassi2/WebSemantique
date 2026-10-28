"""Shared pieces of the three NLP assistants (Sources, Bâtiments, Lignes).

Each domain file (domaine_sources.py, domaine_batiments.py, domaine_lignes.py)
fills one `Domaine`: its vocabulary, its status words and its training questions.
"""
import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Domaine:
    key: str  # "sources" | "batiments" | "lignes"
    label: str  # shown in the interface
    family: str  # top class of the domain in the ontology (sg:SourceProduction…)
    # ontology id -> French words. Classes of every domain are shared, so that the
    # other end of a relation is recognised ("Qui alimente l'hôpital ?" on the Sources page).
    classes: dict[str, list[str]]
    properties: dict[str, list[str]]  # data properties of this domain
    relations: dict[str, list[str]]  # object properties of this domain
    # (regex on the accent-free question, property, value). A value "\\1" takes the regex group.
    statuses: list[tuple[str, str, object]]
    unit_property: dict[str, str]  # unit -> property when no property word is written
    default_property: str  # measure used by "le plus", "total"… without a property word
    year_property: str | None  # property compared to a year ("avant 2000"), None if the table has no date
    training: dict[str, list[str]]  # intent -> example questions (spaCy classifier)
    examples: list[str]  # shown in the interface
    # "le plus ancien" = smallest year: words that reverse the superlative order
    reversed_words: list[str] = field(default_factory=list)


# ------------------------------------------------------------------ intents
INTENT_LABELS: dict[str, str] = {
    "lister_entites": "Lister des entités",
    "filtre_numerique": "Filtre numérique",
    "relation": "Relation entre entités",
    "comptage": "Comptage",
    "agregation": "Agrégation (somme, moyenne, max, min)",
    "superlatif": "Superlatif (le plus / le moins)",
    "verification": "Vérification (ASK)",
    "detail_individu": "Détail d'un individu",
    "valeur_propriete": "Valeur d'une propriété",
    "hors_sujet": "Hors sujet",
}

# Top classes of the hierarchy and the variable name used in the SPARQL queries
FAMILY_VAR: dict[str, str] = {
    "SourceProduction": "source",
    "Stockage": "stockage",
    "Batiment": "batiment",
    "LigneTransport": "ligne",
    "MobiliteElectrique": "mobilite",
    "SystemeIntelligent": "systeme",
    "ConditionMeteo": "meteo",
    "Reglementation": "reglement",
}

# Measure used when a question about another family has no property word
DEFAULT_PROPERTY: dict[str, str] = {
    "SourceProduction": "puissance",
    "Stockage": "capacite",
    "Batiment": "consommation",
    "LigneTransport": "capaciteTransport",
}

# ---------------------------------------------------------------- values
UNITS: dict[str, tuple[str, float]] = {
    # unit -> (canonical unit, multiplier)
    "kw": ("kW", 1), "mw": ("kW", 1000), "gw": ("kW", 1_000_000),
    "kwh": ("kWh", 1), "mwh": ("kWh", 1000), "gwh": ("kWh", 1_000_000),
    "%": ("%", 1), "pourcent": ("%", 1), "pourcents": ("%", 1),
    "km": ("km", 1), "kilometre": ("km", 1), "kilometres": ("km", 1),
    "kv": ("kV", 1), "m2": ("m²", 1), "m²": ("m²", 1), "ans": ("ans", 1), "an": ("ans", 1),
    # weather
    "km/h": ("km/h", 1), "°c": ("°C", 1), "degre": ("°C", 1), "degres": ("°C", 1), "mm": ("mm", 1),
    "w/m2": ("W/m²", 1), "h": ("h", 1), "heure": ("h", 1), "heures": ("h", 1),
    "min": ("min", 1), "minute": ("min", 1), "minutes": ("min", 1),
    # money (subsidies)
    "dt": ("DT", 1), "tnd": ("DT", 1), "dinar": ("DT", 1), "dinars": ("DT", 1),
}

# Words for the families that have a CRUD page but no NLP assistant of their own
# (so they can still be the other end of a relation: "Quelles normes s'appliquent aux bornes ?").
EXTRA_CLASS_WORDS: dict[str, list[str]] = {
    "MobiliteElectrique": ["mobilité électrique", "équipement de mobilité"],
    "BorneRecharge": ["borne", "borne de recharge"],
    "StationRecharge": ["station de recharge"],
    "VehiculeElectrique": ["véhicule", "véhicule électrique"],
    "VoitureElectrique": ["voiture", "voiture électrique"],
    "BusElectrique": ["bus", "bus électrique"],
    "ParkingSmart": ["parking"],
    "SystemeIntelligent": ["système intelligent"],
    "CapteurIoT": ["capteur"],
    "CompteurIntelligent": ["compteur", "compteur intelligent"],
    "PlateformeGestion": ["plateforme"],
    "ModelePrediction": ["modèle de prévision", "modèle de prédiction"],
    "SystemeAlerte": ["alerte"],
    "ConditionMeteo": ["condition météo", "météo", "condition climatique", "phénomène météo"],
    "Ensoleillement": ["ensoleillement", "soleil", "rayonnement"],
    "Precipitation": ["précipitation"],
    "Pluie": ["pluie"],
    "Neige": ["neige"],
    "Temperature": ["température"],
    "Canicule": ["canicule", "vague de chaleur"],
    "VagueFroid": ["vague de froid"],
    "Vent": ["vent"],
    "VentFort": ["vent fort", "tempête"],
    "Humidite": ["humidité"],
    "Reglementation": ["réglementation", "règlementation", "texte réglementaire"],
    "Label": ["label"],
    "Loi": ["loi"],
    "Norme": ["norme"],
    "Certification": ["certification"],
    "Subvention": ["subvention"],
}

# Comparators, matched on the accent-free lowercase question (longest first)
COMPARATORS: list[tuple[str, str]] = [
    (r"superieure? ou egale? a|au moins|minimum de|>=|≥", ">="),
    (r"inferieure? ou egale? a|au plus|au maximum|maximum de|<=|≤", "<="),
    (r"plus de|plus que|superieure?s? a|au[- ]dessus de|depass\w*|excede\w*|>", ">"),
    (r"moins de|moins que|inferieure?s? a|en[- ]dessous de|sous les|<", "<"),
    (r"egale? a|exactement|=", "="),
    (r"\bapres\b|\bdepuis\b", ">"),
    (r"\bavant\b", "<"),
]

AGGREGATES: list[tuple[str, str]] = [
    (r"\b(total|totale|somme|cumul\w*|au total)\b", "SUM"),
    (r"\b(moyenne|moyen)\b(?! etat)", "AVG"),
    (r"\b(maximum|maximale?|max)\b", "MAX"),
    (r"\b(minimum|minimale?|min)\b", "MIN"),
]

# Yes/no questions (ASK): only at the start of the question
VERIFICATION = re.compile(r"^\W*(?:est[- ]ce qu\w*|y a[- ]t[- ]il|existe[- ]t[- ]il|est[- ]il vrai que)")

# Counting questions
COUNT = re.compile(r"\bcombien\b|\bnombre (?:de|d')|\bcompte\b")

SUPERLATIVE = re.compile(r"\b(le|la|les|l')\s*(plus|moins)\b|\bmeilleure?\b")


def split_camel(name: str) -> str:
    """'EolienTerrestre' -> 'eolien terrestre'"""
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name).replace("_", " ").lower()
