// Synthetic command/receipt boundaries. SQL remains the operational authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emissionSources} from './fixtures/own-payroll-row-emission-synthetic.js';
import {command,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {ownProgramCommand,ownProgramReceipt,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {programOperation,programFingerprint} from '../lib/internal-own-payroll-program.js';

const fixture=()=>{
 const s=emissionSources(),program=s.programState.program.definition;
 return{body:command({program}),catalog:s.programState.salaryCatalog.items};
};
const principal={user:{email:'maker@example.test'},tenant:{source:'membership',id:uid(101),membershipId:uid(102)}};
const session={email:'maker@example.test',id:uid(103),version:1,releaseSha:'a'.repeat(40)};
const receipt=(body,key,patch={})=>({version:'own-payroll-program.v1',eventId:uid(104),proposalId:body.command==='propose'?uid(104):body.proposalId,requestKey:key,requestSha256:programFingerprint(body),body,status:body.command==='propose'?'pending':'approved',revision:body.command==='propose'?0:1,programVersion:body.command==='propose'?body.baseVersion:hash('d'),replayed:false,payrollCalculated:false,payrollPosted:false,...patch});

test('versioned V5 proposal keeps its exact definition and source references',()=>{
 const {body,catalog}=fixture(),before=structuredClone(body);
 assert.deepEqual(ownProgramCommand(body,catalog),before);
 assert.deepEqual(ownProgramCommand(body),before);
 assert.deepEqual(body,before);
});
test('proposed V5 receipt validates with the original attempt',()=>{
 const {body}=fixture(),key=uid(105),result=receipt(body,key);
 assert.equal(ownProgramReceipt(result,{key,body}),result);
 assert.throws(()=>ownProgramReceipt({...result,status:'approved'},{key,body}),e=>e.code==='PROGRAM_CONTRACT_INVALID');
});
test('program operation sends V5 through the SQL facade and validates its receipt',async()=>{
 const {body}=fixture(),key=uid(105);let calls=0;
 const sql={query:async(query,values)=>{
  calls++;assert.equal(query,'SELECT public.own_program_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result');
  assert.equal(JSON.parse(values[0]).membershipId,principal.tenant.membershipId);
  assert.deepEqual(JSON.parse(values[1]),body);assert.equal(values[2],key);
  return[{result:receipt(body,key)}];
 }};
 const result=await programOperation(sql,principal,session,'command',{key,body});
 assert.equal(result.status,'pending');assert.equal(calls,1);
});
test('client cannot replace server family admission with an extra field',async()=>{
 const {body}=fixture();let calls=0;
 const sql={query:async()=>{calls++;throw Error('must not reach SQL');}};
 await assert.rejects(programOperation(sql,principal,session,'command',{key:uid(105),body:{...body,operationalFamily:{complete:true}}}),e=>e.status===422);
 assert.equal(calls,0);
});
test('SQL authority rejects a proposal when its installed families are not admitted',async()=>{
 const {body}=fixture();let calls=0;
 const sql={query:async()=>{calls++;throw Error('OWN_PROGRAM_QUANTITY_PREPARATION_ONLY');}};
 await assert.rejects(programOperation(sql,principal,session,'command',{key:uid(105),body}),e=>e.code==='OWN_PROGRAM_UNAVAILABLE'&&e.status===503);
 assert.equal(calls,1);
});
test('SQL scope and independent reviewer rejections are preserved',async()=>{
 const {body}=fixture();
 for(const [code,status]of [['SCOPE_CHANGED',409],['INDEPENDENT_REQUIRED',403]]){
  const sql={query:async()=>{throw Error('OWN_PROGRAM_'+code);}};
  await assert.rejects(programOperation(sql,principal,session,'command',{key:uid(105),body}),e=>e.code==='OWN_PROGRAM_'+code&&e.status===status);
 }
});
test('invalid source proof still fails before the SQL command',async()=>{
 const {body}=fixture();body.program.rowEmissionPolicies[0].sourceSha256='unverified';let calls=0;
 const sql={query:async()=>{calls++;throw Error('must not reach SQL');}};
 await assert.rejects(programOperation(sql,principal,session,'command',{key:uid(105),body}),e=>e.status===422);
 assert.equal(calls,0);
});
test('approval still requires an exact reviewed proposal and explicit confirmation',()=>{
 const {body}=fixture(),decision={...body,command:'approve',proposalId:uid(104),proposalSha256:hash('e'),program:null,reviewConfirmed:true};
 assert.deepEqual(ownProgramCommand(decision),decision);
 assert.throws(()=>ownProgramCommand({...decision,reviewConfirmed:false}),e=>e.code==='PROGRAM_INVALID');
 assert.throws(()=>ownProgramCommand({...decision,program:body.program}),e=>e.code==='PROGRAM_INVALID');
});
test('receipt cannot silently alter the proposed definition or attempt',()=>{
 const {body}=fixture(),key=uid(105),changed=structuredClone(body);changed.reason='Changed synthetic reason, not the submitted request';
 assert.throws(()=>ownProgramReceipt(receipt(changed,key),{key,body}),e=>e.code==='PROGRAM_CONTRACT_INVALID');
});
test('approved emission and quantity histories remain immutable',()=>{
 const {body}=fixture(),reduced=structuredClone(body.program);delete reduced.rowEmissionVersion;delete reduced.rowEmissionPolicies;
 assert.throws(()=>ownProgramHistory(body.program,reduced),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
 const stripped=structuredClone(body.program);delete stripped.quantityPhasesVersion;delete stripped.quantityPhases;
 assert.throws(()=>ownProgramHistory(body.program,stripped),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
});
