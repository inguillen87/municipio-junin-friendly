import test from 'node:test';import assert from 'node:assert/strict';
import {recoverOwnPeriodRead,OWN_PERIOD_READ_RECOVERY_WAIT_MS} from '../lib/own-period-read-recovery.js';
const busy=()=>Object.assign(Error('original occupied read'),{status:409,code:'PARTICIPATION_BUSY'});
const options={method:'GET',operation:'bootstrap',busyCode:'PARTICIPATION_BUSY'};
test('one fixed pause separates exactly two reads and precedes fresh authorization',async()=>{
 const events=[],value={exact:'original verified result'};let reads=0;const result=await recoverOwnPeriodRead({...options,read:async()=>{events.push('read');if(++reads===1)throw busy();return value;},waitForRecovery:async ms=>{assert.equal(ms,1000);assert.equal(ms,OWN_PERIOD_READ_RECOVERY_WAIT_MS);events.push('wait');},reauthorize:async()=>{events.push('authorize');return true;}});assert.equal(result,value);assert.deepEqual(events,['read','wait','authorize','read']);assert.equal(reads,2);
});
test('permission withdrawn during the pause prevents the second read',async()=>{
 let allowed=true,reads=0,auth=0;const result=await recoverOwnPeriodRead({...options,read:async()=>{reads++;throw busy();},waitForRecovery:async()=>{allowed=false;},reauthorize:async()=>{auth++;return allowed;}});assert.equal(result,null);assert.equal(reads,1);assert.equal(auth,1);
});
test('a changed scope detected after the pause retains its original error without another SQL read',async()=>{
 const error=Object.assign(Error('scope changed'),{status:409,code:'PARTICIPATION_SCOPE_CHANGED'});let reads=0,waits=0;await assert.rejects(recoverOwnPeriodRead({...options,read:async()=>{reads++;throw busy();},waitForRecovery:async()=>{waits++;},reauthorize:async()=>{throw error;}}),e=>e===error);assert.equal(reads,1);assert.equal(waits,1);
});
test('persistent occupation is propagated after one pause and two reads without another attempt',async()=>{
 const error=busy();let reads=0,waits=0,auth=0;await assert.rejects(recoverOwnPeriodRead({...options,read:async()=>{reads++;throw error;},waitForRecovery:async()=>{waits++;},reauthorize:async()=>{auth++;return true;}}),e=>e===error);assert.deepEqual([reads,waits,auth],[2,1,1]);
});
test('a failed pause cannot issue another read or replace it with a command',async()=>{
 const error=Error('pause interrupted');let reads=0,auth=0;await assert.rejects(recoverOwnPeriodRead({...options,read:async()=>{reads++;throw busy();},waitForRecovery:async()=>{throw error;},reauthorize:async()=>{auth++;return true;}}),e=>e===error);assert.equal(reads,1);assert.equal(auth,0);
});
test('successful and other failed reads never pause or authorize again',async()=>{
 for(const error of [null,Object.assign(Error('source changed'),{status:409,code:'PARTICIPATION_SOURCE_CHANGED'}),Object.assign(busy(),{status:503})]){let waits=0,auth=0,reads=0;const run=()=>recoverOwnPeriodRead({...options,read:async()=>{reads++;if(error)throw error;return 7;},waitForRecovery:async()=>{waits++;},reauthorize:async()=>{auth++;return true;}});if(error)await assert.rejects(run,e=>e===error);else assert.equal(await run(),7);assert.deepEqual([reads,waits,auth],[1,0,0]);}
});
test('POST, commands and an invalid pause dependency are rejected before any action',async()=>{
 for(const patch of [{method:'POST'},{operation:'command'},{waitForRecovery:1000}]){let calls=0;await assert.rejects(recoverOwnPeriodRead({...options,read:async()=>{calls++;},reauthorize:async()=>{calls++;return true;},waitForRecovery:async()=>{calls++;},...patch}),/RECOVERY_INVALID/);assert.equal(calls,0);}
});
