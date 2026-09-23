import test from 'node:test';
import assert from 'node:assert/strict';
import {createLegalReadController} from '../assets/legal-read-controller.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(read,options={}){const states=[];const controller=createLegalReadController({read,canRead:()=>true,onChange:s=>states.push(s),timeoutMs:1000,...options});return{controller,states};}
test('overlapping refresh calls share one read and promise',async()=>{
 let count=0;const d=deferred(),{controller,states}=fixture(()=>{count++;return d.promise});
 const a=controller.load(),b=controller.load();assert.strictEqual(a,b);await tick();assert.equal(count,1);
 d.resolve({revision:1});await a;assert.deepEqual(states.map(s=>s.phase),['loading','ready']);
});
test('data is cleared when refresh begins and errors never carry raw server messages',async()=>{
 let count=0;const {controller,states}=fixture(()=>{if(count++)throw Error('PRIVATE NAME / TOKEN');return {value:'synthetic'}});
 await controller.load();await controller.load();assert.deepEqual(states.map(s=>s.phase),['loading','ready','loading','error']);
 assert.equal(states.at(-2).data,null);assert.equal(states.at(-1).reason,'unavailable');assert.doesNotMatch(JSON.stringify(states),/PRIVATE NAME|TOKEN/);
});
test('timeout bounds both transport and body parsing even when cancellation is ignored',async()=>{
 const {controller,states}=fixture(()=>new Promise(()=>{}),{timeoutMs:10});await controller.load();
 assert.equal(states.at(-1).phase,'error');assert.equal(states.at(-1).reason,'timeout');
});
test('retry after timeout can publish only the new result, never a late old response',async()=>{
 let count=0;const first=deferred(),{controller,states}=fixture(()=>count++===0?first.promise:{id:'new'},{timeoutMs:10});
 await controller.load();await controller.load();first.resolve({id:'old'});await tick();
 assert.deepEqual(states.filter(s=>s.phase==='ready').map(s=>s.data.id),['new']);
});
test('revocation ends the pending operation immediately and rejects its eventual data',async()=>{
 const d=deferred();let signal;const {controller,states}=fixture(s=>{signal=s;return d.promise});
 const work=controller.load();await tick();controller.revoke();await work;assert.equal(signal.aborted,true);
 d.resolve({id:'private'});await tick();assert.equal(states.at(-1).phase,'blocked');assert.equal(states.at(-1).data,null);
 await controller.load();assert.equal(states.length,2);
});
test('capability is checked again after reading the response',async()=>{
 const d=deferred();let allowed=true;const {controller,states}=fixture(()=>d.promise,{canRead:()=>allowed});
 const work=controller.load();await tick();allowed=false;d.resolve({id:'private'});await work;assert.equal(states.at(-1).phase,'blocked');
});
for(const status of [401,403])test('HTTP '+status+' blocks future reads instead of silently retrying',async()=>{
 let calls=0;const {controller,states}=fixture(()=>{calls++;throw Object.assign(Error('private'),{status})});
 await controller.load();await controller.load();assert.equal(calls,1);assert.equal(states.at(-1).phase,'blocked');
});
test('dispose closes the controller and clears observable data',async()=>{
 const {controller,states}=fixture(()=>({id:'synthetic'}));await controller.load();controller.dispose();await controller.load();
 assert.deepEqual(states.at(-1),{phase:'disposed',data:null,reason:null});
});
test('no permission means no transport call',async()=>{
 const {controller,states}=fixture(()=>assert.fail('not authorized'),{canRead:()=>false});await controller.load();assert.equal(states[0].phase,'blocked');
});
