import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {qaBrowserJsonSnapshot} from '../scripts/lib/qa-browser-json-snapshot.mjs';

function retainedResponse({wire='{"ok":false,"code":"OWN_RUN_SOURCE_AMBIGUOUS"}',status=422,error=null}={}) {
  let phase='before-headers',reads=0,resolveHeaders;
  const unavailable=Error('Protocol error (Network.getResponseBody): No data found for resource with given identifier');
  const headers=new Promise(resolve=>{resolveHeaders=resolve;});
  const response={
    status:()=>status,
    async json() {
      reads++;
      if(phase==='idle')throw unavailable;
      if(error)throw error;
      return JSON.parse(wire);
    }
  };
  async function click() {
    phase='response';
    resolveHeaders(response);
    // Deterministic lifecycle boundary, not an elapsed-time tolerance.
    await nextTurn();
  }
  function idle(){phase='idle';}
  return {headers,response,click,idle,unavailable,reads:()=>reads,phase:()=>phase};
}

test('counterfactual: a Response retained until after idle loses its body',async()=>{
  const timeline=retainedResponse();
  const responsePromise=timeline.headers;
  await timeline.click();
  const response=await responsePromise;
  timeline.idle();
  await assert.rejects(response.json(),error=>error===timeline.unavailable);
  assert.equal(timeline.reads(),1);
});

test('eager real-helper snapshot survives the same idle boundary with one body read',async()=>{
  const timeline=retainedResponse();
  const snapshot=timeline.headers.then(qaBrowserJsonSnapshot);
  const [packet]=await Promise.all([snapshot,timeline.click()]);
  assert.equal(timeline.reads(),1,'body must have been consumed before idle');
  timeline.idle();
  assert.deepEqual(packet,{status:422,body:{ok:false,code:'OWN_RUN_SOURCE_AMBIGUOUS'}});
  assert.equal(timeline.phase(),'idle');
  assert.equal(timeline.reads(),1,'using the detached packet never rereads CDP');
});

test('malformed JSON remains a failure with one read and no fallback',async()=>{
  const timeline=retainedResponse({wire:'{"ok":'});
  const snapshot=timeline.headers.then(qaBrowserJsonSnapshot);
  await assert.rejects(Promise.all([snapshot,timeline.click()]),SyntaxError);
  assert.equal(timeline.reads(),1);
});

test('a rejected body preserves the original error and is not retried',async()=>{
  const original=Error('Synthetic body transport failure');
  const timeline=retainedResponse({error:original});
  const snapshot=timeline.headers.then(qaBrowserJsonSnapshot);
  await assert.rejects(Promise.all([snapshot,timeline.click()]),error=>error===original);
  assert.equal(timeline.reads(),1);
});

test('snapshot never converts 401 or a wrong rejection code into the expected 422 oracle',async()=>{
  for(const scenario of [
    {status:401,wire:'{"ok":false,"code":"IDENTITY_SESSION_INVALID"}'},
    {status:422,wire:'{"ok":false,"code":"SYNTHETIC_WRONG_CODE"}'}
  ]) {
    const timeline=retainedResponse(scenario);
    const [packet]=await Promise.all([timeline.headers.then(qaBrowserJsonSnapshot),timeline.click()]);
    timeline.idle();
    assert.equal(packet.status,scenario.status);
    assert.equal(packet.body.code,JSON.parse(scenario.wire).code);
    assert.equal(packet.status===422&&packet.body.code==='OWN_RUN_SOURCE_AMBIGUOUS',false);
    assert.equal(timeline.reads(),1);
  }
});
