// Proposed filesystem contracts only. No application, SQL, API or UI imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOwnPayrollLoginRawSourceToParent} from './fixtures/own-payroll-login-source-projection.js';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FULL_CAPACITY_SOURCE_PINS,projectFullCapacitySourceToParent} from './fixtures/own-payroll-full-capacity-source-projection.js';
import {projectOwnAnnulPreparationToHead,projectOwnClaude209HandoffSourceToParent,projectOwnIndividualHandoffSourceToParent,projectOwnMonetarySourceToParent} from './fixtures/own-payroll-annulment-preparation-source-projection.js';
import {projectOwnNative645RawSourceToParent} from './fixtures/native645-causal-source-projection.js';
import {projectOwnerReaderCallerRawSourceToParent} from './fixtures/owner-reader-callers-source-projection.js';
import {projectCurrent190UiRawSourceToParent} from './fixtures/current190-ui-source-projection.js';
import {projectCurrent190RevocationRawSourceToParent} from './fixtures/current190-revocation-source-projection.js';
import {projectReceipt126ConsumerRawSourceToParent} from './fixtures/receipt126-source-consumer-succession.js';
import {projectOwner190NativeOutcomeRawSourceToParent} from './fixtures/owner190-native-outcome-source-projection.js';
import {projectOwner190Pg17IdentityRawSourceToParent} from './fixtures/owner190-pg17-identity-source-projection.js';
import {projectOwner190QaReconciliationRawSourceToParent} from './fixtures/owner190-qa-source-reconciliation.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
import {projectZeroDifferenceAllRawSourceToParent} from './fixtures/zero-difference-source-projection.js';
import {OWN_PLANILLA_DEPARTMENTS_SOURCE_PINS,projectPlanillaDepartmentsRawSourceToParent} from './fixtures/own-planilla-departments-source-projection.js';
const reconciledRaw=file=>projectOwner190QaReconciliationRawSourceToParent(file,projectZeroDifferenceAllRawSourceToParent(file,projectOwnPayrollLoginRawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url)))));
const owner190IdentityParentRaw=file=>projectOwner190Pg17IdentityRawSourceToParent(file,reconciledRaw(file));
const owner190OutcomeParentRaw=file=>projectOwner190NativeOutcomeRawSourceToParent(file,owner190IdentityParentRaw(file));
const receipt126ParentRaw=file=>projectReceipt126ConsumerRawSourceToParent(file,owner190OutcomeParentRaw(file));

