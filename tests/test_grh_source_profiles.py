"""Offline profile checks using invented SQL, never private source rows."""
import copy
import gzip
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import extract_rrhh_curated as curated
import extract_grh_core as core


def sql_document(tables, required, cutoff):
    lines = ["-- Host: synthetic    Database: grh_junin\n"]
    for table, rows in tables.items():
        columns = sorted(required[table])
        lines.append(f"CREATE TABLE `{table}` (\n")
        lines.extend(f"  `{column}` varchar(255),\n" for column in columns)
        lines.append(") ENGINE=InnoDB;\n")
        if rows:
            values = []
            for row in rows:
                values.append("(" + ",".join(
                    "NULL" if row.get(column) is None else "'" + str(row[column]).replace("'", "''") + "'"
                    for column in columns
                ) + ")")
            lines.append(f"INSERT INTO `{table}` VALUES " + ",".join(values) + ";\n")
    lines.append("-- Dump completed on " + cutoff.replace("T", " ") + "\n")
    return "".join(lines).encode()


def core_fixture(month=9, mutate=None):
    profile = curated.load_source_profile(f"grh-core-junin-2026-{month:02d}", "core")
    current = profile["source"]["currentPayrollDate"]
    previous = profile["source"]["latestClosedPayrollDate"]
    tables = {
        "concepto": [{"CODI_27": str(n), "TIPO_15": "9"} for n in range(990, 1000)],
        "histocal": [
            {"CODI_01": "1", "PERI_31": "2026", "MES_31": str(month - 1), "FECA_31": previous, "TIPO_31": "M", "CIER_31": "1"},
            {"CODI_01": "1", "PERI_31": "2026", "MES_31": str(month), "FECA_31": current, "TIPO_31": "M", "CIER_31": None},
        ],
        "legajo": [{"CODI_01": "1", "LEGA_12": "900001", "FING_12": "2024-01-01", "FEGR_12": None}],
        "histolegajo": [{"ID": "1", "CODI_01": "1", "LEGA_12": "900001", "FECA_31": current, "PERI_31": "2026", "MES_31": str(month), "TIPO_31": "M"}],
        "legamov": [{"CODI_01": "1", "LEGA_12": "900001", "ANO_30": "2026", "MES_30": str(month), "TIPO_31": "M", "CODI_27": "999", "CODI_06": "1"}],
        "calculo": [
            {"CODI_01": "1", "LEGA_12": "900001", "PERI_31": "2026", "MES_31": str(m), "FECA_31": dt, "TIPO_31": "M", "CODI_27": "999", "CANT_31": "1", "IMPO_31": "10.50"}
            for m, dt in [(month - 1, previous), (month, current)]
        ],
    }
    if mutate:
        mutate(tables)
    profile["core"].update({
        "expectedCounts": {t: len(rows) for t, rows in tables.items()},
        "snapshotCohort": {"period": 2026, "month": month, "payrollType": "M", "payrollDate": current, "rows": 1},
        "expectedClosureStatusCounts": {"closed": 1, "open": 1}, "currentRunTypes": ["M"],
        "latestClosedHeadcount": 1,
        "expectedReconciliation": {"administrativeActive": 1, "liquidatedCurrent": 1, "activeNotLiquidated": 0, "liquidatedNotActive": 0, "activeAndLiquidated": 1},
    })
    data = sql_document(tables, core.REQUIRED_COLUMNS, profile["source"]["cutoff"])
    profile["source"].update(sha256=hashlib.sha256(data).hexdigest().upper(), logicalBytes=len(data))
    return profile, data


