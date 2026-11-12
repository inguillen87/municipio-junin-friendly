import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {optionalScaleResolver,verifyOptionalScaleInputs,OWN_PAYROLL_OPTIONAL_SCALES_VERSION} from '../assets/own-payroll-optional-scales.js';
import {ownProgramStructure,ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {programWorkspaceChanges,PROGRAM_SOURCES} from '../assets/own-payroll-program-workspace-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunOperation,ownRunHash,verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
import {ownRunCapture} from '../assets/own-payroll-run-model.js';
import {capture,runCommand,saved} from './fixtures/own-payroll-run-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {optionalScaleSources,optionalScaleRow,stampOptionalCatalogue} from './fixtures/own-payroll-optional-scales-synthetic.js';
const prepare=s=>prepareOwnPayrollInput(s);
const value=s=>prepare(s).employees[0].inputs[0].value;
const proof=s=>s.sourceInventory.optionalScales;
const binding=s=>s.programState.program.definition.bindings[0];
function receipt(source=optionalScaleSources(),calculated=true){
 const body=runCommand({period:source.period}),c=capture({body,bodySha256:ownRunHash(body),payload:source,payloadSha256:ownRunHash(source)});
 if(calculated){const snapshot=createOwnPayrollSnapshot(prepare(source));c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,input:snapshot.input,result:snapshot.result,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,recordedAt:'2026-11-12T00:00:00Z'};}
 return structuredClone(c);
}
test('ausencia demostrada de configuración produce cero; no exige una fila sintética',()=>{
 const s=optionalScaleSources(),before=JSON.stringify(s),input=prepare(s),result=createOwnPayrollSnapshot(input).result;
 assert.equal(input.employees[0].inputs[0].value,'0.00000000');assert.equal(result.rows[0].amount,'0.00');
 assert.match(input.employees[0].inputs[0].sourceReference,/^Escala opcional:[a-f0-9]{64}$/);assert.equal(JSON.stringify(s),before);
 assert.deepEqual(verifyOptionalScaleInputs(s,input),undefined);
});
test('importe configurado usa concepto, convenio, clase y período exactos',()=>{
 const s=optionalScaleSources({rows:[optionalScaleRow(),optionalScaleRow({categoryCode:'7',value:'48.56'})]});s.population.employees[1].categoryCode='7';
 const input=prepare(s);assert.deepEqual(input.employees.map(e=>e.inputs[0].value),['12.34000000','48.56000000']);
 verifyOptionalScaleInputs(s,input);assert.equal(createOwnPayrollSnapshot(input).result.rows[0].amount,'12.34');
});
test('cero aprobado y configuración ausente tienen procedencias distintas',()=>{
 const absent=prepare(optionalScaleSources()).employees[0].inputs[0],zero=prepare(optionalScaleSources({rows:[optionalScaleRow({value:'0.00'})]})).employees[0].inputs[0];
 assert.equal(absent.value,zero.value);assert.notEqual(absent.sourceReference,zero.sourceReference);
});
for(const [name,row] of [['otra clase',{categoryCode:'7'}],['otro concepto',{code:'93'}],['otro convenio',{agreementCode:'2'}],['inactiva',{active:false}],['vigencia futura',{validFrom:'2027-01'}],['vigencia terminada',{validFrom:'2026-01',validUntil:'2026-09'}]])test('catálogo completo con '+name+' demuestra ausencia de entrada aplicable',()=>assert.equal(value(optionalScaleSources({rows:[optionalScaleRow(row)]})),'0.00000000'));
for(const period of ['2027-08','2027-09','2027-10','2027-11','2027-12','2028-02','2028-12','2030-01'])test('vigencia abierta y ausencia explícita funcionan en '+period,()=>{
 assert.equal(value(optionalScaleSources({period})),'0.00000000');assert.equal(value(optionalScaleSources({period,rows:[optionalScaleRow()]})),'12.34000000');
});
for(const [label,mutate] of [
 ['sin prueba',s=>delete s.sourceInventory.optionalScales],['catálogo incompleto',s=>proof(s).complete=false],
 ['conteo recortado',s=>proof(s).itemCount++],['hash distinto',s=>proof(s).itemsSha256=hash('d')],
 ['revisión distinta',s=>proof(s).revision++],['revisión cero',s=>proof(s).revision=0],
 ['versión de catálogo distinta',s=>proof(s).catalogueVersion=hash('d')],['propuesta no identificada',s=>proof(s).proposalId=null],
 ['aprobación no identificada',s=>proof(s).approvalId=null],['tenant no identificado',s=>proof(s).tenantId=''],
 ['binding no identificado',s=>proof(s).sourceBindingId=''],['campo inesperado',s=>proof(s).partial=false],
 ['items truncados',s=>s.programState.salaryCatalog.items.pop()],
 ['importe alterado',s=>s.programState.salaryCatalog.items.find(r=>r.kind==='scale').value='99.99'],
 ['programa contra otra versión',s=>s.programState.program.salaryVersion=hash('d')],
 ['encuadre sin categoría',s=>s.population.employees[0].categoryCode=null],
 ['origen no nativo',s=>s.population.employees[0].origin='GRH']
])test('rechaza '+label+' y nunca rellena con cero',()=>{const s=optionalScaleSources({rows:[optionalScaleRow()]});mutate(s);assert.throws(()=>prepare(s));});
test('null, escala duplicada y vigencias superpuestas siguen siendo errores aun con hash correcto',()=>{
 for(const change of [s=>s.programState.salaryCatalog.items.find(r=>r.kind==='scale').value=null,s=>s.programState.salaryCatalog.items.push(optionalScaleRow()),s=>s.programState.salaryCatalog.items.push(optionalScaleRow({validFrom:'2027-01'}))]){
  const s=optionalScaleSources({rows:[optionalScaleRow()]});change(s);stampOptionalCatalogue(s);assert.throws(()=>prepare(s));
 }
});
test('hash completo coincide con crypto canónico y no normaliza ni reordena el preimage',()=>{
 const s=optionalScaleSources({rows:[optionalScaleRow({label:'Escala íntegra ñ'})]});
 assert.equal(proof(s).itemsSha256,createHash('sha256').update(salarySerialized(s.programState.salaryCatalog.items)).digest('hex'));
 s.programState.salaryCatalog.items.reverse();assert.throws(()=>prepare(s));
});
for(const [name,change] of [['sin opt-in',p=>delete p.optionalScalesVersion],['versión desconocida',p=>p.optionalScalesVersion='v99'],['unidad incorrecta',p=>p.bindings[0].unit='coefficient'],['sumatoria',p=>p.bindings[0].combine='sum'],['sin política de ausencia',p=>p.bindings[0].onMissing='error'],['concepto diferente',p=>p.bindings[0].sourceCode='93'],['auxiliar',p=>p.rules[0].nature='auxiliary']])test('programa rechaza '+name,()=>{const s=optionalScaleSources();change(s.programState.program.definition);assert.throws(()=>ownProgramStructure(s.programState.program.definition));});
test('la revisión del programa cuenta y muestra la nueva decisión explícita',()=>{
 const s=optionalScaleSources(),after=s.programState.program.definition,before=structuredClone(after);delete before.optionalScalesVersion;before.bindings[0].sourceKind='monthly_amount';before.bindings[0].sourceCode='90';
 const change=programWorkspaceChanges(before,after);assert.ok(change.rows.some(r=>r.kind==='policies'&&r.key==='optionalScalesVersion'&&r.status==='added'));assert.match(PROGRAM_SOURCES.optional_scale,/cero.*configuración aprobada/);
 assert.doesNotThrow(()=>ownProgramHistory(before,after));assert.throws(()=>ownProgramHistory(after,before),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
});
test('scale y scale_reference conservan error ante fuente ausente',()=>{
 for(const kind of ['scale','scale_reference']){const s=optionalScaleSources();delete s.programState.program.definition.optionalScalesVersion;delete s.sourceInventory.optionalScales;Object.assign(binding(s),{sourceKind:kind,onMissing:'error'});if(kind==='scale_reference')Object.assign(binding(s),{sourceAgreementCode:'1',sourceCategoryCode:'6'});assert.throws(()=>prepare(s),e=>e.code==='SOURCE_DEFINITION_MISSING');}
});
test('prueba opcional sin opt-in se rechaza, sin cambiar los recibos históricos',()=>{
 const old=capture();old.saved=saved(old);const before=JSON.stringify(old);verifyOwnRunReceipt(old);assert.equal(JSON.stringify(old),before);
 const s=approvedSources();s.sourceInventory={optionalScales:proof(optionalScaleSources())};assert.throws(()=>prepare(s),e=>e.code==='OPTIONAL_SCALE_CAPTURE_INVALID');
});
test('captura pendiente e historial conservan catálogo y algoritmo originales',()=>{
 const c=receipt();assert.equal(verifyOwnRunReceipt(c).id,c.id);assert.equal(ownRunCapture(c).id,c.id);
 const pending=receipt(undefined,false);assert.equal(verifyOwnRunReceipt(pending).saved,null);
 const later=optionalScaleSources({rows:[optionalScaleRow({value:'55.00'})]});later.programState.salaryCatalog.revision=10;stampOptionalCatalogue(later);
 assert.equal(c.payload.programState.salaryCatalog.revision,1);assert.equal(c.saved.input.employees[0].inputs[0].value,'0.00000000');assert.equal(verifyOwnRunReceipt(c).saved.algorithmSha256,hash('c'));
});
for(const [label,change] of [['importe',i=>i.employees[0].inputs[0].value='1.00000000'],['procedencia',i=>i.employees[0].inputs[0].sourceReference='Escala opcional:'+hash('f')],['contrato',i=>i.employees[0].contractId=uid(300)],['duplicado',i=>i.employees[0].inputs.push(structuredClone(i.employees[0].inputs[0]))],['entrada quitada',i=>i.employees[0].inputs=[]]])test('lectura rechaza '+label+' alterado aunque se recalculen las huellas exteriores',()=>{
 const c=receipt();change(c.saved.input);c.saved.inputSha256=ownRunHash(c.saved.input);assert.throws(()=>verifyOwnRunReceipt(c));
});
test('API transmite el inventario al productor y recupera el mismo intento sin otra captura',async()=>{
 const c=receipt(undefined,false),done=receipt().saved,calls=[];
 const sql={query:async(q,args)=>{calls.push(q);return[{result:q.includes('own_run_complete_')?done:c}];}};
 const principal={user:{email:'optional-scale-qa@example.invalid'},tenant:{source:'membership',id:uid(900),membershipId:uid(5),effectiveCapabilities:[]}},session={email:'optional-scale-qa@example.invalid',id:uid(7),version:1,releaseSha:'d'.repeat(40)};
 const response=await ownRunOperation(sql,principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>hash('c')});
 assert.equal(response.saved.input.employees[0].inputs[0].value,'0.00000000');assert.equal(calls.length,2);
 const replay=await ownRunOperation({query:async()=>[{result:{...c,saved:done,replayed:true}}]},principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>hash('d')});assert.equal(replay.saved.algorithmSha256,hash('c'));
});
