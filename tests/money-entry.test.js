// Importes: se escriben en pesos y se guardan en centavos exactos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pesosToCents,centsToPesosText} from '../assets/money-entry.js';
import {monthlyCorrectionPatch} from '../assets/payroll-monthly-correction-model.js';

test('pesos escritos con coma o punto se guardan como centavos exactos',()=>{
  for(const [text,cents] of [['1234,50','123450'],['1234.5','123450'],['0','0'],['0,05','5'],['7','700'],[' 30041,38 ','3004138'],['-12,3','-1230'],['9999999999999999,99','999999999999999999']])assert.equal(pesosToCents(text),cents);
  assert.equal(pesosToCents(''),null);assert.equal(pesosToCents('   '),null);assert.equal(pesosToCents(null),null);
});

test('no se redondea ni se interpreta: lo dudoso se rechaza con un ejemplo',()=>{
  for(const bad of ['1.234,50','1,234.50','12,345','abc','$ 100','1e3','-0','-0,00','01','1,','.5','12 000'])assert.throws(()=>pesosToCents(bad),/Ejemplo: 1234,50/,bad);
});

test('los centavos guardados se leen en pesos',()=>{
  assert.equal(centsToPesosText('3004138'),'$ 30.041,38');assert.equal(centsToPesosText('5'),'$ 0,05');assert.equal(centsToPesosText('0'),'$ 0,00');
  assert.equal(centsToPesosText('-1230'),'-$ 12,30');assert.equal(centsToPesosText('123456789012'),'$ 1.234.567.890,12');
  assert.equal(centsToPesosText(null),'No informado');assert.equal(centsToPesosText('12.5'),'12.5');
});

test('lo que escribe la persona llega al modelo de la corrección mensual como centavos válidos',()=>{
  assert.deepEqual(monthlyCorrectionPatch({amountCents:pesosToCents('30041,38')}),{amountCents:'3004138'});
  assert.throws(()=>monthlyCorrectionPatch({amountCents:pesosToCents('')??''}));
  const panel=fs.readFileSync(new URL('../assets/payroll-monthly-correction.js',import.meta.url),'utf8');
  assert.match(panel,/amountCents:'Importe en pesos'/);assert.doesNotMatch(panel,/centavos'/i);
  assert.match(panel,/key==='amountCents'\?pesosToCents\(value\.value\)\?\?'':value\.value/);
  assert.match(panel,/key==='amountCents'\?centsToPesosText\(value\)/);
  assert.match(fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8'),/'assets\/money-entry\.js'/);
});
