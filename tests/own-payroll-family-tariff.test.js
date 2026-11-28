import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {familyTariffSources,realTariffRows,provenPairs,tariffKey,tariffPolicy} from './fixtures/own-payroll-family-tariff-synthetic.js';
import {emissionSources,emissionPreparerEvidence} from './fixtures/own-payroll-row-emission-synthetic.js';
import {sealFamilySources} from './fixtures/own-payroll-family-consumer-synthetic.js';
import {command} from './fixtures/own-payroll-program-synthetic.js';
import {fact} from './fixtures/own-payroll-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {decimal,exactAdd,exactSubtract,exactCompare,quantize,exactEvidence} from '../assets/own-payroll-exact.js';
import {ownProgramDefinition,ownProgramStructure,ownProgramCommand,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {normalizeOwnPayrollOfficialInput} from '../assets/own-payroll-official-totals.js';
import {normalizeFamilyTariffPolicy} from '../assets/own-payroll-family-tariffs.js';
import {prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput,prepareOwnPayrollFamilyTariffApprovedInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollFamilyTariffSnapshot,prepareOwnPayrollFamilyTariffSnapshot,verifyOwnPayrollFamilyTariffSnapshot} from '../lib/own-payroll-family-tariff-snapshot.js';
import {createOwnPayrollRowEmissionSnapshot,projectOwnPayrollRowEmissionReceipt} from '../lib/own-payroll-row-emission-snapshot.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';

const codeIs=code=>e=>e&&e.code===code;
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');
const build=options=>{const sources=familyTariffSources(options),snapshot=prepareOwnPayrollFamilyTariffSnapshot(sources);return{sources,snapshot};};
const amount=(snapshot,code,id=snapshot.input.employees[0].contractId)=>snapshot.result.rows.find(r=>r.contractId===id&&r.nature!=='auxiliary'&&r.conceptCode===code).amount;
const knownOnly=(pair,region,average)=>{const s=familyTariffSources({quantity:'0',region,average});s.familyPayrollFacts.records[0].definition.quantities[pair[3]]='1';return sealFamilySources(s);};
const rehash=s=>{s.inputSha256=hash(s.input);s.resultSha256=hash(s.result);s.familyTariffCaptureSha256=hash(s.input.familyTariffCapture);s.familyTariffDecisionsSha256=hash(s.result.familyTariffDecisions);return s;};

test('all six executor-proved bindings consume the complete33-row table and captured family facts, without filling raw inputs',()=>{
 const {sources,snapshot:s}=build({quantity:'2'});assert.equal(realTariffRows.length,33);assert.equal(s.input.version,'own-payroll-input.v4');assert.equal(s.result.rowCount,16);assert.equal(s.result.quantityCount,7);assert.equal(s.result.familyTariffDecisionCount,6);
 for(const [concept,sourceCode,typeCode]of provenPairs){const d=s.result.familyTariffDecisions.find(d=>d.sourceCode===sourceCode),source=realTariffRows.find(r=>r.regionCode==='1'&&r.typeCode===typeCode);assert.equal(d.status,'resolved');assert.equal(d.conceptCode,concept);assert.equal(d.selection.sourceSha256,source.sourceSha256);assert.equal(d.selection.regionCode,'1');assert.equal(d.value,quantize(decimal(source.amount),{precision:8,mode:'exact'}).amount);assert.equal(amount(s,concept),quantize(exactAdd(decimal(source.amount),decimal(source.amount)),{precision:2,mode:'exact'}).amount);assert.equal(d.familyApprovalId,sources.familyPayrollFacts.records[0].approvalId);assert.equal(d.familyFactsVersion,sources.familyPayrollFacts.version);assert.equal(d.familyDefinitionSha256,hash(sources.familyPayrollFacts.records[0].definition));assert.equal(d.rowsSha256,hash(realTariffRows));assert.equal(s.input.employees[0].inputs.find(i=>i.key===tariffKey(sourceCode)).value,null);}
 assert.equal(s.approved,false);assert.equal(s.result.municipalApprovalVerified,false);assert.equal(s.payrollPosted,false);assert.equal(s.paymentExecuted,false);
});

test('every real tier of the six types has an inclusive boundary, exact cent below/above, and error above its last tier',()=>{
 let checked=0;
 for(const pair of provenPairs)for(const region of [...new Set(realTariffRows.filter(r=>r.typeCode===pair[2]).map(r=>r.regionCode))]){
  const rows=realTariffRows.filter(r=>r.typeCode===pair[2]&&r.regionCode===region).sort((a,b)=>exactCompare(decimal(a.upperBound),decimal(b.upperBound)));
  for(const [index,current]of rows.entries())for(const offset of ['-0.01','0','0.01']){
   const average=quantize(exactAdd(decimal(current.upperBound),decimal(offset)),{precision:2,mode:'exact'}).amount,expected=rows.find(r=>exactCompare(decimal(average),decimal(r.upperBound))<=0),sources=knownOnly(pair,region,average);
   if(!expected)assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(sources),codeIs('FAMILY_TARIFF_OUTSIDE_RANGE'));
   else{const s=prepareOwnPayrollFamilyTariffSnapshot(sources),d=s.result.familyTariffDecisions.find(d=>d.sourceCode===pair[1]);assert.equal(d.selection.sourceSha256,expected.sourceSha256);assert.deepEqual(d.selection.upperBound,exactEvidence(decimal(expected.upperBound)));assert.equal(amount(s,pair[0]),expected.amount);assert.equal(s.result.familyTariffDecisions.filter(d=>d.status==='resolved').length,1);}
   checked++;
  }
 }
 assert.equal(checked,27); // Nine source rows belong to these six proved types.
});

