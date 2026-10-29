// Test-only RAW custody of package579; never a foundation reader or SQL admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const RELEASE_PACKAGE_SOURCE_CUSTODY=Object.freeze({path:'package.json',currentCommit:'579311468cae2fd3712bb083e629c96ce879e3fa',historicalParentCommit:'7b7b5b972cb2ce2743b812fde4cccc88b83ae26d',currentBytes:9870,currentSha256:'7bcece8861efe0e2f5b846abcf422495ef4cdd418c953c8f19633c0f3cc0c1e0',historicalParentBytes:9722,historicalParentSha256:'9e9874bad0c978a0568818fd51688efa14731317ece39b8b4d9f1c3312f3e11e',offset:1104,addedBase64:'ICAgICJidWlsZDp2ZXJjZWwiOiAibm9kZSBzY3JpcHRzL3ZlcmlmeS1wbGF0Zm9ybS1iYXNlbGluZS5tanMgJiYgbm9kZSBzY3JpcHRzL3ZlcmlmeS1mcmllbmRseS1jb250YWlubWVudC5tanMgJiYgbm9kZSBzY3JpcHRzL2J1aWxkLWZyaWVuZGx5Lm1qcyIsCg=='});
// The returned bytes are historical custody ONLY. Callers retain current7bce
// as plan.sourceHashes['package.json']; do not feed these bytes to a plan reader.
export function packageJsonReleaseHistoricalParentForTest(value){
 const pin=RELEASE_PACKAGE_SOURCE_CUSTODY;assert.ok(Buffer.isBuffer(value),'PACKAGE_CUSTODY_RAW_BUFFER_REQUIRED');assert.equal(value.length,pin.currentBytes,'PACKAGE_CUSTODY_CURRENT_BYTES');assert.equal(hash(value),pin.currentSha256,'PACKAGE_CUSTODY_CURRENT_SHA256');
 const added=Buffer.from(pin.addedBase64,'base64');assert.equal(value.indexOf(added),pin.offset,'PACKAGE_CUSTODY_EXACT_SPAN_POSITION');assert.equal(value.indexOf(added,pin.offset+added.length),-1,'PACKAGE_CUSTODY_EXACT_SPAN_UNIQUE');assert.deepEqual(value.subarray(pin.offset,pin.offset+added.length),added,'PACKAGE_CUSTODY_EXACT_SPAN');
 const parent=Buffer.concat([value.subarray(0,pin.offset),value.subarray(pin.offset+added.length)]);assert.equal(parent.length,pin.historicalParentBytes,'PACKAGE_CUSTODY_PARENT_BYTES');assert.equal(hash(parent),pin.historicalParentSha256,'PACKAGE_CUSTODY_PARENT_SHA256');return parent;
}
