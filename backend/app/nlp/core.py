"""Shared spaCy engine of the three NLP assistants: French question -> intent + entities + SPARQL.

Only spaCy is used (no NLTK, no scikit-learn, no LLM API):
 1. spaCy fr_core_news_sm: tokens, lemmas, part-of-speech tags, dependencies.
 2. Normalised form of each token: spaCy lemma, accents removed, then a few suffix
    rules (plural, feminine, verb endings) so "centrales", "alimentées" and
    "consomment" match "centrale", "alimenter" and "consommation".
 3. spaCy PhraseMatchers on the normalised forms: classes and individuals of the
    ontology, data and object properties of the chosen domain.
 4. Numbers (spaCy like_num), units, comparators, status words, aggregates.
 5. Intent: a spaCy TextCategorizer (bag of words), one per domain,
    trained on that domain's questions. Questions are "delexicalised" first
    (ontology words replaced by CLASSE, INDIVIDU, NOMBRE…) so the model learns
    the shape of the question, not the vocabulary.
 6. Coherence rules between the intent and the extracted slots.
 7. SPARQL built from templates, executed by RDFLib (read only).
"""
from __future__ import annotations

import random
import re
import threading
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field

import spacy
from rdflib import OWL, RDF, RDFS, XSD, URIRef
from spacy.matcher import Matcher, PhraseMatcher
from spacy.matcher.levenshtein import levenshtein
from spacy.tokens import Doc, Span
from spacy.training import Example
from spacy.util import filter_spans, fix_random_seed, minibatch

from ..rdf_utils import all_individuals, individual_types, inverse_map, label_of, local_name, pick_main_type
from ..store import SG, store
from . import common as cm
from .common import INTENT_LABELS, Domaine
from .domaine_batiments import DOMAINE as BATIMENTS
from .domaine_lignes import DOMAINE as LIGNES
from .domaine_meteo import DOMAINE as METEO
from .domaine_sources import DOMAINE as SOURCES

SPACY_MODEL = "fr_core_news_sm"
DOMAINES: dict[str, Domaine] = {d.key: d for d in (SOURCES, BATIMENTS, LIGNES, METEO)}
PREFIXES = (
    "PREFIX sg: <http://www.esprit.tn/ontologies/smartgrid#>\n"
    "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n"
    "PREFIX owl: <http://www.w3.org/2002/07/owl#>\n"
)
AGG_NAMES = {"SUM": "total", "AVG": "moyenne", "MAX": "maximum", "MIN": "minimum"}
EPOCHS = 40
LEARN_RATE = 0.03


def fold(text: str) -> str:
    """Lowercase, accents removed, same length as the input (keeps char offsets)."""
    out = []
    for ch in text.lower():
        f = unicodedata.normalize("NFKD", ch).encode("ascii", "ignore").decode()
        out.append(f[:1] if f else ch)
    return "".join(out)


def racine(word: str, pos: str = "") -> str:
    """Suffix rules applied after the spaCy lemma.

    centrales/centrale -> central, alimentée/alimenter -> aliment,
    consomment/consommer -> consomm, éolienne/éolien -> eolien.
    """
    w = fold(word.lower().strip("'’"))
    if len(w) > 3 and w[-1] in "sx" and not w.endswith("ss"):
        w = w[:-1]  # plural
    if pos in ("VERB", "AUX") and len(w) > 6 and w.endswith("ent"):
        w = w[:-3]  # verb not lemmatised: "consomment"
    for suf in ("ee", "er", "e"):  # feminine, infinitive, past participle
        if len(w) - len(suf) >= 4 and w.endswith(suf):
            w = w[: -len(suf)]
            break
    if w.endswith("nn"):
        w = w[:-1]  # eolienn -> eolien
    return w


def is_number(token) -> bool:
    """Digits or number words, but not the articles "un" / "une"."""
    return token.like_num and token.pos_ != "DET"


def normalise(token) -> str:
    return racine(token.lemma_ or token.text, token.pos_)


# --------------------------------------------------------------- data types


@dataclass
class Mention:
    kind: str  # CLASS | IND | PROP | REL
    id: str
    text: str
    start: int  # token index (-1 when deduced)
    end: int
    char: int
    corrected_from: str | None = None  # word with a typo, matched with the fuzzy matcher


@dataclass
class NumberValue:
    value: float
    text: str
    token: int
    char: int
    unit: str | None = None
    comparator: str | None = None
    comparator_text: str | None = None
    prop: str | None = None


@dataclass
class Slots:
    target: Mention | None = None
    other: Mention | None = None
    relation: Mention | None = None
    properties: list[Mention] = field(default_factory=list)
    numbers: list[NumberValue] = field(default_factory=list)
    statuses: list[tuple[str, object, str]] = field(default_factory=list)
    aggregate: tuple[str, str] | None = None
    superlative: tuple[str, str] | None = None  # (DESC|ASC, text)
    out_of_domain: str | None = None  # family of a target outside the domain
    notes: list[str] = field(default_factory=list)  # rules applied while filling the slots


