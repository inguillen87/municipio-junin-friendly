// Invented native declarations only. No municipal people, defaults or approvals.
import {conditionsId as id,conditionsHash as hash,syntheticConditionsSource,syntheticConditionsBootstrap} from './own-contract-salary-conditions-synthetic.js';
import {conditionSources} from './own-payroll-conditions-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {SALARY_NATIVE_VERSION,salaryNativeCaptureMaterial} from '../../assets/own-contract-salary-conditions-native-model.js';
import {salaryConditionsHash} from '../../assets/own-contract-salary-conditions-model.js';
import {rule,lit,fact,binary,policy} from './own-payroll-synthetic.js';
import {row} from './native-salary-synthetic.js';
export {id,hash};
export const nativeDefinition=()=>({teacherPayEnabled:null,teacherReferenceAmount:null,housingHigherDedicationPayEnabled:null,payrollMonthBaseDays:null,asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA'});
export function nativeBootstrap(ids=[id(1),id(848)]){
 const old=syntheticConditionsBootstrap(848),source=syntheticConditionsSource(848);
 source.subjects=source.subjects.filter(s=>ids.includes(s.contractId));
 return {...old,version:SALARY_NATIVE_VERSION,contractIds:ids,source,configuration:{version:hash,items:[],records:[]}};
}
export function nativeCommand(ids){const b=nativeBootstrap(ids);return {version:SALARY_NATIVE_VERSION,contractIds:b.contractIds,command:'propose',period:b.period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,items:b.source.subjects.map(s=>({contractId:s.contractId,identityToken:s.identityToken,definition:nativeDefinition()})),reason:'Declaración independiente exclusivamente sintética',reviewConfirmed:false};}
export async function nativeDetail(){const body=nativeCommand();return {version:SALARY_NATIVE_VERSION,period:body.period,contractIds:body.contractIds,scopeVersion:hash,proposal:{id:id(11001),requestSha256:await salaryConditionsHash(body),baseVersion:body.baseVersion,sourceVersion:body.sourceVersion,itemCount:body.items.length,reason:body.reason,createdAt:'2026-10-10T12:00:00Z',authorLabel:'Preparador sintético',canReview:true,status:'pending',decision:null,contractIds:body.contractIds},body,baseItems:[],source:nativeBootstrap().source,current:true,permissions:{canPropose:false,canReview:true}};}
export async function nativeReceipt(body=nativeCommand(),requestKey=id(11002)){return {version:SALARY_NATIVE_VERSION,eventId:id(11001),proposalId:id(11001),requestKey,requestSha256:await salaryConditionsHash(body),body,status:'pending',revision:0,configurationVersion:body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};}
export function sealNativeSources(s){
 s.salaryConditions.legacy.version=ownRunHash(['own-contract-salary-conditions.v1',s.period,s.salaryConditions.legacy.records]);
 s.salaryConditions.version=ownRunHash(salaryNativeCaptureMaterial(s.salaryConditions,s.period));
 s.population.version=ownRunHash({employees:s.population.employees,salaryConditions:s.salaryConditions});return s;
}
export function nativeSources(count=2){
 const s=conditionSources(count),p=s.programState.program.definition;
 p.salaryConditionsVersion=SALARY_NATIVE_VERSION;p.totalsPrecision=8;
 s.salaryConditions={complete:true,version:hash,legacy:s.salaryConditions,records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,revision:i+2,approvalId:id(70000+i),definition:{...nativeDefinition(),teacherPayEnabled:true,housingHigherDedicationPayEnabled:false,payrollMonthBaseDays:'30.00000001'}}))};
 for(const [key,unit] of [['teacherPayEnabled','boolean'],['housingHigherDedicationPayEnabled','boolean'],['payrollMonthBaseDays','days']])p.bindings.push({agreementCode:'1',key,unit,sourceKind:'salary_condition_fact',sourceField:key,onMissing:'error',combine:'single',ruleReference:'Tres datos declarados exclusivamente sintéticos'});
 const choose=(key,yes,no)=>({op:'choose',condition:{op:'match',key,type:'boolean',operator:'eq',value:true},then:yes,else:no});
 for(const [code,expression] of [
  ['901',choose('teacherPayEnabled',lit('1.125','money'),lit('0','money'))],
  ['902',choose('housingHigherDedicationPayEnabled',lit('2','money'),lit('0','money'))],
  ['903',binary('multiply',lit('30','money'),binary('divide',fact('payrollMonthBaseDays','days'),lit('30','days')))]
 ]){s.programState.salaryCatalog.items.push(row({kind:'concept',code,nature:'remuneration',unit:'money'}));p.rules.push(rule(code,expression,{rounding:policy('exact',8)}));}
 return sealNativeSources(s);
}
