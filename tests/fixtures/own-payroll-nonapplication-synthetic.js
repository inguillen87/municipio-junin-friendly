// Synthetic only: the scoped identifiers test the restricted feature contract.
// No municipal employee, amount, approval, source hash or SQL call is present.
import {salaryItems,SALARY_VERSION} from '../../assets/native-salary-catalog-model.js';
import {OWN_PROGRAM_VERSION} from '../../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../../assets/own-payroll-engine.js';
import {OWN_PROGRAMME_SOURCE_QUANTITIES_VERSION} from '../../lib/own-payroll-programme-source-preparation.js';
import {createOwnPayrollNonapplicationPolicy,nonapplicationHash,NONAPPLICATION_CODES,NONAPPLICATION_ADDITIVE_GROUPS,OWN_PAYROLL_NONAPPLICATION_CAPTURE_VERSION} from '../../lib/own-payroll-nonapplication.js';
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {approved} from './payroll-monthly-annul-synthetic.js';
import {fixedApprovedRecord,fixedNativeSubject,fixedEffects} from './payroll-fixed-novelties-synthetic.js';
export const h=c=>c.repeat(64),uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const literal=(unit,value)=>({op:'literal',unit,value});
const leaf=code=>({op:'concept',code,stage:'exact'});
const sum=codes=>codes.map(leaf).reduce((left,right)=>({op:'add',left,right}));
export const fictitiousDefinition=(code,overrides={})=>({kind:'concept',role:'payable',agreementCode:'1',code,label:'Sólo QA ficticio '+code,active:true,nature:'remuneration',quantityUnit:'money',outputUnit:'money',precision:2,validFrom:'2026-10',validUntil:'2026-10',value:null,dependencies:[],ruleReference:'Sólo QA: fuente inventada, no norma municipal',sourceSha256:h('e'),liquidationTypes:['monthly'],rounding:{precision:2,mode:'half_up'},expression:literal('money','123.45'),quantity:null,...overrides});
const catalogue=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
export function repinPolicy(f){
  f.policy=createOwnPayrollNonapplicationPolicy({scopeVersion:f.source.programme.scopeVersion,sourceSha256:f.source.source.sha256,sourceReference:'Sólo QA: fuente ficticia de activación N',definitions:f.source.definitions,bindings:f.source.bindings,sourceRows:f.sourceRows});return f;
}
export function repinCapture(f){
  for(const key of ['population','monthly','fixed'])f.capture.sourceSha256[key]=nonapplicationHash(f.capture[key]);
  for(const key of ['population','monthly','fixed'])f.sources[key]=structuredClone(f.capture[key]);return f;
}
export function nonapplicationFixture(){
  const definitions=[fictitiousDefinition('1'),...NONAPPLICATION_CODES.map(code=>fictitiousDefinition(code,{nature:code==='598'?'deduction':'remuneration',expression:{op:'choose',condition:{op:'compare',operator:'ne',left:{op:'source_presence',family:'monthly',code},right:literal('coefficient','0')},then:{op:'unresolved',reference:'codliq:1:'+code+':FOVM_27',unit:'money'},else:literal('money','0')}})),...Object.entries(NONAPPLICATION_ADDITIVE_GROUPS).map(([code,members])=>fictitiousDefinition(code,{kind:'auxiliary',role:'dependency',nature:'auxiliary',quantityUnit:null,expression:sum(['1',...members])}))];
  const items=salaryItems(definitions.map(catalogue));
  const salary={version:SALARY_VERSION,scopeVersion:h('a'),classification:{version:h('b'),items:[]},catalog:{version:h('c'),revision:1,items:structuredClone(items)},proposals:[],complete:true,permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};
  const programme={version:OWN_PROGRAM_VERSION,scopeVersion:h('a'),salaryCatalog:{version:h('c'),revision:1,items:structuredClone(items)},program:{version:h('d'),revision:0,definition:null,salaryVersion:null,proposalId:null,approvalId:null},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};
  const bindings=NONAPPLICATION_CODES.map(code=>({agreementCode:'1',reference:'P['+code+']',sourceSha256:h('e'),binding:{agreementCode:'1',key:'monthlyPresent'+code,unit:'coefficient',sourceKind:'monthly_presence',sourceCode:code,combine:'any',onMissing:'zero',ruleReference:'Sólo QA: presencia exacta; nunca importe cero'}}));
  const source={version:OWN_PROGRAMME_SOURCE_QUANTITIES_VERSION,salary,programme,period:'2026-10',agreementCodes:['1'],source:{sha256:h('f'),complete:true,expectedDefinitions:definitions.length},definitions,bindings,programmeOptions:{namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,noveltyPresenceVersion:'own-payroll-novelty-presence.v1'},totalsPrecision:2};
  const sourceRows=NONAPPLICATION_CODES.map(code=>({CODI_02:'1',CODI_27:code,CODI_36:'98',ACTI_27:'N',FOVM_27:null,CONM_27:['318','560'].includes(code)?'N['+code+']':null,LIQU_27:'M',QA_ONLY:true}));
  const sources=approvedSources(2);sources.programState=structuredClone(programme);sources.monthly={complete:true,batches:[],nativeBatches:[]};
  const capture={version:OWN_PAYROLL_NONAPPLICATION_CAPTURE_VERSION,origin:'MUNICONTROL',tenantId:uid(999),scopeVersion:h('a'),period:'2026-10',liquidationType:'monthly',agreementCode:'1',contractIds:sources.population.employees.map(e=>e.contractId).sort(),population:structuredClone(sources.population),monthly:structuredClone(sources.monthly),fixed:structuredClone(sources.fixed),completeness:{population:true,monthly:true,fixed:true},sourceSha256:{population:null,monthly:null,fixed:null},sourceReference:'Sólo QA: captura sintética íntegra, no lectura municipal'};
  return repinCapture(repinPolicy({source,sourceRows,sources,capture,policy:null}));
}
export const args=f=>({source:f.source,policy:f.policy,capture:f.capture,sources:f.sources});
export const sourceArgs=f=>({source:f.source,policy:f.policy});
export const planArgs=f=>({policy:f.policy,source:f.source.source,definitions:f.source.definitions,bindings:f.source.bindings,priorProgram:f.source.programme.program.definition,capture:f.capture});
export function addMonthly(f,code,{forced=false,amountCents='0',quantityDecimal='0',native=false}={}){
  const e=f.capture.population.employees[0],batch=approved(1,1,true),r=batch.rows[0];
  Object.assign(batch,{periodMonth:'2026-10-01',payrollType:'monthly'});
  Object.assign(r,{rowOrdinal:1,employmentContractId:e.contractId,legajo:e.employeeNumber,conceptSourceId:code,quantityDecimal,amountCents,adjustmentMonth:null,forced,identityCurrent:true,issues:[],legalInstrument:'Acto ficticio QA',observation:forced?'Fundamento ficticio de Forzado para QA':null});
  Object.assign(r.subject,{contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken});
  if(!native)f.capture.monthly.batches.push(batch);
  else{
    const values={rowOrdinal:1,legajo:e.employeeNumber,contractId:e.contractId,identityToken:e.identityToken,conceptSourceId:code,costCenterSourceId:null,adjustmentMonth:null,quantityDecimal,amountCents,movementType:null,legalInstrument:'Acto ficticio QA',observation:forced?'Fundamento ficticio de Forzado para QA':null,forced};
    const approvals=Array.from({length:forced?2:1},(_,n)=>({membershipId:uid(900+n*2),personId:uid(901+n*2)}));
    const rows=[{values,subject:r.subject,identityCurrent:true}];
    f.capture.monthly.nativeBatches.push({version:'own-payroll-novelty-batch.v1',id:uid(700),revision:3,status:'approved',periodMonth:'2026-10-01',payrollType:'monthly',rows,rowCount:1,rowsSha256:nonapplicationHash(rows.map(({values,subject})=>({values,subject}))),preparedBy:{membershipId:uid(800),personId:uid(801)},decidedBy:approvals.at(-1),approvals,grhMutation:false,payrollCalculated:false,payrollPosted:false});
  }
  return repinCapture(f);
}
export function addFixed(f,code,{forced=false,amountCents='0',quantityDecimal='0',partial=false,pending=false}={}){
  const e=f.capture.population.employees[0],r=fixedApprovedRecord(1,{conceptSourceId:code,forced,forcedReason:forced?'Fundamento ficticio QA':null,amountCents,quantityDecimal,validFrom:partial?'2026-10-15':'2026-10-01',validTo:'2026-10-31'});
  r.subject={...fixedNativeSubject(e.employeeNumber),contractId:e.contractId,identityToken:e.identityToken};
  if(pending){r.version=1;r.latest.review=null;r.approved=null;r.pending=r.latest;r.canPropose=false;}
  const data={periodMonth:'2026-10-01',snapshotToken:h('f'),effects:{...fixedEffects}};
  f.capture.fixed={list:{ok:true,data:{...data,version:'payroll-fixed-list.v1',rows:[r],total:1}},export:{ok:true,data:{...data,version:'payroll-fixed-export.v1',rows:pending?[]:[{recordId:r.id,version:r.version,proposalId:r.approved.id,subject:structuredClone(r.subject),values:structuredClone(r.approved.values)}],total:pending?0:1}}};
  return repinCapture(f);
}
