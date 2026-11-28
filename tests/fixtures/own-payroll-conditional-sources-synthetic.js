// Synthetic fixture; no municipal approvals, figures or contracts.
import {nativeSources} from './own-native-salary-conditions-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {salaryNativeCaptureMaterial} from '../../assets/own-contract-salary-conditions-native-model.js';
import {policySha256} from '../../assets/own-payroll-policy-validity.js';
import {OWN_CONDITIONAL_SOURCES_VERSION,OWN_CONDITIONAL_SOURCE_CATALOGUE_VERSION} from '../../assets/own-payroll-conditional-sources.js';
export const conditionalScaleRow=(patch={})=>({active:true,agreementCode:'1',categoryCode:'6',code:'19',dependencies:[],kind:'scale',label:'Escala docente exclusivamente sintética',nature:null,precision:3,ruleReference:'Valor sintético para probar la resolución condicional',unit:'money',validFrom:'2026-10',validUntil:null,value:'237.000',...patch});
export const conditionalPolicy=(inputKey='teacherCategoryAmount',patch={})=>({policyId:'synthetic.teacher.'+inputKey+'.v1',supersedes:null,agreementCode:'1',validFrom:'2026-10',validUntil:null,liquidationType:'monthly',consumerCode:'19',inputKey,activationInputKey:'teacherPayEnabled',selectorInputKey:'teacherReferenceAmount',selectorOperator:inputKey==='teacherCategoryAmount'?'eq':'ne',selectorValue:'237.00000000',inactivePolicy:'null_with_reason',sourceSha256:'a'.repeat(64),ruleReference:'Política propia exclusivamente sintética, revisión independiente',...patch});
export function sealConditionalSources(s){
 s.salaryConditions.legacy.version=policySha256(['own-contract-salary-conditions.v1',s.period,s.salaryConditions.legacy.records]);s.salaryConditions.version=policySha256(salaryNativeCaptureMaterial(s.salaryConditions,s.period));
 s.workingTime.version=policySha256(['own-contract-working-time.v1',s.period,s.workingTime.records]);
 s.population.version=policySha256({employees:s.population.employees,salaryConditions:s.salaryConditions,workingTime:s.workingTime});
 const catalog=s.programState.salaryCatalog;s.sourceInventory={...(s.sourceInventory??{}),conditionalSources:{version:OWN_CONDITIONAL_SOURCE_CATALOGUE_VERSION,complete:true,tenantId:uid(900),sourceBindingId:uid(901),revision:catalog.revision,approvalId:uid(902),proposalId:uid(903),catalogueVersion:catalog.version,itemsSha256:policySha256(catalog.items),itemCount:catalog.items.length}};return s;
}
export function conditionalSources({enabled=false,selector=null,dailyHours=null,timeApproved=false,rows=[],period='2026-10',count=2}={}){
 const s=nativeSources(count);s.period=period;s.monthly.batches=[];s.fixed.list.data.periodMonth=s.fixed.export.data.periodMonth=period+'-01';
 for(const r of s.salaryConditions.records)Object.assign(r.definition,{teacherPayEnabled:enabled,teacherReferenceAmount:selector});
 const input=(key,unit)=>({op:'input',key,unit}),literal=(value,unit)=>({op:'literal',value,unit});
 const expression={op:'choose',condition:{op:'match',key:'teacherPayEnabled',type:'boolean',operator:'eq',value:true},then:{op:'choose',condition:{op:'compare',operator:'eq',left:input('teacherReferenceAmount','money'),right:literal('237','money')},then:input('teacherCategoryAmount','money'),else:{op:'convert',value:input('teacherDailyHours','hours'),unit:'money',factor:'20',conversionReference:'Conversión exclusivamente sintética de horas a importe'}},else:literal('0','money')};
 s.programState.program.definition={namespaceVersion:'own-payroll-namespaces.v2',salaryConditionsVersion:'own-contract-salary-conditions.v2',workingTimeVersion:'own-contract-working-time.v1',conditionalSourcesVersion:OWN_CONDITIONAL_SOURCES_VERSION,conditionalSourcePolicies:[conditionalPolicy(),conditionalPolicy('teacherDailyHours')],rules:[{code:'19',agreementCode:'1',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:'Fórmula exclusivamente sintética para dos fuentes condicionales',rounding:{precision:2,mode:'half_up'},expression}],bindings:[
  {agreementCode:'1',key:'teacherPayEnabled',sourceKind:'salary_condition_fact',sourceField:'teacherPayEnabled',unit:'boolean',combine:'single',onMissing:'error',ruleReference:'Habilitación nativa sintética aprobada'},
  {agreementCode:'1',key:'teacherReferenceAmount',sourceKind:'salary_condition_fact',sourceField:'teacherReferenceAmount',unit:'money',combine:'single',onMissing:'error',ruleReference:'Selector monetario nativo sintético aprobado'},
  {agreementCode:'1',key:'teacherCategoryAmount',sourceKind:'conditional_scale',sourceCode:'19',unit:'money',combine:'single',onMissing:'error',ruleReference:'Escala obligatoria solamente dentro de la rama declarada'},
  {agreementCode:'1',key:'teacherDailyHours',sourceKind:'conditional_working_time_fact',sourceField:'dailyHours',unit:'hours',combine:'single',onMissing:'error',ruleReference:'Jornada aprobada solamente dentro de la rama declarada'}
 ],totalsPrecision:2};
 s.programState.salaryCatalog.items=salaryItems([{...conditionalScaleRow(),kind:'concept',categoryCode:null,nature:'remuneration',value:null},...rows]);
 s.programState.program.salaryVersion=s.programState.salaryCatalog.version=hash('c');
 s.workingTime={complete:true,version:hash('b'),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,configuration:{version:hash('a'),revision:timeApproved?1:0,definition:timeApproved?{dailyHours,monthlyHours:null,asOfDate:'2026-10-01',documentReference:'Jornada exclusivamente sintética para la prueba234'}:null,proposalId:timeApproved?uid(8000+i):null,approvalId:timeApproved?uid(9000+i):null,identityToken:timeApproved?e.identityToken:null}}))};
 return sealConditionalSources(s);
}
