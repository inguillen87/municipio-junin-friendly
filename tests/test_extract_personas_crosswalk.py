import gzip
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "extract-personas-crosswalk.py"
SCRIPTS_DIR = str(SCRIPT_PATH.parent)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)
SPEC = importlib.util.spec_from_file_location("extract_personas_crosswalk", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def row(source_id, *, cuil=None, dni=None, name=None, birth=None):
    return {
        "IDPERSONA": str(source_id),
        "CUIL_12": cuil,
        "NUDO_12": dni,
        "NOMB_12": name,
        "FENA_12": birth,
        "SEXO_12": None,
    }


class NormalizeTests(unittest.TestCase):
    def test_cuil_check_digit_is_enforced(self):
        self.assertEqual(MODULE.normalize_cuil("20-99999999-9"), "20999999999")
        self.assertIsNone(MODULE.normalize_cuil("20-99999999-8"))
        self.assertIsNone(MODULE.normalize_cuil("0"))

    def test_name_dni_and_placeholder_birth_are_normalized(self):
        self.assertEqual(MODULE.normalize_name("Muñoz, José María"), "MUNOZ JOSE MARIA")
        self.assertEqual(MODULE.normalize_dni("99.999.999"), "99999999")
        self.assertIsNone(MODULE.normalize_birth_date("1992-12-31"))

    def test_zero_coordinates_are_not_treated_as_geocoded(self):
        self.assertIsNone(MODULE._coordinates({"latitud": "0", "longitud": "0"}))
        self.assertEqual(
            MODULE._coordinates({"latitud": "-33.14", "longitud": "-68.49"}),
            {"latitude": -33.14, "longitude": -68.49},
        )


class CrosswalkPolicyTests(unittest.TestCase):
    def identities(self, system, values):
        return [MODULE.identity_from_row(system, value) for value in values]

    def test_raw_id_collision_is_never_a_join_key(self):
        grh = self.identities("grh_junin", [row(6, dni="99999999", name="PERSONA UNO")])
        personas = self.identities("personas_junin", [row(6, dni="88888888", name="OTRA PERSONA")])
        bridge, tiers = MODULE.build_crosswalk(grh, personas, valid_from="2026-08-06T00:00:00Z")
        self.assertEqual(tiers["unmatched"], 1)
        self.assertIsNone(bridge[0]["target"])
        self.assertFalse(bridge[0]["evidence"]["rawIdJoinUsed"])

    def test_duplicate_cuil_can_be_resolved_by_unique_identity_evidence(self):
        valid_cuil = "20999999999"
        grh = self.identities("grh_junin", [
            row(1, cuil=valid_cuil, name="MUÑOZ JOSE", birth="1970-01-02")
        ])
        personas = self.identities("personas_junin", [
            row(10, cuil=valid_cuil, name="MUÑOZ JOSE", birth="1970-01-02"),
            row(11, cuil=valid_cuil, name="OTRA PERSONA", birth="1980-03-04"),
        ])
        bridge, tiers = MODULE.build_crosswalk(grh, personas, valid_from="2026-08-06T00:00:00Z")
        self.assertEqual(tiers["cuil_duplicate_resolved"], 1)
        self.assertEqual(bridge[0]["target"]["sourceId"], "10")
        self.assertGreaterEqual(bridge[0]["confidence"], 0.97)

    def test_duplicate_raw_dni_remains_ambiguous_without_valid_grh_cuil(self):
        grh = self.identities("grh_junin", [
            row(1, dni="99999999", name="PERSONA CORRECTA", birth="1970-01-02")
        ])
        personas = self.identities("personas_junin", [
            row(10, dni="99999999", name="PERSONA CORRECTA", birth="1970-01-02"),
            row(11, dni="99999999", name="OTRA PERSONA", birth="1980-03-04"),
        ])
        bridge, tiers = MODULE.build_crosswalk(grh, personas, valid_from="2026-08-06T00:00:00Z")
        self.assertEqual(tiers["ambiguous"], 1)
        self.assertIsNone(bridge[0]["target"])
        self.assertEqual(set(bridge[0]["candidateTargetSourceIds"]), {"10", "11"})

    def test_grh_identity_seed_is_independent_from_legajo_and_retains_invalid_evidence(self):
        source = row(
            99,
            cuil="20-99999999-8",
            dni="sin-documento",
            name="Persona sin legajo",
            birth="1111-01-01",
        )
        source.update({
            "SEXO_12": "F",
            "TELE_12": "1234",
            "EMIA_12": "persona@example.test",
            "DOMI_12": "Domicilio fuente",
            "localidad": "Junin",
        })
        person = MODULE.identity_from_row("grh_junin", source)
        seed = MODULE.grh_identity_seed(person)

        self.assertEqual(seed["scope"], "grh_identity_master_independent_of_employment")
        self.assertEqual(seed["source"]["sourceId"], "99")
        self.assertIsNone(seed["identity"]["cuil"])
        self.assertEqual(seed["identity"]["sourceCuil"], "20-99999999-8")
        self.assertIsNone(seed["identity"]["documentNumber"])
        self.assertEqual(seed["identity"]["sourceDocumentNumber"], "sin-documento")
        self.assertIsNone(seed["identity"]["birthDate"])
        self.assertEqual(seed["identity"]["sourceBirthDate"], "1111-01-01")
        self.assertTrue(seed["quality"]["invalidSourceCuilRetained"])
        self.assertTrue(seed["quality"]["invalidSourceDniRetained"])
        self.assertTrue(seed["quality"]["invalidSourceBirthDateRetained"])
        self.assertNotIn("employmentLink", seed)


class StreamingDumpTests(unittest.TestCase):
    def test_gzip_content_hash_and_filtered_rows_are_deterministic(self):
        sql = (
            "CREATE TABLE `persona` (\n"
            "  `IDPERSONA` bigint NOT NULL,\n"
            "  `NOMB_12` varchar(255) DEFAULT NULL\n"
            ") ENGINE=InnoDB;\n"
            "INSERT INTO `persona` VALUES (1,'Uno'),(2,'Dos');\n"
            "-- Dump completed on 2026-08-06 15:15:23\n"
        ).encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.sql.gz"
            with gzip.GzipFile(filename=str(path), mode="wb", mtime=0) as handle:
                handle.write(sql)
            scan = MODULE.scan_dump(
                path,
                {"persona"},
                row_filters={"persona": lambda value: value["IDPERSONA"] == "2"},
            )
        self.assertEqual(scan.content_sha256, MODULE.hashlib.sha256(sql).hexdigest().upper())
        self.assertEqual(scan.source_counts["persona"], 2)
        self.assertEqual(scan.retained["persona"][0]["NOMB_12"], "Dos")


if __name__ == "__main__":
    unittest.main()
