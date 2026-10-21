// Injected finite callbacks only. No SQL execution, IAM adapter, HTTP listener,
// schema builder or calculation; future native209 tests prove server authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ownAnnulPreparationOperation,annulPreparationError} from '../lib/internal-own-payroll-annulment-preparation.js';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {syntheticAnnulPreparation,prepUuid,prepHash,sealPreparation} from './fixtures/own-payroll-annulment-preparation-synthetic.js';

const actor=()=>({principal:{user:{email:'third-preparer@example.invalid'},tenant:{source:'membership',id:prepUuid(50),membershipId:prepUuid(51),effectiveCapabilities:[...OWN_RUN_PREPARE]}},session:{email:'third-preparer@example.invalid',id:prepUuid(52),version:1,releaseSha:'d'.repeat(40)}});
const bootstrap=value=>({version:'own-payroll-bootstrap.v2',scopeVersion:value.scopeVersion,programVersion:prepHash('Invented current approved programme'),canCalculate:true,runs:[],complete:true});
function callbacks(value,{before=bootstrap(value),after=bootstrap(value),onCall=()=>{}}={}){
 const calls=[];
 return{calls,sql:{query:async(statement,values)=>{
  calls.push({statement,values});onCall(calls.length,statement,values);
  if(statement==='SELECT public.own_run_bootstrap_v2($1::jsonb) AS result')return[{result:structuredClone(calls.length===1?before:after)}];
  assert.ok(['SELECT public.own_annul_preparation_v1($1::jsonb,$2::uuid) AS result','SELECT public.own_annul_preparation_full_v1($1::jsonb,$2::uuid) AS result'].includes(statement));
  return{rows:[{result:structuredClone(value)}]};
 }}};
}
const read=(c,a,value,fullJson=false)=>ownAnnulPreparationOperation(c.sql,a.principal,a.session,'detail',{id:value.source.id},{fullJson});
for(const fullJson of [false,true])for(const receiptVersion of ['own-annul-receipt.v1','own-annul-receipt.v2'])test('prepare projection '+receiptVersion+' '+(fullJson?'full32':'normal4')+' keeps foreign creator provenance and all dates under the third preparer',async()=>{
 const value=syntheticAnnulPreparation({receiptVersion}),a=actor(),c=callbacks(value);
 assert.ok(!a.principal.tenant.effectiveCapabilities.includes('payroll.calculation.approve'));
 const result=await read(c,a,value,fullJson);
 assert.deepEqual(result,value);assert.equal(result.affected.length,6);assert.equal(result.runs.length,3);assert.equal(result.dateGroups[0].liquidationDate,null);assert.ok(Object.isFrozen(result));
 assert.ok(result.runs.every(run=>run.creatorScopeVersion!==result.scopeVersion));
 assert.equal(c.calls.length,3);assert.equal(c.calls[0].statement,c.calls[2].statement);
 assert.equal(c.calls[1].statement,fullJson?'SELECT public.own_annul_preparation_full_v1($1::jsonb,$2::uuid) AS result':'SELECT public.own_annul_preparation_v1($1::jsonb,$2::uuid) AS result');
 assert.equal(c.calls[1].values[1],value.source.id);
 for(const call of c.calls){const ctx=JSON.parse(call.values[0]);assert.equal(ctx.actorEmail,a.principal.user.email);assert.equal(ctx.membershipId,a.principal.tenant.membershipId);assert.equal(ctx.actorSessionId,a.session.id);assert.equal(ctx.actorSessionVersion,1);assert.equal(ctx.releaseSha,a.session.releaseSha);assert.equal(Object.hasOwn(ctx,'actorPersonId'),false);assert.equal(call.values[0],c.calls[0].values[0]);}
 assert.ok(c.calls.every(call=>!/(?:command|complete|capture|attempt|liquidation_detail)/.test(call.statement)));
});
test('every prepare and nominal capability is required before any service query',async()=>{
 for(const cap of OWN_RUN_PREPARE){const value=syntheticAnnulPreparation(),a=actor(),c=callbacks(value);a.principal.tenant.effectiveCapabilities=a.principal.tenant.effectiveCapabilities.filter(item=>item!==cap);await assert.rejects(read(c,a,value),error=>error.code==='OWN_ANNUL_PREPARATION_FORBIDDEN'&&error.status===403,cap);assert.equal(c.calls.length,0);}
});
test('projection retains descriptive own employee numbers rather than applying the numeric GRH code grammar',async()=>{
 const value=syntheticAnnulPreparation(),a=actor();value.affected[0].employeeNumber='OWN-ALPHA-'+String.fromCodePoint(0x1f7e2).repeat(54);sealPreparation(value);const c=callbacks(value),result=await read(c,a,value);assert.equal([...result.affected[0].employeeNumber].length,64);assert.equal(result.affected[0].employeeNumber,value.affected[0].employeeNumber);assert.equal(c.calls.length,3);
});
test('service accepts only detail with a closed UUID reference before queries',async()=>{
 for(const [operation,input]of[['command',{id:prepUuid(900)}],['attempt',{id:prepUuid(900)}],['detail',{id:'bad'}],['detail',{id:prepUuid(900),key:prepUuid(1)}]]){const value=syntheticAnnulPreparation(),a=actor(),c=callbacks(value);await assert.rejects(ownAnnulPreparationOperation(c.sql,a.principal,a.session,operation,input),error=>error.status===400);assert.equal(c.calls.length,0);}
});
test('an input reference cannot change while the first bootstrap is pending',async()=>{
 const value=syntheticAnnulPreparation(),a=actor(),input={id:value.source.id},c=callbacks(value,{onCall:n=>{if(n===1)input.id=prepUuid(999);}}),result=await ownAnnulPreparationOperation(c.sql,a.principal,a.session,'detail',input);assert.equal(result.source.id,value.source.id);assert.equal(c.calls[1].values[1],value.source.id);
});
test('the first bootstrap must be complete current v2 with canCalculate',async()=>{
 for(const mutate of [v=>v.version='own-payroll-bootstrap.v1',v=>v.complete=false,v=>v.canCalculate=false,v=>v.runs=[{id:prepUuid(100)}]]){
  const value=syntheticAnnulPreparation(),a=actor(),before=bootstrap(value);mutate(before);const c=callbacks(value,{before});await assert.rejects(read(c,a,value),error=>[403,503].includes(error.status));assert.equal(c.calls.length,1);
 }
});
test('a mismatched DTO scope or event id fails without a borrowed context or fallback',async()=>{
 for(const mutate of [v=>v.scopeVersion=prepHash('Other active scope'),v=>v.source.id=prepUuid(901)]){
  const value=syntheticAnnulPreparation(),a=actor(),before=bootstrap(value),id=value.source.id;mutate(value);sealPreparation(value);const c=callbacks(value,{before});await assert.rejects(ownAnnulPreparationOperation(c.sql,a.principal,a.session,'detail',{id}),error=>error.code==='OWN_ANNUL_PREPARATION_CONTRACT_INVALID'&&error.status===503);assert.equal(c.calls.length,2);
 }
});
test('the last affected row in an unselected date is checked before returning any projection',async()=>{
 const value=syntheticAnnulPreparation(),a=actor();value.affected.at(-1).state='confirmed';sealPreparation(value);const c=callbacks(value);await assert.rejects(read(c,a,value),error=>error.status===503);assert.equal(c.calls.length,2);
});
test('current scope or canCalculate revocation after the async digest prevents delivery',async()=>{
 for(const mutate of [v=>v.scopeVersion=prepHash('Changed current scope'),v=>v.canCalculate=false]){
  const value=syntheticAnnulPreparation(),a=actor(),after=bootstrap(value);mutate(after);const c=callbacks(value,{after});await assert.rejects(read(c,a,value),error=>[403,409].includes(error.status));assert.equal(c.calls.length,3);
 }
});
test('principal capabilities and actual session context are rechecked at the last boundary',async()=>{
 for(const mutate of [a=>a.principal.tenant.membershipId=prepUuid(99),a=>a.principal.tenant.effectiveCapabilities=[]]){
  const value=syntheticAnnulPreparation(),a=actor(),c=callbacks(value,{onCall:n=>{if(n===3)mutate(a);}});await assert.rejects(read(c,a,value),error=>[403,409].includes(error.status));assert.equal(c.calls.length,3);
 }
});
test('a malformed final bootstrap cannot authorize delivery',async()=>{
 const value=syntheticAnnulPreparation(),a=actor(),after={...bootstrap(value),complete:false},c=callbacks(value,{after});await assert.rejects(read(c,a,value),error=>error.status===503);assert.equal(c.calls.length,3);
});
test('the complete normal response is rejected above4MiB and is preserved by full32',async()=>{
 const value=syntheticAnnulPreparation(),runs=Array.from({length:1000},(_,n)=>({...value.runs[0],id:prepUuid(100+n),resultSha256:prepHash(['Invented result',n]),employeeCount:10,conceptRowCount:20})),rows=Array.from({length:10000},(_,n)=>({...value.affected[0],runId:runs[Math.floor(n/10)].id,resultSha256:runs[Math.floor(n/10)].resultSha256,contractId:prepUuid(10000+n),employeeNumber:'999999999',agreementCode:'999999999',departmentCode:'999999999',version:Number.MAX_SAFE_INTEGER,liquidationVersion:Number.MAX_SAFE_INTEGER}));
 value.runs=runs;value.affected=rows;value.dateGroups=[{liquidationDate:null,count:10000}];sealPreparation(value);
 assert.ok(Buffer.byteLength(JSON.stringify({ok:true,data:value}))>4*1024*1024);assert.ok(Buffer.byteLength(JSON.stringify({ok:true,data:value}))<OWN_RUN_FULL_MAX_BYTES);
 const a=actor(),normal=callbacks(value);await assert.rejects(read(normal,a,value),error=>error.code==='OWN_ANNUL_PREPARATION_LIMIT'&&error.status===422);assert.equal(normal.calls.length,2);
 const full=callbacks(value),result=await read(full,a,value,true);assert.equal(result.affected.length,10000);assert.deepEqual(result,value);assert.equal(full.calls.length,3);
});
test('the full profile rejects an oversized envelope before model verification with no partial response',async()=>{
 const value=syntheticAnnulPreparation(),a=actor();value.unexpectedPrivateBytes='x'.repeat(OWN_RUN_FULL_MAX_BYTES);const c=callbacks(value);await assert.rejects(read(c,a,value,true),error=>error.code==='OWN_ANNUL_PREPARATION_LIMIT'&&error.status===422);assert.equal(c.calls.length,2);
});
test('the five SQL209 errors keep only their explicit safe status and message',async()=>{
 for(const [code,status]of[['NOT_FOUND',404],['SOURCE_CHANGED',409],['CURRENT_STATE_CHANGED',409],['FORBIDDEN',403],['CONTRACT_INVALID',503]]){
  const value=syntheticAnnulPreparation(),a=actor(),c=callbacks(value,{onCall:n=>{if(n===2)throw Error('OWN_ANNUL_PREPARATION_'+code+' PRIVATE_SQL_SENTINEL');}});await assert.rejects(read(c,a,value),error=>error.code==='OWN_ANNUL_PREPARATION_'+code&&error.status===status&&!error.message.includes('PRIVATE_SQL_SENTINEL'));assert.equal(c.calls.length,2);
 }
});
test('session invalidity is401 and unknown database details remain503 without private text',async()=>{
 for(const message of ['ACTION_SESSION_INVALID PRIVATE_SQL_SENTINEL','NATIVE_EMPLOYEE_SESSION_INVALID PRIVATE_SQL_SENTINEL','TENANT_IAM_SESSION_INVALID PRIVATE_SQL_SENTINEL','XX000 PRIVATE_SQL_SENTINEL']){
  const value=syntheticAnnulPreparation(),a=actor(),c=callbacks(value,{onCall:()=>{throw Error(message);}});await assert.rejects(read(c,a,value),error=>error.status===(message.startsWith('XX000')?503:401)&&!error.message.includes('PRIVATE_SQL_SENTINEL'));assert.equal(c.calls.length,1);
 }
 assert.equal(annulPreparationError(Object.assign(Error('private'),{code:'OWN_ANNUL_PREPARATION_CONTENT_CHANGED'})).status,503);
});


for(const at of [1,3])test('bootstrap permission and capacity errors retain their safe status at read'+at,async()=>{
 for(const [message,code,status]of [['OWN_RUN_FORBIDDEN','FORBIDDEN',403],['OWN_RUN_LIMIT','LIMIT',422]]){
  const value=syntheticAnnulPreparation(),a=actor(),c=callbacks(value,{onCall:n=>{if(n===at)throw Error(message+' PRIVATE_BOOTSTRAP_SENTINEL');}});
  await assert.rejects(read(c,a,value),error=>error.code==='OWN_ANNUL_PREPARATION_'+code&&error.status===status&&!error.message.includes('PRIVATE_BOOTSTRAP_SENTINEL'));
  assert.equal(c.calls.length,at);
 }
});
