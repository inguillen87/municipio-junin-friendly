import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ownerAuthorityQaOptions,ownerAuthorityQaHolderIdentity,verifyMunicipalOwnerAdoptionAuthority} from '../scripts/verify-municipal-owner-adoption-authority.mjs';
import {verifyMunicipalOwnerAdoptionDecision} from '../scripts/verify-municipal-owner-adoption-decision.mjs';
import {mixedQaOptions,verifyMixedContractAdoption} from '../scripts/verify-mixed-contract-adoption.mjs';
import {buildFinalGrhSourceReviewAdmissionInstallation} from '../scripts/lib/final-grh-source-review-admission-installation.mjs';
import {finalReviewAdmissionQaFoundation,relocateFinalReviewAdmissionInstallation} from '../scripts/lib/final-grh-source-review-admission-qa.mjs';
import {captureOwnerAdoptionQaDestination} from '../scripts/lib/municipal-owner-adoption-qa-transport.mjs';

const sourceCommit='a'.repeat(40),read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const proof=major=>({database:'own_payroll_run_qa',role:'postgres',sessionRole:'postgres',databaseOwner:'postgres',databaseOid:16384,major,address:'172.18.0.2',port:5432,directory:major===17?'/var/lib/postgresql/data':'/var/lib/postgresql/18/docker',startEpoch:1792025447,neonProject:null,neonBranch:null,otherClients:0,publicTables:0,runtimeRole:{oid:16385,login:false,superuser:false,bypassRls:false,createRole:false,createDatabase:false,replication:false}});

test('all three canonical CLIs keep local default and require an explicit closed CI transport without target overrides',()=>{
 const args=['--major=17','--source-commit='+sourceCommit,'--output=verification/owner-ci-options'];
 for(const parse of[ownerAuthorityQaOptions,mixedQaOptions]){
  assert.equal(parse(args).transport,'local');assert.equal(parse([...args,'--transport=ci']).transport,'ci');assert.equal(parse([...args,'--transport=local']).transport,'local');
  for(const bad of['--transport=CI','--transport=production','--transport=ci\n','--host=127.0.0.1','--port=5432','--database=own_payroll_run_qa','--role=postgres','--sql=SELECT 1','--connection-string=local'])assert.throws(()=>parse([...args,bad]));
  assert.throws(()=>parse([...args,'--transport=local','--transport=ci']));
 }
 assert.equal(mixedQaOptions([...args,'--profile=october14','--transport=ci']).profile,'october14');
});

test('CI refusal occurs in every real runner before fixture construction, filesystem evidence or database use',async()=>{
 const previous=process.env.GITHUB_REPOSITORY;process.env.GITHUB_REPOSITORY='untrusted/no-target';
 try{for(const verify of[verifyMunicipalOwnerAdoptionAuthority,verifyMunicipalOwnerAdoptionDecision,verifyMixedContractAdoption]){
  const output='verification/owner-ci-refused-'+randomUUID();assert.equal(fs.existsSync(new URL('../'+output,import.meta.url)),false);
  await assert.rejects(verify({major:17,sourceCommit,output,transport:'ci'}),/OWNER_QA_CI_REPOSITORY_CHANGED/);assert.equal(fs.existsSync(new URL('../'+output,import.meta.url)),false);
 }}finally{if(previous===undefined)delete process.env.GITHUB_REPOSITORY;else process.env.GITHUB_REPOSITORY=previous;}
});

test('serialization authorization requires one complete real holder identity line with exact PID, application and timestamp types',()=>{
 const holder={pid:101,applicationName:'owner184-serialization-holder',backendStart:'2026-10-15T16:10:11.123456Z'},line=JSON.stringify(holder);
 assert.equal(ownerAuthorityQaHolderIdentity(line),null);assert.deepEqual(ownerAuthorityQaHolderIdentity(line+'\r\n\n'),holder);assert.ok(Object.isFrozen(ownerAuthorityQaHolderIdentity(line+'\n')));
 for(const patch of[{pid:'101'},{pid:0},{pid:-1},{pid:2147483648},{applicationName:'arbitrary-holder'},{applicationName:"owner184-serialization-holder' OR true"},{backendStart:'2026-10-15T16:10:11Z'},{backendStart:'2026-10-15T16:10:11.123Z'},{backendStart:'2026-10-15T16:10:11.123456+00:00'},{sql:'SELECT 1'}])assert.throws(()=>ownerAuthorityQaHolderIdentity(JSON.stringify({...holder,...patch})+'\n'));
 assert.throws(()=>ownerAuthorityQaHolderIdentity('not JSON\n'));assert.throws(()=>ownerAuthorityQaHolderIdentity(null));
});

test('183 CI adapts only the explicit service destination while preserving all nine pins, full shape, source tuples and four-phase statements',()=>{
 for(const major of[17,18]){
  const qa=finalReviewAdmissionQaFoundation(major),batch=buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major}),destinationIdentity=captureOwnerAdoptionQaDestination(proof(major),{major,transport:'ci'}),options={read,databaseOid:16384},local=relocateFinalReviewAdmissionInstallation(batch,qa,options),ci=relocateFinalReviewAdmissionInstallation(batch,qa,{...options,transport:'ci',destinationIdentity});
  assert.equal(ci.transport,'github-actions-service-only');assert.equal(local.transport,'existing-loopback-only');assert.deepEqual(ci.sourcePrerequisite,local.sourcePrerequisite);assert.equal(ci.sourcePrerequisite.pins.length,9);assert.deepEqual(ci.relocation,local.relocation);
  assert.ok(ci.destination.includes('inet_server_port() IS DISTINCT FROM 5432'));assert.ok(ci.destination.includes("host(inet_server_addr()) IS DISTINCT FROM '172.18.0.2'"));assert.ok(ci.destination.includes('16384::oid'));assert.ok(ci.destination.includes("data_directory"));assert.ok(!ci.destination.includes('inet_server_port()<>554'));
  assert.ok(local.destination.includes('inet_server_port()<>'+String(55400+major)));assert.ok(local.destination.includes("host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'"));
  for(const name of['rehearsal','install','durable','repeat']){const a=local.transactions[name],b=ci.transactions[name];assert.equal(b.begin,a.begin);assert.equal(b.readOnly,a.readOnly);assert.equal(b.completion,a.completion);assert.deepEqual(b.statements.filter(s=>s!==ci.destination),a.statements.filter(s=>s!==local.destination));}
  assert.deepEqual(ci.preflight.filter(s=>s!==ci.destination),local.preflight.filter(s=>s!==local.destination));assert.deepEqual(ci.guardedRollback.statements.filter(s=>s!==ci.destination),local.guardedRollback.statements.filter(s=>s!==local.destination));
  for(const bad of[{transport:'ci'},{transport:'other'},{transport:'local',destinationIdentity},{transport:'ci',destinationIdentity:{...destinationIdentity,major:major===17?18:17}},{transport:'ci',destinationIdentity:{...destinationIdentity,databaseOid:16385}}])assert.throws(()=>relocateFinalReviewAdmissionInstallation(batch,qa,{...options,...bad}));
 }
});
