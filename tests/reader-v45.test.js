import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {unzipSync,strFromU8} from 'fflate';
import {officialCapture,officialCloseDetail,officialCloseReceipt,hash} from './fixtures/own-payroll-official-close-synthetic.js';
import {reportGroup} from './fixtures/own-payroll-report-synthetic.js';
import {bankOutputFixture} from './fixtures/own-bank-output-synthetic.js';
import {buildOwnOfficialCloseSnapshot} from '../assets/own-payroll-official-snapshot-model.js';
import {verifiedOwnReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportPdf,reportXlsx} from '../assets/report-document.js';
import {verifiedOwnComparison,ownComparisonDocument} from '../assets/own-payroll-comparison-model.js';
import {prepareOwnPlanilla} from '../assets/own-payroll-receipt-planilla-model.js';
import {ownPlanillaCsv,ownPlanillaXlsx,ownPlanillaPdf} from '../assets/own-payroll-receipt-planilla-export.js';
import {ownReceiptSnapshot,ownReceiptSelf} from '../assets/own-payroll-receipt-model.js';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
import {prepareBankOutput} from '../assets/own-bank-output-model.js';

const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const clone=structuredClone;
const textOf=bytes=>[...Buffer.from(bytes).toString().matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
function source(name='days14_both_omitted',number=1){
 const detail=officialCloseDetail(name,number),capture=detail.captures[0];
 const rows=capture.payload.population.employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:uid(30000+i),identityToken:e.identityToken,jurisdictionCode:i%2?'55':'42'}));
 capture.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:rows.length,rows};
 capture.payloadSha256=hash(capture.payload);
 const snapshot=buildOwnOfficialCloseSnapshot(detail,{kind:'all',values:[]}),receipt=officialCloseReceipt(snapshot);
 detail.groups=[reportGroup(receipt)];for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 return {detail,capture,receipt,query:{from:snapshot.period,to:snapshot.period,types:[snapshot.liquidationType]}};
}
async function bundle(f){const b=await verifiedOwnReportBundle(f.query,[f.detail],[f.receipt]);b.captures=[f.capture];return b;}
function emission(f){
 const bank=bankOutputFixture(f.receipt.snapshot.employeeCount),s=f.receipt.snapshot,c=f.capture;
 const records=s.employees.map((e,i)=>{
  const identity=bank.batch.snapshot.records[i],rows=s.concepts.filter(r=>r.contractId===e.contractId);
  const economicConcepts=rows.map(r=>({code:r.conceptCode,label:c.payload.programState.salaryCatalog.items.find(d=>d.code===r.conceptCode&&d.nature===r.nature&&d.kind===(r.nature==='auxiliary'?'auxiliary':'concept')).label,nature:r.nature,unit:r.unit,amount:r.amount,labelSourceSha256:c.payloadSha256}));
  const concepts=economicConcepts.filter(r=>r.nature!=='auxiliary'&&e.receiptRowKeys.includes(e.contractId+':concept:'+r.code));
  const omissionAudit=e.rowEmissions.filter(d=>d.decision==='omit').map(d=>({decision:d,calculatedRow:rows.find(r=>r.nature!=='auxiliary'&&r.conceptCode===d.conceptCode),quantity:e.quantities.find(q=>q.conceptCode===d.conceptCode),labeledConcept:economicConcepts.find(r=>r.nature!=='auxiliary'&&r.code===d.conceptCode)}));
  const {contractId:ignored,...totals}=e.totals,{contractId:ignored2,...lineTotals}=e.lineTotals;
  return {...Object.fromEntries(['contractId','employeeNumber','agreementCode','departmentCode','runId','liquidationVersion','precision','namespaceVersion','inputVersion','resultVersion','inputSha256','resultSha256','totalReconciliation','quantities','familyTariffDecisions','familyTariffRecord','rowEmissions','receiptRowKeys'].map(k=>[k,clone(e[k])])),sourceGroupId:f.receipt.groupId,personId:identity.personId,registrationId:uid(30000+i),name:identity.name,dni:identity.dni,cuil:identity.cuil,totals,lineTotals,concepts,payloadSha256:c.payloadSha256,sourceEvidence:clone(s.sources.find(r=>r.runId===e.runId)),economicRows:clone(rows),economicConcepts,economicConceptCount:economicConcepts.length,omissionAudit,omittedRowCount:omissionAudit.length};
 });
 const snapshot={...bank.batch.snapshot,version:s.version.replace('close','receipt'),params:{...bank.batch.snapshot.params,period:s.period,paymentDate:bank.profile.creditDate},sources:[{id:f.receipt.groupId,snapshotSha256:f.receipt.snapshotSha256,period:s.period,type:s.liquidationType,employeeCount:s.employeeCount,populationCount:s.populationCount,selectedCount:s.employeeCount}],records,recordCount:records.length,conceptCount:records.reduce((n,r)=>n+r.concepts.length,0),economicConceptCount:records.reduce((n,r)=>n+r.economicConceptCount,0),omittedRowCount:records.reduce((n,r)=>n+r.omittedRowCount,0),identityBasis:'owned_registration_verified_at_capture'};
 bank.batch.snapshot=snapshot;bank.batch.snapshotSha256=hash(snapshot);bank.closes=[f.receipt];
 bank.accounts.sources.contracts=records.map(r=>({contractId:r.contractId,registrationId:r.registrationId,employeeNumber:r.employeeNumber,name:r.name}));
 bank.accounts.configuration.definition.accounts.forEach((a,i)=>a.contractId=records[i].contractId);
 return bank;
}

