import {prepareOwnPayrollProgrammeSource,OWN_PROGRAMME_SOURCE_VERSION,OWN_PROGRAMME_SOURCE_ROLES_VERSION} from '../../lib/own-payroll-programme-source-preparation.js';
import {salaryItems,SALARY_VERSION} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,OWN_PROGRAM_VERSION} from '../../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../../assets/own-payroll-engine.js';
// Fictitious codes, values, source hashes and rules only. No SQL, IO or municipal source.
const h=c=>c.repeat(64),literal=(unit,value)=>({op:'literal',unit,value});
const definition=(code,overrides={})=>({kind:'concept',agreementCode:'71',code,label:'Definición exclusivamente ficticia '+code,active:true,nature:'remuneration',quantityUnit:'days',outputUnit:'money',precision:8,validFrom:'2026-09',validUntil:null,value:null,dependencies:[],ruleReference:'Respaldo ficticio de pruebas sintéticas',sourceSha256:h('e'),liquidationTypes:['monthly'],rounding:{precision:8,mode:'exact'},expression:literal('money','9007199254740993.00000001'),quantity:null,...overrides});
const catalogRow=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
export function preparedProgramFixture({version='v1',prior=false}={}){
 if(!['v1','v2'].includes(version))throw Error('Synthetic version not supported');
 const explicit=version==='v2',definitions=explicit?[
  definition('301',{role:'payable',expression:{op:'multiply',left:{op:'multiply',left:literal('money','10'),right:{op:'auxiliary',code:'501',stage:'exact'}},right:{op:'divide',left:{op:'source',reference:'L[401]',unit:'days'},right:literal('days','1')}}}),
  definition('501',{role:'dependency',kind:'auxiliary',nature:'auxiliary',quantityUnit:null,outputUnit:'coefficient',expression:literal('coefficient','0.1')}),
  definition('401',{role:'input',expression:null,rounding:null,liquidationTypes:[],value:'2.00000000'})
 ]:[definition('301')];
 const old=definition('201',{validFrom:'2026-01',validUntil:'2026-08',expression:literal('money','8')});
 const items=salaryItems([...definitions,...(prior?[old]:[])].map(catalogRow)),scopeVersion=h('a'),salaryVersion=h('b');
 const previous=prior?ownProgramDefinition({namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,rules:[{code:old.code,agreementCode:old.agreementCode,nature:old.nature,unit:old.outputUnit,validFrom:old.validFrom,validUntil:old.validUntil,liquidationTypes:old.liquidationTypes,rounding:old.rounding,expression:old.expression,ruleReference:old.ruleReference}],bindings:[],totalsPrecision:8},items):null;
 const salary={version:SALARY_VERSION,scopeVersion,classification:{version:h('c'),items:[]},catalog:{version:salaryVersion,revision:1,items:structuredClone(items)},proposals:[],complete:true,permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};
 const programme={version:OWN_PROGRAM_VERSION,scopeVersion,salaryCatalog:{version:salaryVersion,revision:1,items:structuredClone(items)},program:{version:h('d'),revision:previous?1:0,definition:previous,salaryVersion:previous?salaryVersion:null,proposalId:previous?'10000000-0000-4000-8000-000000000001':null,approvalId:previous?'10000000-0000-4000-8000-000000000002':null},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};
 const input={version:explicit?OWN_PROGRAMME_SOURCE_ROLES_VERSION:OWN_PROGRAMME_SOURCE_VERSION,salary,programme,period:'2026-09',agreementCodes:['71'],source:{sha256:h('f'),complete:true,expectedDefinitions:definitions.length},definitions,bindings:explicit?[{agreementCode:'71',reference:'L[401]',sourceSha256:h('2'),binding:{agreementCode:'71',key:'DeclaredInput',unit:'days',sourceKind:'parameter',sourceCode:'401',combine:'single',onMissing:'error',ruleReference:'Entrada ficticia expresamente revisada'}}]:[],programmeOptions:{namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION},totalsPrecision:8};
 const preparation=prepareOwnPayrollProgrammeSource(input);
 return {input,salary,programme,preparation,text:JSON.stringify(preparation),draft:structuredClone(previous??{rules:[],bindings:[],totalsPrecision:null})};
}
export const preparedProgramV1=()=>preparedProgramFixture({version:'v1'});
export const preparedProgramV2=()=>preparedProgramFixture({version:'v2'});
