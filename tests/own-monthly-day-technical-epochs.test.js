// Token callbacks only: no SQL parser, installer, process, database or fixture import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOwnMonthlyDayTechnicalEpochs} from '../scripts/lib/own-monthly-day-technical-epochs.mjs';

const copy=value=>structuredClone(value);
function harness(options={}){
 const state={prior:{oid:190,acl:['owner'],body:'known-source190',rows:['old-programme-history']},stages:{}},before=new Map(),epochs=new Map(),calls=[],phases=[],checks=[],snapshots=[],durabilityCalls=[],proofs={},operations=new Map(),stages={};
 for(const id of[192,193,194,196,197]){
  const local={};for(const kind of['rehearsal','installation','verification','repetition','rollback','rollbackVerification']){local[kind]=[id+':'+kind];operations.set(local[kind][0],{id,kind});}
  const batch={id,beforeCheck:id+':beforeCheck'};operations.set(batch.beforeCheck,{id,kind:'beforeCheck'});stages[id]={local,batch};
 }
 stages[194].batch.declaration=stages[193].batch;
 const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),qa192:stages[192],local193:stages[193].local,local:stages[194].local,batch:stages[194].batch,localFixed:stages[196].local,fixedComposition:stages[196].batch,local197:stages[197].local,novelty197:stages[197].batch,normalized:value=>value};
 const receipt=(id,mode)=>({version:'token-stage'+id,mode,oidEpoch:state.stages[id].oidEpoch,body:'source'+id,acl:['owner']});
 const json=(statements,opts={})=>{
  assert.ok(Array.isArray(statements)&&statements.length===1);const operation=operations.get(statements[0]);calls.push({operation:operation?{...operation}:null,opts:{...opts}});
  if(!operation){assert.deepEqual(statements,['READ_PRIVATE_HELPER_ACL']);assert.equal(opts.readOnly,true);return{days:false,ledger:false};}
  const{id,kind}=operation;
  if(kind==='rehearsal'){assert.equal(opts.end,'ROLLBACK');return{stage:id,rolledBack:true};}
  if(kind==='installation'){
   if(!before.has(id))before.set(id,copy(state));const epoch=(epochs.get(id)??0)+1;epochs.set(id,epoch);
   state.stages[id]={oidEpoch:id===194?1:epoch,body:'source'+id,acl:['owner'],rows:[]};return receipt(id,'install');
  }
  if(kind==='verification'){assert.equal(opts.readOnly,true);return receipt(id,'verify');}
  if(kind==='repetition'){
   if(options.replayError?.stage===id)throw options.replayError.error;
   const result=receipt(id,'verify');if(options.mutateSecondReplayOid===id&&epochs.get(id)===2)state.stages[id].oidEpoch+=100;return result;
  }
  if(kind==='rollback'){
   assert.equal(opts.expectJson,false);
   if(options.historyError?.stage===id)throw options.historyError.error;
   const previous=copy(before.get(id));state.prior=previous.prior;state.stages=previous.stages;
   if(options.corruptPredecessor===id)state.prior.acl.push('unexpected-third-party');return{status:0};
  }
  assert.ok(kind==='beforeCheck'||kind==='rollbackVerification');assert.equal(opts.readOnly,true);assert.equal(opts.expectJson,false);return{status:0};
 };
 const expectRollback=(statements,code)=>{const op=operations.get(statements[0]);assert.equal(op.kind,'installation');assert.equal(code,{194:'MONTHLY194_PHASE_CHANGED',196:'MONTHLY_FIXED_PHASE_CHANGED',197:'NOVELTY197_PHASE_CHANGED'}[op.id]);calls.push({expectedRejection:code,stage:op.id});return{rejected:true,code,status:3};};
 const durability={};for(const[key,id]of[['sql192',192],['sql193',193],['sql194',194],['sql196Days',196],['sql197',197]])durability[key]=({installed,durable,repeated,batch})=>{assert.equal(batch,stages[id].batch);assert.equal(installed.mode,'install');assert.equal(durable.mode,'verify');assert.equal(repeated.mode,'verify');for(const proof of[durable,repeated])for(const field of['version','oidEpoch','body','acl'])assert.deepEqual(proof[field],installed[field]);durabilityCalls.push({key,oidEpoch:installed.oidEpoch});return{passed:true,canonicalFunction:'injected-'+key};};
 const params={qa,json,expectRollback,readFullSnapshot:()=>{const value=copy(state);snapshots.push(copy(value));return value;},check:(value,label)=>{assert.ok(value,label);checks.push(label);},setPhase:value=>phases.push(value),durability,fixedComposition:options.fixedComposition??true,noveltySuccession:options.noveltySuccession??true,proofs,privateHelperAclStatements:['READ_PRIVATE_HELPER_ACL']};
 return{params,state,calls,phases,checks,snapshots,durabilityCalls,proofs,run:()=>verifyOwnMonthlyDayTechnicalEpochs(params)};
}

