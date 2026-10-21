// QA-only read/export continuation. No bank submission, ledger or financial writer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bankOutputProfile} from '../../assets/own-bank-output-model.js';
import {syntheticCbu} from '../../tests/fixtures/own-bank-accounts-synthetic.js';

// Exact explicit QA profile already declared in own-bank-output-synthetic.js.
// The recipient account999/typeNULL is not used to infer the payer or a bank service.
export function nativeFinancial350BnaProfile(){
 return bankOutputProfile({destinationScope:'all',jurisdictionCode:'42',payerCbu:syntheticCbu('0110001'),currency:'ARS',compensationDate:'2026-10-08',creditDate:'2026-10-09',agreementCode:'00004455',sendNumber:'000001',information:'PRUEBA SINTETICA',loanIdentifier:'0000',calendarConfirmed:true,allowRepeatedDestinations:false});
}
const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digits=(value,width)=>assert.match(value,new RegExp('^[0-9]{'+width+'}$'),'QA_BNA200_DIGITS');
const spaces=(line,from,until)=>assert.equal(line.slice(from,until),' '.repeat(until-from),'QA_BNA200_RESERVED_SPACE');

// Independent fixed-position decoder: it never calls the exporter or assembles
// an expected detail using the exporter's concatenation expression.
export function decodeNativeBna200(bytes){
 assert.ok(bytes instanceof Uint8Array,'QA_BNA200_BYTES');
 assert.ok(bytes.length>=606&&bytes.length%202===0,'QA_BNA200_COMPLETE_LENGTH');
 assert.ok(bytes.every(value=>value===13||value===10||value>=32&&value<=90),'QA_BNA200_ASCII');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);assert.ok(text.endsWith('\r\n'),'QA_BNA200_FINAL_CRLF');
 const lines=text.split('\r\n');assert.equal(lines.pop(),'');assert.ok(lines.length>=3);
 for(const line of lines)assert.match(line,/^[A-Z0-9 ]{200}$/,'QA_BNA200_RECORD_WIDTH');
 const first=lines[0],last=lines.at(-1);assert.equal(first[0],'1');assert.equal(last[0],'3');
 for(const [value,width]of [[first.slice(1,12),11],[first.slice(12,16),4],[first.slice(16,30),14],[first.slice(31,39),8],[first.slice(63,73),10],[first.slice(73,79),6]])digits(value,width);
 assert.ok(['0','1'].includes(first[30]));assert.equal(first.slice(59,63),'SUE1');spaces(first,79,200);
 const header={issuerTaxId:first.slice(1,12),payerBranch:first.slice(12,16),payerAccountBlock:first.slice(16,30),currencyCode:first[30],compensationDate:first.slice(31,39),information:first.slice(39,59),service:first.slice(59,63),agreementCode:first.slice(63,73),sendNumber:first.slice(73,79)};
 const details=lines.slice(1,-1).map(line=>{
  assert.equal(line.slice(0,2),'20');for(const [value,width]of [[line.slice(2,24),22],[line.slice(24,34),10],[line.slice(34,40),6],[line.slice(40,49),9],[line.slice(49,60),11],[line.slice(74,85),11]])digits(value,width);
  spaces(line,60,71);assert.equal(line.slice(71,74),'102');assert.equal(line.slice(85,87),'00');spaces(line,87,100);spaces(line,104,200);
  assert.equal(line.slice(49,60),line.slice(74,85),'QA_BNA200_CUIL_DUPLICATE');assert.ok(['0000','0003'].includes(line.slice(100,104)));assert.equal(line.slice(34,40),header.sendNumber,'QA_BNA200_SEND');
  return {cbu:line.slice(2,24),cents:BigInt(line.slice(24,34)).toString(),sendNumber:line.slice(34,40),ordinal:BigInt(line.slice(40,49)).toString(),cuil:line.slice(49,60),loanIdentifier:line.slice(100,104)};
 });
 digits(last.slice(1,16),15);digits(last.slice(16,23),7);assert.equal(last.slice(23,117),'0'.repeat(94));spaces(last,117,200);
 const trailer={totalCents:BigInt(last.slice(1,16)).toString(),recordCount:Number(last.slice(16,23))};
 assert.equal(trailer.recordCount,details.length,'QA_BNA200_COUNT');assert.equal(trailer.totalCents,details.reduce((n,row)=>n+BigInt(row.cents),0n).toString(),'QA_BNA200_TOTAL');
 assert.equal(new Set(details.map(row=>row.ordinal)).size,details.length,'QA_BNA200_ORDINALS');assert.ok(details.every(row=>BigInt(row.ordinal)>0n));
 return {version:'native-bna200-decoded.qa.v1',header,details,trailer,recordBytes:200,lineEnding:'CRLF',bytes:bytes.length};
}

