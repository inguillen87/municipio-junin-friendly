import test from 'node:test';
import assert from 'node:assert/strict';
import {writePayrollCatalog} from '../lib/internal-payroll-catalog.js';
import {CATALOG_CONTRACT} from '../lib/payroll-catalog-contract.js';
import {PARAMETER_SOURCE_SHA,PARAMETER_CONTRACT,parameterPreview} from '../lib/payroll-parameter-contract.js';
import {catalogScope,catalogActivationReview,sameCatalogActivationReview,catalogActivationAttempt,assertCatalogActivationReceipt} from '../lib/payroll-catalog-review.js';
import {catalogRequest} from '../src/islands/payroll-catalog-client.js';
import {createInternalPayrollCatalogHandler} from '../api/internal-payroll-catalog.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:id(1),membershipId:id(2),certifiedReleaseSha:'a'.repeat(40)}};
const session={email:principal.user.email,id:id(3),version:1,releaseSha:'a'.repeat(40)};
const input={proposalId:id(4),proposalVersion:3,catalogRevision:7};
function receipt(){const activation={id:id(5),revision:8,proposalId:id(4),proposalVersion:3,validFrom:'2026-10',activatedAt:'2026-10-01T12:00:00.123456Z'};return {contractVersion:CATALOG_CONTRACT,payrollCalculated:false,payrollPosted:false,replayed:false,currentRevision:8,activation,catalog:{period:'2026-10',revision:8,rows:[{agreementId:1,auxiliaryId:88,baseClass:'6-D',newValueCents:'123456',referenceConceptId:24,activationId:id(5),activationRevision:8,proposalId:id(4),proposalVersion:3,validFrom:'2026-10',sourceReference:'Escala sintética QA',ruleId:'aux88-class6d',sourceSha256:PARAMETER_SOURCE_SHA,activatedAt:activation.activatedAt}]}};}
for(const field of ['proposalId','proposalVersion','revision'])test('server rejects a valid activation receipt for a different '+field,async()=>{const answer=receipt();if(field==='proposalId'){answer.activation.proposalId=id(9);answer.catalog.rows[0].proposalId=id(9);}else if(field==='proposalVersion'){answer.activation.proposalVersion=4;answer.catalog.rows[0].proposalVersion=4;}else{answer.activation.revision=9;answer.catalog.revision=9;answer.currentRevision=9;answer.catalog.rows[0].activationRevision=9;}let calls=0;await assert.rejects(writePayrollCatalog({query:async()=>{calls++;return[{result:answer}];}},principal,session,'activate',input,id(6)),e=>e.code==='PAYROLL_CATALOG_RESPONSE_INVALID');assert.equal(calls,1);});
const actor={tenantId:id(1),membershipId:id(2),certifiedBindingId:id(7),capabilities:['payroll.parameter.read','payroll.parameter.approve'],employmentLinked:true};
function saved(){const draft={ruleId:'aux88-class6d',baseAmountCents:'123456',agreementIds:[1,4,6],validFrom:'2026-10',sourceReference:'Escala sintética QA',rounding:'nearest_cent'};return {id:id(4),contractVersion:PARAMETER_CONTRACT,version:3,status:'approved',draft:{...draft,rows:parameterPreview(draft),sourceSha256:PARAMETER_SOURCE_SHA,applied:false,currentCatalogVerified:false}};}
function preview(proposal=saved()){return {contractVersion:CATALOG_CONTRACT,payrollCalculated:false,payrollPosted:false,preview:{proposalId:proposal.id,proposalVersion:proposal.version,catalogRevision:7,validFrom:proposal.draft.validFrom,sourceReference:proposal.draft.sourceReference,canActivate:true,blockedReason:null,changes:proposal.draft.rows.map((r,i)=>({...r,previousValueCents:i===0?null:'100001',previousActivationRevision:i===0?null:2,previousValidFrom:i===0?null:'2026-09'}))}};}
function reviewed(){return catalogActivationReview(preview(),saved(),catalogScope(actor));}
function completeReceipt(){const r=receipt();r.catalog.rows=saved().draft.rows.map(row=>({...r.catalog.rows[0],...row}));return r;}
test('review contains all agreements, a distinct null, exact cents and an immutable detached draft',()=>{
 const p=saved(),v=preview(p),review=catalogActivationReview(v,p,catalogScope(actor));
 assert.equal(review.preview.changes.length,3);assert.equal(review.preview.changes[0].previousValueCents,null);
 assert.equal(review.proposal.draft.baseAmountCents,'123456');p.draft.rows[0].newValueCents='1';v.preview.changes.pop();
 assert.equal(review.preview.changes.length,3);assert.equal(review.proposal.draft.rows[0].newValueCents,'123456');
 assert.throws(()=>review.preview.changes.pop(),TypeError);assert.throws(()=>review.proposal.draft.rounding='truncate_cent',TypeError);
});
for(const field of ['tenantId','membershipId','certifiedBindingId'])test('scope requires a verified '+field,()=>assert.throws(()=>catalogScope({...actor,[field]:null})));
test('plain previews cannot create an activation attempt',()=>assert.throws(()=>catalogActivationAttempt({preview:preview().preview},id(6))));
test('matching fresh proposal and full preview keep the confirmed review',()=>assert.equal(sameCatalogActivationReview(reviewed(),preview(),saved()),true));
for(const [name,change] of Object.entries({catalogRevision:p=>p.catalogRevision++,previousAmount:p=>p.changes[1].previousValueCents='100002',previousDate:p=>p.changes[1].previousValidFrom='2026-08',previousRevision:p=>p.changes[1].previousActivationRevision=3,missingAgreement:p=>p.changes.pop(),newAmount:p=>p.changes[1].newValueCents='123457',reference:p=>p.sourceReference='Otra escala QA',validFrom:p=>p.validFrom='2026-11',proposalVersion:p=>p.proposalVersion++,blocked:p=>{p.canActivate=false;p.blockedReason='already_activated';}}))test('fresh review refuses '+name,()=>{
 const fresh=preview();change(fresh.preview);let matches=false;try{matches=sameCatalogActivationReview(reviewed(),fresh,saved());}catch{}assert.equal(matches,false);
});
test('changed rounding requires another review even when the resulting cents are equal',()=>{const p=saved();p.draft.rounding='truncate_cent';assert.equal(sameCatalogActivationReview(reviewed(),preview(p),p),false);});
test('attempt has the original scope, body and key and is never mutated',()=>{const attempt=catalogActivationAttempt(reviewed(),id(6));assert.equal(attempt.body,JSON.stringify({command:'activate',payload:input}));assert.equal(attempt.scopeKey,catalogScope(actor));assert.throws(()=>attempt.payload.catalogRevision++,TypeError);assert.throws(()=>attempt.key=id(9),TypeError);});
test('complete receipt is accepted with microsecond timestamp retained',()=>{const r=completeReceipt();assert.equal(assertCatalogActivationReceipt(r,catalogActivationAttempt(reviewed(),id(6))),r);assert.match(r.activation.activatedAt,/123456Z$/);});
for(const [name,change] of Object.entries({missingAgreement:r=>r.catalog.rows.pop(),newAmount:r=>r.catalog.rows[1].newValueCents='123457',reference:r=>r.catalog.rows[1].sourceReference='Otra escala QA',proposal:r=>r.catalog.rows[1].proposalId=id(9),version:r=>r.catalog.rows[1].proposalVersion=4,revision:r=>r.catalog.rows[1].activationRevision=7,timestamp:r=>r.catalog.rows[1].activatedAt='2026-10-01T12:00:00.123Z',date:r=>r.catalog.rows[1].validFrom='2026-09',differentActivation:r=>r.catalog.rows[1].activationId=id(9),source:r=>r.catalog.rows[1].sourceSha256='a'.repeat(64)}))test('receipt refuses changed '+name+' in a non-first agreement',()=>{const r=completeReceipt();change(r);assert.throws(()=>assertCatalogActivationReceipt(r,catalogActivationAttempt(reviewed(),id(6))));});
test('client sends the immutable body and original scope once after an uncertain response',async()=>{
 const attempt=catalogActivationAttempt(reviewed(),id(6));let calls=0;
 await assert.rejects(catalogRequest({},attempt,async(url,opts)=>{calls++;assert.equal(opts.body,attempt.body);assert.equal(opts.headers['X-MuniControl-Catalog-Scope'],attempt.scopeKey);assert.equal(opts.headers['Idempotency-Key'],attempt.key);throw Error('network');}));assert.equal(calls,1);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(v){this.body=v;return this;}};}