# --------------------------------------------------------- spaCy classifier


def train_textcat(texts: list[str], labels: list[str], seed: int = 0):
    """spaCy TextCategorizer (bag of words, exclusive classes)."""
    model = spacy.blank("fr")
    textcat = model.add_pipe(
        "textcat",
        config={
            "model": {
                "@architectures": "spacy.TextCatBOW.v3",
                "exclusive_classes": True,
                "ngram_size": 1,
                "no_output_layer": False,
                "length": 4096,  # size of the n-gram hash table (small vocabulary)
            }
        },
    )
    cats = sorted(set(labels))
    for c in cats:
        textcat.add_label(c)
    examples = [
        Example.from_dict(model.make_doc(t), {"cats": {c: float(c == y) for c in cats}}) for t, y in zip(texts, labels)
    ]
    fix_random_seed(seed)
    rng = random.Random(seed)
    optimizer = model.initialize(lambda: examples)
    optimizer.learn_rate = LEARN_RATE
    for _ in range(EPOCHS):
        rng.shuffle(examples)
        for batch in minibatch(examples, size=4):
            model.update(batch, sgd=optimizer, drop=0.0)
    return model


def predict(model, text: str) -> list[tuple[str, float]]:
    cats = model(text).cats
    return sorted(((k, float(v)) for k, v in cats.items()), key=lambda x: -x[1])


def cross_validate(texts: list[str], labels: list[str], k: int = 5) -> float:
    """Stratified k-fold accuracy, computed with spaCy only."""
    by_label: dict[str, list[int]] = defaultdict(list)
    for i, label in enumerate(labels):
        by_label[label].append(i)
    folds: list[list[int]] = [[] for _ in range(k)]
    rng = random.Random(42)
    for idx in by_label.values():
        rng.shuffle(idx)
        for j, i in enumerate(idx):
            folds[j % k].append(i)
    correct = 0
    for fold_idx in folds:
        test = set(fold_idx)
        train = [i for i in range(len(texts)) if i not in test]
        model = train_textcat([texts[i] for i in train], [labels[i] for i in train])
        correct += sum(predict(model, texts[i])[0][0] == labels[i] for i in fold_idx)
    return correct / len(texts)


# ------------------------------------------------------------------ engine


