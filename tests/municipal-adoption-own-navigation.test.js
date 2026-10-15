import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../assets/municipal-adoption-navigation-model.js';
import {adoptionPreparationBootstrap} from '../assets/employment-adoption-preparation-model.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {reviewRaw,reviewId} from './fixtures/employment-adoption-review-synthetic.js';

async function bootstrap(ids=[reviewId(1)]){
 const review=await sealAdoptionReview(reviewRaw()),receipt=await preparationEnvelope();
 const attempts=ids.map((id,n)=>({...structuredClone(receipt),requestKey:'90000000-0000-4000-8000-'+String(n+1).padStart(12,'0'),receipt:{...structuredClone(receipt.receipt),proposalId:id,total:855}}));
 return adoptionPreparationBootstrap({version:'employment-adoption-preparation.v1',review,catalogVersion:'a'.repeat(64),canPrepare:false,applicationAvailable:false,attempts});
}
const resolve=(...args)=>{assert.equal(typeof navigation.resolveOwnAdoptionNavigation,'function','own preparation receipt navigation exists without decision authority');return navigation.resolveOwnAdoptionNavigation(...args);};

test('own pending intention lists saved receipts without treating them as currently pending decisions',async()=>{
 const value=await bootstrap([reviewId(1),reviewId(2)]),before=structuredClone(value);
 const result=resolve(value,{kind:'pending'});assert.deepEqual(result,{kind:'list',proposalIds:[reviewId(1),reviewId(2)]});assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.proposalIds));assert.deepEqual(value,before);
 assert.equal(value.attempts[0].receipt.total,855);assert.notEqual(value.review.total,855);
});
test('exact own proposal matches only the server receipt ID, never number, order or current roster size',async()=>{
 const value=await bootstrap([reviewId(1),reviewId(2)]);
 assert.deepEqual(resolve(value,{kind:'proposal',proposalId:reviewId(2).toUpperCase()}),{kind:'proposal',proposalIds:[reviewId(2)]});
 assert.deepEqual(resolve(value,{kind:'proposal',proposalId:reviewId(99)}),{kind:'unavailable',proposalIds:[]});
});
test('an empty own history remains explicit and never selects a foreign proposal',async()=>{
 const value=await bootstrap([]);assert.deepEqual(resolve(value,{kind:'pending'}),{kind:'list',proposalIds:[]});assert.deepEqual(resolve(value,{kind:'proposal',proposalId:reviewId(1)}),{kind:'unavailable',proposalIds:[]});
});
test('malformed or duplicate own proposal navigation is refused before selecting a receipt',async()=>{
 const value=structuredClone(await bootstrap([reviewId(1),reviewId(2)]));
 for(const intent of [null,{kind:'pending',decision:'approve'},{kind:'proposal',proposalId:'855'},{kind:'other'}])assert.throws(()=>resolve(value,intent));
 value.attempts[1].receipt.proposalId=value.attempts[0].receipt.proposalId;assert.throws(()=>resolve(value,{kind:'pending'}));
 for(const changed of [null,{attempts:[]},{...value,attempts:null},{...value,applicationAvailable:true}])assert.throws(()=>resolve(changed,{kind:'pending'}));
});
