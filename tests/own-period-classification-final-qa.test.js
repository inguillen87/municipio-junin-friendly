// Pure source-artifact checks. No PostgreSQL connection, process execution,
// observed database body, municipal source or production identity is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnPeriodClassificationInstallation} from '../scripts/lib/own-period-classification-installation.mjs';
import {buildOwnPeriodClassificationFinalQa,normalizeFinalClassificationQaHeader} from '../scripts/lib/own-period-classification-final-qa.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {CLASSIFICATION_USE_ADMINISTRATIVE_PIN} from '../scripts/lib/classification-registration-use-pins.mjs';
import {CATALOG_STORAGE_BEFORE_SHA256,CATALOG_STORAGE_AFTER_SHA256} from '../scripts/lib/catalog-storage-capacity-installation.mjs';

const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),sourceCommit='aaf35dfe5b9dec5529090607c5ba753f42ba1917';
const installation=buildOwnPeriodClassificationInstallation({read,sourceCommit}),blueprint=buildOwnPeriodClassificationFinalQa({read,sourceCommit,major:17,installation});
const sha=s=>createHash('sha256').update(s).digest('hex');
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m);return m[2];};
const canonical=s=>s.replaceAll('search_path=pg_catalog, '+blueprint.qa.schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll('search_path=pg_catalog,'+blueprint.qa.schema+',public,pg_temp','search_path=pg_catalog,public,pg_temp').replaceAll("SET search_path TO 'pg_catalog', '"+blueprint.qa.schema+"', 'public', 'pg_temp'","SET search_path TO 'pg_catalog', 'public', 'pg_temp'").replaceAll(blueprint.qa.schema,'public');
function metadataSource(s){const at=s.search(/\bAS\s+\$/);assert.ok(at>=0);return s.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at);}
const sources=rows=>new Map(rows.flatMap(s=>/^CREATE (?:OR REPLACE )?FUNCTION /.test(s)?[canonical(s)]:[]).map(s=>{const p=ownInstallationFunctionPin(metadataSource(s));return[p.name,{pin:p,source:s}];}));

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
 assert.equal(blueprint.bridgePins.length,13);for(const pin of blueprint.bridgePins){assert.match(pin.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(pin.sourceFile);}
 assert.equal(generated.get('employment_adoption_administrative_context_v1').pin.sha256,CLASSIFICATION_USE_ADMINISTRATIVE_PIN.sha256);
});

test('TO header normalization preserves the exact function body and relocates search_path metadata',()=>{
 const capture=installation.originals.find(s=>/^CREATE (?:OR REPLACE )?FUNCTION public\.own_run_capture_v1\(/.test(s));assert.ok(capture);assert.ok(capture.includes("SET search_path TO 'pg_catalog', 'public', 'pg_temp'"));
 const normalized=normalizeFinalClassificationQaHeader(capture);assert.equal(body(normalized),body(capture));assert.equal(sha(body(normalized)),installation.beforePins.find(p=>p.name==='own_run_capture_v1').sha256);
 const relocated=blueprint.qa.normalized(normalized),at=relocated.search(/\bAS\s+\$/);assert.ok(at>=0);assert.ok(relocated.slice(0,at).includes('SET search_path=pg_catalog,'+blueprint.qa.schema+',public,pg_temp'));assert.deepEqual(ownInstallationFunctionPin(canonical(relocated)).config,['search_path=pg_catalog, public, pg_temp']);
 const quoted="CREATE FUNCTION public.fixture_header_v1() RETURNS text LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'pg_temp' AS $body$ SELECT 'SET search_path TO ''pg_catalog'', ''public'', ''pg_temp'''; $body$";
 assert.equal(body(normalizeFinalClassificationQaHeader(quoted)),body(quoted));assert.equal(normalizeFinalClassificationQaHeader('DO $x$ BEGIN NULL; END $x$'),'DO $x$ BEGIN NULL; END $x$');
});

test('all21 private/classification RPC sources and all4 payroll consumers retain exact source bytes',()=>{
 const generated=sources(blueprint.classification),expected=installation.newPins.concat(installation.afterConsumerPins.filter(p=>p.name!=='municipal_adoption_ready_v1'));
 assert.equal(expected.length,25);for(const pin of expected){assert.ok(generated.has(pin.name),pin.name+' source');const actual=generated.get(pin.name);assert.equal(sha(body(actual.source)),pin.sha256,pin.name+' exact body');for(const k of ['signature','argNames','defaults','resultType','language','returnsSet','strict','definer','volatility','config'])assert.deepEqual(actual.pin[k],pin[k],pin.name+' '+k);}
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
 const helper=read('scripts/lib/own-period-classification-final-qa.mjs');assert.doesNotMatch(helper,/pg_get_functiondef|SELECT[^\n]+prosrc|observed.*sha256/);assert.match(helper,/finalAdoptedHistory\(\{h,installation,major,transport='local'\}\)/);assert.match(helper,/normalFinalApplication:true/);assert.match(helper,/technicalInstallationProtocol:false/);assert.match(helper,/assert\.deepEqual\(p\.finalRevision,applied\.finalRevision\)/);assert.match(helper,/assert\.deepEqual\(await schemaInventory\(\),schemasBefore\)/);assert.match(helper,/priorSchemaInventoryPreserved=true/);
});