class DomainAnalyzer:
    """One NLP assistant: the domain vocabulary + its own trained classifier."""

    def __init__(self, engine: "Engine", dom: Domaine) -> None:
        self.engine = engine
        self.dom = dom
        self.matcher = PhraseMatcher(engine.nlp.vocab, attr="NORM")
        for pid, words in dom.properties.items():
            engine.add_patterns(self.matcher, f"PROP|{pid}", [cm.split_camel(pid), *words])
        for pid, words in dom.relations.items():
            engine.add_patterns(self.matcher, f"REL|{pid}", words)
        self.fuzzy, self.fuzzy_targets = self._build_fuzzy_matcher()
        self.texts: list[str] = []
        self.labels: list[str] = []
        for intent, questions in dom.training.items():
            for q in questions:
                doc = engine.parse(q)
                self.texts.append(self.delexicalise(doc, self.mentions(doc)))
                self.labels.append(intent)
        self.classifier = train_textcat(self.texts, self.labels)
        self.cv_accuracy: float | None = None

    def _build_fuzzy_matcher(self):
        """spaCy Matcher with the FUZZY operator (Levenshtein distance) on single words,
        to accept typos: "longeur" -> longueur, "puisance" -> puissance."""
        vocab: dict[str, list[str]] = {}
        for cid, words in self.engine.class_words.items():
            vocab[f"CLASS|{cid}"] = words
        for pid, words in self.dom.properties.items():
            vocab[f"PROP|{pid}"] = [cm.split_camel(pid), *words]
        for pid, words in self.dom.relations.items():
            vocab[f"REL|{pid}"] = words
        matcher = Matcher(self.engine.nlp.vocab)
        targets: dict[str, list[str]] = {}  # key -> normalised words, to pick the closest one
        for key, phrases in vocab.items():
            norms = set()
            for phrase in phrases:
                doc = self.engine.parse(phrase)
                if len(doc) == 1 and len(doc[0].norm_) >= 5:  # short words: too many false matches
                    norms.add(doc[0].norm_)
            if norms:
                patterns = [[{"NORM": {"FUZZY1" if len(n) < 9 else "FUZZY2": n}}] for n in sorted(norms)]
                matcher.add(key, patterns)
                targets[key] = sorted(norms)
        return matcher, targets

    def mentions(self, doc: Doc) -> list[Mention]:
        spans = []
        for matcher in (self.engine.individual_matcher, self.engine.class_matcher, self.matcher):
            for match_id, start, end in matcher(doc):
                spans.append(Span(doc, start, end, label=self.engine.nlp.vocab.strings[match_id]))
        # Longest match wins ("centrale solaire" beats "centrale", "Ferme Solaire 01" beats both)
        kept = filter_spans(spans)
        out = []
        for s in kept:
            kind, _, ident = s.label_.partition("|")
            out.append(Mention(kind, ident, s.text, s.start, s.end, s.start_char))

        # Typos: words not recognised exactly, matched by edit distance (closest word wins)
        covered = {i for s in kept for i in range(s.start, s.end)}
        best: dict[int, tuple[int, str]] = {}
        for match_id, start, _ in self.fuzzy(doc):
            t = doc[start]
            if start in covered or t.is_stop or t.like_num or len(t.text) < 5:
                continue
            key = self.engine.nlp.vocab.strings[match_id]
            # typos rarely touch the first letter: "élevée" must not become "relevé"
            close = [n for n in self.fuzzy_targets[key] if n[:1] == t.norm_[:1]]
            if not close:
                continue
            dist = min(levenshtein(t.norm_, n) for n in close)
            if start not in best or dist < best[start][0]:
                best[start] = (dist, key)
        for i, (_, key) in best.items():
            kind, _, ident = key.partition("|")
            out.append(Mention(kind, ident, doc[i].text, i, i + 1, doc[i].idx, corrected_from=doc[i].text))
        return sorted(out, key=lambda m: m.start)

    def delexicalise(self, doc: Doc, mentions: list[Mention]) -> str:
        """Classifier input: ontology words and question cues replaced by placeholders.

        "Quelle est la centrale la plus puissante ?" -> "quel etre le CLASSE SUPERLATIF PROPRIETE ?"
        """
        names = {"CLASS": "CLASSE", "IND": "INDIVIDU", "PROP": "PROPRIETE", "REL": "RELATION"}
        labels = {i: names[m.kind] for m in mentions for i in range(m.start, m.end)}
        folded = fold(doc.text)  # same length as the text: character offsets stay valid
        cues = [
            ("VERIF", cm.VERIFICATION),
            ("COMPTE", cm.COUNT),
            ("SUPERLATIF", cm.SUPERLATIVE),
            ("AGREGAT", re.compile("|".join(p for p, _ in cm.AGGREGATES))),
            ("COMPARATEUR", re.compile("|".join(p for p, _ in cm.COMPARATORS[:5]))),
        ]
        for name, pattern in cues:
            for m in pattern.finditer(folded):
                span = doc.char_span(m.start(), m.end(), alignment_mode="expand")
                if span is not None and not any(i in labels for i in range(span.start, span.end)):
                    for i in range(span.start, span.end):
                        labels[i] = name
        placeholders = set(names.values()) | {c for c, _ in cues}
        words: list[str] = []
        for t in doc:
            if t.is_punct and t.text != "?":
                continue
            if t.i in labels:
                w = labels[t.i]
            elif is_number(t):
                w = "NOMBRE"
            elif fold(t.text) in cm.UNITS:
                w = "UNITE"
            else:
                w = t.norm_  # normalised form: "quelles" -> "quel", "sont" -> "etre"
            if not words or words[-1] != w or w not in placeholders:
                words.append(w)
        return " ".join(words)

    def classify(self, delex: str) -> list[tuple[str, float]]:
        return predict(self.classifier, delex)


class Engine:
    def __init__(self) -> None:
        self.nlp = spacy.load(SPACY_MODEL, exclude=["ner"])
        self.model_version = self.nlp.meta.get("version", "?")
        self.lock = threading.Lock()
        self.class_matcher = PhraseMatcher(self.nlp.vocab, attr="NORM")
        self.individual_matcher = PhraseMatcher(self.nlp.vocab, attr="NORM")
        self._graph_signature: tuple | None = None
        with store.lock:
            self._build_class_matcher(store.graph)
            self.refresh_individuals()
            self.domains = {k: DomainAnalyzer(self, d) for k, d in DOMAINES.items()}
        threading.Thread(target=self._evaluate, daemon=True).start()

    def _evaluate(self) -> None:
        # Cross-validation is slower than training: done in the background after startup.
        for analyzer in self.domains.values():
            analyzer.cv_accuracy = cross_validate(analyzer.texts, analyzer.labels)

    def parse(self, text: str) -> Doc:
        doc = self.nlp(text)
        for t in doc:
            t.norm_ = normalise(t)
        return doc

    def add_patterns(self, matcher: PhraseMatcher, key: str, phrases) -> None:
        docs = [self.parse(p) for p in {p.strip() for p in phrases if p and p.strip()}]
        if docs:
            matcher.add(key, docs)

    def _build_class_matcher(self, g) -> None:
        """Every class of the OWL file (CamelCase name) + the French words of all three domains."""
        words: dict[str, list[str]] = defaultdict(list)
        for c in g.subjects(RDF.type, OWL.Class):
            if isinstance(c, URIRef):
                words[local_name(c)].append(cm.split_camel(local_name(c)))
        for dom in DOMAINES.values():
            for cid, syns in dom.classes.items():
                words[cid].extend(syns)
        for cid, syns in cm.EXTRA_CLASS_WORDS.items():
            words[cid].extend(syns)
        for cid, phrases in words.items():
            self.add_patterns(self.class_matcher, f"CLASS|{cid}", phrases)
        self.class_words = dict(words)

    def refresh_individuals(self) -> None:
        """Individuals change with CRUD operations: rebuild their patterns when the graph changes."""
        g = store.graph
        signature = (id(g), len(g))
        if signature == self._graph_signature:
            return
        matcher = PhraseMatcher(self.nlp.vocab, attr="NORM")
        for ind in all_individuals(g):
            iid = local_name(ind)
            self.add_patterns(matcher, f"IND|{iid}", [label_of(g, ind), iid.replace("_", " ")])
        self.individual_matcher = matcher
        self._graph_signature = signature


