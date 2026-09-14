"""Synthetic, offline coverage for preservation of GRH family source fields."""
import copy
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "extract_rrhh_curated.py"
SPEC = importlib.util.spec_from_file_location("extract_rrhh_family_test", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def family_row(**overrides):
    # These values are invented; no private records or documents are used.
    row = {
        "CODI_14": "000101", "CODI_01": "1", "LEGA_12": "000999",
        "NOMB_14": "  Familiar   Sintético  ", "IDVINCULO": "2",
        "SEXO_14": "F", "FENA_14": "2015-03-04", "CODI_47": "1",
        "NUDO_14": "99999999", "CUIL_14": None, "FBAJ_14": None,
        "INCA_14": "0", "ESCO_14": "3", "CURS_14": "4",
        "COBS_14": "Observación sintética", "PORCDEDUCCION": "50.0",
    }
    return {**row, **overrides}


def extract(row):
    return MODULE._family_record(row, {"vinculo": {("2",): {"DETA_46": "HIJA/O"}}})


class FamilySourcePreservationTests(unittest.TestCase):
    def test_valid_source_dates_and_raw_primary_key_are_traceable(self):
        source = family_row(PRES_14="2026-03-05", VENC_14="2027-03-05 00:00:00")
        before = copy.deepcopy(source)
        result = extract(source)
        self.assertEqual(result["sourceFields"], {
            "PRES_14": "2026-03-05", "VENC_14": "2027-03-05 00:00:00",
        })
        self.assertEqual(result["sourceProvenance"], {
            "table": "familia", "primaryKey": {"CODI_14": "000101"},
        })
        self.assertEqual(result["sourceKey"], {"familyMemberId": "000101"})
        self.assertEqual(source, before, "The extractor must not mutate the source row")

    def test_null_blank_and_absent_source_columns_remain_distinct(self):
        both_null = extract(family_row(PRES_14=None, VENC_14=None))
        self.assertEqual(both_null["sourceFields"], {"PRES_14": None, "VENC_14": None})
        empty = extract(family_row(PRES_14="", VENC_14="  "))
        self.assertEqual(empty["sourceFields"], {"PRES_14": "", "VENC_14": "  "})
        missing = extract(family_row())
        self.assertEqual(missing["sourceFields"], {})
        partial = extract(family_row(PRES_14=None))
        self.assertEqual(partial["sourceFields"], {"PRES_14": None})
        self.assertNotIn("VENC_14", partial["sourceFields"])

    def test_invalid_zero_and_ambiguous_dates_are_not_normalized_or_classified(self):
        for raw in ["0000-00-00", "2026-02-30", "31/13/2026", "no es fecha", " NULL ", " 2026-03-05 "]:
            with self.subTest(raw=raw):
                result = extract(family_row(PRES_14=raw, VENC_14=raw))
                round_trip = json.loads(json.dumps(result))
                self.assertEqual(round_trip["sourceFields"], {"PRES_14": raw, "VENC_14": raw})
                for inferred in ["presentationDate", "expirationDate", "certificateStatus", "presented", "pending", "eligible"]:
                    self.assertNotIn(inferred, result)

    def test_sql_parser_to_family_retains_null_literal_and_invalid_date(self):
        parsed = list(MODULE.parse_insert_rows(
            "INSERT INTO `familia` VALUES (NULL,'NULL'),('0000-00-00','2026-02-30'),"
            "(  '  '  ,  ' 2026-02-30 '  ),('', ' NULL ');\n"
        ))
        first = extract(family_row(**dict(zip(["PRES_14", "VENC_14"], parsed[0]))))
        second = extract(family_row(**dict(zip(["PRES_14", "VENC_14"], parsed[1]))))
        self.assertIsNone(first["sourceFields"]["PRES_14"])
        self.assertEqual(first["sourceFields"]["VENC_14"], "NULL")
        self.assertEqual(second["sourceFields"], {"PRES_14": "0000-00-00", "VENC_14": "2026-02-30"})
        third = extract(family_row(**dict(zip(["PRES_14", "VENC_14"], parsed[2]))))
        fourth = extract(family_row(**dict(zip(["PRES_14", "VENC_14"], parsed[3]))))
        self.assertEqual(third["sourceFields"], {"PRES_14": "  ", "VENC_14": " 2026-02-30 "})
        self.assertEqual(fourth["sourceFields"], {"PRES_14": "", "VENC_14": " NULL "})

    def test_sql_parser_keeps_existing_escape_number_and_null_behavior(self):
        parsed = list(MODULE.parse_insert_rows(
            "INSERT INTO `demo` VALUES ( 001 , NULL , 'NULL', ' O\\'Brien, Sur ',"
            " 'line\\nnext', '\\0', 'it''s ok', -2.50, '\\t padded \\r\\n');\n"
        ))
        self.assertEqual(parsed, [[
            "001", None, "NULL", " O'Brien, Sur ", "line\nnext", "\x00", "it's ok",
            "-2.50", "\t padded \r\n",
        ]])

    def test_existing_family_projection_is_unchanged(self):
        result = extract(family_row(PRES_14=None, VENC_14="0000-00-00"))
        result.pop("sourceFields")
        result.pop("sourceProvenance")
        self.assertEqual(result, {
            "sourceKey": {"familyMemberId": "000101"},
            "employeeExternalId": "grh:1:000999",
            "employeeSourceKey": {"companyCode": "1", "employeeNumber": "000999"},
            "fullName": "Familiar Sintético", "relationshipId": "2", "relationship": "HIJA/O",
            "sexCode": "F", "birthDate": "2015-03-04", "documentTypeCode": "1",
            "documentNumber": "99999999", "cuil": None, "endDate": None,
            "incapacityCode": "0", "schoolingCode": "3", "courseCode": "4",
            "observations": "Observación sintética", "deductionPercentage": 50.0,
        })

    def test_extracted_evidence_reaches_import_payload_without_database_work(self):
        records = [
            extract(family_row(PRES_14="2026-03-05", VENC_14="2027-03-05 00:00:00")),
            extract(family_row(PRES_14=None, VENC_14="0000-00-00")),
            extract(family_row(PRES_14=" 2026-02-30 ", VENC_14="")),
            extract(family_row()),
        ]
        # Only the exported pure mapper is imported; main(), credentials,
        # private artifact loading and SQL connections are never invoked.
        code = (
            "import {mapFamily} from './scripts/import-rrhh-neon.mjs';"
            "import fs from 'node:fs';"
            "process.stdout.write(JSON.stringify(mapFamily(JSON.parse(fs.readFileSync(0,'utf8')),17)));"
        )
        child = subprocess.run(
            ["node", "--input-type=module", "-e", code],
            input=json.dumps(records), text=True, encoding="utf-8", capture_output=True,
            cwd=SCRIPT.parent.parent, timeout=15, check=True,
        )
        self.assertEqual(child.stderr, "")
        mapped = json.loads(child.stdout)
        self.assertEqual([json.loads(row["source_payload"]) for row in mapped], records)
        self.assertTrue(all(row["import_run_id"] == 17 for row in mapped))


if __name__ == "__main__":
    unittest.main()
