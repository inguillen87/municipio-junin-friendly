import gzip, hashlib, importlib.util, pathlib, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('budget_positions',ROOT/'scripts/extract-grh-budget-positions.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
SNAP=['ID','CODI_01','LEGA_12','FECA_31','PERI_31','MES_31','TIPO_31','CARGO','ESTRUCTURAPRESU','PRESUDETALLE']
RUN=['CODI_01','FECA_31','PERI_31','MES_31','TIPO_31','CIER_31']
def literal(v): return 'NULL' if v is None else "'"+str(v).replace('\\','\\\\').replace("'","\\'")+"'"
def table(name,columns,rows):
 return 'CREATE TABLE `'+name+'` (\n'+',\n'.join(' `'+c+'` text' for c in columns)+'\n);\nINSERT INTO `'+name+'` VALUES '+','.join('('+','.join(literal(v) for v in row)+')' for row in rows)+';\n'
def source(rows=None,runs=None):
 rows=rows if rows is not None else [['1','101','7','2026-08-31','2026','8','M',"JEFE D'ÁREA",'22 - JEFE - JF - 2340205','2340205 - JEFE'],['2','101','8','2026-08-31','2026','8','M','',None,None]]
 runs=runs if runs is not None else [['101','2026-08-31','2026','8','M',None]]
 return '-- Host: localhost Database: qa_grh\n'+table('histocal',RUN,runs)+table('histolegajo',SNAP,rows)+'-- Dump completed on 2026-08-19 15:17:09\n'
class PositionExtractionTests(unittest.TestCase):
 def run_extract(self,text,**overrides):
  with tempfile.TemporaryDirectory() as directory:
   file=pathlib.Path(directory)/'synthetic.sql.gz';raw=gzip.compress(text.encode('utf-8'),mtime=0);file.write_bytes(raw)
   args={'source':file,'expected_sha256':hashlib.sha256(raw).hexdigest(),'company':'101','expected_database':'qa_grh'};args.update(overrides)
   return module.extract(**args)
 def test_exact_source_and_missing_fields_preserved(self):
  text=source();result=self.run_extract(text);self.assertEqual(len(result),1);package=result[0]
  self.assertEqual(package['logicalSha256'],hashlib.sha256(text.encode()).hexdigest())
  self.assertEqual(package['rows'][0]['role'],"JEFE D'ÁREA");self.assertEqual(package['rows'][1]['role'],'');self.assertIsNone(package['rows'][1]['detail'])
  self.assertEqual(set(package['rows'][0]),{'number','recordId','role','structure','detail'})
 def test_deterministic(self): self.assertEqual(self.run_extract(source()),self.run_extract(source()))
 def test_wrong_hash(self):
  with self.assertRaisesRegex(ValueError,'hash mismatch'):self.run_extract(source(),expected_sha256='a'*64)
 def test_wrong_database(self):
  with self.assertRaisesRegex(ValueError,'provenance'):self.run_extract(source(),expected_database='other')
 def test_missing_footer(self):
  with self.assertRaisesRegex(ValueError,'provenance'):self.run_extract(source().split('-- Dump completed')[0])
 def test_missing_column(self):
  with self.assertRaisesRegex(ValueError,'schema'):self.run_extract(source().replace('`CARGO`','`OTHER`'))
 def test_duplicate_columns(self):
  with self.assertRaisesRegex(ValueError,'schema'):self.run_extract(source().replace('`CARGO`','`ID`'))
 def test_duplicate_record(self):
  with self.assertRaisesRegex(ValueError,'Duplicate snapshot record'):self.run_extract(source().replace("('2','101','8'","('1','101','8'"))
 def test_duplicate_member(self):
  with self.assertRaisesRegex(ValueError,'Duplicate snapshot member'):self.run_extract(source().replace("('2','101','8'","('2','101','7'"))
 def test_duplicate_run(self):
  run=['101','2026-08-31','2026','8','M',None]
  with self.assertRaisesRegex(ValueError,'Duplicate run'):self.run_extract(source(runs=[run,run]))
 def test_missing_exact_run(self):
  with self.assertRaisesRegex(ValueError,'Unverified snapshot run'):self.run_extract(source(runs=[['101','2026-08-31','2026','8','V',None]]))
 def test_unknown_closure(self):
  with self.assertRaisesRegex(ValueError,'Unverified snapshot run'):self.run_extract(source(runs=[['101','2026-08-31','2026','8','M','2']]))
 def test_bad_date(self):
  with self.assertRaises(ValueError):self.run_extract(source().replace('2026-08-31','2026-02-31'))
 def test_control_characters(self):
  with self.assertRaisesRegex(ValueError,'position text'):self.run_extract(source().replace('2340205 - JEFE','2340205 - JEFE\\nHIDDEN'))
 def test_non_numeric_member(self):
  with self.assertRaisesRegex(ValueError,'source integer'):self.run_extract(source().replace("('2','101','8'","('2','101','person'"))
 def test_unknown_insert_form(self):
  with self.assertRaisesRegex(ValueError,'INSERT form'):self.run_extract(source().replace('INSERT INTO `histolegajo` VALUES','INSERT INTO `histolegajo` (`ID`) VALUES'))
 def test_multiple_runs_do_not_merge_same_legajo(self):
  rows=[['1','101','7','2026-08-31','2026','8','M','JEFE','22 - JEFE - JF - 2340205','2340205 - JEFE'],['2','101','7','2026-07-31','2026','7','M','OTRO','23 - OTRO - OT - 2340206','2340206 - OTRO']]
  runs=[['101','2026-08-31','2026','8','M',None],['101','2026-07-31','2026','7','M','1']]
  packages=self.run_extract(source(rows,runs));self.assertEqual(len(packages),2)
  self.assertEqual([p['rows'][0]['role'] for p in packages],['OTRO','JEFE'])
 def test_other_company_is_not_joined(self):
  rows=[['1','101','7','2026-08-31','2026','8','M','JEFE','',''],['2','202','7','2026-08-31','2026','8','M','OTHER TENANT','','']]
  self.assertEqual(len(self.run_extract(source(rows))[0]['rows']),1)
 def test_duplicate_declaration(self):
  with self.assertRaisesRegex(ValueError,'Repeated table'):self.run_extract(source()+table('histolegajo',SNAP,[]))
 def test_row_shape(self):
  with self.assertRaisesRegex(ValueError,'row shape'):self.run_extract(source().replace("'2340205 - JEFE')","'2340205 - JEFE','EXTRA')"))
 def test_missing_company(self):
  with self.assertRaisesRegex(ValueError,'provenance'):self.run_extract(source(),company='202')
if __name__=='__main__':unittest.main()
