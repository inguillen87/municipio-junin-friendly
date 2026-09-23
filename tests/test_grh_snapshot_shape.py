"""Invented rows only: salary values and identifiers must not appear in audit output."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('shape', ROOT / 'scripts/audit-grh-snapshot-shape.py')
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)

def fixtures():
    current = {'CODI_01': '1', 'FECA_31': '2026-09-30', 'PERI_31': '2026', 'MES_31': '9', 'TIPO_31': 'M'}
    return {'legajo': [{'CODI_01': '1', 'LEGA_12': 'SECRET_EMPLOYEE_QA', 'FEGR_12': None}],
            'histolegajo': [{**current, 'ID': 'PRIVATE_ROW_QA', 'LEGA_12': 'SECRET_EMPLOYEE_QA'}],
            'histocal': [{**current, 'CIER_31': None}, {**current, 'FECA_31': '2026-08-31', 'MES_31': '8', 'CIER_31': '1'}]}

def dump(tables):
    lines = ['-- Host: synthetic    Database: grh_junin\n']
    for table, rows in tables.items():
        columns = sorted(M.REQUIRED[table])
        lines.append(f'CREATE TABLE `{table}` (\n')
        lines.extend(f'  `{c}` varchar(255),\n' for c in columns)
        lines.append(') ENGINE=InnoDB;\n')
        if rows:
            encode = lambda value: 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"
            values = ['(' + ','.join(encode(row.get(c)) for c in columns) + ')' for row in rows]
            lines.append(f'INSERT INTO `{table}` VALUES ' + ','.join(values) + ';\n')
    lines.append('-- Dump completed on 2026-09-22 15:16:58\n')
    return ''.join(lines).encode()

class ShapeTests(unittest.TestCase):
    def audit(self, tables=None, compressed=False, sha=None, raw=None):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'synthetic.sql.gz'
            content = dump(tables or fixtures()) if raw is None else raw
            source.write_bytes(gzip.compress(content) if compressed else content)
            return M.audit_snapshot(source, sha)
    def test_single_cohort_is_shape_compatible_but_never_authorizes_import(self):
        report = self.audit()
        self.assertTrue(report['legacySingleCohortShapeCompatible'])
        self.assertFalse(report['productionImportAuthorized'])
        self.assertEqual(report['databaseWrites'], 0)
    def test_mixed_runs_preserve_two_rows_for_one_contract(self):
        data = fixtures()
        data['histolegajo'].append({**data['histolegajo'][0], 'ID': 'SECOND_PRIVATE_ROW_QA', 'TIPO_31': 'O'})
        data['histocal'].append({**data['histocal'][0], 'TIPO_31': 'O'})
        data['histocal'].append({**data['histocal'][0], 'TIPO_31': 'P', 'CIER_31': '1'})
        report = self.audit(data)
        self.assertEqual(report['snapshot']['records'], 2)
        self.assertEqual(report['snapshot']['distinctContracts'], 1)
        self.assertEqual(report['snapshot']['repeatedContractRows'], 1)
        self.assertEqual(report['latestClosedByType']['M'], '2026-08-31')
        self.assertEqual(report['latestClosedByType']['P'], '2026-09-30')
        self.assertEqual(set(report['blockers']), {'MULTIPLE_SNAPSHOT_COHORTS', 'REPEATED_CONTRACT_ACROSS_RUNS', 'MIXED_CURRENT_RUN_CLOSURES'})
    def test_no_employee_or_row_identifiers_leak(self):
        report = json.dumps(self.audit())
        self.assertNotIn('SECRET_EMPLOYEE_QA', report)
        self.assertNotIn('PRIVATE_ROW_QA', report)
    def test_duplicate_same_assignment_rejected_not_deduplicated(self):
        data = fixtures(); data['histolegajo'].append({**data['histolegajo'][0], 'ID': 'OTHER'})
        with self.assertRaisesRegex(M.AuditError, 'SOURCE_SNAPSHOT_DUPLICATE'): self.audit(data)
    def test_same_source_id_in_different_runs_is_invalid(self):
        data = fixtures(); data['histolegajo'].append({**data['histolegajo'][0], 'TIPO_31': 'O'})
        with self.assertRaisesRegex(M.AuditError, 'SOURCE_SNAPSHOT_DUPLICATE'): self.audit(data)
    def test_missing_run_is_a_blocker(self):
        data = fixtures(); data['histolegajo'][0]['TIPO_31'] = 'Z'
        self.assertIn('SNAPSHOT_RUN_NOT_FOUND', self.audit(data)['blockers'])
    def test_unknown_close_flag_never_means_paid_or_closed(self):
        data = fixtures(); data['histocal'][0]['CIER_31'] = 'paid'
        with self.assertRaisesRegex(M.AuditError, 'SOURCE_CLOSURE_FLAG_UNKNOWN'): self.audit(data)
    def test_hash_pin_checks_physical_container(self):
        raw = dump(fixtures())
        self.assertEqual(self.audit(raw=raw, sha=hashlib.sha256(raw).hexdigest())['source']['container'], 'sql')
        with self.assertRaisesRegex(M.AuditError, 'SOURCE_HASH_MISMATCH'): self.audit(compressed=True, sha=hashlib.sha256(raw).hexdigest())
    def test_compression_preserves_logical_hash_and_separates_physical_hash(self):
        plain, compressed = self.audit(), self.audit(compressed=True)
        self.assertEqual(plain['source']['sha256'], compressed['source']['sha256'])
        self.assertNotEqual(plain['source']['physicalSha256'], compressed['source']['physicalSha256'])
    def test_truncated_source_without_footer_is_rejected(self):
        raw = dump(fixtures()).split(b'-- Dump completed')[0]
        with self.assertRaisesRegex(M.AuditError, 'SOURCE_COMPLETION_INVALID'): self.audit(raw=raw)
    def test_inactive_and_missing_contract_are_explicit(self):
        data = fixtures(); data['legajo'][0]['LEGA_12'] = 'ANOTHER_SECRET'
        report = self.audit(data)
        self.assertEqual(report['reconciliation']['snapshotOrphans'], 1)
        self.assertIn('SNAPSHOT_CONTRACT_NOT_FOUND', report['blockers'])
    def test_short_legacy_period_is_preserved_not_rewritten(self):
        data = fixtures(); data['histocal'][1]['PERI_31'] = '26'
        report = self.audit(data)
        self.assertEqual(report['historicalSourceCoherence']['periodDateMismatchRuns'], 1)
        self.assertEqual(report['historicalSourceCoherence']['valuesCorrected'], 0)
        self.assertEqual(report['latestClosedByType']['M'], '2026-08-31')
    def test_empty_snapshot_never_implies_zero_payroll(self):
        data = fixtures(); data['histolegajo'] = []
        with self.assertRaisesRegex(M.AuditError, 'SOURCE_SNAPSHOT_EMPTY'): self.audit(data)

if __name__ == '__main__': unittest.main()