_engine: Engine | None = None
_init_lock = threading.Lock()


def get_engine() -> Engine:
    global _engine
    with _init_lock:
        if _engine is None:
            _engine = Engine()
        return _engine


# ------------------------------------------------------------ ontology helpers


def _ancestors(g, cls_id: str) -> list[str]:
    return [local_name(c) for c in g.transitive_objects(SG[cls_id], RDFS.subClassOf)]


def _class_of(g, m: Mention | None) -> str | None:
    if m is None:
        return None
    if m.kind == "CLASS":
        return m.id
    if m.kind == "IND":
        t = pick_main_type(g, individual_types(g, SG[m.id]))
        return local_name(t) if t is not None else None
    return None


def _family(g, cls_id: str | None) -> str | None:
    """Top class of the hierarchy (SourceProduction, Stockage, Batiment…)."""
    if not cls_id:
        return None
    for c in _ancestors(g, cls_id):
        if not any(isinstance(p, URIRef) for p in g.objects(SG[c], RDFS.subClassOf)):
            return c
    return cls_id


def _domains(g, prop_id: str) -> list[str]:
    return [local_name(d) for d in g.objects(SG[prop_id], RDFS.domain)]


def _ranges(g, prop_id: str) -> list[str]:
    return [local_name(r) for r in g.objects(SG[prop_id], RDFS.range)]


def _families(g, classes: list[str]) -> set[str | None]:
    return {_family(g, c) for c in classes}


def _connects(g, prop_id: str, fam_a: str, fam_b: str) -> bool:
    """Does the object property link the two families (in either direction)?"""
    dom, rng = _families(g, _domains(g, prop_id)), _families(g, _ranges(g, prop_id))
    return (fam_a in dom and fam_b in rng) or (fam_b in dom and fam_a in rng)


def _link_property(g, fam_a: str, fam_b: str) -> str | None:
    """Object property of the ontology between two families, from fam_a to fam_b if possible."""
    props = sorted(local_name(p) for p in g.subjects(RDF.type, OWL.ObjectProperty))
    forward = [p for p in props if fam_a in _families(g, _domains(g, p)) and fam_b in _families(g, _ranges(g, p))]
    backward = [p for p in props if fam_b in _families(g, _domains(g, p)) and fam_a in _families(g, _ranges(g, p))]
    return (forward or backward or [None])[0]


def _default_property(dom: Domaine, family: str | None) -> str | None:
    if family == dom.family:
        return dom.default_property
    return cm.DEFAULT_PROPERTY.get(family or "")


# ------------------------------------------------------------ slot filling