// Exact inverse of historical84652f02, confined to source custody.
function projectSavedIssuerToParent(file,raw){
 assert.equal(typeof file,'string');assert.ok(Buffer.isBuffer(raw));
 if(file!=='assets/own-payroll-receipt-self.js')return raw;
 assert.equal(raw.length,6183,'SAVED_ISSUER_CURRENT_BYTES');
 assert.equal(sha(raw),'da05891711deb73d172c8639131aca867b34320f2ea7858a653852e1dbf3a5a2','SAVED_ISSUER_CURRENT_SHA');
 const after=[
  '',
  "  const issuer=document.createElement('p');issuer.textContent=`Emisor declarado: ${item.params.issuer.name} · CUIT ${item.params.issuer.taxId} · ${item.params.issuer.address}`;li.append(description,issuer);",
  "  if(item.params.legend){const legend=document.createElement('p');legend.textContent='Leyenda: '+item.params.legend;li.append(legend);}",
  '  li.append('
 ].join('\n'),before='li.append(description,',source=raw.toString('utf8');
 assert.equal(Buffer.byteLength(after,'utf8'),358,'SAVED_ISSUER_REVIEWED_SPAN_BYTES');
 assert.equal(Buffer.byteLength(before,'utf8'),22,'SAVED_ISSUER_PARENT_SPAN_BYTES');
 assert.equal(source.split(after).length,2,'SAVED_ISSUER_EXACT_SPAN_UNIQUE');
 const parent=Buffer.from(source.replace(after,before),'utf8');
 assert.equal(parent.length,5847,'SAVED_ISSUER_COMPLETE_PARENT_BYTES');
 assert.equal(sha(parent),'03278353991d953d931d4cd1233e8c117096320d76e961b15f7fff2193c43030','SAVED_ISSUER_COMPLETE_PARENT_SHA');
 return parent;
}
const historicalRaw=(file,encoding)=>{
 const current=projectOwnerReaderCallerRawSourceToParent(file,projectCurrent190UiRawSourceToParent(file,projectCurrent190RevocationRawSourceToParent(file,receipt126ParentRaw(file))));
 const parent=projectSavedIssuerToParent(file,projectOwnNative645RawSourceToParent(file,current));
 assert.ok(encoding===undefined||encoding==='utf8');
 return encoding?parent.toString('utf8'):parent;
};
test('all15 source targets reconstruct their complete383649a4 parents with finite deltas',()=>{
 assert.equal(Object.keys(FULL_CAPACITY_SOURCE_PINS).length,15);
 for(const [path,pin]of Object.entries(FULL_CAPACITY_SOURCE_PINS))assert.equal(sha(projectFullCapacitySourceToParent(path,projectOwnAnnulPreparationToHead(path,projectOwnClaude209HandoffSourceToParent(path,projectOwnIndividualHandoffSourceToParent(path,projectOwnMonetarySourceToParent(path,historicalRaw(path,'utf8'))))))),pin.before);
 assert.match(read('assets/own-payroll-run-model.js'),/OWN_RUN_MAX_RESPONSE = 4 \* 1024 \* 1024/);
 assert.match(read('assets/own-payroll-response.js'),/OWN_RUN_FULL_MAX_BYTES=32\*1024\*1024/);
});
test('only trusted fullJson can select the eight declared full SQL facades; body, permission, hashes and small commands stay intact',()=>{
 const run=read('lib/internal-own-payroll-run.js');assert.match(run,/verifyOwnRunReceipt\(value,\{fullJson=false\}=\{\}\)/);assert.match(run,/checkedCapture\(value,null,fullJson===true\?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE\)/);
 const fullNames=[];
 for(const domain of ['liquidation','annulment','close']){const s=read('lib/internal-own-payroll-'+domain+'.js');assert.match(s,/const fullJson=deps.fullJson===true,limit=fullJson\?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE/);for(const name of s.matchAll(/SELECT public\.(own_[a-z_]+_full_v1)\(/g))fullNames.push(name[1]);assert.doesNotMatch(s,/deps\.(?:maxBytes|limit)|input\.fullJson/);}
 assert.deepEqual(fullNames.sort(),['own_liquidation_detail_full_v1','own_annul_detail_full_v1','own_annul_attempt_full_v1','own_annul_command_full_v1','own_close_detail_full_v1','own_close_group_full_v1','own_close_attempt_full_v1','own_close_command_full_v1'].sort());
 const liq=read('lib/internal-own-payroll-liquidation.js');assert.match(liq,/own_liquidation_command_v1/);assert.match(liq,/own_liquidation_attempt_v1/);assert.doesNotMatch(liq,/own_liquidation_(?:command|attempt|bootstrap)_full/);
});
test('every affected API negotiates before authorization and destroys a failed already-started stream',()=>{
 for(const domain of ['liquidation','annulment','close','receipts']){const s=read('api/internal-own-payroll-'+domain+'.js');const negotiation=s.indexOf("schoolCertificateHttp.header(req,'accept').trim().toLowerCase()===OWN_RUN_FULL_JSON"),stream=s.indexOf('if(fullJson&&!supportsOwnPayrollStream(res))'),access=s.indexOf('await authorize(');assert.ok(negotiation>=0&&stream>negotiation&&access>stream);assert.match(s,/if\(fullJson\)return await sendOwnPayrollStream\(res,status,data\)/);assert.match(s,/if\(res.headersSent\)\{res.destroy\(\);return;\}/);}
 assert.doesNotMatch(read('api/internal-own-payroll-receipts.js'),/own_receipt_.*_full_v1/);
});
test('all seven relevant UIs use the actual bounded shared reader with abort signals and preserve complete comparisons',()=>{
 for(const file of ['own-payroll-liquidation-panel.js','own-payroll-annulment-panel.js','own-payroll-close-panel.js','own-payroll-comparison-panel.js','own-payroll-receipt-panel.js','own-payroll-receipt-self.js','own-payroll-receipt-planilla-panel.js']){const s=read('assets/'+file);assert.match(s,/readOwnPayrollResponse/);assert.match(s,/Accept:.*OWN_RUN_FULL_JSON/);assert.match(s,/signal/);assert.doesNotMatch(s,/await (?:response|r)\.text\(\)/);}
 const comparison=read('assets/own-payroll-comparison-panel.js');assert.match(comparison,/firstProof!==verified.proof/);assert.match(comparison,/remaining-=fullResponseBytes.get\(response\)/);assert.match(comparison,/for\(const d of sources\)binding\(d,after\)/);
 const planilla=read('assets/own-payroll-receipt-planilla-panel.js');assert.match(planilla,/remaining-=fullResponseBytes.get\(sourceResponse\)/);assert.match(planilla,/jurisdiction=catalogue\?'all':\$\('jurisdiction'\)\.value,departments=catalogue\?\{kind:'all',values:\[\]\}:selection\(\)/);assert.match(planilla,/return prepareOwnPlanilla\(batch,closes,jurisdiction,departments\)/);assert.match(planilla,/maxBytes=65536/);
});


test('217 and public208209 preserve complete dependency rows using the real PG17/18 shared columns',()=>{
 // PG17/18 catalog-pg-shdepend: dbid,classid,objid,objsubid,refclassid,refobjid,deptype.
 // refobjsubid is a pg_depend column. Read current filesystem source directly;
 // no QA constructors, project imports, fixture projection or SQL execution.
 const sharedOrder='d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype';
 const dependencyOrder='d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype';
 const check=(source,label)=>{
  const shared=source.split('\n').filter(line=>line.includes('FROM pg_shdepend d WHERE'));
  const dependencies=source.split('\n').filter(line=>line.includes('FROM pg_depend d WHERE'));
  assert.equal(shared.length,1,label);assert.equal(dependencies.length,1,label);
  const order=line=>/jsonb_agg\(to_jsonb\(d\) ORDER BY ([^)]*)\)/.exec(line)?.[1];
  assert.equal(order(shared[0]),sharedOrder,label+' shared catalog column order');
  assert.equal(shared[0].includes('d.refobjsubid'),false,label+' shared catalog has no refobjsubid');
  assert.equal(order(dependencies[0]),dependencyOrder,label+' pg_depend keeps refobjsubid');
  for(const line of[shared[0],dependencies[0]]){
   assert.ok(line.includes('to_jsonb(d)'),label+' keeps every row field');
   assert.ok(line.includes('WHERE NOT coalesce('),label+' keeps foreign rows');
   assert.ok(line.includes("${owns('d')}"),label+' keeps helper/owner exclusion');
  }
  assert.ok(shared[0].includes('d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())'),label+' keeps database fence');
 };
 for(const file of['scripts/lib/novelty-administrative217-installation.mjs','scripts/lib/own-m7-public-annulment208209.mjs']){
  const source=read(file);check(source,file);
  // Reintroducing only the statement318 column must fail the same oracle.
  assert.throws(()=>check(source.replace(sharedOrder,sharedOrder.replace(',d.deptype',',d.refobjsubid,d.deptype')),file+' old318'),/shared catalog column order/);
 }
});

