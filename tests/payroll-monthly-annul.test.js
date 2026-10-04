import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {monthlyAnnulBatch,monthlyAnnulBootstrap,monthlyAnnulDetail,monthlyAnnulPlan,monthlyAnnulReviewPlan,monthlyAnnulUnchanged,monthlyAnnulAttempt,monthlyAnnulReceipt,monthlyAnnulCommand} from '../assets/payroll-monthly-annul-model.js';
import {createInternalPayrollMonthlyAnnulHandler} from '../api/internal-payroll-monthly-annul.js';
import {buildMonthlyAnnulQa} from '../scripts/verify-monthly-approved-annulments-sql.mjs';
import {approved,candidate,bootstrap,proposal,receipt,id,scope} from './fixtures/payroll-monthly-annul-synthetic.js';
const reason='Rectificación administrativa sintética completa';
test('complete review preserves 26 batches and all 793 exact native/historical rows across pages',()=>{
 const details=Array.from({length:26},(_,i)=>candidate(approved(i,60,i%2===1)));
 assert.equal(monthlyAnnulBootstrap(bootstrap(details.map(d=>d.items[0].batch))).candidates.length,26);
 const plan=monthlyAnnulPlan(details.reverse(),scope,reason);assert.equal(plan.items.length,26);assert.equal(plan.items.reduce((n,i)=>n+i.batch.rowCount,0),793);
 assert.equal(plan.items[0].batch.rows[0].amountCents,null);assert.equal(plan.items[0].batch.rows[1].amountCents,'0');assert.equal(plan.items[0].batch.rows[2].amountCents,'9223372036854775807');
 assert.ok(Object.isFrozen(plan.items[0].batch.rows));assert.equal(monthlyAnnulUnchanged(plan,details),true);
});
test('global batch and row limits never truncate or split a selected batch',()=>{
 assert.throws(()=>monthlyAnnulPlan(Array.from({length:101},(_,i)=>candidate(approved(i,1))),scope,reason));
 assert.throws(()=>monthlyAnnulPlan(Array.from({length:11},(_,i)=>candidate(approved(i,500))),scope,reason),/5.000/);
 assert.equal(monthlyAnnulPlan(Array.from({length:10},(_,i)=>candidate(approved(i,500))),scope,reason).items.length,10);
});
test('invalid or incomplete snapshots, nominal decimals, dates, ordinals and effects are rejected',()=>{
 for(const mutate of [b=>b.rows.pop(),b=>b.rows[1].rowOrdinal=1,b=>b.rows[0].amountCents=0,b=>b.rows[0].amountCents='9223372036854775808',b=>b.rows[0].quantityDecimal=100,
 b=>b.payrollCalculated=true,b=>b.status='cancelled',b=>b.exportable=false,b=>b.createdAt='2026-02-30T12:00:00Z',b=>b.id='00000000-0000-0000-0000-000000000000',b=>b.rows[0].identityCurrent=true,b=>b.releaseSha='a'.repeat(64)]){const b=approved();mutate(b);assert.throws(()=>monthlyAnnulBatch(b));}
});
test('same-version content or identity drift and scope revocation withdraw the review',()=>{
 const original=candidate(approved()),plan=monthlyAnnulPlan([original],scope,reason);
 for(const mutate of [d=>d.items[0].batch.rows[0].quantityDecimal='100.000002',d=>d.items[0].batch.rows[1].amountCents=null,d=>d.items[0].snapshotSha256='a'.repeat(64),d=>d.scopeKey='f'.repeat(64)]){const d=structuredClone(original);mutate(d);assert.equal(monthlyAnnulUnchanged(plan,[d]),false);}
 assert.throws(()=>monthlyAnnulPlan([{...original,canPropose:false}],scope,reason));
});
test('independent review pins the complete proposal and requires a fresh explicit reason',()=>{
 const d=proposal([candidate(approved())]);const plan=monthlyAnnulReviewPlan(d,'approve',reason);assert.equal(plan.body.proposalSha256,d.proposalSha256);
 assert.throws(()=>monthlyAnnulReviewPlan({...d,canReview:false},'approve',reason));assert.throws(()=>monthlyAnnulReviewPlan(d,'approve','corto'));
 assert.throws(()=>monthlyAnnulReviewPlan({...d,status:'approved',decision:null},'approve',reason));
});
test('wire order, reason, body and key survive uncertain acknowledgement exactly',()=>{
 const plan=monthlyAnnulPlan([candidate(approved())],scope,reason),attempt=monthlyAnnulAttempt(plan,id(9000));
 assert.deepEqual(JSON.parse(attempt.serializedBody),{command:'annul',payload:attempt.body});assert.ok(Object.isFrozen(attempt.body));
 assert.deepEqual(monthlyAnnulReceipt(receipt(attempt.body),attempt).body,attempt.body);
 for(const mutate of [r=>r.key=id(9001),r=>r.body.reason+=' cambiado',r=>r.body.items[0].expectedVersion++,r=>r.effects.payrollPosted=true,r=>r.eventId=id(1)]){const r=receipt(attempt.body);mutate(r);assert.throws(()=>monthlyAnnulReceipt(r,attempt));}
 const many=monthlyAnnulPlan([candidate(approved(1)),candidate(approved(2))],scope,reason),r=receipt(many.body);r.body.items.reverse();assert.throws(()=>monthlyAnnulReceipt(r,monthlyAnnulAttempt(many,id(9000))));
});
test('commands reject repeated batches, forged actor data and unsafe free text',()=>{
 const body=monthlyAnnulPlan([candidate(approved())],scope,reason).body;
 for(const v of [{...body,actorEmail:'forged@example.invalid'},{...body,items:[body.items[0],body.items[0]]},{...body,reason:'=SUM(<texto inseguro>)'},{...body,reason:'Texto con\nsalto'},{...body,reason:'e\u0301'.repeat(10)},{...body,proposalId:id(3)}])assert.throws(()=>monthlyAnnulCommand(v));
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
function setup({caps=['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare'],result,error}={}){
 const calls=[],session={id:id(100),email:'operator@example.invalid',version:1,releaseSha:'a'.repeat(40)};
 const handler=createInternalPayrollMonthlyAnnulHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{user:{email:session.email},tenant:{source:'membership',id:id(2),membershipId:id(3),certifiedReleaseSha:session.releaseSha,effectiveCapabilities:caps}}}),
 actionMutationSession:()=>session,getInternalSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});if(error)throw error;const body=JSON.parse(args[1]);return [{result:result??receipt(body,args[2])}];}})});return {handler,calls};
}
function request(raw){const req=new PassThrough();req.method='POST';req.query={};req.url='/api/internal-payroll-monthly-annul';req.headers={origin:'https://municipio.example','content-type':'application/json','idempotency-key':id(9000),'content-length':String(Buffer.byteLength(raw))};queueMicrotask(()=>req.end(Buffer.from(raw)));return req;}
test('real raw HTTP preserves all 100 same-name sibling objects and nested commands',async()=>{
 const body=monthlyAnnulPlan(Array.from({length:100},(_,i)=>candidate(approved(i,1))),scope,reason).body,raw=JSON.stringify({command:'annul',payload:body}),{handler,calls}=setup(),res=response();
 await handler(request(raw),res);assert.equal(res.statusCode,201,JSON.stringify(res.body));assert.equal(calls.length,1);assert.deepEqual(JSON.parse(calls[0].args[1]),body);assert.equal(calls[0].args[2],id(9000));assert.match(calls[0].sql,/monthly_annul_command/);assert.match(res.headers['Cache-Control'],/no-store/);
});
test('duplicate keys in a single object, prototype keys and bad UTF-8 never reach SQL',async()=>{
 const body=monthlyAnnulPlan([candidate(approved())],scope,reason).body,raw=JSON.stringify({command:'annul',payload:body});
 for(const broken of [raw.replace('"command":"annul"','"command":"annul","command":"annul"'),raw.replace('"batchId":','"__proto__":{},"batchId":'),raw.replace('"expectedVersion":3','"expectedVersion":3,"expectedVersion":3'),Buffer.from([0x7b,0xff,0x7d])]){const {handler,calls}=setup(),res=response();await handler(request(broken),res);assert.equal(res.statusCode,400);assert.equal(calls.length,0);}
});
test('revoked nominal/preparation/review access never reaches mutation SQL',async()=>{
 const body=monthlyAnnulPlan([candidate(approved())],scope,reason).body;
 for(const caps of [[],['payroll.novelty.read','payroll.novelty.prepare'],['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.approve']]){const{handler,calls}=setup({caps}),res=response();await handler(request(JSON.stringify({command:'annul',payload:body})),res);assert.equal(res.statusCode,403);assert.equal(calls.length,0);}
});
test('malformed confirmations are unavailable and database diagnostics never expose private data',async()=>{
 const body=monthlyAnnulPlan([candidate(approved())],scope,reason).body;
 for(const settings of [{result:{...receipt(body),key:id(10)}},{result:{...receipt(body),body:{...body,reason:reason+' changed'}}},{error:Error('Private person 12345678 secret db connection')}]){const{handler}=setup(settings),res=response();await handler(request(JSON.stringify({command:'annul',payload:body})),res);assert.equal(res.statusCode,503);assert.doesNotMatch(JSON.stringify(res.body),/12345678|secret|connection|stack/);}
});
test('SQL generator retains all inherited controls, exact source and rollback-only synthetic scope',()=>{
 for(const serverMajor of [17,18]){const qa=buildMonthlyAnnulQa({serverMajor,requireConcurrency:true});assert.equal(qa.report.checksPassed,534);assert.equal(qa.report.monthlyAnnulChecksPassed,32);assert.match(qa.sql,/ROLLBACK;\s*$/);assert.doesNotMatch(qa.sql,/INSERT\s+INTO\s+public\./i);assert.match(qa.sql,/direct approved cancellation cannot forge/);assert.match(qa.sql,/original approving person and membership/);assert.match(qa.sql,/failure after the first annulled batch/);assert.match(qa.sql,/another membership of the same person/);}
 for(const serverMajor of [undefined,16,19])assert.throws(()=>buildMonthlyAnnulQa({serverMajor}));
});
