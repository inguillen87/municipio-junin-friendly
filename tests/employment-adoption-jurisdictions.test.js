import test from 'node:test';import assert from 'node:assert/strict';
import {adoptionPreparationPayload,adoptionPreparationReceipt} from '../assets/employment-adoption-preparation-model.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {reviewRaw,reviewRow,reviewId} from './fixtures/employment-adoption-review-synthetic.js';
import {catalogVersion,attemptKey,preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {principal,session} from './fixtures/employment-adoption-preparation-synthetic.js';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';
const review=()=>sealAdoptionReview(reviewRaw(57,{rows:Array.from({length:57},(_,n)=>reviewRow(n+1,n===0?{jurisdictionCode:'55'}:n===56?{status:'inactive',endDate:'2026-09-30'}:{}))}));
const declaration=r=>({snapshot:r.snapshot,rows:r.rows.map((row,n)=>({contractId:row.contractId,jurisdictionCode:row.jurisdictionCode??(n>=25?'55':'42')}))});
const prepare=(r,d)=>adoptionPreparationPayload(r,catalogVersion,d,'Resolución sintética QA','Distribución explícita de jurisdicciones para revisión independiente');
test('mixed jurisdictions prepare every page and inactive contract without mutating the review or declarations',async()=>{
 const r=await review(),d=declaration(r),before=JSON.stringify(d),body=await prepare(r,d);
 assert.equal(body.rows.length,57);assert.deepEqual(body.rows.map(x=>x.contractId),r.rows.map(x=>x.contractId));
 assert.equal(body.rows.filter(x=>x.jurisdictionCode==='42').length,24);assert.equal(body.rows.filter(x=>x.jurisdictionCode==='55').length,33);
 assert.equal(body.rows[56].jurisdictionCode,'55');assert.equal(JSON.stringify(d),before);assert.equal(r.rows[56].jurisdictionCode,null);
 assert.doesNotMatch(JSON.stringify(body),/PERSONA SINTÉTICA|legajo|name|dni|cuil|snapshot|rowNumber/);
});
const changes={
 stale:d=>d.snapshot='f'.repeat(64),missing:d=>d.rows.pop(),partialSearch:d=>d.rows=d.rows.slice(0,25),
 duplicate:d=>d.rows[26]=d.rows[25],reordered:d=>[d.rows[25],d.rows[26]]=[d.rows[26],d.rows[25]],
 otherContract:d=>d.rows[25].contractId=reviewId(8000),invalidJurisdiction:d=>d.rows[25].jurisdictionCode='101',
 numericJurisdiction:d=>d.rows[25].jurisdictionCode=55,undeclared:d=>d.rows[25].jurisdictionCode='',
 changedPriorDeclaration:d=>d.rows[0].jurisdictionCode='42',nominalExtra:d=>d.rows[25].name='PERSONA SINTÉTICA',
 extraScope:d=>d.tenantId=reviewId(8000),nullRows:d=>d.rows=null
};
for(const [name,change]of Object.entries(changes))test('refuses '+name+' before producing a body',async()=>{const r=await review(),d=declaration(r);change(d);await assert.rejects(prepare(r,d));});
test('a declaration cannot be carried across source, membership or contract changes',async()=>{
 const r=await review(),d=declaration(r);
 for(const patch of [{scope:{...r.scope,membershipId:reviewId(9900)}},{source:{...r.source,sourceSha256:'f'.repeat(64)}},{rows:r.rows.map((row,n)=>reviewRow(n+1,n===25?{categoryCode:'2'}:{}))}]){
  const changed=await sealAdoptionReview({...reviewRaw(57),...patch});await assert.rejects(prepare(changed,d));
 }
});
test('same-attempt receipt binds the complete jurisdiction distribution and refuses a changed jurisdiction',async()=>{
 const r=await review(),body=await prepare(r,declaration(r)),envelope=await preparationEnvelope(body);
 const receipt=await adoptionPreparationReceipt(envelope,{key:attemptKey,body});assert.equal(receipt.receipt.effects.contractsAdopted,0);
 const changed=structuredClone(body);changed.rows[25].jurisdictionCode='42';await assert.rejects(adoptionPreparationReceipt(envelope,{key:attemptKey,body:changed}));
});
test('the existing authenticated API passes the full mixed proposal unchanged to its private SQL facade',async()=>{
 const r=await review(),body=await prepare(r,declaration(r)),calls=[];
 const handler=createEmploymentAdoptionHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},sessionFor:()=>session,requireAccess:async()=>({mode:'managed',principal}),getSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});assert.deepEqual(JSON.parse(args[1]),body);return[{result:await preparationEnvelope(body)}];}})});
 const res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}};
 await handler({method:'POST',url:'/api/internal-employment-adoption',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':attemptKey},body:JSON.stringify({operation:'propose',payload:body})},res);
 assert.equal(res.statusCode,201);assert.equal(calls.length,1);assert.match(calls[0].sql,/employment_adoption_propose_v1/);assert.equal(calls[0].args[2],attemptKey);assert.equal(res.payload.data.receipt.total,57);assert.equal(res.payload.data.receipt.effects.contractsAdopted,0);
});
