import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { entityExportResponse, entityDiscountFile, entityFileBytes, ENTITY_EXPORT_LAYOUT } from '../assets/entity-discount-export.js';
import { internalPayrollEntityExport } from '../lib/internal-payroll-entity-export.js';

const id = '3fbf3df3-2bad-4d92-ab96-f16fcdd253ac';
const base = { version: 'payroll-entity-export.v1', found: true, datasetId: id, date: '2026-08-31', period: 2026, month: 8, type: 'M', concept: '638', description: 'A.M.A.R.U.', concepts: [], rows: [] };
const row = (legajo, amount, extra = {}) => ({ legajo, amount, sector: '12', contractMatches: 1, dni: '20111222', name: 'PEREZ, JUAN CARLOS', jurisdiction: '42', ...extra });

test('lines follow GRH «Exportacion Descuentos» position by position (76, CRLF, Windows-1252)', () => {
  const data = entityExportResponse({ ...base, rows: [row('571', '2500.00'), row('9', '12.05', { name: 'MUÑOZ, ANA MARÍA DE LOS ÁNGELES', dni: '5123456', sector: '1234567', jurisdiction: '55' })] });
  const file = entityDiscountFile(data);
  assert.equal(file.name, '638 082026.txt');
  assert.deepEqual(file.lines, [
    '42' + '1200' + '000020111222' + 'PEREZ, JUAN CARLOS     ' + ' ' + '0000250000' + '000000000000000638' + '202608',
    '55' + '1234' + '000005123456' + 'MUÑOZ, ANA MARÍA DE LOS' + ' ' + '0000001205' + '000000000000000638' + '202608',
  ]);
  assert.ok(file.lines.every(l => l.length === ENTITY_EXPORT_LAYOUT.width));
  assert.equal(file.totalCents, '251205');
  const bytes = entityFileBytes(file);
  assert.equal(bytes.length, 2 * 78);
  assert.deepEqual([...bytes.slice(76, 78)], [13, 10]);
  assert.equal(bytes[78 + 18 + 2], 0xd1);
});

test('rows that GRH would drop or that need data are listed apart, never guessed', () => {
  const file = entityDiscountFile(entityExportResponse({ ...base, rows: [row('1', '10.00', { jurisdiction: null }), row('2', '10.00', { contractMatches: 2, dni: null, name: null }), row('3', '-5.00'), row('4', '1.00', { name: 'ŁUKASZ' }), row('5', '1.00')] }));
  assert.equal(file.lines.length, 1);
  assert.deepEqual(file.review.map(r => [r.legajo, r.reasons.join('|')]), [['1', 'sin jurisdicción'], ['2', 'más de una persona para el legajo'], ['3', 'importe negativo'], ['4', 'nombre con caracteres fuera de Windows-1252']]);
  assert.throws(() => entityExportResponse({ ...base, rows: [{ ...row('1', '10'), amount: '10' }] }), /Fila de exportación inválida/);
});

test('API: strict parameters, session gate and a clear 503 until migration 223 is installed', async () => {
  const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id, membershipId: id, effectiveCapabilities: ['payroll.read', 'workforce.employee.read'] } };
  const session = { email: 'qa@example.invalid', id, version: 1, releaseSha: 'a'.repeat(40) };
  assert.equal((await internalPayrollEntityExport({}, { query: { resource: 'payrollentityexport', datasetId: id, concept: '0638' } }, principal, session)).status, 400);
  assert.equal((await internalPayrollEntityExport({}, { query: { resource: 'payrollentityexport', datasetId: id } }, { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: ['payroll.read'] } }, session)).status, 403);
  const missing = await internalPayrollEntityExport({ query: async () => { throw Object.assign(new Error('function payroll_entity_export_v1(...) does not exist'), { code: '42883' }); } }, { query: { resource: 'payrollentityexport', datasetId: id } }, principal, session);
  assert.deepEqual([missing.status, missing.payload.code], [503, 'PAYROLL_ENTITY_EXPORT_NOT_INSTALLED']);
  const ok = await internalPayrollEntityExport({ query: async (text, params) => { assert.match(text, /payroll_entity_export_v1\(\$1,\$2::uuid,\$3::integer,\$4,\$5::uuid,\$6::uuid,\$7::uuid,\$8\)/); assert.equal(params[7], '638'); return [{ result: { ...base, rows: [row('571', '1.00')] } }]; } }, { query: { resource: 'payrollentityexport', datasetId: id, concept: '638' } }, principal, session);
  assert.equal(ok.status, 200); assert.equal(ok.payload.data.rows.length, 1);
});

test('223 is additive, session-bound and shipped with the build file set', () => {
  const sql = fs.readFileSync('scripts/migrations/223-payroll-entity-export.sql', 'utf8');
  assert.match(sql, /RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_OBJECT_CONFLICT'/);
  assert.match(sql, /action_center_assert_tenant_read_session_v2\(p_email,p_session,p_version,p_release,p_tenant,p_membership\)/);
  assert.match(sql, /action_center_context_has_capability\(ctx,'payroll\.read'\) OR NOT action_center_context_has_capability\(ctx,'workforce\.employee\.read'\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.payroll_entity_export_v1\(text,uuid,integer,text,uuid,uuid,uuid,text\) TO municontrol_actions_runtime_app;/);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE FROM|DROP|ALTER TABLE)\b/);
  assert.match(fs.readFileSync('.vercelignore', 'utf8'), /^!scripts\/migrations\/223-payroll-entity-export\.sql$/m);
  assert.match(fs.readFileSync('assets/payroll-source-reports.js', 'utf8'), /entityExport\.setDataset\(d\.datasetId\)/);
});
