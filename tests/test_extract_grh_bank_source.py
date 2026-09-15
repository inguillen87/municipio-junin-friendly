"""Focused synthetic tests: never load municipal files in CI."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('bank_extractor', Path(__file__).parents[1] / 'scripts/extract-grh-bank-source.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def source_sql():
    records = {
        'legajo': ['101', '7', '9', '101', '2', '000123', None, None],
        'persona': ['9', 'Persona sintética', '20111111112'],
        'banco': ['101', 'Banco sintético', '191'],
        'histolegajo': ['101', '7', '2026', '8', 'M', '2026-08-31', '1', 'Repartición sintética'],
    }
    sql = '-- Host: local    Database: grh_junin\n'
    for table, values in records.items():
        sql += 'CREATE TABLE `' + table + '` (\n' + ',\n'.join(' `' + column + '` text' for column in module.TABLE_FIELDS[table]) + '\n);\n'
        sql += 'INSERT INTO `' + table + '` VALUES (' + ','.join('NULL' if value is None else "'" + value + "'" for value in values) + ');\n'
    return sql + '-- Dump completed on 2026-08-19 15:17:09\n'

class BankExtractorTests(unittest.TestCase):
    def test_matching_source_preserves_zeroes_and_exact_assignment(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'synthetic.sql'
            file.write_text(source_sql(), encoding='utf-8')
            sha = hashlib.sha256(file.read_bytes()).hexdigest()
            result = module.extract(file, sha, '101')
            self.assertEqual(result['employees'][0]['accountNumber'], '000123')
            self.assertEqual(result['employees'][0]['accountTypeCode'], '2')
            self.assertNotIn('accountType', result['employees'][0])
            self.assertEqual(result['assignments'][0]['date'], '2026-08-31')
            self.assertEqual(result['cutoff'], '2026-08-19T15:17:09')
            self.assertEqual(result['sourceSha256'], sha)
            with self.assertRaisesRegex(ValueError, 'HASH_MISMATCH'):
                module.extract(file, '0' * 64, '101')

    def test_private_output_is_idempotent_and_refuses_git_or_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = {'sourceSha256': 'a' * 64, 'cutoff': '2026-08-19T15:17:09', 'employees': [], 'assignments': [], 'banks': []}
            dest = root / 'private.json'
            first = module.write_private(payload, dest)
            self.assertEqual(first, module.write_private(payload, dest))
            with self.assertRaisesRegex(ValueError, 'ALREADY_EXISTS'):
                module.write_private({**payload, 'cutoff': '2026-08-20T15:17:09'}, dest)
            (root / '.git').mkdir()
            with self.assertRaisesRegex(ValueError, 'OUTSIDE_GIT'):
                module.write_private(payload, root / 'forbidden.json')

if __name__ == '__main__':
    unittest.main()