def _numbers(doc: Doc, mentions: list[Mention], folded: str) -> list[NumberValue]:
    inside_names = {i for m in mentions if m.kind == "IND" for i in range(m.start, m.end)}
    nums: list[NumberValue] = []
    i = 0
    while i < len(doc):
        t = doc[i]
        if is_number(t) and i not in inside_names:
            raw = t.text
            j = i + 1
            # "100 000" -> 100000
            while j < len(doc) and len(doc[j].text) == 3 and doc[j].text.isdigit():
                raw += doc[j].text
                j += 1
            try:
                value = float(raw.replace(",", ".").replace(" ", "").replace(" ", ""))
            except ValueError:
                i += 1
                continue
            unit = None
            for size in (3, 2, 1):  # "km/h" is split by spaCy into "km", "/", "h"
                word = fold("".join(tok.text for tok in doc[j : j + size]))
                if j + size <= len(doc) and word in cm.UNITS:
                    unit_name, mult = cm.UNITS[word]
                    unit, value = unit_name, value * mult
                    j += size - 1
                    break
            nums.append(NumberValue(value, raw, i, t.idx, unit))
            if unit:
                j += 1
            i = j
        else:
            i += 1
    # comparator just before each number
    found = []
    for pattern, op in cm.COMPARATORS:
        for m in re.finditer(pattern, folded):
            found.append((m.start(), m.end(), op, m.group(0)))
    for n in nums:
        before = [c for c in found if c[1] <= n.char and n.char - c[1] <= 30]
        if before:
            c = max(before, key=lambda c: (c[1], c[1] - c[0]))
            n.comparator, n.comparator_text = c[2], c[3]
    # "entre 100 et 500"
    if re.search(r"entre\s+(\S+)\s+(?:\S+\s+)?et\s+(\S+)", folded) and len(nums) >= 2:
        nums[0].comparator, nums[0].comparator_text = ">=", "entre"
        nums[1].comparator, nums[1].comparator_text = "<=", "et"
    return nums


def fill_slots(g, dom: Domaine, doc: Doc, mentions: list[Mention], question: str) -> Slots:
    folded = fold(question)
    slots = Slots()
    entities = [m for m in mentions if m.kind in ("CLASS", "IND")]
    relations = [m for m in mentions if m.kind == "REL"]
    slots.properties = [m for m in mentions if m.kind == "PROP"]
    slots.relation = relations[0] if relations else None
    raw_numbers = _numbers(doc, mentions, folded)
    status_hits = [(p, prop, v) for p, prop, v in dom.statuses if re.search(p, folded)]

    if entities:
        slots.target = entities[0]
        rest = entities[1:]
        if slots.relation and slots.target.start > slots.relation.start:
            # "Qui alimente l'hôpital ?": the only entity is after the verb, so it is the object;
            # the target is the class at the other end of the relation.
            rel = slots.relation.id
            obj = slots.target
            anc = set(_ancestors(g, _class_of(g, obj) or ""))
            other_end = _domains(g, rel) if anc & set(_ranges(g, rel)) else _ranges(g, rel)
            if other_end:
                slots.other = obj
                slots.target = Mention("CLASS", other_end[0], "", -1, -1, -1)
                rest = []
        if rest and slots.other is None:
            slots.other = rest[0]
    elif slots.properties or slots.relation or status_hits or any(n.unit for n in raw_numbers):
        # "Quel est le plus énergivore ?" on the Buildings page: the domain class is the target
        slots.target = Mention("CLASS", dom.family, "", -1, -1, -1)

    target_cls = _class_of(g, slots.target)
    family = _family(g, target_cls)

    # Two entities of different families ("les sources de l'école"): the relation between
    # them is read from the ontology when the question has no verb for it (or a wrong one).
    other_family = _family(g, _class_of(g, slots.other))
    if family and other_family and family != other_family:
        if not (slots.relation and _connects(g, slots.relation.id, family, other_family)):
            link = _link_property(g, family, other_family)
            if link:
                before = f"« {slots.relation.text} » (sg:{slots.relation.id}) ne relie pas ces classes ; " if slots.relation else ""
                slots.relation = Mention("REL", link, "", -1, -1, -1)
                slots.notes.append(
                    f"{before}relation déduite de l'ontologie entre sg:{family} et sg:{other_family} → sg:{link}."
                )

    # Is the question about this domain?
    if slots.target is not None and family != dom.family:
        rel_families = set()
        if slots.relation:
            rel = slots.relation.id
            rel_families = {_family(g, c) for c in _domains(g, rel) + _ranges(g, rel)}
        if dom.family not in rel_families:
            slots.out_of_domain = family

    # numbers -> property (closest property word, else unit, else default measure)
    slots.numbers = [n for n in raw_numbers if n.comparator]
    for n in slots.numbers:
        if slots.properties:
            n.prop = min(slots.properties, key=lambda p: abs(p.start - n.token)).id
        elif n.unit and family == dom.family and n.unit in dom.unit_property:
            n.prop = dom.unit_property[n.unit]
        elif not n.unit and family == dom.family and n.value.is_integer() and 1800 <= n.value <= 2100:
            n.prop = dom.year_property  # "avant 2000" is a year
        else:
            n.prop = _default_property(dom, family)

    # status words of this domain ("hors service", "classe A"…)
    # status words inside a name ("Norme IEC 01", "Vent Sfax 01") are not filters
    names = [(m.char, m.char + len(m.text)) for m in mentions if m.kind == "IND"]
    for pattern, prop, value in dom.statuses:
        m = next((x for x in re.finditer(pattern, folded) if not any(a < x.end() and x.start() < b for a, b in names)), None)
        if not m or any(s[0] == prop for s in slots.statuses):
            continue
        doms = _domains(g, prop)
        if family and doms and family not in doms:
            continue
        if value == "\\1":
            word = m.group(1)  # value read in the question: "classe A", "à Sfax"
            value = word.upper() if len(word) == 1 else word.title()
        slots.statuses.append((prop, value, m.group(0)))

    for pattern, func in cm.AGGREGATES:
        m = re.search(pattern, folded)
        if m:
            slots.aggregate = (func, m.group(0))
            break
    m = cm.SUPERLATIVE.search(folded)
    if m:
        order = "ASC" if "moins" in m.group(0) else "DESC"
        # "le plus ancien" = the smallest year, "la plus courte" = the smallest length
        if any(fold(p.text) in dom.reversed_words for p in slots.properties):
            order = "ASC" if order == "DESC" else "DESC"
        slots.superlative = (order, m.group(0))
    return slots


