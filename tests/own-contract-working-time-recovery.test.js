import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverOwnPeriodRead } from '../lib/own-period-read-recovery.js';
const busy=()=>Object.assign(Error('ocupación exclusivamente sintética'),{code:'WORKING_TIME_BUSY',status:409});
test('working-time read recovery reauthorizes exactly once and preserves the read-only operation',async()=>{
 let reads=0,checks=0;const result={version:'own-contract-working-time.v1',syntheticOnly:true};
 const value=await recoverOwnPeriodRead({method:'GET',operation:'bootstrap',busyCode:'WORKING_TIME_BUSY',read:async()=>{reads++;if(reads===1)throw busy();return result;},reauthorize:async()=>{checks++;return true;},waitForRecovery:async()=>{}});
 assert.equal(value,result);assert.equal(reads,2);assert.equal(checks,1);
});
test('revocation while waiting prevents a second working-time read',async()=>{
 let reads=0;const value=await recoverOwnPeriodRead({method:'GET',operation:'attempt',busyCode:'WORKING_TIME_BUSY',read:async()=>{reads++;throw busy();},reauthorize:async()=>false,waitForRecovery:async()=>{}});
 assert.equal(value,null);assert.equal(reads,1);
});
test('working-time writes are never admitted to the read-recovery helper',async()=>{
 let reads=0;await assert.rejects(()=>recoverOwnPeriodRead({method:'POST',operation:'command',busyCode:'WORKING_TIME_BUSY',read:async()=>{reads++;},reauthorize:async()=>true,waitForRecovery:async()=>{}}));assert.equal(reads,0);
});
