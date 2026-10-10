import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {reviewTransfersVarFile,transfersVarObservationsCsv,TRANSFERS_VAR_FIELDS,TRANSFERS_VAR_LAYOUT} from '../assets/payroll-transfers-var-review.js';
import {buildPayrollBankDiagnostic} from '../assets/payroll-bank-report-workbench.js';
import {syntheticVarRecord,syntheticVarFile} from './fixtures/transferencias-varias-synthetic.js';
const review=bytes=>reviewTransfersVarFile(bytes,{cryptoImpl:webcrypto});
const diagnostic=bytes=>buildPayrollBankDiagnostic({profileId:'transferencias-varias-167.observed.v1',scope:'unsegmented',bytes,reconciliation:null},{cryptoImpl:webcrypto});

test('contrasta los siete campos de 167 bytes, literal VAR y suma exacta sin devolver valores nominales',async()=>{
  const a=syntheticVarRecord({cents:'9999999999'}),b=syntheticVarRecord({cents:'1'});a[54]=0xd1;
  const bytes=syntheticVarFile([a,b]),before=bytes.slice(),r=await review(bytes);
  assert.equal(r.version,TRANSFERS_VAR_LAYOUT);assert.equal(r.matchesObservedFields,true);
  assert.equal(r.totalCents,'10000000000');assert.equal(r.period,'2026-08');assert.equal(r.recordCount,2);
  assert.deepEqual(r.observations,[]);assert.deepEqual(bytes,before);
  assert.equal(r.sha256,'sha256:'+createHash('sha256').update(bytes).digest('hex'));
  assert.equal(TRANSFERS_VAR_FIELDS.reduce((n,f)=>n+f.last-f.first+1,0),167);
  assert.doesNotMatch(JSON.stringify(r),/PERSONA|1234567890123456789012|20123456789|0000000042/);
  assert.equal(r.generationAllowed,false);assert.equal(r.officialSubmissionAllowed,false);assert.ok(Object.isFrozen(r));
});

test('detecta cada campo cambiado, incluido VAR, sin aceptar sólo el ancho',async()=>{
  for(const [offset,code] of [[0,'VAR_CBU'],[22,'VAR_AMOUNT'],[32,'VAR_CUIL'],[43,'VAR_CUIL'],[54,'VAR_NAME'],[94,'VAR_EMPLOYEE'],[104,'VAR_REFERENCE'],[164,'VAR_LITERAL']]){
    const bytes=syntheticVarRecord();bytes[offset]=code==='VAR_NAME'?32:65;
    const r=await review(syntheticVarFile([bytes]));assert.equal(r.matchesObservedFields,false);
    assert.ok(r.observations.some(o=>o.rowNumber===1&&o.code===code),code);
    assert.equal(r.totalCents,null);assert.equal(r.period,null);
  }
});

test('no transforma mezcla de períodos en filas omitidas ni en total parcial',async()=>{
  const r=await review(syntheticVarFile([syntheticVarRecord(),syntheticVarRecord({month:'9'})]));
  assert.deepEqual(r.observations.map(o=>[o.rowNumber,o.code]),[[null,'VAR_PERIOD_MIXED']]);
  assert.equal(r.recordCount,2);assert.equal(r.totalCents,null);
  assert.match(new TextDecoder().decode(transfersVarObservationsCsv(r).bytes),/Global/);
});

test('conserva ceros; no inventa elegibilidad de pago a partir de sintaxis',async()=>{
  const r=await review(syntheticVarFile([syntheticVarRecord({cents:'0'})]));
  assert.equal(r.totalCents,'0');assert.equal(r.matchesObservedFields,true);assert.equal(r.paymentExecuted,false);
});

test('rechaza mes inválido, año cero y referencia sin espacios de relleno',async()=>{
  for(const params of [{month:'0'},{month:'13'},{year:'0000'},{month:'08'}]){
    const r=await review(syntheticVarFile([syntheticVarRecord(params)]));
    assert.ok(r.observations.some(o=>o.code==='VAR_REFERENCE'));
  }
  const unpadded = syntheticVarRecord(); unpadded.fill(65,104,164);
  assert.ok((await review(syntheticVarFile([unpadded]))).observations.some(o=>o.code==='VAR_REFERENCE'));
});

test('contrasta el total leído con los dos totales declarados; no acepta dos declaraciones equivocadas iguales', async () => {
  const input = {profileId:'transferencias-varias-167.observed.v1', scope:'unsegmented',
    bytes:syntheticVarFile([syntheticVarRecord({cents:'12345'})]),
    reconciliation:{payrollRecordCount:'1',approvedPayrollNetCents:'10000',declaredBankNetCents:'10000'}};
  const r = await buildPayrollBankDiagnostic(input,{cryptoImpl:webcrypto});
  assert.equal(r.reconciliation.reconciled,true);
  assert.deepEqual(r.fieldReconciliation,{reconciled:false,fileMinusDeclaredCents:'2345',fileMinusApprovedPayrollCents:'2345'});
  input.reconciliation.approvedPayrollNetCents = input.reconciliation.declaredBankNetCents = '12345';
  assert.equal((await buildPayrollBankDiagnostic(input,{cryptoImpl:webcrypto})).fieldReconciliation.reconciled,true);
  input.bytes[164] = 66;
  assert.equal((await buildPayrollBankDiagnostic(input,{cryptoImpl:webcrypto})).fieldReconciliation,null);
});

