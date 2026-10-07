"""Synthetic local SQL-to-artifact regression for original payroll facts."""
import copy
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('curated_payroll_fields_test', ROOT / 'scripts/extract_rrhh_curated.py')
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

def employee(**changes):
    row = {key: None for key in MODULE.REQUIRED_COLUMNS['legajo']}
    row.update(CODI_01='1', LEGA_12='000901', IDPERSONA='1', FING_12='2024-03-04',
               CODI_02='1', CODI_07='17', CODI_10='3', CODI_06='42',
               iddepartamento='7', NOLI_12='0', ANTA_12='0003', ANTM_12='01',
               SUEL_12='100.100000000000000001', CODI_19='04', concursado='0')
    row.update(changes)
    return row

def references():
    return [{'iddepartamento': '7', 'nombre': '042'}, {'iddepartamento': '8', 'nombre': '055'}]

def tables(rows=None, departments=None):
    data = {name: [] for name in MODULE.EXPECTED_COUNTS}
    data['persona'] = [{'IDPERSONA': '1', 'NOMB_12': 'Persona inventada para QA'}]
    data['legajo'] = rows if rows is not None else [employee()]
    if departments is not False:
        data['departamento'] = references() if departments is None else departments
    return data

def document(data, omit=None):
    omit = omit or {}
    lines = ['-- Host: synthetic    Database: grh_junin\n']
    for table, rows in data.items():
        required = MODULE.REQUIRED_COLUMNS.get(table, {'iddepartamento', 'nombre'})
        columns = sorted((set(required) | {key for row in rows for key in row}) - set(omit.get(table, [])))
        lines += [f'CREATE TABLE `{table}` (\n'] + [f'  `{key}` varchar(255),\n' for key in columns] + [') ENGINE=InnoDB;\n']
        if rows:
            encoded = ['(' + ','.join('NULL' if row.get(key) is None else "'" + str(row[key]).replace("'", "''") + "'" for key in columns) + ')' for row in rows]
            lines.append(f'INSERT INTO `{table}` VALUES ' + ','.join(encoded) + ';\n')
    lines.append('-- Dump completed on 2026-08-06 15:17:30\n')
    return ''.join(lines).encode('utf-8')

def fixture_extract(folder, data=None, omit=None):
    data = tables() if data is None else data
    content = document(data, omit)
    source = folder / 'synthetic.sql'
    source.write_bytes(content)
    profile = MODULE.load_source_profile()
    profile['source'].update(sha256=hashlib.sha256(content).hexdigest().upper(), logicalBytes=len(content),
                             database='grh_junin', cutoff='2026-08-06T15:17:30')
    profile['curated']['expectedCounts'] = {table: len(data[table]) for table in MODULE.EXPECTED_COUNTS}
    profile['curated']['expectedOutputCounts'] = {entity: len(data[table]) for table, (entity, _) in MODULE.OUTPUT_BY_TABLE.items()}
    with patch.object(MODULE, 'load_source_profile', return_value=copy.deepcopy(profile)):
        manifest = MODULE.build_outputs(source, folder / 'out', MODULE.scan_source(source))
    rows = json.loads((folder / 'out' / MODULE.OUTPUT_FILES['employees']).read_text(encoding='utf-8'))
    return manifest, rows