test('unselected branches preserve nullable region/average and all six tariffs as null, not zero',()=>{
 for(const options of [{days:'14',region:null,average:null},{quantity:'0',region:null,average:null},{days:'14',region:'999',average:'9999999999.99'},{quantity:'0',region:'001',average:'9999999999.99'}]){
  const {snapshot:s}=build(options);assert.ok(s.result.familyTariffDecisions.every(d=>d.status==='not_requested'&&d.value===null&&d.selection===null&&d.readCount===0));assert.ok(s.input.employees[0].inputs.filter(i=>i.key.startsWith('family_tariff_')).every(i=>i.value===null));for(const [c]of provenPairs)assert.equal(amount(s,c),'0.00');
 }
});

test('a selected branch requires the exact captured region and average, with no normalization or fallback',()=>{
 for(const options of [{region:null},{average:null}])assert.throws(()=>build(options),codeIs('FAMILY_TARIFF_FACT_MISSING'));
 assert.throws(()=>build({region:'999'}),codeIs('FAMILY_TARIFF_NOT_FOUND'));
 assert.throws(()=>build({region:'001'}),codeIs('METHOD_CODE_REQUIRED'));
 assert.throws(()=>build({average:'9999999999.99'}),codeIs('FAMILY_TARIFF_OUTSIDE_RANGE'));
});

test('lazy resolution follows the actual amount branch and imposes no new global U1 or quantity condition',()=>{
 const s=familyTariffSources({days:'14',quantity:'0'}),r=s.programState.program.definition.rules.find(r=>r.code==='302');r.expression=fact(tariffKey('82'),'money');
 const snap=prepareOwnPayrollFamilyTariffSnapshot(s);assert.equal(snap.result.familyTariffDecisions.filter(d=>d.status==='resolved').length,1);assert.equal(snap.result.familyTariffDecisions.find(d=>d.sourceCode==='82').status,'resolved');
 const expected=realTariffRows.find(r=>r.regionCode==='1'&&r.typeCode==='3').amount;assert.equal(amount(snap,'302'),expected);
});

