import test from 'node:test';
import assert from 'node:assert/strict';
import {adoptionPreparedSources,adoptionFinalSources,adoptionMixedSources,adoptionPreparationPayload,ADOPTION_PREPARED_SOURCES_VERSION} from '../assets/employment-adoption-preparation-model.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {ADOPTION_PREPARED_SOURCES_READER_SQL} from '../lib/internal-employment-adoption-prepared-sources.js';
import {createOwnerAdoptionWorkspace} from '../assets/municipal-owner-adoption-workspace-model.js';
import {ownerAdoptionFixture} from './fixtures/municipal-owner-adoption-synthetic.js';
import {preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {sealAdoptionReview,adoptionReviewHash} from '../assets/employment-adoption-review-model.js';
import {mixedAdoptionRaw} from './fixtures/mixed-contract-adoption-synthetic.js';

const id=n=>'10000000-1000-4000-8000-'+String(n).padStart(12,'0');
const scope={tenantId:id(1),membershipId:id(2),bindingId:id(3),companyId:1};
const rows=[
 {revisionId:id(28),packageSha256:'c'.repeat(64),cutoff:'2026-10-28T15:16:35'},
 {revisionId:id(14),packageSha256:'b'.repeat(64),cutoff:'2026-10-14T15:18:17'},
 {revisionId:id(10),packageSha256:'a'.repeat(64),cutoff:'2026-10-01T15:17:29'},
];
const catalog=(total=3)=>({version:ADOPTION_PREPARED_SOURCES_VERSION,scope:{...scope},total,rows:structuredClone(rows.slice(0,total))});
const principal={user:{email:'catalogue@example.invalid'},tenant:{source:'membership',id:scope.tenantId,membershipId:scope.membershipId,effectiveCapabilities:['workforce.employee.read']}};
const session={id:id(4),email:principal.user.email,version:1,releaseSha:'d'.repeat(40)};
const invalid=/No se pudo verificar la propuesta completa/;

for(const total of [0,1,2,3])test('prepared catalog validates and freezes '+total+' complete source references',()=>{
 const input=catalog(total),value=adoptionPreparedSources(input);
 assert.deepEqual(value,input);assert.notEqual(value,input);assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.scope)&&Object.isFrozen(value.rows));
 for(const row of value.rows)assert.ok(Object.isFrozen(row));
});
test('legacy list versions retain original maximums and never accept prepared version',()=>{
 const one={...catalog(1),version:'employment-adoption-final-sources.v1'};
 assert.equal(adoptionFinalSources(one).total,1);
 assert.throws(()=>adoptionFinalSources({...catalog(2),version:one.version}),invalid);
 const two={...catalog(2),version:'employment-adoption-final-sources.v2'};
 assert.equal(adoptionMixedSources(two).total,2);
 assert.throws(()=>adoptionMixedSources({...catalog(3),version:two.version}),invalid);
 for(const read of [adoptionFinalSources,adoptionMixedSources])assert.throws(()=>read(catalog()),invalid);
 for(const value of [one,two])assert.throws(()=>adoptionPreparedSources(value),invalid);
});
test('prepared catalog rejects overflow, partial pages, extra filters and unrecognized version',()=>{
 for(const change of [
  value=>{value.total=4;value.rows.push({...rows[0],revisionId:id(29),cutoff:'2026-10-29T12:00:00'});},
  value=>{value.rows.pop();},
  value=>{value.cursor='next';},
  value=>{value.version='employment-adoption-prepared-sources.v99';},
  value=>{value.scope.extra='client-selected-scope';},
 ]){const value=catalog();change(value);assert.throws(()=>adoptionPreparedSources(value),invalid);}
});
test('prepared catalog rejects invalid identifiers, package pins, duplicate IDs and duplicate cuts',()=>{
 for(const change of [
  value=>{value.rows[0].revisionId='not-a-uuid';},
  value=>{value.rows[0].packageSha256='c'.repeat(63);},
  value=>{value.rows[1].revisionId=value.rows[0].revisionId;},
  value=>{value.rows[0].revisionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';value.rows[1].revisionId=value.rows[0].revisionId.toUpperCase();},
  value=>{value.rows[1].cutoff=value.rows[0].cutoff;},
  value=>{value.rows[0].cutoff='2026-02-31T15:16:35';},
  value=>{value.rows[0].sourceProfile='untrusted';},
 ]){const value=catalog();change(value);assert.throws(()=>adoptionPreparedSources(value),invalid);}
});
test('prepared catalog preserves the reviewed descending cut order and rejects silently reordered output',()=>{
 const value=adoptionPreparedSources(catalog());assert.deepEqual(value.rows.map(row=>row.cutoff),rows.map(row=>row.cutoff));
 const wrong=catalog();wrong.rows.reverse();assert.throws(()=>adoptionPreparedSources(wrong),invalid);
});
test('a getter cannot execute while parsing the new list envelope',()=>{
 let reads=0;const value=catalog();Object.defineProperty(value,'version',{enumerable:true,get(){reads++;return ADOPTION_PREPARED_SOURCES_VERSION;}});
 assert.throws(()=>adoptionPreparedSources(value),invalid);assert.equal(reads,0);
});

test('new API read uses one fixed descriptor-gated query and server-built context only',async()=>{
 const calls=[],sql={query:async(text,values)=>{calls.push({text,values});return[{result:catalog()}];}};
 const value=await adoptionPreparationOperation(sql,principal,session,'prepared-sources');
 assert.equal(value.total,3);assert.equal(calls.length,1);assert.equal(calls[0].text,ADOPTION_PREPARED_SOURCES_READER_SQL);
 const context=JSON.parse(calls[0].values[0]);assert.equal(context.actorEmail,principal.user.email);assert.equal(context.tenantId,scope.tenantId);
 assert.equal(Object.hasOwn(context,'sourceBindingId'),false);assert.equal(Object.hasOwn(context,'sourceCompanyId'),false);
});
test('new API read rejects unauthorized access, supplied filters and a mismatched returned scope',async()=>{
 let calls=0;const sql={query:async()=>{calls++;return[{result:catalog()}];}};
 await assert.rejects(adoptionPreparationOperation(sql,{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}},session,'prepared-sources'),{status:403});
 await assert.rejects(adoptionPreparationOperation(sql,principal,session,'prepared-sources',{cutoff:rows[0].cutoff}),{status:400});assert.equal(calls,0);
 const value=catalog();value.scope.tenantId=id(90);
 await assert.rejects(adoptionPreparationOperation({query:async()=>[{result:value}]},principal,session,'prepared-sources'),{status:503});
});
test('unavailable descriptor, absent function and malformed complete list fail closed',async()=>{
 await assert.rejects(adoptionPreparationOperation({query:async()=>[{result:null}]},principal,session,'prepared-sources'),{status:503});
 await assert.rejects(adoptionPreparationOperation({query:async()=>{throw Object.assign(Error('undefined function'),{code:'42883'});}},principal,session,'prepared-sources'),{status:503,code:'EMPLOYMENT_ADOPTION_NOT_READY'});
 const bad=catalog();bad.rows[1].revisionId=bad.rows[0].revisionId;
 await assert.rejects(adoptionPreparationOperation({query:async()=>[{result:bad}]},principal,session,'prepared-sources'),{status:503});
});
test('legacy API resources still call their original SQL readers and retain their response versions',async()=>{
 for(const[operation,fn,version,total]of [
  ['final-sources','employment_adoption_final_available_v1','employment-adoption-final-sources.v1',1],
  ['mixed-sources','employment_adoption_mixed_available_v1','employment-adoption-final-sources.v2',2],
 ]){
  const calls=[],sql={query:async(text)=>{calls.push(text);return[{result:{...catalog(total),version}}];}};
  const value=await adoptionPreparationOperation(sql,principal,session,operation);
  assert.equal(value.version,version);assert.deepEqual(calls,['SELECT public.'+fn+'($1::jsonb) AS result']);
 }
});

