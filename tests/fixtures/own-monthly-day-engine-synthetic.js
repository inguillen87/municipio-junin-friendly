// Authored arithmetic only: no municipal payroll formula or rounding policy.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {row} from './native-salary-synthetic.js';
import {rule} from './own-payroll-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {participationRuleKey} from '../../assets/own-period-participation-program.js';
import {ownRunHash as hash} from '../../lib/internal-own-payroll-run.js';
import {MONTHLY_DAY_DECLARATION_FACTS_VERSION as factsVersion} from '../../assets/own-monthly-day-declaration-model.js';
const input=(key,unit)=>({op:'input',key,unit}), literal=(value,unit)=>({op:'literal',value,unit});
const binary=(op,left,right)=>({op,left,right});
export function sealMonthlyDayEngine(s){
 s.monthlyDayDeclarations.version=hash([factsVersion,s.period,s.monthlyDayDeclarations.records]);
 if(s.periodParticipation)s.periodParticipation.version=hash(['own-period-participation.v1',s.period,s.periodParticipation.records]);
 s.population.version=hash({employees:s.population.employees,monthlyDayDeclarations:s.monthlyDayDeclarations,...(s.periodParticipation?{periodParticipation:s.periodParticipation}:{})});
 return s;
}
export function monthlyDayEngineSources(values=['30','16','0'],{typedOnly=false}={}){
 const s=approvedSources(values.length);s.monthly.batches=[];
 const rules=[rule('900',binary('multiply',literal('300','money'),binary('divide',input('dayCount','days'),input('dayBase','days'))),{rounding:{precision:8,mode:'exact'}}),rule('902',binary('multiply',literal('0','money'),binary('divide',input('recognizedUnits','units'),input('baseUnits','units'))),{rounding:{precision:8,mode:'exact'}}),rule('903',binary('add',{op:'concept',code:'900',stage:'exact'},{op:'concept',code:'902',stage:'exact'}),{rounding:{precision:8,mode:'exact'}})];
 s.programState.salaryCatalog.items=rules.map(r=>row({code:r.code,nature:r.nature,unit:'money',value:null}));
 s.programState.program.definition={namespaceVersion:'own-payroll-namespaces.v2',monthlyDayDeclarationVersion:factsVersion,totalsPrecision:8,rules,bindings:[...['recognizedDays','baseDays'].map((sourceField,i)=>({agreementCode:'1',key:i?'dayBase':'dayCount',unit:'days',sourceKind:'monthly_day_declaration_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Fuente193 exclusivamente sintética'})),...['recognizedUnits','baseUnits'].map(sourceField=>({agreementCode:'1',key:sourceField,unit:'units',sourceKind:'period_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Fuente157 genérica exclusivamente sintética'}))],periodParticipation:{version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Tratamiento sintético sin segunda fracción'}))}};
 s.monthlyDayDeclarations={complete:true,version:'a'.repeat(64),factsVersion,period:s.period,records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,fullPeriod:i===0,sourceVersion:'d'.repeat(64),configuration:{version:'f'.repeat(64),revision:1,proposalId:uid(300+i),approvalId:uid(400+i),identityToken:e.identityToken,sourceVersion:'d'.repeat(64),definition:{recognizedDays:values[i],baseDays:'30',unit:'days',policyVersion:'own-monthly-approved-days-policy.v1',fullMonthDeclared:i===0&&values[i]==='30',asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA'}}}))};
 s.periodParticipation={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,fullPeriod:i===0,configuration:{version:'d'.repeat(64),sourceVersion:i===0?null:'d'.repeat(64),revision:i===0?0:1,proposalId:i===0?null:uid(500+i),approvalId:i===0?null:uid(600+i),identityToken:i===0?null:e.identityToken,definition:i===0?null:{recognizedUnits:values[i],baseUnits:'30',asOfDate:'2026-10-01',documentReference:'Participación157 sintética separada'}}}))};
 if(typedOnly){s.programState.program.definition.bindings=s.programState.program.definition.bindings.filter(b=>b.sourceKind!=='period_fact');s.programState.program.definition.rules.find(r=>r.code==='902').expression=literal('0','money');delete s.periodParticipation;}
 return sealMonthlyDayEngine(s);
}
