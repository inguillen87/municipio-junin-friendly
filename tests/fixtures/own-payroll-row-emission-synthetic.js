// Invented payroll identities, quantities and amounts only. No municipal tariff
// or ordering decision is inferred from this QA fixture.
import {familySources,sealFamilySources,familyKey} from './own-payroll-family-consumer-synthetic.js';
import {row} from './native-salary-synthetic.js';
import {salaryItems,SALARY_VERSION} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {rule,lit,fact,policy} from './own-payroll-synthetic.js';
import {OWN_PAYROLL_ROW_EMISSION_VERSION} from '../../assets/own-payroll-row-emission.js';
import {OWN_PROGRAMME_SOURCE_QUANTITIES_VERSION} from '../../lib/own-payroll-programme-source-preparation.js';

const H='a'.repeat(64);
const reference=(code,kind='auxiliary')=>({op:kind,code,stage:'exact'});
const sum=values=>values.length===0?lit('0','money'):values.length===1?values[0]:{op:'add',left:values[0],right:sum(values.slice(1))};
export function syntheticEmissionPolicies(){
 return ['302','306'].map(conceptCode=>({agreementCode:'1',period:'2026-10',liquidationType:'monthly',conceptCode,conditions:[{quantityCode:'1',unit:'days',operator:'gt',value:'14'},{quantityCode:conceptCode,unit:'units',operator:'gt',value:'0'}],whenFalse:'omit_receipt_row',nonzeroAction:'error',sourceReference:'Synthetic receipt policy reproducing the reported302/306 condition only',sourceSha256:H}));
}
export function emissionSources({days='30',children='1',primary='1',rate302='20.00',rate306='30.00',count=1,optIn=true,dependent=false}={}){
 const s=familySources(count),p={namespaceVersion:'own-payroll-namespaces.v2',familyPayrollFactsVersion:'own-contract-family-payroll-facts.v1',quantityPhasesVersion:'own-payroll-quantity-phases.v1',officialTotalsVersion:'own-payroll-official-totals.v1',totalsPrecision:2,rules:[],bindings:[],quantityPhases:[],officialTotalsPolicies:[]};
 const catalog=[];
 const add=(code,expression,nature='remuneration',value=null,label='Synthetic concept '+code)=>{
  p.rules.push(rule(code,expression,{nature,unit:'money',rounding:policy('half_up',2)}));
  catalog.push(row({kind:nature==='auxiliary'?'auxiliary':'concept',code,label,nature,unit:'money',precision:2,value}));
 };
 const phase=(code,unit,expression)=>({agreementCode:'1',code,unit,stage:'exact',rounding:null,expression,validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],sourceReference:'Synthetic original quantity phase for emission QA',sourceSha256:H,amountUse:{kind:'independent'},periodTreatment:{kind:'none',reference:'Synthetic independent quantity, no implicit proration'}});
 add('1',lit('100.005','money'));add('48',lit('100.005','money'));
 p.quantityPhases.push(phase('1','days',lit(days,'days')));
 for(const [code,field,amount,label]of [['302','childrenWithDisability',rate302,'HIJO/S DISCAPACITADO/S (synthetic)'],['306','primary',rate306,'ESCOLARIDAD PRIMARIA (synthetic)']]){
  const quantity=fact(familyKey(field),'units'),tariff=fact('syntheticTariff'+code,'money');
  const amountExpression={op:'multiply',left:{op:'convert',value:quantity,unit:'coefficient',factor:'1',conversionReference:'Synthetic declared beneficiary count times tariff'},right:tariff};
  const expression={op:'choose',condition:{op:'compare',operator:'gt',left:lit(days,'days'),right:lit('14','days')},then:{op:'choose',condition:{op:'compare',operator:'eq',left:quantity,right:lit('0','units')},then:lit('0','money'),else:amountExpression},else:lit('0','money')};
  add(code,expression,'non_remuneration',amount,label);
  p.bindings.push({agreementCode:'1',key:familyKey(field),unit:'units',sourceKind:'family_fact',sourceField:field,combine:'single',onMissing:'error',ruleReference:'Synthetic approved family fact, no inferred household count'},{agreementCode:'1',key:'syntheticTariff'+code,unit:'money',sourceKind:'parameter',sourceCode:code,combine:'single',onMissing:'error',ruleReference:'Invented tariff for QA only'});
  p.quantityPhases.push(phase(code,'units',quantity));
 }
 const payable=['1','48'];
 if(dependent){add('310',reference('302','concept'),'remuneration',null,'Synthetic exact reference to302');payable.push('310');}
 const contributions={'990':[],'993':payable,'994':[],'995':['302','306'],'996':[]};
 for(const [code,targets]of Object.entries(contributions))add('800000'+code,sum(targets.map(c=>reference(c,'concept'))),'auxiliary');
 add('800000888',lit('0','money'),'auxiliary');
 add('800000998',{op:'subtract',left:sum(['993','994','995','888'].map(c=>reference('800000'+c))),right:reference('800000996')},'auxiliary');
 add('800000999',reference('800000998'),'auxiliary');
 p.officialTotalsPolicies=[{version:'own-payroll-official-totals.v1',agreementCode:'1',period:'2026-10',liquidationType:'monthly',totalCodes:Object.fromEntries(['990','993','994','995','996','888','998','999'].map(c=>[c,'800000'+c])),contributions,rounding:{precision:2,mode:'half_up'},nonPositiveNet:'reject',sourceReference:'Synthetic complete official reconciliation, no municipal approval',sourceSha256:H}];
 if(optIn){p.rowEmissionVersion=OWN_PAYROLL_ROW_EMISSION_VERSION;p.rowEmissionPolicies=syntheticEmissionPolicies();}
 s.programState.salaryCatalog.items=salaryItems(catalog);
 s.programState.program.definition=ownProgramDefinition(p,s.programState.salaryCatalog.items);
 for(const r of s.familyPayrollFacts.records){r.definition.quantities.childrenWithDisability=children;r.definition.quantities.primary=primary;}
 return sealFamilySources(s);
}

