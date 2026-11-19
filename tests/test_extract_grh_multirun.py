"""Strict synthetic multi-run source: no municipal records or relaxed source gates."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import extract_grh_core as core

def fixtures():
    run={'CODI_01':'101','PERI_31':'2026','MES_31':'9','FECA_31':'2026-09-30','TIPO_31':'M','CIER_31':None,'fechaIG':None}
    current={**run,'ID':'1','LEGA_12':'1'}
    return {
     'concepto':[{'CODI_27':str(i),'TIPO_15':'9','DETA_15':'TOTAL SINTETICO','CALC_15':None,'ABRE_15':None,'TOTA_15':None} for i in range(990,1000)],
     'histocal':[run,{**run,'TIPO_31':'O'},{**run,'TIPO_31':'V','CIER_31':'1'},{**run,'MES_31':'8','FECA_31':'2026-08-31','CIER_31':'1'}],
     'histolegajo':[current,{**current,'ID':'2','TIPO_31':'O'}],
     'legajo':[{'CODI_01':'101','LEGA_12':str(i),'FING_12':'2020-01-01','FEGR_12':None} for i in [1,2]],
     'legamov':[{**run,'LEGA_12':'1','ANO_30':'2026','MES_30':'9','CODI_27':'999','cant_30':'1','CODI_06':'1'}],
     'calculo':[{**run,'LEGA_12':'1','CODI_27':'999','IMPO_31':'100.01','CANT_31':'1','CODI_02':'1','CODI_07':'1'},
                {**run,'LEGA_12':'1','TIPO_31':'V','CODI_27':'999','IMPO_31':'20.01','CANT_31':'1','CODI_02':'1','CODI_07':'1'},
                {**run,'LEGA_12':'2','FECA_31':'2026-08-31','MES_31':'8','CODI_27':'999','IMPO_31':'90.00','CANT_31':'1','CODI_02':'1','CODI_07':'1'}]
    }

def sql(tables):
    lines=['-- Host: synthetic    Database: grh_junin\n']
    for table,rows in tables.items():
        cols=sorted(core.REQUIRED_COLUMNS[table])
        lines.append(f'CREATE TABLE `{table}` (\n');lines.extend(f' `{c}` varchar(255),\n' for c in cols);lines.append(') ENGINE=InnoDB;\n')
        encode=lambda v:'NULL' if v is None else "'"+str(v).replace("'","''")+"'"
        if rows:lines.append(f'INSERT INTO `{table}` VALUES '+','.join('('+','.join(encode(r.get(c)) for c in cols)+')' for r in rows)+';\n')
    lines.append('-- Dump completed on 2026-09-22 15:16:58\n')
    return ''.join(lines).encode()

def profile(raw,tables):
    return {'id':'synthetic-v2-strict','profileVersion':'2.0.0','source':{'name':'grh_junin','database':'grh_junin','sha256':hashlib.sha256(raw).hexdigest().upper(),'logicalBytes':len(raw),'cutoff':'2026-09-22T15:16:58','currentPayrollDate':'2026-09-30','currentPayrollClosureStatus':'mixed','latestClosedPayrollDate':'2026-09-30','latestClosedMonthlyPayrollDate':'2026-08-31'},
    'core':{'schemaVersion':2,'profileId':'synthetic-v2-strict','expectedCounts':{k:len(v) for k,v in tables.items()},
     'snapshotCohorts':[{'period':2026,'month':9,'payrollDate':'2026-09-30','payrollType':kind,'rows':1} for kind in ['M','O']],
     'expectedClosureStatusCounts':{'open':2,'closed':2},'currentRunTypes':['M','O','V'],
     'currentRuns':[{'companyCode':'101','payrollDate':'2026-09-30','period':2026,'month':9,'payrollType':kind,'closureStatus':'closed' if kind=='V' else 'open'} for kind in ['M','O','V']],
     'latestClosedHeadcount':1,'expectedReconciliation':{'administrativeActive':2,'liquidatedCurrent':1,'activeAndLiquidated':1,'activeNotLiquidated':1,'liquidatedNotActive':0}}}

class MultirunExtractionTests(unittest.TestCase):
    def extract(self,tables=None,mutate_profile=None):
        tables=fixtures() if tables is None else tables;raw=sql(tables);p=profile(raw,tables)
        if mutate_profile:mutate_profile(p)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'source.sql';source.write_bytes(raw);out=Path(folder)/'outputs'
            with patch.object(core,'load_source_profile',return_value=p):m=core.extract(source,out)
            return m,{k:json.loads((out/v).read_text()) for k,v in core.OUTPUT_FILES.items()}
    def test_repeated_contract_is_two_assignments_without_data_loss(self):
        m,rows=self.extract();self.assertEqual(m['schemaVersion'],2);self.assertEqual(m['outputs']['payrollSnapshot']['records'],2)
        self.assertEqual(len(rows['payrollSnapshot']),2);self.assertEqual(m['quality']['snapshotMembership']['distinctContracts'],1)
        self.assertEqual({r['sourceKey']['id'] for r in rows['payrollSnapshot']},{'1','2'})
    def test_closed_vacation_does_not_close_monthly(self):
        m,rows=self.extract();self.assertEqual(m['source']['currentPayrollClosureStatus'],'mixed')
        self.assertEqual(m['source']['latestClosedMonthlyPayrollDate'],'2026-08-31');self.assertEqual(m['source']['latestClosedByType']['V'],'2026-09-30')
        current={r['sourceKey']['payrollType']:r['closureStatus'] for r in rows['payrollRuns'] if r['sourceKey']['payrollDate']=='2026-09-30'}
        self.assertEqual(current,{'M':'open','O':'open','V':'closed'})
    def test_reconciliation_preserves_each_run_reference(self):
        m,rows=self.extract();employee=rows['employmentReconciliation'][0]
        self.assertEqual(len(employee['payrollRunReferences']),2)
        self.assertEqual({r['payrollType'] for r in employee['payrollRunReferences']},{'M','O'})
        self.assertEqual(rows['employmentReconciliation'][1]['payrollRunReferences'],[])
    def test_output_is_candidate_not_a_production_authorization(self):
        m,rows=self.extract();self.assertEqual(m['quality']['publication']['databaseWrites'],0)
        self.assertTrue(m['quality']['publication']['candidateOnly']);self.assertFalse(m['quality']['publication']['v1ImporterCompatible'])
    def test_monthly_grain_keeps_decimal_values_and_types(self):
        m,rows=self.extract();self.assertEqual(len(rows['payrollMonthly']),3)
        self.assertIn('100.01',[r['sourceTotals']['netPayable'] for r in rows['payrollMonthly']])
    def test_duplicate_source_id_is_rejected(self):
        data=fixtures();data['histolegajo'][1]['ID']='1'
        with self.assertRaisesRegex(core.ExtractionError,'duplicate histolegajo'):self.extract(data)
    def test_duplicate_same_assignment_with_different_id_is_rejected(self):
        data=fixtures();data['histolegajo'][1]['TIPO_31']='M'
        with self.assertRaisesRegex(core.ExtractionError,'duplicate histolegajo'):self.extract(data)
    def test_incorrect_profile_hash_is_rejected(self):
        with self.assertRaisesRegex(Exception,'selected profile: sha256'):self.extract(mutate_profile=lambda p:p['source'].update(sha256='0'*64))
    def test_incorrect_profile_counts_are_rejected(self):
        with self.assertRaisesRegex(core.ExtractionError,'count mismatch'):self.extract(mutate_profile=lambda p:p['core']['expectedCounts'].update(histolegajo=999))
    def test_mixed_closure_must_match_each_exact_run(self):
        with self.assertRaisesRegex(core.ExtractionError,'identities/closures'):self.extract(mutate_profile=lambda p:p['core']['currentRuns'][0].update(closureStatus='closed'))
    def test_profile_monthly_closure_cannot_be_moved_to_vacations(self):
        with self.assertRaisesRegex(core.ExtractionError,'Monthly payroll closure'):self.extract(mutate_profile=lambda p:p['source'].update(latestClosedMonthlyPayrollDate='2026-09-30'))
    def test_final_settlement_of_exited_legajo_is_declared_not_rejected(self):
        tables=fixtures();run={**tables['histocal'][0],'TIPO_31':'F','CIER_31':'1'};tables['histocal'].append(run)
        tables['legajo'].append({'CODI_01':'101','LEGA_12':'3','FING_12':'2020-01-01','FEGR_12':'2026-09-15'})
        tables['histolegajo'].append({**run,'ID':'3','LEGA_12':'3'})
        def declare(p):
            p['core']['currentRunTypes']=['F','M','O','V'];p['core']['expectedClosureStatusCounts']={'open':2,'closed':3}
            p['core']['currentRuns'].insert(0,{'companyCode':'101','payrollDate':'2026-09-30','period':2026,'month':9,'payrollType':'F','closureStatus':'closed'})
            p['core']['snapshotCohorts'].insert(0,{'period':2026,'month':9,'payrollDate':'2026-09-30','payrollType':'F','rows':1})
            p['core']['expectedReconciliation']={'administrativeActive':2,'liquidatedCurrent':2,'activeAndLiquidated':1,'activeNotLiquidated':1,'liquidatedNotActive':1}
        m,outputs=self.extract(tables,declare)
        self.assertEqual(m['reconciliation']['liquidatedNotActive'],1)
        exited=[r for r in outputs['employmentReconciliation'] if r['sourceKey']['employeeNumber']=='3'][0]
        self.assertFalse(exited['administrativeActive']);self.assertTrue(exited['liquidatedCurrent']);self.assertEqual(exited['evidenceStatus'],'administrative_inactive')
        # The same exited legajo inside a monthly run is still rejected.
        tables2=fixtures();tables2['legajo'].append({'CODI_01':'101','LEGA_12':'3','FING_12':'2020-01-01','FEGR_12':'2026-09-15'})
        tables2['histolegajo'].append({**tables2['histocal'][0],'ID':'3','LEGA_12':'3'})
        with self.assertRaisesRegex(core.ExtractionError,'administratively inactive'):
            self.extract(tables2,lambda p:(p['core']['snapshotCohorts'].__setitem__(0,{'period':2026,'month':9,'payrollDate':'2026-09-30','payrollType':'M','rows':2}),p['core']['expectedReconciliation'].update({'liquidatedCurrent':2,'liquidatedNotActive':1})))
    def test_unassigned_run_does_not_increase_snapshot_headcount(self):
        m,rows=self.extract();self.assertEqual(len(m['source']['currentPayrollRuns']),3)
        self.assertEqual(m['reconciliation']['liquidatedCurrent'],1)

if __name__=='__main__':unittest.main()
