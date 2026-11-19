// Explicit native-contract scope. Individual definitions and saved V1 captures stay unchanged.
import {salaryExact as shape,salaryUuid,salaryHash,salaryKey,salarySerialized,salaryJsonbBytes,SalaryInputError} from './native-salary-catalog-model.js';
import {FAMILY_PAYROLL_FACTS_MAX_ROWS,FAMILY_PAYROLL_FACTS_MAX_BYTES,FAMILY_PAYROLL_FACT_QUANTITIES,
 familyPayrollFactsDefinition,familyPayrollFactsItems,familyPayrollFactsSource,familyPayrollFactsSummary,familyPayrollFactsHash} from './own-contract-family-payroll-facts-model.js';

export const FAMILY_SELECTED_VERSION='own-contract-family-payroll-facts.v2';
const need=(ok,message,code='INPUT_INVALID')=>{if(!ok)throw new SalaryInputError('FAMILY_PAYROLL_FACTS_'+code,message);};
const exact=(v,keys)=>shape(v,keys)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value')&&d.enumerable);
const periodValid=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const text=(v,min,max)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=min&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v);
const list=(v,max,empty=true)=>need(Array.isArray(v)&&v.length<=max&&(empty||v.length>0)&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value')),'La selección debe estar completa, sin huecos ni propiedades adicionales.','CONTRACT_INVALID');
const size=v=>need(salaryJsonbBytes(v)<=FAMILY_PAYROLL_FACTS_MAX_BYTES,'La selección supera su capacidad. No se recortaron filas.','LIMIT');
const permissions=v=>need(exact(v,['canPropose','canReview'])&&Object.values(v).every(x=>typeof x==='boolean'),'No se verificaron los permisos.','CONTRACT_INVALID');
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);

