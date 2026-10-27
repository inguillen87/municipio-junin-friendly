// Future pure focals after explicit adoption. Not executed by the author.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {composePositions210Same190} from '../scripts/lib/positions210-same190-installation.mjs';
import {prepareMonthlyWithPositions210} from '../scripts/lib/positions210-same190-composition.mjs';
import {pinsCheck} from '../scripts/lib/native-leave-installation.mjs';
import {composePositionAdministrative216Same190,assertPositionAdministrative216Same190Plan,
 assertPositionAdministrative216Proof,assertPositionAdministrative216Durability,
 installPositionAdministrative216Same190,verifyPositionAdministrative216Epoch} from '../scripts/lib/position-administrative-identity216-same190-installation.mjs';

const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
let foundation;
const qa=()=>foundation??=buildOwnerProgramQa({major:17,sourceCommit,read,schema:'mc_qa_fixed_092_'+'7'.repeat(32),operationalPairBaseline:'published107'});
function build(reader=read){const options={qa:qa(),major:17,sourceCommit,read:reader},predecessor=composePositions210Same190(options);return composePositionAdministrative216Same190({...options,positions210Plan:predecessor});}
const host=plan=>({qa:qa(),major:17,sourceCommit,sourceCustody:{sourceCommit},prepared:{positions210:plan.predecessor,positionAdministrative216:plan}});
const prior=plan=>({version:'positions210-same190-installation.v1',passed:true,sourceCommit,schema:plan.schema,
 finalMetadata:{version:'positions210-final-metadata.v1',metadataPins:34},sourceHashes:plan.predecessor.sourceHashes});
// These are synthetic PROTOCOL proof samples. No test claims PostgreSQL facts.
const proof=(plan,mode,extra={})=>({...plan.proofContract,mode,readOnly:mode==='durable',beforeFingerprint:'b'.repeat(64),priorFingerprint:'b'.repeat(64),objectsFingerprint:'c'.repeat(64),oldSevenMetadataFingerprint:'d'.repeat(64),...extra});
function fakeHost(plan,{failAt=0,durableDrift=false}={}){
 const h=host(plan),calls=[],phases=[];let snapshots=0;
 Object.assign(h,{calls,phases,json:(statements,options)=>{
  calls.push({statements,options});if(calls.length===failAt)throw new Error('NATIVE_OUTCOME_UNCERTAIN');
  if(statements===plan.installation)return proof(plan,'install');
  if(statements===plan.durableVerification)return proof(plan,'durable',durableDrift?{objectsFingerprint:'e'.repeat(64)}:{});
  assert.strictEqual(statements,plan.repetition);return proof(plan,'repeat');
 },readFullSnapshot:()=>({fingerprint:++snapshots<=2?'old':'new',tables:100}),setPhase:value=>phases.push(value),check:()=>{}});
 return h;
}

test('216 is opt-in: default preparation retains the historical context and source-entry set',()=>{
 const h={qa:qa(),major:17,sourceCommit,read};
 const a=prepareMonthlyWithPositions210(h),b=prepareMonthlyWithPositions210(h,{administrative216:false});
 assert.deepEqual(Object.keys(a.context).sort(),Object.keys(b.context).sort());assert.deepEqual(a.sourceEntries,b.sourceEntries);
 assert.equal(Object.hasOwn(a.context,'positionAdministrative216'),false);
 const enabled=prepareMonthlyWithPositions210(h,{administrative216:true});assert.strictEqual(enabled.foundation,h.qa);
 assert.equal(enabled.context.positionAdministrative216.epoch,'127-128-129/adopted-positions-v2/210/216');
 assert.strictEqual(enabled.context.positionAdministrative216.predecessor,enabled.context.positions210);
 assert.ok(enabled.sourceEntries.includes('scripts/migrations/216-own-position-administrative-identity.sql'));
 assert.throws(()=>prepareMonthlyWithPositions210(h,{administrative216:'true'}));
 assert.throws(()=>prepareMonthlyWithPositions210(h,{administrative216:true,grant:true}),/POSITIONS210_PREPARE_SETTINGS_CLOSED/);
});

test('the source-minted final34 successor replaces exactly seven bodies and no other pin field',()=>{
 const p=build(),before=structuredClone(p.beforeFinalPins);
 assert.equal(p.beforeFinalPins.length,34);assert.equal(p.afterFinalPins.length,34);
 assert.equal(p.afterFinalPins.filter((pin,index)=>pin.sha256!==before[index].sha256).length,7);
 for(let index=0;index<34;index++)assert.deepEqual({...p.afterFinalPins[index],sha256:null},{...before[index],sha256:null});
 assert.equal(p.source.helperPin.runtime,false);assert.equal(p.source.changes.newRuntimeFacades,0);
 assert.deepEqual(p.predecessor.stages.map(stage=>stage.id),['127','128','129','adopted-v2','210']);
 assert.equal(p.predecessor.ledger.length,33);
 assert.deepEqual(p.predecessor.finalMetadata,[p.predecessor.normalized(pinsCheck(before,'POSITIONS210_FINAL_METADATA_CHANGED'))]);
 assert.deepEqual(p.beforeFinalPins,before);
});

