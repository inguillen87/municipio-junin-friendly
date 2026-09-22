"""Offline synthetic SQL dumps only; no municipal data or credentials."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import extract_schooling_source as recovery


def row(**extra):
    return {'CODI_14': '1', 'CODI_01': '101', 'LEGA_12': '7', 'NOMB_14': '  María  "Álvarez"  ', 'SEXO_14': 'F',
            'FENA_14': '2012-02-29', 'NUDO_14': None, 'CUIL_14': None, 'IDVINCULO': '2', 'FBAJ_14': None,
            'PRES_14': '2026-03-05', 'VENC_14': None, **extra}


def literal(x):
    return 'NULL' if x is None else "'" + str(x).replace('\\', '\\\\').replace("'", "\\'") + "'"


def dump(rows):
    columns=list(rows[0])
    sql='-- Host: localhost    Database: qa_grh\nCREATE TABLE `familia` (\n'
    sql+=''.join(f' `{c}` text DEFAULT NULL,\n' for c in columns)
    sql+=' PRIMARY KEY (`CODI_14`)\n) ENGINE=InnoDB;\n'
    sql+='INSERT INTO `familia` VALUES '+','.join('('+','.join(literal(r[c]) for c in columns)+')' for r in rows)+';\n'
    sql+='CREATE TABLE `vinculo` (\n `IDVINCULO` text,\n `CODI_46` text,\n `DETA_46` text\n) ENGINE=InnoDB;\n'
    sql+="INSERT INTO `vinculo` VALUES ('2','H','HIJO'),('9','H','PRENATAL');\n-- Dump completed on 2026-08-06 15:15:21\n"
    return sql


class SourceRecoveryTests(unittest.TestCase):
    def extract(self, text):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'qa.sql';p.write_text(text,encoding='utf-8',newline='')
            profile={'source': {'sha256': hashlib.sha256(p.read_bytes()).hexdigest().upper(), 'logicalBytes':p.stat().st_size,'database':'qa_grh','cutoff':'2026-08-06T15:15:21'},
                     'curated':{'expectedCounts':{'familia':2,'vinculo':2}}}
            return recovery.extract(p,profile)

    def test_exact_nullable_fields_and_child_catalog_no_nominal_output(self):
        source=dump([row(),row(CODI_14='2',IDVINCULO='9',PRES_14=None)])
        payload,report=self.extract(source)
        self.assertEqual(report['children'],1)
        self.assertEqual(payload['rows'][0]['sourceFields'],{'PRES_14':'2026-03-05','VENC_14':None})
        self.assertNotIn('María',json.dumps(payload,ensure_ascii=False))
        self.assertEqual(payload['rows'][0]['identitySha256'],recovery.identity_hash(row()))

    def test_identity_hash_matches_postgres_array_text_and_preserves_source_identity(self):
        values=['1','101','7','María "Álvarez"','F','2012-02-29',None,None,'2',None]
        expected=hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(', ',': ')).encode()).hexdigest()
        self.assertEqual(recovery.identity_hash(row()),expected)
        self.assertEqual(recovery.identity_hash(row(PRES_14=None)),expected)
        for key,value in [('CODI_14','2'),('LEGA_12','8'),('NUDO_14','9999'),('FENA_14','2012-02-28'),('FBAJ_14','2025-01-01')]:
            self.assertNotEqual(recovery.identity_hash(row(**{key:value})),expected)

    def test_absent_null_empty_invalid_and_future_date_stay_distinct(self):
        for fields,state in [({},'absent'),({'PRES_14':None},'null'),({'PRES_14':''},'invalid'),({'PRES_14':'0000-00-00'},'invalid'),({'PRES_14':'2026-02-30'},'invalid'),({'PRES_14':'2050-12-31'},'valid')]:
            self.assertEqual(recovery.field_state(fields,'PRES_14'),state)

    def test_duplicate_family_keys_or_missing_date_schema_fail_closed(self):
        with self.assertRaises(ValueError):self.extract(dump([row(),row()]))
        with self.assertRaises(ValueError):self.extract(dump([row(),row(CODI_14='2')]).replace('`PRES_14`','`OTHER_DATE`'))

    def test_different_source_identity_and_unfinished_source_are_rejected(self):
        text=dump([row(),row(CODI_14='2',CODI_01='202')])
        with self.assertRaises(ValueError):self.extract(text)
        with self.assertRaises(Exception):self.extract(dump([row(),row(CODI_14='2')])+'INSERT INTO `familia` VALUES (1);\n')


if __name__=='__main__':unittest.main()