// Source succession only: the current UI keeps its scoped four-argument call.
test('planilla departments source succession recovers whole prior files and rejects unknown drift',()=>{
 for(const file of ['assets/own-payroll-receipt-planilla-panel.js','tests/own-payroll-full-decision-capacity-source.test.js']){
  const raw=projectOwnPayrollLoginRawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url))),copy=Buffer.from(raw),pin=OWN_PLANILLA_DEPARTMENTS_SOURCE_PINS[file];
  assert.equal(sha(raw),pin.after);const parent=projectPlanillaDepartmentsRawSourceToParent(file,raw);
  assert.equal(parent.length,pin.beforeBytes);assert.equal(sha(parent),pin.before);assert.deepEqual(raw,copy);
  const changed=Buffer.from(raw);changed[Math.floor(changed.length/2)]^=1;assert.throws(()=>projectPlanillaDepartmentsRawSourceToParent(file,changed),/PLANILLA_DEPARTMENTS_CURRENT_SOURCE/);
  assert.throws(()=>projectPlanillaDepartmentsRawSourceToParent(file,Buffer.concat([raw,Buffer.from('\n')])));
  assert.throws(()=>projectPlanillaDepartmentsRawSourceToParent(file,parent));
 }
 const other=Buffer.from('unrelated unchanged source');assert.strictEqual(projectPlanillaDepartmentsRawSourceToParent('assets/unrelated.js',other),other);
 assert.throws(()=>projectPlanillaDepartmentsRawSourceToParent('assets/own-payroll-receipt-planilla-panel.js','text'));
});
