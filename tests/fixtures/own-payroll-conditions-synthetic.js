// Invented declarations/program only; these are not municipal salary rules.
import {auxiliarySources,auxiliaryReference} from './own-payroll-auxiliary-synthetic.js';
import {row} from './native-salary-synthetic.js';import {rule,fact,lit,policy,binary,ref} from './own-payroll-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';import {uid} from './own-payroll-program-synthetic.js';
export const conditionMatch=(key,type,value,operator='eq')=>({op:'match',key,type,value,operator});
const choose=(condition,then,otherwise)=>({op:'choose',condition,then,else:otherwise});
export function sealConditionSources(s){s.salaryConditions.version=ownRunHash(['own-contract-salary-conditions.v1',s.period,s.salaryConditions.records]);s.population.version=ownRunHash({employees:s.population.employees,salaryConditions:s.salaryConditions});return s;}
export function conditionSources(count=37){
 const s=auxiliarySources(count),p=s.programState.program.definition;p.salaryConditionsVersion='own-contract-salary-conditions.v1';p.totalsPrecision=3;
 for(const [code,key,field,unit]of[['910','partialYears','partialSeniorityYears','units'],['911','titlePercentage','titlePercentage','percent']]){
  s.programState.salaryCatalog.items.push(row({kind:'auxiliary',code,nature:'auxiliary',unit}));
  p.rules.push(rule(code,field==='titlePercentage'?choose(conditionMatch('titleStatus','code','declared'),fact(key,unit),lit('0',unit)):fact(key,unit),{nature:'auxiliary',unit,rounding:policy('exact',8)}));
  p.bindings.push({agreementCode:'1',key,unit,sourceKind:'salary_condition_fact',sourceField:field,onMissing:'error',combine:'single',ruleReference:'Condición documentada exclusivamente sintética QA'});
 }
 for(const[field,unit]of[['titleStatus','code'],['titleCode','code'],['unhealthyWork','boolean']])p.bindings.push({agreementCode:'1',key:field,unit,sourceKind:'salary_condition_fact',sourceField:field,onMissing:'error',combine:'single',ruleReference:'Condición documentada exclusivamente sintética QA'});
 const r=p.rules.find(r=>r.code==='95'),base=binary('add',auxiliaryReference('88'),ref('88','exact'));
 r.expression=binary('add',choose(conditionMatch('titleStatus','code','declared'),choose(conditionMatch('titleCode','code','0056'),base,lit('0','money')),base),choose(conditionMatch('unhealthyWork','boolean',true),lit('0.001','money'),lit('0','money')));r.rounding=policy('exact',3);
 s.salaryConditions={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,revision:1,approvalId:uid(50000+i),definition:{partialSeniorityYears:'0',title:{status:'declared',code:'0056',percentage:'12.00000001'},unhealthyWork:false,asOfDate:s.period+'-01',documentReference:'Constancia exclusivamente sintética QA'}}))};return sealConditionSources(s);
}
