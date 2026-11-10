// Invented editor arithmetic only. No municipal identity, rule, salary or SQL data.
import {bootstrap,hash,uid} from './own-payroll-program-synthetic.js';
import {ownProgramStructure} from '../../assets/own-payroll-program-model.js';
import {participationRuleKey,OWN_PARTICIPATION_VERSION} from '../../assets/own-period-participation-program.js';
import {MONTHLY_DAY_FACTS_VERSION,MONTHLY_DAY_POLICY_VERSION} from '../../assets/own-monthly-day-policy-model.js';
export {hash,uid};
export const monthlyDayWorkspacePolicy=(reference='Base de treinta días exclusivamente sintética QA')=>({version:MONTHLY_DAY_POLICY_VERSION,basis:'verified_full_month',unit:'days',recognizedDays:'30',baseDays:'30',partial:'reject',reference});
export function monthlyDayWorkspaceDefinitions(){return [{active:true,agreementCode:'1',categoryCode:null,code:'9100',dependencies:[],kind:'concept',label:'Resultado exclusivamente sintético QA',nature:'remuneration',precision:2,ruleReference:'Metadata inventada QA; ninguna fórmula municipal',unit:'money',validFrom:'2026-10',validUntil:null,value:null}];}
export function monthlyDayWorkspaceProgram(patch={}){
 const rule={agreementCode:'1',code:'9100',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:'Fórmula aritmética exclusivamente sintética QA',rounding:{precision:2,mode:'exact'},expression:{op:'multiply',left:{op:'literal',unit:'money',value:'60'},right:{op:'divide',left:{op:'input',unit:'days',key:'recognizedDays'},right:{op:'input',unit:'days',key:'baseDays'}}}};
 const binding=sourceField=>({agreementCode:'1',key:sourceField,sourceKind:'monthly_day_fact',sourceField,unit:'days',onMissing:'error',combine:'single',ruleReference:'Entrada exclusivamente sintética QA'});
 return ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',monthlyDaysVersion:MONTHLY_DAY_FACTS_VERSION,monthlyDaysPolicy:monthlyDayWorkspacePolicy(),periodParticipation:{version:OWN_PARTICIPATION_VERSION,fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:[{ruleKey:participationRuleKey(rule),treatment:'declared_formula',reference:'La fórmula sintética declara una única proporción'}]},rules:[rule],bindings:[binding('recognizedDays'),binding('baseDays')],totalsPrecision:2,...patch});
}
export function monthlyDayWorkspaceBootstrap(patch={}){return bootstrap({salaryCatalog:{version:hash('c'),revision:1,items:monthlyDayWorkspaceDefinitions()},...patch});}
export function monthlyDayWorkspaceApproved(){return {version:hash('e'),revision:1,definition:monthlyDayWorkspaceProgram(),salaryVersion:hash('c'),proposalId:uid(51),approvalId:uid(52)};}
