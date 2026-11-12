// Novedades fijas: el concepto se elige por nombre y lo que se guarda sigue siendo su código.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FIXED_CONCEPT_OPTIONS,FIXED_OWN_ENTRIES,FIXED_INSTRUMENT_OPTIONS,fixedConceptCode,fixedConceptGuess,fixedConceptHint,fixedConceptIsOwn,fixedConceptName,fixedConceptOption,fixedDayText} from '../assets/payroll-fixed-concepts.js';
import {GRH_CONCEPTS} from '../assets/grh-concept-dictionary.js';
import {fixedForm} from '../assets/payroll-fixed-novelties-model.js';

test('cada opción de la lista es única y lleva a un código que el formulario acepta',()=>{
  const texts=FIXED_CONCEPT_OPTIONS.map(option=>option.text);
  assert.equal(new Set(texts).size,texts.length);
  for(const option of FIXED_CONCEPT_OPTIONS){assert.match(option.code,/^(?:0|[1-9]\d{0,19})$/);assert.equal(fixedConceptCode(option.text),option.code);assert.equal(fixedConceptOption(option.code),option.text);}
});

test('los datos fijos de la liquidación propia van primero y cada concepto se ofrece una sola vez',()=>{
  assert.deepEqual(FIXED_CONCEPT_OPTIONS.slice(0,FIXED_OWN_ENTRIES.length).map(option=>option.code),FIXED_OWN_ENTRIES.map(entry=>entry.code));
  assert.deepEqual(FIXED_OWN_ENTRIES.map(entry=>entry.code),['901000617','901000676','901000677','901000607']);
  for(const entry of FIXED_OWN_ENTRIES){
    assert.equal(Number(entry.code),901000000+Number(entry.concept));assert.ok(fixedConceptIsOwn(entry.code));
    assert.ok(GRH_CONCEPTS.some(c=>c.code===entry.concept),'el concepto '+entry.concept+' existe en el diccionario');
    assert.ok(!FIXED_CONCEPT_OPTIONS.some(option=>option.code===entry.concept),'el concepto '+entry.concept+' no se ofrece dos veces');
  }
  assert.equal(FIXED_CONCEPT_OPTIONS.length,FIXED_OWN_ENTRIES.length+GRH_CONCEPTS.length-FIXED_OWN_ENTRIES.length);
});

test('el campo acepta el nombre elegido o un número; cualquier otro texto no se adivina',()=>{
  assert.equal(fixedConceptCode('Afiliación al Sindicato Municipal'),'901000617');
  assert.equal(fixedConceptCode('  afiliacion al sindicato municipal '),'901000617');
  assert.equal(fixedConceptCode('638 · A.M.A.R.U.(570)'),'638');
  assert.equal(fixedConceptCode('80'),'80');assert.equal(fixedConceptCode('901000296'),'901000296');
  for(const text of ['','sindicato','cosa rara','0617','6 17','617 · otra cosa',null,undefined,617])assert.equal(fixedConceptCode(text),null);
});

test('lo escrito a medias se reconoce sólo si alcanza para una única opción',()=>{
  assert.equal(fixedConceptGuess('sindicato mun')?.code,'901000617');
  assert.equal(fixedConceptGuess('seguro cony')?.code,'901000607');
  assert.equal(fixedConceptGuess('afiliacion apel')?.code,'901000676');
  assert.equal(fixedConceptGuess('seguro'),null);assert.equal(fixedConceptGuess('zzzz'),null);assert.equal(fixedConceptGuess(''),null);assert.equal(fixedConceptGuess('638'),null);
});

test('lo guardado se muestra con nombre y la fecha como dd/mm/aaaa',()=>{
  assert.equal(fixedConceptName('901000617'),'Afiliación al Sindicato Municipal · de acá sale el concepto 617');
  assert.equal(fixedConceptName('638'),'638 · A.M.A.R.U.(570)');
  assert.match(fixedConceptName('901000296'),/^Dato fijo para el concepto 296/);
  assert.equal(fixedConceptName('99999'),'Concepto 99999');assert.equal(fixedConceptName(null),'Sin informar');
  assert.equal(fixedDayText('2009-09-01'),'01/09/2009');assert.equal(fixedDayText('Sin vencimiento informado'),'Sin vencimiento informado');
});

