// Pure protocol composition. No client, HTTP server or PostgreSQL execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildMonthlyDayPolicyQa,monthlyDayQaRpc,assertMonthlyDayInstallationDurability} from '../scripts/lib/own-monthly-day-policy-qa.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {monthlyQaRuntimeAcl} from '../scripts/lib/own-monthly-participation-qa.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {monthlyDaySqlFixture} from './fixtures/own-monthly-day-policy-sql-synthetic.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=b=>createHash('sha256').update(b).digest('hex'),schema='mc_qa_fixed_092_'+'1'.repeat(32),sourceCommit='a'.repeat(40);
// Same header-only normalization used by the192 installer. The metadata
// parser expects single-line SET clauses; neither emitted SQL nor body bytes
// may be changed to satisfy this comparison.
const metadataHeader=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0);const normalized=d.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);assert.equal(normalized.slice(normalized.search(/\bAS\s+\$/)),d.slice(at));return normalized;};
let qa;test.before(()=>{qa=buildMonthlyDayPolicyQa({major:17,sourceCommit,read,schema,operationalPairBaseline:'published107'});});
test('one existing190 foundation supplies all identity and definition pins; construction never executes SQL',()=>{
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);assert.equal(qa.qa.connects,false);assert.equal(qa.qa.executesSql,false);
 assert.equal(qa.schema,schema);assert.equal(qa.actor,qa.qa.actor);assert.equal(qa.checker,qa.qa.checker);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
 assert.equal(qa.operationalPairBaseline,'published107');assert.equal(qa.qa.operationalPairBaseline,'published107');assert.equal(qa.batch.dependsOn191,false);
 for(const [file,sha]of Object.entries(qa.sourceHashes))assert.equal(hash(read(file)),sha,file);
 for(const phase of ['rehearsal','installation','repetition','verification','rollback'])assert.deepEqual(qa.local[phase],qa.batch[phase].map(qa.normalized));
});
test('all six relocated192 bodies retain complete metadata and the readiness hash follows the actual capture body',()=>{
 for(const d of [...qa.batch.newDefinitions,...qa.batch.adapted]){
  // Match the installer's canonical SET spelling before parsing metadata.
  // Only the header is normalized: the original body hash must stay exact.
  const raw=ownInstallationFunctionPin(d),before=ownInstallationFunctionPin(metadataHeader(d)),local=qa.normalized(d),projectedDefinition=local.replace('FUNCTION '+schema+'.','FUNCTION public.'),projectedRaw=ownInstallationFunctionPin(projectedDefinition),projected=ownInstallationFunctionPin(metadataHeader(projectedDefinition));
  assert.equal(before.sha256,raw.sha256,'MONTHLY192_QA_HEADER_CHANGED_BODY');assert.equal(projected.sha256,projectedRaw.sha256,'MONTHLY192_QA_PROJECTED_HEADER_CHANGED_BODY');
  const canonical=[...qa.batch.newPins,...qa.batch.afterPins].filter(p=>p.signature===before.signature);
  assert.equal(canonical.length,1);assert.deepEqual(before,canonical[0]);
  assert.equal(projected.sha256,qa.hashes[before.sha256]);
  assert.deepEqual({...projected,sha256:null,config:projected.config.map(v=>v.replace(schema+', ',''))},{...before,sha256:null});
  const header=local.slice(0,local.search(/\bAS\s+\$/));assert.ok(header.includes('search_path=pg_catalog,'+schema+',public,pg_temp'));
 }
 const capture=qa.batch.afterPins.find(p=>p.name==='own_run_capture_v1'),ready=qa.normalized(qa.batch.adapted.find(d=>d.includes('FUNCTION public.municipal_adoption_ready_v1(')));
 assert.ok(ready.includes(qa.hashes[capture.sha256]));assert.ok(!ready.includes(capture.sha256));
});
test('fixture source restores only the canonical published facade groups and keeps both new helpers private',()=>{
 const acl=monthlyQaRuntimeAcl(qa.qa.seed+';'+qa.runtimeGrantSeed+';'+qa.local.installation.join(';'),schema);
 for(const r of qa.runtimeGrants){assert.equal(hash(read(r.file)),r.sourceSha256);for(const signature of r.signatures)assert.ok(acl.has(signature.replace('public.',schema+'.')),signature);}
 for(const p of qa.batch.newPins){assert.equal(p.runtime,false);assert.equal(acl.has(p.signature.replace('public.',schema+'.')),false);}
 assert.doesNotMatch(qa.runtimeGrantSeed,/GRANT ALL|TO PUBLIC|CREATE ROLE|ALTER ROLE/);
});
test('the initial synthetic IAM setup uses exact source declarations and assigns only seven maker capabilities',()=>{
 assert.equal(qa.capabilitySources.length,3);assert.equal(qa.makerCapabilities.length,7);assert.equal(new Set(qa.makerCapabilities).size,7);
 for(const row of qa.capabilitySources){assert.equal(row.sourceSha256,qa.sourceHashes[row.file]);assert.ok(splitPostgresStatements(read(row.file)).some(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()===row.statement));assert.ok(qa.capabilitySeed.includes(qa.normalized(row.statement)));}
 assert.ok(qa.capabilitySeed.includes(qa.actor.membershipId));assert.ok(!qa.capabilitySeed.includes(qa.checker.membershipId));
 assert.doesNotMatch(qa.capabilitySeed,/GRANT|CREATE ROLE|UPDATE pg_|own_payroll_program_event|own_payroll_run_capture|approve_owner|tenant_membership_capability_override/);
 const s=splitPostgresStatements(qa.capabilitySeed);assert.equal(s.length,4);assert.ok(s.slice(0,3).every(x=>/INSERT INTO (?:public\.|mc_qa_fixed_092_[a-f0-9]{32}\.)?iam_capability\s*\(/.test(x)));
});
test('the SQL fixture declares inputs and a complete programme without constructing authority or capture rows',()=>{
 const f=monthlyDaySqlFixture();assert.equal(f.period,'2027-02');assert.deepEqual(ownProgramDefinition(f.definition,f.items),f.definition);assert.equal(f.definition.rules.length,5);
 assert.equal(f.definition.monthlyDaysPolicy.recognizedDays,'30');assert.equal(f.definition.monthlyDaysPolicy.baseDays,'30');assert.equal(f.definition.monthlyDaysPolicy.partial,'reject');
 assert.equal(f.definition.bindings.filter(b=>b.sourceKind==='monthly_day_fact').length,2);assert.equal(f.definition.bindings.filter(b=>b.sourceKind==='period_fact').length,2);
 assert.ok(f.items.every(i=>i.value===null));assert.ok(f.definition.periodParticipation.treatments.every(t=>t.treatment==='declared_formula'));
 assert.equal(f.approvalFabricated,false);assert.equal(f.municipalFormula,false);assert.ok(!('approvalId'in f));assert.ok(!('source'in f));
});
test('ordinary RPC mapping admits exact signatures and escapes values without changing their content',()=>{
 const text='SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result',values=['{}','{"reason":"O\'Hara synthetic"}','00000000-0000-4000-8000-000000000001','a'.repeat(64)],before=structuredClone(values),mapped=monthlyDayQaRpc(text,values,schema);
 assert.ok(mapped.startsWith('SELECT '+schema+'.own_run_capture_v1('));assert.ok(mapped.includes("O''Hara"));assert.deepEqual(values,before);
 assert.ok(monthlyDayQaRpc('SELECT public.own_program_bootstrap_v1($1::jsonb) AS result',['{}'],schema).startsWith('SELECT '+schema+'.own_program_bootstrap_v1('));
 for(const bad of [text+';SELECT 1',text.replace('public.','other.'),text.replace('::uuid','::text'),text.replace('capture_v1','context_v1'),text.replace('$4::text','$5::text')])assert.throws(()=>monthlyDayQaRpc(bad,values,schema));
 assert.throws(()=>monthlyDayQaRpc(text,values.slice(0,3),schema));assert.throws(()=>monthlyDayQaRpc(text,[{},...values.slice(1)],schema));assert.throws(()=>monthlyDayQaRpc(text,values,'public'));
});
test('durability requires all proof fields and identical preservation, metadata and object hashes on three independent results',()=>{
 const proof=(mode,preserved)=>({version:qa.batch.version,sourceCommit,sourceHashes:qa.batch.sourceHashes,mode,newTables:0,newFunctions:2,adaptedFunctions:4,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,transactionDataPreserved:preserved,preservationSha256:'1'.repeat(64),priorMetadataSha256:'2'.repeat(64),objectSha256:'3'.repeat(64)}),args={installed:proof('install',true),durable:proof('verify',false),repeated:proof('verify',true),batch:{version:qa.batch.version,sourceCommit:qa.batch.sourceCommit,sourceHashes:qa.batch.sourceHashes}};
 assert.equal(assertMonthlyDayInstallationDurability(args).passed,true);
 for(const mutate of [v=>delete v.durable.objectSha256,v=>v.durable.objectSha256='4'.repeat(64),v=>v.installed.businessWrites=1,v=>v.repeated.transactionDataPreserved=false,v=>v.durable.mode='install',v=>v.installed.extra=true]){const changed=structuredClone(args);mutate(changed);assert.throws(()=>assertMonthlyDayInstallationDurability(changed));}
});
test('invalid construction settings reject before a source read rather than selecting an implicit baseline',()=>{
 let reads=0;for(const input of [{major:16,operationalPairBaseline:'pre107'},{major:17,operationalPairBaseline:undefined},{major:18,operationalPairBaseline:'auto'}])assert.throws(()=>buildMonthlyDayPolicyQa({...input,sourceCommit,read:()=>{reads++;throw Error('UNEXPECTED_READ');}}));assert.equal(reads,0);
});