class SourceProfileTests(unittest.TestCase):
    def test_registry_preserves_default_and_selects_separate_domain_profiles(self):
        august = curated.load_source_profile()
        september = curated.load_source_profile("grh-core-junin-2026-09", "core")
        self.assertEqual(august["curated"]["profileId"], curated.PROFILE_NAME)
        self.assertEqual(august["source"]["sha256"], core.EXPECTED_SOURCE_SHA256)
        self.assertEqual(august["core"]["expectedCounts"], core.EXPECTED_COUNTS)
        self.assertEqual(september["source"]["currentPayrollDate"], "2026-09-30")
        self.assertEqual(september["source"]["latestClosedPayrollDate"], "2026-08-31")
        september["source"]["currentPayrollDate"] = "2000-01-01"
        self.assertEqual(curated.load_source_profile("grh-junin-2026-09-10")["source"]["currentPayrollDate"], "2026-09-30")
        for invalid in ["unknown", "../../profile.json", "grh-core-junin-2026-09"]:
            with self.assertRaises(curated.ExtractionError):
                curated.load_source_profile(invalid)

    def test_profile_date_helpers_do_not_mutate_the_august_default(self):
        self.assertFalse(core._valid_payroll_date("2026-09-30"))
        self.assertTrue(core._valid_payroll_date("2026-09-30", "2026-09-30"))
        self.assertFalse(core._valid_payroll_date("2026-09-31", "2026-09-30"))
        self.assertEqual(core._classify_reconciliation(True, False, "2026-08-31", "2026-09-30"), "active_not_liquidated_previous_cycle")
        self.assertEqual(core.EXPECTED_CURRENT_PAYROLL_DATE, "2026-08-31")

    def test_september_never_accepts_drift_even_with_fixture_acknowledgment(self):
        for name in ["extract_rrhh_curated.py", "extract_grh_core.py"]:
            child = subprocess.run([sys.executable, str(SCRIPTS / name), "--profile", "grh-junin-2026-09-10", "--allow-source-drift", "--fixture-mode"], capture_output=True, text=True)
            self.assertNotEqual(child.returncode, 0)
            self.assertIn("Source drift", child.stderr)

    def test_reader_distinguishes_container_and_logical_identity(self):
        profile, data = core_fixture()
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            plain, zipped = folder / "fixture.sql", folder / "fixture.sql.gz"
            plain.write_bytes(data)
            zipped.write_bytes(gzip.compress(data, mtime=0))
            a, b = {}, {}
            self.assertEqual(list(curated._sql_lines(plain, metadata=a)), list(curated._sql_lines(zipped, metadata=b)))
            self.assertEqual(a["sha256"], b["sha256"])
            self.assertNotEqual(a["physicalSha256"], b["physicalSha256"])
            curated.validate_source_metadata(a, profile)
            with self.assertRaisesRegex(curated.ExtractionError, "gzip"):
                curated.validate_source_metadata(b, profile)
            profile["source"].update(gzipSha256=b["physicalSha256"], gzipBytes=b["physicalBytes"])
            curated.validate_source_metadata(b, profile)
            zipped.write_bytes(zipped.read_bytes()[:-4])
            with self.assertRaisesRegex(curated.ExtractionError, "incomplete"):
                list(curated._sql_lines(zipped))

    def test_metadata_rejects_independent_drift_dimensions(self):
        profile, data = core_fixture()
        metadata = {k: profile["source"][k] for k in ("sha256", "logicalBytes", "database", "cutoff")}
        metadata["container"] = "sql"
        for key in ("sha256", "logicalBytes", "database", "cutoff"):
            with self.subTest(key=key), self.assertRaisesRegex(curated.ExtractionError, key):
                curated.validate_source_metadata({**metadata, key: "different"}, profile)

    def run_core(self, profile, data, folder):
        source = folder / "fixture.sql"
        source.write_bytes(data)
        with patch.object(core, "load_source_profile", return_value=copy.deepcopy(profile)):
            return core.extract(source, folder / "out", profile_id=profile["id"])

    def test_strict_core_extracts_both_profiles_and_reports_actual_dates(self):
        for month in [8, 9, 8]:
            with self.subTest(month=month), tempfile.TemporaryDirectory() as folder:
                profile, data = core_fixture(month)
                result = self.run_core(profile, data, Path(folder))
                self.assertTrue(result["quality"]["strictSnapshot"])
                self.assertEqual(result["source"]["cutoff"], profile["source"]["cutoff"])
                self.assertEqual(result["source"]["currentPayrollDate"], profile["source"]["currentPayrollDate"])
                self.assertEqual(result["quality"]["payrollRunClosure"]["latestClosedHeadcount"], 1)
                self.assertEqual(result["outputs"]["payrollMonthly"]["records"], 2)
                self.assertNotIn("882/854", " ".join(result["methodology"]))
                self.assertNotIn("July 2026", " ".join(result["methodology"]))

    def test_strict_core_rejects_cohort_closure_and_reconciliation_mismatch(self):
        changes = [
            lambda t: t["histolegajo"][0].update(MES_31="8"),
            lambda t: t["histolegajo"].append(dict(t["histolegajo"][0])),
            lambda t: t["histolegajo"][0].update(ID=None),
            lambda t: t["histocal"][1].update(CIER_31="1"),
            lambda t: t["legajo"][0].update(FEGR_12="2026-09-01"),
            lambda t: t["histolegajo"][0].update(LEGA_12="900002"),
        ]
        for change in changes:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as folder:
                profile, data = core_fixture(mutate=change)
                with self.assertRaises((core.ExtractionError, curated.ExtractionError)):
                    self.run_core(profile, data, Path(folder))
                self.assertFalse((Path(folder) / "out" / "grh-core-manifest.json").exists())
                self.assertEqual(list((Path(folder) / "out").glob("*.json")), [])

    def test_curated_uses_registry_counts_and_source_metadata(self):
        profile = curated.load_source_profile("grh-junin-2026-09-10")
        tables = {table: [] for table in curated.REQUIRED_COLUMNS}
        data = sql_document(tables, curated.REQUIRED_COLUMNS, profile["source"]["cutoff"])
        profile["source"].update(sha256=hashlib.sha256(data).hexdigest().upper(), logicalBytes=len(data))
        profile["curated"]["expectedCounts"] = {t: 0 for t in tables}
        profile["curated"]["expectedOutputCounts"] = {t: 0 for t in curated.OUTPUT_FILES}
        with tempfile.TemporaryDirectory() as folder, patch.object(curated, "load_source_profile", return_value=copy.deepcopy(profile)):
            source = Path(folder) / "fixture.sql"
            source.write_bytes(data)
            scan = curated.scan_source(source)
            curated.validate_scan(scan, profile_id=profile["id"])
            result = curated.build_outputs(source, Path(folder) / "out", scan, profile_id=profile["id"])
            self.assertEqual(result["profile"], profile["curated"]["profileId"])
            self.assertTrue(result["validation"]["strictSnapshot"])
            scan.counts["legajo"] = 1
            with self.assertRaisesRegex(curated.ExtractionError, "count mismatch"):
                curated.validate_scan(scan, profile_id=profile["id"])
            scan.counts["legajo"] = 0
            scan.schemas["legajo"].remove("LEGA_12")
            with self.assertRaisesRegex(curated.ExtractionError, "columns"):
                curated.validate_scan(scan, profile_id=profile["id"])

    def test_reader_rejects_wrong_encoding_and_content_after_footer(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "fixture.sql"
            for data in [b"\xff", b"-- Dump completed on 2026-09-10 15:17:30\nSELECT 1;\n"]:
                source.write_bytes(data)
                with self.assertRaises(curated.ExtractionError):
                    list(curated._sql_lines(source))

    def test_core_rejects_expected_headcount_mismatch_before_publishing(self):
        profile, data = core_fixture()
        profile["core"]["latestClosedHeadcount"] = 2
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(core.ExtractionError, "headcount"):
                self.run_core(profile, data, Path(folder))
            self.assertFalse((Path(folder) / "out" / "grh-core-manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
