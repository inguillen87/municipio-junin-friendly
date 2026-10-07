import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {readAdoptedCloseSqlFixture} from './verify-adopted-own-payroll-close-contract.mjs';
import {verifiedOwnReceiptPreview,ownReceiptBatch,ownReceiptVerifyHash,ownReceiptEvent,ownReceiptSelf} from '../assets/own-payroll-receipt-model.js';
export async function readAdoptedReceiptSqlFixture(file){
 const value=await readAdoptedCloseSqlFixture(file),r=value.fixture.receiptFixtures;
 await verifiedOwnReceiptPreview(r.fullPreview);await verifiedOwnReceiptPreview(r.exactPreview);
 for(const name of ['fullBatch','approved','exactBatch','invalidated','oldReceiptBatch','oldReceiptAfter']){ownReceiptBatch(r[name]);await ownReceiptVerifyHash(r[name].snapshot,r[name].snapshotSha256);}
 for(const e of [r.fullEvent,r.exactEvent]){ownReceiptEvent(e);await ownReceiptVerifyHash(e.body,e.bodySha256);}
 assert.deepEqual(r.oldReceiptBatch,r.oldReceiptAfter);assert.equal(r.fullBatch.snapshot.recordCount,29);assert.equal(r.exactBatch.snapshot.recordCount,1);
 assert.deepEqual(r.fullBatch.snapshot,r.fullPreview.snapshot);assert.deepEqual(r.exactBatch.snapshot,r.exactPreview.snapshot);
 const close=value.fixture.receipt.snapshot;
 for(const record of r.fullBatch.snapshot.records){const original=close.employees.find(e=>e.contractId===record.contractId);assert.ok(original);assert.deepEqual(record.totals,Object.fromEntries(Object.entries(original.totals).filter(([k])=>k!=='contractId')));assert.equal(record.concepts.length,original.conceptCount);for(const concept of record.concepts){const source=close.concepts.find(c=>c.contractId===record.contractId&&c.conceptCode===concept.code);assert.deepEqual([concept.amount,concept.nature,concept.unit],[source.amount,source.nature,source.unit]);}}
 for(const item of r.selfFixtures){ownReceiptSelf(item);assert.equal(item.items.length,1);assert.deepEqual(item.items[0].record,r.fullBatch.snapshot.records.find(x=>x.contractId===item.items[0].record.contractId));}
 assert.equal(r.invalidated.permissions.canDownload,false);assert.equal(r.invalidated.sourceCurrent,false);assert.deepEqual(r.invalidated.snapshot,r.approved.snapshot);
 return {...value,report:{...value.report,oldReceiptsPreserved:true,allReceiptConceptsComparedToClosedCalculation:true,ownAgentIsolation:true}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv.length,3);console.log(JSON.stringify((await readAdoptedReceiptSqlFixture(process.argv[2])).report));}