export function assertNativeBna200File(bytes,{profile,issuerTaxId,record,account,expectedCents}){
 bankOutputProfile(profile);const decoded=decodeNativeBna200(bytes),h=decoded.header;
 assert.equal(expectedCents,'35000','QA_BNA350_EXPECTED_AMOUNT');assert.equal(record.totals.net,'350.00','QA_BNA350_ORIGINAL_NET');
 assert.equal(profile.destinationScope,'all');assert.equal(profile.jurisdictionCode,'42');assert.equal(decoded.details.length,1);
 assert.equal(h.issuerTaxId,issuerTaxId);assert.equal(h.payerBranch,profile.payerCbu.slice(3,7));assert.equal(h.payerAccountBlock,profile.payerCbu.slice(8));assert.equal(h.currencyCode,profile.currency==='ARS'?'0':'1');assert.equal(h.compensationDate,profile.compensationDate.replaceAll('-',''));assert.equal(h.information,profile.information.padEnd(20,' '));assert.equal(h.agreementCode,profile.agreementCode.padStart(10,'0'));assert.equal(h.sendNumber,profile.sendNumber.padStart(6,'0'));
 const row=decoded.details[0];assert.equal(row.cbu,account.cbu,'QA_BNA350_APPROVED_CBU');assert.equal(row.cuil,record.cuil,'QA_BNA350_ORIGINAL_CUIL');assert.equal(row.cents,expectedCents,'QA_BNA350_ORIGINAL_CENTS');assert.equal(row.ordinal,'1');assert.equal(row.loanIdentifier,profile.loanIdentifier);assert.equal(decoded.trailer.totalCents,expectedCents);
 return decoded;
}

