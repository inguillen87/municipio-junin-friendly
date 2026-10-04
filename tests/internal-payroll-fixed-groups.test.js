import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixedGroup,fixedGroupResponse} from '../lib/internal-payroll-fixed-groups.js';
import {createInternalPayrollFixedGroupsHandler} from '../api/internal-payroll-fixed-groups.js';
import {fixedUuid as uuid,fixedSubject,fixedEffects} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {buildFixedGroupsQa} from '../scripts/verify-payroll-fixed-groups-sql.mjs';
import fs from 'node:fs';
const item=n=>({recordId:uuid(n),expectedVersion:2,contractId:fixedSubject().contractId,legajo:'1001',identityToken:fixedSubject().identityToken});
const payload=()=>({items:[item(40),item(41)],reason:'Rectificación administrativa sintética'});
const receipt=()=>({version:'payroll-fixed-annul-group.v1',groupId:uuid(50),key:uuid(777),requestSha256:'a'.repeat(64),total:2,duplicate:false,effects:{...fixedEffects},rows:[40,41].map(n=>({version:'payroll-fixed-receipt.v1',command:'propose',recordId:uuid(n),proposalId:uuid(n+100),recordVersion:3,duplicate:false}))});
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
const request=()=>({method:'POST',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uuid(777)},body:{command:'annul',payload:payload()}});
function setup(caps=['payroll.novelty.read','payroll.novelty.nominal.read','payroll.fixed.prepare'],data=receipt()){
 const calls=[],session={id:uuid(900),email:'preparer@example.invalid',version:1,releaseSha:'a'.repeat(40)};
 const handler=createInternalPayrollFixedGroupsHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},
 requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{user:{email:session.email},tenant:{source:'membership',id:uuid(1),membershipId:uuid(2),certifiedReleaseSha:session.releaseSha,effectiveCapabilities:caps}}}),
 actionMutationSession:()=>session,getInternalSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});return [{result:data}];}})});
 return {handler,calls};
}
test('group preserves all rows, order and exact identities with an explicit reason',()=>{
 const input=payload();assert.deepEqual(prepareFixedGroup(input),input);
 const many={...input,items:Array.from({length:500},(_,i)=>item(i+1000))};assert.equal(prepareFixedGroup(many).items.length,500);
});
test('group refuses duplicates, empty/oversized groups, dates, payroll values and forged actor fields',()=>{
 for(const input of [{...payload(),items:[]},{...payload(),items:[item(40),item(40)]},{...payload(),items:Array.from({length:501},(_,i)=>item(i+1000))},{...payload(),actorEmail:'forged@example.invalid'},{...payload(),reason:'a\nb'},{...payload(),items:[{...item(40),values:{amountCents:'0'}}]},{...payload(),items:[{...item(40),recordId:null}]},{...payload(),items:[{...item(40),expectedVersion:0}]}])assert.throws(()=>prepareFixedGroup(input));
});
test('group receipt verifies every selected id/version/key and administrative effect',()=>{
 assert.deepEqual(fixedGroupResponse(receipt(),{key:uuid(777),payload:payload()}),receipt());
 for(const mutate of [r=>r.rows.reverse(),r=>r.rows.pop(),r=>r.rows[1].recordVersion++,r=>r.rows[1].recordId=r.rows[0].recordId,r=>r.key=uuid(778),r=>r.effects.payrollCalculated=true,r=>r.rows[0].duplicate=true]){const r=receipt();mutate(r);assert.throws(()=>fixedGroupResponse(r,{key:uuid(777),payload:payload()}));}
 assert.throws(()=>fixedGroupResponse(receipt(),{key:uuid(777),attempt:true}));
});
test('only existing nominal read and dedicated preparation authority may call group SQL',async()=>{
 for(const caps of [[],['payroll.novelty.read','payroll.novelty.nominal.read'],['payroll.novelty.read','payroll.novelty.nominal.read','payroll.fixed.approve']]){const {handler,calls}=setup(caps),r=res();await handler(request(),r);assert.equal(r.statusCode,403);assert.equal(calls.length,0);}
 const {handler,calls}=setup(),r=res();await handler(request(),r);assert.equal(r.statusCode,201);assert.equal(calls.length,1);assert.match(calls[0].sql,/payroll_fixed_group_annul_v1/);assert.deepEqual(JSON.parse(calls[0].args[1]),payload());assert.equal(calls[0].args[2],uuid(777));assert.match(r.headers['Cache-Control'],/no-store/);
});
test('invalid transport and lost acknowledgement retain the original scoped operation',async()=>{
 for(const patch of [{query:{resource:'attempt',key:uuid(777)}},{headers:{...request().headers,origin:'https://foreign.example'}},{body:{command:'review',payload:payload()}},{body:'{"command":"annul","command":"annul","payload":{}}'},{headers:{...request().headers,'idempotency-key':'invalid'}}]){const {handler,calls}=setup(),r=res();await handler({...request(),...patch},r);assert.ok(r.statusCode>=400);assert.equal(calls.length,0);}
 const replay={...receipt(),duplicate:true},{handler,calls}=setup(undefined,replay),r=res();await handler({method:'GET',query:{resource:'attempt',key:uuid(777)}},r);assert.equal(r.statusCode,200);assert.match(calls[0].sql,/payroll_fixed_group_attempt_v1/);assert.equal(calls[0].args[1],uuid(777));
});
test('real SQL verifier contains atomic failure, exact replay, identity and privilege cases on both versions',()=>{
 for(const serverMajor of [17,18]){const qa=buildFixedGroupsQa({serverMajor});assert.ok(qa.report.groupChecksPassed>=25);assert.ok(qa.sql.includes('failed second item leaves no first proposal'));assert.ok(qa.sql.includes('same key cannot shrink'));assert.ok(qa.sql.includes('runtime has no direct receipt'));assert.ok(!/INSERT\s+INTO\s+public\./i.test(qa.sql));
  const exact=fs.readFileSync('scripts/migrations/117-fixed-novelty-annul-groups.sql','utf8').replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+qa.schema+',public,pg_temp');
  assert.ok(qa.sql.includes("EXECUTE '"+exact.replaceAll("'","''")+"';"),'Every dollar-quoted function and literal must survive embedding unchanged');
  assert.ok(qa.sql.includes("pronamespace='"+"'"+qa.schema+"''::regnamespace AND proname LIKE ''payroll_fixed_group_%''"),'Metadata count must inspect the isolated schema');
 }
});
