import {SalaryInputError,salaryDiff,salaryExact,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';

const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('COPY_INPUT_INVALID',message);};
const mapped=(row,agreementCode)=>({...row,agreementCode,dependencies:row.dependencies.map(key=>{const parts=key.split(':');parts[1]=agreementCode;return parts.join(':');}).sort()});
const sameDefinition=(a,b)=>a.kind===b.kind&&a.agreementCode===b.agreementCode&&a.categoryCode===b.categoryCode&&a.code===b.code;
const overlap=(a,b)=>a.active&&b.active&&a.validFrom<=(b.validUntil??'9999-12')&&b.validFrom<=(a.validUntil??'9999-12');

// Prepares declared concept/auxiliary definitions, never formula evaluation.
// Existing target scales must match exactly; their class is never invented or
// equated automatically. Complete-version SQL112 is still the sole write.
export function salaryCopyPlan(raw,selections,targetAgreements,classification){
 const current=salaryItems(raw),byKey=new Map(current.map(row=>[salaryRowKey(row),row]));
 requireInput(Array.isArray(selections)&&selections.length>0&&selections.length<=1000,'Seleccioná conceptos o auxiliares del mismo convenio de origen.');
 requireInput(Array.isArray(targetAgreements)&&targetAgreements.length>0&&targetAgreements.length<=1000&&targetAgreements.every(code=>typeof code==='string'&&/^[0-9]{1,9}$/.test(code))&&new Set(targetAgreements).size===targetAgreements.length,'Elegí convenios de destino distintos, sin repetirlos.');
 requireInput(Array.isArray(classification),'Volvé a consultar el catálogo de convenios y clases.');
 const selected=new Map();let sourceAgreement=null;
 for(const selection of selections){
  requireInput(salaryExact(selection,['key','before'])&&selection.before&&selection.key===salaryRowKey(selection.before)&&!selected.has(selection.key),'Una selección está repetida o no pudo verificarse.');
  const row=byKey.get(selection.key);requireInput(row&&salarySerialized(row)===salarySerialized(selection.before),'Cambió una definición seleccionada. Volvé a seleccionarla en el borrador actual.');
  requireInput(['concept','auxiliary'].includes(row.kind)&&row.active,'Sólo se preparan conceptos y auxiliares habilitados. Las escalas se revisan individualmente.');
  sourceAgreement??=row.agreementCode;requireInput(row.agreementCode===sourceAgreement,'La selección debe pertenecer a un único convenio de origen.');selected.set(selection.key,row);
 }
 requireInput(!targetAgreements.includes(sourceAgreement),'El convenio de origen no puede ser también destino.');
 for(const target of [sourceAgreement,...targetAgreements])requireInput(classification.filter(r=>r.kind==='agreements'&&r.code===target).length===1,'Un convenio de origen o destino no existe o es ambiguo en el catálogo consultado.');
 const sources=new Map();function include(row){const key=salaryRowKey(row);if(sources.has(key))return;sources.set(key,row);for(const dependency of row.dependencies)include(byKey.get(dependency));}
 for(const row of selected.values())include(row);
 const targets=[...targetAgreements].sort((a,b)=>a<b?-1:a>b?1:0),sourceRows=[...sources.values()].sort((a,b)=>salaryRowKey(a).localeCompare(salaryRowKey(b)));
 let newCount=0;for(const target of targets)for(const row of sourceRows)if(row.kind!=='scale'&&!byKey.has(salaryRowKey({...row,agreementCode:target})))newCount++;
 requireInput(current.length+newCount<=1000,'El conjunto completo excede 1.000 definiciones. No se recorta ni se divide la preparación.');
 const comparisons=[],conflicts=[],additions=[];
 for(const target of targets)for(const source of sourceRows){
  const candidate=mapped(source,target),key=salaryRowKey(candidate),existing=byKey.get(key)??null;
  const item={source:structuredClone(source),target:structuredClone(candidate),existing:existing?structuredClone(existing):null,disposition:existing?'reuse':source.kind==='scale'?'missing_scale':'new'};
  if(source.kind==='scale'&&classification.filter(row=>row.kind==='categories'&&row.agreementCode===target&&row.code===source.categoryCode).length!==1){item.disposition='missing_class';conflicts.push(item);}
  else if(existing&&salarySerialized(existing)!==salarySerialized(candidate)){item.disposition='different';conflicts.push(item);}
  else if(source.kind==='scale'&&!existing){item.disposition='missing_scale';conflicts.push(item);}
  else if(!existing){
   const intervals=current.filter(row=>sameDefinition(row,candidate)&&overlap(row,candidate));
   if(intervals.length){item.disposition='overlap';item.overlapping=intervals.map(row=>structuredClone(row));conflicts.push(item);}else additions.push(candidate);
  }
  comparisons.push(item);
 }
 if(conflicts.length){const error=new SalaryInputError('COPY_CONFLICT','Hay '+conflicts.length+' conflictos de definición, escala o vigencia. Revisalos individualmente; no se incorporó ninguna fila.');error.comparisons=comparisons;error.conflicts=conflicts;throw error;}
 const items=salaryItems([...current,...additions]),changes=salaryDiff(current,items);
 return {items,changes,comparisons,sourceAgreement,targets,selectedCount:selected.size,dependencyCount:sources.size-selected.size,newDefinitionsCount:additions.length,reusedCount:comparisons.length-additions.length};
}
