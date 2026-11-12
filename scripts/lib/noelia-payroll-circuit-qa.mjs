// All actors and contracts are invented; only existing loopback QA is allowed.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildAdoptedConsumersInstallationQa} from './adopted-consumers-installation-qa.mjs';
import {createOwnReceiptPsqlQa} from './own-payroll-receipt-qa.mjs';import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {relocateMunicipalAdoptionOperator} from './municipal-adoption-operator-qa.mjs';import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';import {pinsCheck} from './native-leave-installation.mjs';
import {POSITION_QA_CAPS} from './position-assignment-qa.mjs';
import {noeliaCircuitRuntime,noeliaQaApplicationName} from './noelia-circuit-runtime.mjs';
import {NATIVE_ROSTER_V2_SQL} from '../../lib/internal-native-roster.js'; import {deferNoeliaNativeDemoSeed} from './noelia-native-demo-qa.mjs';
import {MAX_NATIVE_ROSTER_ROWS} from '../../assets/native-roster-model.js';
// Relocate only the exact canonical read and its eight declared parameters.
// Execution stays in the disposable schema; no row is synthesized by this adapter.
export function noeliaCircuitRosterRead(query,values,schema){
 if(query!==NATIVE_ROSTER_V2_SQL)return null;
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok(Array.isArray(values)&&values.length===8);
 assert.ok(values.slice(0,7).every(v=>typeof v==='string'));assert.equal(values[7],MAX_NATIVE_ROSTER_ROWS+1);
 assert.doesNotMatch(query,/;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
 const statement=query.replaceAll('public.native_employee_',schema+'.native_employee_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});
 return "SELECT coalesce(jsonb_agg(to_jsonb(qa_read)), '[]'::jsonb) FROM ("+statement+') qa_read';
}
export function buildNoeliaCircuitQa(major,{jurisdictions=false,nativeDemoUi=false}={}){const qa=buildAdoptedConsumersInstallationQa(major),anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 assert.equal(typeof jurisdictions,'boolean');assert.equal(typeof nativeDemoUi,'boolean');
 if(jurisdictions){let count=0;qa.sql=qa.sql.replace(/hire:=native_employee_create_v1\(maker,'(\{"agreementCode"[^\n]*?"legajo":"20[0-9]+"[^\n]*?"jurisdictionCode":)"42"(\})'::jsonb/g,(_,prefix,suffix)=>{count++;return "hire:=native_employee_create_v1(maker,'"+prefix+'"55"'+suffix+"'::jsonb";});assert.equal(count,24,'complete synthetic 55 cohort must be explicitly declared at hire time');}
 // The three historical fixture contracts already declare sector 20. Preserve
 // its exact documentary label too, as the native writer does for the other 26.
 // This precedes the immutable baseline: no adopted or captured row is repaired.
 const baseline='CREATE TRIGGER grh_effective_baseline_rows';assert.equal(qa.sql.split(baseline).length,2);
 qa.sql=qa.sql.replace(baseline,()=>`DO $noelia_sector_labels$
 DECLARE original jsonb;sector_label text;changed integer;
 BEGIN
  IF (SELECT count(*) FROM grh_catalog_rows WHERE import_run_id=92001 AND catalog='sectors' AND source_key='20')<>1 THEN RAISE EXCEPTION 'QA_NOELIA_SECTOR_CATALOG_CHANGED';END IF;
  SELECT label INTO sector_label FROM grh_catalog_rows WHERE import_run_id=92001 AND catalog='sectors' AND source_key='20';
  IF sector_label IS NULL OR btrim(sector_label)='' THEN RAISE EXCEPTION 'QA_NOELIA_SECTOR_LABEL_MISSING';END IF;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO original FROM employment_contract c WHERE c.source_system='GRH' AND c.legacy_company_id=101;
  IF coalesce(jsonb_array_length(original),0)<>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(original) c WHERE c->>'sector_source_id' IS DISTINCT FROM '20' OR jsonb_typeof(c->'source_payload') IS DISTINCT FROM 'object' OR (c->'source_payload' ? 'employment' AND jsonb_typeof(c#>'{source_payload,employment}') IS DISTINCT FROM 'object')) THEN RAISE EXCEPTION 'QA_NOELIA_HISTORICAL_POPULATION_CHANGED';END IF;
  UPDATE employment_contract SET source_payload=source_payload||jsonb_build_object('employment',coalesce(source_payload->'employment','{}'::jsonb)||jsonb_build_object('sectorName',sector_label)) WHERE source_system='GRH' AND legacy_company_id=101;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(original) old JOIN employment_contract c ON c.id::text=old->>'id' WHERE to_jsonb(c)-'source_payload' IS DISTINCT FROM old-'source_payload' OR c.source_payload IS DISTINCT FROM (old->'source_payload')||jsonb_build_object('employment',coalesce(old#>'{source_payload,employment}','{}'::jsonb)||jsonb_build_object('sectorName',sector_label))) THEN RAISE EXCEPTION 'QA_NOELIA_HISTORICAL_IDENTITY_CHANGED';END IF;
 END $noelia_sector_labels$;
 `+baseline);
 const caps=[...new Set([...POSITION_QA_CAPS,...(nativeDemoUi?['employee.record.create']:[]),'employee.record.propose','employee.record.approve','workforce.employee.read','workforce.structure.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare','payroll.calculation.approve','payroll.calculation.close','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare','payroll.novelty.approve','payroll.novelty.export','payroll.receipt.prepare','payroll.receipt.approve'])];
 qa.sql=qa.sql.replace(anchor,()=>`INSERT INTO capabilities SELECT a.id,c FROM unnest(ARRAY[${q(qa.ids.maker)}::uuid,${q(qa.ids.checker)}::uuid]) a(id) CROSS JOIN unnest(ARRAY[${caps.map(q).join(',')}]) c WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id=a.id AND old.capability_key=c);
 -- Canonical columns omitted by the earlier writer fixture; synthetic schema only.
 ALTER TABLE person_identity ADD COLUMN data_quality_score numeric(5,2);
 ALTER TABLE source_import_batch ADD COLUMN source_sha256 text;
 CREATE OR REPLACE VIEW grh_effective_source_batch_v1 AS SELECT * FROM source_import_batch;
 `+anchor);const nativeDemo=nativeDemoUi?deferNoeliaNativeDemoSeed(qa.sql):null;return {...qa,sql:nativeDemo?.sql??qa.sql,caps,nativeDemo};
}
export function relocateNoeliaJurisdictionInstallation(batch,qa,previous){
 const n=qa.normalized,ready=n(batch.ready.slice(0,batch.ready.indexOf(' BEGIN ')))+' BEGIN '+batch.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins[4].signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=n(pinsCheck(batch.beforePins.slice(0,4),'JURISDICTION_BEFORE_CHANGED'))+';'+pinsCheck([previous.readyPin],'JURISDICTION_BEFORE_CHANGED'),after=n(pinsCheck([...batch.afterPins.slice(0,4),batch.newPin],'JURISDICTION_AFTER_CHANGED'))+';'+pinsCheck([readyPin],'JURISDICTION_AFTER_CHANGED');
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_jurisdiction.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`,migration=batch.migration.map(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.municipal_adoption_ready_v1')?ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '):n(s));
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_jurisdiction.mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,readyPin,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),durableVerification:batch.durableVerification.map((s,i)=>i===0?after:n(s))};
}
export function createNoeliaCircuitPsqlQa(options){const runtime=noeliaCircuitRuntime({root:fs.realpathSync(new URL('../..',import.meta.url)),major:options.major,transport:options.transport,browser:options.browser});if(options.executable)assert.equal(fs.realpathSync(options.executable),fs.realpathSync(runtime.executable));const environment=Object.freeze({...runtime.environment,PGAPPNAME:noeliaQaApplicationName(options.schema)}),db=createOwnReceiptPsqlQa({...options,executable:runtime.executable,environment});return {...db,executable:runtime.executable,environment,applicationName:environment.PGAPPNAME,query:async(query,values)=>{
 const rosterRead=noeliaCircuitRosterRead(query,values,options.schema);if(rosterRead)return await db.run(rosterRead);
 if(query.includes('/* effective-source:snapshot */')||/^WITH authority AS MATERIALIZED\s*\(/.test(query.trimStart())){
  // Execute the application's complete read, never substitute directory rows.
  assert.ok(query.includes('/* effective-source:snapshot */')&&query.includes('grh_effective_source_batch_v1')||query.includes('native_employee_directory_snapshot_v1($4::jsonb)')&&query.includes('AS "__total"'));
  assert.doesNotMatch(query,/;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  const sql=query.replaceAll('public.native_employee_',options.schema+'.native_employee_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});
  // Authenticated read RPCs take FOR SHARE locks. Keep their normal transaction
  // mode; the bounded SELECT and the verifier's before/after proof forbid data effects.
  return await db.run("SELECT coalesce(jsonb_agg(to_jsonb(qa_read)), '[]'::jsonb) FROM ("+sql+") qa_read");
 }
 if(!/^SELECT public\.(?:municipal_adoption_|employment_adoption_|own_novelty_|own_program_|native_employee_|native_employment_catalog_|position_assignment_|position_comparison_|annual_budget_)/.test(query))return db.query(query,values);
 assert.match(query,/^SELECT public\.(?:municipal_adoption_(?:queue|review|attempt|command)_v1|employment_adoption_(?:bootstrap|attempt|propose|history_read|final_bootstrap|final_available|active_bootstrap|declared_bootstrap|registry_bootstrap|operational_bootstrap)_v1|own_novelty_(?:bootstrap|detail|attempt|command)_v1|own_program_bootstrap_v1|native_employee_(?:bootstrap|attempt|create)_v1|native_employee_directory_snapshot_v1|native_employment_catalog_bootstrap_v1|position_assignment_(?:bootstrap|attempt|command|capture)_v1|position_comparison_detail_v1|annual_budget_(?:bootstrap|attempt|command)_v1)\([\s\S]+\) AS result$/);
 const sql=query.replaceAll('public.',options.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return[{result:await db.run(sql,true)}];
 }};}
export function relocateNoeliaNoveltyInstallation(batch,qa){
 const n=qa.normalized,operator=relocateMunicipalAdoptionOperator(batch.operator,qa),ready=n(batch.ready.slice(0,batch.ready.indexOf(' BEGIN ')))+' BEGIN '+batch.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.readyPin.signature.replace('public.',qa.schema+'.'),runtime:false};
 const opPins=operator.pins.map((p,i)=>i?p:readyPin),others=batch.finalPins.filter(p=>!p.name.startsWith('municipal_adoption_'));
 const map=s=>{
  if(s.includes('ADOPTED_NOVELTY_OPERATOR_PREREQUISITE'))return pinsCheck(operator.pins,'ADOPTED_NOVELTY_OPERATOR_PREREQUISITE');
  if(s.includes('ADOPTED_NOVELTY_FUNCTION_METADATA'))return n(pinsCheck(others,'ADOPTED_NOVELTY_FUNCTION_METADATA'))+';'+pinsCheck(opPins,'ADOPTED_NOVELTY_FUNCTION_METADATA');
  if(s.startsWith('CREATE OR REPLACE FUNCTION public.municipal_adoption_ready_v1'))return ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
  return n(s.replaceAll(batch.readyPin.sha256,readyPin.sha256));
 };
 return {...batch,readyPin,operator,installation:batch.installation.map(map),durableVerification:batch.durableVerification.map(map)};
}