for(const name of ['days14_both_omitted','legacy_v4_unchanged','full_population37','tariff_v2_eligible_two','tariff_v2_days14_unread_null']){
 test(name+': payroll, full economic detail, statement, variables, CSV/XLSX/PDF use frozen official values',async()=>{
  const f=source(name),prior=JSON.stringify(f),b=await bundle(f),s=f.receipt.snapshot;
  const payroll=ownReportDocument(b),concepts=ownReportDocument(b,emptyOwnReportFilters(),'concepts'),statement=ownReportDocument(b,emptyOwnReportFilters(),'statement');
  assert.equal(payroll.rows.length,s.employeeCount);assert.equal(payroll.rows[0][7],s.employees[0].totals.net);
  assert.equal(concepts.rows.length,s.conceptCount);assert.ok(concepts.rows.some(r=>r[3]==='302'));assert.ok(concepts.rows.some(r=>r[3]==='306'));
  assert.equal(statement.payrollStatement.version,'own-payroll-statement.v2');assert.equal(statement.payrollStatement.reconciliation[5][1],s.totals.net);
  assert.equal(statement.payrollStatement.reconciliation[5][2],s.lineTotals.net);
  const csv=reportCsv(statement);for(const row of statement.rows)assert.ok(csv.includes(row[7]));assert.ok(reportPdf(statement).length>1000);
  const xlsx=unzipSync(reportXlsx(statement));assert.ok(strFromU8(xlsx['xl/worksheets/sheet3.xml']).includes(f.receipt.snapshotSha256));
  assert.ok(strFromU8(xlsx['xl/worksheets/sheet5.xml']).includes(s.lineTotals.net));
  for(const view of ['variables','variable_usage','variable_sources','legajo']){
   const d=ownReportDocument(b,emptyOwnReportFilters(),view);assert.ok(d.rows.length>0);assert.doesNotMatch(JSON.stringify(d.rows),/undefined/);assert.ok(reportCsv(d).length>100);assert.ok(reportPdf(d).length>1000);
  }
  assert.equal(JSON.stringify(f),prior);
 });
}

