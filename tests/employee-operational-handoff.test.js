import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

async function quickActions(employee, capabilities = ['workforce.employee.read', 'payroll.read', 'payroll.novelty.prepare']) {
  const html = await read('internal-dashboard.html');
  const body = html.slice(html.indexOf('function renderEmployeeQuickActions(employee)'), html.indexOf('function currentMonthValue()'));
  class Element {
    constructor(tag, className, content) { Object.assign(this, {tag, className, content, children: [], listeners: {}, attrs: {}, dataset: {}, isConnected: true}); }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelectorAll() { return this.children.filter(n => n.tag === 'button' && n.disabled); }
  }
  const handoffs = [], navigations = [];
  const context = {
    create: (...args) => new Element(...args), text: value => value == null ? '' : String(value),
    state: {tenantCapabilities: new Set(capabilities)}, els: {dialogBody: new Element('div')},
    document: {getElementById: () => null}, writeOperationalHandoff: (key, payload) => { handoffs.push({key, payload}); return true; },
    LEAVE_PREVIEW_HANDOFF_KEY: 'leave', ACTION_SUBJECT_HANDOFF_KEY: 'request',
    location: {assign: url => navigations.push(url)}, startPayrollNovelty: () => {}, toast: () => {}, requestJSON: () => {},
  };
  vm.runInNewContext(body + '\nglobalThis.render = renderEmployeeQuickActions;', context);
  const section = context.render(employee), actions = section.children.find(n => n.className === 'button-row');
  return {section, actions, context, handoffs, navigations, button: label => actions.children.find(n => n.content === label)};
}

const leaveEmployee = origin => ({recordOrigin: origin, companyId: '101', legajo: '1234', contractId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});

test('un legajo propio no abre consultas de licencias históricas ni escribe un handoff por coincidencia numérica', async () => {
  const employee = leaveEmployee('MUNICONTROL'), before = structuredClone(employee), h = await quickActions(employee);
  for (const label of ['Estimar referencia anual', 'Nueva solicitud de licencia']) {
    const button = h.button(label);
    assert.equal(button.disabled, true);
    assert.match(button.title, /legajo propio.*no están habilitadas/);
    assert.equal(button.attrs['aria-describedby'], 'employeeQuickActionsAvailability');
    button.listeners.click();
  }
  assert.equal(h.handoffs.length, 0); assert.equal(h.navigations.length, 0);
  assert.deepEqual(employee, before);
  assert.equal(h.button('Cargar novedad').disabled, false);
  assert.equal(h.button('Hijos y certificados').disabled, undefined);
});

for (const origin of [undefined, null, 'DESCONOCIDO', 'grh']) {
  test(`origen no verificado ${String(origin)} no se convierte en contrato histórico al iniciar una licencia`, async () => {
    const h = await quickActions(leaveEmployee(origin));
    for (const label of ['Estimar referencia anual', 'Nueva solicitud de licencia']) {
      const button = h.button(label); assert.equal(button.disabled, true); assert.match(button.title, /verificar el origen/); button.listeners.click();
    }
    assert.equal(h.handoffs.length, 0); assert.equal(h.navigations.length, 0);
  });
}

test('el contrato GRH explícito conserva ambos accesos existentes y los valores privados exactos', async () => {
  const h = await quickActions(leaveEmployee('GRH'));
  for (const label of ['Estimar referencia anual', 'Nueva solicitud de licencia']) { assert.equal(h.button(label).disabled, false); h.button(label).listeners.click(); }
  assert.equal(JSON.stringify(h.handoffs), JSON.stringify([{key:'leave',payload:{companyId:'101',legajo:'1234'}},{key:'request',payload:{query:'1234'}}]));
  assert.deepEqual(h.navigations, ['licencias-control.html#preview', 'centro-acciones.html']);
});

for (const invalidation of ['revoked', 'closed']) {
  test(`retirar acceso o cerrar ficha (${invalidation}) impide un handoff tardío de licencias`, async () => {
    const h = await quickActions(leaveEmployee('GRH'));
    if (invalidation === 'revoked') h.context.state.tenantCapabilities.clear(); else h.section.isConnected = false;
    h.button('Estimar referencia anual').listeners.click(); h.button('Nueva solicitud de licencia').listeners.click();
    assert.equal(h.handoffs.length, 0); assert.equal(h.navigations.length, 0);
  });
}

test('la ficha convierte el legajo en punto de partida operativo sin exponerlo en URL', async () => {
  const html = await read('internal-dashboard.html');
  assert.match(html, /Gestión rápida del legajo/);
  assert.match(html, /Estimar referencia anual/);
  assert.match(html, /Nueva solicitud de licencia/);
  assert.match(html, /LEAVE_PREVIEW_HANDOFF_KEY/);
  assert.match(html, /ACTION_SUBJECT_HANDOFF_KEY/);
  assert.match(html, /sessionStorage\.setItem\(key/);
  assert.match(html, /location\.assign\('licencias-control\.html#preview'\)/);
  assert.match(html, /location\.assign\('centro-acciones\.html'\)/);
  assert.doesNotMatch(html, /location\.assign\([^\n]*(?:companyId|legajo|contractId)/);
  assert.doesNotMatch(html, /localStorage/);
});

test('licencias consume el traspaso una sola vez y ejecuta el motor existente', async () => {
  const html = await read('licencias-control.html');
  assert.match(html, /function consumePreviewHandoff/);
  assert.match(html, /sessionStorage\.removeItem\(LEAVE_PREVIEW_HANDOFF_KEY\)/);
  assert.match(html, /HANDOFF_MAX_AGE_MS/);
  assert.match(html, /el\.previewForm\.requestSubmit\(\)/);
  assert.match(html, /resource:\s*'leavepreview'/);
  assert.doesNotMatch(html, /localStorage/);
});

test('Centro de acciones consume el legajo y conserva la búsqueda privada por POST', async () => {
  const html = await read('centro-acciones.html');
  assert.match(html, /function consumeActionSubjectHandoff/);
  assert.match(html, /sessionStorage\.removeItem\(ACTION_SUBJECT_HANDOFF_KEY\)/);
  assert.match(html, /openWizard\(\)/);
  assert.match(html, /searchAuthorizedSubjects\(\)/);
  assert.match(html, /command:\s*'search_subjects'/);
  assert.match(html, /method:\s*'POST'/);
  assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)\(ACTION_SUBJECT_HANDOFF_KEY/);
});

test('los scripts inline modificados conservan sintaxis JavaScript válida', async () => {
  for (const file of ['internal-dashboard.html', 'licencias-control.html', 'centro-acciones.html']) {
    const html = await read(file);
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: file });
    }
  }
});