test('eight local successor definitions normalize before metadata without mutating foundation or predecessor',()=>{
 const q=qa(),hashes=structuredClone(q.hashes),p=build();
 assert.deepEqual(q.hashes,hashes);assert.equal(p.ledger.length,8);
 assert.equal(p.ledger.filter(row=>row.stage==='216-private-helper').length,1);
 assert.equal(new Set(p.ledger.map(row=>row.publicSha256)).size,8);
 for(const row of p.ledger)assert.equal(p.normalized("SELECT '"+row.publicSha256+"'"),p.predecessor.normalized("SELECT '"+row.localSha256+"'"));
 assert.equal(p.finalMetadata.length,2);assert.ok(p.finalMetadata[0].includes('POSITION_ADMIN216_FINAL34_CHANGED'));
 assert.ok(p.finalMetadata[1].includes('POSITION_ADMIN216_PRIVATE_HELPER_CHANGED'));
 assert.equal(p.connects,false);assert.equal(p.executesSql,false);assert.equal(p.production,false);
});

test('whole preservation restores documentary and leave coverage; only seven prosrc fields and the new helper are excepted',()=>{
 const p=build(),sql=p.installation.find(value=>value.startsWith('DO $snapshot$'));assert.ok(sql);
 for(const pin of p.source.beforePins)assert.ok(sql.includes(p.schema+'.'+pin.name+'('));
 assert.equal(sql.split("to_jsonb(p)-'prosrc'").length,2);
 assert.ok(sql.includes('p.oid IS DISTINCT FROM to_regprocedure(\''+p.schema+'.position_administrative_context_v1(jsonb)\')'));
 assert.ok(!sql.includes('payroll_document_subject_v1'));assert.ok(!sql.includes("proname LIKE 'native_leave_%'"));
 assert.ok(!sql.includes("IS DISTINCT FROM to_regclass('"+p.schema+".native_leave_event')"));
 for(const category of ['tables','sequences','functions','triggers','schemas','defaultAcl','roles','memberships','views','types','relations','attributes','indexes','eventTriggers'])assert.ok(sql.includes("'"+category+"'"),category);
 for(const field of ['relowner','relacl','prosrc','pg_sequence','pg_depend','pg_constraint','pg_policy'])assert.ok(sql.includes(field),field);
});

test('one installation has the exact nine source statements; repeat and durable execute no DDL',()=>{
 const p=build(),apply=p.installation.find(value=>value.startsWith('DO $apply216$'));assert.ok(apply);
 assert.equal(p.source.migration.length,9);
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 for(const statement of p.source.migration)assert.ok(apply.includes(p.normalized('EXECUTE '+literal(statement)+';')));
 assert.ok(!apply.includes('GRANT '));assert.equal(p.source.afterPins.filter(pin=>pin.runtime).length,4);
 for(const statements of [p.repetition,p.durableVerification]){
  assert.ok(statements.every(value=>!value.includes('DO $apply216$')));
  assert.ok(statements.every(value=>!(/\b(?:CREATE(?: OR REPLACE)? FUNCTION|GRANT EXECUTE|REVOKE ALL|INSERT INTO|UPDATE |DELETE FROM)\b/.test(value))));
 }
 assert.ok(p.installation[0].includes("transaction_isolation')<>'repeatable read'"));
 assert.ok(p.durableVerification[0].includes("transaction_read_only')<>'on'"));
 assert.ok(p.installation[0].includes("transaction_read_only')<>'off'"));
});

test('unminted predecessor, foreign foundation, partial source and stale schema cannot become a216 plan',()=>{
 const q=qa(),predecessor=composePositions210Same190({qa:q,major:17,sourceCommit,read});
 const args={qa:q,major:17,sourceCommit,read,positions210Plan:predecessor};
 assert.throws(()=>composePositionAdministrative216Same190({...args,positions210Plan:{...predecessor}}),/POSITIONS210_UNMINTED_PLAN/);
 assert.throws(()=>composePositionAdministrative216Same190({...args,qa:{...q}}));
 assert.throws(()=>composePositionAdministrative216Same190({...args,read:file=>read(file)+(file.endsWith('216-source.mjs')?'\n':'')}),/POSITION_ADMIN216_INPUT_SOURCE_CHANGED/);
 assert.throws(()=>composePositionAdministrative216Same190({...args,sourceCommit:'b'.repeat(40)}));
});

test('brand and source bookend reject copied plans and changed installer sources before transport',()=>{
 let drift=false;const reader=file=>read(file)+(drift&&file==='scripts/lib/adopted-documentary-installation.mjs'?'\n':'');
 const p=build(reader),h=host(p);assert.strictEqual(assertPositionAdministrative216Same190Plan(h),p);
 assert.throws(()=>assertPositionAdministrative216Same190Plan({...h,prepared:{...h.prepared,positionAdministrative216:{...p}}}),/POSITION_ADMIN216_UNMINTED_PLAN/);
 drift=true;assert.throws(()=>assertPositionAdministrative216Same190Plan(h),/POSITION_ADMIN216_SOURCE_BOOKEND/);
});

