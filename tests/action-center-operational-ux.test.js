import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('el Centro de acciones explica y habilita el circuito RRHH desde capacidades del backend', async () => {
  const html = await read('centro-acciones.html');

  assert.match(html, /Circuito operativo de licencias/);
  for (const command of ['create', 'edit', 'submit', 'cancel']) {
    assert.match(html, new RegExp(`data-workflow-step="${command}"`));
    assert.match(html, new RegExp(`data-workflow-command="${command}"`));
  }
  assert.match(html, /function workflowCapabilities\(\)/);
  assert.match(html, /leave\.request\.area\.update/);
  assert.match(html, /leave\.request\.area\.submit/);
  assert.match(html, /leave\.request\.area\.cancel_pending/);
  assert.match(html, /Habilitado por el backend/);
  assert.match(html, /renderWorkflowGuide\(\)/);
});

test('los atajos sólo abren o filtran y conservan la confirmación dentro del detalle', async () => {
  const html = await read('centro-acciones.html');
  const start = html.indexOf('function openWorkflowQueue');
  const end = html.indexOf('function fact(', start);
  const workflowHandlers = html.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(workflowHandlers, /openWizard\(\)/);
  assert.match(workflowHandlers, /openWorkflowQueue\('draft'\)/);
  assert.match(workflowHandlers, /openWorkflowQueue\('submitted'\)/);
  assert.match(workflowHandlers, /loadActions\(\{ page: 1 \}\)/);
  assert.doesNotMatch(workflowHandlers, /actionCommand\(/);
  assert.match(html, /Editar, enviar y cancelar siempre exigen abrir un caso, validar su versión vigente y confirmar la operación/);
});

test('la observación breve se prepara para persistir con guardrails también en tratamiento restringido', async () => {
  const html = await read('centro-acciones.html');

  assert.match(html, /id="actionEmployeeNote" maxlength="500"/);
  assert.match(html, /MAX_EMPLOYEE_NOTE_LENGTH = 500/);
  assert.match(html, /MAX_RESTRICTED_BRIEF_LENGTH = 500/);
  assert.match(html, /function employeeNoteDecision\(\)/);
  assert.match(html, /SENSITIVE_NOTE_PATTERN\.test\(value\)/);
  assert.match(html, /el\.actionEmployeeNote\.disabled=false/);
  assert.doesNotMatch(html, /el\.actionEmployeeNote\.disabled=restricted/);
  assert.match(html, /sendToBackend:Boolean\(value\)/);
  assert.doesNotMatch(html, /sendToBackend:Boolean\(value&&!restricted\)/);
  assert.match(html, /if\(value\.employeeNoteSendable\)payload\.employeeNote=value\.employeeNote/);
  assert.match(html, /Se incorporará al borrador con tratamiento restringido/);
  assert.doesNotMatch(html, /resumen (?:libre )?no se envi/);
  assert.match(html, /Esta pantalla no adjunta archivos/);
  assert.doesNotMatch(html, /cuando el backend entregue una carga privada/);
});

test('la confirmación final describe el borrador y deja los límites de cálculo como aviso separado', async () => {
  const html = await read('centro-acciones.html');

  assert.match(html, /Confirmo que revisé la persona, el motivo y el período, y que quiero crear esta solicitud como borrador/);
  assert.doesNotMatch(html, /Comprendo que el sistema no calculó/);
  assert.match(html, /Este registro no aprueba una licencia ni modifica nómina\. El sistema no calculó saldo disponible, horas trabajadas ni impacto salarial\./);
  assert.match(html, /validateStep\(3\)/);
  assert.match(html, /actionEmployeeNote\.addEventListener\('input', updateEmployeeNoteField\)/);
});

test('el detalle muestra el siguiente paso y conserva maker-checker desde allowedCommands', async () => {
  const html = await read('centro-acciones.html');
  const start = html.indexOf('function commandPanelContext');
  const end = html.indexOf('function renderPayrollDetail', start);
  const commandPanel = html.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(commandPanel, /Siguiente paso: Enviar a revisión/);
  assert.match(commandPanel, /Aguardando decisión de un aprobador distinto/);
  assert.match(commandPanel, /Quien la preparó o envió no puede autoaprobarla/);
  assert.match(commandPanel, /if\(commandAllowed\(detail,command\)\)availableCommands\.push\(command\)/);
  assert.match(commandPanel, /availableCommands\.forEach/);
  assert.doesNotMatch(commandPanel, /Esta sesión no tiene una decisión habilitada para el estado actual/);
});

test('el script inline del Centro de acciones conserva sintaxis JavaScript válida', async () => {
  const html = await read('centro-acciones.html');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'centro-acciones.html' });
  }
});
