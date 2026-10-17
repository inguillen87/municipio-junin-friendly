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

// The actual detail renderer runs here. Only unrelated detail sections are stubbed.
const nativeActionRead = ['workforce.employee.read', 'payroll.novelty.read', 'payroll.novelty.nominal.read'];
const nativeActionCaps = [...nativeActionRead, 'payroll.novelty.prepare', 'payroll.fixed.prepare'];
const nativeActionId = 'ABCDEF12-3456-0789-ABCD-123456789ABC';
const nativeActionLabels = ['Preparar novedad mensual', 'Abrir novedades fijas'];
function dashboardFunction(html, name) {
  const start = html.indexOf('      function ' + name + '(');
  if (start < 0) return '';
  const next = html.indexOf('\n      function ', start + 1);
  assert.ok(next > start, 'The complete real dashboard function has a following declaration.');
  return html.slice(start, next);
}
async function nativeDetailActions({employee = {}, capabilities = nativeActionCaps} = {}) {
  const html = process.env.MC_NATIVE_ACTIONS_HTML
    ? await readFile(process.env.MC_NATIVE_ACTIONS_HTML, 'utf8') : await read('internal-dashboard.html');
  class Element {
    constructor(tag, className = '', content = '') { Object.assign(this, {tag, className, content, children: [], attrs: {}, dataset: {}, listeners: new Map(), connected: true, parentElement: null, disabled: false}); }
    get isConnected() { return this.connected && (!this.parentElement || this.parentElement.isConnected); }
    set isConnected(value) { this.connected = value; }
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { for (const node of this.children) node.connected = false; this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    clickLate() { for (const listener of this.listeners.get('click') ?? []) listener({type:'click'}); }
    querySelector() { return null; }
  }
  const listeners = new Map(), navigations = [], effects = [];
  const document = {hidden:false, addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); }, removeEventListener(type, listener) { listeners.get(type)?.delete(listener); }};
  const forbidden = name => () => { effects.push(name); throw Error('Unexpected native action side effect: ' + name); };
  const current = {recordOrigin:'MUNICONTROL', contractId:nativeActionId, legajo:'MC-ALFA/2026 Ñ', nombre:'Persona sintética QA', ...employee};
  const els = {dialogTitle:new Element('h2'), dialogSubtitle:new Element('p'), dialogBody:new Element('div'), employeeDialog:{open:true}};
  const context = {Set, URL, document, els, create:(...args)=>new Element(...args), state:{tenantCapabilities:new Set(capabilities)}, location:{assign:url=>navigations.push(url)}, crosswalkDisplay:()=>({label:'Sin vínculo histórico'}), statusDisplay:()=>({label:'Registro propio'}), formatDate:value=>String(value??''), detailField:()=>new Element('div','ancillary-field'), detailSection:()=>new Element('section','ancillary-detail'), renderNativeEmploymentChangeSection:()=>new Element('section','ancillary-employment'), renderFamilySection:()=>new Element('section','ancillary-family'), focusFamilySection:()=>{}, renderEmployeeQuickActions:forbidden('generic GRH quick actions'), renderEmployeePayrollHistory:forbidden('historical payroll'), startPayrollNovelty:forbidden('legacy novelty handoff'), writeOperationalHandoff:forbidden('storage handoff'), fetch:forbidden('fetch'), requestJSON:forbidden('requestJSON'), sessionStorage:{setItem:forbidden('sessionStorage')}, localStorage:{setItem:forbidden('localStorage')}};
  const actualText = dashboardFunction(html,'text'); assert.ok(actualText,'Use the real dashboard text helper.');
  vm.runInNewContext(actualText + '\n' + dashboardFunction(html,'renderNativeEmployeeActions') + '\n' + dashboardFunction(html,'renderEmployeeDetail') + '\nglobalThis.mountNativeDetail = renderEmployeeDetail;', context);
  context.mountNativeDetail({employee:current, personas:{status:'not_applicable'}, meta:{}, family:[], absences:[], leaves:[], movements:[]});
  const walk = node => [node, ...node.children.flatMap(walk)];
  const button = label => { const found=walk(els.dialogBody).find(node=>node.tag==='button'&&node.content===label); assert.ok(found,'The actual MUNICONTROL detail branch mounts ' + label); return found; };
  return {employee:current, context, document, els, listeners, navigations, effects, button, nodes:()=>walk(els.dialogBody), emit:(type,detail)=>{for (const listener of [...listeners.get(type)??[]]) listener({type,detail});}};
}

