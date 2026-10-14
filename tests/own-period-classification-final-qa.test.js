// Pure source-artifact checks. No PostgreSQL connection, process execution,
// observed database body, municipal source or production identity is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnPeriodClassificationInstallation} from '../scripts/lib/own-period-classification-installation.mjs';
import {buildOwnPeriodClassificationFinalQa,normalizeFinalClassificationQaHeader,relocateFinalClassificationQaStatement,makeFinalClassificationQaHandlers,assertFinalClassificationRangeEvidence} from '../scripts/lib/own-period-classification-final-qa.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {CLASSIFICATION_USE_ADMINISTRATIVE_PIN} from '../scripts/lib/classification-registration-use-pins.mjs';
import {CATALOG_STORAGE_BEFORE_SHA256,CATALOG_STORAGE_AFTER_SHA256} from '../scripts/lib/catalog-storage-capacity-installation.mjs';
import {buildOwnPeriodParticipationSql} from '../scripts/lib/own-period-participation-installation.mjs';
import {WORKING_TIME_CONSUMER_DEFINITION_HASHES,WORKING_TIME_PRIOR_PINS} from '../scripts/lib/own-contract-working-time-source-pins.mjs';
import {buildNativeSalaryCapacityInstallation} from '../scripts/lib/native-salary-capacity-installation.mjs';
import {DAY_UNIT_PRIOR_PINS} from '../scripts/lib/salary-day-units-pins.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';

const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),sourceCommit='aaf35dfe5b9dec5529090607c5ba753f42ba1917';
const installation=buildOwnPeriodClassificationInstallation({read,sourceCommit}),blueprint=buildOwnPeriodClassificationFinalQa({read,sourceCommit,major:17,installation});
const sha=s=>createHash('sha256').update(s).digest('hex');
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m);return m[2];};
const canonical=s=>s.replaceAll('search_path=pg_catalog, '+blueprint.qa.schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll('search_path=pg_catalog,'+blueprint.qa.schema+',public,pg_temp','search_path=pg_catalog,public,pg_temp').replaceAll("SET search_path TO 'pg_catalog', '"+blueprint.qa.schema+"', 'public', 'pg_temp'","SET search_path TO 'pg_catalog', 'public', 'pg_temp'").replaceAll(blueprint.qa.schema,'public');
function metadataSource(s){const at=s.search(/\bAS\s+\$/);assert.ok(at>=0);return s.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at);}
const sources=rows=>new Map(rows.flatMap(s=>/^CREATE (?:OR REPLACE )?FUNCTION /.test(s)?[canonical(s)]:[]).map(s=>{const p=ownInstallationFunctionPin(metadataSource(s));return[p.name,{pin:p,source:s}];}));
const quote=v=>"'"+v.replaceAll("'","''")+"'";

