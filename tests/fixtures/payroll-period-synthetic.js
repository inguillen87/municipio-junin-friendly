import {syntheticDetail} from '../../scripts/payroll-detail-synthetic.mjs';
export const periodUuid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
export function periodFixture(size=30){
 const employee={contractId:periodUuid(1),name:'Persona sintética de prueba',legajo:'0001'},range={from:'2024-01',to:'2026-12',type:''};
 const items=Array.from({length:size},(_,i)=>{const n=i%12+1,year=(size>800?1900:2024)+Math.floor(i/12),month=String(n).padStart(2,'0');return{datasetId:periodUuid(100+i),payrollDate:year+'-'+month+'-28',sourcePeriod:year,sourceMonth:n,payrollType:'M',closureStatus:'closed',sourceLabel:'Fuente sintética de prueba; sin datos municipales',importedAt:'2026-09-01T12:00:00Z',conceptCount:11,versionsAvailable:1,historySummaryAvailable:false};});
 const library={version:'payroll-document-library.v1',found:true,items,total:size,truncated:false,officialReceipt:false,signatureApplied:false};
 const state={modifyCatalog:null,modifyDetail:null,wait:null,denied:false,active:0,peak:0},calls=[],perItem=new Map();let catalogueReads=0;
 async function request(url){
  const q=Object.fromEntries(new URL(url,'http://localhost').searchParams);calls.push(q);if(state.denied)throw Object.assign(Error('Synthetic private read denied'),{status:403});state.active++;state.peak=Math.max(state.peak,state.active);
  try{if(state.wait)await state.wait(q);if(q.contractId!==employee.contractId)throw Error('Unexpected synthetic subject');
   if(q.resource==='employeepayrolldocuments'){const copy=structuredClone(library);catalogueReads++;state.modifyCatalog?.(copy,catalogueReads);return{ok:true,data:copy};}
   if(q.resource!=='employeepayrolldetail')throw Error('Unexpected synthetic reader');const i=items.findIndex(x=>x.payrollDate===q.date&&x.sourcePeriod===Number(q.period)&&x.sourceMonth===Number(q.month)&&x.payrollType===q.type);if(i<0)throw Error('Unknown selected run');
   const item=items[i],raw={...syntheticDetail(),datasetId:item.datasetId,statementId:periodUuid(10000+i),payrollDate:item.payrollDate,sourcePeriod:item.sourcePeriod,sourceMonth:item.sourceMonth,payrollType:item.payrollType,closureStatus:item.closureStatus,sourceLabel:item.sourceLabel};
   const reading=(perItem.get(i)||0)+1;perItem.set(i,reading);state.modifyDetail?.(raw,i,reading);return{ok:true,data:raw};
  }finally{state.active--;}
 }
 return{employee,range,library,items,state,calls,perItem,request,get catalogueReads(){return catalogueReads;}};
}
