import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {familyTariffSources,tariffPolicy,tariffKey,provenPairs,realTariffRows} from './fixtures/own-payroll-family-tariff-synthetic.js';
import {familyKey,sealFamilySources} from './fixtures/own-payroll-family-consumer-synthetic.js';
import {emissionPreparerEvidence} from './fixtures/own-payroll-row-emission-synthetic.js';
import {row} from './fixtures/native-salary-synthetic.js';
import {fact,lit,rule,policy} from './fixtures/own-payroll-synthetic.js';
import {salaryItems,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,ownProgramStructure,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {proposeC1FamilyTariffPolicyV2,normalizeFamilyTariffPolicy,OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION as V2,FAMILY_TARIFF_EXECUTOR_MAP} from '../assets/own-payroll-family-tariffs.js';
import {prepareOwnPayrollFamilyTariffSnapshot,createOwnPayrollFamilyTariffSnapshot,verifyOwnPayrollFamilyTariffSnapshot} from '../lib/own-payroll-family-tariff-snapshot.js';
import {prepareOwnPayrollFamilyTariffApprovedInput} from '../lib/own-payroll-approved-input.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';

const additions=[['300','80','1','spouse','2800.00'],['301','81','2','children','35000.00'],['303','84','5','largeFamily','2800.00'],['304','85','6','preschool','3500.00']];
const error=c=>e=>e?.code===c;
const v2Policy=()=>proposeC1FamilyTariffPolicyV2({basePolicy:tariffPolicy(),mappingSourceReference:'Synthetic fixture of explicit four-map proposal; no municipal adoption',mappingSourceSha256:'e'.repeat(64)});
const sum=a=>a.length===1?a[0]:{op:'add',left:a[0],right:sum(a.slice(1))};
function sources({days='30',quantity='1',region='1',average='0.00',count=1,emission=false}={}){
 const s=familyTariffSources({days,quantity,region,average,count,emission}),p=s.programState.program.definition,catalog=s.programState.salaryCatalog.items;
 for(const [c,source,,field]of additions){
  const q=fact(familyKey(field),'units'),t=fact(tariffKey(source),'money');
  const expression={op:'choose',condition:{op:'compare',operator:'gt',left:lit(days,'days'),right:lit('14','days')},then:{op:'choose',condition:{op:'compare',operator:'eq',left:q,right:lit('0','units')},then:lit('0','money'),else:{op:'multiply',left:{op:'convert',value:q,unit:'coefficient',factor:'1',conversionReference:'Synthetic beneficiary count for producer QA only'},right:t}},else:lit('0','money')};
  p.rules.push(rule(c,expression,{nature:'non_remuneration',unit:'money',rounding:policy('half_up',2),validFrom:'2026-10',validUntil:'2026-10'}));
  catalog.push(row({kind:'concept',code:c,label:'Synthetic V2 family producer '+c,nature:'non_remuneration',unit:'money',precision:2,value:null,validFrom:'2026-10',validUntil:'2026-10'}));
  if(!p.bindings.some(b=>b.key===familyKey(field)))p.bindings.push({agreementCode:'1',key:familyKey(field),unit:'units',sourceKind:'family_fact',sourceField:field,combine:'single',onMissing:'error',ruleReference:'Synthetic quantity for V2 producer QA'});
  p.bindings.push({agreementCode:'1',key:tariffKey(source),unit:'money',sourceKind:'family_tariff',sourceCode:source,combine:'single',onMissing:'error',ruleReference:'Explicit V2 named mapping for synthetic producer QA'});
  const qTemplate=structuredClone(p.quantityPhases.find(q=>q.code==='302'));Object.assign(qTemplate,{code:c,expression:q});p.quantityPhases.push(qTemplate);
 }
 for(const r of p.rules)r.validUntil='2026-10';
 const codes=[...provenPairs,...additions].map(x=>x[0]);p.rules.find(r=>r.code==='800000995').expression=sum(codes.map(code=>({op:'concept',code,stage:'exact'})));p.officialTotalsPolicies[0].contributions['995']=codes;
 p.familyTariffsVersion=V2;p.familyTariffPolicies=[v2Policy()];
 s.programState.salaryCatalog.items=salaryItems(catalog);s.programState.program.definition=ownProgramDefinition(p,s.programState.salaryCatalog.items);
 for(const r of s.familyPayrollFacts.records)for(const [,,,field]of additions)r.definition.quantities[field]=quantity;
 return sealFamilySources(s);
}
const amount=(s,c)=>s.result.rows.find(r=>r.nature!=='auxiliary'&&r.conceptCode===c).amount;
const single=(pair,region='1',average='0.00')=>{const s=sources({quantity:'0',region,average});s.familyPayrollFacts.records[0].definition.quantities[pair[3]]='1';return sealFamilySources(s);};

test('V1 full snapshot is unchanged against the frozen runtime, including hashes and evidence',()=>{
 // Entire canonical snapshot hashes captured from the frozen R9 joint runtime,
 // not expectations generated from this candidate implementation.
 const baselines=[
  [{quantity:'2'},'49205d7e696c971c88a147e121f93ff9ebd34fd0ed6771bd196dd4058d354bc3'],
  [{days:'14',region:null,average:null},'7e056888ba1d6a66be79d5b70fa44666e77467d68161c5334cc0107250355102'],
  [{emission:true,quantity:'0'},'42c3b97785ba25b63660c87c9dea7090bd369940ca0cf06f413715e0acc937bf'],
 ];
 for(const [options,expected]of baselines){
  const input=familyTariffSources(options);assert.equal(createHash('sha256').update(salarySerialized(prepareOwnPayrollFamilyTariffSnapshot(input))).digest('hex'),expected);
 }
 assert.equal(Object.keys(FAMILY_TARIFF_EXECUTOR_MAP).length,6);
});
test('new declared V2 mappings resolve four independently known region1 amounts without changing the six original pairs',()=>{
 const s=prepareOwnPayrollFamilyTariffSnapshot(sources());assert.equal(s.input.familyTariffsVersion,V2);assert.equal(s.result.familyTariffsVersion,V2);assert.equal(s.result.familyTariffDecisionCount,10);
 for(const [c,source,type,,expected]of additions){assert.equal(amount(s,c),expected);const d=s.result.familyTariffDecisions.find(d=>d.sourceCode===source);assert.equal(d.typeCode,type);assert.equal(d.status,'resolved');}
 assert.equal(s.input.familyTariffCapture.policies[0].rows.length,33);assert.equal(s.approved,false);assert.equal(s.payrollPosted,false);
});
test('all new tariff intervals test below, at and above the bound with no last-row fallback',()=>{
 let checked=0;
 for(const pair of additions)for(const region of ['1','2']){
  const rows=realTariffRows.filter(r=>r.regionCode===region&&r.typeCode===pair[2]).sort((a,b)=>Number(a.upperBound)-Number(b.upperBound));
  for(const row of rows)for(const delta of [-1,0,1]){
   const cents=Math.round(Number(row.upperBound)*100)+delta,average=(cents/100).toFixed(2),expected=rows.find(r=>Math.round(Number(r.upperBound)*100)>=cents);
   if(!expected)assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(single(pair,region,average)),error('FAMILY_TARIFF_OUTSIDE_RANGE'));
   else{const s=prepareOwnPayrollFamilyTariffSnapshot(single(pair,region,average));assert.equal(amount(s,pair[0]),expected.amount);assert.equal(s.result.familyTariffDecisions.filter(d=>d.status==='resolved').length,1);}
   checked++;
  }
 }
 assert.equal(checked,24);
});
test('new missing region/type pairs fail and never borrow another region',()=>{
 for(const pair of additions.filter(p=>['84','85'].includes(p[1])))assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(single(pair,'2')),error('FAMILY_TARIFF_NOT_FOUND'));
 assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(single(additions[0],'001')),error('METHOD_CODE_REQUIRED'));
});
test('unread new tariffs preserve null facts and never force the tariff selector',()=>{
 for(const o of [{quantity:'0',region:null,average:null},{days:'14',region:null,average:null}]){
  const s=prepareOwnPayrollFamilyTariffSnapshot(sources(o));assert.equal(s.result.familyTariffDecisionCount,10);assert.ok(s.result.familyTariffDecisions.every(d=>d.status==='not_requested'&&d.value===null&&d.readCount===0));
 }
 for(const o of [{region:null},{average:null}])assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(sources(o)),error('FAMILY_TARIFF_FACT_MISSING'));
});
test('new maps do not authorize prenatal or school-aid variables or arithmetic offsets',()=>{
 for(const code of ['83','91','92']){const p=v2Policy();p.mappings.find(m=>m.sourceCode==='80').sourceCode=code;assert.throws(()=>normalizeFamilyTariffPolicy(p),error('FAMILY_TARIFF_MAPPING_UNPROVEN'));}
 const p=v2Policy();p.mappings.find(m=>m.sourceCode==='84').typeCode='4';assert.throws(()=>normalizeFamilyTariffPolicy(p),error('FAMILY_TARIFF_MAPPING_UNPROVEN'));
});
test('version mismatches are rejected both for program and for replay input',()=>{
 const s=sources(),p=s.programState.program.definition;p.familyTariffsVersion='own-payroll-family-tariffs.v1';assert.throws(()=>ownProgramStructure(p),error('FAMILY_TARIFF_VERSION_MISMATCH'));
 const i=prepareOwnPayrollFamilyTariffApprovedInput(sources());i.familyTariffsVersion='own-payroll-family-tariffs.v1';assert.throws(()=>createOwnPayrollFamilyTariffSnapshot(i),error('FAMILY_TARIFF_VERSION_MISMATCH'));
});
test('the old policy stays byte-identical and cannot be rewritten as an approved historical V2 policy',()=>{
 const p=tariffPolicy(),before=JSON.stringify(p),next=proposeC1FamilyTariffPolicyV2({basePolicy:p,mappingSourceReference:'Synthetic explicit map proposal',mappingSourceSha256:'b'.repeat(64)});assert.equal(JSON.stringify(p),before);assert.deepEqual(next.rows,p.rows);
 for(const m of p.mappings)assert.deepEqual(next.mappings.find(x=>x.sourceCode===m.sourceCode),m);
 assert.throws(()=>ownProgramHistory(familyTariffSources().programState.program.definition,sources().programState.program.definition),error('PROGRAM_HISTORY_REQUIRED'));
});
test('period, agreement and quantity restrictions remain effective for new map consumers',()=>{
 const p=sources().programState.program.definition;p.rules.find(r=>r.code==='300').validUntil=null;assert.throws(()=>ownProgramStructure(p),error('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));
 const q=sources().programState.program.definition;q.quantityPhases.find(x=>x.code==='300').expression={op:'convert',value:fact(tariffKey('80'),'money'),unit:'units',factor:'1',conversionReference:'Unsupported conversion in synthetic QA'};assert.throws(()=>ownProgramStructure(q),error('FAMILY_TARIFF_QUANTITY_CONSUMER_UNSUPPORTED'));
 for(const [key,value]of [['agreementCode','2'],['period','2026-11']]){const p=v2Policy();p[key]=value;assert.throws(()=>normalizeFamilyTariffPolicy(p),error('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));}
});
test('V2 replay and source preparation remain review-only with all ten monetary bindings',()=>{
 const raw=sources({emission:true}),s=prepareOwnPayrollFamilyTariffSnapshot(raw);assert.deepEqual(verifyOwnPayrollFamilyTariffSnapshot(s),s);
 const prep=prepareOwnPayrollProgrammeSource(emissionPreparerEvidence(raw));assert.ok(prep.incidents.some(i=>i.code==='PROGRAM_FAMILY_TARIFF_PREPARATION_ONLY'));assert.equal(prep.presentable.programme,false);assert.equal(prep.approved,false);assert.equal(prep.executable,false);assert.equal(prep.draft.programme.familyTariffsVersion,V2);
});
test('the extension preserves ten distinct pairs while malformed duplicates and missing mappings fail',()=>{
 const p=v2Policy();assert.equal(p.mappings.length,10);assert.equal(new Set(p.mappings.map(m=>m.sourceCode)).size,10);assert.equal(p.rows.length,33);
 const duplicate=structuredClone(p);duplicate.mappings[0]=structuredClone(duplicate.mappings[1]);assert.throws(()=>normalizeFamilyTariffPolicy(duplicate),error('FAMILY_TARIFF_MAPPING_UNPROVEN'));
 const missing=structuredClone(p);missing.mappings.pop();assert.throws(()=>normalizeFamilyTariffPolicy(missing),error('FAMILY_TARIFF_CONTRACT_INVALID'));
});
