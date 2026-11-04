// Pure historical FORMAT fixtures. No scripts/SQL builders, database, runtime
// transport, municipal values or claim of a current native v1/v2 calculation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {historicalReportFixture} from './own-payroll-report-synthetic.js';
import {jurisdictionFixture} from './own-payroll-jurisdiction-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {verifiedOwnCloseReceipt} from '../../assets/own-payroll-close-model.js';

const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const versions=['own-close-snapshot.v1','own-close-snapshot.v2'];

export function ownReportCensusLegacyFixtureSources(){return[historicalReportFixture('2026-08','monthly',8101).receipts[0],jurisdictionFixture(2).receipts[0]];}

export async function prepareOwnReportCensusLegacyFixtures(currentPeriod){
 assert.equal(currentPeriod,'2026-10','CENSUS190_LEGACY_DATED_FIXTURE_REVIEW_REQUIRED');
 const[v1,v2]=ownReportCensusLegacyFixtureSources();
 // Same re-key/re-period pattern as historicalReportFixture. Never relabel
 // v1 as v2, add jurisdiction or alter salary values, concepts or exact traces.
 v2.id=uid(8102);v2.groupId=v2.id;v2.key=uid(9102);
 v2.body.period='2026-09';v2.snapshot.period='2026-09';
 v2.bodySha256=hash(v2.body);v2.snapshotSha256=hash(v2.snapshot);
 const fixtures=[v1,v2];
 for(const[index,receipt]of fixtures.entries()){
  await verifiedOwnCloseReceipt(receipt);
  assert.equal(receipt.snapshot.version,versions[index]);
  assert.ok(receipt.snapshot.period<currentPeriod);
  assert.equal(receipt.snapshot.employeeCount,2);assert.equal(receipt.snapshot.populationCount,2);assert.equal(receipt.snapshot.populationComplete,true);
  assert.equal(receipt.body.command,'close');assert.equal(receipt.body.groupId,null);assert.equal(receipt.id,receipt.groupId);assert.equal(receipt.replayed,false);
 }
 assert.equal(new Set(fixtures.map(value=>value.id)).size,2);assert.equal(new Set(fixtures.map(value=>value.key)).size,2);
 return fixtures;
}
