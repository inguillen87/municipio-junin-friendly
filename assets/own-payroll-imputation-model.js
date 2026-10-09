import {salaryExact, salaryHash, salaryUuid, salarySerialized, SalaryInputError} from './native-salary-catalog-model.js';
import {ownCloseReceipt, verifiedOwnCloseReceipt, OWN_CLOSE_TOTAL_KEYS} from './own-payroll-close-model.js';
import {ownRunCommand} from './own-payroll-run-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {ownClosedJurisdiction} from './own-payroll-jurisdiction-model.js';
import {accountingDefinition, accountingHash, accountingMappingKey, accountingAssignmentKey, accountingMappingFields} from './own-payroll-accounting-model.js';
import {decimal, rational, exactAdd, quantize} from './own-payroll-exact.js';

export const IMPUTATION_SOURCE_VERSION='own-payroll-imputation-source.v1';
export const IMPUTATION_RESULT_VERSION='own-payroll-imputation-result.v1';
export const IMPUTATION_MAX_CONCEPTS=250000;
export const IMPUTATION_ISSUES=Object.freeze({
 configuration_required:['Configuración pendiente','Aprobar las asociaciones contables propias.'],
 jurisdiction_missing:['Jurisdicción no conservada','Revisar la fuente de la liquidación; no se completa desde el padrón actual.'],
 date_missing:['Fecha no declarada','Revisar la corrida original; no se deduce del período.'],
 mapping_missing:['Destino anual no encontrado','Aprobar una asociación que cubra año, jurisdicción, convenio, repartición, concepto y fecha.'],
 nature_mismatch:['Naturaleza diferente','Revisar la asociación y la naturaleza conservada en la liquidación.'],
 institution_missing:['Institución y función no encontradas','Aprobar una asociación del contrato y concepto que cubra su fecha.'],
 fractional_cent:['Fracción de centavo','Resolver la precisión con una regla municipal respaldada; no redondear ni truncar.']
});
const need=(v,message)=>{if(!v)throw new SalaryInputError('IMPUTATION_CONTRACT_INVALID',message);};
const id=v=>v.toLowerCase();
const ordered=(a,b)=>a<b?-1:a>b?1:0;
const fiscalYear=v=>typeof v==='string'&&/^(19|20)[0-9]{2}$/.test(v);

export function imputationConfiguration(v){
 need(salaryExact(v,['version','revision','definition','proposalId','approvalId'])&&salaryHash(v.version)&&Number.isSafeInteger(v.revision)&&v.revision>=0&&v.revision<=1000,'No se verificó la configuración aprobada.');
 need(v.revision===0?v.definition===null&&v.proposalId===null&&v.approvalId===null:v.definition!==null&&[v.proposalId,v.approvalId].every(salaryUuid),'La configuración no coincide con su revisión.');
 if(v.definition)accountingDefinition(v.definition);return v;
}

export function imputationSourceHashValue(v){
 // The evidence is tenant-bound through the approved configuration and original
 // close. Its digest must be identical for the independent reviewer; account
 // scope is checked separately on every command and response.
 return {version:IMPUTATION_SOURCE_VERSION,fiscalYear:v.fiscalYear,groupId:v.group.groupId,bodySha256:v.group.bodySha256,snapshotSha256:v.group.snapshotSha256,configuration:v.configuration,dateSources:v.dateSources};
}
export function imputationSource(v){
 need(salaryExact(v,['version','scopeVersion','fiscalYear','group','state','configuration','dateSources','sourceVersion','complete'])&&v.version===IMPUTATION_SOURCE_VERSION&&salaryHash(v.scopeVersion)&&fiscalYear(v.fiscalYear)&&v.state==='closed'&&v.complete===true&&salaryHash(v.sourceVersion),'No se verificó una fuente completa actualmente cerrada.');
 const receipt=ownCloseReceipt(v.group),snapshot=receipt.snapshot;
 need(receipt.body.command==='close'&&snapshot.conceptCount<=IMPUTATION_MAX_CONCEPTS,'La fuente no corresponde a un cierre completo o supera su capacidad.');
 imputationConfiguration(v.configuration);
 need(Array.isArray(v.dateSources)&&v.dateSources.length<=1000,'La fuente de fechas supera su capacidad.');
 const dates=new Map();
 for(const proof of v.dateSources){
  need(salaryExact(proof,['runId','body','bodySha256','inputSha256'])&&salaryUuid(proof.runId)&&[proof.bodySha256,proof.inputSha256].every(salaryHash)&&!dates.has(id(proof.runId)),'Las fuentes de fecha están incompletas o repetidas.');
  const body=ownRunCommand(proof.body);
  need(body.period===snapshot.period&&body.liquidationType===snapshot.liquidationType,'La fecha pertenece a otro período o tipo.');dates.set(id(proof.runId),proof);
 }
 const used=new Set();
 for(const e of snapshot.employees){const proof=dates.get(id(e.runId));need(proof&&proof.inputSha256===e.inputSha256,'Falta una fuente original de fecha del cierre.');used.add(id(e.runId));}
 need(used.size===dates.size,'La consulta contiene corridas ajenas al grupo elegido.');
 return v;
}
export async function verifiedImputationSource(v){
 imputationSource(v);await verifiedOwnCloseReceipt(v.group);
 for(const d of v.dateSources)need(await accountingHash(d.body)===d.bodySha256,'Cambió la fecha o el cuerpo original de una corrida.');
 need(await accountingHash(imputationSourceHashValue(v))===v.sourceVersion,'No se verificó la integridad de la fuente contable.');return v;
}

