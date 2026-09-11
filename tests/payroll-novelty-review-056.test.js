import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { NOVELTY_CSV_HEADER, NoveltyReviewError, noveltyCsvRecords, reviewNoveltyCsv, noveltyReviewPage, noveltyIssuesCsv } from '../assets/payroll-novelty-review.js';
const source = fs.readFileSync('assets/payroll-novelty-workbench.js', 'utf8');
// Exercise the unchanged exact-decimal parser used by the actual workbench.
const parseRow = vm.runInNewContext(source.slice(source.indexOf('function exactMonth('), source.indexOf('function currentEntryValues(')) + '\nrowFromValues;', { TextEncoder });
const header = NOVELTY_CSV_HEADER.join(';');
const values = (overrides = {}) => Object.values({ legajo:'1001', concepto:'44', centro:'', ajuste:'', unidades:'1', importe:'', movimiento:'', legal:'', observacion:'Solicitud sintética QA', forzado:'NO', ...overrides });
const cell = value => '"' + String(value).replaceAll('"', '""') + '"';
const csv = rows => header + '\r\n' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
const review = rows => reviewNoveltyCsv(csv(rows), parseRow, '2026-09-01');
function invalid(text) { try { reviewNoveltyCsv(text, parseRow, '2026-09-01'); assert.fail('Should reject'); } catch (e) { assert.ok(e instanceof NoveltyReviewError); return e; } }