# ----------------------------------------------------------- intent rules


def decide_intent(ranked: list[tuple[str, float]], slots: Slots, dom: Domaine) -> tuple[str, list[str]]:
    notes: list[str] = []
    intent = ranked[0][0]
    if slots.target is None:
        if intent != "hors_sujet":
            notes.append("Aucune classe, individu ni propriété de l'ontologie reconnu → hors sujet.")
        return "hors_sujet", notes
    if slots.out_of_domain:
        notes.append(
            f"La question porte sur sg:{slots.out_of_domain}, pas sur le domaine « {dom.label} » → hors domaine."
        )
        return "hors_sujet", notes
    # "Quelle est la surface de l'école ?": a property asked without filter -> its value
    simple = not (slots.numbers or slots.statuses or slots.relation)
    if intent == "valeur_propriete" and not slots.properties:
        intent = "detail_individu" if slots.target.kind == "IND" else "lister_entites"
        notes.append(f"Aucune propriété demandée → « {intent} ».")
    if intent in ("lister_entites", "detail_individu") and slots.properties and simple:
        notes.append(f"Propriété demandée sans filtre → valeur de la propriété (au lieu de « {intent} »).")
        intent = "valeur_propriete"
    if intent == "detail_individu" and slots.target.kind != "IND":
        intent = "lister_entites"
        notes.append("Aucun individu nommé → liste des entités.")
    if intent == "filtre_numerique" and not slots.numbers:
        intent = "relation" if slots.relation else "lister_entites"
        notes.append(f"Aucune valeur numérique comparée → « {intent} ».")
    if intent == "lister_entites" and slots.numbers:
        intent = "filtre_numerique"
        notes.append("Une valeur numérique comparée a été trouvée → filtre numérique.")
    if intent == "lister_entites" and slots.relation and slots.other:
        intent = "relation"
        notes.append("Une relation entre deux entités a été trouvée → relation.")
    if intent == "superlatif" and not slots.superlative:
        slots.superlative = ("DESC", "")
    if intent == "agregation" and not slots.aggregate:
        slots.aggregate = ("SUM", "")
        notes.append("Fonction d'agrégation non précisée → somme.")
    return intent, notes


# --------------------------------------------------------------- SPARQL