test('statement retains 200.02 line net, 200.01 official net, and -0.01 adjustment without adding a payroll concept',async()=>{
 const f=source(),d=ownReportDocument(await bundle(f),emptyOwnReportFilters(),'statement');
 assert.deepEqual(d.payrollStatement.reconciliation[5],['Neto','200.01','200.02','0.01']);
 assert.equal(d.payrollStatement.originalEvidence[0].totalReconciliation.netDifferenceFromLines,'-0.01');
 for(const mutate of [x=>x.payrollStatement.reconciliation[5][1]='200.02',x=>x.payrollStatement.originalEvidence[0].totalReconciliation.netDifferenceFromLines='0.00',x=>x.payrollStatement.originalEvidence=[],x=>x.payrollStatement.originalEvidence.push(clone(x.payrollStatement.originalEvidence[0]))]){
  const bad=clone(d);mutate(bad);assert.throws(()=>reportCsv(bad));assert.throws(()=>reportXlsx(bad));assert.throws(()=>reportPdf(bad));
 }
 const legacy=clone(d);legacy.payrollStatement.version='own-payroll-statement.v1';delete legacy.payrollStatement.originalEvidence;assert.throws(()=>reportCsv(legacy));
});

test('comparison preserves omitted zero economic rows and compares official totals from two immutable V5 runs',async()=>{
 const base=officialCapture('days14_both_omitted',10),target=officialCapture('eligible_positive',11),m=await verifiedOwnComparison(base,target);
 assert.equal(m.rows.length,12);for(const code of ['302','306'])assert.ok(m.rows.some(r=>r.label===code&&r.before.amount==='0.00'));
 assert.equal(m.totals.find(r=>r.label==='Neto calculado').before.amount,'200.01');
 assert.ok(reportCsv(ownComparisonDocument(m,'totals')).includes('200.01'));
 const bad=clone(base);bad.saved.result.employeeTotals[0].net='200.02';bad.saved.resultSha256=hash(bad.saved.result);await assert.rejects(verifiedOwnComparison(bad,target));
});

test('resolved tariff variables use the immutable recorded decision while the original capture remains NULL',async()=>{
 const f=source('tariff_v2_eligible_two'),before=JSON.stringify(f.capture),d=ownReportDocument(await bundle(f),emptyOwnReportFilters(),'variables');
 const rows=d.rows.filter(row=>row[2].startsWith('family_tariff_L80 / '));
 assert.equal(rows.length,2);assert.ok(rows.every(row=>row[3]==='2800.00000000'&&row[7].includes('Fila tarifaria conservada:')));
 assert.ok(f.capture.saved.input.employees.every(e=>e.inputs.find(i=>i.key==='family_tariff_L80').value===null));assert.equal(JSON.stringify(f.capture),before);
});
test('unread tariff remains No consultada and is never silently resolved or made zero',async()=>{
 const f=source('tariff_v2_days14_unread_null'),before=JSON.stringify(f.capture),d=ownReportDocument(await bundle(f),emptyOwnReportFilters(),'variables');
 const rows=d.rows.filter(row=>row[2].startsWith('family_tariff_'));
 assert.equal(rows.length,10);assert.ok(rows.every(row=>row[3]==='No consultada'&&row[7].includes('No consultada en este cálculo')));assert.equal(JSON.stringify(f.capture),before);
});