test('proof contract rejects unexpected nominal fields, false metadata and changed fingerprints',()=>{
 const p=build(),installed=proof(p,'install'),durable=proof(p,'durable'),repeated=proof(p,'repeat');
 assert.equal(assertPositionAdministrative216Durability({plan:p,installed,durable,repeated}).passed,true);
 assert.throws(()=>assertPositionAdministrative216Proof({...durable,employeeName:'synthetic'},p,'durable'),/POSITION_ADMIN216_PROOF_FIELDS/);
 assert.throws(()=>assertPositionAdministrative216Proof({...durable,helperRuntime:true},p,'durable'),/POSITION_ADMIN216_PROOF:helperRuntime/);
 assert.throws(()=>assertPositionAdministrative216Proof({...durable,finalMetadataPins:33},p,'durable'),/POSITION_ADMIN216_PROOF:finalMetadataPins/);
 assert.throws(()=>assertPositionAdministrative216Durability({plan:p,installed,durable:{...durable,oldSevenMetadataFingerprint:'e'.repeat(64)},repeated}),/POSITION_ADMIN216_DURABILITY:oldSevenMetadataFingerprint/);
 assert.throws(()=>assertPositionAdministrative216Durability({plan:p,installed,durable,repeated:{...repeated,objectsFingerprint:'e'.repeat(64)}}),/POSITION_ADMIN216_REPETITION:objectsFingerprint/);
});

test('host sequence is rehearsal ROLLBACK, install COMMIT, immediate durable RO, no-DDL repeat',()=>{
 const p=build(),h=fakeHost(p),admission=installPositionAdministrative216Same190(h,{positions210Installation:prior(p)});
 assert.deepEqual(h.calls.map(call=>call.statements),[p.installation,p.installation,p.durableVerification,p.repetition]);
 assert.deepEqual(h.calls[0].options,{end:'ROLLBACK',fullJson:true});assert.deepEqual(h.calls[1].options,{fullJson:true});
 assert.deepEqual(h.calls[2].options,{readOnly:true,fullJson:true});assert.deepEqual(h.calls[3].options,{fullJson:true});
 assert.equal(admission.administrativeNoEmploymentBrowserProven,false);assert.equal(admission.productionWrites,0);
 assert.equal(verifyPositionAdministrative216Epoch(h,admission).passed,true);
 assert.throws(()=>verifyPositionAdministrative216Epoch(h,{...admission}),/POSITION_ADMIN216_INSTALLATION_ADMISSION_REQUIRED/);
});

test('a failed mutation stops the call chain and cannot be automatically retried with the same plan',()=>{
 const p=build(),h=fakeHost(p,{failAt:2});
 assert.throws(()=>installPositionAdministrative216Same190(h,{positions210Installation:prior(p)}),/NATIVE_OUTCOME_UNCERTAIN/);
 assert.equal(h.calls.length,2);
 assert.throws(()=>installPositionAdministrative216Same190(h,{positions210Installation:prior(p)}),/POSITION_ADMIN216_ALREADY_EXECUTED_FRESH_REVIEW_REQUIRED/);
 assert.equal(h.calls.length,2);
 assert.throws(()=>verifyPositionAdministrative216Epoch(h,{}),/POSITION_ADMIN216_INSTALLATION_ADMISSION_REQUIRED/);
});

test('durable object drift stops before another snapshot, repetition or business operation',()=>{
 const p=build(),h=fakeHost(p,{durableDrift:true});
 assert.throws(()=>installPositionAdministrative216Same190(h,{positions210Installation:prior(p)}),/POSITION_ADMIN216_IMMEDIATE_DURABILITY:objectsFingerprint/);
 assert.equal(h.calls.length,3);assert.ok(!h.phases.includes('position-administrative216-exact-verification-repeat'));
});

test('later metadata verification permits a new data epoch but requires the same eight function objects',()=>{
 const p=build(),h=fakeHost(p),admission=installPositionAdministrative216Same190(h,{positions210Installation:prior(p)}),original=h.json;
 h.json=(statements,options)=>{assert.strictEqual(statements,p.durableVerification);assert.equal(options.readOnly,true);return proof(p,'durable',{beforeFingerprint:'e'.repeat(64),priorFingerprint:'e'.repeat(64)});};
 assert.equal(verifyPositionAdministrative216Epoch(h,admission).passed,true);
 h.json=()=>proof(p,'durable',{objectsFingerprint:'e'.repeat(64)});
 assert.throws(()=>verifyPositionAdministrative216Epoch(h,admission),/POSITION_ADMIN216_OBJECT_EPOCH_CHANGED/);h.json=original;
});