def build_sparql(g, dom: Domaine, intent: str, slots: Slots) -> tuple[str | None, str]:
    t = slots.target
    if t is None:
        return None, "Aucune ressource de l'ontologie n'a été reconnue."
    target_cls = _class_of(g, t)
    family = _family(g, target_cls)
    x = "?" + cm.FAMILY_VAR.get(family or "", "element")
    nom_x = "?nom" + x[1:].capitalize()
    where: list[str] = []
    select: list[str] = [x, nom_x]
    explain: list[str] = []

    if intent == "detail_individu" and t.kind == "IND":
        q = PREFIXES + f"SELECT ?propriete ?valeur WHERE {{\n  sg:{t.id} ?propriete ?valeur .\n}}\nORDER BY ?propriete"
        return q, f"Toutes les propriétés de l'individu sg:{t.id}."

    if t.kind == "IND":
        where.append(f"VALUES {x} {{ sg:{t.id} }}")
        explain.append(f"l'individu sg:{t.id}")
    else:
        where.append(f"{x} a/rdfs:subClassOf* sg:{t.id} .")
        explain.append(f"les instances de sg:{t.id} (sous-classes incluses)")

    # numeric filters
    bound: set[str] = set()
    for n in slots.numbers:
        if not n.prop:
            continue
        var = "?" + n.prop
        if var not in bound:
            where.append(f"{x} sg:{n.prop} {var} .")
            bound.add(var)
            select.append(var)
        value = int(n.value) if n.value.is_integer() else n.value
        if (SG[n.prop], RDFS.range, XSD.date) in g:
            where.append(f"FILTER(YEAR({var}) {n.comparator} {value})")  # "après 2015" on a date
        else:
            where.append(f"FILTER({var} {n.comparator} {value})")
        explain.append(f"sg:{n.prop} {n.comparator} {value}{' ' + n.unit if n.unit else ''}")

    # status filters
    for prop, value, _ in slots.statuses:
        var = "?" + prop
        where.append(f"{x} sg:{prop} {var} .")
        if isinstance(value, bool):
            where.append(f"FILTER({var} = {'true' if value else 'false'})")
        else:
            where.append(f'FILTER(CONTAINS(LCASE(STR({var})), "{str(value).lower()}"))')
        select.append(var)
        explain.append(f"sg:{prop} = {value}")

    # relation
    if slots.relation:
        rel = slots.relation.id
        o = slots.other
        o_family = _family(g, _class_of(g, o)) if o else None
        y = "?" + cm.FAMILY_VAR.get(o_family or "", "cible")
        if y == x:
            y = x + "2"
        nom_y = "?nom" + y[1:].capitalize()
        dom_classes = set(_domains(g, rel))
        rng_classes = set(_ranges(g, rel))
        t_anc = set(_ancestors(g, target_cls)) if target_cls else set()
        symmetric = (SG[rel], RDF.type, OWL.SymmetricProperty) in g
        inverses = [local_name(q) for q in inverse_map(g).get(SG[rel], set())]
        if symmetric:
            where.append(f"{{ {x} sg:{rel} {y} }} UNION {{ {y} sg:{rel} {x} }}")
        elif t_anc & dom_classes or not (t_anc & rng_classes):
            alt = f" UNION {{ {y} sg:{inverses[0]} {x} }}" if inverses else ""
            where.append(f"{{ {x} sg:{rel} {y} }}{alt}")
        else:
            alt = f" UNION {{ {x} sg:{inverses[0]} {y} }}" if inverses else ""
            where.append(f"{{ {y} sg:{rel} {x} }}{alt}")
        if o and o.kind == "IND":
            where.append(f"VALUES {y} {{ sg:{o.id} }}")
            explain.append(f"reliés par sg:{rel} à sg:{o.id}")
        elif o:
            where.append(f"{y} a/rdfs:subClassOf* sg:{o.id} .")
            explain.append(f"reliés par sg:{rel} à une instance de sg:{o.id}")
        else:
            explain.append(f"avec leur relation sg:{rel}")
        select += [y, nom_y]
        where.append(f"OPTIONAL {{ {y} sg:nom {nom_y} }}")

    where.append(f"OPTIONAL {{ {x} sg:nom {nom_x} }}")

    def block(lines: list[str]) -> str:
        return "\n".join("  " + line for line in lines)

    if intent == "verification":
        core = [w for w in where if not w.startswith("OPTIONAL")]
        return PREFIXES + "ASK {\n" + block(core) + "\n}", "Vérifie s'il existe " + ", ".join(explain) + "."

    if intent == "comptage":
        q = PREFIXES + f"SELECT (COUNT(DISTINCT {x}) AS ?nombre) WHERE {{\n" + block(where) + "\n}"
        return q, "Compte " + ", ".join(explain) + "."

    if intent in ("agregation", "superlatif"):
        prop = slots.properties[0].id if slots.properties else _default_property(dom, family)
        if not prop:
            return None, "Impossible de déterminer la propriété à agréger."
        var = "?" + prop
        if var not in bound:
            where.insert(1, f"{x} sg:{prop} {var} .")
        if intent == "agregation":
            func = slots.aggregate[0] if slots.aggregate else "SUM"
            core = [w for w in where if not w.startswith("OPTIONAL")]
            q = (
                PREFIXES
                + f"SELECT ({func}({var}) AS ?{AGG_NAMES[func]}) (COUNT(DISTINCT {x}) AS ?nombre) WHERE {{\n"
                + block(core)
                + "\n}"
            )
            return q, f"{AGG_NAMES[func].capitalize()} de sg:{prop} pour " + ", ".join(explain) + "."
        order = slots.superlative[0] if slots.superlative else "DESC"
        cols = " ".join(dict.fromkeys([x, nom_x, var] + [s for s in select if s not in (x, nom_x)]))
        q = PREFIXES + f"SELECT {cols} WHERE {{\n" + block(where) + f"\n}}\nORDER BY {order}({var})\nLIMIT 1"
        word = "Plus grande" if order == "DESC" else "Plus petite"
        return q, f"{word} valeur de sg:{prop} parmi " + ", ".join(explain) + "."

    if intent == "valeur_propriete":
        props = list(dict.fromkeys(p.id for p in slots.properties))
        cols = [x, nom_x] + ["?" + p for p in props]
        lines = where[:1] + [f"OPTIONAL {{ {x} sg:{p} ?{p} }}" for p in props] + where[1:]
        head = f"SELECT DISTINCT {' '.join(cols)} WHERE {{\n"
        q = PREFIXES + head + block(lines) + f"\n}}\nORDER BY {nom_x}"
        names = ", ".join(f"sg:{p}" for p in props)
        return q, f"Valeur de {names} pour " + ", ".join(explain) + "."

    # lister_entites / filtre_numerique / relation
    if t.kind == "CLASS" and not slots.relation:
        where.insert(1, f"{x} a ?type . ?type rdfs:subClassOf* sg:{t.id} .")
        select.insert(2, "?type")
    cols = " ".join(dict.fromkeys(select))
    number_props = {n.prop for n in slots.numbers}
    order_var = next((s for s in select if s[1:] in number_props), nom_x)
    order = f"DESC({order_var})" if order_var != nom_x else nom_x
    q = PREFIXES + f"SELECT DISTINCT {cols} WHERE {{\n" + block(where) + f"\n}}\nORDER BY {order}"
    return q, "Recherche " + ", ".join(explain) + "."


