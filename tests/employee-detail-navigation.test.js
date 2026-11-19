import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFichaDate, elapsedBetween, fichaSummary, fichaText, fichaXlsx } from '../assets/employee-detail-navigation.js';
import { unzipSync, strFromU8 } from 'fflate';

test('Spanish and numeric ficha dates parse; anything else is not a date', () => {
  assert.equal(parseFichaDate('04 de sept de 2012'), '2012-09-04');
  assert.equal(parseFichaDate('4 de ene. de 1977'), '1977-01-04');
  assert.equal(parseFichaDate('04/09/2012'), '2012-09-04');
  assert.equal(parseFichaDate('2012-09-04'), '2012-09-04');
  for (const bad of ['—', 'No informada', '', null, '31 de foo de 2012']) assert.equal(parseFichaDate(bad), null);
});

test('elapsed service and age use whole months, never future dates', () => {
  assert.deepEqual(elapsedBetween('2012-09-04', '2026-11-05'), { years: 14, months: 2 });
  assert.deepEqual(elapsedBetween('2012-09-06', '2026-11-05'), { years: 14, months: 1 });
  assert.equal(elapsedBetween('2027-01-01', '2026-11-05'), null);
  const rows = [{ section: 'Vínculo laboral', label: 'Situación', value: 'Activo administrativo' }, { section: 'Vínculo laboral', label: 'Ingreso', value: '04 de sept de 2012' },
    { section: 'Datos personales', label: 'Nacimiento', value: '04 de ene de 1977' }, { section: 'Vínculo laboral', label: 'Convenio', value: '—' }];
  const s = fichaSummary(rows, '2026-11-05');
  assert.equal(s.status, 'Activo administrativo'); assert.deepEqual(s.service, { years: 14, months: 2 }); assert.equal(s.age, 49); assert.equal(s.agreement, null);
});

test('text and Excel exports carry only the visible rows, grouped by section', () => {
  const rows = [{ section: 'Datos personales', label: 'Legajo', value: '1254' }, { section: 'Vínculo laboral', label: 'Situación', value: 'Activo <admin> & "x"' }];
  const text = fichaText('ABBA VICTOR', 'Legajo 1254', rows);
  assert.match(text, /DATOS PERSONALES\r\n  Legajo: 1254/); assert.match(text, /VÍNCULO LABORAL\r\n  Situación: Activo/);
  const files = unzipSync(fichaXlsx('ABBA VICTOR', 'Legajo 1254', rows)), sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /Activo &lt;admin&gt; &amp; &quot;x&quot;/); assert.match(sheet, /<autoFilter ref="A1:C3"\/>/);
  assert.ok(files['xl/worksheets/sheet2.xml'] && files['xl/styles.xml'] && files['[Content_Types].xml']);
});
