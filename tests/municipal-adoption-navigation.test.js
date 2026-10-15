import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseMunicipalAdoptionNavigation,municipalAdoptionReviewHref,shortMunicipalAdoptionId,resolveMunicipalAdoptionNavigation,MUNICIPAL_ADOPTION_PENDING_HREF} from '../assets/municipal-adoption-navigation-model.js';
import {municipalAdoptionQueue} from '../assets/municipal-adoption-operator-model.js';
import {preparationBody,preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {reviewRaw,reviewId} from './fixtures/employment-adoption-review-synthetic.js';
const base='https://municipal-navigation.test',seed=preparationBody().then(preparationEnvelope),clone=value=>structuredClone(value);
async function queue(rows){const receipt=(await seed).receipt,scope=reviewRaw().scope;return municipalAdoptionQueue({version:'municipal-adoption-operator.v1',scope,total:rows.length,rows:rows.map(([id,independent=true,status='pending',total=855])=>({independent,proposal:{...clone(receipt),proposalId:id,total,...(status==='pending'?{}:{operation:'review',status,decidedAt:'2026-10-15T00:00:00Z',effects:{...receipt.effects,contractsAdopted:status==='approved'?total:0}})}}))});}

test('ordinary Personas does not carry an automatic adoption query',()=>{
 for(const href of ['/personal#legajos','/personal?contractId='+reviewId(1)+'#legajos','/personal','/nomina#calculo'])assert.equal(parseMunicipalAdoptionNavigation(base+href),null);
});
test('one semantic pending or exact proposal intention contains no actor, scope or decision',()=>{
 assert.deepEqual(parseMunicipalAdoptionNavigation(base+MUNICIPAL_ADOPTION_PENDING_HREF),{kind:'pending'});
 for(const path of ['/personal','/internal-dashboard.html','/internal-dashboard','/internal','/rrhh']){
  const result=parseMunicipalAdoptionNavigation(base+path+'?adopcion='+reviewId(1).toUpperCase()+'#legajos');assert.deepEqual(result,{kind:'proposal',proposalId:reviewId(1).toLowerCase()});assert.ok(Object.isFrozen(result));
 }
});
for(const [name,suffix]of Object.entries({duplicate:'?adopcion=pendientes&adopcion=pendientes#legajos',empty:'?adopcion=#legajos',unknown:'?adopcion=todos#legajos',actor:'?adopcion=pendientes&actorEmail=other%40example.invalid#legajos',tenant:'?adopcion=pendientes&tenantId='+reviewId(2)+'#legajos',contract:'?adopcion=pendientes&contractId='+reviewId(2)+'#legajos',decision:'?adopcion=pendientes&decision=approve#legajos',missingHash:'?adopcion=pendientes',otherHash:'?adopcion=pendientes#inicio',spaces:'?adopcion=%20pendientes#legajos',doubleEncoded:'?adopcion=%2570endientes#legajos'}))test('invalid adoption route refuses '+name,()=>assert.throws(()=>parseMunicipalAdoptionNavigation(base+'/personal'+suffix)));
test('an adoption intention cannot select another page or include URL credentials',()=>{
 assert.throws(()=>parseMunicipalAdoptionNavigation(base+'/nomina?adopcion=pendientes#legajos'));assert.throws(()=>parseMunicipalAdoptionNavigation('https://account:secret@municipal-navigation.test/personal?adopcion=pendientes#legajos'));
});
test('links use only the server proposal UUID and preserve the legajos view',()=>{
 const id=reviewId(7);assert.equal(municipalAdoptionReviewHref(id),'/personal?adopcion='+id+'#legajos');assert.equal(shortMunicipalAdoptionId(id),id.slice(0,8)+'…'+id.slice(-8));
 for(const invalid of ['855','pending','<script>','../other','',null]){assert.throws(()=>municipalAdoptionReviewHref(invalid));assert.throws(()=>shortMunicipalAdoptionId(invalid));}
});
test('pending route opens the only independent pending proposal, never the author or an old decision',async()=>{
 const value=await queue([[reviewId(1),false],[reviewId(2),true,'approved'],[reviewId(3),true,'pending',57]]),before=clone(value);
 assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'pending'}),{kind:'review',proposalId:reviewId(3)});assert.deepEqual(value,before);
});
test('two independent proposals of the same 855 size remain a list without a silent choice',async()=>{
 const value=await queue([[reviewId(1)],[reviewId(2)]]);assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'pending'}),{kind:'list',reason:'multiple'});
});
test('exact proposal route ignores ordinal and population size',async()=>{
 const value=await queue([[reviewId(1)],[reviewId(2)],[reviewId(3),true,'pending',62]]);
 assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'proposal',proposalId:reviewId(2)}),{kind:'review',proposalId:reviewId(2)});
 assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'proposal',proposalId:reviewId(3)}),{kind:'review',proposalId:reviewId(3)});
});
test('the author route explains independence without selecting a reviewer or another proposal',async()=>{
 const value=await queue([[reviewId(1),false],[reviewId(2),true]]);assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'proposal',proposalId:reviewId(1)}),{kind:'own',proposalId:reviewId(1)});
 assert.deepEqual(resolveMunicipalAdoptionNavigation(await queue([[reviewId(1),false]]),{kind:'pending'}),{kind:'list',reason:'own'});
});
test('foreign or unavailable UUID never falls back to another available proposal',async()=>{
 assert.deepEqual(resolveMunicipalAdoptionNavigation(await queue([[reviewId(1)]]),{kind:'proposal',proposalId:reviewId(99)}),{kind:'unavailable'});
 assert.deepEqual(resolveMunicipalAdoptionNavigation(await queue([]),{kind:'pending'}),{kind:'list',reason:'none'});
});
test('a decided independent proposal remains a documentary read intention',async()=>{
 const value=await queue([[reviewId(1),true,'approved']]);assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'proposal',proposalId:reviewId(1)}),{kind:'review',proposalId:reviewId(1)});
 assert.deepEqual(resolveMunicipalAdoptionNavigation(value,{kind:'pending'}),{kind:'list',reason:'none'});
});
test('duplicate or malformed navigation metadata cannot create a target',async()=>{
 const value=clone(await queue([[reviewId(1)]]));value.rows.push(clone(value.rows[0]));value.total=2;assert.throws(()=>resolveMunicipalAdoptionNavigation(value,{kind:'pending'}));
 for(const intent of [{kind:'pending',decision:'approve'},{kind:'proposal',proposalId:'855'},{kind:'any'},null])assert.throws(()=>resolveMunicipalAdoptionNavigation(value,intent));
});
test('the new navigation module is included in the explicit public shell build',()=>{
 assert.ok(fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8').includes("'assets/municipal-adoption-navigation-model.js'"));
});
