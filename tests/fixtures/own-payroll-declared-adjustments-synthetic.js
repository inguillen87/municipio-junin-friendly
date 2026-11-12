// Entirely synthetic: no operational accounts, backup files or database access.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {fixedApprovedRecord} from './payroll-fixed-novelties-synthetic.js';
import {batch,subject,row} from './own-payroll-novelties-synthetic.js';
import {ownProgramStructure} from '../../assets/own-payroll-program-model.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {policySha256} from '../../assets/own-payroll-policy-validity.js';
import {captureDeclaredAdjustmentSources} from '../../assets/own-payroll-declared-adjustments-capture.js';
import {capture,saved} from './own-payroll-run-synthetic.js';
export const adjustmentCodes=['185','450','451','452','453','454','455','456','662'];
export const adjustmentHash=value=>policySha256(value,{preserveLegacyUnicode:true});
export function adjustmentPolicy(sourceCode='450',patch={}){
 return {policyId:'synthetic-declared-'+sourceCode,supersedes:null,agreementCode:'1',validFrom:'2026-10',validUntil:null,
 liquidationType:'monthly',sourceCode,amountInputKey:'declared'+sourceCode,sourceContracts:['own-payroll-novelty-batch.v1','payroll-novelty-batch.v2'],
 adjustmentMonthPolicy:['185','662'].includes(sourceCode)?'explicit_not_future_month':'explicit_prior_month',
 evidencePolicy:'nonempty_legal_instrument',quantityPolicy:'absent_or_zero',forcedPolicy:'reject',fixedPolicy:'reject',
 monetaryRecognition:'current_payroll_no_historical_recalculation',absencePolicy:'zero_only_after_existing_complete_capture',
 sourceSha256:'a'.repeat(64),ruleReference:'Decisión de prueba sintética: importe declarado con origen',...patch};
}
export function adjustmentProgram(codes=adjustmentCodes){
 const policies=codes.map(code=>adjustmentPolicy(code));
 return ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',monthlyDeclaredAdjustmentsVersion:'own-monthly-declared-adjustments.v1',
 monthlyDeclaredAdjustmentPolicies:policies,totalsPrecision:2,rules:policies.map(p=>({code:p.sourceCode,agreementCode:p.agreementCode,
 nature:p.sourceCode==='185'?'remuneration':p.sourceCode==='662'?'deduction':'non_remuneration',unit:'money',validFrom:p.validFrom,validUntil:null,
 liquidationTypes:['monthly'],ruleReference:p.ruleReference,rounding:{precision:2,mode:'half_up'},expression:{op:'input',key:p.amountInputKey,unit:'money'}})),
 bindings:policies.map(p=>({agreementCode:p.agreementCode,key:p.amountInputKey,unit:'money',sourceKind:'monthly_amount',sourceCode:p.sourceCode,
 onMissing:'zero',combine:'sum',ruleReference:p.ruleReference}))});
}
export function sealAdjustmentSources(s){
 for(const b of s.monthly.nativeBatches??[])b.rowsSha256=adjustmentHash(b.rows.map(({values,subject})=>({values,subject})));
 s.population.version=adjustmentHash({employees:s.population.employees});
 return s;
}
export function adjustmentSources({codes=adjustmentCodes,events=[{code:'450',cents:'1025',origin:'2026-08-01'},{code:'450',cents:'-25',origin:'2026-09-01'}],channel='native',count=2,period='2026-10',fixedCode=null}={}){
 const s=approvedSources(count),template=s.monthly.batches[0];s.period=period;s.fixed.list.data.periodMonth=period+'-01';s.fixed.export.data.periodMonth=period+'-01';
 s.programState.program.definition=adjustmentProgram(codes);s.programState.salaryCatalog.items=salaryItems(s.programState.program.definition.rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,code:r.code,dependencies:[],kind:'concept',label:'Importe sintético de prueba',nature:r.nature,precision:2,ruleReference:r.ruleReference,unit:'money',validFrom:r.validFrom,validUntil:null,value:null})));
 s.monthly={complete:true,batches:[],nativeBatches:[]};
 if(events.length){
  if(channel==='native'){
   const b=batch(1);b.periodMonth=period+'-01';b.rows=events.map((event,i)=>{const person=event.person??1;return {values:row(person,{rowOrdinal:i+1,conceptSourceId:event.code,amountCents:event.cents,quantityDecimal:null,adjustmentMonth:event.origin,legalInstrument:'Constancia sintética de prueba '+(i+1),...event.values}),subject:subject(person),identityCurrent:true};});b.rowCount=b.rows.length;s.monthly.nativeBatches=[b];
  }else{
   const b=structuredClone(template);b.periodMonth=period+'-01';b.rows=events.map((event,i)=>({...structuredClone(template.rows[0]),rowOrdinal:i+1,conceptSourceId:event.code,amountCents:event.cents,quantityDecimal:null,adjustmentMonth:event.origin,legalInstrument:'Constancia sintética de prueba '+(i+1),...event.values}));b.rowCount=b.rows.length;s.monthly.batches=[b];
  }
 }
 if(fixedCode!==null){
  const record=fixedApprovedRecord(0,{conceptSourceId:fixedCode,quantityDecimal:null,amountCents:'1000',validFrom:period+'-01',validTo:null});record.subject=subject(1);
  s.fixed.list.data.rows=[record];s.fixed.list.data.total=1;
  s.fixed.export.data.rows=[{recordId:record.id,version:record.version,proposalId:record.approved.id,subject:structuredClone(record.subject),values:structuredClone(record.approved.values)}];s.fixed.export.data.total=1;
 }
 return sealAdjustmentSources(s);
}
export function adjustmentCapture(options){
 const s=adjustmentSources(options),c=capture();c.body.period=s.period;c.body.selection=s.selection;c.bodySha256=adjustmentHash(c.body);
 c.payload={...s,sourceInventory:{populationDomain:'native_registered',declaredAdjustments:captureDeclaredAdjustmentSources(s.programState.program.definition,s)}};
 c.payloadSha256=adjustmentHash(c.payload);c.saved=saved(c);return c;
}
