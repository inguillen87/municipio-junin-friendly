// Real general R9 tariff configuration, exclusively invented employee facts.
// No tariff approval or household data is imported from a municipal database.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emissionSources} from './own-payroll-row-emission-synthetic.js';
import {familyKey,sealFamilySources} from './own-payroll-family-consumer-synthetic.js';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {proposeC1FamilyTariffPolicy,OWN_PAYROLL_FAMILY_TARIFFS_VERSION} from '../../assets/own-payroll-family-tariffs.js';
import {row} from './native-salary-synthetic.js';
import {rule,lit,fact,policy} from './own-payroll-synthetic.js';
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');
const sourceBytes=readFileSync(new URL('./family-tariff-r9-configuration.json',import.meta.url));
export const realTariffRows=JSON.parse(sourceBytes);
const provenance=JSON.parse(readFileSync(new URL('./family-tariff-r9-provenance.json',import.meta.url)));
export const provenPairs=[
 ['302','82','3','childrenWithDisability'],['305','86','7','preschoolWithDisability'],
 ['306','87','8','primary'],['307','89','10','secondary'],
 ['308','88','9','primaryWithDisability'],['309','90','11','secondaryWithDisability'],
];
export const tariffKey=sourceCode=>'family_tariff_L'+sourceCode;
export function tariffPolicy(rows=realTariffRows){const original=hash(rows)===provenance.canonicalRowsSha256;return proposeC1FamilyTariffPolicy({rows:structuredClone(rows),rowsSha256:hash(rows),sourceReference:original?'R9 recovered general tariff table; candidate QA, no municipal adoption':'Synthetic modification of QA tariff table; no adopted tariff',sourceSha256:original?provenance.fileSha256:hash(rows),mappingSourceReference:'R9 method-runtime/lib/own-payroll-method-runtime.js explicit FAMILY map',mappingSourceSha256:provenance.mappingSourceSha256});}
const reference=c=>({op:'concept',code:c,stage:'exact'});
const sum=values=>values.length===1?values[0]:{op:'add',left:values[0],right:sum(values.slice(1))};
export function familyTariffSources({days='30',quantity='1',region='1',average='0.00',count=1,emission=false,rows=realTariffRows}={}){
 const s=emissionSources({days,count,optIn:emission}),p=s.programState.program.definition,catalog=s.programState.salaryCatalog.items;
 for(const [conceptCode,sourceCode,,field]of provenPairs){
  const q=fact(familyKey(field),'units'),t=fact(tariffKey(sourceCode),'money');
  const expression={op:'choose',condition:{op:'compare',operator:'gt',left:lit(days,'days'),right:lit('14','days')},then:{op:'choose',condition:{op:'compare',operator:'eq',left:q,right:lit('0','units')},then:lit('0','money'),else:{op:'multiply',left:{op:'convert',value:q,unit:'coefficient',factor:'1',conversionReference:'Synthetic declared beneficiary count, no inferred eligibility'},right:t}},else:lit('0','money')};
  const existing=p.rules.find(r=>r.code===conceptCode&&r.nature!=='auxiliary');
  if(existing)existing.expression=expression;else p.rules.push(rule(conceptCode,expression,{nature:'non_remuneration',unit:'money',rounding:policy('half_up',2)}));
  const d=catalog.find(r=>r.code===conceptCode&&r.kind==='concept');if(d)d.value=null;else catalog.push(row({kind:'concept',code:conceptCode,label:'Synthetic family concept '+conceptCode,nature:'non_remuneration',unit:'money',precision:2,value:null}));
  if(!p.bindings.some(b=>b.key===familyKey(field)))p.bindings.push({agreementCode:'1',key:familyKey(field),unit:'units',sourceKind:'family_fact',sourceField:field,combine:'single',onMissing:'error',ruleReference:'Synthetic approved family source, no inferred household count'});
  p.bindings=p.bindings.filter(b=>b.key!=='syntheticTariff'+conceptCode);
  p.bindings.push({agreementCode:'1',key:tariffKey(sourceCode),unit:'money',sourceKind:'family_tariff',sourceCode,combine:'single',onMissing:'error',ruleReference:'Explicit R9 L'+sourceCode+' tariff mapping; synthetic employee facts'});
  if(!p.quantityPhases.some(phase=>phase.code===conceptCode))p.quantityPhases.push({agreementCode:'1',code:conceptCode,unit:'units',stage:'exact',rounding:null,expression:q,validFrom:'2026-10',validUntil:'2026-10',liquidationTypes:['monthly'],sourceReference:'Synthetic quantity, R9 family mapping preserved',sourceSha256:'a'.repeat(64),amountUse:{kind:'independent'},periodTreatment:{kind:'none',reference:'No implicit quantity proration'}});
 }
 for(const r of p.rules)r.validUntil='2026-10';for(const q of p.quantityPhases)q.validUntil='2026-10';for(const d of catalog)d.validUntil='2026-10';
 p.rules.find(r=>r.code==='800000995').expression=sum(provenPairs.map(([c])=>reference(c)));
 p.officialTotalsPolicies[0].contributions['995']=provenPairs.map(([c])=>c);
 p.familyTariffsVersion=OWN_PAYROLL_FAMILY_TARIFFS_VERSION;p.familyTariffPolicies=[tariffPolicy(rows)];
 s.programState.salaryCatalog.items=salaryItems(catalog);s.programState.program.definition=ownProgramDefinition(p,s.programState.salaryCatalog.items);
 for(const r of s.familyPayrollFacts.records){for(const [,,,field]of provenPairs)r.definition.quantities[field]=quantity;r.definition.tariffSelection={region,semesterAverage:average};}
 return sealFamilySources(s);
}