# ------------------------------------------------------------------ public


ENTITY_TYPES = {"CLASS": "classe", "IND": "individu", "PROP": "propriete", "REL": "relation"}


def analyse(question: str, domain: str) -> dict:
    engine = get_engine()
    analyzer = engine.domains[domain]
    dom = analyzer.dom
    with store.lock:
        g = store.graph
        with engine.lock:
            engine.refresh_individuals()
            doc = engine.parse(question)
            mentions = analyzer.mentions(doc)
            delex = analyzer.delexicalise(doc, mentions)
            ranked = analyzer.classify(delex)
        slots = fill_slots(g, dom, doc, mentions, question)
        intent, notes = decide_intent(ranked, slots, dom)
        corrections = [
            f"Correction orthographique (Matcher FUZZY spaCy) : « {m.corrected_from} » → sg:{m.id}."
            for m in mentions
            if m.corrected_from
        ]
        notes = corrections + slots.notes + notes
        sparql, explanation = None, f"La question ne porte pas sur le domaine « {dom.label} »."
        if intent != "hors_sujet":
            sparql, explanation = build_sparql(g, dom, intent, slots)

    entities = [{"type": ENTITY_TYPES[m.kind], "value": m.id, "text": m.text} for m in mentions]
    if slots.target and slots.target.start == -1:
        entities.insert(0, {"type": "classe", "value": slots.target.id, "text": "(déduit)"})
    if slots.relation and slots.relation.start == -1:
        entities.append({"type": "relation", "value": slots.relation.id, "text": "(déduite de l'ontologie)"})
    for n in slots.numbers:
        entities.append({"type": "comparateur", "value": n.comparator, "text": n.comparator_text or ""})
        entities.append({"type": "valeur", "value": f"{n.value:g}", "text": n.text})
        if n.unit:
            entities.append({"type": "unite", "value": n.unit, "text": n.unit})
    for prop, value, text in slots.statuses:
        entities.append({"type": "statut", "value": f"{prop} = {value}", "text": text})
    if slots.aggregate and intent == "agregation":
        entities.append({"type": "agregation", "value": slots.aggregate[0], "text": slots.aggregate[1]})
    if slots.superlative and intent == "superlatif":
        entities.append({"type": "superlatif", "value": slots.superlative[0], "text": slots.superlative[1]})

    return {
        "intent": intent,
        "intent_label": INTENT_LABELS.get(intent, intent),
        "entities": entities,
        "sparql": sparql,
        "explanation": explanation,
        "out_of_domain": slots.out_of_domain,
        "analysis": {
            "tokens": [
                {"text": t.text, "lemma": t.lemma_, "pos": t.pos_, "dep": t.dep_, "head": t.head.text, "norm": t.norm_}
                for t in doc
            ],
            "delexicalised": delex,
            "classifier": [{"intent": k, "label": INTENT_LABELS.get(k, k), "score": round(p, 4)} for k, p in ranked[:4]],
            "rules": notes,
        },
    }


def engine_info() -> dict:
    e = _engine
    domains = []
    for key, dom in DOMAINES.items():
        a = e.domains[key] if e else None
        domains.append(
            {
                "key": key,
                "label": dom.label,
                "family": dom.family,
                "training_examples": sum(len(v) for v in dom.training.values()),
                "cv_accuracy": round(a.cv_accuracy, 3) if a and a.cv_accuracy is not None else None,
                "examples": dom.examples,
            }
        )
    return {
        "engine": "spacy",
        "spacy_model": f"{SPACY_MODEL} {e.model_version}" if e else SPACY_MODEL,
        "normalisation": "Lemmes spaCy + règles de suffixes (pluriel, féminin, terminaisons verbales)",
        "classifier": "spaCy TextCategorizer (sac de mots), un par domaine",
        "intents": list(INTENT_LABELS.keys()),
        "domains": domains,
        "loaded": e is not None,
    }