test('conserva todas las incidencias más allá del límite anterior de 200 diagnósticos',async()=>{
  const rows=Array.from({length:231},()=>{const r=syntheticVarRecord();r[164]=66;return r;});
  const r=await review(syntheticVarFile(rows));assert.equal(r.recordCount,231);assert.equal(r.observations.length,231);
  assert.equal(r.observations.at(-1).rowNumber,231);
  const csv=new TextDecoder().decode(transfersVarObservationsCsv(r).bytes);
  assert.equal(csv.trim().split('\r\n').length,232);assert.match(csv,/"231";"Revisar"/);
  assert.doesNotMatch(csv,/PERSONA|20123456789|1234567890123456789012|0000000042|12345/);
});

test('incluye también todas las fallas físicas sin truncar; no valida campos corridos',async()=>{
  const rows=Array.from({length:231},()=>syntheticVarRecord().subarray(0,166));
  const r=await review(syntheticVarFile(rows));
  assert.equal(r.observations.length,231);assert.equal(r.observations.at(-1).rowNumber,231);
  assert.ok(r.observations.every(o=>o.code==='BANK_RECORD_WIDTH_MISMATCH'));
});

test('CRLF, BOM y Windows-1252 siguen obligatorios, sin normalización silenciosa',async()=>{
  const good=syntheticVarFile([syntheticVarRecord()]);
  for(const [bytes,code] of [[good.subarray(0,good.length-2),'BANK_FINAL_CRLF_REQUIRED'],[new Uint8Array([239,187,191,...good]),'BANK_BOM_FORBIDDEN'],[Uint8Array.from(good,(b,i)=>i===54?0x81:b),'BANK_ENCODING_CONSTRAINT_FAILED']]){
    const r=await review(bytes);assert.equal(r.matchesObservedFields,false);assert.equal(r.totalCents,null);assert.ok(r.observations.some(o=>o.code===code));
  }
});

test('CSV seguro, sin error inventado cuando no hay observaciones y sin aceptar un objeto forjado',async()=>{
  const r=await review(syntheticVarFile([syntheticVarRecord()]));
  const csv=new TextDecoder().decode(transfersVarObservationsCsv(r).bytes);
  assert.match(csv,/"Sin observaciones"/);assert.doesNotMatch(csv,/"Revisar"/);
  assert.ok(csv.split('\r\n').filter(Boolean).every(line=>line.split(';').every(cell=>!/^"[=+@-]/.test(cell))));
  assert.throws(()=>transfersVarObservationsCsv(structuredClone(r)),/Revisá/);
});

test('un nombre con fórmula o separador nunca llega al CSV de incidencias', async () => {
  const row=syntheticVarRecord();
  row.fill(32,54,94); row.set(new TextEncoder().encode('=HYPERLINK("x");@SUM(1)'),54); row[164]=66;
  const r=await review(syntheticVarFile([row]));
  assert.equal(r.observations.length,1);
  assert.doesNotMatch(new TextDecoder().decode(transfersVarObservationsCsv(r).bytes),/HYPERLINK|SUM\(1\)|@SUM/);
});

test('la vista estructural original y el diagnóstico de campos quedan separados; otras familias conservan su comportamiento',async()=>{
  const bad=syntheticVarRecord();bad[164]=66;
  const r=await diagnostic(syntheticVarFile([bad]));
  assert.equal(r.structureMatches,true);assert.equal(r.fieldReview.matchesObservedFields,false);
  assert.equal(r.generationAllowed,false);
  const other=await buildPayrollBankDiagnostic({profileId:'credicoop-accreditation-30.observed.v1',scope:'42',bytes:syntheticVarFile([new Uint8Array(30).fill(65)])},{cryptoImpl:webcrypto});
  assert.equal(other.fieldReview,null);assert.equal(other.structureMatches,true);
});

test('una modificación del buffer original durante la huella no cambia la revisión capturada',async()=>{
  const bytes=syntheticVarFile([syntheticVarRecord()]);
  const r=await reviewTransfersVarFile(bytes,{cryptoImpl:{subtle:{digest:async(type,b)=>{bytes[164]=66;return webcrypto.subtle.digest(type,b);}}}});
  assert.equal(r.matchesObservedFields,true);assert.equal(bytes[164],66);
});

test('el panel rechaza un buffer que cambia entre los dos contrastes físicos y de campos', async () => {
  const bytes=syntheticVarFile([syntheticVarRecord()]); let calls=0;
  const cryptoImpl={subtle:{digest:async(type,b)=>{
    const hash=await webcrypto.subtle.digest(type,b);
    if(++calls===1)bytes[164]=66;
    return hash;
  }}};
  await assert.rejects(buildPayrollBankDiagnostic({profileId:'transferencias-varias-167.observed.v1',scope:'unsegmented',bytes},{cryptoImpl}),e=>e.code==='BANK_SOURCE_CHANGED');
});

test('rechaza en bloque exceso de filas y bytes sin copiar ni recortar registros',async()=>{
  await assert.rejects(review(new Uint8Array(4*1024*1024+1)),e=>e.code==='BANK_FILE_SIZE_INVALID');
  await assert.rejects(review(syntheticVarFile(Array.from({length:10001},()=>syntheticVarRecord()))),e=>e.code==='BANK_RECORD_LIMIT_EXCEEDED');
});
