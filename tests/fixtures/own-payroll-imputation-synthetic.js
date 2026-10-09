import {reportFixture} from './own-payroll-report-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {accountingHash} from '../../assets/own-payroll-accounting-model.js';
import {imputationSourceHashValue,IMPUTATION_SOURCE_VERSION,verifiedImputation} from '../../assets/own-payroll-imputation-model.js';
import {IMPUTATION_VERSION} from '../../assets/own-payroll-imputation-workspace-model.js';
import {decimal,rational,exactAdd,exactSubtract,quantize} from '../../assets/own-payroll-exact.js';

// Manufactured closures and declared jurisdictions for model-only tests.
// PostgreSQL integration must obtain dates, closures and approval from SQL.
export async function imputationFixture(count=28){
 const f=reportFixture(count),group=f.receipts[0],s=group.snapshot;
 s.version='own-close-snapshot.v2';
 s.employees.forEach((e,i)=>{e.jurisdiction={code:i%2?'55':'42',basis:'captured_own_registration',sourceSha256:'d'.repeat(64)};});
 group.snapshotSha256=await accountingHash(s);
 const dateSources=[];
 for(const c of f.details[0].captures){const body={...c.body,version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31'};dateSources.push({runId:c.id,body,bodySha256:await accountingHash(body),inputSha256:c.saved.inputSha256});}
 const definitions=new Map(),employees=new Map(s.employees.map(e=>[e.contractId,e]));
 for(const r of s.concepts){if(r.nature==='auxiliary')continue;const e=employees.get(r.contractId),key=[e.jurisdiction.code,e.agreementCode,e.departmentCode,r.conceptCode].join(':');
  if(!definitions.has(key))definitions.set(key,{fiscalYear:'2026',jurisdictionCode:e.jurisdiction.code,agreementCode:e.agreementCode,departmentCode:e.departmentCode,conceptCode:r.conceptCode,nature:r.nature,budgetItemReference:'PARTIDA-SINTETICA-'+r.conceptCode,supplierReference:'PROVEEDOR-SINTETICO',creditorReference:null,accountingAccountReference:'CUENTA-CONTABLE-SINTETICA',bankAccountReference:null,bankReference:null,validFrom:'2026-01-01',validUntil:'2026-12-31',ruleReference:'Documento de destino exclusivamente sintético'});
 }
 const configuration={version:'c'.repeat(64),revision:1,definition:{mappings:[...definitions.values()],assignments:s.employees.map(e=>({contractId:e.contractId,conceptCode:null,institutionalReference:'INSTITUCION-SINTETICA',functionReference:'FUNCION-SINTETICA',validFrom:'2026-01-01',validUntil:null,ruleReference:'Documento institucional exclusivamente sintético'}))},proposalId:uid(74001),approvalId:uid(74002)};
 const source={version:IMPUTATION_SOURCE_VERSION,scopeVersion:'e'.repeat(64),fiscalYear:'2026',group,state:'closed',configuration,dateSources,sourceVersion:'f'.repeat(64),complete:true};
 source.sourceVersion=await accountingHash(imputationSourceHashValue(source));return source;
}
export async function rehashImputationFixture(s){s.group.bodySha256=await accountingHash(s.group.body);s.group.snapshotSha256=await accountingHash(s.group.snapshot);for(const d of s.dateSources)d.bodySha256=await accountingHash(d.body);s.sourceVersion=await accountingHash(imputationSourceHashValue(s));return s;}
export async function remeasureSyntheticClosure(source,precision){
 const s=source.group.snapshot,keys=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];s.precision=precision;
 const sums=Object.fromEntries(keys.map(k=>[k,rational(0n)]));
 for(const e of s.employees){e.precision=precision;const totals=Object.fromEntries(keys.map(k=>[k,rational(0n)]));
  for(const row of s.concepts.filter(r=>r.contractId===e.contractId))if(row.nature!=='auxiliary')totals[row.nature]=exactAdd(totals[row.nature],decimal(row.amount));
  totals.gross=exactAdd(totals.remuneration,totals.non_remuneration);totals.net=exactSubtract(totals.gross,totals.deduction);
  e.totals={contractId:e.contractId,...Object.fromEntries(keys.map(k=>[k,quantize(totals[k],{precision,mode:'exact'}).amount]))};
  for(const k of keys)sums[k]=exactAdd(sums[k],totals[k]);
 }
 s.totals=Object.fromEntries(keys.map(k=>[k,quantize(sums[k],{precision,mode:'exact'}).amount]));return rehashImputationFixture(source);
}
export async function imputationWorkspaceFixture(count=28){
 const source=await imputationFixture(count),allocation=await verifiedImputation(source),allocationSha256=await accountingHash(allocation);
 const preview={version:IMPUTATION_VERSION,source,allocation,allocationSha256,revision:0};
 const boot={version:IMPUTATION_VERSION,scopeVersion:source.scopeVersion,period:source.group.snapshot.period,liquidationType:source.group.snapshot.liquidationType,groups:[{id:source.group.groupId,state:'closed',snapshotSha256:source.group.snapshotSha256,employeeCount:source.group.snapshot.employeeCount,populationCount:source.group.snapshot.populationCount,populationComplete:source.group.snapshot.populationComplete,recordedAt:'2026-10-09T12:00:00Z',actorLabel:'Persona sintética QA'}],proposals:[],permissions:{canPropose:true,canReview:true},complete:true,accountingPosted:false,paymentExecuted:false};
 const body={version:IMPUTATION_VERSION,command:'propose',groupId:source.group.groupId,fiscalYear:source.fiscalYear,scopeVersion:source.scopeVersion,sourceVersion:source.sourceVersion,allocationSha256,baseRevision:0,proposalId:null,proposalSha256:null,reason:'Fundamento exclusivamente sintético de imputación',reviewConfirmed:true};
 const proposal={id:uid(75001),requestSha256:await accountingHash(body),sourceVersion:body.sourceVersion,allocationSha256,groupId:body.groupId,fiscalYear:body.fiscalYear,baseRevision:0,reason:body.reason,createdAt:'2026-10-09T12:00:00Z',authorLabel:'Autor exclusivamente sintético',employeeCount:source.group.snapshot.employeeCount,conceptCount:source.group.snapshot.conceptCount,canReview:true,status:'pending',decision:null};boot.proposals=[proposal];
 const detail={version:IMPUTATION_VERSION,scopeVersion:source.scopeVersion,proposal,body:structuredClone(body),source,allocation,allocationSha256,sourceCurrent:true};
 const receipt={version:IMPUTATION_VERSION,eventId:proposal.id,proposalId:proposal.id,requestKey:'bbbbbbbb-0000-4000-8000-000000075003',requestSha256:proposal.requestSha256,body:structuredClone(body),status:'pending',revision:0,allocationSha256,sourceVersion:body.sourceVersion,replayed:false,accountingPosted:false,paymentExecuted:false};
 return {source,preview,boot,body,detail,receipt};
}