test('UTF-8 BOM, CRLF, empty optional amount and explicit zero remain distinct', () => {
  const rows = reviewNoveltyCsv('\ufeff' + csv([values(), values({ legajo:'1002', importe:'0' })]), parseRow, '2026-09-01');
  assert.equal(rows[0].amountCents, null); assert.equal(rows[1].amountCents, '0');
});
test('quoted semicolons, quotes and newlines retain exact source text and line number', () => {
  const text = csv([values({ legal:'Acta; 2 "QA"', observacion:'Primera\nsegunda línea' }), values({legajo:'x'})]);
  const records = noveltyCsvRecords(text);
  assert.equal(records[0].cells[7], 'Acta; 2 "QA"'); assert.equal(records[0].cells[8], 'Primera\nsegunda línea');
  const error = invalid(text); assert.equal(error.issues[0].rowOrdinal, 2); assert.equal(error.issues[0].line, 4);
});
test('all invalid rows and duplicate business keys are reported, never accepted partially', () => {
  const error = invalid(csv([values({legajo:'x'}), values(), values(), values({legajo:'2000', importe:'1.234,50'})]));
  assert.equal(error.rowCount, 4); assert.deepEqual(error.issues.map(i => i.rowOrdinal), [1,3,4]);
  assert.equal(error.issues[1].code, 'duplicate'); assert.match(error.issues[1].message, /fila 2/);
});
test('duplicate key ignores amounts but includes adjustment, centre and movement', () => {
  assert.equal(invalid(csv([values(), values({ importe:'50' })])).issues.length, 1);
  assert.equal(review([values(), values({ centro:'2' }), values({ ajuste:'2026-08' }), values({ movimiento:'retro' })]).length, 4);
});
test('500 rows accepted completely; 501 rejected before any draft', () => {
  const list = Array.from({length:500}, (_,i)=>values({legajo:String(1000+i)}));
  assert.equal(review(list).length, 500);
  assert.match(invalid(csv([...list, values({legajo:'9999'})])).issues[0].message, /500/);
});
for (const [label, text] of [
  ['empty', ''], ['header only',header+'\n'], ['wrong header', 'legajo;importe\n1;2'],
  ['unclosed quote',header+'\n"123;44'], ['quote in bare text',header+'\n12"3;44;;;;;;;;'],
  ['suffix after closing quote',header+'\n"123"x;44;;;;;;;;'],
  ['blank internal row',csv([values()])+ '\n' + values({legajo:'1002'}).join(';')],
  ['too many columns',header+'\n'+values().join(';')+';extra'],
  ['too few columns',header+'\n1001;44'], ['over byte budget',header+'\n'+ 'a'.repeat(480*1024)],
]) test(`fail closed: ${label}`,()=>assert.ok(invalid(text).issues.length));
for (const [label, overrides] of [
  ['negative zero',{importe:'-0'}], ['too many cents',{importe:'1.005'}],
  ['thousands',{importe:'1.000,00'}], ['scientific notation',{importe:'1e3'}],
  ['no amount or quantity',{unidades:''}], ['future adjustment',{ajuste:'2026-10'}],
  ['invalid forced',{forzado:'maybe'}], ['forced with no amount',{forzado:'SI'}],
  ['forced with no justification',{forzado:'SI',importe:'100',observacion:''}],
  ['invalid concept',{concepto:'=1+1'}], ['negative id',{legajo:'-1'}], ['control characters',{observacion:'bad\x00'}],
]) test(`source values not silently repaired: ${label}`,()=>assert.ok(invalid(csv([values(overrides)])).issues.length));
test('exact large cents are not rounded through Number; a justified forced zero is preserved', () => {
  const r=review([values({importe:'9007199254740993,01'}),values({legajo:'1002',importe:'0',forzado:'SI'})]);
  assert.equal(r[0].amountCents,'900719925474099301'); assert.equal(r[1].amountCents,'0'); assert.equal(r[1].forced,true);
});
test('paging traverses every row exactly once and leaves original row ordinals intact', () => {
  const rows=review(Array.from({length:500},(_,i)=>values({legajo:String(1000+i)}))), before=JSON.stringify(rows);
  const ordinals=[];for(let page=1;page<=20;page++)ordinals.push(...noveltyReviewPage(rows,{page}).rows.map(r=>r.rowOrdinal));
  assert.deepEqual(ordinals,Array.from({length:500},(_,i)=>i+1));assert.equal(JSON.stringify(rows),before);
});
test('filters preserve full batch scope, distinguish null/zero, and search accents',()=>{
  const rows=review([values(), values({legajo:'1002',importe:'0',observacion:'ÁREA CULTURA'}),values({legajo:'1003',importe:'125',forzado:'SI'})]);
  const m=noveltyReviewPage(rows,{kind:'missing'}); assert.equal(m.filtered,1);assert.equal(m.total,3);assert.equal(m.manual,2);
  assert.equal(noveltyReviewPage(rows,{kind:'manual'}).filtered,2);assert.equal(noveltyReviewPage(rows,{kind:'forced'}).rows[0].rowOrdinal,3);
  assert.equal(noveltyReviewPage(rows,{search:'area cultura'}).rows[0].rowOrdinal,2);
  const empty=noveltyReviewPage(rows,{search:'no matches',page:50});assert.equal(empty.rows.length,0);assert.equal(empty.total,3);assert.equal(empty.first,0);assert.equal(empty.page,1);
});
for(const filter of [{kind:'unknown'},{page:0},{pageSize:500},{search:'x'.repeat(101)}])test('invalid review filter '+JSON.stringify(filter),()=>assert.throws(()=>noveltyReviewPage(review([values()]),filter)));
test('error CSV quotes multiline text and neutralizes formula prefixes',()=>{
  const out=noveltyIssuesCsv([{rowOrdinal:1,line:2,code:'row',message:'=1+1\n"bad"'}]);
  assert.ok(out.startsWith('\ufeff'));assert.match(out, /"'=1\+1\n""bad"""/);assert.doesNotMatch(out,/1001/);
});
test('review modules contain no networking, browser persistence or HTML string injection',()=>{
  for(const file of ['assets/payroll-novelty-review.js','assets/payroll-novelty-review-panel.js']){
    const code=fs.readFileSync(file,'utf8');assert.doesNotMatch(code,/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|innerHTML|insertAdjacentHTML|console\./);
  }
});
test('file loading invalidates old review first, requires exact UTF-8 and cancels stale reads',()=>{
  const file=source.slice(source.indexOf('function handleFile('),source.indexOf('async function logout('));
  assert.ok(file.indexOf('invalidatePreparedDraft(event)')<file.indexOf('if (file.size'));
  assert.match(file,/fatal: true/);assert.match(file,/version !== fileReadVersion/);assert.match(source,/reader\.abort\(\)/);
  assert.match(source,/event\?\.target\?\.closest\?\.\('\[data-review-only\]'\)/);
  assert.doesNotMatch(source,/draft\.rows\.slice\(0, 25\)/);
});
test('new private assets are in build, excluded from service-worker caching',()=>{
  const build=fs.readFileSync('scripts/build-friendly.mjs','utf8'),sw=fs.readFileSync('sw.js','utf8');
  for(const name of ['payroll-novelty-review.js','payroll-novelty-review-panel.js','payroll-novelty-review.css']){
    assert.ok(build.includes("'assets/"+name+"'"));assert.ok(sw.includes("'/assets/"+name+"'"));
  }
});
