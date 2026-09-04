import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Novedades ofrece carga individual, rápida y masiva con preflight, circuito y exportación', () => {
  const html = read('novedades-nomina.html');

  assert.match(html, /data-mc-page="payroll-novelties"/);
  assert.match(html, /Carga individual/);
  assert.match(html, /Carga rápida por legajo/);
  assert.match(html, /Carga masiva/);
  assert.match(html, /name="sourceMode" value="agile"/);
  assert.match(html, /id="agileAddButton"/);
  assert.match(html, /id="agileClearButton"/);
  assert.match(html, /id="agileRows"/);
  assert.match(html, /id="agileTemplateLock"/);
  assert.match(html, /id="readOnlySection"/);
  assert.match(html, /<option value="first_fortnight">Primera quincena<\/option>/);
  assert.match(html, /<option value="supplementary">Complementaria<\/option>/);
  assert.match(html, /<option value="other">Otra<\/option>/);
  assert.match(html, /id="observation"[^>]*maxlength="500"/);
  assert.match(html, /id="forced" type="checkbox"/);
  assert.match(html, /id="previewPanel" hidden/);
  assert.match(html, /id="batchesTitle">Lotes y decisiones/);
  assert.match(html, /id="rejectReason"/);
  assert.match(html, /Excel de revisión/);
  assert.match(html, /CSV es la salida técnica/);
  assert.match(html, /assets\/payroll-novelty-workbench\.js/);
  assert.match(html, /no escribe <code>GRH<\/code>/i);
  assert.match(html, /no toca <code>calculo<\/code> ni <code>employment_movement<\/code>/i);
  assert.doesNotMatch(html, /datos\s+(?:mock|simulados)|modo\s+demo/i);
});

test('el workbench usa contrato gobernado y no inventa permisos ni persistencia local', () => {
  const source = read('assets/payroll-novelty-workbench.js');

  assert.match(source, /const API_URL = '\/api\/internal-payroll-novelties'/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /let preparedDraftKey = null/);
  assert.match(source, /'Idempotency-Key': preparedDraftKey/);
  assert.match(source, /function invalidatePreparedDraft/);
  assert.match(source, /const pendingTransitionAttempts = new Map\(\)/);
  assert.match(source, /function transitionAttempt/);
  assert.match(source, /'Idempotency-Key': attempt\.idempotencyKey/);
  assert.match(source, /body: JSON\.stringify\(\{ command, payload: attempt\.payload \}\)/);
  assert.match(source, /pendingTransitionAttempts\.delete\(attempt\.fingerprint\)/);
  assert.match(source, /operación confirmada/);
  assert.match(source, /payroll\.novelty\.prepare/);
  assert.match(source, /payroll\.novelty\.approve/);
  assert.match(source, /payroll\.novelty\.export/);
  assert.match(source, /Array\.isArray\(batch\.allowedCommands\)/);
  assert.match(source, /if \(batch\.canExport === true\)/);
  assert.doesNotMatch(source, /batch\.status === 'approved' && batch\.exportable/);
  assert.match(source, /payroll-novelty-export\.v1/);
  assert.match(source, /first_fortnight: 'Primera quincena'/);
  assert.match(source, /supplementary: 'Complementaria'/);
  assert.match(source, /other: 'Otra'/);
  assert.match(source, /entryMode === 'agile' \? 'bulk' : entryMode/);
  assert.match(source, /function addAgileRow/);
  assert.match(source, /function removeAgileRow/);
  assert.match(source, /function clearAgileRows/);
  assert.match(source, /byId\('legajo'\)\.value = ''/);
  assert.match(source, /const AGILE_TEMPLATE_FIELD_IDS = Object\.freeze/);
  assert.match(source, /agileTemplate = \{ periodMonth, payrollType, commonValues:/);
  assert.match(source, /radio\.disabled = hasRows && radio\.value !== 'agile'/);
  assert.match(source, /aria-label', `Quitar fila \$\{index \+ 1\}, legajo \$\{row\.legajo\}`/);
  assert.match(source, /principalChanged \|\| !canPrepare/);
  assert.match(source, /payroll\.novelty\.prepare', payload\.principal/);
  assert.doesNotMatch(source, /supplementary: 'Suplementaria'/);
  assert.match(source, /downloadPayrollNoveltyXlsx/);
  assert.match(source, /Descargar Excel de revisión/);
  assert.match(source, /Descargar CSV técnico/);
  assert.match(source, /approvalEffect !== 'export_only'/);
  assert.match(source, /'legajo', 'concepto', 'centro_costo', 'mes_ajuste', 'unidades', 'importe_ars'/);
  assert.match(source, /'movimiento', 'instrumento_legal', 'observacion', 'forzado'/);
  assert.doesNotMatch(source, /localStorage|indexedDB|innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /marcelo|hugo|platform_owner|tenant_rrhh/i);
});

test('la pantalla privada se publica, queda fuera del precache y enlaza desde Nómina', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');
  const payroll = read('nomina-control.html');

  assert.match(build, /'novedades-nomina\.html'/);
  assert.match(build, /'assets\/payroll-novelty-workbench\.js'/);
  assert.match(build, /'assets\/payroll-novelty-exporter\.js'/);
  assert.match(build, /'assets\/payroll-novelty-xlsx-exporter\.js'/);
  assert.match(worker, /'\/novedades-nomina\.html'/);
  assert.match(worker, /'\/assets\/payroll-novelty-workbench\.js'/);
  assert.match(worker, /'\/assets\/payroll-novelty-xlsx-exporter\.js'/);
  assert.match(payroll, /href="novedades-nomina\.html"/);

  const publicCacheBlock = build.match(/const publicCacheInputs = \[([\s\S]*?)\n\];/);
  assert.ok(publicCacheBlock);
  assert.doesNotMatch(publicCacheBlock[1], /novedades-nomina|payroll-novelty/);

  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.functions['api/internal-payroll-novelties.js']?.maxDuration, 20);
  const rewrite = vercel.rewrites.find((entry) => entry.source === '/novedades-nomina');
  assert.equal(vercel.cleanUrls, true);
  assert.equal(rewrite, undefined, 'cleanUrls debe resolver la pantalla sin un rewrite redundante');
  const headers = new Map(vercel.headers.map((entry) => [entry.source,
    new Map(entry.headers.map((header) => [header.key, header.value]))]));
  for (const route of ['/novedades-nomina', '/novedades-nomina.html']) {
    assert.match(headers.get(route)?.get('Cache-Control') || '', /private, no-store/);
  }
});
