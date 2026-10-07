import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {buildAdoptionApplicationQa} from '../scripts/verify-employment-adoption-application-sql.mjs';
import {adoptionReceipt} from '../assets/employment-adoption-contract.js';
const migration=fs.readFileSync(new URL('../scripts/migrations/133-employment-adoption-application.sql',import.meta.url),'utf8');
test('private application QA retains every existing regression and isolates the new writer',()=>{
 for(const serverMajor of [17,18]){
  const qa=buildAdoptionApplicationQa({serverMajor});assert.equal(qa.report.checksPassed,570+qa.report.adoptionApplicationChecksPassed);assert.ok(qa.report.adoptionApplicationChecksPassed>=35);
  assert.equal(qa.report.municipalRowsWritten,0);assert.match(qa.sql,/ADOPTION_REVIEW_QA_LOOPBACK_REQUIRED/);assert.ok(qa.sql.includes('inet_server_port() IS DISTINCT FROM '+(serverMajor===17?55417:55418)));
  assert.ok(qa.sql.includes(serverMajor===17?'fixed_novelties_qa':'own_payroll_run_qa'));assert.match(qa.sql,/older preparations cannot be silently assigned a new canonical snapshot/);
  assert.match(qa.sql,/QA_ADOPTION_INJECTED_FAILURE/);assert.match(qa.sql,/failure after an earlier adoption rolls back the entire decision transaction/);assert.match(qa.sql,/ROLLBACK;/);
  assert.ok(qa.sql.indexOf('failure after an earlier adoption')<qa.sql.indexOf("RAISE EXCEPTION USING ERRCODE='P1321'"));
 }
 assert.throws(()=>buildAdoptionApplicationQa({serverMajor:16}));
});
test('baseline patch pins the unchanged approved guard and preserves its old branches',()=>{
 const source=fs.readFileSync(new URL('../scripts/migrations/096-grh-effective-source.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const body=/AS \$baseline\$([\s\S]*?)\$baseline\$/.exec(source)[1],hash=createHash('md5').update(body).digest('hex');
 assert.ok(migration.includes(hash));assert.match(migration,/length\(d\)-length\(replace\(d,anchor,''\)\)<>length\(anchor\)/);
 assert.match(migration,/employment_adoption_update_allowed_v1\(OLD,NEW\) IS TRUE/);assert.doesNotMatch(migration,/DISABLE TRIGGER|session_replication_role|DROP TRIGGER|GRANT EXECUTE|ALTER ROLE|ALTER POLICY/);
});
test('draft transfers canonical IDs without inserting identities/contracts or updating historical/payroll facts',()=>{
 assert.doesNotMatch(migration,/INSERT INTO public\.(?:employment_contract|person_identity)|UPDATE public\.(?:person_identity|payroll_|grh_|source_import_batch)/);
 assert.match(migration,/UPDATE public\.employment_contract SET source_system='MUNICONTROL'/);assert.match(migration,/before_contract jsonb NOT NULL/);assert.match(migration,/before_person jsonb NOT NULL/);
 assert.match(migration,/SET CONSTRAINTS employment_adoption_application_applied,employment_adoption_decision_applied IMMEDIATE/);assert.match(migration,/n<>r\.total/);assert.match(migration,/applicationAvailable',false/);
 assert.match(migration,/actor_membership_id<>r\.actor_membership_id|membershipId'\)::uuid<>r\.actor_membership_id/);assert.match(migration,/actorPersonId'\)::uuid<>r\.actor_person_id/);
 assert.match(migration,/facts IS DISTINCT FROM s\.facts/);assert.match(migration,/body IS DISTINCT FROM input/);
});
test('approved receipt means every contract adopted and remains distinct from calculated payroll',()=>{
 const sha='a'.repeat(64),receipt={version:'employment-adoption.v1',operation:'review',proposalId:'fd77d09e-c7f3-490d-b31a-e50ec1713d30',proposalVersion:sha,sourceContextVersion:sha,catalogVersion:sha,status:'approved',total:61,replayed:false,decidedAt:'2026-10-06T18:00:00.123456+00:00',effects:{identitiesCreated:0,contractsCreated:0,contractsAdopted:61,sourceHistoryRetained:true,payrollCalculated:false,payrollPosted:false,paymentsExecuted:false}};
 assert.deepEqual(adoptionReceipt(receipt,{operation:'review',total:61}),receipt);
 for(const change of [{contractsAdopted:60},{identitiesCreated:1},{contractsCreated:1},{sourceHistoryRetained:false},{payrollCalculated:true},{payrollPosted:true},{paymentsExecuted:true}])assert.throws(()=>adoptionReceipt({...receipt,effects:{...receipt.effects,...change}}));
});
