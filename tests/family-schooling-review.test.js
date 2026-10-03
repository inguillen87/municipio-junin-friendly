import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {readSheet} from 'read-excel-file/node';
import {schoolingData,currentCivilDay} from '../assets/family-schooling-model.js';
import {schoolingReview,schoolingReviewCriteria,schoolingReviewEnd,schoolingReviewSelection} from '../assets/family-schooling-review-model.js';
import {schoolingReviewXlsx} from '../assets/family-schooling-review-export.js';
import {schoolingFixtureV4} from './fixtures/family-schooling-synthetic.js';
import {nativeSchoolingFixture,nativeFamilyRow,syntheticAdministrativeCertificate,nativeFamilyIds} from './fixtures/native-family-schooling-synthetic.js';
const criteria={asOf:'2026-10-03',through:'2026-11-02',schoolYear:2026};
function legacy(count=75){const p=schoolingFixtureV4(count);p.data.version='family-schooling.v5';for(const r of p.data.rows)Object.assign(r,{employeeOrigin:'GRH',nativeRegistrationId:null,nativeRegisteredAt:null});return p;}
const read=p=>schoolingData(p,{version:5});
function native(certificate=syntheticAdministrativeCertificate()){const p=nativeSchoolingFixture({mixed:false,children:false});p.data.rows=[nativeFamilyRow({certificate})];return p;}
function refresh(p){for(const r of p.data.rows){const c=r.certificate??r.sourceSchooling;r.effectiveDates={origin:r.certificate?'manual':r.sourceSchooling?'grh_source':'none',presentedOn:c?.presentedOn??null,expiresOn:c?.expiresOn??null};}p.data.scope.unresolvedFamilyRows=p.data.rows.filter(r=>r.identityReviewRequired).length;return p;}
const codes=review=>review.rows[0].observations.map(o=>o.code);
const workbook=(review,selection=schoolingReviewSelection(review))=>Object.fromEntries(Object.entries(unzipSync(schoolingReviewXlsx(review,selection,'2026-10-03T12:00:00.123456Z'))).map(([name,bytes])=>[name,strFromU8(bytes)]));