test('explicit zero tariff is a resolved monetary value and remains visible under the emission policy',()=>{
 const rows=structuredClone(realTariffRows);for(const r of rows)if(['3','8'].includes(r.typeCode)){r.amount='0.00';r.sourceSha256=hash(r);}
 const {sources,snapshot:s}=build({rows,emission:true});assert.equal(s.input.version,'own-payroll-input.v5');const emission=createOwnPayrollRowEmissionSnapshot(s.input),receipt=projectOwnPayrollRowEmissionReceipt(emission,sources.programState,s.input.employees[0].contractId);
 for(const [code,sourceCode]of provenPairs.filter(([c])=>['302','306'].includes(c))){assert.equal(s.result.familyTariffDecisions.find(d=>d.sourceCode===sourceCode).status,'resolved');assert.equal(amount(s,code),'0.00');assert.ok(receipt.concepts.some(c=>c.code===code));}assert.equal(receipt.omittedRowCount,0);
});

test('emission of ineligible302/306 composes with unread tariffs and unchanged V4 total reconciliation',()=>{
 const {sources,snapshot:s}=build({quantity:'0',region:null,average:null,emission:true}),emission=createOwnPayrollRowEmissionSnapshot(s.input),receipt=projectOwnPayrollRowEmissionReceipt(emission,sources.programState,s.input.employees[0].contractId);
 assert.deepEqual(receipt.omissionAudit.map(a=>a.calculatedRow.conceptCode),['302','306']);assert.equal(s.result.rowCount,16);assert.equal(s.result.familyTariffDecisions.filter(d=>d.status==='not_requested').length,6);assert.equal(receipt.totals.net,'200.01');assert.equal(receipt.lineTotals.net,'200.02');assert.deepEqual(emission.result.totalReconciliations,s.result.totalReconciliations);
});

test('family source identity, approval and complete population are inherited from the existing capture boundary',()=>{
 for(const mutate of [s=>s.familyPayrollFacts.records.pop(),s=>s.familyPayrollFacts.records[0].identityToken='b'.repeat(64),s=>s.familyPayrollFacts.records[0].approvalId=null,s=>s.familyPayrollFacts.records[0].definition.tariffSelection.region='2']){const s=familyTariffSources({count:3});mutate(s);assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(s));}
 const s=familyTariffSources();Object.assign(s.familyPayrollFacts.records[0],{revision:0,definition:null,approvalId:null});sealFamilySources(s);assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(s));
});

test('different captured regions for two identities yield different source rows without cross-contract reuse',()=>{
 const sources=familyTariffSources({count:2,quantity:'0'});for(const r of sources.familyPayrollFacts.records)r.definition.quantities.childrenWithDisability='1';sources.familyPayrollFacts.records[1].definition.tariffSelection.region='2';sealFamilySources(sources);const s=prepareOwnPayrollFamilyTariffSnapshot(sources);
 for(const [i,e]of s.input.employees.entries()){const decisions=s.result.familyTariffDecisions.filter(d=>d.contractId===e.contractId);assert.equal(decisions.length,6);assert.equal(decisions.filter(d=>d.status==='resolved').length,1);assert.ok(decisions.filter(d=>d.status==='resolved').every(d=>d.selection.regionCode===String(i+1)));}
 const d=s.result.familyTariffDecisions.filter(d=>d.sourceCode==='82');assert.notEqual(d[0].selection.sourceSha256,d[1].selection.sourceSha256);
});

test('table completeness, row fingerprints and mapping pins participate in frozen source hashes',()=>{
 const s=familyTariffSources(),before=prepareOwnPayrollFamilyTariffSnapshot(s),p=s.programState.program.definition.familyTariffPolicies[0];p.rows[0].amount='123.00';assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(s),codeIs('FAMILY_TARIFF_ROWS_CHANGED'));
 const changed=structuredClone(before);changed.input.familyTariffCapture.policies[0].rows[0].amount='123.00';rehash(changed);assert.throws(()=>verifyOwnPayrollFamilyTariffSnapshot(changed),codeIs('FAMILY_TARIFF_ROWS_CHANGED'));
 assert.equal(before.input.familyTariffCapture.policySha256,hash(before.input.familyTariffCapture.policies));
});

