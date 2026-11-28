// Invented identities, declarations, approvals and amounts. No municipal facts.
import {createHash} from 'node:crypto';
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {row} from './native-salary-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {rule,lit} from './own-payroll-synthetic.js';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {monthlyForcedExpectedExpression,monthlyForcedPolicyId,OWN_MONTHLY_FORCED_AMOUNT_VERSION as V1,OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION as V2} from '../../assets/own-payroll-monthly-forced-amounts.js';
import {prepareOwnPayrollInput} from '../../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../../lib/own-payroll-snapshot.js';
import {prepareOwnPayrollRowEmissionSnapshot} from '../../lib/own-payroll-row-emission-snapshot.js';

export const forcedHash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
export const forcedLegacyPolicy=(code='609',period='2026-10')=>({agreementCode:'1',period,liquidationType:'monthly',sourceContract:'own-payroll-novelty-batch.v1',sourceKind:'monthly_amount',sourceCode:code,amountInputKey:'amount'+code,presenceInputKey:'presence'+code,treatment:'declared_amount_passthrough',quantityPolicy:'explicit_zero',sourceSha256:'a'.repeat(64),ruleReference:'Synthetic monthly amount policy, no municipal decision'});
export function forcedTemporalPolicy(code='609',from='2027-08',until=null,prior=null){
 const {period,...fields}=forcedLegacyPolicy(code);
 return{version:V2,policyId:'synthetic-forced-'+code+'-'+from,supersedes:prior?{policyId:monthlyForcedPolicyId(prior),policySha256:forcedHash(prior)}:null,...fields,validFrom:from,validUntil:until};
}
export function forcedValiditySources({code='609',period='2027-08',validFrom='2027-08',validUntil=null,legacy=false,includeLegacy=false,amount='2000',quantity='0',forced=true,reviews=1,official=false}={}){
 const s=approvedSources(1),old=forcedLegacyPolicy(code),policy=legacy?forcedLegacyPolicy(code,period):forcedTemporalPolicy(code,validFrom,validUntil,includeLegacy?old:null);
 const p={namespaceVersion:'own-payroll-namespaces.v2',noveltyPresenceVersion:'own-payroll-novelty-presence.v1',monthlyForcedAmountsVersion:legacy?V1:V2,monthlyForcedAmountPolicies:includeLegacy?[old,policy]:[policy],totalsPrecision:2,rules:[rule('100',lit('1000','money'))],bindings:[]};
 if(includeLegacy)p.rules.push(rule(code,monthlyForcedExpectedExpression(old),{nature:'deduction',validFrom:old.period,validUntil:old.period}));
 p.rules.push(rule(code,monthlyForcedExpectedExpression(policy),{nature:'deduction',validFrom:legacy?period:validFrom,validUntil:legacy?period:validUntil}));
 p.bindings.push({agreementCode:'1',key:policy.amountInputKey,unit:'money',sourceKind:'monthly_amount',sourceCode:code,combine:'single',onMissing:'zero',ruleReference:'Synthetic native monthly amount'},{agreementCode:'1',key:policy.presenceInputKey,unit:'coefficient',sourceKind:'monthly_presence',sourceCode:code,combine:'any',onMissing:'zero',ruleReference:'Synthetic complete monthly presence'});
 const catalog=[row({code:'100',nature:'remuneration',unit:'money'}),row({code,nature:'deduction',unit:'money'})];
 if(official){
  p.quantityPhasesVersion='own-payroll-quantity-phases.v1';p.quantityPhases=[{agreementCode:'1',code:'740',unit:'units',stage:'exact',rounding:null,expression:lit('0','units'),validFrom,validUntil,liquidationTypes:['monthly'],sourceReference:'Synthetic quantity, no household declaration',sourceSha256:'a'.repeat(64),amountUse:{kind:'independent'},periodTreatment:{kind:'none',reference:'Synthetic quantity without proration'}}];
  p.rules.push(rule('740',lit('0','money'),{nature:'non_remuneration',validFrom,validUntil}));catalog.push(row({code:'740',nature:'non_remuneration',unit:'money'}));
  const ref=(code,op='auxiliary')=>({op,code,stage:'exact'}),sum=a=>a.length===0?lit('0','money'):a.length===1?a[0]:{op:'add',left:a[0],right:sum(a.slice(1))};
  const contributions={'990':[],'993':['100'],'994':[],'995':['740'],'996':[code]};
  const add=(code,expression)=>{p.rules.push(rule('800000'+code,expression,{nature:'auxiliary',validFrom,validUntil}));catalog.push(row({kind:'auxiliary',code:'800000'+code,nature:'auxiliary',unit:'money'}));};
  for(const [total,codes]of Object.entries(contributions))add(total,sum(codes.map(c=>ref(c,'concept'))));
  add('888',lit('0','money'));add('998',{op:'subtract',left:sum(['993','994','995','888'].map(c=>ref('800000'+c))),right:ref('800000996')});add('999',ref('800000998'));
  p.officialTotalsVersion='own-payroll-official-totals.v2';p.officialTotalsPolicies=[{version:p.officialTotalsVersion,policyId:'synthetic-official-total',supersedes:null,agreementCode:'1',validFrom,validUntil,liquidationType:'monthly',totalCodes:Object.fromEntries(['990','993','994','995','996','888','998','999'].map(c=>[c,'800000'+c])),contributions,rounding:{precision:2,mode:'half_up'},nonPositiveNet:'reject',sourceReference:'Synthetic official totals, not a municipal approval',sourceSha256:'a'.repeat(64)}];
  p.rowEmissionVersion='own-payroll-row-emission.v2';p.rowEmissionPolicies=[{version:p.rowEmissionVersion,policyId:'synthetic-emission',supersedes:null,agreementCode:'1',validFrom,validUntil,liquidationType:'monthly',conceptCode:'740',conditions:[{quantityCode:'740',unit:'units',stage:'exact',valueDomain:'nonnegative_integer',operator:'gt',value:'0'}],whenFalse:'omit_receipt_row',nonzeroAction:'error',sourceReference:'Synthetic zero-row emission condition',sourceSha256:'a'.repeat(64)}];
 }
 s.period=period;s.fixed.list.data.periodMonth=period+'-01';s.fixed.export.data.periodMonth=period+'-01';s.programState.program.definition=p;s.programState.salaryCatalog.items=salaryItems(catalog);
 const e=s.population.employees[0],subject={...approvedSources(1).monthly.batches[0].rows[0].subject,contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken};
 const values={rowOrdinal:1,legajo:e.employeeNumber,contractId:e.contractId,identityToken:e.identityToken,conceptSourceId:code,costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:quantity,amountCents:amount,movementType:null,legalInstrument:null,observation:'Synthetic reviewed source; no municipal decision',forced};
 const rows=[{values,subject,identityCurrent:true}],preparedBy={membershipId:uid(8101),personId:uid(8102)},approvals=Array.from({length:reviews},(_,i)=>({membershipId:uid(8110+2*i),personId:uid(8111+2*i)}));
 s.monthly={complete:true,batches:[],nativeBatches:[{version:'own-payroll-novelty-batch.v1',id:uid(8105),revision:reviews+2,status:'approved',periodMonth:period+'-01',payrollType:'monthly',rows,rowCount:1,rowsSha256:forcedHash(rows.map(({values,subject})=>({values,subject}))),preparedBy,decidedBy:approvals.at(-1),approvals,grhMutation:false,payrollCalculated:false,payrollPosted:false}]};
 return s;
}
export function forcedValiditySnapshot(s){
 s.programState.program.definition=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);
 return s.programState.program.definition.rowEmissionVersion?prepareOwnPayrollRowEmissionSnapshot(s):createOwnPayrollSnapshot(prepareOwnPayrollInput(s));
}
export function forcedValidityCapture(s=forcedValiditySources({official:true})){
 const snapshot=forcedValiditySnapshot(s),payload={...s,sourceInventory:{}},body={period:s.period,liquidationType:s.liquidationType,selection:s.selection,scopeVersion:s.programState.scopeVersion,programVersion:s.programState.program.version,populationDomain:'native_registered'},id=uid(9001),algorithmSha256='e'.repeat(64),createdAt='2026-11-12T22:45:00.000Z';
 return{version:'own-payroll-run.v1',id,key:uid(9002),body,bodySha256:forcedHash(body),algorithmSha256,payload,payloadSha256:forcedHash(payload),createdAt,replayed:false,saved:{version:'own-payroll-saved.v1',id,algorithmSha256,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:createdAt}};
}
