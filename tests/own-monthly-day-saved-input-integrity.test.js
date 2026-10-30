// Source/input fidelity only. The existing public fixture amounts are unchanged;
// these callbacks do not execute SQL, certify IAM or prove municipal rounding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ownRunHash,ownRunOperation,verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
import {syntheticCapture,algorithmSha256} from './fixtures/own-monthly-days-capture-synthetic.js';
const principal={user:{email:'193-recovery-synthetic@example.invalid'},tenant:{source:'membership',id:'a1000000-0000-4000-8000-000000000001',membershipId:'a1000000-0000-4000-8000-000000000002'}};
const session={email:principal.user.email,id:'a1000000-0000-4000-8000-000000000003',version:1,releaseSha:'d'.repeat(40)};
const invalid=error=>error.code==='OWN_RUN_CONTRACT_INVALID'&&error.status===503;
function source(mode){return structuredClone(syntheticCapture('sql193',{mode,days:'30',saved:true,algorithm:algorithmSha256}));}
function dayBinding(c,field){return c.payload.programState.program.definition.bindings.find(b=>b.sourceKind==='monthly_day_declaration_fact'&&b.sourceField===field);}
function dayInput(c,field){return c.saved.input.employees[0].inputs.find(i=>i.key===dayBinding(c,field).key);}
function frozen(c){return JSON.stringify({body:c.body,payload:c.payload,result:c.saved.result});}
for(const mode of ['legacy','fixed-v2']){
 test('193 '+mode+' recovers its original exact source input without consulting a current engine',async()=>{
  const c=source(mode),before=structuredClone(c);assert.strictEqual(verifyOwnRunReceipt(c),c);
  let reads=0;const sql={query:async(q)=>{reads++;assert.match(q,/own_run_attempt_v1/);return[{result:structuredClone(c)}];}};
  const saved=await ownRunOperation(sql,principal,session,'attempt',{key:c.key},{fullJson:true,algorithmHash:()=>{throw Error('Recovery must not ask for the current algorithm');}});
  assert.equal(reads,1);assert.deepEqual(saved.saved,c.saved);assert.deepEqual(c,before);
 });
 for(const [label,mutate]of[
  ['recognized days',(c)=>{dayInput(c,'recognizedDays').value='16';}],
  ['base days',(c)=>{dayInput(c,'baseDays').value='31';}],
  ['approval reference',(c)=>{const r=c.payload.monthlyDayDeclarations.records[0];dayInput(c,'recognizedDays').sourceReference=dayInput(c,'recognizedDays').sourceReference.replace(r.configuration.approvalId,'a1000000-0000-4000-8000-000000099999');}],
 ])test('193 '+mode+' rejects rehashed saved '+label+' that disagree with its frozen approval',async()=>{
  const c=source(mode),immutable=frozen(c),beforeInputSha=c.saved.inputSha256;mutate(c);c.saved.inputSha256=ownRunHash(c.saved.input);
  assert.notEqual(c.saved.inputSha256,beforeInputSha);assert.equal(frozen(c),immutable);
  // The outer capture still passes both hashes; the causal contradiction is
  // solely between saved input and the independent approved193 snapshot.
  assert.equal(c.bodySha256,ownRunHash(c.body));assert.equal(c.payloadSha256,ownRunHash(c.payload));
  assert.throws(()=>verifyOwnRunReceipt(c,{fullJson:true}),invalid);
  let reads=0;await assert.rejects(ownRunOperation({query:async(q)=>{reads++;assert.match(q,/own_run_attempt_v1/);return[{result:structuredClone(c)}];}},principal,session,'attempt',{key:c.key},{fullJson:true}),invalid);
  assert.equal(reads,1);assert.equal(frozen(c),immutable);
 });
}
