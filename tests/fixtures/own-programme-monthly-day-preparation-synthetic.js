// Authored synthetic transport fixture only. Not a municipal formula, fact, approval or source mapping.
import {SALARY_VERSION,salaryItems} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {OWN_PROGRAMME_SOURCE_VERSION} from '../../lib/own-payroll-programme-source-preparation.js';
import {policySources,seal,hash,updateRules} from './own-monthly-day-policy-synthetic.js';
import {batch} from './own-payroll-novelties-synthetic.js';
const source=(reference,unit)=>({op:'source',reference,unit});
const row=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.quantityUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
export function monthlyDayPreparationFixture(){
 const s=policySources(1),p=s.programState.program.definition;
 // Fictional amount120.15 x (typed full-month days - explicit novelty days) / typed base days.
 // The two L90000x labels are synthetic evidence references only; there is no GRH alias table.
 const d={kind:'concept',agreementCode:'1',code:'9100',label:'Haber exclusivamente ficticio QA',active:true,nature:'remuneration',quantityUnit:'money',outputUnit:'money',precision:2,validFrom:'2026-10',validUntil:'2026-10',value:null,dependencies:[],ruleReference:'Regla y redondeo exclusivamente sintéticos QA',sourceSha256:hash('qa-rule-evidence'),liquidationTypes:['monthly'],rounding:{precision:2,mode:'half_even'},expression:{op:'multiply',left:{op:'literal',unit:'money',value:'120.15'},right:{op:'divide',left:{op:'subtract',left:source('L[900001]','days'),right:source('N[101]','days')},right:source('L[900002]','days')}},quantity:null};
 const entries=[['L[900001]','recognizedDays','monthly_day_fact','recognizedDays'],['L[900002]','baseDays','monthly_day_fact','baseDays'],['N[101]','approvedAbsenceDays','monthly_quantity','101']];
 const bindings=entries.map(([reference,key,sourceKind,field])=>({agreementCode:'1',reference,sourceSha256:hash(['qa-binding-evidence',reference]),binding:{agreementCode:'1',key,unit:'days',sourceKind,[sourceKind==='monthly_quantity'?'sourceCode':'sourceField']:field,combine:'single',onMissing:'error',ruleReference:'Fuente declarada exclusivamente sintética QA'}}));
 p.rules=[{code:d.code,agreementCode:d.agreementCode,nature:d.nature,unit:d.outputUnit,validFrom:d.validFrom,validUntil:d.validUntil,liquidationTypes:d.liquidationTypes,ruleReference:d.ruleReference,rounding:d.rounding,expression:{op:'multiply',left:{op:'literal',unit:'money',value:'120.15'},right:{op:'divide',left:{op:'subtract',left:{op:'input',key:'recognizedDays',unit:'days'},right:{op:'input',key:'approvedAbsenceDays',unit:'days'}},right:{op:'input',key:'baseDays',unit:'days'}}}}];
 p.bindings=bindings.map(b=>structuredClone(b.binding));updateRules(s);
 const items=salaryItems([row(d),{...row(d),code:'101',label:'Días de ausencia exclusivamente ficticios QA',unit:'days',ruleReference:'Metadatos exclusivamente sintéticos, no vigencia municipal'}]);
 s.programState.salaryCatalog.items=structuredClone(items);
 const programme=structuredClone(s.programState);
 programme.program={...programme.program,revision:0,definition:null,salaryVersion:null,proposalId:null,approvalId:null};
 const options={namespaceVersion:p.namespaceVersion,monthlyDaysVersion:p.monthlyDaysVersion,monthlyDaysPolicy:structuredClone(p.monthlyDaysPolicy),periodParticipation:structuredClone(p.periodParticipation)};
 const input={version:OWN_PROGRAMME_SOURCE_VERSION,salary:{version:SALARY_VERSION,scopeVersion:programme.scopeVersion,classification:{version:hash('qa-classification'),items:[]},catalog:{...structuredClone(programme.salaryCatalog)},proposals:[],complete:true,permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},programme,period:s.period,agreementCodes:['1'],source:{sha256:hash('complete-qa-evidence'),complete:true,expectedDefinitions:1},definitions:[d],bindings,programmeOptions:options,totalsPrecision:2};
 return {input,runtime:s,expectedDefinition:ownProgramDefinition(p,items)};
}
export function absenceBatch(quantity='2',amount=null){
 const b=batch(1);Object.assign(b.rows[0].values,{conceptSourceId:'101',quantityDecimal:quantity,amountCents:amount});
 b.rowsSha256=hash(b.rows.map(({values,subject})=>({values,subject})));return b;
}
export function syntheticPreparedSources(prepared,fixture=monthlyDayPreparationFixture(),quantity='2'){
 // Explicit synthetic approved revision for runtime QA. The pure preparer does not create this decision.
 const s=structuredClone(fixture.runtime),p=s.programState.program;
 p.definition=structuredClone(prepared.draft.programme);p.version=hash(['synthetic-approved-programme',p.definition]);
 s.monthly={complete:true,batches:[],nativeBatches:[absenceBatch(quantity)]};
 s.monthlyDays.programBasis={programVersion:p.version,revision:p.revision,proposalId:p.proposalId,approvalId:p.approvalId,policy:structuredClone(p.definition.monthlyDaysPolicy),policySha256:hash(p.definition.monthlyDaysPolicy)};
 return seal(s);
}
export function resealAbsenceBatch(b){b.rowCount=b.rows.length;b.rowsSha256=hash(b.rows.map(({values,subject})=>({values,subject})));return b;}
