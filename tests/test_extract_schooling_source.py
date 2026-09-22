"""Offline synthetic SQL dumps only; no municipal data or credentials."""
import hashlib
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
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

    def test_known_profiles_are_explicit_and_default_remains_august(self):
        self.assertEqual(recovery.DEFAULT_SOURCE_PROFILE, 'grh-junin-2026-08-06')
        self.assertEqual(recovery.SOURCE_PROFILE_CHILDREN, {
            'grh-junin-2026-08-06': 2684, 'grh-junin-2026-09-10': 2686})
        for selected, children in recovery.SOURCE_PROFILE_CHILDREN.items():
            profile=recovery.curated.load_source_profile(selected)
            original={'version':'schooling-source-recovery.v1','sourceSha256':profile['source']['sha256'].lower()}
            with patch.object(recovery,'extract',return_value=(original.copy(),{'children':children})) as extract:
                payload,report=recovery.extract_known_source(Path('not-opened.sql'),selected)
            self.assertEqual(extract.call_args.args[1],profile)
            self.assertEqual(payload,original)
            self.assertEqual(report['sourceProfileId'],selected)

    def test_unknown_profiles_fail_before_source_is_read(self):
        for selected in ['unknown','grh-core-junin-2026-09','','grh-junin-2026-09-11',None]:
            with patch.object(recovery,'extract') as extract:
                with self.assertRaisesRegex(ValueError,'SCHOOLING_SOURCE_PROFILE_UNSUPPORTED'):
                    recovery.extract_known_source(Path('not-opened.sql'),selected)
                extract.assert_not_called()

    def test_each_profile_rejects_the_other_child_cohort(self):
        for selected,expected in recovery.SOURCE_PROFILE_CHILDREN.items():
            with patch.object(recovery,'extract',return_value=({}, {'children':expected+1})):
                with self.assertRaisesRegex(ValueError,'SOURCE_PROFILE_COHORT_COUNT_MISMATCH'):
                    recovery.extract_known_source(Path('not-opened.sql'),selected)

    def test_cli_routes_default_and_explicit_september_before_creating_output(self):
        for options,selected in [([],recovery.DEFAULT_SOURCE_PROFILE),(['--profile','grh-junin-2026-09-10'],'grh-junin-2026-09-10')]:
            with patch.object(sys,'argv',['extract','--source','known.sql','--output-dir','not-created',*options]), \
                 patch.object(recovery,'extract_known_source',side_effect=RuntimeError('test-stop')) as extract, \
                 patch.object(recovery,'private_directory') as output:
                with self.assertRaisesRegex(RuntimeError,'test-stop'):recovery.main()
                extract.assert_called_once_with(Path('known.sql'),selected)
                output.assert_not_called()
        with patch.object(sys,'argv',['extract','--source','known.sql','--output-dir','not-created','--profile','unknown']), \
             patch.object(recovery,'extract_known_source') as extract, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):recovery.main()
            extract.assert_not_called()

    def test_exact_profile_metadata_rejects_mixed_cutoff_hash_database_or_container(self):
        for selected in recovery.SOURCE_PROFILE_CHILDREN:
            profile=recovery.curated.load_source_profile(selected)
            source=profile['source']
            metadata={key:source[key] for key in ('sha256','logicalBytes','database','cutoff')}
            metadata.update(container='gzip',physicalSha256=source['gzipSha256'],physicalBytes=source['gzipBytes'])
            recovery.curated.validate_source_metadata(metadata,profile)
            for key,value in [('sha256','0'*64),('logicalBytes',1),('database','foreign'),('cutoff','2026-09-11T00:00:00'),('physicalSha256','f'*64),('physicalBytes',1)]:
                with self.assertRaises(recovery.curated.ExtractionError):
                    recovery.curated.validate_source_metadata({**metadata,key:value},profile)

    def test_unknown_real_source_is_rejected_by_default_and_explicit_profiles(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'unknown.sql';path.write_text(dump([row(),row(CODI_14='2')]),encoding='utf-8',newline='')
            for selected in recovery.SOURCE_PROFILE_CHILDREN:
                with self.assertRaises(recovery.curated.ExtractionError):recovery.extract_known_source(path,selected)


if __name__=='__main__':unittest.main()
