import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { absencePeople, absenceEvents } from '../api/internal-data.js';
import { normalizeAbsenceDetailScope } from '../lib/absence-event-context.js';
import { capabilitiesForInternalDataResource, TENANT_DATA_CAPABILITIES } from '../lib/internal-resource-access.js';
import { absenceInsights, personDays, quickRange, readableLabel, readableName, topWithOthers, weekdayTotals } from '../assets/absence-charts.js';
import { createReportPdf, winAnsi } from '../assets/absence-report-pdf.js';

const SOURCE = { importId: 7, name: 'grh', sha256: 'A'.repeat(64), sourceCutoff: '2026-09-10T00:00:00.000Z', importedAt: '2026-09-11T00:00:00.000Z', status: 'completed' };
function peopleSql(rows = []) {
  const calls = [];
  return { calls, async query(statement, values = []) {
    const marker = String(statement).match(/\/\* absence:([^*]+) \*\//)?.[1];
    calls.push({ marker, sql: String(statement), values });
    if (marker === 'source') return [SOURCE];
    if (marker === 'people') return rows;
    throw new Error('consulta no simulada ' + marker);
  } };
}

test('el ranking de personas exige permiso nominal, no sólo analítico', () => {
  assert.deepEqual(capabilitiesForInternalDataResource('absencepeople'), [TENANT_DATA_CAPABILITIES.ABSENCE_NOMINAL_READ]);
});

test('absencePeople agrupa por legajo de origen, ordena, limita a 50 y parametriza filtros', async () => {
  const sql = peopleSql([{ contractId: null, companyId: 1, legajo: '274', name: 'ALANIZ, ELENA', sector: 'ADMINISTRATIVO', events: 9, sourceDeclaredDays: '31.5', reportedDaysEvents: 7, distinctReasons: 3, topReason: 'LICENCIA ANUAL ORDINARIA', lastEventDate: '2026-09-08', dni: '1' }]);
  const result = await absencePeople(sql, { query: { from: '2026-01-01', to: '2026-12-31', sector: "X' OR 1=1", reasonCode: '10', limit: '500', order: 'days' } });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.payload.data[0]), ['contractId', 'companyId', 'legajo', 'name', 'sector', 'events', 'sourceDeclaredDays', 'reportedDaysEvents', 'distinctReasons', 'topReason', 'lastEventDate']);
  assert.equal(result.payload.data[0].sourceDeclaredDays, 31.5); assert.equal(result.payload.data[0].reportedDaysEvents, 7);
  assert.match(sql.calls.find(c => c.marker === 'people').sql, /count\(absence\.dias\)::int AS "reportedDaysEvents"/);
  assert.equal(result.payload.limit, 50); assert.equal(result.payload.order, 'days');
  assert.equal(result.payload.meta.containsPersonalIdentifiers, true);
  const call = sql.calls.find(c => c.marker === 'people');
  assert.deepEqual(call.values, ['2026-01-01', '2026-09-10', "X' OR 1=1", '10', 50]);
  assert.match(call.sql, /GROUP BY absence\.company_id, absence\.legajo/);
  assert.match(call.sql, /ORDER BY "sourceDeclaredDays" DESC, events DESC/);
  assert.doesNotMatch(call.sql, /X' OR 1=1|dni|cuil|comentario/i);
});

test('absencePeople rechaza un orden no declarado antes de consultar la base', async () => {
  const sql = peopleSql();
  const result = await absencePeople(sql, { query: { order: 'random' } });
  assert.equal(result.status, 400); assert.equal(sql.calls.length, 0);
});

test('el handler publica el recurso absencepeople', async () => {
  assert.match(await readFile(new URL('../api/internal-data.js', import.meta.url), 'utf8'), /resource === 'absencepeople'/);
});

test('etiquetas y nombres en mayúsculas se leen en formato normal', () => {
  assert.equal(readableLabel('LICENCIA ANUAL ORDINARIA C/RIESGO'), 'Licencia anual ordinaria c/riesgo');
  assert.equal(readableLabel('Ya normal'), 'Ya normal');
  assert.equal(readableName('QUIÑONES, SERGIO FERNANDO'), 'Quiñones, Sergio Fernando');
});

test('día de la semana: lunes a domingo por fecha de inicio', () => {
  const week = weekdayTotals([['2026-01-05', 87], ['2026-01-06', 3], ['2026-01-11', 1]]);
  assert.deepEqual(week.map(w => w.count), [87, 3, 0, 0, 0, 0, 1]);
  assert.equal(week[0].day, 'Lunes');
});

