// Adopted from the reviewed Claude receipt-preparer forward proposal.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildOwnReceiptPreparerAccessInstallation,OWN_RECEIPT_PREPARER_ACCESS_PINS,OWN_RECEIPT_PREPARER_ACCESS_EDITS} from '../scripts/lib/own-receipt-preparer-access-installation.mjs';
import {OWN_RECEIPT_NOMINAL,OWN_RECEIPT_PREPARER,OWN_RECEIPT_REVIEW_READ,ownReceiptModuleAccess} from '../assets/own-payroll-receipt-access.js';
import {OWN_RECEIPT_READ,OWN_RECEIPT_APPROVE,OWN_RECEIPT_SELF} from '../assets/own-payroll-receipt-model.js';
import {OWN_RUN_NOMINAL} from '../assets/own-payroll-run-workspace-model.js';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
import {receiptCommand,receiptEvent} from './fixtures/own-payroll-receipt-synthetic.js';import {uid} from './fixtures/own-payroll-program-synthetic.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sorted=v=>[...v].sort();

test('compositor: sólo dos cuerpos privados de SQL126, preimagen exacta y superficie cerrada',()=>{
 const plan=buildOwnReceiptPreparerAccessInstallation({read});
 assert.equal(plan.statements.length,4);assert.equal(plan.executes,false);assert.equal(plan.connects,false);
 assert.deepEqual(plan.functions.map(f=>f.name),['own_receipt_context_v1','own_receipt_batch_value_v1']);
 assert.equal(plan.statements.filter(s=>/^CREATE OR REPLACE FUNCTION public\.own_receipt_(context|batch_value)_v1\(/.test(s)).length,2);
 assert.ok(plan.statements[0].startsWith('DO $receipt_access_pre$')&&plan.statements[3].startsWith('DO $receipt_access_post$'));
 const context=plan.statements[1];assert.equal(context.includes('own_close_context_v1'),false);assert.ok(context.includes('public.own_run_context_v1(p,true,false)'));
 assert.ok(context.includes("IF operation='self' THEN"));assert.equal(plan.statements.join('\n').match(/\bGRANT\b|\bREVOKE\b/g),null);
 assert.equal(plan.statementsSha256,buildOwnReceiptPreparerAccessInstallation({read}).statementsSha256,'determinista');
});
test('compositor: cualquier byte ajeno en SQL126 detiene la composición',()=>{
 const original=read(OWN_RECEIPT_PREPARER_ACCESS_PINS.source126.path);
 const mutated=original.replace("OWN_RECEIPT_INPUT_INVALID';END IF;\n IF operation='self'","OWN_RECEIPT_INPUT_INVALID'; END IF;\n IF operation='self'");
 assert.notEqual(mutated,original);assert.throws(()=>buildOwnReceiptPreparerAccessInstallation({read:file=>file===OWN_RECEIPT_PREPARER_ACCESS_PINS.source126.path?mutated:read(file)}));
 for(const edit of Object.values(OWN_RECEIPT_PREPARER_ACCESS_EDITS))assert.equal(original.split(edit.old).length-1,1);
});
test('predicado: preparador sin aprobar liquidaciones; revisor conserva el acceso anterior; lector nominal no entra',()=>{
 assert.deepEqual(OWN_RECEIPT_NOMINAL,[...OWN_RUN_NOMINAL]);
 assert.deepEqual(sorted(OWN_RECEIPT_REVIEW_READ),sorted(OWN_RECEIPT_READ),'el acceso histórico del revisor no cambia');
 for(const cap of ['payroll.calculation.approve','payroll.calculation.prepare','payroll.calculation.close','payroll.receipt.approve','payroll.receipt.self.read'])assert.equal(OWN_RECEIPT_PREPARER.includes(cap),false,cap);
 assert.equal(ownReceiptModuleAccess(new Set(OWN_RECEIPT_PREPARER)),true);assert.equal(ownReceiptModuleAccess([...OWN_RECEIPT_PREPARER]),true);
 assert.equal(ownReceiptModuleAccess(new Set(OWN_RECEIPT_APPROVE)),true);assert.equal(ownReceiptModuleAccess(new Set(OWN_RECEIPT_NOMINAL)),false);
 assert.equal(ownReceiptModuleAccess(new Set(OWN_RECEIPT_SELF)),false);
 for(const cap of OWN_RECEIPT_NOMINAL)assert.equal(ownReceiptModuleAccess(new Set(OWN_RECEIPT_PREPARER.filter(c=>c!==cap))),false,cap);
});

const p={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:[]}},session={email:p.user.email,id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const post=payload=>({method:'POST',url:'/api/internal-own-payroll-receipts',query:{},headers:{origin:'http://localhost:8080','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'command',payload})});
const list=()=>({method:'GET',url:'/api/internal-own-payroll-receipts?resource=list&period=2026-10',query:{resource:'list',period:'2026-10'},headers:{accept:'application/json'}});
const res=()=>({headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
function setup(caps,value){const calls=[],stats={connect:0},options=[];const handler=createOwnReceiptHandler({env:{INTERNAL_APP_ORIGIN:'http://localhost:8080'},requireAccess:async(_req,_res,o)=>{options.push(o);return{mode:'managed',principal:{...p,tenant:{...p.tenant,effectiveCapabilities:caps}}};},sessionFor:()=>session,getSql:async()=>{stats.connect++;return{query:async(q,v)=>{calls.push({q,v});return[{result:value}];}};}});return{handler,calls,stats,options};}
const emptyList={version:'own-receipt-list.v1',scopeVersion:'a'.repeat(64),period:'2026-10',items:[]};
const PREPARER=['actions.read',...OWN_RECEIPT_PREPARER];

test('API: el preparador sin calculation.approve lee y prepara; la puerta del gateway pide sólo la base nominal',async()=>{
 const read=setup(PREPARER,emptyList),r=res();await read.handler(list(),r);
 assert.equal(r.statusCode,200);assert.match(read.calls[0].q,/own_receipt_list_v1/);assert.deepEqual(read.options[0].requiredCapabilities,OWN_RECEIPT_NOMINAL);
 const prepare=setup(PREPARER,receiptEvent()),w=res();await prepare.handler(post(receiptCommand()),w);
 assert.equal(w.statusCode,201);assert.match(prepare.calls[0].q,/own_receipt_command_v1/);
});
test('API: el preparador no aprueba ni retira, sin conectar',async()=>{
 for(const command of ['approve','withdraw']){
  const a=setup(PREPARER,receiptEvent()),r=res();await a.handler(post({...receiptCommand(),command,params:null,batchId:uid(60),batchSha256:'a'.repeat(64),reviewConfirmed:true}),r);
  assert.equal(r.statusCode,403,command);assert.equal(r.body.code,'OWN_RECEIPT_FORBIDDEN');assert.equal(a.stats.connect,0);
 }
});
test('API: lector nominal sin recibos ni aprobación, o autoservicio, no lee el módulo ni conecta',async()=>{
 for(const caps of [['actions.read',...OWN_RECEIPT_NOMINAL],[...OWN_RECEIPT_SELF]]){const a=setup(caps,emptyList),r=res();await a.handler(list(),r);assert.equal(r.statusCode,403);assert.equal(a.stats.connect,0);}
});
test('API: revisor histórico conserva lectura',async()=>{const a=setup(['actions.read',...OWN_RECEIPT_APPROVE],emptyList),r=res();await a.handler(list(),r);assert.equal(r.statusCode,200);});
