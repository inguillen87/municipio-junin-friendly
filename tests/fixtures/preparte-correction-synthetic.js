// A complete synthetic review population based on the real preparte reconstructor.
// No production data, clock connection or payroll write.
import {createHash} from 'node:crypto';
import {preparteSynthetic} from './attendance-preparte-synthetic.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function correctionPreparte(count=60){
  const data=await preparteSynthetic(),template=data.rows.find(row=>row.canPropose);
  data.rows=Array.from({length:count},(_,index)=>({...structuredClone(template),key:hash('synthetic-person-'+index),
    evidenceHash:hash('synthetic-evidence-'+index),name:'Persona QA '+(index+1),legajo:String(99000+index)}));
  data.summary={people:count,readyForReview:count,withIncidents:0};data.evidenceHash=hash(JSON.stringify(data.rows));
  return data;
}
export const reviewedOptions=()=>({documentReference:'Listado sintético de Personal, versión 1',confirmed:true});
export const decisionsFor=data=>new Map(data.rows.map(row=>[row.key,{selected:true,hours:'04:00',cap:'3',percent:'3'}]));
