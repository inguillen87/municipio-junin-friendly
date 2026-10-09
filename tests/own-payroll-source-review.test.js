import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capture} from './fixtures/own-payroll-run-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {batch} from './fixtures/own-payroll-novelties-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash,ownRunAlgorithmHash} from '../lib/internal-own-payroll-run.js';
import {ownNoveltyHash} from '../lib/internal-own-payroll-novelties.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {fixedApprovedRecord} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {ownRunSourceReview,ownSourceReviewRows,ownSourceReviewCsv} from '../assets/own-payroll-source-review.js';
const rehash=c=>{c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);return c;};
function native(count=29){const c=capture();c.payload.population=approvedSources(count).population;c.payload.monthly={complete:true,batches:[],nativeBatches:[batch(count)]};return rehash(c);}
const editNative=(c,edit)=>{edit(c.payload.monthly.nativeBatches[0]);const b=c.payload.monthly.nativeBatches[0];b.rowsSha256=ownNoveltyHash(b.rows.map(({values,subject})=>({values,subject})));return rehash(c);};
test('revisión completa y no mutable: 29 novedades, dos páginas y CSV sin datos personales',async()=>{
 const c=editNative(native(),b=>b.rows.forEach(r=>r.values.conceptSourceId='999999999')),before=structuredClone(c),review=await ownRunSourceReview(c);
 assert.equal(review.total,29);assert.equal(review.affected,29);assert.equal(ownSourceReviewRows(review).rows.length,25);assert.equal(ownSourceReviewRows(review,'',2).rows.length,4);
 assert.equal(ownSourceReviewRows(review,'1001').filtered,1);assert.equal(ownSourceReviewRows(review,'1001').total,29);
 const csv=await ownSourceReviewCsv(c);assert.equal(csv.trim().split('\r\n').length,30);assert.ok(csv.includes('"29";"999999999"'));
 for(const value of [c.id,c.key,c.algorithmSha256,'1001','Persona sintética','2000','contractId','employeeNumber','amountCents','identityToken'])assert.ok(!csv.includes(value),value);
 assert.deepEqual(c,before);assert.ok(Object.isFrozen(review.rows[0].issues));assert.deepEqual(Object.keys(review.rows[0]),['employeeNumber','agreementCode','conceptCode','origin','group','rowOrdinal','issues']);
});
test('cero incidencias no inventa errores ni certifica un cálculo',async()=>{
 const c=capture(),review=await ownRunSourceReview(c);assert.equal(review.total,1);assert.equal(review.affected,0);assert.equal(ownSourceReviewRows(review).rows.length,0);assert.equal((await ownSourceReviewCsv(c)).trim().split('\r\n').length,1);assert.equal(c.saved,null);
});
test('importe ausente, cero informado y unidad no utilizada permanecen distintos',async()=>{
 const c=native(1);editNative(c,b=>{b.rows[0].values.quantityDecimal='0';b.rows[0].values.amountCents=null;});assert.deepEqual((await ownRunSourceReview(c)).rows[0].issues,['amount_missing']);
 editNative(c,b=>{b.rows[0].values.amountCents='0';});assert.deepEqual((await ownRunSourceReview(c)).rows[0].issues,[]);
});
test('unidades requeridas ausentes se identifican sin convertir horas ni porcentajes',async()=>{
 const c=native(1),p=c.payload.programState;
 const binding=p.program.definition.bindings.find(b=>b.key==='addition');binding.sourceKind='monthly_quantity';binding.unit='money';
 p.salaryCatalog.items.find(i=>i.code==='120').unit='money';editNative(c,b=>{b.rows[0].values.amountCents='0';b.rows[0].values.quantityDecimal=null;});
 assert.deepEqual((await ownRunSourceReview(c)).rows[0].issues,['quantity_missing']);
});
test('fuente única repetida observa todas las filas, sin descartar un lote',async()=>{
 const c=capture(),b=structuredClone(c.payload.monthly.batches[0]);b.id=uid(201);c.payload.monthly.batches.push(b);c.payload.programState.program.definition.bindings.find(b=>b.key==='addition').combine='single';rehash(c);
 const review=await ownRunSourceReview(c);assert.equal(review.affected,2);assert.deepEqual(review.rows.map(r=>r.issues),[['ambiguous'],['ambiguous']]);assert.deepEqual(review.rows.map(r=>r.group),[1,2]);
 assert.throws(()=>prepareOwnPayrollInput(c.payload),e=>e.code==='SOURCE_AMBIGUOUS');
});
test('ajuste anterior y fuente sin regla se conservan como incidencias independientes',async()=>{
 const c=capture();Object.assign(c.payload.monthly.batches[0].rows[0],{conceptSourceId:'999999999',adjustmentMonth:'2026-09-01'});rehash(c);
 assert.deepEqual((await ownRunSourceReview(c)).rows[0].issues,['unused','retroactive']);assert.equal((await ownSourceReviewCsv(c)).trim().split('\r\n').length,3);
});
test('modo forzado se identifica sin aplicar el importe como sustitución',async()=>{
 const c=capture();Object.assign(c.payload.monthly.batches[0].rows[0],{forced:true,observation:'Justificación sintética para QA'});rehash(c);assert.deepEqual((await ownRunSourceReview(c)).rows[0].issues,['forced']);assert.ok(!(await ownSourceReviewCsv(c)).includes('Justificación'));
});
test('novedad fija parcial conserva su fuente y requiere prorrateo expreso, sin inventar fila de archivo',async()=>{
 const c=capture(),r=fixedApprovedRecord(1,{conceptSourceId:'120',quantityDecimal:null,amountCents:'225',validFrom:'2026-10-15',validTo:null});r.subject=structuredClone(c.payload.monthly.batches[0].rows[0].subject);
 c.payload.monthly.batches=[];c.payload.fixed.list.data.rows=[r];c.payload.fixed.list.data.total=1;c.payload.fixed.export.data.rows=[{recordId:r.id,version:r.version,proposalId:r.approved.id,subject:r.subject,values:r.approved.values}];c.payload.fixed.export.data.total=1;
 c.payload.programState.program.definition.bindings.find(b=>b.key==='addition').sourceKind='fixed_amount';rehash(c);
 const review=await ownRunSourceReview(c);assert.equal(review.total,1);assert.deepEqual(review.rows[0].issues,['partial']);assert.equal(review.rows[0].rowOrdinal,null);assert.ok((await ownSourceReviewCsv(c)).includes('Sin fila de archivo'));assert.throws(()=>prepareOwnPayrollInput(c.payload),e=>e.code==='PRORATION_REQUIRED');
});
test('vigencia de regla y tipo determinan referencia; convenio diferente no hereda entradas',async()=>{
 for(const change of [c=>{c.payload.programState.program.definition.rules.forEach(r=>r.liquidationTypes=['sac']);},c=>{c.payload.population.employees[0].agreementCode='2';}]){const c=capture();change(c);rehash(c);assert.deepEqual((await ownRunSourceReview(c)).rows[0].issues,['unused']);}
});
test('una captura parcial revisa sólo su alcance, preservando todo el lote original',async()=>{
 const c=native();c.body.selection={kind:'contracts',values:[uid(1)]};c.payload.selection=structuredClone(c.body.selection);c.payload.population.employees=c.payload.population.employees.slice(0,1);editNative(c,b=>{b.rows[1].identityCurrent=false;b.rows[1].values.conceptSourceId='999999999';});
 const review=await ownRunSourceReview(c);assert.equal(review.total,1);assert.equal(review.affected,0);assert.equal(c.payload.monthly.nativeBatches[0].rows.length,29);
});
test('captura alterada, incompleta, duplicada o sin aprobación no ofrece reporte parcial',async()=>{
 for(const change of [c=>{c.payload.monthly.complete=false;rehash(c);},c=>{c.payload.population.employees.push(structuredClone(c.payload.population.employees[0]));rehash(c);},c=>{c.payload.programState.program.salaryVersion='f'.repeat(64);rehash(c);},c=>{c.payload.monthly.batches[0].rows[0].amountCents='9999';},c=>{c.payload.population.employees[0].identityToken='f'.repeat(64);rehash(c);},c=>{c.payload.monthly.batches.push(structuredClone(c.payload.monthly.batches[0]));rehash(c);},c=>{c.body.selection={kind:'contracts',values:[uid(1),uid(2),uid(3)]};c.payload.selection=structuredClone(c.body.selection);rehash(c);}]){const c=capture();change(c);await assert.rejects(ownRunSourceReview(c));await assert.rejects(ownSourceReviewCsv(c));}
});
test('CSV cerrado y seguro: no incluye legajo con sintaxis de fórmula, texto libre o bytes nominales',async()=>{
 const c=capture();const e=c.payload.population.employees[0],r=c.payload.monthly.batches[0].rows[0];e.employeeNumber='A/3501';r.legajo=e.employeeNumber;r.subject.legajo=e.employeeNumber;r.conceptSourceId='999999999';r.observation='=HYPERLINK("https://example.invalid")';rehash(c);
 const csv=await ownSourceReviewCsv(c);assert.ok(!csv.includes('A/3501'));assert.ok(!csv.includes('HYPERLINK'));assert.ok(!csv.includes('https://'));assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.endsWith('\r\n'));assert.ok(csv.split('\r\n').filter(Boolean).every(line=>line.split(';').length===6));
});
test('el reporte no cambia versión de motor ni contratos de envío persistentes',()=>{
 assert.match(ownRunAlgorithmHash(),/^[a-f0-9]{64}$/);const source=fs.readFileSync(new URL('../lib/internal-own-payroll-run.js',import.meta.url),'utf8');assert.ok(!source.includes('own-payroll-source-review'));
 const build=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');assert.ok(build.includes("'assets/own-payroll-source-review.js'"));
});