test('only the six explicit executable mappings are supported, preserving all other seven unresolved references',()=>{
 for(const sourceCode of ['80','81','83','84','85','91','92']){const s=familyTariffSources();s.programState.program.definition.bindings.find(b=>b.sourceKind==='family_tariff').sourceCode=sourceCode;assert.throws(()=>ownProgramStructure(s.programState.program.definition),codeIs('FAMILY_TARIFF_BINDING_INVALID'));}
 const p=tariffPolicy();p.mappings[0].typeCode='13';assert.throws(()=>normalizeFamilyTariffPolicy(p),codeIs('FAMILY_TARIFF_MAPPING_UNPROVEN'));
 for(const field of ['typeCode','conceptCode','sourceCode','sourceSha256']){const p=tariffPolicy();delete p.mappings[0][field];assert.throws(()=>normalizeFamilyTariffPolicy(p));}
});

test('duplicate canonical bounds and malformed tables fail instead of choosing an arbitrary row',()=>{
 const duplicate=tariffPolicy();duplicate.rows.push({...duplicate.rows[0],upperBound:duplicate.rows[0].upperBound+'0'});assert.throws(()=>normalizeFamilyTariffPolicy(duplicate),codeIs('FAMILY_TARIFF_AMBIGUOUS'));
 for(const change of [p=>delete p.rows[0],p=>p.rows[0].amount=-1,p=>p.rows[0].amount='-1',p=>p.rows[0].sourceSha256='bad',p=>p.outsideRange='zero',p=>p.selection='last_row']){const p=tariffPolicy();change(p);assert.throws(()=>normalizeFamilyTariffPolicy(p));}
 let accessed=false;const p=tariffPolicy();Object.defineProperty(p.rows[0],'amount',{enumerable:true,get(){accessed=true;return'0';}});assert.throws(()=>normalizeFamilyTariffPolicy(p));assert.equal(accessed,false);
});

test('directly prefilled derived money, missing records and unknown quantity-phase consumers are rejected',()=>{
 const input=prepareOwnPayrollFamilyTariffApprovedInput(familyTariffSources());input.employees[0].inputs.find(i=>i.key===tariffKey('82')).value='1.00';assert.throws(()=>normalizeOwnPayrollOfficialInput(input),codeIs('FAMILY_TARIFF_EAGER_VALUE_FORBIDDEN'));
 const missing=prepareOwnPayrollFamilyTariffApprovedInput(familyTariffSources());missing.familyTariffCapture.records.pop();assert.throws(()=>normalizeOwnPayrollOfficialInput(missing));
 const badDate=prepareOwnPayrollFamilyTariffApprovedInput(familyTariffSources());badDate.familyTariffCapture.records[0].asOfDate='2026-10-99';assert.throws(()=>normalizeOwnPayrollOfficialInput(badDate),codeIs('FAMILY_TARIFF_CAPTURE_INVALID'));
 const s=familyTariffSources();s.programState.program.definition.quantityPhases.find(q=>q.code==='302').expression={op:'convert',value:fact(tariffKey('82'),'money'),unit:'units',factor:'1',conversionReference:'Deliberately unsupported tariff-to-quantity QA'};assert.throws(()=>ownProgramStructure(s.programState.program.definition),codeIs('FAMILY_TARIFF_QUANTITY_CONSUMER_UNSUPPORTED'));
});

test('explicit producer adapter preserves V2/V3/V4/V5 dispatch and old adapters never ignore it',()=>{
 const s=familyTariffSources();for(const old of [prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput])assert.throws(()=>old(s),codeIs('FAMILY_TARIFF_OPT_IN_REQUIRED'));
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(emissionSources()),codeIs('FAMILY_TARIFF_PROGRAM_REQUIRED'));
 for(const version of ['own-payroll-input.v2','own-payroll-input.v3']){const source=familyTariffSources(),p=source.programState.program.definition;delete p.officialTotalsVersion;delete p.officialTotalsPolicies;if(version==='own-payroll-input.v2'){delete p.quantityPhasesVersion;delete p.quantityPhases;}source.programState.program.definition=ownProgramDefinition(p,source.programState.salaryCatalog.items);const snap=prepareOwnPayrollFamilyTariffSnapshot(source);assert.equal(snap.input.version,version);assert.equal(snap.result.familyTariffDecisionCount,6);}
});

