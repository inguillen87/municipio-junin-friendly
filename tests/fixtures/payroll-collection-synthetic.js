// The existing synthetic batch reader plus synthetic source detail; no municipal data.
import {batchFixture,batchPreview,batchCatalog,batchContract,BATCH_DATASET} from './payroll-document-selection-synthetic.js';
import {syntheticDetail} from '../../scripts/payroll-detail-synthetic.mjs';
export function collectionFixture(size=55){
 const fixture=batchFixture(size),calls=[],perPerson=new Map();let simultaneous=0,maximum=0;
 const state={delay:0,modifyPage:null,modifyDetail:null,denied:false,wait:null};
 const catalogue=()=>{const c=batchCatalog();Object.assign(c.data.items[0],{statementCount:size,lineCount:size*11});return c;};
 async function request(url,{signal}={}){
  signal?.throwIfAborted();const q=Object.fromEntries(new URL(url,'https://collection.invalid').searchParams);calls.push(q);
  if(state.wait)await state.wait(q);if(state.denied)throw Object.assign(Error('Denied synthetic request'),{status:403});
  if(q.resource==='payrollsourcereport')return catalogue();
  if(q.resource==='payrolldocumentbatch'){
   const r=await batchPreview(q,fixture);if(r.status!==200)throw Object.assign(Error('Synthetic batch changed'),{status:r.status});
   if(state.modifyPage)await state.modifyPage(r.payload.data,q);return r.payload;
  }
  if(q.resource!=='employeepayrolldetail')throw Error('UNEXPECTED_SYNTHETIC_REQUEST');
  const n=Number(q.contractId?.slice(-12));if(q.contractId!==batchContract(n)||n<1||n>size)throw Error('WRONG_SYNTHETIC_CONTRACT');
  const count=(perPerson.get(n)??0)+1;perPerson.set(n,count);simultaneous++;maximum=Math.max(maximum,simultaneous);
  try{
   if(state.delay)await new Promise(r=>setTimeout(r,state.delay));signal?.throwIfAborted();const data=syntheticDetail();
   Object.assign(data,{datasetId:BATCH_DATASET,statementId:batchContract(n),statementHash:String(n).padStart(64,'0'),sourceHash:fixture.metadata.sourceHash,payrollDate:fixture.metadata.date,sourcePeriod:fixture.metadata.period,sourceMonth:fixture.metadata.month,payrollType:fixture.metadata.type,closureStatus:fixture.metadata.closureStatus});
   if(state.modifyDetail)await state.modifyDetail(data,n,count,q);return{ok:true,data};
  }finally{simultaneous--;}
 }
 return{fixture,state,calls,perPerson,request,catalogue,get maximum(){return maximum;},preview:async(q={})=>(await batchPreview(q,fixture)).payload.data};
}
