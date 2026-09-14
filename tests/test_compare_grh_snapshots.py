"""Synthetic offline coverage: no database, private fixture or nominal output."""
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "compare_grh_snapshots.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("snapshot_review_test", SCRIPT)
M = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = M
SPEC.loader.exec_module(M)
STAMP = "2026-09-14T09:00:00.000Z"
SENTINEL = "SYNTHETIC_PRIVATE_VALUE_DO_NOT_EXPORT"


def literal(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def row_for(table, sequence=1, **changes):
    fields = set(M.PRIMARY_KEYS[table] + M.IDENTITY_FIELDS[table] + M.STATUS_FIELDS[table] + M.DATE_FIELDS[table])
    row = {field: None for field in fields}
    for key in M.PRIMARY_KEYS[table]:
        row[key] = "2026-07-31" if key == "FECA_31" else "M" if key == "TIPO_31" else str(sequence)
    row["synthetic_other"] = SENTINEL
    row.update(changes)
    return row


def dump(cutoff="2026-08-06 15:15:21", changes=None, schemas=None):
    lines = ["-- Host: synthetic.invalid    Database: grh_junin"]
    for table in M.TABLES:
        data = (changes or {}).get(table, [row_for(table)])
        template = row_for(table)
        columns = list(template)
        for row in data:
            for name in row:
                if name not in columns:
                    columns.append(name)
        columns.sort()
        ddl = [f"CREATE TABLE `{table}` ("]
        for name in columns:
            dtype = "date" if name in M.DATE_FIELDS[table] else "int(10)" if name in M.PRIMARY_KEYS[table] and name != "TIPO_31" else "varchar(100)"
            ddl.append(f"  `{name}` {dtype} DEFAULT NULL,")
        ddl.append("  PRIMARY KEY (" + ",".join(f"`{key}`" for key in M.PRIMARY_KEYS[table]) + ")")
        ddl.append(") ENGINE=InnoDB DEFAULT CHARSET=latin1;")
        lines.extend((schemas or {}).get(table, ddl))
        if data:
            lines.append(f"INSERT INTO `{table}` VALUES " + ",".join("(" + ",".join(literal(row.get(c)) for c in columns) + ")" for row in data) + ";")
    lines.append("-- Dump completed on " + cutoff)
    return "\n".join(lines) + "\n"


class CompareSnapshotsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.sequence = 0

    def source(self, text, compressed=False):
        self.sequence += 1
        path = self.directory / (f"synthetic-{self.sequence}.sql" + (".gz" if compressed else ""))
        raw = text.encode("utf-8") if isinstance(text, str) else text
        if compressed:
            raw = gzip.compress(raw, mtime=0)
        path.write_bytes(raw)
        return path, hashlib.sha256(raw).hexdigest()

    def read(self, text, compressed=False):
        return M.read_snapshot(*self.source(text, compressed))

    def report(self, changes=None):
        return M.compare_snapshots(self.read(dump()), self.read(dump("2026-09-10 15:17:30", changes), True), STAMP)

    def assert_rejected(self, code, action):
        with self.assertRaises(M.ReviewError) as error:
            action()
        self.assertEqual(str(error.exception), code)

    def test_plain_and_gzip_metadata_scope_and_no_values(self):
        report = self.report()
        self.assertEqual(report["version"], "grh-backup-review.v1")
        self.assertEqual(report["generatedAt"], STAMP)
        self.assertEqual(report["baseline"]["cutoffAt"], "2026-08-06 15:15:21")
        self.assertEqual(set(report["baseline"]), {"sha256", "bytes", "cutoffAt", "database"})
        self.assertEqual([d["table"] for d in report["domains"]], list(M.TABLES))
        self.assertTrue(all(d["unchanged"] == 1 for d in report["domains"]))
        self.assertEqual(report["issues"], [])
        self.assertEqual(report["scope"], {"comparisonOnly": True, "readyForPromotion": False, "databaseWrites": False,
            "canonicalCompared": False, "payrollFactsCompared": False, "operationalEvidenceCompared": False})
        encoded = json.dumps(report)
        self.assertNotIn(SENTINEL, encoded)
        self.assertNotIn(str(self.directory), encoded)
        self.assertNotIn("sourceKey", encoded)

    def test_added_removed_changed_and_overlapping_categories_are_exact(self):
        changes = {
            "persona": [row_for("persona", NOMB_12="Synthetic renamed"), row_for("persona", 2)],
            "familia": [row_for("familia", FENA_14="2016-05-01", FBAJ_14="2026-09-01", PRES_14="not a civil date")],
            "vinculo": [], "histocal": [row_for("histocal", CIER_31="1")],
            "organiza": [row_for("organiza", synthetic_other="Synthetic raw change")],
        }
        report = self.report(changes)
        by_table = {d["table"]: d for d in report["domains"]}
        self.assertEqual((by_table["persona"]["changed"], by_table["persona"]["added"], by_table["persona"]["identityChanged"]), (1, 1, 1))
        self.assertEqual([by_table["familia"][k] for k in ("changed", "identityChanged", "statusChanged", "dateChanged")], [1, 1, 1, 1])
        self.assertEqual(by_table["vinculo"]["removed"], 1)
        self.assertEqual(by_table["organiza"]["changed"], 1)
        self.assertEqual(by_table["organiza"]["statusChanged"], 0)
        expected_issues = []
        for domain in report["domains"]:
            self.assertEqual(domain["baselineRows"], domain["unchanged"] + domain["changed"] + domain["removed"])
            self.assertEqual(domain["candidateRows"], domain["unchanged"] + domain["changed"] + domain["added"])
            expected_issues.extend({"code": code, "table": domain["table"], "count": domain[field]} for code, field in M.ISSUE_FIELDS if domain[field])
        self.assertEqual(report["issues"], expected_issues)

    def test_null_empty_whitespace_literal_null_unicode_and_escapes_are_distinct(self):
        samples = [None, "", " ", "NULL", "Árbol 'sintético'\\ruta\nsegunda línea"]
        for first, second in zip(samples, samples[1:]):
            with self.subTest(first=first, second=second):
                old = self.read(dump(changes={"familia": [row_for("familia", NOMB_14=first)]}))
                new = self.read(dump("2026-09-10 15:17:30", {"familia": [row_for("familia", NOMB_14=second)]}))
                family = M.compare_snapshots(old, new, STAMP)["domains"][2]
                self.assertEqual((family["changed"], family["identityChanged"]), (1, 1))

    def test_pres_and_venc_are_raw_dates_without_certificate_status(self):
        for value in ["", "0000-00-00", "2026-02-30", "NULL"]:
            family = self.report({"familia": [row_for("familia", PRES_14=value, VENC_14=value)]})["domains"][2]
            self.assertEqual((family["changed"], family["dateChanged"], family["statusChanged"], family["identityChanged"]), (1, 1, 0, 0))

    def test_identity_parent_link_and_status_mapping_are_not_assignment_rules(self):
        report = self.report({"legajo": [row_for("legajo", IDPERSONA="2")]})
        self.assertEqual(report["domains"][1]["identityChanged"], 1)
        self.assertEqual(set(M.STATUS_FIELDS["legajo"]), {"FEGR_12", "CODI_29", "IDREVISTA", "susp_12", "arcpp_12"})
        self.assertEqual(M.STATUS_FIELDS["histolegajo"], ())

    def test_duplicate_and_null_primary_keys_fail_instead_of_overwriting(self):
        for second in [row_for("persona"), row_for("persona", IDPERSONA="01")]:
            self.assert_rejected("SOURCE_DUPLICATE_KEY", lambda: self.read(dump(changes={"persona": [row_for("persona"), second]})))
        self.assert_rejected("SOURCE_NULL_KEY", lambda: self.read(dump(changes={"persona": [row_for("persona", IDPERSONA=None)]})))

    def test_primary_key_order_missing_column_and_new_date_are_rejected(self):
        self.assert_rejected("SOURCE_SCHEMA_REQUIRED", lambda: self.read(dump().replace("PRIMARY KEY (`CODI_01`,`LEGA_12`)", "PRIMARY KEY (`LEGA_12`,`CODI_01`)")))
        self.assert_rejected("SOURCE_SCHEMA_REQUIRED", lambda: self.read(dump().replace("`PRES_14`", "`MISSING_PRES`")))
        self.assert_rejected("SOURCE_SCHEMA_DATE_DRIFT", lambda: self.read(dump().replace("`synthetic_other` varchar(100)", "`synthetic_other` date")))

    def test_column_type_and_table_option_drift_fail_between_sources(self):
        baseline = self.read(dump())
        for text in [dump("2026-09-10 15:17:30").replace("varchar(100)", "varchar(101)"), dump("2026-09-10 15:17:30").replace("CHARSET=latin1", "CHARSET=utf8mb4")]:
            candidate = self.read(text)
            self.assert_rejected("SOURCE_SCHEMA_INCOMPATIBLE", lambda: M.compare_snapshots(baseline, candidate, STAMP))

    def test_auto_increment_counter_is_not_schema_drift(self):
        baseline = self.read(dump().replace("ENGINE=InnoDB", "ENGINE=InnoDB AUTO_INCREMENT=2"))
        candidate = self.read(dump("2026-09-10 15:17:30").replace("ENGINE=InnoDB", "ENGINE=InnoDB AUTO_INCREMENT=3"))
        self.assertEqual(M.compare_snapshots(baseline, candidate, STAMP)["issues"], [])

    def test_footer_database_order_and_same_hash_are_closed(self):
        self.assert_rejected("SOURCE_INCOMPLETE", lambda: self.read(dump().split("-- Dump completed on ")[0]))
        self.assert_rejected("SOURCE_CUTOFF_INVALID", lambda: self.read(dump("2026-02-30 15:00:00")))
        self.assert_rejected("SOURCE_AFTER_FOOTER", lambda: self.read(dump() + "SELECT 1;\n"))
        self.assert_rejected("SOURCE_DATABASE_INVALID", lambda: self.read(dump().replace("Database: grh_junin", "Database: unrelated")))
        baseline = self.read(dump())
        self.assert_rejected("SOURCE_SAME_HASH", lambda: M.compare_snapshots(baseline, baseline, STAMP))
        for cutoff in ["2026-08-06 15:15:21", "2026-08-05 15:15:21"]:
            candidate = self.read(dump(cutoff, {"vinculo": []}))
            self.assert_rejected("SOURCE_ORDER_INVALID", lambda: M.compare_snapshots(baseline, candidate, STAMP))

    def test_generated_at_matches_consumer_civil_year_bounds(self):
        for value in ["1899-12-31T23:59:59Z", "2101-01-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-09-14T09:00:00+00:00"]:
            self.assert_rejected("GENERATED_AT_INVALID", lambda: M.generated_time(value))
        for value in ["1900-01-01T00:00:00Z", "2100-12-31T23:59:59.123456Z"]:
            self.assertEqual(M.generated_time(value), value)

    def test_strict_insert_rejects_truncation_multiline_and_expressions(self):
        for value in ["(NULL)", "(NULL);junk", "(NULL); SELECT 1;", "(NULL\n);", "(now());", "(b'0');", "(NULL,,1);", "('unterminated);", "(NULL),;", "(NULL); --ignored"]:
            with self.subTest(value=value):
                self.assert_rejected("SOURCE_INSERT_UNSUPPORTED", lambda: list(M.strict_rows("INSERT INTO `familia` VALUES " + value, "familia")))
        self.assert_rejected("SOURCE_INSERT_UNSUPPORTED", lambda: self.read(dump().replace("INSERT INTO `familia` VALUES ", "INSERT INTO `familia` VALUES\n")))
        self.assert_rejected("SOURCE_STATEMENT_UNSUPPORTED", lambda: self.read(dump().replace("-- Dump completed on", "UPDATE `familia` SET ignored=1;\n-- Dump completed on")))

    def test_hash_encoding_bad_gzip_and_row_width_fail_safely(self):
        path, _ = self.source(dump())
        self.assert_rejected("SOURCE_HASH_MISMATCH", lambda: M.read_snapshot(path, "0" * 64))
        self.assert_rejected("SOURCE_ENCODING_INVALID", lambda: self.read(dump().encode() + b"\xff"))
        path, sha = self.source(dump(), True)
        broken = path.read_bytes()[:-7]
        path.write_bytes(broken)
        self.assert_rejected("SOURCE_READ_FAILED", lambda: M.read_snapshot(path, hashlib.sha256(broken).hexdigest()))
        self.assert_rejected("SOURCE_ROW_WIDTH", lambda: self.read(dump().replace("INSERT INTO `vinculo` VALUES ", "INSERT INTO `vinculo` VALUES ('extra',", 1).replace("'extra',(", "'extra',")))

    def test_trigger_definitions_do_not_become_rows_and_unclosed_blocks_fail(self):
        trigger = "\n".join(["DELIMITER ;;", "/*!50003 CREATE*/ /*!50017 DEFINER=`synthetic`@`local`*/ /*!50003 TRIGGER synthetic_trigger AFTER INSERT ON familia",
            "FOR EACH ROW BEGIN", "INSERT INTO familia", "VALUES (synthetic_program_text);", "END */;;", "DELIMITER ;", ""])
        text = dump().replace("-- Dump completed on", trigger + "-- Dump completed on")
        snapshot = self.read(text)
        self.assertEqual(len(snapshot.rows["familia"]), 1)
        qualified = text.replace("TRIGGER synthetic_trigger", "TRIGGER grh_junin.synthetic_trigger").replace("ON familia\n", "ON grh_junin.familia \n")
        self.assertEqual(len(self.read(qualified).rows["familia"]), 1)
        self.assertEqual(len(self.read(qualified.replace("grh_junin.synthetic_trigger", "other_database.synthetic_trigger")).rows["familia"]), 1)
        self.assert_rejected("SOURCE_TRIGGER_UNSUPPORTED", lambda: self.read(text.replace("DELIMITER ;\n-- Dump", "INSERT INTO familia VALUES (1);\nDELIMITER ;\n-- Dump")))
        self.assert_rejected("SOURCE_TRIGGER_UNSUPPORTED", lambda: self.read(text.replace("END */;;", "END;")))
        self.assert_rejected("SOURCE_TRIGGER_UNSUPPORTED", lambda: self.read(text.replace("/*!50003 CREATE*/", "INSERT INTO familia VALUES (1);")))
        with patch.object(M, "MAX_TRIGGER_BYTES", 10):
            self.assert_rejected("SOURCE_TRIGGER_LIMIT", lambda: self.read(text))

    def test_source_logical_line_compression_and_row_limits(self):
        with patch.object(M, "MAX_SOURCE_BYTES", 10):
            self.assert_rejected("SOURCE_TOO_LARGE", lambda: self.read(dump()))
        with patch.object(M, "MAX_LINE_BYTES", 10):
            self.assert_rejected("SOURCE_LINE_TOO_LARGE", lambda: self.read(dump()))
        with patch.object(M, "MAX_LOGICAL_BYTES", 10):
            self.assert_rejected("SOURCE_EXPANSION_LIMIT", lambda: self.read(dump()))
        with patch.object(M, "MAX_COMPRESSION_RATIO", 1):
            self.assert_rejected("SOURCE_EXPANSION_LIMIT", lambda: self.read(dump(), True))
        with patch.object(M, "MAX_ROWS", 1):
            self.assert_rejected("SOURCE_ROW_LIMIT", lambda: self.read(dump(changes={"persona": [row_for("persona"), row_for("persona", 2)]})))

    def test_file_change_during_read_is_detected(self):
        path, sha = self.source(dump())
        original = M.HashedReader.readline
        mutated = False
        def mutate(reader, size):
            nonlocal mutated
            data = original(reader, size)
            if not mutated:
                mutated = True
                with path.open("ab") as handle:
                    handle.write(b"\n")
            return data
        with patch.object(M.HashedReader, "readline", mutate):
            self.assert_rejected("SOURCE_CHANGED", lambda: M.read_snapshot(path, sha))

    def test_path_ctime_precision_does_not_hide_descriptor_or_path_mutations(self):
        path, sha = self.source(dump())
        actual = path.stat()
        fields = {name: getattr(actual, name) for name in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")}
        different_precision = SimpleNamespace(**{**fields, "st_ctime_ns": fields["st_ctime_ns"] - 1_001_000})
        with patch.object(Path, "stat", return_value=different_precision):
            self.assertEqual(M.read_snapshot(path, sha).metadata["sha256"], sha)
        for changed_field in ("st_ino", "st_size", "st_mtime_ns"):
            different_file = SimpleNamespace(**{**fields, changed_field: fields[changed_field] + 1})
            with patch.object(Path, "stat", return_value=different_file):
                self.assert_rejected("SOURCE_CHANGED", lambda: M.read_snapshot(path, sha))
        original = os.fstat
        calls = 0
        def changed_descriptor(fd):
            nonlocal calls
            calls += 1
            return original(fd) if calls == 1 else different_precision
        with patch.object(os, "fstat", changed_descriptor):
            self.assert_rejected("SOURCE_CHANGED", lambda: M.read_snapshot(path, sha))

    def test_output_requires_external_parent_and_never_overwrites(self):
        report = self.report()
        output = self.directory / "aggregate.json"
        first = M.write_report(output, report)
        self.assertEqual(M.write_report(output, report), first)
        original = output.read_bytes()
        report["generatedAt"] = "2026-09-14T09:01:00Z"
        self.assert_rejected("OUTPUT_EXISTS_DIFFERENT", lambda: M.write_report(output, report))
        self.assertEqual(output.read_bytes(), original)
        repo = self.directory / "synthetic-repository"
        repo.mkdir()
        (repo / ".git").write_text("gitdir: synthetic")
        self.assert_rejected("OUTPUT_REPOSITORY_FORBIDDEN", lambda: M.write_report(repo / "report.json", report))
        self.assert_rejected("OUTPUT_PATH_INVALID", lambda: M.write_report("report.json", report))
        self.assert_rejected("OUTPUT_PATH_INVALID", lambda: M.write_report(self.directory / "missing" / "report.json", report))

    def test_cli_success_is_aggregate_failure_does_not_echo_input_and_is_deterministic(self):
        old, old_sha = self.source(dump())
        new, new_sha = self.source(dump("2026-09-10 15:17:30"), True)
        output = self.directory / "cli-report.json"
        args = [sys.executable, str(SCRIPT), "--baseline", str(old), "--candidate", str(new), "--baseline-sha256", old_sha,
            "--candidate-sha256", new_sha, "--output", str(output), "--generated-at", STAMP]
        first = subprocess.run(args, text=True, capture_output=True)
        second = subprocess.run(args, text=True, capture_output=True)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(first.stdout, second.stdout)
        self.assertEqual(set(json.loads(first.stdout)), {"ok", "reportSha256", "domains", "issues"})
        failure = subprocess.run(args + ["--unknown", SENTINEL], text=True, capture_output=True)
        self.assertEqual(failure.returncode, 1)
        self.assertEqual(json.loads(failure.stderr), {"ok": False, "code": "ARGUMENTS_INVALID"})
        self.assertNotIn(SENTINEL, first.stdout + failure.stderr)
        self.assertNotIn(str(self.directory), first.stdout + failure.stderr)


if __name__ == "__main__":
    unittest.main()