test('final fixture is an independent real57-row source composition and labels its semantic boundary',()=>{
 assert.match(blueprint.qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(blueprint.qa.contractCount,57);assert.equal(blueprint.qa.activeCount,2);assert.equal(blueprint.connects,false);assert.equal(blueprint.executesSql,false);assert.equal(blueprint.technicalInstallationProtocol,false);
 for(const marker of ['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal','grh_final_source_fingerprint_v1'])assert.ok(blueprint.qa.sourceFixture.includes(marker));
 assert.ok(blueprint.groups.includes('classification-registration-use'));assert.ok(blueprint.groups.includes('catalogue-capacity'));
});

test('every current prerequisite is explicitly reproduced with its exact reviewed body and metadata',()=>{
 const generated=sources(blueprint.baseline);let checked=0;
 for(const expected of [...installation.prerequisitePins,...installation.beforePins]){
  if(expected.name==='municipal_adoption_ready_v1')continue;
  assert.ok(generated.has(expected.name),expected.name+' explicit source');let actual=generated.get(expected.name).pin;
  if(expected.name==='native_employment_catalog_capacity_v1'){
   const prior=generated.get(expected.name).source;assert.equal(actual.sha256,CATALOG_STORAGE_BEFORE_SHA256);assert.equal(prior.split('520093696').length,2);
   // Reproduce the single exact source transformation guarded by SQL168.
   actual=ownInstallationFunctionPin(metadataSource(prior.replace('520093696','1056964608')));assert.equal(actual.sha256,CATALOG_STORAGE_AFTER_SHA256);
  }
  assert.equal(actual.sha256,expected.sha256,expected.name+' body');for(const k of ['signature','argNames','defaults','resultType','language','returnsSet','strict','definer','volatility','config'])assert.deepEqual(actual[k],expected[k],expected.name+' '+k);checked++;
 }
 assert.equal(checked,installation.prerequisitePins.length+installation.beforePins.length-1,'all source dependencies accounted for');
 assert.equal(blueprint.bridgePins.length,19);for(const pin of blueprint.bridgePins){assert.match(pin.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(pin.sourceFile);}
 assert.equal(generated.get('employment_adoption_administrative_context_v1').pin.sha256,CLASSIFICATION_USE_ADMINISTRATIVE_PIN.sha256);
});

test('TO header normalization preserves the exact function body and relocates search_path metadata',()=>{
 const capture=installation.originals.find(s=>/^CREATE (?:OR REPLACE )?FUNCTION public\.own_run_capture_v1\(/.test(s));assert.ok(capture);assert.ok(capture.includes("SET search_path TO 'pg_catalog', 'public', 'pg_temp'"));
 const normalized=normalizeFinalClassificationQaHeader(capture);assert.equal(body(normalized),body(capture));assert.equal(sha(body(normalized)),installation.beforePins.find(p=>p.name==='own_run_capture_v1').sha256);
 const relocated=blueprint.qa.normalized(normalized),at=relocated.search(/\bAS\s+\$/);assert.ok(at>=0);assert.ok(relocated.slice(0,at).includes('SET search_path=pg_catalog,'+blueprint.qa.schema+',public,pg_temp'));assert.deepEqual(ownInstallationFunctionPin(canonical(relocated)).config,['search_path=pg_catalog, public, pg_temp']);
 const quoted="CREATE FUNCTION public.fixture_header_v1() RETURNS text LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'pg_temp' AS $body$ SELECT 'SET search_path TO ''pg_catalog'', ''public'', ''pg_temp'''; $body$";
 assert.equal(body(normalizeFinalClassificationQaHeader(quoted)),body(quoted));assert.equal(normalizeFinalClassificationQaHeader('DO $x$ BEGIN NULL; END $x$'),'DO $x$ BEGIN NULL; END $x$');
});

test('all four canonical164 definitions reconstruct from published source bytes and preserve their original guard hashes',()=>{
 const participation=buildOwnPeriodParticipationSql({read,sourceCommit}),guard=splitPostgresStatements(read('scripts/migrations/164-own-working-time-program-source.sql')).find(s=>s.includes('WORKING_TIME_CONSUMER_CHANGED:')),relocated=relocateFinalClassificationQaStatement(guard,blueprint.qa);assert.ok(guard);
 let inverse=relocated;
 for(const expected of WORKING_TIME_CONSUMER_DEFINITION_HASHES){
  const source=participation.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.'+expected.name+'('));assert.ok(source);const pin=ownInstallationFunctionPin(source),prior=WORKING_TIME_PRIOR_PINS.find(p=>p.name===expected.name);assert.equal(pin.sha256,prior.sha256);
  const definition='CREATE OR REPLACE FUNCTION public.'+expected.name+'('+expected.signature+')\n RETURNS '+pin.resultType+'\n LANGUAGE '+pin.language+'\n'+(pin.volatility==='i'?' IMMUTABLE SECURITY DEFINER\n':' SECURITY DEFINER\n')+" SET search_path TO 'pg_catalog', 'public', 'pg_temp'\n"+(pin.config.includes('TimeZone=UTC')?' SET "TimeZone" TO \'UTC\'\n':'')+'AS $function$'+body(source)+'$function$\n';
  assert.equal(sha(definition),expected.sha256,expected.name+' exact reviewed canonical format');
  const from="SET search_path TO 'pg_catalog', '"+blueprint.qa.schema+"', 'public', 'pg_temp'",to="SET search_path TO 'pg_catalog', 'public', 'pg_temp'",synthetic=definition.replaceAll('public.',blueprint.qa.schema+'.').replace(to,from);assert.equal(sha(synthetic.replace(from,to).replaceAll(blueprint.qa.schema+'.','public.')),expected.sha256);
  const anchor='pg_get_functiondef(to_regprocedure('+quote(prior.signature.replace('public.',blueprint.qa.schema+'.'))+'))',wrapper='replace(replace('+anchor+','+quote(from)+','+quote(to)+'),'+quote(blueprint.qa.schema+'.')+",'public'||'.')";assert.equal(relocated.split(wrapper).length,2);assert.equal(relocated.split(expected.sha256).length,2);inverse=inverse.replace(wrapper,anchor);
 }
 assert.equal(inverse,blueprint.qa.normalized(guard),'only four canonical verification expressions change');assert.equal(relocated.match(/WORKING_TIME_CONSUMER_CHANGED:/g).length,4);assert.ok(relocated.includes('WORKING_TIME_PREREQUISITE'));
 assert.throws(()=>relocateFinalClassificationQaStatement(guard.replace(WORKING_TIME_CONSUMER_DEFINITION_HASHES[0].sha256,'f'.repeat(64)),blueprint.qa),/FINAL_CLASSIFICATION_GUARD_PIN_CHANGED/);
});

test('source relocator preserves every167 and168 guard while canonizing their exact record aliases',()=>{
 const hashSource=blueprint.qa.normalized("replace(p.prosrc,E'\\r\\n',E'\\n')");
 for(const[file,aliases]of [['scripts/migrations/167-classification-registration-use.sql',['updated.prosrc','f.prosrc']],['scripts/migrations/168-catalog-storage-capacity.sql',['updated.prosrc','after_body']]]){
  const original=splitPostgresStatements(read(file))[0],actual=relocateFinalClassificationQaStatement(original,blueprint.qa);let inverse=actual;
  for(const alias of aliases){const anchor="replace("+alias+",E'\\r\\n',E'\\n')",expected=hashSource.replaceAll('p.prosrc',alias);assert.equal(actual.split(expected).length,2,alias+' exact existing QA pattern');inverse=inverse.replace(expected,anchor);}
  assert.equal(inverse,blueprint.qa.normalized(original),'no source guards/hashes/metadata checks change');
  assert.deepEqual(actual.match(/[a-f0-9]{64}/g),blueprint.qa.normalized(original).match(/[a-f0-9]{64}/g),'all original body pins remain');
 }
});

test('canonical capacity160 reproduces the exact items precursor before166 with all transport mutations',()=>{
 const capacity=buildNativeSalaryCapacityInstallation({read,sourceCommit}),dayIndex=blueprint.baseline.findIndex(s=>s.includes('DO $day_units$')),before=sources(blueprint.baseline.slice(0,dayIndex));assert.ok(dayIndex>0);assert.equal(capacity.mutations.length,6);
 const expected=DAY_UNIT_PRIOR_PINS.find(p=>p.name==='native_salary_items_v1');assert.equal(ownInstallationFunctionPin(capacity.items).sha256,expected.sha256);assert.equal(before.get(expected.name).pin.sha256,expected.sha256,'exact160 precursor is installed before166');
 for(const mutation of capacity.mutations)assert.ok(blueprint.baseline.slice(0,dayIndex).includes(relocateFinalClassificationQaStatement(mutation.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '),blueprint.qa)),mutation.slice(0,90));
 assert.ok(blueprint.groups.indexOf('working-time')<blueprint.groups.indexOf('native-salary-capacity'));assert.ok(blueprint.groups.indexOf('native-salary-capacity')<blueprint.groups.indexOf('day-units'));
});

test('synthetic adapter retains the original SQL transport cause while the actual HTTP handler keeps it private',async()=>{
 const recorded=[],message='ERROR: PAYROLL_FIXED_JURISDICTION_REQUIRED',stderr=message+'\nCONTEXT: synthetic adopted_subject -> range_v2 -> conditions_source',failure=new Error(message,{cause:{stderr}});
 const fixture=makeFinalClassificationQaHandlers({qa:blueprint.qa,db:{run:async()=>{throw failure;}},onSqlError:value=>recorded.push(value)});
 const response=await fixture.api('salaryConditions',{query:{resource:'bootstrap',period:'2026-09'},expected:503});assert.equal(response.code,'SALARY_CONDITIONS_UNAVAILABLE');assert.equal(response.ok,false);assert.ok(!JSON.stringify(response).includes('PAYROLL_FIXED_JURISDICTION_REQUIRED'));
 assert.equal(recorded.length,1);assert.deepEqual(Object.keys(recorded[0]).sort(),['functionName','message','querySha256','stderr','version']);assert.equal(recorded[0].functionName,'own_salary_conditions_bootstrap_v1');assert.equal(recorded[0].message,message);assert.equal(recorded[0].stderr,stderr);assert.match(recorded[0].querySha256,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(recorded[0]).includes(blueprint.qa.actors.maker.actorEmail));
 await assert.rejects(fixture.api('salaryConditions',{query:{resource:'bootstrap',period:'2026-09'}}),/Synthetic fixture SQL cause: ERROR: PAYROLL_FIXED_JURISDICTION_REQUIRED/);
});

test('eligibility evidence preserves all57 source rows,55 inactive nulls and only2 active declarations without calculating payroll',()=>{
 const activeIds=[blueprint.qa.ids.makerContract,blueprint.qa.ids.checkerContract],rows=Array.from({length:57},(_,n)=>({contractId:n<2?activeIds[n]:'11111111-1111-4111-a111-'+String(n).padStart(12,'0'),status:n<2?'active':'inactive',jurisdictionCode:n<2?'42':null,startDate:'2001-02-03',endDate:n<2?null:'2019-12-31',eligible:n<2})),before={contracts:'1'.repeat(64),registrations:'2'.repeat(64),applications:'3'.repeat(64)},original=structuredClone(rows);
 assert.deepEqual(assertFinalClassificationRangeEvidence(rows,activeIds,before,structuredClone(before)),{inactiveNullJurisdictionExcluded:true,activeRangeCount:2,inactiveRangeCount:55});assert.deepEqual(rows,original);
 for(const change of [r=>r.pop(),r=>r[2].jurisdictionCode='42',r=>r[2].eligible=true,r=>r[0].eligible=false,r=>r[2].endDate=null,r=>r[2].contractId=r[3].contractId]){const altered=structuredClone(rows);change(altered);assert.throws(()=>assertFinalClassificationRangeEvidence(altered,activeIds,before,before));}
 assert.throws(()=>assertFinalClassificationRangeEvidence(rows,activeIds,before,{...before,contracts:'4'.repeat(64)}),/FINAL_CLASSIFICATION_ELIGIBILITY_CHANGED_STORED_SOURCE/);
 const helper=read('scripts/lib/own-period-classification-final-qa.mjs');assert.ok(helper.indexOf('const rangeProof=assertFinalClassificationRangeEvidence')<helper.indexOf('await prepareOwnPeriodClassificationFixtureFacts(child'));assert.ok(helper.includes('for(const contractId of inactiveIds)await assert.rejects'));for(const flag of ['PAYROLL_FIXED_JURISDICTION_REQUIRED','PAYROLL_FIXED_NOT_FOUND','PAYROLL_FIXED_IDENTITY_CHANGED','inactiveSalarySubjectStillDenied:true'])assert.ok(helper.includes(flag));
});

test('all22 private/classification RPC sources and all5 payroll consumers retain exact source bytes',()=>{
 const generated=sources(blueprint.classification),expected=installation.newPins.concat(installation.afterConsumerPins.filter(p=>p.name!=='municipal_adoption_ready_v1'));
 assert.equal(expected.length,27);for(const pin of expected){assert.ok(generated.has(pin.name),pin.name+' source');const actual=generated.get(pin.name);assert.equal(sha(body(actual.source)),pin.sha256,pin.name+' exact body');for(const k of ['signature','argNames','defaults','resultType','language','returnsSet','strict','definer','volatility','config'])assert.deepEqual(actual.pin[k],pin[k],pin.name+' '+k);}
 assert.ok(blueprint.afterCheck.includes('FINAL_PERIOD_CLASSIFICATION_READY_METADATA'));assert.ok(blueprint.afterCheck.includes('FINAL_PERIOD_CLASSIFICATION_SOURCE_METADATA'));
});

test('readiness composition retains final144 guards and derives every changed pin from immutable sources',()=>{
 const before=blueprint.baseline.find(s=>s.includes('FUNCTION '+blueprint.qa.schema+'.municipal_adoption_ready_v1(')),after=blueprint.classification.find(s=>s.includes('FUNCTION '+blueprint.qa.schema+'.municipal_adoption_ready_v1('));assert.ok(before&&after);assert.notEqual(body(before),body(after));
 for(const marker of ['FINAL_ADOPTION_SOURCE_METADATA','FINAL_ADOPTION_SOURCE_PROTECTION','employment_adoption_final_rows_v1','employment_adoption_final_source_v1','grh_final_source_revision']){assert.ok(before.includes(marker),marker+' before');assert.ok(after.includes(marker),marker+' after');}
 assert.ok(before.includes('FINAL_PERIOD_CLASSIFICATION_BASELINE_METADATA'));assert.ok(after.includes('FINAL_PERIOD_CLASSIFICATION_NEW_METADATA'));
 assert.doesNotMatch(before,/BEGIN\s+(?:NULL|RETURN)\s*;/);assert.doesNotMatch(after,/BEGIN\s+(?:NULL|RETURN)\s*;/);
});

test('source-only167 and168 preparation preserves their guards and explicit disposable budget',()=>{
 const source=blueprint.baseline.join('\n');assert.ok(source.includes('CLASSIFICATION_USE_ADMINISTRATIVE_PREREQUISITE'));assert.ok(source.includes('CLASSIFICATION_USE_FUNCTION_CHANGED'));assert.ok(source.includes('CLASSIFICATION_USE_AFTER_METADATA'));assert.ok(source.includes('CATALOG_STORAGE_PROVIDER_BUDGET_REQUIRED'));assert.ok(source.includes("provider_budget_bytes','1073741824'"));assert.ok(source.includes('CATALOG_STORAGE_AFTER_METADATA'));assert.ok(source.includes('REVOKE ALL ON FUNCTION '+blueprint.qa.schema+'.employment_adoption_administrative_context_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app'));
 const helper=read('scripts/lib/own-period-classification-final-qa.mjs');assert.doesNotMatch(helper,/(?:db|h\.db)\.run\([^;\n]*(?:pg_get_functiondef|prosrc)|observed.*sha256/);assert.match(helper,/finalAdoptedHistory\(\{h,installation,major,transport='local'\}\)/);assert.match(helper,/normalFinalApplication:true/);assert.match(helper,/technicalInstallationProtocol:false/);assert.match(helper,/assert\.deepEqual\(p\.finalRevision,applied\.finalRevision\)/);assert.match(helper,/assert\.deepEqual\(await schemaInventory\(\),schemasBefore\)/);assert.match(helper,/priorSchemaInventoryPreserved=true/);
});
