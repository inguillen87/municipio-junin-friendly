// QA archival conservation is separate from the product's period-wide current
// download policy. This module never changes permissions or creates a receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownRunCapture} from '../../assets/own-payroll-run-model.js';
import {ownCloseReceipt} from '../../assets/own-payroll-close-model.js';
import {ownReceiptBatch} from '../../assets/own-payroll-receipt-model.js';
import {createOwnReceiptPdf} from '../../assets/own-payroll-receipt-pdf.js';
const bytesHash=value=>createHash('sha256').update(value).digest('hex'),hash=value=>bytesHash(salarySerialized(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export function pinMonthlyNativeBaselineArchive({capture,receipt,group,pdfBytes}){
 ownRunCapture(capture);ownReceiptBatch(receipt);ownCloseReceipt(group);assert.ok(capture.saved);assert.equal(receipt.state,'approved');assert.equal(receipt.sourceCurrent,true);assert.equal(receipt.permissions.canDownload,true);assert.equal(group.body.command,'close');
 assert.equal(receipt.snapshotSha256,hash(receipt.snapshot));assert.equal(group.snapshotSha256,hash(group.snapshot));assert.equal(capture.saved.inputSha256,hash(capture.saved.input));assert.equal(capture.saved.resultSha256,hash(capture.saved.result));
 assert.equal(receipt.snapshot.sources.length,1);assert.equal(receipt.snapshot.sources[0].id,group.groupId);assert.equal(receipt.snapshot.sources[0].snapshotSha256,group.snapshotSha256);assert.equal(receipt.snapshot.recordCount,1);assert.equal(receipt.snapshot.records[0].runId,capture.id);assert.equal(group.snapshot.employeeCount,1);assert.equal(group.snapshot.employees[0].runId,capture.id);
 const bytes=Buffer.from(pdfBytes);assert.ok(bytes.length>100);assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
 return freeze({version:'monthly-native-baseline-archive.v1',captureId:capture.id,saved:structuredClone(capture.saved),receiptId:receipt.id,receiptSnapshot:structuredClone(receipt.snapshot),receiptSnapshotSha256:receipt.snapshotSha256,receiptState:receipt.state,receiptReview:structuredClone(receipt.review),group:structuredClone(group),pdfBase64:bytes.toString('base64'),pdfSha256:bytesHash(bytes),pdfByteCount:bytes.length,pinnedBeforeAdditionalClose:true});
}

export async function preserveMonthlyNativeBaselineArchive({archive,capture,receipt,group,groupState,pdfBytes}){
 assert.equal(archive?.version,'monthly-native-baseline-archive.v1');assert.equal(archive.pinnedBeforeAdditionalClose,true);ownRunCapture(capture);ownReceiptBatch(receipt);ownCloseReceipt(group);
 assert.equal(capture.id,archive.captureId);assert.deepEqual(capture.saved,archive.saved);assert.equal(receipt.id,archive.receiptId);assert.deepEqual(receipt.snapshot,archive.receiptSnapshot);assert.equal(receipt.snapshotSha256,archive.receiptSnapshotSha256);assert.equal(hash(receipt.snapshot),archive.receiptSnapshotSha256);assert.equal(receipt.state,archive.receiptState);assert.deepEqual(receipt.review,archive.receiptReview);
 assert.deepEqual(group,archive.group);assert.equal(hash(group.snapshot),archive.group.snapshotSha256);assert.equal(groupState,'closed','B0_GROUP_UNEXPECTEDLY_REOPENED');
 const bytes=Buffer.from(pdfBytes);assert.deepEqual(bytes,Buffer.from(archive.pdfBase64,'base64'),'B0_ARCHIVED_PDF_CHANGED');assert.equal(bytes.length,archive.pdfByteCount);assert.equal(bytesHash(bytes),archive.pdfSha256);
 // This callback runs only AFTER the distinct principal345 close. SQL126's
 // source hash covers all closes/reopens in that period/type, so stale is the
 // required state even though this B0 group remains closed and immutable.
 assert.equal(receipt.sourceCurrent,false,'B0_PERIOD_FRESHNESS_EXPECTED_STALE');assert.equal(receipt.permissions.canDownload,false,'B0_CURRENT_DOWNLOAD_MUST_REMAIN_DENIED');
 await assert.rejects(()=>createOwnReceiptPdf(receipt),error=>error instanceof Error&&error.message==='La emisión no admite una descarga vigente.','B0_CURRENT_EXPORT_MUST_BE_REJECTED');
 return{capture:structuredClone(capture.saved),receipt:structuredClone(receipt.snapshot),receiptSha256:receipt.snapshotSha256,group:structuredClone(group),pdfSha256:archive.pdfSha256,archive:{version:'monthly-native-baseline-archive-conservation.v1',receiptId:receipt.id,pdfByteCount:archive.pdfByteCount,pdfSha256:archive.pdfSha256,bytesPreserved:true,immutableSnapshotPreserved:true,groupState:'closed',sourceCurrent:false,currentDownloadAllowed:false,currentExportRejected:true,artifactKind:'previously-created-archived-pdf',newCurrentPdfGenerated:false}};
}