export function emissionPreparerEvidence(s=emissionSources()){
 const p=s.programState.program.definition,catalog=s.programState.salaryCatalog;
 const references=new Map(p.bindings.map((b,i)=>[b.key,'L['+(9000+i)+']']));
 const sourceNode=node=>{
  if(node===null||typeof node!=='object')return node;
  if(Array.isArray(node))return node.map(sourceNode);
  if(node.op==='input')return{op:'source',reference:references.get(node.key),unit:node.unit};
  return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,sourceNode(v)]));
 };
 const definitions=p.rules.map(r=>{
  const d=catalog.items.find(d=>d.code===r.code&&d.kind===(r.nature==='auxiliary'?'auxiliary':'concept'));
  const q=p.quantityPhases.find(q=>q.code===r.code&&r.nature!=='auxiliary');
  return{kind:d.kind,agreementCode:d.agreementCode,code:d.code,label:d.label,active:d.active,nature:d.nature,quantityUnit:d.kind==='concept'?d.unit:null,outputUnit:r.unit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference,sourceSha256:H,liquidationTypes:r.liquidationTypes,rounding:r.rounding,expression:sourceNode(r.expression),quantity:q?{unit:q.unit,stage:q.stage,rounding:q.rounding,expression:sourceNode(q.expression),sourceReference:q.sourceReference,sourceSha256:q.sourceSha256}:null,role:d.kind==='concept'?'payable':'dependency'};
 });
 const programme=structuredClone(s.programState);programme.program={version:'b'.repeat(64),revision:0,definition:null,salaryVersion:null,proposalId:null,approvalId:null};
 const {rules,bindings,quantityPhases,quantityPhasesVersion,totalsPrecision,...programmeOptions}=p;
 return{version:OWN_PROGRAMME_SOURCE_QUANTITIES_VERSION,salary:{version:SALARY_VERSION,scopeVersion:programme.scopeVersion,classification:{version:'c'.repeat(64),items:[]},catalog:structuredClone(catalog),proposals:[],complete:true,permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},programme,period:'2026-10',agreementCodes:['1'],source:{sha256:H,complete:true,expectedDefinitions:definitions.length},definitions,bindings:bindings.map(binding=>({agreementCode:binding.agreementCode,reference:references.get(binding.key),sourceSha256:H,binding})),programmeOptions,totalsPrecision};
}
