// Original source evidence only. No jurisdiction assignment or payroll eligibility.
export const EMPLOYEE_SOURCE_FIELDS=Object.freeze(['iddepartamento','NOLI_12','CODI_02','CODI_07','CODI_10','FING_12','FEGR_12','ANTA_12','ANTM_12','SUEL_12','CODI_19','concursado','REGI_12','CUEN_12','NORD_05','IDREVISTA']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const exact=(v,keys)=>object(v)&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k));
const fault=()=>{throw Object.assign(new Error('GRH_CURATED_REVIEW_EMPLOYEE_FACTS_INVALID'),{code:'GRH_CURATED_REVIEW_EMPLOYEE_FACTS_INVALID'});};
const decoded=v=>v===null||typeof v==='string'&&v.length<=4096;
const meta=['sourceFields','sourceProvenance','sourceReferences'];
export function employeeSourceFacts(row){
 if(!object(row))fault();
 const state=row.employment?.activeProxy===true?'active':row.employment?.activeProxy===false?'inactive':'notDeclared';
 if(meta.every(k=>!Object.hasOwn(row,k)))return{retained:false,state,department:'notDeclared',indicator:'absent'};
 if(!meta.every(k=>Object.hasOwn(row,k))||!object(row.sourceFields)||Reflect.ownKeys(row.sourceFields).some(k=>!EMPLOYEE_SOURCE_FIELDS.includes(k))||!Object.values(row.sourceFields).every(decoded))fault();
 const p=row.sourceProvenance,s=row.sourceKey;
 if(!exact(p,['table','primaryKey'])||p.table!=='legajo'||!exact(p.primaryKey,['CODI_01','LEGA_12'])
  ||!exact(s,['companyCode','employeeNumber'])||!Object.values(s).every(v=>typeof v==='string'||Number.isSafeInteger(v))||!['CODI_01','LEGA_12'].every(k=>typeof p.primaryKey[k]==='string'&&p.primaryKey[k].length>0&&p.primaryKey[k].length<=128)
  ||p.primaryKey.CODI_01.trim()!==String(s.companyCode)||p.primaryKey.LEGA_12.trim()!==String(s.employeeNumber))fault();
 if(Object.hasOwn(row.employment??{},'activeProxy')&&typeof row.employment.activeProxy!=='boolean')fault();
 const refs=row.sourceReferences;
 if(!exact(refs,[])&&!exact(refs,['department']))fault();
 let department='notDeclared';
 if(Object.hasOwn(refs,'department')){
  const d=refs.department;
  if(!exact(d,['table','primaryKey','sourceFields'])||d.table!=='departamento'||!exact(d.primaryKey,['iddepartamento'])
   ||typeof d.primaryKey.iddepartamento!=='string'||!d.primaryKey.iddepartamento||d.primaryKey.iddepartamento.length>128
   ||!Object.hasOwn(row.sourceFields,'iddepartamento')||d.primaryKey.iddepartamento!==row.sourceFields.iddepartamento
   ||!exact(d.sourceFields,['nombre'])||!decoded(d.sourceFields.nombre))fault();
  department=d.sourceFields.nombre==='042'?'original042':d.sourceFields.nombre==='055'?'original055':'otherReference';
 }
 const value=row.sourceFields.NOLI_12;
 const indicator=!Object.hasOwn(row.sourceFields,'NOLI_12')?'absent':value===null?'null':value===''?'blank':value==='0'?'zero':value==='1'?'one':'other';
 return{retained:true,state,department,indicator};
}
export const SOURCE_FACT_STATES=Object.freeze(['active','inactive','notDeclared']);
export const SOURCE_FACT_DEPARTMENTS=Object.freeze(['original042','original055','otherReference','notDeclared']);
export const SOURCE_FACT_INDICATORS=Object.freeze(['absent','null','blank','zero','one','other']);
const zeros=keys=>Object.fromEntries(keys.map(k=>[k,0]));
export function summarizeEmployeeSourceFacts(rows){
 if(!Array.isArray(rows)||rows.length>100000)fault();
 const result={total:rows.length,retainedFacts:0,missingFacts:0,states:Object.fromEntries(SOURCE_FACT_STATES.map(k=>[k,{total:0,...zeros(SOURCE_FACT_DEPARTMENTS)}])),liquidationIndicator:zeros(SOURCE_FACT_INDICATORS)};
 for(const row of rows){const facts=employeeSourceFacts(row);result[facts.retained?'retainedFacts':'missingFacts']++;result.states[facts.state].total++;result.states[facts.state][facts.department]++;result.liquidationIndicator[facts.indicator]++;}
 return result;
}
export function verifiedEmployeeSourceSummary(value,total){
 const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=total;
 if(!Number.isSafeInteger(total)||total<0||total>100000||!exact(value,['total','retainedFacts','missingFacts','states','liquidationIndicator'])||value.total!==total
  ||![value.retainedFacts,value.missingFacts].every(count)||value.retainedFacts+value.missingFacts!==total||!exact(value.states,SOURCE_FACT_STATES)
  ||!exact(value.liquidationIndicator,SOURCE_FACT_INDICATORS)||!Object.values(value.liquidationIndicator).every(count)
  ||Object.values(value.liquidationIndicator).reduce((a,b)=>a+b,0)!==total)fault();
 let statesTotal=0,knownReferences=0;
 for(const key of SOURCE_FACT_STATES){const state=value.states[key];if(!exact(state,['total',...SOURCE_FACT_DEPARTMENTS])||!Object.values(state).every(count)
  ||SOURCE_FACT_DEPARTMENTS.reduce((n,k)=>n+state[k],0)!==state.total)fault();statesTotal+=state.total;knownReferences+=state.original042+state.original055+state.otherReference;}
 if(statesTotal!==total||knownReferences>value.retainedFacts||value.liquidationIndicator.absent<value.missingFacts)fault();
 const freeze=v=>{for(const item of Object.values(v))if(item&&typeof item==='object')freeze(item);return Object.freeze(v);};
 return freeze(structuredClone(value));
}