test('technical epochs preserve predecessor FULL and compare recreated OIDs only inside the same new epoch',()=>{
 const h=harness(),result=h.run();assert.equal(result.passed,true);assert.equal(result.proofs,h.proofs);
 for(const[id,key]of[[196,'sql196Days'],[197,'sql197']]){
  assert.equal(h.proofs[key].installed.oidEpoch,1);assert.equal(h.proofs[key+'Reinstalled'].installed.oidEpoch,2);
  assert.notEqual(h.proofs[key].installed.oidEpoch,h.proofs[key+'Reinstalled'].installed.oidEpoch);
  assert.equal(h.proofs[key+'Reinstalled'].durable.oidEpoch,h.proofs[key+'Reinstalled'].installed.oidEpoch);
  assert.equal(h.proofs[key+'Reinstalled'].repeated.oidEpoch,h.proofs[key+'Reinstalled'].installed.oidEpoch);
 }
 assert.deepEqual(h.state.prior,{oid:190,acl:['owner'],body:'known-source190',rows:['old-programme-history']});
 assert.deepEqual(h.proofs.helperAcl,{days:false,ledger:false});assert.equal(h.checks.length,4);assert.equal(h.durabilityCalls.length,7);
 assert.ok(h.calls.some(c=>c.operation?.id===197&&c.operation.kind==='rollbackVerification'&&c.opts.readOnly));
 assert.deepEqual(h.phases,['192-installation','193-installation','194-installation','196-days-composition-installation','197-rehearsal-rollback','197-installation','197-durable-readonly','197-repetition','197-no-history-reversal','197-reinstallation','197-reinstallation-durable-readonly','197-reinstallation-repetition']);
});

test('the194-only profile never enters196 or197 and retains the same private ACL proof',()=>{
 const h=harness({fixedComposition:false,noveltySuccession:false});assert.equal(h.run().passed,true);assert.deepEqual(h.phases,['192-installation','193-installation','194-installation']);assert.equal(h.durabilityCalls.length,3);assert.equal(h.calls.some(c=>c.operation?.id>=196),false);assert.equal(h.checks.length,2);assert.deepEqual(h.proofs.helperAcl,{days:false,ledger:false});
});

test('a changed predecessor ACL after196 rollback aborts before197 or business',()=>{
 const h=harness({corruptPredecessor:196});let business=0;assert.throws(()=>{h.run();business++;},assert.AssertionError);assert.equal(business,0);assert.equal(h.phases.includes('197-installation'),false);assert.equal(Object.hasOwn(h.proofs,'sql196DaysReinstalled'),false);
});

test('a changed OID during197 repetition within the reinstalled epoch is still rejected',()=>{
 const h=harness({mutateSecondReplayOid:197});let business=0;assert.throws(()=>{h.run();business++;},assert.AssertionError);assert.equal(business,0);assert.equal(h.phases.at(-1),'197-reinstallation-repetition');assert.equal(Object.hasOwn(h.proofs,'helperAcl'),false);
});

test('a replay callback failure propagates its exact cause and prevents later phases or business',()=>{
 const cause=new Error('synthetic native replay cause'),primary=new Error('synthetic replay rejected',{cause}),h=harness({replayError:{stage:194,error:primary}});let business=0;
 assert.throws(()=>{h.run();business++;},error=>error===primary&&error.cause===cause);assert.equal(business,0);assert.equal(h.phases.includes('196-days-composition-installation'),false);assert.equal(Object.hasOwn(h.proofs,'helperAcl'),false);
});

test('history refusing196 reversal propagates unchanged and never reinstalls or enters business',()=>{
 const cause=new Error('synthetic protected history'),primary=new Error('synthetic history prevents rollback',{cause}),h=harness({historyError:{stage:196,error:primary}});let business=0;
 assert.throws(()=>{h.run();business++;},error=>error===primary&&error.cause===cause);assert.equal(business,0);assert.equal(h.calls.filter(c=>c.operation?.id===196&&c.operation.kind==='installation').length,1);assert.equal(h.phases.includes('197-installation'),false);assert.equal(Object.hasOwn(h.proofs,'sql196DaysReinstalled'),false);
});
