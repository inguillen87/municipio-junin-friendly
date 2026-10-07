// Dedicated complete synthetic roster. Unknown-history regressions continue in
// the unchanged cumulative adoption suite; no municipal facts are invented.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildOwnCloseQa} from './own-payroll-close-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildAdoptedOwnCloseQa(major){
 const qa=buildOwnCloseQa(major),{schema,ids}=qa;
 // More than one UI page, without expanding the original fixture generator's
 // bounds. These explicit own hires have no GRH predecessor.
 const seedAnchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(seedAnchor).length,2);
 let hires='',count=0;
 for(let n=200;count<24;n++){
  const dni=String(99000000+n),digits='20'+dni,weights=[5,4,3,2,7,6,5,4,3,2],digit=11-[...digits].reduce((sum,d,i)=>sum+Number(d)*weights[i],0)%11;
  if(digit===10)continue;
  const values={agreementCode:'1',birthDate:'1990-01-01',categoryCode:'1',cuil:digits+(digit===11?'0':String(digit)),dni,fullName:'Persona exclusivamente sintética de cierre QA '+n,jobTitle:'Administración QA',legajo:String(20000+n),legalReference:'Resolución inventada QA',organizationId:'10',sectorCode:'20',sexCode:'X',startDate:'2026-10-01',jurisdictionCode:'42'};
  hires+=`hire:=native_employee_create_v1(maker,${q(JSON.stringify(values))}::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());\n`;count++;
 }
 qa.sql=qa.sql.replace(seedAnchor,()=>hires+seedAnchor);
 const anchor='CREATE TRIGGER grh_effective_baseline_rows';assert.equal(qa.sql.split(anchor).length,2);
 qa.sql=qa.sql.replace(anchor,`UPDATE employment_contract SET start_date='2000-01-01',end_date=NULL,agreement_code='1',category_code='1',organization_unit_source_id='10',sector_source_id='20',legacy_legajo=CASE WHEN id=${q(ids.targetContract)}::uuid THEN 'A/3501' ELSE legacy_legajo END WHERE legacy_company_id=101 AND source_system='GRH';\n`+anchor);
 // Curated source metadata required by the real original adoption reader.
 const defaults=[`tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid`,`source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid`,`baseline_batch_id uuid DEFAULT ${q(ids.sourceBatch)}::uuid`,"source_sha256 text DEFAULT repeat('a',64)","manifest_sha256 text DEFAULT repeat('b',64)","source_cutoff timestamp DEFAULT timestamp '2026-09-10 15:17:30'"];
 const metadata=`ALTER TABLE grh_core_source_version ADD COLUMN ${defaults.join(', ADD COLUMN ')};
 ALTER TABLE grh_effective_source_binding ADD COLUMN tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,ADD COLUMN source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,ADD COLUMN import_run_id bigint DEFAULT 1,ADD COLUMN publication_sha256 text DEFAULT repeat('d',64);
 ALTER TABLE grh_curated_source_version ALTER COLUMN id TYPE uuid USING gen_random_uuid(),ALTER COLUMN id SET DEFAULT gen_random_uuid(),ADD COLUMN core_version_id uuid,ADD COLUMN tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,ADD COLUMN source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,ADD COLUMN source_batch_id uuid,ADD COLUMN import_run_id bigint DEFAULT 1,ADD COLUMN baseline_batch_id uuid DEFAULT ${q(ids.sourceBatch)}::uuid,ADD COLUMN manifest_sha256 text DEFAULT repeat('c',64);
 INSERT INTO grh_curated_source_version(core_version_id,source_batch_id) SELECT source_version_id,source_batch_id FROM grh_effective_source_binding;
 INSERT INTO capabilities VALUES(${q(ids.maker)}::uuid,'employee.record.propose'),(${q(ids.checker)}::uuid,'employee.record.approve');`;
 const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp')
  .replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
  .replaceAll("'search_path=public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
  .replaceAll("replace(original.prosrc,E'\\r\\n',E'\\n')","replace(replace(original.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
  .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
  .replace("md5(replace((SELECT prosrc","md5(replace(replace((SELECT prosrc")
  .replace("E'\\r\\n',E'\\n'))<>","E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.'))<>");
 const migrations=['132-employment-adoption-preparation.sql','133-employment-adoption-application.sql','135-native-employee-read-projection.sql','136-adopted-employment-lifecycle.sql','137-adopted-operator-context.sql','138-adopted-fixed-novelties.sql','139-adopted-monthly-novelties.sql','140-adopted-own-payroll-capture.sql','141-adopted-own-payroll-close.sql'];
 return {...qa,completePopulation:29,metadata,relocate,migrations,adaptation:migrations.map(file=>relocate(fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))).join('\n')};
}
