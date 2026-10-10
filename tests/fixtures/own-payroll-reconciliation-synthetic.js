import {postedJournalFixture} from './own-payroll-journal-synthetic.js';
import {accountingHash} from '../../assets/own-payroll-accounting-model.js';
import {RECONCILIATION_VERSION,RECONCILIATION_SOURCE_VERSION,reconciliationSourceHashValue,reconciliationStateHashValue,compareReconciliation,prepareReconciliation} from '../../assets/own-payroll-reconciliation-model.js';
export async function reconciliationFixture(count=35){
 const f=await postedJournalFixture(count),source={version:RECONCILIATION_SOURCE_VERSION,scopeVersion:f.source.scopeVersion,journal:f.detail,sourceVersion:'0'.repeat(64),complete:true};source.sourceVersion=await accountingHash(reconciliationSourceHashValue(source));
 const document={reference:'Documento de control exclusivamente sintético',issuerReference:'Emisor exclusivamente sintético',date:'2026-11-02',lines:f.detail.journal.entries.map((e,i)=>({ordinal:i+1,accountReference:e.accountReference,debit:e.debit,credit:e.credit}))};
 return {source,document};
}
export async function approvedReconciliationFixture(count=35){
 const f=await reconciliationFixture(count),body=await prepareReconciliation(f.source,f.document,'Declaración de conciliación exclusivamente sintética'),comparison=await compareReconciliation(f.source,f.document);
 const detail={version:RECONCILIATION_VERSION,id:'cccccccc-0000-4000-8000-000000090001',proposalId:'cccccccc-0000-4000-8000-000000090002',body,requestSha256:await accountingHash(body),source:f.source,comparison,comparisonSha256:body.comparisonSha256,status:'approved',stateVersion:'0'.repeat(64),sourceCurrent:true,canReview:true,authorLabel:'Autor exclusivamente sintético',decision:{id:'cccccccc-0000-4000-8000-000000090001',command:'approve',reason:'Revisión independiente exclusivamente sintética',actorLabel:'Revisor exclusivamente sintético',recordedAt:'2026-11-02T12:00:00Z'},withdrawal:null};detail.stateVersion=await accountingHash(reconciliationStateHashValue(detail));
 const boot={version:RECONCILIATION_VERSION,scopeVersion:f.source.scopeVersion,period:'2026-10',liquidationType:'monthly',journals:[],reconciliations:[{id:detail.id,proposalId:detail.proposalId,journalId:body.journalId,requestSha256:detail.requestSha256,comparisonSha256:detail.comparisonSha256,status:detail.status,reason:body.reason,authorLabel:detail.authorLabel,canReview:detail.canReview,documentReference:body.document.reference,documentDate:body.document.date,accountCount:comparison.accounts.length,lineCount:comparison.documentLineCount,decision:detail.decision,withdrawal:null}],permissions:{canPropose:true,canReview:true},complete:true,paymentExecuted:false};
 return {...f,detail,boot};
}
