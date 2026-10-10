import {imputationWorkspaceFixture,rehashImputationFixture} from './own-payroll-imputation-synthetic.js';
import {verifiedImputation} from '../../assets/own-payroll-imputation-model.js';
import {accountingHash} from '../../assets/own-payroll-accounting-model.js';
import {JOURNAL_VERSION,JOURNAL_SOURCE_VERSION,journalSourceHashValue,journalStateHashValue,prepareJournal,calculateJournal} from '../../assets/own-payroll-journal-model.js';
export async function journalFixture(count=35,mutate=()=>{}){
 const f=await imputationWorkspaceFixture(count),s=f.source;
 s.configuration.definition.mappings.forEach((r,i)=>r.accountingAccountReference='CUENTA-PRINCIPAL-QA-'+i);
 s.configuration.definition.assignments.forEach((r,i)=>r.institutionalReference='INSTITUCION-SINTETICA-'+i);await mutate(s);await rehashImputationFixture(s);
 const allocation=await verifiedImputation(s),allocationSha256=await accountingHash(allocation),d=f.detail;
 d.source=s;d.allocation=allocation;d.allocationSha256=allocationSha256;Object.assign(d.body,{sourceVersion:s.sourceVersion,allocationSha256});
 Object.assign(d.proposal,{sourceVersion:s.sourceVersion,allocationSha256,requestSha256:await accountingHash(d.body),status:'approved',decision:{command:'approve',reason:'Revisión independiente exclusivamente sintética',actorLabel:'Revisor sintético',recordedAt:'2026-10-10T12:00:00Z',revision:1}});
 const source={version:JOURNAL_SOURCE_VERSION,scopeVersion:d.scopeVersion,basis:'imputation',imputation:d,original:null,sourceVersion:'0'.repeat(64),complete:true};source.sourceVersion=await accountingHash(journalSourceHashValue(source));
 const rules=allocation.groups.map((g,i)=>({ordinal:i+1,side:i%2?'credit':'debit',counterAccountReference:'CONTRAPARTIDA-QA-'+i,documentReference:'Documento exclusivamente sintético del par '+i}));
 return {source,rules,postingDate:'2026-10-31'};
}
export async function postedJournalFixture(count=35){
 const f=await journalFixture(count),body=await prepareJournal(f.source,f.postingDate,f.rules,'Registro contable exclusivamente sintético'),journal=await calculateJournal(f.source,f.postingDate,f.rules);
 const detail={version:JOURNAL_VERSION,id:'bbbbbbbb-0000-4000-8000-000000080001',proposalId:'bbbbbbbb-0000-4000-8000-000000080002',body,requestSha256:await accountingHash(body),source:f.source,journal,journalSha256:body.journalSha256,status:'posted',kind:'initial',postingDate:f.postingDate,number:1,stateVersion:'0'.repeat(64),sourceCurrent:true,canReview:false,authorLabel:'Autor sintético',decision:{id:'bbbbbbbb-0000-4000-8000-000000080001',command:'post',reason:'Revisión y registro exclusivamente sintéticos',actorLabel:'Revisor independiente sintético',recordedAt:'2026-10-10T12:00:00Z'},reversedBy:null};detail.stateVersion=await accountingHash(journalStateHashValue(detail));return {...f,detail};
}
