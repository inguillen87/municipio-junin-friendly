import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{buildPayrollPeriodContextInstallation,assertPayrollPeriodContextDurability,PAYROLL_PERIOD_CONTEXT_SQL_SHA256}from'../scripts/lib/own-payroll-period-context-installation.mjs';
import{derivePayrollPeriodContextConsumers,PERIOD_CONTEXT_PARENT_COMMIT,PERIOD_CONTEXT_PARENT_SQL_SHA256}from'../scripts/lib/own-payroll-period-context-consumers.mjs';
import{ownInstallationFunctionPin}from'../scripts/lib/own-payroll-installation.mjs';
import{buildNoeliaCircuitQa}from'../scripts/lib/noelia-payroll-circuit-qa.mjs';
import{buildAgreementWorkingTimeQaRelocation}from'../scripts/lib/own-agreement-working-time-qa-relocation.mjs';
import{buildPeriodContextQaRelocation}from'../scripts/lib/own-payroll-period-context-qa.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8'),sourceCommit='a'.repeat(40),sha=v=>createHash('sha256').update(v.replace(/\r\n?/g,'\n')).digest('hex');
const batch=buildPayrollPeriodContextInstallation({read,sourceCommit}),derived=derivePayrollPeriodContextConsumers({read,sourceCommit});

test('182 composes exactly four reviewed180 consumers and retains all ninety prior function contracts',()=>{
 assert.equal(PERIOD_CONTEXT_PARENT_COMMIT,'800dfcc3f4e68d16afba5805bb8fb56f6a253428');assert.equal(sha(read('scripts/migrations/180-own-agreement-working-time-program.sql')),PERIOD_CONTEXT_PARENT_SQL_SHA256);
 assert.equal(sha(read('scripts/migrations/182-own-payroll-period-context.sql')),PAYROLL_PERIOD_CONTEXT_SQL_SHA256);assert.equal(batch.prerequisites.length,86);assert.equal(batch.beforePins.length,4);assert.equal(batch.afterPins.length,4);assert.equal(batch.mutations.length,4);
 assert.deepEqual(batch.beforePins,derived.prior.afterConsumerPins);for(let i=0;i<4;i++){assert.deepEqual({...batch.afterPins[i],sha256:null},{...batch.beforePins[i],sha256:null});assert.equal(batch.afterPins[i].sha256,ownInstallationFunctionPin(derived.changed[i]).sha256);}
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);for(const statement of batch.mutations)assert.match(statement,/^CREATE OR REPLACE FUNCTION public\.(own_program_definition_v1|own_program_command_v1|own_run_capture_v1|municipal_adoption_ready_v1)\(/);
});

test('both installation paths retain complete179 table ACL/RLS/shape and family-count guards before replacing bodies',()=>{
 assert.equal(batch.beforeCheck,derived.prior.afterCheck);let restored=batch.afterCheck;for(let i=0;i<4;i++)restored=restored.replace(batch.afterPins[i].sha256,batch.beforePins[i].sha256);assert.equal(restored,batch.beforeCheck);
 for(const guard of['TABLE_SECURITY','TABLE_SHAPE','CHECK_SHAPE','FOREIGN_SHAPE','UNIQUE_SHAPE','NOT_NULL_SHAPE','INDEX_SHAPE','IMMUTABLE_GUARD','FOREIGN_GUARD','FUNCTION_COUNT'])for(const check of[batch.beforeCheck,batch.afterCheck])assert.ok(check.includes('AGREEMENT_INSTALL_'+guard),guard);
 assert.match(batch.beforeCheck,/aclexplode/);assert.match(batch.beforeCheck,/attacl IS NOT NULL/);assert.match(batch.beforeCheck,/<>15/);
 assert.ok(batch.statements.indexOf(batch.choose)<batch.statements.indexOf(batch.apply));assert.ok(batch.choose.includes(batch.beforeCheck.replaceAll("'","''")));
});

test('phase detection retains all eight exact body predicates after the canonical isolated-schema relocation',()=>{
 const qa=buildNoeliaCircuitQa(17),q=value=>"'"+value.replaceAll("'","''")+"'";
 // This is the existing salary-namespace transport's source normalization;
 // bare prosrc bypasses it and compares schema-qualified QA bodies to public pins.
 const normalizedBody="replace(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q('search_path=pg_catalog, '+qa.schema+', public, pg_temp')+",'search_path=pg_catalog, public, pg_temp'),"+q(qa.schema)+",'public')";
 const relocate=s=>qa.normalized(s).replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')",normalizedBody);
 const prior=buildAgreementWorkingTimeQaRelocation({read,sourceCommit,schema:qa.schema,relocate,batch:derived.prior});
 const fixture=buildPeriodContextQaRelocation({read,sourceCommit,schema:qa.schema,relocate,batch}),mode=fixture.rehearsal[1];
 assert.equal(mode.split(normalizedBody).length-1,8,'every before/after mode predicate must normalize exactly like the full metadata guard');
 assert.equal((mode.match(/FROM pg_proc p WHERE p\.oid=to_regprocedure\(/g)||[]).length,8);
 const canonical=s=>s.replaceAll('search_path=pg_catalog, '+qa.schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(qa.schema,'public');
 const body=s=>{const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(match);return match[2];};
 const priorReady=prior.mutations.find(s=>s.includes('FUNCTION '+qa.schema+'.municipal_adoption_ready_v1('));assert.ok(priorReady);
 const before=[...derived.originals.slice(0,3).map(relocate),priorReady],after=fixture.mutations;
 const exactHashes=[...before,...after].map(s=>sha(body(canonical(s))));
 assert.deepEqual([...mode.matchAll(/'hex'\)='([a-f0-9]{64})'/g)].map(match=>match[1]),exactHashes);
 assert.deepEqual(exactHashes.slice(0,3),batch.beforePins.slice(0,3).map(pin=>pin.sha256));
 assert.deepEqual(exactHashes.slice(4,7),batch.afterPins.slice(0,3).map(pin=>pin.sha256));
 assert.equal(exactHashes[3],fixture.fixtureBeforeSha256);assert.equal(exactHashes[7],fixture.fixtureAfterSha256);
 for(const definition of[...before,...after])assert.ok(!exactHashes.includes(sha(body(canonical(definition))+'\n-- altered consumer')));
 assert.match(mode,/PERIOD_CONTEXT_INSTALL_CONSUMER_SET_CHANGED/);assert.equal(mode.split(' AND ').length-1,14);
 assert.ok(fixture.beforeCheck.includes(normalizedBody));assert.ok(fixture.afterCheck.includes(normalizedBody));
});