test('ficha propia monta ambas acciones reales y conserva el UUID amplio y el legajo alfanumérico', async () => {
  const h=await nativeDetailActions(), before=structuredClone(h.employee);
  assert.ok(h.nodes().some(node=>node.content==='Consultá o prepará las novedades de este legajo.'));
  for (const label of nativeActionLabels) { const button=h.button(label); assert.equal(button.disabled,false); assert.equal(button.title,'Abrir novedades de este legajo'); button.clickLate(); }
  const expected=[['monthlyContractId','nativeMonthlyPanel'],['fixedContractId','fixedNovelties']];
  for (const [index,[parameter,fragment]] of expected.entries()) {
    const url=new URL(h.navigations[index],'https://fixture.invalid/');
    assert.equal(url.pathname,'/novedades-nomina.html'); assert.deepEqual([...url.searchParams],[[parameter,nativeActionId]]); assert.equal(url.hash,'#'+fragment);
    assert.equal(h.navigations[index],'novedades-nomina.html?'+parameter+'='+encodeURIComponent(nativeActionId)+'#'+fragment);
  }
  assert.deepEqual(h.employee,before); assert.deepEqual(h.effects,[]); assert.ok(h.navigations.every(url=>!url.includes('legajo')&&!url.includes('source')&&!url.includes('MC-ALFA')));
});

test('ficha propia exige cada permiso base y separa la preparación mensual de la fija', async () => {
  for (const missing of nativeActionCaps) {
    const h=await nativeDetailActions({capabilities:nativeActionCaps.filter(capability=>capability!==missing)});
    for (const [index,label] of nativeActionLabels.entries()) {
      const denied=nativeActionRead.includes(missing)||missing===(index===0?'payroll.novelty.prepare':'payroll.fixed.prepare');
      const button=h.button(label); assert.equal(button.disabled,denied,missing+' / '+label); button.clickLate();
    }
    assert.equal(h.navigations.length,nativeActionRead.includes(missing)?0:1); assert.deepEqual(h.effects,[]);
  }
});

test('ficha propia rechaza UUID ausente, cero o malformado sin completar una identidad', async () => {
  for (const contractId of [undefined,null,'','00000000-0000-0000-0000-000000000000','1234',nativeActionId+' ','../'+nativeActionId]) {
    const h=await nativeDetailActions({employee:{contractId}});
    for (const label of nativeActionLabels) { const button=h.button(label); assert.equal(button.disabled,true); button.clickLate(); }
    assert.deepEqual(h.navigations,[]); assert.deepEqual(h.effects,[]);
  }
});

test('ficha propia revalida el mismo contrato y origen al recibir un click tardío', async () => {
  for (const mutate of [employee=>{employee.contractId='11111111-2222-3333-4444-555555555555';},employee=>{employee.contractId=null;},employee=>{employee.recordOrigin='GRH';},employee=>{employee.recordOrigin='grh';},employee=>{delete employee.recordOrigin;}]) {
    const h=await nativeDetailActions(); const buttons=nativeActionLabels.map(h.button); mutate(h.employee); buttons.forEach(button=>button.clickLate());
    assert.deepEqual(h.navigations,[]); assert.deepEqual(h.effects,[]);
  }
});

test('ficha propia bloquea clicks tardíos al ocultarse, desconectarse o cerrar el diálogo', async () => {
  for (const invalidate of [h=>{h.document.hidden=true;},h=>{h.els.employeeDialog.open=false;},h=>{h.els.dialogBody.isConnected=false;}]) {
    const h=await nativeDetailActions(); const buttons=nativeActionLabels.map(h.button); invalidate(h); buttons.forEach(button=>button.clickLate());
    assert.deepEqual(h.navigations,[]); assert.deepEqual(h.effects,[]);
  }
});

test('ficha propia retira autoridad ante Set o array vacío y un evento sin permisos verificables', async () => {
  for (const tenantCapabilities of [new Set(),[],undefined,null,{},'payroll.novelty.prepare']) {
    const h=await nativeDetailActions(); const buttons=nativeActionLabels.map(h.button);
    h.emit('municontrol:capabilities-ready',{tenantCapabilities});
    for (const button of buttons) { assert.equal(button.disabled,true); button.clickLate(); }
    assert.deepEqual(h.navigations,[]); assert.deepEqual(h.effects,[]);
  }
});

