import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import * as lifecycle from '../scripts/lib/native-family-self-fixture-lifecycle-qa.mjs';
const holder={pid:139,applicationName:'owner184-serialization-holder',backendStart:'2026-10-17T17:57:19.326664Z',role:'postgres',database:'own_payroll_run_qa'};
const finishKey='native-employment-catalog:qa-finished:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const absent=()=>({holder:{...holder},backendAbsent:true,otherClients:0});
const signalProof=()=>({...absent(),clientExit:{code:0,signal:null}});
const read=file=>fs.readFileSync(path.resolve(import.meta.dirname,'..',file),'utf8');

// This is the causal regression: before the patch the real drain helper ignores
// the completion callback, so an early principal failure leaves its holder
// unresolved and produces FAMILY195_HOLDER_DRAIN_TIMEOUT. No fake SQL engine.
test('failure completion cooperatively releases the holder before real exit and independent absence',async()=>{
 let finishHolder,finishSignal;const calls=[],completion=new Promise(resolve=>finishHolder=resolve),signaler=new Promise(resolve=>finishSignal=resolve);
 const pending=lifecycle.drainNativeFamilySerializationHolder({holder,completion,timeoutMs:100,
  completeFailure:async expected=>{calls.push('signal');assert.deepEqual(expected,holder);assert.ok(Object.isFrozen(expected));queueMicrotask(()=>{calls.push('holder exit');finishHolder({code:0,signal:null});calls.push('signal exit');finishSignal(signalProof());});return signaler;},
  observeAbsent:async expected=>{calls.push('fresh absence');assert.deepEqual(expected,holder);return absent();},
 });
 const result=await pending;assert.deepEqual(calls,['signal','holder exit','signal exit','fresh absence']);assert.deepEqual(result.clientExit,{code:0,signal:null});assert.deepEqual(result.failureCompletion,signalProof());assert.equal(result.backendAbsent,true);
});
test('normal completion has no failure signal and still requires independent absence',async()=>{
 let observed=0;const result=await lifecycle.drainNativeFamilySerializationHolder({holder,completion:Promise.resolve({code:0,signal:null}),observeAbsent:async()=>{observed++;return absent();}});assert.equal(observed,1);assert.equal(Object.hasOwn(result,'failureCompletion'),false);
});
for(const [label,patch]of [['PID',{holder:{...holder,pid:140}}],['backend start',{holder:{...holder,backendStart:'2026-10-17T17:57:19.326665Z'}}],['database',{holder:{...holder,database:'other_db'}}],['other client',{otherClients:1}],['active holder',{backendAbsent:false}],['signaler exit',{clientExit:{code:3,signal:null}}],['signaler signal',{clientExit:{code:null,signal:'SIGTERM'}}]])test('failure signal rejects '+label+' before trusting holder completion or observing absence',async()=>{
 let observed=0;await assert.rejects(lifecycle.drainNativeFamilySerializationHolder({holder,completion:Promise.resolve({code:0,signal:null}),completeFailure:async()=>({...signalProof(),...patch}),observeAbsent:async()=>{observed++;return absent();}}));assert.equal(observed,0);
});
test('one bounded drain includes failure signaling, both exits and the final absence proof',async()=>{
 let observed=0,finishSignal;const signaler=new Promise(resolve=>finishSignal=resolve);
 await assert.rejects(lifecycle.drainNativeFamilySerializationHolder({holder,completion:Promise.resolve({code:0,signal:null}),completeFailure:()=>signaler,observeAbsent:async()=>{observed++;return absent();},timeoutMs:5}),/FAMILY195_HOLDER_DRAIN_TIMEOUT/);
 finishSignal(signalProof());await new Promise(resolve=>queueMicrotask(resolve));assert.equal(observed,0,'expired protocol may not start another native observation');
});
test('a failed completion callback propagates unchanged and never authorizes cleanup by absence',async()=>{
 const original=Error('original cooperative client failure');let observed=false;await assert.rejects(lifecycle.drainNativeFamilySerializationHolder({holder,completion:Promise.resolve({code:0,signal:null}),completeFailure:async()=>{throw original;},observeAbsent:async()=>{observed=true;return absent();}}),error=>error===original);assert.equal(observed,false);
});
test('synchronous callback work cannot evade the one monotonic drain deadline',async()=>{
 let observed=false;await assert.rejects(lifecycle.drainNativeFamilySerializationHolder({holder,completion:Promise.resolve({code:0,signal:null}),timeoutMs:1,completeFailure:async()=>{const until=performance.now()+3;while(performance.now()<until){}return signalProof();},observeAbsent:async()=>{observed=true;return absent();}}),/FAMILY195_HOLDER_DRAIN_TIMEOUT/);assert.equal(observed,false);
});
test('failure SQL holds the exact generated finish key until the complete backend tuple is absent',()=>{
 const sql=lifecycle.nativeFamilyHolderFailureSignalSql(holder,finishKey),lock=sql.indexOf('pg_advisory_xact_lock(hashtextextended(\''+finishKey+'\',0))'),refresh=sql.indexOf('pg_stat_clear_snapshot()'),absence=sql.indexOf('EXIT WHEN NOT EXISTS');
 assert.ok(lock>=0&&refresh>lock&&absence>refresh);for(const value of ['pid=139',holder.backendStart,holder.applicationName,"usename='postgres'","datname='own_payroll_run_qa'","backend_type='client backend'","interval '40 seconds'",'FAMILY195_FAILURE_SIGNAL_OTHER_CLIENTS',lifecycle.nativeFamilyHolderAbsenceSql(holder)])assert.ok(sql.includes(value),value);
 assert.equal((sql.match(/pg_advisory_xact_lock/g)??[]).length,1);assert.doesNotMatch(sql,/pg_advisory_unlock|pg_(?:terminate|cancel)_backend|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|REVOKE)\b/i);
});
test('failure SQL refuses a substituted key or incomplete holder before constructing any command',()=>{
 for(const key of [null,undefined,'1','native-employment-catalog:qa-finished:'+"a';SELECT 1;--",'other:'+finishKey])assert.throws(()=>lifecycle.nativeFamilyHolderFailureSignalSql(holder,key));
 for(const key of Object.keys(holder)){const value={...holder};delete value[key];assert.throws(()=>lifecycle.nativeFamilyHolderFailureSignalSql(value,finishKey));}
});
function callbackEnvironment({preserved=true}={}){
 const source=read('scripts/verify-native-family-self-durable.mjs'),start=source.indexOf('const completeFailedHolder='),end=source.indexOf('\n  };',start);assert.ok(start>=0&&end>start);const expression=source.slice(start+'const completeFailedHolder='.length,end)+'\n  }';
 const primary=Error('preserved principal phase failure'),client=new EventEmitter(),calls=[],writes=[],connections=[];client.stdout=new EventEmitter();client.stderr=new EventEmitter();client.stdin=new EventEmitter();client.stdin.end=(sql,encoding)=>{calls.push({sql,encoding});};client.kill=()=>assert.fail('cooperative completion must not kill');
 const env={assert,primaryFailure:primary,failures:preserved?[primary]:[],holderIdentity:holder,identity:{pinned:true},qa:{schema:'mc_qa_fixed_092_'+'a'.repeat(32),regression:{finishKey}},closure:{frozen:true},connections,nativeFamilyHolderFailureSignalSql:lifecycle.nativeFamilyHolderFailureSignalSql,
  ownerAdoptionQaDestinationGuard:(identity,options)=>{assert.deepEqual(identity,{pinned:true});assert.deepEqual(options,{allowedClient:{pid:holder.pid,applicationName:holder.applicationName,backendStart:holder.backendStart}});return 'UNCHANGED_EXACT_DESTINATION_GUARD';},
  ownerDecisionQaTransaction:options=>{assert.equal(options.pins,'UNCHANGED_EXACT_DESTINATION_GUARD');assert.equal(options.readOnly,true);assert.equal(options.end,'ROLLBACK');assert.equal(options.statements.length,1);return 'EXACT_READ_ONLY_GUARD;'+options.statements[0]+';ROLLBACK;';},
  assertOwnerAuthorityQaSourceBookend:value=>{assert.deepEqual(value,{frozen:true});calls.push('source bookend');},connection:{runtime:{executable:'inert-fake-psql',environment:{}},args:['--synthetic']},
  spawn:(executable,args,options)=>{assert.equal(executable,'inert-fake-psql');assert.deepEqual(args,['--synthetic','-f','-']);assert.equal(options.windowsHide,true);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);assert.equal(Object.hasOwn(options,'timeout'),false);assert.equal(options.env.PGAPPNAME,'family195-failure-completion');calls.push('spawn');return client;},
  saveNative:(sql,result)=>{writes.push({sql,result});},
 };
 return{env,client,calls,writes,primary,callback:new Function('env','with(env){return ('+expression+');}')(env)};
}
test('actual runner failure callback preserves primary first, pins the holder and waits for native exit plus pipe close',async()=>{
 const r=callbackEnvironment(),pending=r.callback(holder);let resolved=false;pending.then(()=>resolved=true);assert.deepEqual(r.calls.slice(0,2),['source bookend','spawn']);assert.ok(r.calls[2].sql.includes('EXACT_READ_ONLY_GUARD'));assert.equal(r.calls[2].encoding,'utf8');assert.equal(r.env.failures[0],r.primary);
 r.client.stdout.emit('data',JSON.stringify({pid:140,backendStart:'2026-10-17T17:57:19.999999Z'})+'\n'+JSON.stringify(absent())+'\n');r.client.emit('exit',0,null);await Promise.resolve();assert.equal(resolved,false,'exit proof does not invent drained output');r.client.emit('close',0,null);const proof=await pending;assert.deepEqual(proof,signalProof());assert.equal(r.writes.length,1);assert.equal(r.writes[0].result.status,0);assert.equal(r.env.connections.length,1);
});
test('actual runner callback refuses unpreserved principal error before creating a native client',()=>{
 const r=callbackEnvironment({preserved:false});assert.throws(()=>r.callback(holder),/FAMILY195_PRIMARY_FAILURE_NOT_PRESERVED/);assert.deepEqual(r.calls,[]);assert.equal(r.writes.length,0);
});
test('actual runner callback does not accept pipe closure without a real child exit receipt',async()=>{
 const r=callbackEnvironment(),pending=r.callback(holder);r.client.emit('close',0,null);await assert.rejects(pending,/FAMILY195_FAILURE_SIGNAL_EXIT_MISSING/);assert.equal(r.writes.length,0);
});
for(const stream of ['stdin','stdout','stderr'])test('actual runner callback preserves '+stream+' error instead of leaving an unhandled event',async()=>{
 const r=callbackEnvironment(),pending=r.callback(holder),error=Error('synthetic '+stream+' error');r.client[stream].emit('error',error);await assert.rejects(pending,value=>value===error);assert.equal(r.writes.length,0);
});
test('failure completion uses the normal catalog completion key without changing its normal lock protocol',()=>{
 const catalog=read('scripts/verify-native-employment-catalog-sql.mjs'),runner=read('scripts/verify-native-family-self-durable.mjs');assert.ok(catalog.includes("finishKey='native-employment-catalog:qa-finished:'+randomUUID(),finishLock='hashtextextended('+q(finishKey)+',0)'"));assert.ok(catalog.includes('return {...base,sql,lockSql,finishKey,report,qaFoundation:'));assert.ok(catalog.includes("IF NOT pg_try_advisory_lock(\"+finishLock+\") THEN EXIT; END IF; PERFORM pg_advisory_unlock(\"+finishLock+\")"));assert.ok(runner.includes('completeFailure:primaryFailure?completeFailedHolder:undefined'));assert.ok(runner.includes("'tests/native-family-self-holder-error-completion.test.js'"));
});
