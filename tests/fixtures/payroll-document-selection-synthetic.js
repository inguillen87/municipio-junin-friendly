// Synthetic staff and source metadata. Not copied from a municipal backup.
import {internalPayrollDocumentBatch} from '../../lib/internal-payroll-document-batch.js';
export const BATCH_TENANT='11111111-1111-4111-8111-111111111111';
export const BATCH_DATASET='22222222-2222-4222-8222-222222222222';
export const BATCH_SNAPSHOT='a'.repeat(64);
export const batchContract=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
export const batchBinding={tenantId:BATCH_TENANT,database:'grh_qa',companyId:101};
export function batchFixture(size=62){
 const records=Array.from({length:size},(_,i)=>{const n=i+1,sectorCode=n<=40?'02':n<=55?'10':'11';
  return{number:String(n).padStart(4,'0'),assignments:n===59?[]:n===60?[{contractId:batchContract(n),name:'Repetido QA',sectorCode,sectorLabel:'Sector QA '+sectorCode},{contractId:batchContract(160),name:'Repetido QA',sectorCode,sectorLabel:'Sector QA '+sectorCode}]:[{contractId:batchContract(n),name:n===61?'':'Agente QA '+n,sectorCode:n===62?null:sectorCode,sectorLabel:n===62?null:'Sector QA '+sectorCode}]};});
 const metadata={id:BATCH_DATASET,date:'2026-08-31',period:2026,month:8,type:'M',closureStatus:'closed',payloadHash:'b'.repeat(64),sourceHash:'c'.repeat(64),sourceLabel:'Detalle QA',total:size,directoryCutoff:'2026-09-10T18:17:30Z'};
 const roster={version:'payroll-export-roster.v1',found:true,official:false,datasetId:BATCH_DATASET,date:metadata.date,type:'M',closureStatus:'closed',sourceLabel:'Detalle QA',payloadHash:metadata.payloadHash,reportHash:'d'.repeat(64),total:size,rows:records.map(r=>({legajo:r.number,name:'No usar en selección',dni:'PRIVATE_DNI',cuil:'PRIVATE_CUIL',sex:null,contractMatches:1,identityCutoff:'2026-09-10',contractStatus:'active',concept993:'123.45',concept995:'0.00'}))};
 const calls=[];let rosterReads=0,deniedAfter=null;
 const sql={query:async(text,values)=>{calls.push({text,values});if(text.includes('payroll-batch:metadata'))return [structuredClone(metadata)];if(text.includes('payroll-batch:directory'))return structuredClone(records);throw Error('UNEXPECTED_TEST_QUERY');}};
 const readRoster=async()=>{rosterReads++;return deniedAfter!==null&&rosterReads>=deniedAfter?{status:403,payload:{ok:false,error:'Denied QA'}}:{status:200,payload:{ok:true,data:structuredClone(roster)}};};
 return{records,metadata,roster,sql,calls,readRoster,get rosterReads(){return rosterReads;},set deniedAfter(n){deniedAfter=n;}};
}
export function batchCatalog(){return{ok:true,data:{version:'payroll-source-report.v1',mode:'catalog',official:false,total:1,truncated:false,items:[{datasetId:BATCH_DATASET,date:'2026-08-31',type:'M',statementCount:62,lineCount:248,closureStatus:'closed',payloadHash:'b'.repeat(64),sourceLabel:'Detalle QA'}]}};}
export async function batchPreview(query={},fixture=batchFixture()){
 return internalPayrollDocumentBatch(fixture.sql,{query:{resource:'payrolldocumentbatch',datasetId:BATCH_DATASET,...query}},batchBinding,BATCH_SNAPSHOT,{readRoster:fixture.readRoster});
}
