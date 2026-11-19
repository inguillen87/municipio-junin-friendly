// Invented arithmetic and decisions for isolated QA. No municipal rates or approvals.
import {rule,lit,binary,payrollInput,employee} from './own-payroll-synthetic.js';
import {ownProgramStructure,ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {salaryItems} from '../../assets/native-salary-catalog-model.js';
import {cappedStepExpressions,captureCappedPolicies} from '../../assets/own-payroll-capped-deductions.js';
import {captureOfficialTotalsPolicy} from '../../assets/own-payroll-official-program.js';
import {normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals} from '../../assets/own-payroll-official-totals.js';
import {quantityInputPhases} from '../../assets/own-payroll-quantity-program.js';
import {policySha256} from '../../assets/own-payroll-policy-validity.js';
import {adjustmentSources} from './own-payroll-declared-adjustments-synthetic.js';
import {capture as runCapture} from './own-payroll-run-synthetic.js';
import {forcedTemporalPolicy} from './own-monthly-forced-validity-synthetic.js';
import {monthlyForcedExpectedExpression} from '../../assets/own-payroll-monthly-forced-amounts.js';
const ref=(code,stage='exact',op='auxiliary')=>({op,code,stage});
const money=value=>lit(value,'money');
const sum=values=>values.reduce((left,right)=>binary('add',left,right),money('0'));
const aux=(code,expression)=>rule(code,expression,{nature:'auxiliary',rounding:{precision:2,mode:'half_up'}});
export function cappedFixture({gross='100.015',reserve='20.004',requests=['80.005','40.005'],existing='0',period='2026-10',monthlyForced649=false,incompatibleSourceCodes=[],stepCodes=['608','630','649'],methods=['29','27',null]}={}){
 const steps=stepCodes.map((conceptCode,i)=>({kind:methods[i]===null?'existing_deduction':'capped',conceptCode,availableCode:String(810000010+i*10),officialAvailableCode:String(810000011+i*10),reserveCode:'810000001',requestedCode:methods[i]===null?null:String(810000012+i*10),limitCode:methods[i]===null?null:String(810000013+i*10),method:methods[i],effectStage:'exact',sourceRowSha256:'b'.repeat(64),ruleReference:'Synthetic declared order and amount '+conceptCode}));
 for(const s of steps)if(s.kind==='existing_deduction')s.effectStage=null;
 const p={policyId:'synthetic-capped-v1',supersedes:null,agreementCode:'1',validFrom:'2026-10',validUntil:null,liquidationType:'monthly',cashBaseReference:ref('810000002'),officialBaseReference:ref('810000003'),consumptionStage:'rounded',officialConsumptionStage:'exact',reserveStage:'exact',limitPrecision:2,lineRounding:{precision:2,mode:'half_up'},officialDestination:'996',incompatibleSourceCodes,priorDeductionCodes:[],steps,orderReference:'Synthetic proposed order, no GRH equivalence',sourceSha256:'a'.repeat(64)};
 const rules=[rule('100',money(gross)),aux('810000001',money(reserve)),aux('810000002',ref('100','rounded','concept')),aux('810000003',ref('100','exact','concept'))];
 let requestIndex=0;
 for(let i=0;i<steps.length;i++){
  const s=steps[i],expressions=cappedStepExpressions(p,i);rules.push(aux(s.availableCode,expressions.available),aux(s.officialAvailableCode,expressions.officialAvailable));
  if(s.kind==='capped')rules.push(aux(s.requestedCode,money(requests[requestIndex++]??'0')),aux(s.limitCode,expressions.limit));
  rules.push(rule(s.conceptCode,s.kind==='capped'?expressions.amount:money(existing),{nature:'deduction'}));
 }
 const totalCodes=Object.fromEntries(['990','993','994','995','996','888','998','999'].map(c=>[c,'800000'+c]));
 for(const c of ['990','994','995','888'])rules.push(aux(totalCodes[c],money('0')));
 rules.push(aux(totalCodes['993'],ref('100','exact','concept')),aux(totalCodes['996'],sum(steps.map(s=>ref(s.conceptCode,'exact','concept')))),aux(totalCodes['998'],binary('subtract',ref(totalCodes['993']),ref(totalCodes['996']))),aux(totalCodes['999'],ref(totalCodes['998'])));
 const official={version:'own-payroll-official-totals.v2',policyId:'synthetic-official-v2',supersedes:null,validFrom:'2026-10',validUntil:null,agreementCode:'1',liquidationType:'monthly',totalCodes,contributions:{990:[],993:['100'],994:[],995:[],996:stepCodes},rounding:{precision:2,mode:'half_up'},nonPositiveNet:'reject',sourceReference:'Synthetic exact total policy',sourceSha256:'c'.repeat(64)};
 const forced=monthlyForced649?forcedTemporalPolicy('649','2026-10'):null;
 if(forced)rules.find(r=>r.code==='649').expression=monthlyForcedExpectedExpression(forced);
 const bindings=forced?[{agreementCode:'1',key:'amount649',unit:'money',sourceKind:'monthly_amount',sourceCode:'649',combine:'single',onMissing:'zero',ruleReference:'Synthetic declared monthly 649 amount'},{agreementCode:'1',key:'presence649',unit:'coefficient',sourceKind:'monthly_presence',sourceCode:'649',combine:'any',onMissing:'zero',ruleReference:'Synthetic complete monthly 649 presence'}]:[];
 const programme=ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',...(forced?{noveltyPresenceVersion:'own-payroll-novelty-presence.v1',monthlyForcedAmountsVersion:'own-monthly-forced-passthrough.v2',monthlyForcedAmountPolicies:[forced]}:{}),quantityPhasesVersion:'own-payroll-quantity-phases.v1',quantityPhases:[{code:'100',agreementCode:'1',unit:'units',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],sourceReference:'Synthetic quantity phase',sourceSha256:'d'.repeat(64),stage:'exact',rounding:null,amountUse:{kind:'independent'},periodTreatment:{kind:'none',reference:'Synthetic quantity independent of amount'},expression:lit('1','units')}],officialTotalsVersion:'own-payroll-official-totals.v2',officialTotalsPolicies:[official],cappedDeductionsVersion:'own-capped-deductions.v1',cappedDeductionPolicies:[p],totalsPrecision:2,rules,bindings});
 const inputs=forced?[{key:'amount649',unit:'money',value:existing,sourceReference:'Synthetic declared amount'},{key:'presence649',unit:'coefficient',value:'1',sourceReference:'Synthetic complete presence'}]:[];
 const people=[employee(1,{inputs})],officialEvidence=captureOfficialTotalsPolicy(programme,period,'monthly',people),capped=captureCappedPolicies(programme,period,'monthly',officialEvidence.officialTotalsPolicy);
 const input=normalizeOwnPayrollOfficialInput({...payrollInput({period,employees:people,rules:programme.rules}),namespaceVersion:programme.namespaceVersion,version:'own-payroll-input.v4',quantityPhasesVersion:programme.quantityPhasesVersion,quantityPhases:quantityInputPhases(programme),...officialEvidence,...capped});
 return{programme,input,result:calculateOwnPayrollWithOfficialTotals(input)};
}
export function cappedCapture(options={}){
 const f=cappedFixture(options),s=adjustmentSources({count:1,events:[],period:f.input.period});
 const items=salaryItems(f.programme.rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,code:r.code,dependencies:[],kind:r.nature==='auxiliary'?'auxiliary':'concept',label:'Synthetic capped '+r.code,nature:r.nature,precision:2,ruleReference:r.ruleReference,unit:r.unit,validFrom:r.validFrom,validUntil:r.validUntil,value:null})));
 s.programState.salaryCatalog.items=items;s.programState.program.definition=ownProgramDefinition(f.programme,items);s.sourceInventory={populationDomain:'native_registered',cappedDeductions:captureCappedPolicies(f.programme,s.period,s.liquidationType,f.input.officialTotalsPolicy)};
 const c=runCapture();c.body.period=s.period;c.body.selection=s.selection;c.body.programVersion=s.programState.program.version;c.bodySha256=policySha256(c.body);c.payload=s;c.payloadSha256=policySha256(s);
 // Preserve the independently approved synthetic population identity.
 const original=f.input.employees[0];for(const k of ['contractId','employeeNumber','agreementCode','departmentCode'])original[k]=s.population.employees[0][k];
 f.input.sourceVersions.population=s.population.version;f.input.sourceVersions.rules=policySha256({program:s.programState.program,salary:s.programState.salaryCatalog});f.input.sourceVersions.novelties=policySha256({monthly:s.monthly,fixed:s.fixed.export.data});f.result=calculateOwnPayrollWithOfficialTotals(f.input);
 c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,inputSha256:policySha256(f.input),resultSha256:policySha256(f.result),input:f.input,result:f.result,recordedAt:c.createdAt};return c;
}
