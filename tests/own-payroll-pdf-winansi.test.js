// Pure encoding/drawing tests. Every receipt and identifier is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ownPdfText} from '../assets/own-payroll-pdf-kit.js';
import {ownReceiptPages,createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
import {ownReceiptSnapshot} from '../assets/own-payroll-receipt-model.js';
import {OWN_RECEIPT_PRINT_FACTS_VERSION} from '../assets/own-payroll-receipt-print-facts.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {receiptBatch} from './fixtures/own-payroll-receipt-synthetic.js';

// The 27 defined 0x80–0x9F positions from the primary Unicode CP1252 table:
// https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP1252.TXT
const CP1252_EXTENSION=[
  [0x80,0x20ac],[0x82,0x201a],[0x83,0x0192],[0x84,0x201e],[0x85,0x2026],[0x86,0x2020],[0x87,0x2021],
  [0x88,0x02c6],[0x89,0x2030],[0x8a,0x0160],[0x8b,0x2039],[0x8c,0x0152],[0x8e,0x017d],
  [0x91,0x2018],[0x92,0x2019],[0x93,0x201c],[0x94,0x201d],[0x95,0x2022],[0x96,0x2013],[0x97,0x2014],
  [0x98,0x02dc],[0x99,0x2122],[0x9a,0x0161],[0x9b,0x203a],[0x9c,0x0153],[0x9e,0x017e],[0x9f,0x0178],
];
const UNSUPPORTED='Synthetic unsupported character';
const RECEIPT_UNSUPPORTED='El PDF no admite un carácter de la identidad o etiqueta original. No se reemplazó ni omitió el recibo.';
const codec=ownPdfText(UNSUPPORTED),byteHex=byte=>byte.toString(16).padStart(2,'0');
const unsupported=error=>error.code==='OWN_PDF_UNSUPPORTED_CHARACTER'&&error.message===UNSUPPORTED;
const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const corpus=JSON.parse(readFileSync(new URL('./fixtures/own-payroll-consumer-corpus.json',import.meta.url),'utf8')).cases;
const pdfTexts=bytes=>[...Buffer.from(bytes).toString().matchAll(/<([a-f0-9]+)> Tj/gi)]
  .map(match=>new TextDecoder('windows-1252').decode(Buffer.from(match[1],'hex')));

function mixedV6Batch(jobTitle='Técnico… de redes') {
  // A genuine legacy fixture first, then a corpus official record carrying V6 print facts.
  // This preserves the two records' existing economic evidence and uses no municipal inputs.
  const batch=receiptBatch(2),snapshot=batch.snapshot,one=structuredClone(corpus.find(item=>item.name==='eligible_positive'));
  snapshot.records=[snapshot.records[1]];snapshot.sources[0].selectedCount=1;
  const record=one.receiptRecord,quantities=new Map(record.quantities.map(quantity=>[quantity.conceptCode,quantity]));
  record.printFacts={version:OWN_RECEIPT_PRINT_FACTS_VERSION,frozenAt:'2026-11-11T15:00:00Z',
    units:record.concepts.map(concept=>({rowKey:record.contractId+':concept:'+concept.code,quantity:structuredClone(quantities.get(concept.code)??null)})),
    employmentStartDate:null,classification:{categoryCode:null,categoryLabel:null,jobTitle,positionStructure:null},paymentDestination:null,
    sources:{runId:record.runId,payloadSha256:record.payloadSha256,inputSha256:record.inputSha256,resultSha256:record.resultSha256,
      employmentEvidenceSha256:'b'.repeat(64),bankConfigurationVersion:null,bankApprovalId:null}};
  snapshot.version='own-receipt-snapshot.v6';snapshot.identityBasis='owned_registration_verified_at_capture';
  snapshot.sources.push({id:record.sourceGroupId,snapshotSha256:hash(one.close),period:snapshot.params.period,type:'monthly',
    employeeCount:one.close.employeeCount,populationCount:one.close.populationCount,selectedCount:1});
  snapshot.records.push(record);snapshot.recordCount=2;
  snapshot.conceptCount=snapshot.records.reduce((sum,item)=>sum+item.concepts.length,0);
  snapshot.economicConceptCount=snapshot.records[0].concepts.length+record.economicConceptCount;
  snapshot.omittedRowCount=record.omittedRowCount;batch.snapshotSha256=hash(snapshot);
  return batch;
}

test('all 27 defined CP1252 extension glyphs encode to their exact WinAnsi byte',()=>{
  assert.equal(CP1252_EXTENSION.length,27);assert.equal(new Set(CP1252_EXTENSION.map(([byte])=>byte)).size,27);
  for (const [byte,point] of CP1252_EXTENSION) {
    const glyph=String.fromCodePoint(point);
    assert.equal(codec.hex(glyph),'<'+byteHex(byte)+'>','U+'+point.toString(16));
    assert.equal(new TextDecoder('windows-1252').decode(Uint8Array.of(byte)),glyph);
  }
  assert.equal(codec.hex(CP1252_EXTENSION.map(([,point])=>String.fromCodePoint(point)).join('')),
    '<'+CP1252_EXTENSION.map(([byte])=>byteHex(byte)).join('')+'>');
});

test('encoding, font widths and wrapping preserve every added glyph in regular and bold text',()=>{
  for (const [,point] of CP1252_EXTENSION) for (const bold of [false,true]) {
    const glyph=String.fromCodePoint(point),width=codec.width(glyph,1000,bold);
    assert.ok(Number.isFinite(width)&&width>0,'finite AFM width for U+'+point.toString(16));
    assert.equal(codec.width(glyph.repeat(5),1000,bold),width*5);
    const lines=codec.fit(glyph.repeat(5),width*2,1000,bold);
    assert.deepEqual(lines,[glyph.repeat(2),glyph.repeat(2),glyph]);
    assert.equal(lines.join(''),glyph.repeat(5));
    assert.ok(lines.every(line=>codec.width(line,1000,bold)<=width*2));
    assert.equal(lines.map(line=>codec.hex(line).slice(1,-1)).join(''),codec.hex(glyph.repeat(5)).slice(1,-1));
  }
  assert.equal(codec.hex('Técnico… de redes'),'<54e9636e69636f85206465207265646573>');
});

test('raw C0, DEL and C1 controls are rejected by encoding, width and fit before whitespace can hide them',()=>{
  for (const point of [...Array.from({length:32},(_,i)=>i),...Array.from({length:33},(_,i)=>0x7f+i)]) {
    const text='A'+String.fromCodePoint(point)+'B';
    assert.throws(()=>codec.hex(text),unsupported,'hex control '+point);
    assert.throws(()=>codec.width(text,10),unsupported,'width control '+point);
    assert.throws(()=>codec.fit(text,100,10),unsupported,'fit control '+point);
  }
});

test('unrepresentable glyphs are not transliterated, including a single-character word',()=>{
  for (const point of [0x2192,0x6f22,0x1f600,0xd800]) {
    const text='A'+String.fromCodePoint(point)+'B';
    assert.throws(()=>codec.hex(text),unsupported);assert.throws(()=>codec.width(text,10),unsupported);
    assert.throws(()=>codec.fit(text,100,10),unsupported);
    assert.throws(()=>codec.fit(String.fromCodePoint(point),100,10),unsupported);
  }
});

test('fit preserves the existing distribution and bytes of Unicode whitespace while direct encoding stays strict',()=>{
  const expected=codec.fit('Cargo Sintético',1000,9);
  assert.deepEqual(expected,['Cargo Sintético']);
  for(const point of [0x2003,0x2028,0xfeff]) {
    const text='Cargo'+String.fromCodePoint(point)+'Sintético';
    assert.throws(()=>codec.hex(text),unsupported);assert.throws(()=>codec.width(text,9),unsupported);
    const lines=codec.fit(text,1000,9);
    assert.deepEqual(lines,expected);
    assert.deepEqual(lines.map(codec.hex),expected.map(codec.hex));
    assert.equal(codec.hex(lines[0]),'<436172676f2053696e74e97469636f>');
  }
});

test('previous printable byte mappings and the U+2212 compatibility alias stay identical',()=>{
  const points=[...Array.from({length:95},(_,i)=>0x20+i),...Array.from({length:96},(_,i)=>0xa0+i)];
  assert.equal(codec.hex(points.map(point=>String.fromCodePoint(point)).join('')),'<'+points.map(byteHex).join('')+'>');
  for (const [point,byte] of [[0x20ac,128],[0x2013,150],[0x2014,151],[0x2018,145],[0x2019,146],[0x201c,147],[0x201d,148],[0x2022,149],[0x2212,45]])
    assert.equal(codec.hex(String.fromCodePoint(point)),'<'+byteHex(byte)+'>');
  assert.equal(codec.width('−',10),codec.width('-',10));assert.equal(codec.width('−',10,true),codec.width('-',10,true));
});

test('a conserved V6 job title with ellipsis prints as-is without changing records, quantities or amounts',async()=>{
  const batch=mixedV6Batch(),before=structuredClone(batch);
  assert.equal(ownReceiptSnapshot(batch.snapshot),batch.snapshot);
  const pdf=await createOwnReceiptPdf(batch);
  assert.equal(pdf.recordCount,2);assert.ok(pdfTexts(pdf.bytes).includes('Técnico… de redes'));
  assert.deepEqual(batch,before);
});

test('unsupported text anywhere in one receipt names that legajo exactly once',()=>{
  const mutations=[
    snapshot=>{snapshot.params.issuer.name='Emisor → sintético';},
    snapshot=>{snapshot.params.issuer.address='Dirección → sintética';},
    snapshot=>{snapshot.records[1].name='Persona → sintética';},
    snapshot=>{snapshot.records[1].printFacts.classification.jobTitle='Auxiliar → Obras';},
    snapshot=>{snapshot.records[1].concepts[0].label='Concepto → sintético';},
    snapshot=>{snapshot.params.legend='Leyenda → sintética';},
  ];
  for (const mutate of mutations) {
    const snapshot=mixedV6Batch().snapshot;mutate(snapshot);const record=snapshot.records[1];
    assert.throws(()=>ownReceiptPages(record,snapshot.params,snapshot.sources.find(source=>source.id===record.sourceGroupId)),
      error=>error.code==='OWN_PDF_UNSUPPORTED_CHARACTER'&&error.message==='Legajo '+record.employeeNumber+': '+RECEIPT_UNSUPPORTED);
  }
});

test('a valid V6 batch stops on the second record with its exact legajo and returns no partial PDF',async()=>{
  const batch=mixedV6Batch('Auxiliar → Obras'),snapshot=batch.snapshot,record=snapshot.records[1],before=structuredClone(batch);
  assert.notEqual(snapshot.records[0].employeeNumber,record.employeeNumber);
  assert.equal(ownReceiptSnapshot(snapshot),snapshot,'the job title contract remains Unicode and is not narrowed to WinAnsi');
  await assert.rejects(createOwnReceiptPdf(batch),error=>error.code==='OWN_PDF_UNSUPPORTED_CHARACTER'
    &&error.message==='Legajo '+record.employeeNumber+': '+RECEIPT_UNSUPPORTED);
  assert.deepEqual(batch,before);
});