class PayrollFieldsTests(unittest.TestCase):
    def setUp(self):
        (ROOT / 'verification').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='payroll-fields-synthetic-', dir=ROOT / 'verification')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)

    def test_complete_sql_artifact_carries_both_explicit_references_and_inactive_rows(self):
        original = [employee(), employee(LEGA_12='0902', iddepartamento='8', FEGR_12='2025-06-30')]
        manifest, rows = fixture_extract(self.folder, tables(original))
        self.assertEqual(len(rows), 2)
        self.assertEqual([r['sourceReferences']['department']['sourceFields']['nombre'] for r in rows], ['042', '055'])
        self.assertEqual(rows[1]['employment']['activeProxy'], False)
        self.assertEqual(manifest['validation']['optionalReferences']['departamento']['actual'], 2)
        output = manifest['outputs']['employees']
        self.assertEqual(output['sha256'], hashlib.sha256((self.folder / 'out' / output['file']).read_bytes()).hexdigest().upper())

    def test_source_primary_keys_and_decimal_values_keep_their_original_bytes(self):
        _, rows = fixture_extract(self.folder)
        r = rows[0]
        self.assertEqual(r['sourceProvenance'], {'table': 'legajo', 'primaryKey': {'CODI_01': '1', 'LEGA_12': '000901'}})
        self.assertEqual(r['sourceFields']['SUEL_12'], '100.100000000000000001')
        self.assertEqual(r['sourceFields']['ANTA_12'], '0003')
        self.assertEqual(r['sourceReferences']['department']['primaryKey'], {'iddepartamento': '7'})

    def test_liquidation_values_are_not_turned_into_authority_or_boolean(self):
        values = [None, '', '0', '1', ' NULL ', 'unexpected']
        _, rows = fixture_extract(self.folder, tables([employee(LEGA_12=str(900+n), NOLI_12=v) for n, v in enumerate(values)]))
        self.assertEqual([r['sourceFields']['NOLI_12'] for r in rows], values)
        for r in rows:
            self.assertTrue(r['employment']['activeProxy'])
            self.assertFalse(any(key in r or key in r['employment'] for key in ['eligible', 'liquidationEnabled', 'jurisdictionCode']))

    def test_absent_columns_null_and_blank_department_stay_distinct(self):
        _, rows = fixture_extract(self.folder, tables([employee(LEGA_12='901', iddepartamento=None), employee(LEGA_12='902', iddepartamento='')]))
        self.assertEqual([r['sourceFields']['iddepartamento'] for r in rows], [None, ''])
        self.assertTrue(all(r['sourceReferences'] == {} for r in rows))
        other = self.folder / 'other'
        other.mkdir()
        _, absent = fixture_extract(other, omit={'legajo': ['iddepartamento', 'NOLI_12']})
        self.assertNotIn('iddepartamento', absent[0]['sourceFields'])
        self.assertNotIn('NOLI_12', absent[0]['sourceFields'])

    def test_missing_optional_table_does_not_fabricate_a_reference(self):
        manifest, rows = fixture_extract(self.folder, tables(departments=False))
        self.assertEqual(rows[0]['sourceFields']['iddepartamento'], '7')
        self.assertEqual(rows[0]['sourceReferences'], {})
        self.assertFalse(manifest['validation']['optionalReferences']['departamento']['present'])

    def test_unmatched_reference_keeps_pending_source_and_does_not_use_cost_or_sector(self):
        manifest, rows = fixture_extract(self.folder, tables([employee(iddepartamento='999', CODI_06='42', CODI_07='17')]))
        self.assertEqual(rows[0]['sourceFields']['iddepartamento'], '999')
        self.assertEqual(rows[0]['sourceReferences'], {})
        self.assertEqual(manifest['validation']['joins']['employeeDepartment']['orphanRows'], 1)

    def test_unknown_reference_name_and_whitespace_are_not_normalized(self):
        data = tables([employee(iddepartamento='007')], [{'iddepartamento': '007', 'nombre': ' 045 '}])
        _, rows = fixture_extract(self.folder, data)
        ref = rows[0]['sourceReferences']['department']
        self.assertEqual(ref['primaryKey']['iddepartamento'], '007')
        self.assertEqual(ref['sourceFields']['nombre'], ' 045 ')
        self.assertNotIn('jurisdictionCode', rows[0]['employment'])

    def test_source_reference_join_is_exact_instead_of_numeric_or_trimmed(self):
        _, rows = fixture_extract(self.folder, tables([employee(iddepartamento='07')]))
        self.assertEqual(rows[0]['sourceReferences'], {})
        other = self.folder / 'other'
        other.mkdir()
        _, rows = fixture_extract(other, tables([employee(iddepartamento=' 7 ')]))
        self.assertEqual(rows[0]['sourceReferences'], {})

    def test_duplicate_reference_is_refused_before_replacing_generated_files(self):
        fixture_extract(self.folder)
        original = (self.folder / 'out' / 'curated-manifest.json').read_bytes()
        with self.assertRaisesRegex(MODULE.ExtractionError, 'Duplicate'):
            fixture_extract(self.folder, tables(departments=references() + [references()[0]]))
        self.assertEqual((self.folder / 'out' / 'curated-manifest.json').read_bytes(), original)

    def test_null_reference_primary_key_and_malformed_table_are_refused(self):
        with self.assertRaisesRegex(MODULE.ExtractionError, 'Null source primary key'):
            fixture_extract(self.folder, tables(departments=[{'iddepartamento': None, 'nombre': '042'}]))
        with self.assertRaisesRegex(MODULE.ExtractionError, 'missing required columns'):
            fixture_extract(self.folder, omit={'departamento': ['nombre']})

    def test_no_nominal_identity_or_bank_field_is_added_to_payroll_source_fields(self):
        _, rows = fixture_extract(self.folder, tables([employee(CBU='synthetic-private-account', NCTA_12='another-private-account', NOMB_12='source-only-name', NUDO_12='source-only-id')]))
        for key in ['CBU', 'cbu_12', 'NCTA_12', 'NOMB_12', 'NUDO_12']:
            self.assertNotIn(key, rows[0]['sourceFields'])

    def test_all_original_payroll_fields_remain_exact_without_changing_legacy_projection(self):
        raw = employee(CODI_10='003', FING_12='0000-00-00', ANTM_12='', CODI_19=None)
        _, rows = fixture_extract(self.folder, tables([raw]))
        fields = rows[0]['sourceFields']
        for key in ['CODI_02', 'CODI_07', 'CODI_10', 'FING_12', 'FEGR_12', 'ANTA_12', 'ANTM_12', 'CODI_19', 'concursado']:
            self.assertEqual(fields[key], raw[key])
        other = self.folder / 'other'
        other.mkdir()
        _, legacy = fixture_extract(other, tables([raw], departments=False))
        for result in [rows[0], legacy[0]]:
            for key in ['sourceFields', 'sourceReferences', 'sourceProvenance']:
                result.pop(key)
        self.assertEqual(rows, legacy)

if __name__ == '__main__':
    if sys.argv[1:] == ['--emit-projection-fixture']:
        (ROOT / 'verification').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='payroll-fields-projection-', dir=ROOT / 'verification') as folder:
            raw = [employee(LEGA_12=f'{n:06d}', iddepartamento='7' if n % 2 else '8', NOLI_12='1' if n % 3 else None) for n in range(901, 958)]
            _, rows = fixture_extract(Path(folder), tables(raw))
            print(json.dumps(rows, ensure_ascii=False))
    else:
        unittest.main()