for(const name of ['days14_both_omitted','legacy_v4_unchanged'])test(name+': receipt/self/planilla/bank retain the official net and full economic evidence',async()=>{
 const f=source(name),{batch,accounts,profile,closes}=emission(f),r=batch.snapshot.records[0];ownReceiptSnapshot(batch.snapshot);
 const self={version:'own-receipt-self.v1',items:[{batchId:batch.id,preparedAt:batch.preparedAt,approvedAt:batch.review.at,params:Object.fromEntries(Object.entries(batch.snapshot.params).filter(([k])=>!['types','filters'].includes(k))),record:r,source:Object.fromEntries(Object.entries(batch.snapshot.sources[0]).filter(([k])=>!['employeeCount','populationCount','selectedCount'].includes(k))),signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false}]};
 ownReceiptSelf(self);const pdf=await createOwnReceiptPdf(self,{self:true}),text=textOf(pdf.bytes);
 assert.match(text,/200,01/);assert.match(text,/200,02/);assert.match(text,/-0,01/);
 const planilla=await prepareOwnPlanilla(batch,closes,'42');assert.equal(planilla.totals.net,'200.01');assert.equal(planilla.records[0].economicConcepts.length,12);
 const xlsx=unzipSync(ownPlanillaXlsx(planilla));for(const code of ['302','306'])assert.ok(strFromU8(xlsx['xl/worksheets/sheet3.xml']).includes('>'+code+'<'));
 assert.ok(ownPlanillaCsv(planilla).includes('200.01'));
 const sheet=await ownPlanillaPdf(planilla);assert.match(textOf(sheet.bytes),/-0,01/);
 const bank=await prepareBankOutput(batch,accounts,profile,closes);assert.equal(bank.ready,true);assert.equal(bank.totalCents,'20001');assert.equal(bank.bankSubmitted,false);assert.equal(bank.paymentExecuted,false);
 if(name==='days14_both_omitted'){
  assert.equal(r.omittedRowCount,2);assert.equal(r.concepts.length,2);assert.doesNotMatch(text,/HIJO\/S DISCAPACITADO|ESCOLARIDAD PRIMARIA/);
  // Los dos PDF sintéticos sólo se guardan cuando se pide una carpeta para revisarlos a la vista; la prueba no escribe fuera del repositorio.
  if(process.env.MC_READER_QA_ARTIFACTS){const out=pathToFileURL(resolve(process.env.MC_READER_QA_ARTIFACTS)+sep);mkdirSync(out,{recursive:true});writeFileSync(new URL('RECIBO_SINTETICO_V5.pdf',out),pdf.bytes);writeFileSync(new URL('PLANILLA_SINTETICA_V5.pdf',out),sheet.bytes);}
 }else{assert.equal(r.omittedRowCount,0);assert.equal(r.concepts.length,4);assert.match(text,/ESCOLARIDAD PRIMARIA/);}
});

test('bank preparation keeps a private copy across asynchronous verification of the complete sources',async()=>{
 const f=source(),{batch,accounts,profile,closes}=emission(f),original=clone({batch,accounts,closes});
 const pending=prepareBankOutput(batch,accounts,profile,closes);
 queueMicrotask(()=>{batch.snapshot.records[0].totals.net='999.99';accounts.sources.contracts[0].name='Mutated after verification started';closes[0].snapshot.employees[0].employeeNumber='MUTATED';});
 const bank=await pending;assert.equal(bank.ready,true);assert.equal(bank.rows[0].net,'200.01');assert.equal(bank.totalCents,'20001');assert.equal(bank.rows[0].name,original.batch.snapshot.records[0].name);
});

test('self PDF verification and rendering use one private copy despite caller mutation during await',async()=>{
 const f=source(),{batch}=emission(f),r=batch.snapshot.records[0];
 const self={version:'own-receipt-self.v1',items:[{batchId:batch.id,preparedAt:batch.preparedAt,approvedAt:batch.review.at,params:Object.fromEntries(Object.entries(batch.snapshot.params).filter(([k])=>!['types','filters'].includes(k))),record:r,source:Object.fromEntries(Object.entries(batch.snapshot.sources[0]).filter(([k])=>!['employeeCount','populationCount','selectedCount'].includes(k))),signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false}]};
 const pending=createOwnReceiptPdf(self,{self:true});queueMicrotask(()=>{self.items[0].record.totals.net='999.99';});
 const pdf=await pending,text=textOf(pdf.bytes);assert.match(text,/200,01/);assert.doesNotMatch(text,/999,99/);assert.equal(self.items[0].record.totals.net,'999.99');
});
