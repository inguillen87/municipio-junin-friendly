// Technical fixture only. This does not attest a genuine SDK or Neon destination.
import assert from 'node:assert/strict';
import {ACTION_RUNTIME_ROLE,ACTION_RUNTIME_IDENTITY_SQL,recordActionRuntimeIdentity,assertActionRuntimeDestination} from './action-runtime-identity.mjs';
import {RECEIPT_ACTIONS_TARGET_ENV} from './receipt-runtime-binding.mjs';
import {qaLiteral as q} from '../../../scripts/lib/own-payroll-durable-qa.mjs';

export function createReceiptRuntimeQa({db,schema,queryFactory}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(typeof db?.run,'function');assert.ok(Array.isArray(db.args));
 const arg=key=>{assert.equal(db.args.filter(v=>v===key).length,1);return db.args[db.args.indexOf(key)+1];};
 assert.equal(arg('-h'),'127.0.0.1');assert.equal(arg('-d'),'own_payroll_run_qa');assert.equal(arg('-U'),'postgres');
 const port=arg('-p');assert.ok(['55417','55418'].includes(port));const major=port==='55417'?17:18;
 assert.equal(typeof db.prefix,'string');assert.ok(db.prefix.includes('DO $destination$ BEGIN')&&db.prefix.includes('SET LOCAL search_path='+schema+','));
 // Expected values are the declared synthetic fixture configuration, never copied from SELECT results.
 const target=Object.freeze({major,projectId:'synthetic-fixture-only',branchId:'synthetic-loopback-pg'+major,endpointId:'synthetic-session-auth-pg'+major,database:'own_payroll_run_qa',role:ACTION_RUNTIME_ROLE});
 const expectedDestination=Object.freeze(Object.fromEntries(Object.entries(target).filter(([key])=>key!=='role')));
 const localScope='SET LOCAL SESSION AUTHORIZATION '+ACTION_RUNTIME_ROLE+'; SELECT set_config(\'neon.project_id\','+q(target.projectId)+',true),set_config(\'neon.branch_id\','+q(target.branchId)+',true),set_config(\'neon.endpoint_id\','+q(target.endpointId)+',true);';
 const run=async(statement,runtime=true)=>{assert.equal(runtime,true);return db.run(localScope+'\n'+statement,true);};
 const defaultQuery=async(query,values)=>{
  assert.ok(Array.isArray(values));
  const rendered=query.replaceAll('public.own_receipt_',schema+'.own_receipt_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});
  return[{result:await run(rendered,true)}];
 };
 assert.ok(queryFactory===undefined||typeof queryFactory==='function');
 const businessQuery=queryFactory?queryFactory(run):defaultQuery;assert.equal(typeof businessQuery,'function');
 const sql={query:async(query,values)=>{
  if(query===ACTION_RUNTIME_IDENTITY_SQL){
   assert.ok(values===undefined||Array.isArray(values)&&values.length===0);
   return run("SELECT coalesce(jsonb_agg(to_jsonb(qa_identity)),'[]'::jsonb) FROM ("+ACTION_RUNTIME_IDENTITY_SQL+") qa_identity",true);
  }
  assert.match(query,/^SELECT public\.own_receipt_(?:preview|list|batch|attempt|command|self)_v1\([\s\S]+\) AS result$/);
  return businessQuery(query,values);
 }};
 return Object.freeze({
  env:Object.freeze({[RECEIPT_ACTIONS_TARGET_ENV]:JSON.stringify(target)}),
  getSql:async(_env,options)=>{
   assert.deepEqual(options,{expectedDestination});
   const rows=await sql.query(ACTION_RUNTIME_IDENTITY_SQL);assert.ok(Array.isArray(rows)&&rows.length===1);
   recordActionRuntimeIdentity(sql,rows[0]);assertActionRuntimeDestination(sql,expectedDestination);return sql;
  }
 });
}
