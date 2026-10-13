import assert from 'node:assert/strict';
import {readSalaryBootstrap} from '../../assets/native-salary-stream-model.js';

// Decode only blocks actually observed by the browser under test. A separate
// SQL read cannot stand in for the permission refresh that reached the product.
export function observedSalaryBootstrap(frames,start){
 return readSalaryBootstrap(index=>{const frame=frames[start+index];assert.ok(frame,'BROWSER_SALARY_BLOCK_MISSING');assert.equal(frame.pageIndex,index,'BROWSER_SALARY_BLOCK_ORDER');return frame;});
}