test('complete review and workbook span several pages, with an independent full-review filter',()=>{
 const review=schoolingReview(read(legacy(75)),criteria),selected=schoolingReviewSelection(review);assert.equal(selected.rows.length,75);assert.equal(selected.counts.contracts,38);
 assert.equal(schoolingReviewSelection(review,{search:'0075'}).rows.length,1);
 const book=workbook(review);assert.equal((book['xl/worksheets/sheet1.xml'].match(/<row /g)||[]).length,76);assert.match(book['xl/worksheets/sheet2.xml'],/independiente de la búsqueda/);
});
test('calendar window includes both ends, keeps civil dates exact and handles leap months',()=>{
 assert.equal(schoolingReviewEnd('2028-02-01'),'2028-03-02');assert.equal(currentCivilDay(new Date('2026-10-03T01:00:00Z')),'2026-10-02');
 for(const expiry of ['2026-10-03','2026-11-02']){const c=syntheticAdministrativeCertificate();c.expiresOn=expiry;assert.ok(codes(schoolingReview(read(refresh(native(c))),criteria)).includes('upcoming'));}
 const c=syntheticAdministrativeCertificate();c.expiresOn='2026-10-02';const review=schoolingReview(read(refresh(native(c))),criteria);assert.ok(codes(review).includes('expired'));assert.equal(schoolingReviewSelection(review,{status:'upcoming'}).rows.length,0);
});
test('paper record without expiry can have no observations and never gains an invented deadline',()=>{
 const review=schoolingReview(read(native()),criteria);assert.deepEqual(codes(review),['no_expiry','no_observations']);assert.equal(schoolingReviewSelection(review).counts.needsReview,0);
 assert.equal(review.rows[0].dates.expiresOn,null);assert.equal(schoolingReviewSelection(review,{status:'expired'}).rows.length,0);assert.match(workbook(review)['xl/worksheets/sheet1.xml'],/Presentación en papel declarada/);
});
test('missing record and historical dates remain distinct and never mean not presented',()=>{
 const own=schoolingReview(read(native(null)),criteria);assert.deepEqual(codes(own),['no_record']);assert.match(own.rows[0].observations[0].action,/No significa que no se presentó/);
 const historical=schoolingReview(read(legacy(1)),criteria);assert.ok(codes(historical).includes('source_review'));assert.equal(schoolingReviewSelection(historical,{status:'no_record'}).rows.length,1);assert.match(workbook(historical)['xl/worksheets/sheet1.xml'],/GRH histórico/);
});
test('manual absent expiry wins over an expired historical value',()=>{
 const p=legacy(2);p.data.rows=p.data.rows.slice(1);p.data.rows[0].certificate=syntheticAdministrativeCertificate({pdf:true});p.data.rows[0].sourceSchooling.expiresOn='2025-12-31';
 const review=schoolingReview(read(refresh(p)),criteria);assert.equal(review.rows[0].dates.expiresOn,null);assert.ok(!codes(review).includes('expired'));assert.equal(schoolingReviewSelection(review).counts.needsReview,0);
});
test('unknown, other and matching cycle are distinct without inferring year from dates',()=>{
 for(const [year,expected]of [[null,'cycle_unknown'],[2025,'cycle_other'],[2026,'no_observations']]){const c=syntheticAdministrativeCertificate();c.schoolYear=year;const review=schoolingReview(read(native(c)),criteria);assert.ok(codes(review).includes(expected));assert.equal(schoolingReviewSelection(review,{status:'cycle'}).rows.length,year===2026?0:1);}
});
test('several observations on one child do not become several employees or children',()=>{
 const c=syntheticAdministrativeCertificate();c.expiresOn='2026-10-01';c.schoolYear=2025;c.presentedOn='2026-10-04';const p=refresh(native(c));p.data.rows[0].identityReviewRequired=true;refresh(p);
 const view=schoolingReviewSelection(schoolingReview(read(p),criteria));assert.equal(view.counts.records,1);assert.equal(view.counts.contracts,1);assert.equal(view.counts.children,0);assert.equal(view.counts.identityReview,1);assert.equal(view.counts.observations,4);
});
test('two own contracts sharing a legajo retain separate identities',()=>{
 const p=nativeSchoolingFixture({mixed:false});const view=schoolingReviewSelection(schoolingReview(read(p),criteria));assert.equal(view.counts.records,2);assert.equal(view.counts.contracts,2);assert.equal(new Set(view.rows.map(i=>i.key)).size,2);
});
test('workbook keeps content as strings and omits internal identities, document hashes and notes',()=>{
 const c=syntheticAdministrativeCertificate();c.institution='=HYPERLINK("https://qa.invalid")';c.reason='PRIVATE_REASON_SYNTHETIC';c.paperReference='PRIVATE_REFERENCE_SYNTHETIC';const review=schoolingReview(read(native(c)),criteria),book=workbook(review),xml=book['xl/worksheets/sheet1.xml'];
 assert.match(xml,/=HYPERLINK/);assert.doesNotMatch(xml,/<f(?:\s|>)/);assert.doesNotMatch(JSON.stringify(book),/PRIVATE_REASON_SYNTHETIC|PRIVATE_REFERENCE_SYNTHETIC|qa@example.invalid/);
 for(const id of Object.values(nativeFamilyIds))assert.ok(!JSON.stringify(book).includes(id));
});
test('changed review, rows, counts or observations cannot be exported as the verified plan',()=>{
 const review=schoolingReview(read(native()),criteria),view=schoolingReviewSelection(review);
 for(const change of [v=>v.rows=[],v=>v.counts.records=999,v=>v.rows[0].observations[0].action='Forged instruction',v=>v.filters.status='expired']){const altered=structuredClone(view);change(altered);assert.throws(()=>schoolingReviewXlsx(review,altered,'2026-10-03T12:00:00Z'));}
 const altered=structuredClone(review);altered.criteria.schoolYear=2025;assert.throws(()=>workbook(altered,view));
});
test('limit is global, never silent truncation, and an empty report is not an error',()=>{
 const review=schoolingReview(read(legacy(5000)),criteria);assert.equal(schoolingReviewSelection(review).rows.length,5000);
 assert.throws(()=>schoolingReview(read(legacy(5001)),criteria));const empty=schoolingReview(read(nativeSchoolingFixture({mixed:false,children:false})),criteria);assert.equal(schoolingReviewSelection(empty).counts.observations,0);assert.equal(schoolingReviewSelection(empty).rows.length,0);
});
test('explicit longer calendar window does not trim rows or impose a municipal deadline',()=>assert.equal(schoolingReviewCriteria({...criteria,through:'2028-01-01'}).through,'2028-01-01'));
test('Excel reader opens both complete sheets with text values and no internal identifiers',async()=>{
 const review=schoolingReview(read(legacy(75)),criteria),bytes=Buffer.from(schoolingReviewXlsx(review,schoolingReviewSelection(review),'2026-10-03T12:00:00Z'));
 const detail=await readSheet(bytes,'Revisión escolar'),control=await readSheet(bytes,'Criterios y control');assert.equal(detail.length,76);assert.equal(detail[1].length,15);assert.equal(control.find(r=>r[0]==='Registros del filtro completo')[1],'75');
});
for(const settings of [{...criteria,asOf:'2026-02-30'},{...criteria,through:'2026-10-02'},{...criteria,through:'2101-01-01'},{...criteria,schoolYear:0},{...criteria,schoolYear:'2026'}])test('invalid dates/window/year fail explicitly '+JSON.stringify(settings),()=>assert.throws(()=>schoolingReviewCriteria(settings)));
test('review refuses drift, ambiguous completeness and a single-contract cohort',()=>{
 const p=native();p.data.scope.payrollEligibilityCertified=true;assert.throws(()=>schoolingReview(read(p),criteria));
 const data=read(native());assert.throws(()=>schoolingReview({...data,version:'family-schooling.v4'},criteria));assert.throws(()=>schoolingReview({...data,scope:{...data.scope,cohort:'contract_children'}},criteria));
 assert.throws(()=>schoolingReviewSelection(schoolingReview(data,criteria),{status:'anything'}));
});
