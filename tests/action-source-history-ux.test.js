import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { actionSourceFixture } from './fixtures/action-history-synthetic.js';

const html = fs.readFileSync(new URL('../centro-acciones.html', import.meta.url), 'utf8');
const sourceHelpers = html.slice(html.indexOf('function normalizeSourceContext'), html.indexOf('function normalizeAction'));
const panelHelper = html.slice(html.indexOf('function commandPanelContext'), html.indexOf('function renderCommandPanel'));
const commandHelper = html.slice(html.indexOf('function commandAllowed'), html.indexOf('function approvalEvidenceOptions'));
function model() {
  const context = vm.createContext({ Intl, Date, Number, Object,
    object: value => value && typeof value === 'object' && !Array.isArray(value) ? value : {},
    isNominalProjection: value => ['nominal', 'restricted_nominal'].includes(value),
    overtimeNextAction: () => 'Validación independiente de Contaduría', capabilityForCommand: () => true });
  vm.runInContext(sourceHelpers + panelHelper + commandHelper, context);
  return context;
}
test('procedencia conserva microsegundos y diferencia fecha del respaldo de la fecha de acción', () => {
  const m = model(), value = actionSourceFixture();
  assert.equal(JSON.stringify(m.normalizeSourceContext({ sourceContext: value })), JSON.stringify(value));
  assert.match(m.sourceDate(value.sourceCutoffAt), /31\/07\/2026.*23:30/);
  assert.equal(m.normalizeSourceContext({}), null, 'DTO previo conserva compatibilidad explícita');
});
for (const value of [null, {}, { ...actionSourceFixture(), status: 'unknown' }, { ...actionSourceFixture(), personalName: 'PRIVATE_MARKER' }, { ...actionSourceFixture(), sourceCutoffAt: 'bad' }]) {
  test('procedencia inválida bloquea comandos sin reflejar campos recibidos ' + JSON.stringify(value), () => {
    const m = model(), sourceContext = m.normalizeSourceContext({ sourceContext: value });
    assert.equal(sourceContext.status, 'unverified');
    assert.equal(m.commandAllowed({ sourceContext, allowedCommands: ['approve'] }, 'approve'), false);
    assert.doesNotMatch(JSON.stringify(sourceContext), /PRIVATE_MARKER|bad/);
  });
}
for (const type of ['leave_request', 'overtime_entry']) for (const status of ['draft', 'submitted', 'approved', 'rejected', 'cancelled']) {
  test(type + ' ' + status + ' histórico no se convierte en otro estado ni aconseja aprobación', () => {
    const m = model(), action = { type, status, sourceContext: actionSourceFixture(), allowedCommands: ['approve', 'submit', 'cancel'] };
    assert.equal(m.actionNextStep(action), 'Consultar historial');
    assert.equal(m.commandAllowed(action, 'approve'), false);
    assert.equal(m.commandPanelContext(action, ['approve']).title, 'Respaldo anterior · Sólo consulta');
    assert.equal(action.status, status);
  });
}
test('actual permite sólo comandos informados; fallo de actualización bloquea incluso comandos previos', () => {
  const m = model(), detail = { type: 'leave_request', status: 'submitted', sourceContext: actionSourceFixture('current'), allowedCommands: ['approve'] };
  assert.equal(m.commandAllowed(detail, 'approve'), true);
  assert.equal(m.commandAllowed(detail, 'cancel'), false);
  detail.revalidationRequired = true;
  assert.equal(m.commandAllowed(detail, 'approve'), false);
  assert.equal(m.actionNextStep(detail), 'Actualizar detalle antes de continuar');
});
test('script conserva sintaxis válida y revalida permiso al ejecutar una transición', () => {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2]);
  assert.match(html, /if \(!commandAllowed\(detail,command\)\)/);
});