const env={NODE_ENV:'production',INTERNAL_APP_ORIGIN:'https://qa.example.invalid',INTERNAL_CERTIFIED_RELEASE_SHA:'a'.repeat(40)};
const access={mode:'managed',principal,session};
function request(scope){return {method:'POST',headers:{origin:env.INTERNAL_APP_ORIGIN,'content-type':'application/json','idempotency-key':id(6),'x-municontrol-catalog-scope':scope},body:{command:'activate',payload:input}};}
for(const field of ['tenantId','membershipId'])test('API rejects a different '+field+' before reading body or opening SQL',async()=>{
 let bodyReads=0,connections=0;const req=request(catalogScope({...actor,[field]:id(9)}));Object.defineProperty(req,'body',{get(){bodyReads++;throw Error('must not read');}});
 const h=createInternalPayrollCatalogHandler({env,requireAccess:async()=>access,getSql:async()=>{connections++;}}),res=response();await h(req,res);
 assert.equal(res.code,409);assert.equal(res.body.code,'PAYROLL_CATALOG_SCOPE_CHANGED');assert.equal(bodyReads,0);assert.equal(connections,0);
});
test('API rechecks the certified binding from authenticated bootstrap before any activation',async()=>{
 let writes=0;const h=createInternalPayrollCatalogHandler({env,requireAccess:async()=>access,getSql:async()=>({}),readParameters:async(sql,p,s,resource)=>{assert.equal(resource,'bootstrap');assert.equal(p,principal);return {principal:{...actor,certifiedBindingId:id(9)}};},write:async()=>{writes++;}}),res=response();
 await h(request(catalogScope(actor)),res);assert.equal(res.code,409);assert.equal(writes,0);
});
test('API preserves the requested body and key when verified scope matches',async()=>{
 let writes=0;const h=createInternalPayrollCatalogHandler({env,requireAccess:async()=>access,getSql:async()=>({}),readParameters:async()=>({principal:actor}),write:async(sql,p,s,command,payload,key)=>{writes++;assert.deepEqual(payload,input);assert.equal(key,id(6));return receipt();}}),res=response();
 await h(request(catalogScope(actor)),res);assert.equal(res.code,201);assert.equal(writes,1);assert.match(res.headers['Cache-Control'],/no-store/);
});
