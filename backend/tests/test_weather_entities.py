import unittest
from unittest.mock import patch

from rdflib import Graph, OWL, RDF, RDFS

from app import entities
from app.store import SG, store


class WeatherEntityTests(unittest.TestCase):
    def setUp(self):
        self.graph = Graph()
        self.weather_type = SG.TestWeatherCondition
        self.graph.add((SG.ConditionMeteo, RDF.type, OWL.Class))
        self.graph.add((self.weather_type, RDF.type, OWL.Class))
        self.graph.add((self.weather_type, RDFS.subClassOf, SG.ConditionMeteo))

    def create_weather(self, **overrides):
        payload = {
            "type": "TestWeatherCondition",
            "nom": "Vent Bizerte",
            "valeurMeteo": 18.5,
            "unite": "km/h",
            "region": "Bizerte",
            "dateReleve": "2026-10-28",
            "dureeHeures": 2.5,
            "extreme": True,
        }
        payload.update(overrides)
        with (
            patch.object(store, "graph", self.graph),
            patch.object(store, "save"),
            patch.object(store, "log"),
        ):
            return entities.create(entities.get_spec("weather"), payload)

    def test_create_weather_preserves_fields_status_and_search(self):
        item = self.create_weather()

        self.assertEqual(item["nom"], "Vent Bizerte")
        self.assertEqual(item["valeurMeteo"], 18.5)
        self.assertEqual(item["dateReleve"], "2026-10-28")
        self.assertEqual(item["status"], "extreme")

        with patch.object(store, "graph", self.graph):
            result = entities.query_list(
                entities.get_spec("weather"), search="bizerte", page_size=10
            )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], item["id"])

    def test_create_weather_rejects_negative_duration(self):
        with self.assertRaises(entities.ValidationError) as raised:
            self.create_weather(dureeHeures=-1)

        self.assertIn("dureeHeures", raised.exception.errors)


if __name__ == "__main__":
    unittest.main()