test('conclusiones simples del tablero', () => {
  const analytics = { summary: { events: 100 }, monthly: [{ month: '2026-01-01', events: 60 }, { month: '2026-02-01', events: 40, partial: true }],
    reasons: [{ label: 'LICENCIA ANUAL', count: 70 }, { label: 'OTRA', count: 30 }], sectors: [{ label: 'OBRERO', count: 55 }],
    comparison: { available: true, change: { events: 14.4 } } };
  const out = absenceInsights({ analytics, days: [['2026-01-05', 10], ['2026-01-07', 2]] });
  assert.deepEqual(out.map(i => i.key), ['month', 'reason', 'sector', 'weekday', 'comparison']);
  assert.equal(out[0].value, 'enero 2026');
  assert.match(out[1].detail, /70 eventos · 70 % del total/);
  assert.equal(out[3].value, 'Lunes');
  assert.equal(out[4].value, '+14,4 %');
  assert.deepEqual(absenceInsights({ analytics: { summary: { events: 0 } } }), []);
});

test('períodos rápidos se calculan desde el corte de la fuente', () => {
  assert.deepEqual(quickRange('month', '2026-09-10'), { from: '2026-09-01', to: '2026-09-10' });
  assert.deepEqual(quickRange('quarter', '2026-09-10'), { from: '2026-07-01', to: '2026-09-10' });
  assert.deepEqual(quickRange('year12', '2026-09-10'), { from: '2025-10-01', to: '2026-09-10' });
  assert.deepEqual(quickRange('year', '2026-09-10'), { from: '2026-01-01', to: '2026-09-10' });
  assert.deepEqual(quickRange('lastyear', '2026-09-10'), { from: '2025-01-01', to: '2025-12-31' });
  assert.equal(quickRange('year', ''), null);
});

test('motivos: los más frecuentes y el resto agrupado', () => {
  const out = topWithOthers([{ label: 'a', count: 5 }, { label: 'b', count: 1 }, { label: 'c', count: 3 }, { label: 'd', count: 0 }], 2);
  assert.deepEqual(out.map(i => [i.label, i.count]), [['a', 5], ['c', 3], ['Otros motivos', 1]]);
});

test('el PDF del informe es válido, pagina e incluye imágenes JPEG', () => {
  const doc = createReportPdf({ title: 'MuniControl', subtitle: 'Informe', footer: 'Uso interno' });
  doc.heading('Informe de ausentismo').text('Período con acentos: año, Quiñones — «prueba» ≥ fin');
  doc.kpis([{ label: 'Licencias', value: '1.688' }, { label: 'Personas', value: '612' }]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  for (let i = 0; i < 4; i++) doc.image(jpeg, { px: { w: 2200, h: 920 }, caption: 'Gráfico ' + i });
  doc.table([{ label: '#' }, { label: 'Persona', weight: 3 }, { label: 'Licencias', align: 'right' }], Array.from({ length: 60 }, (_, i) => [String(i + 1), 'Persona ' + i, String(60 - i)]));
  const bytes = doc.bytes(), text = new TextDecoder('latin1').decode(bytes);
  assert.match(text, /^%PDF-1\.4/); assert.match(text, /%%EOF\n$/);
  assert.ok((text.match(/\/Type \/Page /g) || []).length >= 3);
  assert.equal((text.match(/\/Filter \/DCTDecode/g) || []).length, 4);
  const xref = Number(/startxref\n(\d+)/.exec(text)[1]); assert.equal(text.slice(xref, xref + 4), 'xref');
  // Cada offset del xref apunta a su objeto.
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + String(i + 1).length + 6), `${i + 1} 0 obj`));
  assert.equal(winAnsi('ñ≥'), '<f13f>');
});

