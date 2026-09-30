import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPreparteSelections,preparteNoveltyRows} from '../assets/attendance-preparte-model.js';
import {correctionPreparte,decisionsFor,reviewedOptions} from './fixtures/preparte-correction-synthetic.js';

test('review collects every selected correction including later pages without producing a partial transfer',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data);
  Object.assign(decisions.get(data.rows[0].key),{hours:'04:61',cap:'',percent:'101'});
  Object.assign(decisions.get(data.rows[40].key),{hours:'05:00',cap:'2'});
  Object.assign(decisions.get(data.rows[59].key),{cap:'0'});
  const before=JSON.stringify([data,[...decisions]]),review=reviewPreparteSelections(data,decisions,reviewedOptions());
  assert.equal(review.selected,60);assert.equal(review.valid,false);assert.equal(review.rows.length,0);
  assert.equal(review.issues.length,6);assert.deepEqual([...new Set(review.issues.map(i=>i.key))],[data.rows[0].key,data.rows[40].key,data.rows[59].key]);
  assert.deepEqual(review.issues.slice(0,3).map(i=>i.field),['hours','cap','percent']);
  assert.equal(JSON.stringify([data,[...decisions]]),before);assert.ok(Object.isFrozen(review.issues[0]));
});

test('missing documentation and acknowledgment are global corrections independent of row errors',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data);decisions.get(data.rows[59].key).hours='00:00';
  const review=reviewPreparteSelections(data,decisions,{documentReference:'',confirmed:false});
  assert.deepEqual(review.issues.map(i=>i.field),['reference','reviewed','hours']);
  assert.equal(review.issues[0].key,null);assert.equal(review.rows.length,0);
});

test('unselected local entries do not require data or appear in the incoming draft',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data);decisions.get(data.rows[0].key).selected=false;
  Object.assign(decisions.get(data.rows[0].key),{hours:'invalid',cap:'',percent:'invalid'});
  const review=reviewPreparteSelections(data,decisions,reviewedOptions());
  assert.equal(review.valid,true);assert.equal(review.selected,59);assert.equal(review.rows.length,59);
  assert.equal(review.rows[0][0],data.rows[1].legajo);
});

test('valid corrected selection produces the exact existing sheet contract with detached mutable compatibility',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data),review=reviewPreparteSelections(data,decisions,reviewedOptions());
  assert.equal(review.valid,true);assert.equal(review.rows.length,60);assert.ok(Object.isFrozen(review.rows[0]));
  assert.ok(review.rows.every(r=>r.length===10&&r[1]==='44'&&r[4]==='3'&&r[5]===''&&r[9]==='NO'));
  const legacy=preparteNoveltyRows(data,decisions,reviewedOptions());assert.deepEqual(legacy,review.rows);
  legacy[0][0]='changed';assert.equal(review.rows[0][0],data.rows[0].legajo);assert.equal(data.payrollCalculated,false);
});

test('source conflicts cannot be corrected by entering hours or checking the row',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data);
  data.rows[59].canPropose=false;data.rows[59].issues=['Dos vínculos requieren revisión'];data.rows[59].extraSeconds=null;
  data.summary.readyForReview--;data.summary.withIncidents++;
  const review=reviewPreparteSelections(data,decisions,reviewedOptions());
  assert.equal(review.valid,false);assert.equal(review.rows.length,0);assert.equal(review.issues.at(-1).key,data.rows[59].key);
  assert.equal(review.issues.at(-1).field,'selected');assert.match(review.issues.at(-1).message,/incidencias de origen/);
});

test('500 selected rows are retained in full; 501 is a global limit with no silent partition',async()=>{
  for(const count of [500,501]){
    const data=await correctionPreparte(count),review=reviewPreparteSelections(data,decisionsFor(data),reviewedOptions());
    assert.equal(review.selected,count);assert.equal(review.valid,count===500);assert.equal(review.rows.length,count===500?500:0);
    if(count===501){assert.equal(review.issues.length,1);assert.equal(review.issues[0].key,null);assert.match(review.issues[0].message,/500/);}
  }
});

test('unknown cut decisions and invalid source cannot produce a transfer',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data);decisions.set('f'.repeat(64),{selected:true});
  const wrong=reviewPreparteSelections(data,decisions,reviewedOptions());assert.equal(wrong.rows.length,0);assert.match(wrong.issues[0].message,/otro corte/);
  const missing=reviewPreparteSelections(null,decisions,reviewedOptions());assert.equal(missing.valid,false);assert.equal(missing.issues[0].field,'source');
  data.sourceComplete=false;assert.equal(reviewPreparteSelections(data,decisions,reviewedOptions()).rows.length,0);
});

test('numeric coercion cannot silently accept malformed declarations',async()=>{
  const data=await correctionPreparte(),decisions=decisionsFor(data);
  for(const patch of [{selected:'true'},{hours:4},{cap:3},{percent:3},{cap:'03'},{percent:'3e0'}]){
    const current=new Map([...decisions].map(([key,value])=>[key,{...value}]));Object.assign(current.get(data.rows[0].key),patch);
    assert.equal(reviewPreparteSelections(data,current,reviewedOptions()).valid,false);
  }
});
