import { civilDate } from './civil-date.js';
import { CoreReviewError, CORE_REVIEW_DOMAINS } from './grh-core-review-model.js';
export const SUCCESSOR_REVIEW_VERSION = 'grh-successor-comparison.v1';
export const SUCCESSOR_LABELS = Object.freeze({payrollRuns:'Corridas de liquidación',payrollSnapshot:'Asignaciones por liquidación',movements:'Movimientos de conceptos',payrollMonthly:'Resúmenes salariales mensuales',employmentReconciliation:'Conciliación de contratos'});
const FIELDS = Object.freeze({
 payrollRuns:'company_source_id payroll_date source_period source_month payroll_type closure_status source_closed_flag source_date_ig',
 payrollSnapshot:'company_source_id employee_number snapshot_date source_period source_month payroll_type agreement_source_id agreement_name category_name role_name budget_structure budget_detail budget_account department_source_id department_name area_name',
 movements:'company_source_id employee_number movement_period payroll_type movement_type concept_source_id cost_center_source_id quantity installment automatic_source_value adjustment_source_value forced_source_value legal_instrument movement_status',
 payrollMonthly:'company_source_id employee_number payroll_date source_period source_month payroll_type item_count quantity_sum technical_source_amount_sum employer_contributions social_security_taxable_base health_taxable_base total_subject_earnings total_non_subject_earnings family_allowance employee_withholdings employer_taxable_base net net_payable dominant_agreement_source_id dominant_sector_source_id distinct_concepts quality_flags',
 employmentReconciliation:'company_source_id employee_number administrative_active liquidated_current evidence_status last_payroll_date'
});
const LIMITS={payrollRuns:10000,payrollSnapshot:20000,movements:1000000,payrollMonthly:500000,employmentReconciliation:20000};
const COUNTS=['before','after','added','removed','changed','unchanged','rawEvidenceChanged','evidenceOnlyChanges'];
const SCOPE=Object.freeze({databaseQueries:0,databaseWrites:0,sourcePromoted:false,containsPersonalRecords:false,containsSalaryAmounts:false,nativeOperationsCompared:false,curatedEntitiesCompared:false,arithmeticCertification:false});
const METHOD=Object.freeze({snapshotIdentity:'company/employee/payrollDate/period/month/payrollType',sourceIdRotationIsNotDismissal:true,monetaryComparison:'exact normalized decimal fields; null is distinct from zero',rawEvidenceHashesCompared:true,noMixedMonthClosureInference:true});
export const SUCCESSOR_REQUIRED=Object.freeze(['versioned_successor_publication','coordinated_curated_core_reconciliation','native_operations_preservation','restore_and_capacity_acceptance']);
export const exactReviewKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
export const reviewHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
export const reviewCount=value=>Number.isSafeInteger(value)&&value>=0;
export function rejectSuccessorReview(){throw new CoreReviewError('El informe no cumple el contrato de revisión local. Generá nuevamente la comparación completa; no se muestra un resultado parcial.');}
function equalObject(value,expected){if(!exactReviewKeys(value,Object.keys(expected))||Object.entries(expected).some(([k,v])=>value[k]!==v))rejectSuccessorReview();}
function date(value){if(typeof value!=='string')rejectSuccessorReview();try{civilDate(value);}catch{rejectSuccessorReview();}return value;}
export function reviewCutoff(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value))rejectSuccessorReview();date(value.slice(0,10));return value;}
export function reviewGeneratedAt(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))rejectSuccessorReview();date(value.slice(0,10));return value;}
export function successorSource(value){
 if(!exactReviewKeys(value,['profileId','sourceSha256','sourceCutoff','manifestSha256'])||!reviewHash(value.sourceSha256)||!reviewHash(value.manifestSha256)||value.profileId!=='grh-junin-'+reviewCutoff(value.sourceCutoff).slice(0,10))rejectSuccessorReview();
 return Object.freeze({...value,sourceSha256:value.sourceSha256.toLowerCase(),manifestSha256:value.manifestSha256.toLowerCase()});
}
function entity(value,name){
 const keys=[...COUNTS,'changedFields','baselineProjectionSha256','candidateProjectionSha256',...(name==='payrollSnapshot'?['contracts']:[])];
 if(!exactReviewKeys(value,keys)||COUNTS.some(k=>!reviewCount(value[k]))||value.before>LIMITS[name]||value.after>LIMITS[name]
  ||value.before!==value.removed+value.changed+value.unchanged||value.after!==value.added+value.changed+value.unchanged
  ||value.rawEvidenceChanged!==value.changed+value.evidenceOnlyChanges||value.evidenceOnlyChanges>value.unchanged
  ||!reviewHash(value.baselineProjectionSha256)||!reviewHash(value.candidateProjectionSha256))rejectSuccessorReview();
 const fields=value.changedFields;
 if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(k=>!FIELDS[name].split(' ').includes(k))
  ||Object.values(fields).some(v=>!reviewCount(v)||v<1||v>value.changed)||(value.changed===0)!==(Object.keys(fields).length===0)
  ||Object.values(fields).reduce((a,b)=>a+b,0)<value.changed)rejectSuccessorReview();
 if((value.changed+value.added+value.removed===0)!==(value.baselineProjectionSha256.toLowerCase()===value.candidateProjectionSha256.toLowerCase()))rejectSuccessorReview();
 if(name==='payrollSnapshot'){
  const c=value.contracts;if(!exactReviewKeys(c,['before','after','beforeWithMultipleAssignments','afterWithMultipleAssignments']))rejectSuccessorReview();
  for(const side of ['before','after'])if(!reviewCount(c[side])||!reviewCount(c[side+'WithMultipleAssignments'])||c[side]>value[side]
   ||c[side+'WithMultipleAssignments']>c[side]||c[side]+c[side+'WithMultipleAssignments']>value[side]
   ||(c[side]===value[side])!==(c[side+'WithMultipleAssignments']===0)||(c[side]===0)!==(value[side]===0))rejectSuccessorReview();
 }
 return Object.freeze({...value,changedFields:Object.freeze({...fields}),...(value.contracts?{contracts:Object.freeze({...value.contracts})}:{})});
}
function runEvidence(value){
 if(!exactReviewKeys(value,['currentRuns','latestClosedByType'])||!Array.isArray(value.currentRuns)||!value.currentRuns.length||value.currentRuns.length>32)rejectSuccessorReview();
 const dates=new Set(),keys=new Set();const currentRuns=value.currentRuns.map(r=>{
  if(!exactReviewKeys(r,['companyCode','payrollDate','period','month','payrollType','closureStatus'])||typeof r.companyCode!=='string'||!/^\d{1,32}$/.test(r.companyCode)
   ||!reviewCount(r.period)||r.period>9999||!reviewCount(r.month)||r.month>12||r.month<1||!['open','closed','unknown'].includes(r.closureStatus)
   ||typeof r.payrollType!=='string'||!/^[A-Z]$/.test(r.payrollType))rejectSuccessorReview();
  dates.add(date(r.payrollDate));const key=[r.companyCode,r.payrollDate,r.period,r.month,r.payrollType].join('|');if(keys.has(key))rejectSuccessorReview();keys.add(key);return Object.freeze({...r});
 });
 if(dates.size!==1)rejectSuccessorReview();
 const latest=value.latestClosedByType;if(!latest||typeof latest!=='object'||Array.isArray(latest)||Object.keys(latest).length>26)rejectSuccessorReview();
 for(const [type,value]of Object.entries(latest))if(!/^[A-Z]$/.test(type)||date(value)>currentRuns[0].payrollDate)rejectSuccessorReview();
 for(const r of currentRuns)if(r.closureStatus==='closed'&&latest[r.payrollType]!==r.payrollDate)rejectSuccessorReview();
 return Object.freeze({currentRuns:Object.freeze(currentRuns),latestClosedByType:Object.freeze({...latest})});
}
export function successorReviewData(value){
 if(!exactReviewKeys(value,['version','generatedAt','baseline','candidate','entities','runEvidence','comparisonComplete','scope','publication','methodology'])
  ||value.version!==SUCCESSOR_REVIEW_VERSION||value.comparisonComplete!==true||!exactReviewKeys(value.entities,CORE_REVIEW_DOMAINS))rejectSuccessorReview();
 reviewGeneratedAt(value.generatedAt);const baseline=successorSource(value.baseline),candidate=successorSource(value.candidate);
 if(baseline.sourceCutoff>=candidate.sourceCutoff||baseline.sourceSha256===candidate.sourceSha256||baseline.manifestSha256===candidate.manifestSha256)rejectSuccessorReview();
 equalObject(value.scope,SCOPE);equalObject(value.methodology,METHOD);
 if(!exactReviewKeys(value.publication,['ready','legacyImporterCompatible','required'])||value.publication.ready!==false||value.publication.legacyImporterCompatible!==false
  ||!Array.isArray(value.publication.required)||value.publication.required.length!==SUCCESSOR_REQUIRED.length||SUCCESSOR_REQUIRED.some((v,i)=>value.publication.required[i]!==v))rejectSuccessorReview();
 if(!exactReviewKeys(value.runEvidence,['baseline','candidate']))rejectSuccessorReview();
 const entities=Object.freeze(Object.fromEntries(CORE_REVIEW_DOMAINS.map(name=>[name,entity(value.entities[name],name)])));
 return Object.freeze({version:SUCCESSOR_REVIEW_VERSION,generatedAt:value.generatedAt,baseline,candidate,entities,comparisonComplete:true,
  scope:SCOPE,methodology:METHOD,publication:Object.freeze({ready:false,legacyImporterCompatible:false,required:SUCCESSOR_REQUIRED}),
  runEvidence:Object.freeze({baseline:runEvidence(value.runEvidence.baseline),candidate:runEvidence(value.runEvidence.candidate)})});
}
export function successorReviewTotals(value){return Object.fromEntries(COUNTS.map(key=>[key,CORE_REVIEW_DOMAINS.reduce((n,domain)=>n+BigInt(value.entities[domain][key]),0n)]));}
