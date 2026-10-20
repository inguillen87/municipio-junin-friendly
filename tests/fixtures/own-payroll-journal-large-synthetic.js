// Public-safe invented855x20 inputs; declared fixture approvals/posted state only.
// No SQL, municipal records, credentials or real accounting decisions.
import {largeCapacityCloseDetail} from './own-payroll-large-capacity-synthetic.js';
import {closeCommand,closeReceipt} from './own-payroll-close-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {accountingHash} from '../../assets/own-payroll-accounting-model.js';
import {calculateImputation,imputationSourceHashValue,IMPUTATION_SOURCE_VERSION} from '../../assets/own-payroll-imputation-model.js';
import {JOURNAL_VERSION,JOURNAL_SOURCE_VERSION,journalSourceHashValue,journalStateHashValue,calculateJournal} from '../../assets/own-payroll-journal-model.js';

async function imputationSource(){
 const detail=largeCapacityCloseDetail();
 for(const c of detail.captures){
  c.body={...c.body,version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31'};
  c.version='own-payroll-run.v2';
  c.bodySha256=await accountingHash(c.body);
 }
 const snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]});
 snapshot.version='own-close-snapshot.v2';
 for(const employee of snapshot.employees)employee.jurisdiction={code:'42',basis:'captured_own_registration',sourceSha256:'d'.repeat(64)};
 const body=closeCommand({period:detail.period,liquidationType:detail.liquidationType,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion});
 const group=closeReceipt({body,bodySha256:await accountingHash(body),snapshot,snapshotSha256:await accountingHash(snapshot),recordedAt:'2026-11-01T12:00:00.000Z'});
 const definitions=new Map(),employees=new Map(snapshot.employees.map(e=>[e.contractId,e]));
 for(const concept of snapshot.concepts){
  if(concept.nature==='auxiliary')continue;
  const employee=employees.get(concept.contractId),key=[employee.jurisdiction.code,employee.agreementCode,employee.departmentCode,concept.conceptCode].join(':');
  if(!definitions.has(key))definitions.set(key,{fiscalYear:'2026',jurisdictionCode:employee.jurisdiction.code,agreementCode:employee.agreementCode,departmentCode:employee.departmentCode,conceptCode:concept.conceptCode,nature:concept.nature,budgetItemReference:'PARTIDA-SINTETICA-'+concept.conceptCode,supplierReference:'PROVEEDOR-SINTETICO',creditorReference:null,accountingAccountReference:'CUENTA-CONTABLE-SINTETICA',bankAccountReference:null,bankReference:null,validFrom:'2026-01-01',validUntil:'2026-12-31',ruleReference:'Documento de destino exclusivamente sintético'});
 }
 const configuration={version:'c'.repeat(64),revision:1,definition:{mappings:[...definitions.values()],assignments:snapshot.employees.map(e=>({contractId:e.contractId,conceptCode:null,institutionalReference:'INSTITUCION-SINTETICA',functionReference:'FUNCION-SINTETICA',validFrom:'2026-01-01',validUntil:null,ruleReference:'Documento institucional exclusivamente sintético'}))},proposalId:uid(74001),approvalId:uid(74002)};
 const dateSources=detail.captures.map(c=>({runId:c.id,body:structuredClone(c.body),bodySha256:c.bodySha256,inputSha256:c.saved.inputSha256}));
 const source={version:IMPUTATION_SOURCE_VERSION,scopeVersion:'e'.repeat(64),fiscalYear:'2026',group,state:'closed',configuration,dateSources,sourceVersion:'f'.repeat(64),complete:true};
 source.sourceVersion=await accountingHash(imputationSourceHashValue(source));
 return {source,originalCapture:detail.captures[0]};
}

export async function largeJournalWorkspace(){
 const {source:imputation}=await imputationSource(),allocation=calculateImputation(imputation),allocationSha256=await accountingHash(allocation);
 const imputationBody={version:'own-payroll-imputation.v1',command:'propose',groupId:imputation.group.groupId,fiscalYear:imputation.fiscalYear,scopeVersion:imputation.scopeVersion,sourceVersion:imputation.sourceVersion,allocationSha256,baseRevision:0,proposalId:null,proposalSha256:null,reason:'Fundamento exclusivamente sintético de capacidad contable',reviewConfirmed:true};
 const proposal={id:uid(75001),requestSha256:await accountingHash(imputationBody),sourceVersion:imputationBody.sourceVersion,allocationSha256,groupId:imputationBody.groupId,fiscalYear:imputationBody.fiscalYear,baseRevision:0,reason:imputationBody.reason,createdAt:'2026-11-01T13:00:00.000Z',authorLabel:'Autor exclusivamente sintético',employeeCount:855,conceptCount:17100,canReview:true,status:'approved',decision:{command:'approve',reason:'Revisión independiente exclusivamente sintética',actorLabel:'Revisor sintético',recordedAt:'2026-11-01T14:00:00.000Z',revision:1}};
 const approvedDetail={version:'own-payroll-imputation.v1',scopeVersion:imputation.scopeVersion,proposal,body:imputationBody,source:imputation,allocation,allocationSha256,sourceCurrent:true};
 const source={version:JOURNAL_SOURCE_VERSION,scopeVersion:approvedDetail.scopeVersion,basis:'imputation',imputation:approvedDetail,original:null,sourceVersion:'0'.repeat(64),complete:true};source.sourceVersion=await accountingHash(journalSourceHashValue(source));
 const postingDate='2026-11-02',rules=allocation.groups.map((group,index)=>({ordinal:index+1,side:index%2?'credit':'debit',counterAccountReference:'CONTRAPARTIDA-QA-'+index,documentReference:'Documento exclusivamente sintético del par '+index}));
 const journal=await calculateJournal(source,postingDate,rules),journalSha256=await accountingHash(journal);
 const body={version:JOURNAL_VERSION,command:'propose',basis:'imputation',sourceId:approvedDetail.proposal.id,scopeVersion:source.scopeVersion,sourceVersion:source.sourceVersion,postingDate,rules,journalSha256,proposalId:null,proposalSha256:null,reason:'Registro contable exclusivamente sintético',reviewConfirmed:true};
 const detail={version:JOURNAL_VERSION,id:uid(80001),proposalId:uid(80002),body,requestSha256:await accountingHash(body),source,journal,journalSha256,status:'posted',kind:'initial',postingDate,number:1,stateVersion:'0'.repeat(64),sourceCurrent:true,canReview:false,authorLabel:'Autor sintético',decision:{id:uid(80001),command:'post',reason:'Revisión y registro exclusivamente sintéticos',actorLabel:'Revisor independiente sintético',recordedAt:'2026-11-03T12:00:00.000Z'},reversedBy:null};detail.stateVersion=await accountingHash(journalStateHashValue(detail));
 const receipt={version:JOURNAL_VERSION,eventId:uid(80003),proposalId:uid(80003),requestKey:uid(80004),requestSha256:await accountingHash(body),body,status:'pending',number:null,journalSha256,sourceVersion:source.sourceVersion,replayed:false,accountingPosted:false,paymentExecuted:false};
 return {source,detail,journal,body,receipt,rules,postingDate};
}