test('source drift, extra SQL or changed180 foundation fail construction before any installation exists',()=>{
 for(const file of['scripts/migrations/182-own-payroll-period-context.sql','scripts/migrations/180-own-agreement-working-time-program.sql','scripts/migrations/179-own-agreement-working-time.sql','scripts/migrations/177-own-period-classification.sql'])assert.throws(()=>buildPayrollPeriodContextInstallation({sourceCommit,read:p=>read(p)+(p===file?'\n-- unreviewed':'')}),/CHANGED/);
 assert.throws(()=>buildPayrollPeriodContextInstallation({read,sourceCommit:'main'}));
});

test('removing only the context additions restores byte-exact180 capture and prior classification, replay and limit guards',()=>{
 assert.equal(batch.capture180Preserved,true);const capture=derived.changed[2];assert.match(capture,/own_period_classification_resolve_v1/);assert.match(capture,/own_agreement_working_time_capture_v1/);assert.match(capture,/own_salary_conditions_capture_v1/);
 assert.ok(capture.indexOf('IF FOUND THEN')<capture.indexOf("period_context:=jsonb_build_object"));assert.match(capture,/RETURN public\.own_run_receipt_v1\(prior,true\)/);assert.match(capture,/4194304/);
 assert.match(capture,/jsonb_build_object\('employees',employees,'periodContext',period_context\)/);for(const key of['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions'])assert.ok(capture.includes("jsonb_build_object('"+key+"'"));
 assert.doesNotMatch(capture.match(/period_context:=jsonb_build_object[^;]+;/)[0],/liquidationDate|clock_timestamp|payment|Date/);
 assert.ok(derived.changed[3].includes(batch.afterPins[2].sha256));assert.ok(!derived.changed[3].includes(batch.beforePins[2].sha256));
});

test('complete transaction preservation includes leave and rejects unaudited relation kinds; durable read requires READ ONLY RR',()=>{
 assert.equal(batch.statements.length,8);assert.equal(batch.verification.length,4);
 assert.equal(batch.installation.length,9);assert.deepEqual(batch.rehearsal,batch.installation);assert.equal(batch.repetition.length,9);assert.match(batch.installation[1],/mode'\)<>'install'/);assert.match(batch.repetition[1],/mode'\)<>'verify'/);assert.match(batch.repetition[1],/PERIOD_CONTEXT_INSTALL_PHASE_CHANGED/);assert.ok(batch.repetition.indexOf(batch.apply)>1);
 for(const s of[batch.before,batch.after]){assert.ok(!s.includes("IS DISTINCT FROM to_regclass('public.native_leave_event')"));assert.ok(!s.includes("p.proname LIKE 'native_leave_%'"));assert.match(s,/relkind IN\('m','f'\)/);assert.match(s,/pg_event_trigger/);assert.match(s,/PERIOD_CONTEXT_INSTALL_UNAUDITED_OBJECT_SCOPE/);assert.match(s,/-'prosrc'/);}
 assert.match(batch.mode,/repeatable read/);assert.match(batch.verification[0],/transaction_read_only'\)<>'on'/);assert.match(batch.conservation,/IS DISTINCT FROM/);
});

test('durability compares exact function/metadata/source contracts while not mislabelling mutable global data as cross-request static',()=>{
 const base={version:'own-payroll-period-context-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,newTables:0,newFunctions:0,adaptedFunctions:4,existingAclChanges:0,roleAssignmentsAdded:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0,preservationSha256:'a'.repeat(64),priorMetadataSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)};
 const installed={...base,mode:'install',transactionDataPreserved:true},durable={...base,mode:'verify',transactionDataPreserved:false,preservationSha256:'d'.repeat(64)};
 assert.equal(assertPayrollPeriodContextDurability({installed,durable,batch}).wholeDatabaseStaticAcrossConnections,false);
 for(const patch of[{objectFingerprint:'e'.repeat(64)},{priorMetadataSha256:'e'.repeat(64)},{businessWrites:1},{sourceCommit:'f'.repeat(40)},{sourceHashes:{}},{transactionDataPreserved:true}])assert.throws(()=>assertPayrollPeriodContextDurability({installed,durable:{...durable,...patch},batch}));
});
