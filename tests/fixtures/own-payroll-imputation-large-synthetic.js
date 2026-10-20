// Invented model-only855x20 accounting inputs. No SQL, municipal records or authority.
import {largeCapacityCloseDetail} from './own-payroll-large-capacity-synthetic.js';
import {closeCommand,closeReceipt} from './own-payroll-close-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {accountingHash} from '../../assets/own-payroll-accounting-model.js';
import {calculateImputation,imputationSourceHashValue,IMPUTATION_SOURCE_VERSION} from '../../assets/own-payroll-imputation-model.js';
import {IMPUTATION_VERSION} from '../../assets/own-payroll-imputation-workspace-model.js';

export async function largeImputationSource(){
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

export async function largeImputationWorkspace(){
 const {source,originalCapture}=await largeImputationSource(),allocation=calculateImputation(source),allocationSha256=await accountingHash(allocation);
 const preview={version:IMPUTATION_VERSION,source,allocation,allocationSha256,revision:0};
 const body={version:IMPUTATION_VERSION,command:'propose',groupId:source.group.groupId,fiscalYear:source.fiscalYear,scopeVersion:source.scopeVersion,sourceVersion:source.sourceVersion,allocationSha256,baseRevision:0,proposalId:null,proposalSha256:null,reason:'Fundamento exclusivamente sintético de capacidad contable',reviewConfirmed:true};
 const proposal={id:uid(75001),requestSha256:await accountingHash(body),sourceVersion:body.sourceVersion,allocationSha256,groupId:body.groupId,fiscalYear:body.fiscalYear,baseRevision:0,reason:body.reason,createdAt:'2026-11-01T13:00:00.000Z',authorLabel:'Autor exclusivamente sintético',employeeCount:855,conceptCount:17100,canReview:true,status:'pending',decision:null};
 const detail={version:IMPUTATION_VERSION,scopeVersion:source.scopeVersion,proposal,body:structuredClone(body),source,allocation,allocationSha256,sourceCurrent:true};
 const receipt={version:IMPUTATION_VERSION,eventId:proposal.id,proposalId:proposal.id,requestKey:uid(75003),requestSha256:proposal.requestSha256,body:structuredClone(body),status:'pending',revision:0,allocationSha256,sourceVersion:body.sourceVersion,replayed:false,accountingPosted:false,paymentExecuted:false};
 return {source,allocation,preview,detail,body,receipt,originalCapture};
}