function intervalIndex(rows,key){
 const index=new Map();for(const r of rows){const k=key(r),group=index.get(k)??[];group.push(r);index.set(k,group);}
 for(const group of index.values())group.sort((a,b)=>ordered(a.validFrom,b.validFrom));return index;
}
function intervalAt(rows,day){
 if(!rows)return null;let low=0,high=rows.length;
 while(low<high){const mid=(low+high)>>>1;if(rows[mid].validFrom<=day)low=mid+1;else high=mid;}
 const r=rows[low-1];return r&&(r.validUntil===null||r.validUntil>=day)?r:null;
}
const mappingScope=r=>salarySerialized([r.fiscalYear,r.jurisdictionCode,r.agreementCode,r.departmentCode,r.conceptCode]);
const assignmentScope=(contract,concept)=>id(contract)+':'+(concept??'*');
const exactSum=(amounts,precision)=>quantize(amounts.reduce((total,a)=>exactAdd(total,decimal(a)),rational(0n)),{precision,mode:'exact'}).amount;

// An allocation of stored money, never another evaluation of salary rules.
// Every concept has one disposition, including auxiliary values and incidents.
export function calculateImputation(source){
 const v=imputationSource(source),s=v.group.snapshot,c=v.configuration;
 const configuration=c.definition?accountingDefinition(c.definition):{mappings:[],assignments:[]};
 const mappings=intervalIndex(configuration.mappings,mappingScope),assignments=intervalIndex(configuration.assignments,r=>assignmentScope(r.contractId,r.conceptCode));
 const employees=new Map(s.employees.map(e=>[id(e.contractId),e])),dates=new Map(v.dateSources.map(d=>[id(d.runId),d.body.liquidationDate??null]));
 const globalIssues=c.revision===0?['configuration_required']:[],rows=[],issues=[],destinations=new Map();let auxiliaryCount=0,moneyCount=0;
 for(const [index,concept]of s.concepts.entries()){
  const e=employees.get(id(concept.contractId));need(e,'Un concepto no pertenece a los contratos cerrados.');
  const date=dates.get(id(e.runId)),jurisdiction=ownClosedJurisdiction(e,s.version),codes=[];
  const row={ordinal:index+1,contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,conceptCode:concept.conceptCode,nature:concept.nature,unit:concept.unit,amount:concept.amount,liquidationDate:date,jurisdictionCode:jurisdiction.code,mappingKey:null,assignmentKey:null,destination:null,state:null,issues:codes};
  // Auxiliary quantities remain in the conserved source, but are not money.
  if(concept.nature==='auxiliary'){auxiliaryCount++;row.state='auxiliary';rows.push(row);continue;}
  moneyCount++;
  if(!date)codes.push('date_missing');else need(ownRunDate(date),'La fecha conservada no es una fecha civil.');
  if(!['42','55'].includes(jurisdiction.code))codes.push('jurisdiction_missing');
  try{quantize(decimal(concept.amount),{precision:2,mode:'exact'});}catch{codes.push('fractional_cent');}
  let mapping=null,assignment=null;
  if(c.revision>0&&date&&['42','55'].includes(jurisdiction.code)){
   mapping=intervalAt(mappings.get(mappingScope({...row,fiscalYear:v.fiscalYear})),date);
   if(!mapping)codes.push('mapping_missing');else if(mapping.nature!==concept.nature)codes.push('nature_mismatch');
  }
  if(c.revision>0&&date){
   const generic=intervalAt(assignments.get(assignmentScope(e.contractId,null)),date),specific=intervalAt(assignments.get(assignmentScope(e.contractId,concept.conceptCode)),date);
   need(!(generic&&specific),'Hay dos asociaciones institucionales para el mismo concepto y fecha.');assignment=specific??generic;
   if(!assignment)codes.push('institution_missing');
  }
  if(mapping)row.mappingKey=accountingMappingKey(mapping);
  if(assignment)row.assignmentKey=accountingAssignmentKey(assignment);
  row.state=c.revision===0?'configuration_required':codes.length?'needs_review':'allocated';
  if(row.state==='allocated'){
   row.destination={...Object.fromEntries(accountingMappingFields(mapping).map(k=>[k,mapping[k]])),institutionalReference:assignment.institutionalReference,functionReference:assignment.functionReference,institutionRuleReference:assignment.ruleReference};
   const key=salarySerialized(row.destination),group=destinations.get(key)??{destination:structuredClone(row.destination),ordinals:[],amounts:[],precision:0};
   group.ordinals.push(row.ordinal);group.amounts.push(row.amount);group.precision=Math.max(group.precision,row.amount.split('.')[1]?.length??0);destinations.set(key,group);
  }
  for(const code of codes)issues.push({ordinal:row.ordinal,code});rows.push(row);
 }
 const groups=[...destinations.entries()].sort(([a],[b])=>ordered(a,b)).map(([,g])=>({destination:g.destination,ordinals:g.ordinals,conceptCount:g.ordinals.length,amount:exactSum(g.amounts,g.precision)}));
 const allocatedCount=rows.filter(r=>r.state==='allocated').length,ready=moneyCount>0&&globalIssues.length===0&&issues.length===0;
 const assignedTotals=Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.slice(0,4).map(nature=>{const amounts=rows.filter(r=>r.state==='allocated'&&r.nature===nature).map(r=>r.amount);return [nature,exactSum(amounts,ready?s.precision:amounts.reduce((p,a)=>Math.max(p,a.split('.')[1]?.length??0),s.precision))];}));
 if(ready)for(const nature of OWN_CLOSE_TOTAL_KEYS.slice(0,4))need(assignedTotals[nature]===s.totals[nature],'La imputación no concilia con todos los conceptos del cierre.');
 return {version:IMPUTATION_RESULT_VERSION,groupId:v.group.groupId,fiscalYear:v.fiscalYear,sourceVersion:v.sourceVersion,configurationVersion:c.version,configurationRevision:c.revision,snapshotSha256:v.group.snapshotSha256,employeeCount:s.employeeCount,populationCount:s.populationCount,populationComplete:s.populationComplete,conceptCount:s.conceptCount,moneyCount,auxiliaryCount,allocatedCount,ready,globalIssues,issues,rows,groups,sourceTotals:structuredClone(s.totals),allocatedTotals:assignedTotals,accountingPosted:false,paymentExecuted:false};
}
export async function verifiedImputation(source){await verifiedImputationSource(source);return calculateImputation(source);}

export function imputationIncidentCsv(result){
 need(result?.version===IMPUTATION_RESULT_VERSION&&Array.isArray(result.rows)&&result.rows.length===result.conceptCount,'No se verificó la revisión completa.');
 need(Array.isArray(result.globalIssues)&&result.globalIssues.every(code=>Object.hasOwn(IMPUTATION_ISSUES,code))&&Array.isArray(result.issues),'No se verificaron las observaciones completas.');
 const cell=value=>'"'+String(value).replaceAll('"','""')+'"';
 const rows=[['Ordinal del concepto cerrado','Estado','Acción sugerida'],...result.globalIssues.map(code=>['',...IMPUTATION_ISSUES[code]]),...result.issues.map(({ordinal,code})=>{need(Number.isSafeInteger(ordinal)&&ordinal>0&&ordinal<=result.conceptCount&&Object.hasOwn(IMPUTATION_ISSUES,code),'La observación no pertenece al conjunto.');return [String(ordinal),...IMPUTATION_ISSUES[code]];})];
 return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
