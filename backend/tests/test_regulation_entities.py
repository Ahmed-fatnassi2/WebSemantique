import unittest
from unittest.mock import patch

from rdflib import Graph, OWL, RDF, RDFS

from app import entities
from app.store import SG, store


class RegulationEntityTests(unittest.TestCase):
    def setUp(self):
        self.graph = Graph()
        self.regulation_type = SG.TestRegulation
        self.graph.add((SG.Reglementation, RDF.type, OWL.Class))
        self.graph.add((self.regulation_type, RDF.type, OWL.Class))
        self.graph.add((self.regulation_type, RDFS.subClassOf, SG.Reglementation))

    def create_regulation(self, **overrides):
        payload = {
            "type": "TestRegulation",
            "nom": "Norme mobilité",
            "reference": "IEC 61851",
            "organisme": "IEC",
            "dateEntreeVigueur": "2026-01-15",
            "dureeValiditeAnnees": 5,
            "montantAide": 1200,
            "obligatoire": False,
        }
        payload.update(overrides)
        with (
            patch.object(store, "graph", self.graph),
            patch.object(store, "save"),
            patch.object(store, "log"),
        ):
            return entities.create(entities.get_spec("regulations"), payload)

    def test_create_regulation_preserves_fields_status_and_search(self):
        item = self.create_regulation()

        self.assertEqual(item["nom"], "Norme mobilité")
        self.assertEqual(item["reference"], "IEC 61851")
        self.assertEqual(item["dateEntreeVigueur"], "2026-01-15")
        self.assertEqual(item["montantAide"], 1200)
        self.assertEqual(item["status"], "facultatif")

        with patch.object(store, "graph", self.graph):
            result = entities.query_list(
                entities.get_spec("regulations"), search="IEC 61851", page_size=10
            )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], item["id"])

    def test_create_regulation_rejects_negative_grant_amount(self):
        with self.assertRaises(entities.ValidationError) as raised:
            self.create_regulation(montantAide=-1)

        self.assertIn("montantAide", raised.exception.errors)


if __name__ == "__main__":
    unittest.main()