test('ficha propia acepta Set y array vigentes sin depender de permisos globales obsoletos', async () => {
  for (const shape of [values=>new Set(values),values=>values]) {
    const h=await nativeDetailActions({capabilities:[]}); const buttons=nativeActionLabels.map(h.button);
    h.emit('municontrol:capabilities-ready',{tenantCapabilities:shape(nativeActionCaps)});
    for (const button of buttons) { assert.equal(button.disabled,false); button.clickLate(); }
    assert.equal(h.navigations.length,2); assert.equal(h.context.state.tenantCapabilities.size,0);
    h.emit('municontrol:capabilities-ready',{tenantCapabilities:shape([...nativeActionRead,'payroll.fixed.prepare'])});
    assert.equal(buttons[0].disabled,true); assert.equal(buttons[1].disabled,false);
  }
});

test('ficha propia limpia sus listeners al cierre y no recupera autoridad con un evento posterior', async () => {
  const h=await nativeDetailActions(), buttons=nativeActionLabels.map(h.button);
  assert.equal(h.listeners.get('municontrol:capabilities-ready').size,1); assert.equal(h.listeners.get('mc:native-employment-change-close').size,1);
  h.emit('mc:native-employment-change-close');
  assert.equal(h.listeners.get('municontrol:capabilities-ready').size,0); assert.equal(h.listeners.get('mc:native-employment-change-close').size,0);
  h.emit('municontrol:capabilities-ready',{tenantCapabilities:new Set(nativeActionCaps)});
  for (const button of buttons) { assert.equal(button.disabled,true); button.clickLate(); }
  assert.deepEqual(h.navigations,[]); assert.deepEqual(h.effects,[]);
});

test('continuidad mensual y fija usa los mismos destinos del accepted real del alta previa', async () => {
  const source=await read('assets/native-employee-create.js'), start=source.indexOf(' function accepted(receipt){'), end=source.indexOf('\n async function dispatch(',start);
  assert.ok(start>=0&&end>start);
  const links=new Map(), node=selector=>{if(!links.has(selector))links.set(selector,{replaceChildren(){}});return links.get(selector);};
  const events=[], validation=[];
  const context={pending:{body:{draft:{}},scopeKey:'own-scope'},prepared:{},form:{reset(){}},button:{},context:{scope:{}},employeeReceipt:(receipt)=>validation.push(receipt.contractId),employeeScopeKey:()=> 'own-scope',show(){},message(){},$:node,document:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.acceptedReal = accepted;',context);
  context.acceptedReal({origin:'MUNICONTROL',accountCreated:false,payrollCalculated:false,contractId:nativeActionId,name:'Persona sintética QA',legajo:'MC-ALFA/2026 Ñ',startDate:'2026-10-31',jurisdictionCode:'42'});
  const h=await nativeDetailActions(); nativeActionLabels.forEach(label=>h.button(label).clickLate());
  for (const [index,selector] of ['[data-ne-monthly]','[data-ne-fixed]'].entries()) assert.equal(new URL(h.navigations[index],'https://fixture.invalid/').href,new URL(node(selector).href,'https://fixture.invalid/').href);
  assert.deepEqual(validation,[nativeActionId]); assert.equal(events[0].type,'mc:native-employee-created'); assert.equal(events[0].detail.contractId,nativeActionId); assert.deepEqual(h.effects,[]);
});

test('continuidad mensual conserva el contrato UUID y los consumidores ya existentes sin vía GRH', async () => {
  const monthly=await read('assets/payroll-novelty-workbench.js'), fixed=await read('assets/payroll-fixed-novelties.js');
  const declaration=monthly.match(/^const CONTRACT_UUID = (.+);$/m); assert.ok(declaration);
  const uuid=vm.runInNewContext(declaration[1]); assert.equal(uuid.test(nativeActionId),true); assert.equal(uuid.test('00000000-0000-0000-0000-000000000000'),false);
  assert.match(monthly,/searchParams\.get\('monthlyContractId'\)/); assert.match(monthly,/requestedMonthlyContract && CONTRACT_UUID\.test\(requestedMonthlyContract\).*chooseMonthlySubject\(requestedMonthlyContract\)/);
  assert.match(fixed,/searchParams\.get\('fixedContractId'\)/);
});