test('source preparer integrates real sourceKind into a presentable unapproved proposal draft',()=>{
 const raw=emissionPreparerEvidence(familyTariffSources()),r=prepareOwnPayrollProgrammeSource(raw);assert.deepEqual(r.incidents,[]);assert.ok(r.draft.programme);assert.equal(r.draft.programme.bindings.filter(b=>b.sourceKind==='family_tariff').length,6);assert.equal(r.presentable.programme,true);assert.equal(r.approved,false);assert.equal(r.executable,false);assert.equal(r.completeness.programmeContractComplete,true);ownProgramDefinition(r.draft.programme,raw.salary.catalog.items);
 assert.deepEqual(ownProgramCommand(command({program:r.draft.programme}),raw.salary.catalog.items).program,r.draft.programme);
});

test('a historical tariff table or producer version cannot be replaced, and scopes cannot be extended silently',()=>{
 const p=familyTariffSources().programState.program.definition;ownProgramHistory(p,structuredClone(p));
 for(const change of [x=>{delete x.familyTariffsVersion;delete x.familyTariffPolicies;},x=>x.familyTariffPolicies[0].rows[0].amount='999',x=>x.familyTariffPolicies[0].mappings[0].sourceSha256='b'.repeat(64)]){const next=structuredClone(p);change(next);assert.throws(()=>ownProgramHistory(p,next),codeIs('PROGRAM_HISTORY_REQUIRED'));}
 const next=structuredClone(p);next.rules.find(r=>r.code==='302').validUntil=null;assert.throws(()=>ownProgramStructure(next),codeIs('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));
});

test('saved selection evidence is immutable and replay detects altered or truncated decisions even after rehashing',()=>{
 const {sources,snapshot:s}=build();assert.deepEqual(verifyOwnPayrollFamilyTariffSnapshot(s),s);assert.ok(Object.isFrozen(s.input.familyTariffCapture.policies[0].rows[0]));assert.ok(Object.isFrozen(s.result.familyTariffDecisions[0].selection));assert.throws(()=>{s.result.familyTariffDecisions[0].value='0';},TypeError);
 for(const mutate of [x=>x.result.familyTariffDecisions.pop(),x=>x.result.familyTariffDecisions[0].selection.sourceSha256='b'.repeat(64),x=>x.result.familyTariffDecisions[0].value='0.00000000',x=>x.result.familyTariffDecisions[0].status='not_requested',x=>x.result.familyTariffDecisions[0].familyApprovalId=sources.familyPayrollFacts.records[0].approvalId.replace(/.$/,'9')]){const changed=structuredClone(s);mutate(changed);rehash(changed);assert.throws(()=>verifyOwnPayrollFamilyTariffSnapshot(changed),codeIs('FAMILY_TARIFF_SNAPSHOT_CHANGED'));}
 sources.familyPayrollFacts.records[0].definition.tariffSelection.semesterAverage='1.00';sealFamilySources(sources);assert.equal(s.input.familyTariffCapture.records[0].priorSemesterAverage,'0.00');assert.notEqual(prepareOwnPayrollFamilyTariffSnapshot(sources).inputSha256,s.inputSha256);
});

test('complete37-person capture and selected subset retain exactly all required decisions with no pagination',()=>{
 const sources=familyTariffSources({count:37,days:'14',region:null,average:null}),s=prepareOwnPayrollFamilyTariffSnapshot(sources);assert.equal(s.input.familyTariffCapture.records.length,37);assert.equal(s.result.employeeCount,37);assert.equal(s.result.rowCount,592);assert.equal(s.result.familyTariffDecisionCount,222);assert.ok(s.result.familyTariffDecisions.every(d=>d.status==='not_requested'));
 const last=s.input.employees.at(-1);assert.equal(s.result.familyTariffDecisions.filter(d=>d.contractId===last.contractId).length,6);sources.selection={kind:'contracts',values:[last.contractId]};const one=prepareOwnPayrollFamilyTariffSnapshot(sources);assert.equal(one.input.familyTariffCapture.records.length,37);assert.equal(one.result.familyTariffDecisionCount,6);assert.ok(one.result.familyTariffDecisions.every(d=>d.contractId===last.contractId));
});