test('la ayuda del campo orienta sin decidir',()=>{
  assert.match(fixedConceptHint(''),/Buscá por nombre/);
  assert.match(fixedConceptHint('Afiliación a A.T.E.'),/sale el concepto 677; se carga con 1 unidad y sin importe/);
  assert.match(fixedConceptHint('617'),/Para la liquidación propia elegí «Afiliación al Sindicato Municipal»/);
  assert.match(fixedConceptHint('99999'),/no está en la lista de referencia: se valida al guardar/);
  assert.match(fixedConceptHint('seguro cony'),/¿Es «Seguro mutual del cónyuge \(Ley 2404\)»\?/);
  assert.match(fixedConceptHint('cosa rara'),/Elegí una opción de la lista/);
});

test('el modelo recibe el código, igual que antes',()=>{
  const subject={contractId:'70000000-0000-4000-8000-000000000001',legajo:'1001',employeeName:'AGENTE SINTÉTICO',identityToken:'a'.repeat(64),origin:'GRH',sourceCutoff:'2026-09-01',registeredAt:null};
  const fields={legajo:'1001',conceptSourceId:fixedConceptCode('Seguro mutual del cónyuge (Ley 2404)'),costCenterSourceId:'',payrollType:'monthly',quantityDecimal:'1',amountArs:'',forced:false,forcedReason:'',legalInstrument:FIXED_INSTRUMENT_OPTIONS[1]+'01/10/2026',validFrom:'2026-10-01',validTo:'2026-10-31',reason:'Alta sintética de prueba'};
  let draft;try{draft=fixedForm(fields,subject);}catch{draft=fixedForm(fields);}
  assert.equal(draft.values.conceptSourceId,'901000607');assert.equal(draft.values.quantityDecimal,'1');assert.equal(draft.values.amountCents,null);
});

test('la pantalla usa la lista, convierte el texto antes de armar la propuesta y publica el módulo',()=>{
  const panel=fs.readFileSync('assets/payroll-fixed-novelties.js','utf8'),build=fs.readFileSync('scripts/build-friendly.mjs','utf8');
  assert.match(panel,/from '\.\/payroll-fixed-concepts\.js'/);
  assert.match(panel,/const code=fixedConceptCode\(fields\.conceptSourceId\);if\(code===null\)throw Error\('Elegí el concepto de la lista o escribí su número\.'\);fields\.conceptSourceId=code;/);
  assert.match(panel,/\['Concepto',fixedConceptName\(value\.conceptSourceId\)\]/);
  assert.match(panel,/if\(!row\)select\.value='monthly';/);
  assert.doesNotMatch(panel,/'Código del concepto',20\],\['costCenterSourceId','Centro de costo \(opcional\)',20\],\['quantityDecimal','Unidades \(si constan\)'/);
  assert.match(build,/'assets\/payroll-fixed-concepts\.js'/);
});

test('si la pantalla retiró lo consultado, el registro vuelve solo cuando vuelve el acceso',()=>{
  const panel=fs.readFileSync('assets/payroll-fixed-novelties.js','utf8');
  // Se anota sólo si había algo a la vista, y se retira igual que antes.
  assert.match(panel,/function deny\(\)\{if\(mounted&&shell\.open&&\(data\|\|editor\)\)restoreOnAccess=true;seq\+\+;controller\?\.abort\(\);picker\?\.close\(\);busy=false;clearConsulted\(\);/);
  // Se recupera con la misma consulta que «Actualizar registro», nunca con la pestaña oculta ni mientras hay otra operación.
  assert.match(panel,/function restoreAfterAccess\(\)\{if\(restoreOnAccess&&mounted&&shell\.open&&!data&&!busy&&!externalBusy&&hasRead\(access\)&&available\(\)\)refresh\(\);\}/);
  assert.match(panel,/setExternalBusy\(value\)\{externalBusy=Boolean\(value\);controls\(\);restoreAfterAccess\(\);\}/);
  assert.match(panel,/const \$=s=>host\.querySelector\(s\),available=\(\)=>!stopped&&shell\.isConnected&&shell\.open&&!document\.hidden;/);
});
