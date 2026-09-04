import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const readDashboard = () => readFile(new URL('../internal-dashboard.html', import.meta.url), 'utf8');

function declaredFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `No se encontró ${marker}`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} quedó sin cierre`);
}

function valueFormatter(source) {
  const formatter = declaredFunction(source, 'structuredValueText');
  const context = {
    text(value) { return value === null || value === undefined ? '' : String(value).trim(); },
    formatNumber(value) { return new Intl.NumberFormat('es-AR').format(value); },
    readableKey(key) {
      return key.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, (letter) => letter.toUpperCase());
    },
  };
  vm.runInNewContext(`${formatter}\nglobalThis.formatValue = structuredValueText;`, context, {
    filename: 'person-detail-value-formatting-runtime.js',
  });
  return context.formatValue;
}

test('las referencias PERSONAS muestran etiqueta e identificador sin coerciones de objetos', async () => {
  const formatValue = valueFormatter(await readDashboard());

  assert.equal(formatValue({ label: 'Mendoza', sourceId: '13' }), 'Mendoza · código 13');
  assert.equal(formatValue({ sourceId: '620' }), 'Código 620');
  assert.equal(formatValue('[object Object]'), '');
  assert.equal(formatValue('Domicilio [object Object]'), '');
  assert.doesNotMatch(formatValue({ catalog: { label: 'Junín', sourceId: '5' } }), /\[object Object\]/);
});

test('un domicilio estructurado se compone en una lectura humana sin serializar objetos', async () => {
  const formatValue = valueFormatter(await readDashboard());
  const result = formatValue({
    street: { label: 'San Martín', sourceId: '44' },
    number: '123',
    floor: '2',
    unit: 'B',
    barrio: { label: 'Centro', sourceId: '7' },
    locality: { label: 'Junín', sourceId: '5' },
    province: { label: 'Mendoza', sourceId: '13' },
    postalCode: '5573',
  });

  assert.match(result, /^San Martín 123/);
  assert.match(result, /Piso 2/);
  assert.match(result, /Unidad B/);
  assert.match(result, /Barrio Centro/);
  assert.match(result, /Junín/);
  assert.match(result, /Mendoza/);
  assert.match(result, /CP 5573$/);
  assert.doesNotMatch(result, /\[object Object\]/);
});

test('el contrato PERSONAS usa los componentes estructurados cuando el texto legado fue coercionado', async () => {
  const formatValue = valueFormatter(await readDashboard());
  const territory = {
    locality: { label: 'Junín', sourceId: '5' },
    province: { label: 'Mendoza', sourceId: '13' },
    postalCode: '5573',
    inlineAddress: {
      sourceDisplay: '[object Object]',
      street: { label: 'San Martín', sourceId: '44' },
      number: '123',
      floor: { label: '2' },
      unit: { sourceDisplay: 'B' },
    },
  };
  const historical = {
    sourceDisplay: '[object Object]',
    street: { label: 'Belgrano', sourceId: '45' },
    number: '456',
    floor: { label: '3' },
    unit: { label: 'C' },
    locality: { label: 'Junín', sourceId: '5' },
    province: { label: 'Mendoza', sourceId: '13' },
  };

  const values = [
    formatValue(territory.locality),
    formatValue(territory.province),
    formatValue(territory.inlineAddress),
    formatValue(historical.sourceDisplay) || formatValue({ street: historical.street, number: historical.number }),
    formatValue(historical.locality),
    formatValue(historical.province),
    formatValue([historical.floor, historical.unit]),
  ];

  assert.deepEqual(values, [
    'Junín · código 5',
    'Mendoza · código 13',
    'San Martín 123 · Piso 2 · Unidad B',
    'Belgrano 456',
    'Junín · código 5',
    'Mendoza · código 13',
    '3 · C',
  ]);
  assert.doesNotMatch(values.join(' | '), /\[object (?:Object|Array)\]/i);
});

test('objetos desconocidos y referencias circulares fallan de forma legible', async () => {
  const formatValue = valueFormatter(await readDashboard());
  const circular = { source: 'PERSONAS' };
  circular.detail = circular;

  assert.equal(formatValue(circular), 'Source: PERSONAS · Detail: Referencia circular');
  assert.equal(formatValue([{ label: 'Junín', sourceId: '5' }, { label: 'Mendoza', sourceId: '13' }]),
    'Junín · código 5 · Mendoza · código 13');
});

test('la ficha usa el normalizador en campos y mantiene la estructura original trazable', async () => {
  const html = await readDashboard();
  const detailField = declaredFunction(html, 'detailField');
  const familyValue = declaredFunction(html, 'familyValue');

  assert.match(detailField, /structuredValueText\(value\)/);
  assert.match(detailField, /structuredValueText\(formatter \? formatter\(value\) : value\)/);
  assert.match(familyValue, /structuredValueText\(value\)/);
  assert.match(html, /familyValue\('Piso \/ unidad', \[domicile\.floor, domicile\.unit\]\)/);
  assert.match(html, /traceDetails\(personas\.territory, 'Campos de origen del territorio'\)/);
  assert.match(html, /traceDetails\(domicile, 'Campos de origen del domicilio'\)/);
  assert.doesNotMatch(detailField, /formatter \? formatter\(value\) : text\(value\)/);
  assert.doesNotMatch(familyValue, /formatter \? formatter\(value\) : text\(value\)/);
});
