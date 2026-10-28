"""Proposed pure synthetic regressions; never read a private backup or run SQL."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import copy
import hashlib
import json
import tempfile
import unittest
from collections import Counter
from unittest.mock import patch
import extract_grh_core as core

CURRENT = '2026-10-31'
CUTOFF = '2026-10-28T15:16:35'
VERSION = 'grh-core-closed-inactive-snapshot-evidence.v1'

def fixture(mutate=None):
    def row(number, kind):
        return {'CODI_01':'1','LEGA_12':str(number),'FECA_31':CURRENT,
                'PERI_31':'2026','MES_31':'10','TIPO_31':kind}
    tables = {
        'concepto':[{'CODI_27':str(n),'TIPO_15':'9'} for n in range(990,1000)],
        'histocal':[{**row(1,'M'),'CIER_31':'1'}, {**row(2,'F'),'CIER_31':'1'}],
        'histolegajo':[{**row(1,'M'),'ID':'1'}, {**row(2,'F'),'ID':'2'}],
        'legajo':[{'CODI_01':'1','LEGA_12':'1','FING_12':'2020-01-01','FEGR_12':None,'NOLI_12':'1'},
                  {'CODI_01':'1','LEGA_12':'2','FING_12':'2010-01-01','FEGR_12':'2019-06-30','NOLI_12':'0'}],
        'legamov':[{**row(n,kind),'ANO_30':'2026','MES_30':'10','CODI_27':'998','CODI_06':'1'} for n,kind in ((1,'M'),(2,'F'))],
        'calculo':[{**row(n,kind),'CODI_27':'998','CANT_31':'0','IMPO_31':'0'} for n,kind in ((1,'M'),(2,'F'))],
    }
    if mutate:
        mutate(tables)
    document = ['-- Host: synthetic    Database: grh_junin\n']
    for table,rows in tables.items():
        columns = sorted(core.REQUIRED_COLUMNS[table] | ({'NOLI_12'} if table == 'legajo' else set()))
        document += [f'CREATE TABLE `{table}` (\n']
        document += [f'  `{column}` varchar(255),\n' for column in columns]
        document += [') ENGINE=InnoDB;\n']
        if rows:
            values = ['(' + ','.join('NULL' if record.get(column) is None else
                       "'" + str(record[column]).replace("'","''") + "'" for column in columns) + ')' for record in rows]
            document += [f'INSERT INTO `{table}` VALUES ' + ','.join(values) + ';\n']
    document += ['-- Dump completed on ' + CUTOFF.replace('T',' ') + '\n']
    payload = ''.join(document).encode('utf-8')
    runs = [{'companyCode':'1','payrollDate':CURRENT,'period':2026,'month':10,
             'payrollType':r['TIPO_31'],'closureStatus':'closed' if r['CIER_31']=='1' else 'open'}
            for r in sorted(tables['histocal'],key=lambda r:r['TIPO_31'])]
    closures = Counter(r['closureStatus'] for r in runs)
    cohorts = Counter((r['PERI_31'],r['MES_31'],r['TIPO_31'],r['FECA_31']) for r in tables['histolegajo'])
    profile = {'id':'synthetic-closed-inactive-candidate','profileVersion':'3.0.0','publicationMode':'candidate_only',
        'source':{'name':'grh_junin','database':'grh_junin','sha256':hashlib.sha256(payload).hexdigest().upper(),
                  'logicalBytes':len(payload),'cutoff':CUTOFF,'currentPayrollDate':CURRENT,
                  'currentPayrollClosureStatus':'closed' if closures['open']==0 else 'mixed',
                  'latestClosedPayrollDate':CURRENT,'latestClosedMonthlyPayrollDate':CURRENT},
        'core':{'profileId':'synthetic-core-closed-inactive','schemaVersion':2,
            'expectedCounts':{table:len(rows) for table,rows in tables.items()},
            'expectedClosureStatusCounts':{name:closures[name] for name in ('closed','open','unknown')},
            'currentRunTypes':sorted({r['payrollType'] for r in runs}),'currentRuns':runs,
            'snapshotCohorts':[{'period':int(k[0]),'month':int(k[1]),'payrollType':k[2],'payrollDate':k[3],'rows':n}
                              for k,n in sorted(cohorts.items())],
            'expectedReconciliation':{'administrativeActive':1,'liquidatedCurrent':2,'activeAndLiquidated':1,
                                      'activeNotLiquidated':0,'liquidatedNotActive':1},
            'historicalInactiveSnapshotEvidence':{'version':VERSION,'expectedContracts':1,'expectedAssignments':1}}}
    return payload,profile

class ClosedInactiveCandidateTests(unittest.TestCase):
    def extract(self, profile_edit=None, table_edit=None, **options):
        payload,profile = fixture(table_edit)
        if profile_edit:
            profile_edit(profile)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        source = Path(temporary.name)/'synthetic.sql'
        source.write_bytes(payload)
        output = Path(temporary.name)/'output'
        with patch.object(core,'load_source_profile',return_value=profile):
            manifest = core.extract(source,output,profile_id=profile['id'],**options)
        self.assertEqual(source.read_bytes(),payload,'source was not changed/reactivated')
        return manifest,output,profile

    def test_closed_candidate_retains_every_row_and_inactive_classification(self):
        manifest,output,profile = self.extract()
        snapshot = json.loads((output/'grh-core-payroll-snapshot.json').read_text(encoding='utf-8'))
        reconciliation = json.loads((output/'grh-core-employment-reconciliation.json').read_text(encoding='utf-8'))
        self.assertEqual(len(snapshot),2)
        self.assertEqual({r['payrollType'] for r in snapshot},{'M','F'})
        inactive = next(r for r in reconciliation if r['sourceKey']['employeeNumber']=='2')
        self.assertFalse(inactive['administrativeActive'])
        self.assertTrue(inactive['liquidatedCurrent'])
        self.assertEqual(inactive['evidenceStatus'],'administrative_inactive')
        self.assertEqual(inactive['exitDate'],'2019-06-30')
        self.assertEqual(inactive['payrollRunReferences'][0]['payrollType'],'F')
        self.assertEqual(inactive['payrollRunReferences'][0]['closureStatus'],'closed')
        self.assertEqual({k:manifest['reconciliation'][k] for k in profile['core']['expectedReconciliation']},profile['core']['expectedReconciliation'])
        self.assertEqual(manifest['quality']['historicalInactiveSnapshotEvidence'],{
            'version':VERSION,'contracts':1,'assignments':1,'referenceClosureStatus':'closed',
            'administrativeClassification':'administrative_inactive','administrativeEligibilityChanged':False,
            'sourceTypeCanonicalMappingPerformed':False})
        self.assertEqual(manifest['schemaVersion'],2)
        self.assertEqual(manifest['quality']['publication'],{'candidateOnly':True,'databaseWrites':0,
            'v1ImporterCompatible':False,'reason':'MULTIRUN_REQUIRES_VERSIONED_DATABASE_PUBLICATION'})

    def test_missing_or_inexact_declaration_and_reconciliation_reject(self):
        edits = [lambda p:p['core'].pop('historicalInactiveSnapshotEvidence'),
                 lambda p:p['core'].pop('expectedReconciliation'),
                 lambda p:p['core']['historicalInactiveSnapshotEvidence'].pop('expectedAssignments'),
                 lambda p:p['core']['historicalInactiveSnapshotEvidence'].update(expectedAssignments=2),
                 lambda p:p['core']['historicalInactiveSnapshotEvidence'].update(expectedContracts=True),
                 lambda p:p['core']['historicalInactiveSnapshotEvidence'].update(version='unknown'),
                 lambda p:p['core']['historicalInactiveSnapshotEvidence'].update(passed=True),
                 lambda p:p['core']['expectedReconciliation'].update(liquidatedNotActive=0),
                 lambda p:p['core']['expectedReconciliation'].update(liquidatedNotActive=True)]
        for edit in edits:
            with self.subTest(edit=edits.index(edit)),self.assertRaises(core.ExtractionError):
                self.extract(profile_edit=edit)

    def test_v1_normal_or_earlier_undeclared_profiles_keep_rejecting(self):
        for edit in (lambda p:p.update(publicationMode='normal'),
                     lambda p:(p.update(id='grh-junin-2026-10-14'),p['core'].pop('historicalInactiveSnapshotEvidence'))):
            with self.subTest(edit=edit),self.assertRaises(core.ExtractionError):
                self.extract(profile_edit=edit)
        # Direct guard test: do not disguise a v2 snapshotCohorts fixture as a
        # complete legacy v1 profile (which needs its own snapshotCohort).
        _,profile = fixture()
        profile['core']['schemaVersion'] = 1
        person,reference = ('1','2'),('1',CURRENT,'2026','10','F')
        with self.assertRaises(core.ExtractionError):
            core._closed_inactive_snapshot_evidence(profile,allow_source_drift=False,fixture_mode=False,
                reconciliation=profile['core']['expectedReconciliation'],inactive_keys={person},
                snapshot_run_refs={person:[reference]},run_status_by_key={reference:'closed'})

    def test_drift_and_fixture_flags_cannot_authorize_inactive_evidence(self):
        with self.assertRaises(core.ExtractionError):
            self.extract(fixture_mode=True)
        with self.assertRaises(core.ExtractionError):
            self.extract(profile_edit=lambda p:p.update(id='grh-junin-2026-08-06'),
                         allow_source_drift=True,fixture_mode=True)

    def test_inactive_open_source_run_rejects_without_filtering_it(self):
        def opened(tables):
            tables['histocal'][1]['CIER_31'] = None
        with self.assertRaisesRegex(core.ExtractionError,'administratively inactive'):
            self.extract(table_edit=opened)

    def test_helper_rejects_unknown_missing_or_repeated_references(self):
        _,profile = fixture()
        person = ('1','2')
        reference = ('1',CURRENT,'2026','10','F')
        for references,statuses in (([reference],{reference:'unknown'}),([reference],{}),
                                     ([],{}),([reference,reference],{reference:'closed'})):
            with self.subTest(references=len(references)),self.assertRaises(core.ExtractionError):
                core._closed_inactive_snapshot_evidence(profile,allow_source_drift=False,fixture_mode=False,
                    reconciliation=profile['core']['expectedReconciliation'],inactive_keys={person},
                    snapshot_run_refs={person:references},run_status_by_key=statuses)

    def test_duplicate_assignments_or_orphan_contracts_still_reject(self):
        def duplicate(tables):
            tables['histolegajo'].append({**tables['histolegajo'][1],'ID':'3'})
        def orphan(tables):
            tables['histolegajo'][1]['LEGA_12'] = '999'
        for change in (duplicate,orphan):
            with self.subTest(change=change),self.assertRaises(core.ExtractionError):
                self.extract(table_edit=change)

    def test_noli_codes_do_not_reactivate_or_remove_the_historical_contract(self):
        def changed_noli(tables):
            tables['legajo'][0]['NOLI_12'] = '0'
            tables['legajo'][1]['NOLI_12'] = '1'
        manifest,_,_ = self.extract(table_edit=changed_noli)
        self.assertEqual(manifest['reconciliation']['administrativeActive'],1)
        self.assertEqual(manifest['reconciliation']['liquidatedNotActive'],1)
        self.assertEqual(manifest['outputs']['payrollSnapshot']['records'],2)

if __name__ == '__main__':
    unittest.main()