async function workspaceHarness({mixed=false}={}){
 const f=await ownerAdoptionFixture(3),raw=mixed?mixedAdoptionRaw():f.stage.rawReview,review=await sealAdoptionReview(raw);
 const body=mixed?await adoptionPreparationPayload(review,f.command.catalogVersion,'','Documento ficticio','Preparación mixta exclusivamente sintética'):f.stage.preview.body;
 const metadata=mixed?{...f.stage.preview,proposal:{...f.stage.preview.proposal,total:review.total,sourceContextVersion:review.sourceContextVersion},body,rawReviewSha256:await adoptionReviewHash(raw)}:{...f.stage.preview};
 delete metadata.previewSha256;const preview={...metadata,previewSha256:await adoptionReviewHash(metadata),review};
 const saved=await preparationEnvelope(body);Object.assign(saved.receipt,{proposalId:metadata.proposal.proposalId,proposalVersion:metadata.proposal.proposalVersion,total:review.total,sourceContextVersion:review.sourceContextVersion});
 const bootstrap={version:mixed?'employment-adoption-preparation.v8':'employment-adoption-preparation.v4',review,catalogVersion:f.command.catalogVersion,canPrepare:false,applicationAvailable:false,attempts:[saved]};
 const source=Object.fromEntries(['revisionId','packageSha256','cutoff'].map(key=>[key,review.source.finalRevision[key]]));
 const sources={...catalog(),scope:f.authorization.scope,rows:[...rows.slice(0,2),source]};
 const calls=[],state={bootstrap,preview,sources},response=data=>new Response(JSON.stringify({ok:true,data}),{headers:{'Content-Type':'application/json'}});
 const request=async(url,init={})=>{
  assert.equal(init.method??'GET','GET','this suite permits read requests only');calls.push({url,method:init.method??'GET'});
  const u=new URL(url,'https://synthetic.invalid'),resource=u.searchParams.get('resource');
  if(resource==='authority')return response(f.authorization);
  if(resource==='prepared-sources')return response(state.sources);
  if(resource==='bootstrap'||resource?.endsWith('-bootstrap'))return response(state.bootstrap);
  if(resource==='preview')return response(state.preview);
  throw Error('Unexpected source request: '+resource);
 };
 const machine=createOwnerAdoptionWorkspace({request,randomUUID:()=>{throw Error('No mutation key may be created');}});
 await machine.load();machine.selectProposal(metadata.proposal.proposalId);
 return{machine,calls,state,source,review,proposal:metadata.proposal};
}
for(const mixed of [false,true])test('shared prepared catalog supports explicit '+(mixed?'mixed':'final')+' preview without selecting newest cut or applying',async()=>{
 const h=await workspaceHarness({mixed});await h.machine.loadSources('prepared');
 assert.equal(h.machine.getState().sources.total,3);assert.equal(h.machine.getState().review,null);assert.equal(h.machine.getState().preview,null);
 assert.equal(h.calls.filter(c=>c.url.includes('resource=prepared-sources')).length,1);
 await h.machine.chooseSource(h.source,mixed?'mixed-bootstrap':'final-active-bootstrap');
 const selected=h.machine.getState().preview;assert.equal(selected.proposal.proposalId,h.proposal.proposalId);
 assert.deepEqual(selected.review.source.finalRevision,h.review.source.finalRevision);
 assert.equal(h.machine.getState().receipt,null);assert.ok(h.calls.every(c=>c.method==='GET'));
 assert.ok(!h.calls.some(c=>/[?&]resource=(?:final|mixed)-sources/.test(c.url)));
});
test('prepared catalog does not weaken explicit-source and original-proposal matching',async()=>{
 const h=await workspaceHarness();await h.machine.loadSources('prepared');
 await assert.rejects(h.machine.chooseSource({...h.source,revisionId:id(999)},'final-active-bootstrap'),/respaldo disponible/);
 await assert.rejects(h.machine.chooseSource(h.source,''),/respaldo disponible/);
 const raw=structuredClone((await ownerAdoptionFixture(3)).stage.rawReview);raw.source.finalRevision.cutoff=rows[0].cutoff;
 h.state.bootstrap={...h.state.bootstrap,review:await sealAdoptionReview(raw)};
 await assert.rejects(h.machine.chooseSource(rows[0],'final-active-bootstrap'),/no corresponden/);
 assert.equal(h.calls.filter(c=>c.url.includes('resource=preview')).length,0);assert.equal(h.machine.getState().receipt,null);
});

