import test from 'node:test';
import assert from 'node:assert/strict';
import {pinMonthlyNativeBaselineArchive,preserveMonthlyNativeBaselineArchive} from '../scripts/lib/monthly-native-baseline-archive-preservation-qa.mjs';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
import {ownReceiptBatch} from '../assets/own-payroll-receipt-model.js';
import {ownCloseSnapshot,ownCloseReceipt} from '../assets/own-payroll-close-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {receiptBatch} from './fixtures/own-payroll-receipt-synthetic.js';
import {closeDetail,closeReceipt} from './fixtures/own-payroll-close-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

async function fixture(){
 const detail=closeDetail(1),capture=detail.captures[0],snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]}),group=closeReceipt({snapshot,snapshotSha256:ownRunHash(snapshot),replayed:true}),receipt=receiptBatch(1);
 receipt.state='approved';receipt.review={id:uid(801),decision:'approved',at:'2026-10-05T16:00:00Z',by:'Otra persona exclusivamente sintética',reason:'Aprobación independiente exclusivamente sintética'};receipt.permissions.canApprove=false;ownReceiptBatch(receipt);ownCloseReceipt(group);
 const pdf=await createOwnReceiptPdf(receipt),archive=pinMonthlyNativeBaselineArchive({capture,receipt,group,pdfBytes:pdf.bytes}),current=structuredClone(receipt);current.sourceCurrent=false;current.permissions.canDownload=false;ownReceiptBatch(current);
 return{archive,capture,receipt:current,group,groupState:'closed',pdfBytes:Buffer.from(pdf.bytes)};
}

test('archived original survives period-wide staleness while real current exporter rejects',async()=>{
 const input=await fixture(),before={...structuredClone(input),pdfBytes:Buffer.from(input.pdfBytes)},result=await preserveMonthlyNativeBaselineArchive(input);assert.deepEqual(input,before);assert.equal(result.pdfSha256,input.archive.pdfSha256);assert.equal(result.archive.bytesPreserved,true);assert.equal(result.archive.sourceCurrent,false);assert.equal(result.archive.currentDownloadAllowed,false);assert.equal(result.archive.currentExportRejected,true);assert.equal(result.archive.newCurrentPdfGenerated,false);assert.equal(result.archive.artifactKind,'previously-created-archived-pdf');await assert.rejects(()=>createOwnReceiptPdf(input.receipt),/La emisión no admite una descarga vigente/);assert.deepEqual(await preserveMonthlyNativeBaselineArchive(input),result);
});

test('mutated receipt snapshot or archived PDF is rejected rather than regenerated',async()=>{
 const input=await fixture(),changedSnapshot={...input,receipt:structuredClone(input.receipt)};changedSnapshot.receipt.snapshot.params.legend='Leyenda sintética cambiada después del pin';changedSnapshot.receipt.snapshotSha256=ownRunHash(changedSnapshot.receipt.snapshot);ownReceiptBatch(changedSnapshot.receipt);await assert.rejects(()=>preserveMonthlyNativeBaselineArchive(changedSnapshot));
 const changedPdf={...input,pdfBytes:Buffer.from(input.pdfBytes)};changedPdf.pdfBytes[changedPdf.pdfBytes.length-1]^=1;await assert.rejects(()=>preserveMonthlyNativeBaselineArchive(changedPdf),/B0_ARCHIVED_PDF_CHANGED/);
});

test('current freshness or download permission true is not accepted as conservation',async()=>{
 const input=await fixture();for(const [sourceCurrent,canDownload]of[[true,false],[true,true],[false,true]]){const receipt=structuredClone(input.receipt);receipt.sourceCurrent=sourceCurrent;receipt.permissions.canDownload=canDownload;await assert.rejects(()=>preserveMonthlyNativeBaselineArchive({...input,receipt}));}
});

test('saved result, group snapshot or reopened group cannot pass archival conservation',async()=>{
 const input=await fixture(),changedSaved={...input,capture:structuredClone(input.capture)};changedSaved.capture.saved.recordedAt='2026-10-05T16:01:00Z';await assert.rejects(()=>preserveMonthlyNativeBaselineArchive(changedSaved));
 const changedGroup={...input,group:structuredClone(input.group)};changedGroup.group.snapshot.rosterVersion='f'.repeat(64);changedGroup.group.snapshotSha256=ownRunHash(changedGroup.group.snapshot);ownCloseReceipt(changedGroup.group);await assert.rejects(()=>preserveMonthlyNativeBaselineArchive(changedGroup));await assert.rejects(()=>preserveMonthlyNativeBaselineArchive({...input,groupState:'reopened'}),/B0_GROUP_UNEXPECTEDLY_REOPENED/);
});