export function assertNativeFinancial350BnaScope({journey,sources,review,profile,expectedCents}){
 assert.deepEqual(profile,nativeFinancial350BnaProfile(),'QA_BNA350_EXPLICIT_PROFILE');assert.equal(expectedCents,'35000');
 const pins=journey.nativeFinancialContinuation?.sourcePins;assert.ok(Array.isArray(pins));assert.equal(pins.length,3);assert.deepEqual(pins.map(pin=>pin.selectedCount),[0,0,1]);assert.deepEqual(pins.map(pin=>pin.populationCount),[1,2,3]);
 const batch=sources.batch;assert.equal(batch.id,journey.receiptBatchId);assert.equal(batch.snapshotSha256,journey.receiptSnapshotSha256);assert.equal(batch.state,'approved');assert.equal(batch.sourceCurrent,true);assert.equal(batch.permissions.canDownload,true);assert.equal(batch.snapshot.sources.length,3);assert.equal(batch.snapshot.records.length,1);assert.equal(batch.snapshot.recordCount,1);assert.equal(new Set(batch.snapshot.sources.map(pin=>pin.id)).size,3);
 for(const pin of pins)assert.deepEqual(batch.snapshot.sources.find(source=>source.id===pin.id),pin,'QA_BNA350_ALL_SOURCE_PINS');
 assert.equal(sources.closes.length,3);assert.equal(new Set(sources.closes.map(close=>close.groupId)).size,3);
 for(const pin of pins){const close=sources.closes.find(row=>row.groupId===pin.id);assert.ok(close);assert.equal(close.snapshotSha256,pin.snapshotSha256);assert.equal(close.snapshot.employeeCount,pin.employeeCount);assert.equal(close.snapshot.populationCount,pin.populationCount);}
 const record=batch.snapshot.records[0];for(const[key,value]of Object.entries({contractId:journey.contractId,registrationId:journey.registrationId,runId:journey.secondRunId,liquidationVersion:2,sourceGroupId:journey.closeGroupId,employeeNumber:journey.legajo}))assert.equal(record[key],value,'QA_BNA350_RECORD_'+key);
 assert.equal(pins[2].id,journey.closeGroupId);assert.equal(record.totals.net,'350.00');
 const accounts=sources.accounts.configuration.definition.accounts.filter(account=>account.contractId===journey.contractId&&account.status==='enabled'&&account.validFrom<=profile.creditDate&&(account.validUntil===null||account.validUntil>=profile.creditDate));assert.equal(accounts.length,1);const account=accounts[0];
 assert.equal(account.cbu,syntheticCbu('9990001','0000000000350'),'QA_BNA350_ACCOUNT_UNCHANGED');assert.equal(account.accountType,null);assert.equal(account.accountNumber,'00350/00');assert.equal(account.currency,'ARS');
 assert.equal(review.kind,'bna');assert.equal(review.ready,true);assert.equal(review.recordCount,1);assert.equal(review.selectedCount,1);assert.equal(review.rows.length,1);assert.equal(review.rows[0].selected,true);assert.deepEqual(review.issues,[]);assert.deepEqual(review.rows[0].issues,[]);assert.equal(review.totalCents,expectedCents);assert.equal(review.receiptId,batch.id);assert.equal(review.receiptSha256,batch.snapshotSha256);assert.equal(review.accountsVersion,sources.accounts.configuration.version);assert.equal(review.accountsApprovalId,sources.accounts.configuration.approvalId);assert.deepEqual(review.profile,profile);
 for(const key of ['id','cbu','accountType','accountNumber','currency','validFrom','validUntil'])assert.equal(review.rows[0].account[key],account[key],'QA_BNA350_ACCOUNT_'+key);
 for(const key of ['contractId','registrationId','runId','liquidationVersion','sourceGroupId','employeeNumber','cuil'])assert.equal(review.rows[0][key],record[key],'QA_BNA350_REVIEW_'+key);
 assert.equal(review.rows[0].jurisdiction.code,'42');return {record,account,sourcePins:structuredClone(pins)};
}

export function assertNativeFinancial350BnaOutput({bytes,journey,sources,review,profile,expectedCents}){
 const scope=assertNativeFinancial350BnaScope({journey,sources,review,profile,expectedCents}),decoded=assertNativeBna200File(bytes,{profile,issuerTaxId:sources.batch.snapshot.params.issuer.taxId,record:scope.record,account:scope.account,expectedCents});
 return {version:'own-novelty-succession-bna-output-proof.v1',kind:'bna_gt_all',contractId:journey.contractId,registrationId:journey.registrationId,runId:journey.secondRunId,liquidationVersion:2,closeGroupId:journey.closeGroupId,receiptBatchId:journey.receiptBatchId,receiptSnapshotSha256:journey.receiptSnapshotSha256,sourcePins:scope.sourcePins,accountId:scope.account.id,accountType:scope.account.accountType,accountNumber:scope.account.accountNumber,accountConfigurationVersion:sources.accounts.configuration.version,accountApprovalId:sources.accounts.configuration.approvalId,profile:structuredClone(profile),fingerprint:review.fingerprint,file:{bytes:bytes.length,sha256:bytesHash(bytes),recordBytes:decoded.recordBytes,lineEnding:decoded.lineEnding,detailCount:decoded.details.length,totalCents:decoded.trailer.totalCents},generated:true,bankAdmitted:false,bankSubmitted:false,paymentExecuted:false,municipalAcceptance:false};
}