export function familySelectedIds(v){
 list(v,FAMILY_PAYROLL_FACTS_MAX_ROWS,false);let previous='';
 for(const id of v){need(salaryUuid(id)&&id===id.toLowerCase()&&id>previous,'Elegí contratos nativos distintos, ordenados por su identidad canónica.');previous=id;}
 return v;
}
export function familySelectedQuery(v){
 need(exact(v,['period','contractIds'])&&periodValid(v.period),'Elegí período y contratos.');familySelectedIds(v.contractIds);size(v);return v;
}
function matchSelection(items,ids){
 need(items.length===ids.length&&items.every((item,i)=>item.contractId===ids[i]),'El contenido debe corresponder exactamente a los contratos elegidos.','POPULATION_CHANGED');
}
function matchSource(items,source,ids){
 matchSelection(source.subjects,ids);matchSelection(items,ids);
 need(items.every((item,i)=>item.identityToken===source.subjects[i].identityToken),'Cambió la identidad de un contrato seleccionado. Volvé a consultar.','IDENTITY_CHANGED');
}
export function familySelectedCommand(v){
 need(exact(v,['version','contractIds','command','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','items','reason','reviewConfirmed'])&&v.version===FAMILY_SELECTED_VERSION&&['propose','approve','reject'].includes(v.command)&&periodValid(v.period)&&[v.scopeVersion,v.baseVersion,v.sourceVersion].every(salaryHash)&&text(v.reason,10,1000)&&typeof v.reviewConfirmed==='boolean','Revisá operación, selección, período, versiones y fundamento.');
 familySelectedIds(v.contractIds);
 if(v.command==='propose'){
  need(v.proposalId===null&&v.proposalSha256===null&&v.reviewConfirmed===false,'La propuesta queda para revisión de otra persona.');
  familyPayrollFactsItems(v.items,v.period,{empty:false});matchSelection(v.items,v.contractIds);
 }else need(salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256)&&v.items===null&&v.reviewConfirmed===true,'Elegí la propuesta y confirmá su revisión independiente.');
 size(v);return v;
}
export function familySelectedConfiguration(v,period,ids){
 need(exact(v,['version','items','records'])&&salaryHash(v.version),'No se verificó la base de la selección.','CONTRACT_INVALID');
 familyPayrollFactsItems(v.items,period);list(v.records,FAMILY_PAYROLL_FACTS_MAX_ROWS);
 const allowed=new Set(ids);let previous='';
 for(const r of v.records){
  need(exact(r,['contractId','identityToken','revision','definition','approvalId'])&&salaryUuid(r.contractId)&&r.contractId===r.contractId.toLowerCase()&&r.contractId>previous&&allowed.has(r.contractId)&&salaryHash(r.identityToken)&&Number.isInteger(r.revision)&&r.revision>0&&r.revision<=1000&&salaryUuid(r.approvalId),'Una declaración de la base no tiene identidad, aprobación o alcance válido.','CONTRACT_INVALID');
  previous=r.contractId;familyPayrollFactsDefinition(r.definition,period);
 }
 need(same(v.items,v.records.map(({contractId,identityToken,definition})=>({contractId,identityToken,definition}))),'La base no conserva la procedencia de cada contrato.','CONTRACT_INVALID');size(v);return v;
}
export function familySelectedSummary(v){
 need(exact(v,['id','requestSha256','baseVersion','sourceVersion','itemCount','reason','createdAt','authorLabel','canReview','status','decision','contractIds']),'No se verificó la propuesta seleccionada.','CONTRACT_INVALID');
 const {contractIds,...legacy}=v;familyPayrollFactsSummary(legacy);familySelectedIds(contractIds);need(v.itemCount===contractIds.length,'La propuesta tiene otro alcance.','CONTRACT_INVALID');return v;
}
function summaries(v){list(v,1000);const ids=new Set();for(const p of v){familySelectedSummary(p);need(!ids.has(p.id),'Hay propuestas repetidas.','CONTRACT_INVALID');ids.add(p.id);}}
export function familySelectedHistory(v){
 need(exact(v,['version','period','proposals','permissions','complete','payrollCalculated','payrollPosted'])&&v.version===FAMILY_SELECTED_VERSION&&periodValid(v.period)&&v.complete===true&&v.payrollCalculated===false&&v.payrollPosted===false,'No se verificó el historial del período.','CONTRACT_INVALID');permissions(v.permissions);summaries(v.proposals);return v;
}
export function familySelectedBootstrap(v){
 need(exact(v,['version','period','contractIds','scopeVersion','source','configuration','proposals','legacyPendingProposals','permissions','complete','payrollCalculated','payrollPosted'])&&v.version===FAMILY_SELECTED_VERSION&&periodValid(v.period)&&salaryHash(v.scopeVersion)&&v.complete===true&&v.payrollCalculated===false&&v.payrollPosted===false,'No se verificó la selección y su período.','CONTRACT_INVALID');
 familySelectedIds(v.contractIds);familyPayrollFactsSource(v.source);matchSelection(v.source.subjects,v.contractIds);familySelectedConfiguration(v.configuration,v.period,v.contractIds);permissions(v.permissions);summaries(v.proposals);
 list(v.legacyPendingProposals,1000);const seen=new Set();for(const p of v.legacyPendingProposals){familyPayrollFactsSummary(p);need(p.status==='pending'&&!seen.has(p.id),'No se verificó el pendiente del conjunto completo.','CONTRACT_INVALID');seen.add(p.id);}
 return v;
}
export async function familySelectedDetail(v){
 need(exact(v,['version','period','contractIds','scopeVersion','proposal','body','baseItems','source','current','permissions'])&&v.version===FAMILY_SELECTED_VERSION&&periodValid(v.period)&&salaryHash(v.scopeVersion)&&typeof v.current==='boolean','No se verificó el detalle de la selección.','CONTRACT_INVALID');
 familySelectedIds(v.contractIds);familySelectedSummary(v.proposal);familySelectedCommand(v.body);familyPayrollFactsItems(v.baseItems,v.period);familyPayrollFactsSource(v.source);permissions(v.permissions);
 need(v.body.command==='propose'&&v.body.period===v.period&&same(v.contractIds,v.body.contractIds)&&same(v.contractIds,v.proposal.contractIds)&&v.body.baseVersion===v.proposal.baseVersion&&v.body.sourceVersion===v.proposal.sourceVersion&&v.source.version===v.body.sourceVersion&&v.body.reason===v.proposal.reason&&v.proposal.requestSha256===await familyPayrollFactsHash(v.body),'El contenido no coincide con la propuesta conservada.','CONTRACT_INVALID');
 const allowed=new Set(v.contractIds);need(v.baseItems.every(r=>allowed.has(r.contractId)),'La base contiene contratos ajenos a la selección.','CONTRACT_INVALID');matchSource(v.body.items,v.source,v.contractIds);return v;
}
export function familySelectedDraft(value){
 const b=familySelectedBootstrap(value),existing=new Map(b.configuration.items.map(r=>[r.contractId,r]));
 return b.source.subjects.map(s=>{
  const old=existing.get(s.contractId);if(old){need(old.identityToken===s.identityToken,'Cambió la identidad de una declaración aprobada. Revisá el contrato.','IDENTITY_CHANGED');return structuredClone(old);}
  return{contractId:s.contractId,identityToken:s.identityToken,definition:{quantities:Object.fromEntries(FAMILY_PAYROLL_FACT_QUANTITIES.map(k=>[k,null])),prenatalAdjustmentMonths:null,tariffSelection:{region:null,semesterAverage:null},asOfDate:'',documentReference:''}};
 });
}
export function prepareFamilySelected(bootstrap,items,reason){
 const b=familySelectedBootstrap(bootstrap);need(b.permissions.canPropose,'Tu cuenta no permite preparar esta declaración.','FORBIDDEN');familyPayrollFactsItems(items,b.period,{empty:false});matchSource(items,b.source,b.contractIds);need(!same(items,b.configuration.items),'La selección no contiene cambios.');
 return familySelectedCommand({version:FAMILY_SELECTED_VERSION,contractIds:[...b.contractIds],command:'propose',period:b.period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,items:structuredClone(items),reason,reviewConfirmed:false});
}
export async function decideFamilySelected(detail,command,reason){
 const d=await familySelectedDetail(detail);need(['approve','reject'].includes(command)&&d.permissions.canReview&&d.proposal.canReview&&d.proposal.status==='pending','La decisión requiere otra persona habilitada.','INDEPENDENT_REQUIRED');
 need(command!=='approve'||d.current,'Cambió una declaración o la fuente de esta selección. Consultá antes de aprobar.','BASE_CHANGED');
 return familySelectedCommand({version:FAMILY_SELECTED_VERSION,contractIds:[...d.contractIds],command,period:d.period,scopeVersion:d.scopeVersion,baseVersion:d.proposal.baseVersion,sourceVersion:d.proposal.sourceVersion,proposalId:d.proposal.id,proposalSha256:d.proposal.requestSha256,items:null,reason,reviewConfirmed:true});
}
export async function familySelectedReceipt(v,attempt=null){
 need(exact(v,['version','eventId','proposalId','requestKey','requestSha256','body','status','revision','configurationVersion','replayed','payrollCalculated','payrollPosted'])&&v.version===FAMILY_SELECTED_VERSION&&[v.eventId,v.proposalId].every(salaryUuid)&&salaryKey(v.requestKey)&&[v.requestSha256,v.configurationVersion].every(salaryHash)&&Number.isInteger(v.revision)&&v.revision>=0&&v.revision<=1000&&typeof v.replayed==='boolean'&&v.payrollCalculated===false&&v.payrollPosted===false,'No se verificó el comprobante de la selección.','CONTRACT_INVALID');
 familySelectedCommand(v.body);need(v.requestSha256===await familyPayrollFactsHash(v.body),'El comprobante cambió su contenido.','CONTRACT_INVALID');
 need(v.status===({propose:'pending',approve:'approved',reject:'rejected'})[v.body.command]&&(v.body.command==='propose'?v.eventId===v.proposalId&&v.configurationVersion===v.body.baseVersion:v.proposalId===v.body.proposalId),'El comprobante no corresponde a la operación.','CONTRACT_INVALID');
 if(v.body.command==='approve')need(v.revision>0&&v.configurationVersion!==v.body.baseVersion,'La aprobación no conservó una nueva revisión.','CONTRACT_INVALID');
 if(attempt)need(v.requestKey===attempt.key&&same(v.body,attempt.body),'Se cambió el intento original.','CONTRACT_INVALID');return v;
}