test('la página de ausentismo tiene ranking de personas, tablero y estilos', async () => {
  const page = await readFile(new URL('../ausentismo-control.html', import.meta.url), 'utf8');
  assert.match(page, /id="peoplePanel"/); assert.match(page, /data-people-rows/); assert.match(page, /absence-dashboard\.css/);
  assert.match(page, /Personas con licencias/); assert.doesNotMatch(page, /<span class="kpi-label">Legajos afectados/);
  const build = await readFile(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  for (const asset of ['assets/absence-report-pdf.js', 'assets/absence-dashboard.css']) assert.ok(build.includes(`'${asset}'`), asset);
});

test('días de una persona: precisión declarada y cobertura de eventos con días informados', () => {
  assert.equal(personDays({ events: 9, sourceDeclaredDays: 31.5, reportedDaysEvents: 9 }), '31,5');
  assert.equal(personDays({ events: 9, sourceDeclaredDays: 31.5, reportedDaysEvents: 7 }), '31,5 (en 7 de 9)');
  assert.equal(personDays({ events: 4, sourceDeclaredDays: 0, reportedDaysEvents: 0 }), 'Sin informar');
  assert.equal(personDays({ events: 4, sourceDeclaredDays: 12 }), '12');
});

test('el ranking conserva la fuente al abrir el historial; sin contrato vinculado el historial es exacto por empresa y legajo', async () => {
  const source = await readFile(new URL('../assets/absence-charts.js', import.meta.url), 'utf8');
  assert.match(source, /snapshot: peopleSnapshot/); assert.match(source, /peopleSnapshot = payload\.meta\?\.snapshot \?\? null/);
  assert.match(source, /searchParams\.set\('companyId', String\(row\.companyId\)\); url\.searchParams\.set\('legajo', String\(row\.legajo\)\)/);
  assert.match(source, /JSON\.stringify\(payload\.meta\?\.snapshot \?\? null\) !== JSON\.stringify\(expected\)/, 'no mezcla cortes');
  assert.doesNotMatch(source, /eventSearch/, 'ya no usa la búsqueda parcial del listado para el historial');
  assert.match(source, /if \(response\.status === 401\) \{ withdraw\(/); assert.match(source, /if \(response\.status === 403\) \{ withdraw\(/);
  assert.match(source, /const withdraw = message => \{ body\.replaceChildren\(\); more\.hidden = true;/, 'al perder sesión o permiso se retiran filas y nombre, también en «Ver más»');
  assert.doesNotMatch(source, /Math\.round\((?:r|i)\.(?:sourceDeclaredDays|declaredDays)/);
});

test('alcance exacto por legajo: empresa y legajo juntos, sin comodines y sin combinar con búsqueda o contrato', () => {
  assert.deepEqual(normalizeAbsenceDetailScope({ legajo: ' 27 ', companyId: '101' }), { contractId: '', search: '', legajo: '27', companyId: '101' });
  assert.deepEqual(normalizeAbsenceDetailScope({ search: 'perez' }), { contractId: '', search: 'perez', legajo: '', companyId: '' });
  for (const bad of [{ legajo: '27' }, { companyId: '101' }, { legajo: '2%7', companyId: '101' }, { legajo: '2_7', companyId: '101' }, { legajo: '27', companyId: '1e3' },
    { legajo: '27', companyId: '101', search: 'x' }, { legajo: '27', companyId: '101', contractId: '00000000-0000-4000-8000-000000000001' }, { legajo: 'x'.repeat(65), companyId: '1' }])
    assert.throws(() => normalizeAbsenceDetailScope(bad), /ABSENCE_DETAIL_FILTER_INVALID/, JSON.stringify(bad));
});

test('absenceEvents con legajo exacto filtra por igualdad en conteo y filas; el legajo 27 no trae 127 ni 270', async () => {
  const calls = [];
  const sql = { async query(statement, values = []) {
    const marker = String(statement).match(/\/\* absence:([^*]+) \*\//)?.[1]; calls.push({ marker, sql: String(statement), values });
    if (marker === 'source') return [SOURCE];
    if (marker === 'events-summary') return [{ events: 2, affectedContracts: 0, affectedPeople: 1, sourceDeclaredDays: '5' }];
    if (marker === 'events') return [{ contractId: null, companyId: 101, legajo: '27', name: 'PERSONA QA', sector: 'OBRERO', eventDate: '2026-07-10', untilDate: '2026-07-12', reasonCode: '10', reason: 'LICENCIA', sourceDeclaredDays: '2.5', sourceQuantity: '1' }];
    throw new Error('consulta no simulada ' + marker);
  } };
  const result = await absenceEvents(sql, { query: { from: '2026-01-01', to: '2026-09-10', companyId: '101', legajo: '27', limit: '50' } });
  assert.equal(result.status, 200); assert.equal(result.payload.meta.detailScope, 'exact_source_legajo'); assert.equal(result.payload.data[0].sourceDeclaredDays, 2.5);
  for (const marker of ['events-summary', 'events']) {
    const call = calls.find(c => c.marker === marker);
    assert.match(call.sql, /absence\.company_id::text = \$3 AND absence\.legajo = \$4/); assert.doesNotMatch(call.sql, /ILIKE/);
    assert.deepEqual(call.values.slice(0, 4), ['2026-01-01', '2026-09-10', '101', '27']);
  }
  const rejected = await absenceEvents({ async query() { throw new Error('no debe consultar'); } }, { query: { legajo: '27' } });
  assert.equal(rejected.status, 400);
});
