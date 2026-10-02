import {TimeCatalogReviewSession, catalogCivilDate, catalogPageLabel, CATALOG_KIND_LABELS as kinds, CATALOG_STATUS_LABELS as statuses,
  CATALOG_COMMAND_LABELS as commands, CATALOG_REASON_LABELS as reasons} from './time-catalog-review-model.js';
import {TIME_CATALOG_REASONS, timeCatalogExact, timeCatalogCommand} from './time-catalog-contract.js';
import {TimeCatalogEditor} from './time-catalog-editor.js';
import {restoreBulkAssignmentAttempt} from './time-catalog-bulk-assignment.js';
import {restoreAssignmentDecisionAttempt} from './time-catalog-bulk-decision.js';
import {TimeCatalogBulkDecisionUi} from './time-catalog-bulk-decision-ui.js';

const model = new TimeCatalogReviewSession(), byId = id => document.getElementById(id);
const nodes = Object.fromEntries(['refresh', 'message', 'workspace', 'countCalendar', 'countShift', 'countRules', 'countAssignments', 'countSubmitted',
  'showSubmitted', 'filters', 'kind', 'status', 'records', 'empty', 'pageCount', 'previous', 'next', 'detail', 'closeDetail', 'detailTitle', 'facts',
  'configuration', 'audit', 'timeline', 'auditLimit', 'detailMessage', 'decision', 'command', 'reasonCode', 'reason', 'approvalField', 'approval',
  'send', 'recovery', 'retry', 'consultAttempt', 'recoveryCopy', 'preparation', 'newKind', 'newDraft', 'editDraft', 'readCurrent',
  'editorDialog', 'editorForm', 'editorTitle', 'editorFields', 'editorReasonCode', 'editorReason', 'editorMessage', 'saveDraft', 'closeEditor',
  'bulkReview', 'bulkSummary', 'bulkTargets', 'bulkConfirmed', 'bulkResults'].map(id => [id, byId(id)]));
const active = new Set(), weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const dayKinds = {working: 'Laborable', non_working: 'No laborable', holiday: 'Feriado', special: 'Especial'};
const intervalKinds = {work: 'Trabajo', break: 'Pausa', on_call: 'Guardia'};
const valueKinds = {integer: 'Entero', decimal: 'Decimal', boolean: 'Sí / No', time: 'Horario', code: 'Código'};
let offset = 0, busy = false, focusBeforeDetail = null;
let bulkReview = null, bulkAttempt = null, bulkSending = false, bulkStop = false;
const editor = new TimeCatalogEditor({container: nodes.editorFields, session: model, catalogRead: q => request(q),
  directoryRead: url => request(null, null, url), changed: () => { if(!bulkSending)clearBulkReview();if (model.scope) controls(); },
  failed: e => { if (!(e instanceof StaleRead) && model.scope) editorNotice(e.message); }});
const assignmentDecisions=new TimeCatalogBulkDecisionUi({model,request,isLocked:()=>busy||Boolean(model.pending||bulkAttempt),
  lock:value=>{busy=value;controls();},remember:attempt=>{bulkAttempt=attempt;},
  pending:error=>{renderDetail();nodes.detail.showModal();notice('Se detuvieron las siguientes decisiones. Recuperá sólo el intento original.',true);notice(error.message,true,true);},
  finish:async text=>{await readList();renderSummary();notice(text);},
  failed:error=>{if(!model.scope)wipe(error.message);else if(!(error instanceof StaleRead))notice(error.message,true);}});
function editorNotice(text) { nodes.editorMessage.textContent = text; nodes.editorMessage.hidden = !text; nodes.editorMessage.classList.toggle('error', Boolean(text)); }
const make = (tag, value, className) => { const n = document.createElement(tag); if (value !== undefined) n.textContent = String(value); if (className) n.className = className; return n; };
function notice(text, error = false, detail = false) {
  const node = detail ? nodes.detailMessage : nodes.message; node.textContent = text; node.classList.toggle('error', error); node.hidden = !text;
}
function wipe(text) {
  assignmentDecisions.clear();
  bulkReview=null;bulkSending=false;nodes.bulkReview.hidden=true;nodes.bulkTargets.replaceChildren();nodes.bulkConfirmed.checked=false;nodes.bulkResults.replaceChildren();
  model.invalidate(); active.forEach(c => c.abort()); active.clear(); busy = false;
  nodes.detail.close(); nodes.decision.reset(); nodes.command.replaceChildren(); nodes.reasonCode.replaceChildren();
  nodes.editorDialog.close(); editor.clear(); nodes.editorForm.reset(); nodes.editorReasonCode.replaceChildren(); editorNotice('');
  ['records', 'facts', 'configuration', 'timeline'].forEach(id => nodes[id].replaceChildren());
  nodes.workspace.hidden = true; nodes.decision.hidden = true; nodes.recovery.hidden = true;
  nodes.detailTitle.textContent = ''; notice('', false, true); nodes.refresh.disabled = false; nodes.refresh.textContent = 'Verificar acceso y actualizar';
  notice(text, true);
}
class StaleRead extends Error {}
async function request(query = null, attempt = null, directoryUrl = null) {
  if (document.hidden) throw new StaleRead();
  const generation = model.generation, controller = new AbortController(); active.add(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(directoryUrl || '/api/internal-time-catalog' + (query ? '?' + new URLSearchParams(query) : ''), {
      method: attempt ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: {Accept: 'application/json', 'Cache-Control': 'no-store', ...(attempt ? {'Content-Type': 'application/json', 'Idempotency-Key': attempt.key} : {})},
      ...(attempt ? {body: attempt.body} : {}),
    });
    if (generation !== model.generation || document.hidden) throw new StaleRead();
    let payload; try { payload = await response.json(); } catch { throw new Error('La respuesta no pudo confirmarse.'); }
    if (generation !== model.generation || document.hidden) throw new StaleRead();
    if ([401, 403].includes(response.status) || payload?.code === 'TIME_CATALOG_SCOPE_CHANGED') {
      wipe('El acceso cambió o fue retirado. Se retiraron los datos. Volvé a verificar la sesión.'); throw new StaleRead();
    }
    if (!response.ok) {
      // Display only this endpoint's safe contract, never a proxy/HTML error.
      const text = typeof payload?.error === 'string' && /^TIME_CATALOG_[A-Z_]+$/.test(payload?.code || '')
        ? payload.error : 'No se confirmó la operación. Conservá el mismo envío antes de reintentar.';
      throw new Error(text);
    }
    if (directoryUrl) return payload;
    if (!timeCatalogExact(payload, ['ok', 'data']) || payload.ok !== true) throw new Error('La respuesta no pudo verificarse.');
    return payload.data;
  } catch (e) {
    if (e instanceof StaleRead || generation !== model.generation || document.hidden) throw new StaleRead();
    if (['TypeError', 'AbortError'].includes(e.name)) throw new Error('No se confirmó la respuesta. Si enviaste una decisión, conservá el mismo intento.');
    throw e;
  } finally { clearTimeout(timer); active.delete(controller); }
}
function controls() {
  const pending = Boolean(model.pending || bulkAttempt), locked = busy || pending;
  assignmentDecisions.controls(locked);
  nodes.refresh.disabled = busy; nodes.refresh.textContent = pending ? 'Retomar envío sin confirmación' : 'Verificar acceso y actualizar';
  nodes.filters.querySelectorAll('button,select').forEach(n => n.disabled = locked);
  nodes.showSubmitted.disabled = locked;
  nodes.previous.disabled = locked || offset === 0; nodes.next.disabled = locked || !model.page?.hasMore || offset + 25 > 100000;
  nodes.records.querySelectorAll('button').forEach(n => n.disabled = locked);
  nodes.bulkResults.querySelectorAll('button').forEach(n => n.disabled = locked);
  nodes.closeEditor.disabled=busy&&!bulkSending;nodes.closeEditor.textContent=bulkSending?'Detener próximos envíos':'Cerrar';
  nodes.send.disabled = busy; nodes.retry.disabled = busy; nodes.consultAttempt.disabled = busy;
  nodes.decision.querySelectorAll('select,textarea,input').forEach(n => n.disabled = locked);
  nodes.preparation.hidden = !model.permissions.canPropose;
  nodes.newKind.disabled = locked; nodes.newDraft.disabled = locked;
  nodes.newKind.querySelector('option[value="assignment"]').disabled = !model.permissions.canReadAssignments;
  if (!model.permissions.canReadAssignments && nodes.newKind.value === 'assignment') nodes.newKind.value = 'calendar';
  nodes.editDraft.disabled = locked; nodes.readCurrent.disabled = locked;
  nodes.editorForm.querySelectorAll('input,select,textarea,button').forEach(n => {
    if (locked || editor.loading) { if (!n.dataset.locked) { n.dataset.beforeLock=String(n.disabled); n.dataset.locked='true'; } n.disabled=true; }
    else if (n.dataset.locked) { n.disabled=n.dataset.beforeLock==='true'; delete n.dataset.locked; delete n.dataset.beforeLock; }
  });
  if (!locked && !editor.loading) editor.limit(); nodes.saveDraft.disabled = locked || editor.loading;
  nodes.consultAttempt.disabled = busy || (model.pending && JSON.parse(model.pending.body).payload.id === null);
}
function renderSummary() {
  const s = model.summary;
  for (const [id, key] of [['countCalendar', 'calendar'], ['countShift', 'shift'], ['countRules', 'ruleProfile'], ['countAssignments', 'assignment'], ['countSubmitted', 'submitted']]) nodes[id].textContent = String(s[key]);
}
function range(r) { return catalogCivilDate(r.effectiveFrom) + ' → ' + catalogCivilDate(r.effectiveTo); }
function renderList() {
  nodes.records.replaceChildren(); nodes.empty.hidden = model.records.length !== 0;
  model.records.forEach(r => {
    const item = make('article', undefined, 'record'), title = make('div');
    title.append(make('strong', r.reference?.title || kinds[r.kind]), make('small', kinds[r.kind] + ' · Revisión ' + r.revision + ' · Versión ' + r.version));
    const c = r.configuration;
    if (r.kind === 'calendar') title.append(make('small', `${c.days.length} días declarados`));
    if (r.kind === 'shift') title.append(make('small', `${c.intervals.length} tramos declarados`));
    if (r.kind === 'rule_profile') title.append(make('small', `${c.parameters.length} parámetros · ${c.parameters[0].key}`));
    const dates = make('div'); dates.append(make('small', 'Vigencia'), make('span', range(r)));
    const button = make('button', 'Ver configuración'); button.type = 'button';
    button.setAttribute('aria-label', `Ver ${kinds[r.kind].toLowerCase()}, revisión ${r.revision}, desde ${catalogCivilDate(r.effectiveFrom)}`);
    button.addEventListener('click', () => openDetail(r.id));
    item.append(title, dates, make('span', statuses[r.status], 'badge ' + r.status), button);const choice=assignmentDecisions.choice(r);if(choice)item.append(choice);nodes.records.append(item);
  });
  const p = model.page; nodes.pageCount.textContent = catalogPageLabel(p, model.records.length);
  if (p.hasMore && offset + 25 > 100000) nodes.pageCount.textContent += ' · Se alcanzó el límite disponible de consulta. Acotá los filtros.';
  controls();
}
async function readList() {
  const input = {resource: 'list', kind: nodes.kind.value, status: nodes.status.value, limit: '25', offset: String(offset)};
  const data = await request(input); model.list(data, {kind: input.kind, status: input.status, limit: 25, offset}); renderList();
}
async function refresh() {
  if (model.pending) { nodes.detail.showModal(); controls(); return; }
  if (busy || document.hidden) return;
  const generation = model.generation;
  busy = true; controls(); notice('Verificando acceso y catálogo…');
  try {
    model.bootstrap(await request({resource: 'bootstrap'})); renderSummary();
    if(bulkAttempt){
      const command=JSON.parse(bulkAttempt.body).payload;
      if(command.command==='create_draft')restoreBulkAssignmentAttempt(model,bulkAttempt);
      else{model.detail(await request({resource:'detail',id:command.id}),command.id);restoreAssignmentDecisionAttempt(model,bulkAttempt);}
      nodes.workspace.hidden=false;renderDetail();nodes.detail.showModal();notice('Retomá sólo el envío original. Los contratos restantes necesitan una nueva revisión.');return;
    }
    await readList();
    nodes.workspace.hidden = false; notice('');
  } catch (e) { if (!(e instanceof StaleRead)) wipe(e.message || 'No se pudo consultar el catálogo.'); }
  finally { if (generation === model.generation) { busy = false; controls(); } }
}
function fact(label, value) { const n = make('div'); n.append(make('span', label), make('strong', value)); nodes.facts.append(n); }
function configurationRow(title, text) { const n = make('div', undefined, 'config-row'); n.append(make('strong', title), make('span', text)); nodes.configuration.append(n); }
function renderConfiguration(r) {
  const c = r.configuration; nodes.configuration.replaceChildren(); nodes.configuration.append(make('h3', 'Configuración completa'));
  if (r.kind === 'calendar') {
    nodes.configuration.append(make('p', `${c.days.length} días declarados. Los días ausentes no se consideran laborables ni feriados.`, 'hint'));
    c.days.forEach(d => configurationRow(`${catalogCivilDate(d.date)} · ${dayKinds[d.kind]}`, `Código: ${d.code} · ${d.evidencePresent ? 'Huella de evidencia registrada' : 'Sin huella de evidencia'}`));
  } else if (r.kind === 'shift') {
    configurationRow('Tolerancias declaradas', `Entrada: ${c.entryToleranceSeconds} segundos · Salida: ${c.exitToleranceSeconds} segundos`);
    c.intervals.forEach(i => configurationRow(`${weekdays[i.day - 1]} · Tramo ${i.sequence} · ${intervalKinds[i.kind]}`, `${i.start} → ${i.end}${i.crossesMidnight ? ' del día siguiente' : ''}`));
  } else if (r.kind === 'rule_profile') {
    nodes.configuration.append(make('p', 'Los valores y unidades son declaraciones pendientes de evaluación. No se transforman en horas ni importes.', 'hint'));
    c.parameters.forEach(p => {
      const value = p[({integer: 'integerValue', decimal: 'decimalValue', boolean: 'booleanValue', time: 'timeValue', code: 'codeValue'})[p.valueKind]];
      configurationRow(p.key, `${p.valueKind === 'boolean' ? (value ? 'Sí' : 'No') : value} · Unidad declarada: ${p.unitCode} · ${valueKinds[p.valueKind]}`);
    });
  } else {
    configurationRow('Revisiones vinculadas', `Turno: ${c.shiftRevision} · Calendario: ${c.calendarRevision} · Reglas: ${c.ruleProfileRevision}`);
    if (!model.assignment) nodes.configuration.append(make('p', 'No hay un contrato destinatario verificado en este detalle. Consultalo con permiso de acceso al padrón antes de decidir.', 'boundary'));
    else {
      configurationRow('Contrato destinatario', `Legajo ${model.assignment.target.legajo} · ${model.assignment.target.name || 'Nombre no informado'}`);
      for (const key of ['shift','calendar','ruleProfile']) {
        const linked = model.assignment[key]; nodes.configuration.append(make('h3', `${kinds[linked.kind]} · ${linked.reference?.title || 'Sin nombre visible'} · Revisión ${linked.revision}`));
        configurationRow('Vigencia vinculada', range(linked)); configurationRow('Estado de la revisión vinculada',statuses[linked.status]);
        if (key === 'shift') { const s=linked.configuration; configurationRow('Tolerancias', `Entrada ${s.entryToleranceSeconds} s · Salida ${s.exitToleranceSeconds} s`); s.intervals.forEach(i=>configurationRow(`${weekdays[i.day-1]} · ${intervalKinds[i.kind]}`,`${i.start} → ${i.end}${i.crossesMidnight?' del día siguiente':''}`)); }
        if (key === 'calendar') linked.configuration.days.forEach(d=>configurationRow(catalogCivilDate(d.date),`${dayKinds[d.kind]} · ${d.code}${d.evidencePresent?' · Huella registrada':''}`));
        if (key === 'ruleProfile') linked.configuration.parameters.forEach(p=>configurationRow(p.key,`${p[({integer:'integerValue',decimal:'decimalValue',boolean:'booleanValue',time:'timeValue',code:'codeValue'})[p.valueKind]]} · ${p.unitCode}`));
      }
    }
  }
}
function updateDecision() {
  const command = nodes.command.value; nodes.reasonCode.replaceChildren();
  (TIME_CATALOG_REASONS[command] || []).forEach(r => { const n = make('option', reasons[r]); n.value = r; nodes.reasonCode.append(n); });
  nodes.approval.checked = false; nodes.approval.required = command === 'approve'; nodes.approvalField.hidden = command !== 'approve';
  nodes.send.textContent = commands[command] || 'Registrar decisión';
}
function renderDetail() {
  const r = model.selected;
  if (!r) { nodes.detailTitle.textContent = 'Guardar borrador · Envío sin confirmación'; nodes.facts.replaceChildren(); nodes.configuration.replaceChildren(); nodes.timeline.replaceChildren(); nodes.audit.hidden = true; nodes.editDraft.hidden = true; nodes.readCurrent.hidden = true; nodes.decision.hidden = true; nodes.recovery.hidden = !model.pending; nodes.recoveryCopy.textContent = 'Reintentá la misma clave para recuperar el acuse de creación. Consultar la lista no confirma por sí solo este envío.'; controls(); return; }
  nodes.detailTitle.textContent = `${r.reference?.title || kinds[r.kind]} · Revisión ${r.revision}`;
  nodes.facts.replaceChildren(); fact('Estado', statuses[r.status]); fact('Versión registrada', String(r.version)); fact('Vigencia', range(r));
  fact('Horario municipal', 'Mendoza (UTC−3)'); fact('Fuente de referencia', r.sourceLinked ? 'Referencia vinculada' : 'Sin referencia vinculada');
  if (r.reference?.code) fact('Código estable', r.reference.code);
  if (r.reference?.legalReference) fact('Referencia documental', r.reference.legalReference);
  renderConfiguration(r); nodes.audit.hidden = !model.auditAvailable; nodes.auditLimit.hidden = !model.timelineMayBeIncomplete;
  nodes.timeline.replaceChildren(); model.timeline.forEach(e => {
    const li = make('li', commands[e.command] || ({create_draft: 'Borrador creado', update_draft: 'Borrador corregido'})[e.command]);
    li.append(make('span', `${new Intl.DateTimeFormat('es-AR', {timeZone: 'America/Argentina/Mendoza', dateStyle: 'short', timeStyle: 'short'}).format(new Date(e.occurredAt))} · Versión ${e.resultingVersion}`)); nodes.timeline.append(li);
  });
  if (model.auditAvailable && !model.timeline.length) nodes.timeline.append(make('li', 'Sin eventos disponibles.'));
  nodes.decision.reset(); nodes.command.replaceChildren(); const allowed = model.commands();
  allowed.forEach(c => { const option = make('option', commands[c]); option.value = c; nodes.command.append(option); });
  nodes.decision.hidden = !allowed.length; nodes.recovery.hidden = !model.pending;
  nodes.editDraft.hidden = model.editPayload === null || Boolean(model.pending); nodes.readCurrent.hidden = Boolean(model.pending);
  nodes.recoveryCopy.textContent = 'El envío puede haberse registrado. El contenido quedó bloqueado para evitar otra decisión.';
  updateDecision(); notice('', false, true); controls();
}
async function openDetail(id) {
  if (busy || model.pending || document.hidden) return;
  const generation = model.generation;
  focusBeforeDetail = document.activeElement; busy = true; controls();
  try { model.detail(await request({resource: 'detail', id}), id); renderDetail(); nodes.detail.showModal(); nodes.closeDetail.focus(); }
  catch (e) { if (!(e instanceof StaleRead)) wipe(e.message); }
  finally { if (generation === model.generation) { busy = false; controls(); } }
}
async function sendPending() {
  if (busy || document.hidden) return;
  const generation = model.generation;
  busy = true; controls(); notice('Verificando el acceso antes del envío…', false, true);
  try {
    const attempt = model.attempt(); model.bootstrap(await request({resource: 'bootstrap'})); model.attempt();
    const outcome = model.confirm(await request(null, attempt)); if(bulkAttempt){bulkAttempt=null;nodes.bulkResults.replaceChildren(make('p','Se recuperó el comprobante del envío original. Las asignaciones restantes requieren una nueva revisión; no se enviaron automáticamente.'));} renderDetail();
    notice('');
    notice(outcome.historical ? 'Se recuperó el acuse original. Consultá la versión actual antes de otra decisión.' : 'Operación registrada. No genera cálculos ni liquidaciones.', false, true);
    // A historical replay can be older than current state. Do not enable a new
    // decision based on that receipt; obtain a fresh detail first.
    nodes.decision.hidden = true; model.bootstrap(await request({resource:'bootstrap'})); renderSummary(); await readList();
  } catch (e) {
    if (!(e instanceof StaleRead)) {
      if (!model.scope) wipe(e.message);
      else if (model.pending) {
        nodes.decision.hidden = true; nodes.recovery.hidden = false; notice(e.message || 'No se confirmó el envío.', true, true);
        notice('Hay un envío sin confirmación. Retomalo para reintentar o consultar su versión.', true);
      } else notice('La decisión se confirmó; la lista no pudo actualizarse. Volvé a consultar.', true, true);
    }
  } finally { if (generation === model.generation) { busy = false; controls(); } }
}
nodes.refresh.addEventListener('click', refresh);
nodes.filters.addEventListener('submit', async e => {
  e.preventDefault(); if (busy || model.pending) return; offset = 0; await refresh();
});
nodes.showSubmitted.addEventListener('click', () => { if (busy || model.pending) return; nodes.status.value = 'submitted'; offset = 0; refresh(); });
nodes.previous.addEventListener('click', () => { if (busy || model.pending || !offset) return; offset -= 25; refresh(); });
nodes.next.addEventListener('click', () => { if (busy || model.pending || !model.page?.hasMore) return; offset += 25; refresh(); });
nodes.closeDetail.addEventListener('click', () => nodes.detail.close());
nodes.readCurrent.addEventListener('click', () => { if (model.selected) openDetail(model.selected.id); });
function openEditor(editing) {
  if (busy || model.pending || bulkAttempt || !model.permissions.canPropose || document.hidden) return;
  if (editing && !model.editPayload) return;
  const kind = editing ? model.selected.kind : nodes.newKind.value;
  if (kind === 'assignment' && !model.permissions.canReadAssignments) return;
  if (!editing) { model.selected=null; model.editPayload=null; model.assignment=null; model.allowedCommands=[]; }
  nodes.detail.close(); editor.start(kind, editing ? model.editPayload : null, editing ? model.assignment : null);
  clearBulkReview();nodes.bulkResults.replaceChildren();
  nodes.editorTitle.textContent = editing ? 'Corregir borrador' : 'Preparar ' + kinds[kind].toLowerCase();
  nodes.editorReason.value=''; nodes.editorReasonCode.replaceChildren();
  const allowed = editing ? ['draft_corrected'] : ['catalog_onboarding','new_revision'];
  allowed.forEach(c=>{const n=make('option',({draft_corrected:'Corregir configuración',catalog_onboarding:'Registrar configuración',new_revision:'Nueva revisión'})[c]);n.value=c;nodes.editorReasonCode.append(n);});
  editorNotice(''); nodes.editorDialog.showModal(); controls(); editor.fields.title.focus();
}
nodes.newDraft.addEventListener('click',()=>openEditor(false)); nodes.editDraft.addEventListener('click',()=>openEditor(true));
nodes.closeEditor.addEventListener('click',()=>nodes.editorDialog.close());
nodes.editorDialog.addEventListener('close',()=>{if(bulkSending)bulkStop=true;editor.clear();nodes.editorReason.value='';clearBulkReview();});
function clearBulkReview(){bulkReview=null;nodes.bulkReview.hidden=true;nodes.bulkTargets.replaceChildren();nodes.bulkConfirmed.checked=false;nodes.bulkConfirmed.required=false;nodes.saveDraft.textContent=editor.multiple?'Revisar asignaciones':'Guardar borrador';}
for(const event of ['input','change'])nodes.editorForm.addEventListener(event,e=>{if(e.target!==nodes.bulkConfirmed&&!bulkSending)clearBulkReview();});
function renderBulkReview(review){
  nodes.bulkSummary.textContent=`${review.plan.total} contratos · ${catalogCivilDate(review.plan.entries[0].payload.effectiveFrom)} a ${catalogCivilDate(review.plan.entries[0].payload.effectiveTo)}. Cada borrador se confirma por separado; una falla detiene los siguientes. No activa horarios ni calcula horas.`;
  nodes.bulkTargets.replaceChildren();
  for(const row of review.plan.entries){const item=make('li');item.append(make('strong',`${row.target.legajo} · ${row.target.name||'Nombre no informado'}`));item.append(make('span',`Nuevo borrador · Revisión ${row.payload.revision} · ${row.payload.reference.title}`));nodes.bulkTargets.append(item);}
  for(const [key,label] of [['shift','Turno'],['calendar','Calendario'],['ruleProfile','Reglas']]){const r=review.plan.dependencies[key];nodes.bulkTargets.append(make('li',`${label}: ${r.reference?.title||'Sin nombre visible'} · Revisión ${r.revision} · ${catalogCivilDate(r.effectiveFrom)} a ${catalogCivilDate(r.effectiveTo)}`));}
  nodes.bulkReview.hidden=false;nodes.bulkConfirmed.required=true;nodes.saveDraft.textContent='Crear borradores revisados';
}
async function sendBulkAssignments(review,generation){
  bulkSending=true;bulkStop=false;controls();const states=review.plan.entries.map(entry=>({entry,id:null,status:'Sin enviar'}));
  const show=()=>{
    nodes.bulkResults.replaceChildren(make('h3','Resultado de las asignaciones'),make('p',`${states.filter(s=>s.id).length} borradores confirmados de ${states.length}. Cada resultado corresponde a un contrato; ninguno se aprobó.`));
    for(const row of states){
      const item=make('div',undefined,'assignment-result');
      item.append(make('strong',`${row.entry.target.legajo} · ${row.entry.target.name||'Nombre no informado'}`),make('span',row.status));
      if(row.id){
        const button=make('button','Ver borrador '+row.entry.target.legajo);button.type='button';button.disabled=busy||Boolean(model.pending)||Boolean(bulkAttempt);
        button.addEventListener('click',()=>openDetail(row.id));item.append(button);
      }
      nodes.bulkResults.append(item);
    }
  };
  try{
    model.bootstrap(await request({resource:'bootstrap'}));
    if(model.scope!==review.scope||generation!==model.generation||document.hidden)throw new StaleRead();
    for(const row of states){
      if(bulkStop)throw Error('Se detuvieron los próximos envíos. Los borradores ya registrados se conservan; revisá el resultado completo.');
      if(generation!==model.generation||document.hidden)throw new StaleRead();
      model.bootstrap(await request({resource:'bootstrap'}));
      if(model.scope!==review.scope)throw new StaleRead();
      for(const dep of Object.values(review.plan.dependencies)){
        const validator=new TimeCatalogReviewSession();validator.scope=model.scope;validator.permissions={...model.permissions};validator.detail(await request({resource:'detail',id:dep.id}),dep.id);
        if(JSON.stringify(validator.selected)!==JSON.stringify(dep))throw Error('Una configuración cambió desde la revisión. Se detuvieron los envíos; revisá los resultados y consultá nuevamente.');
      }
      if(bulkStop)throw Error('Se detuvieron los próximos envíos. Los borradores ya registrados se conservan; revisá el resultado completo.');
      model.selected=null;model.editPayload=null;model.assignment=null;model.allowedCommands=[];
      const attempt=model.prepareDraft('assignment',row.entry.payload,review.reasonCode,review.reason,crypto.randomUUID());bulkAttempt=attempt;row.status='Envío sin confirmación';
      model.confirm(await request(null,attempt));bulkAttempt=null;row.id=model.selected.id;row.status='Borrador registrado · Vínculo pendiente de consulta';show();
      model.detail(await request({resource:'detail',id:row.id}),row.id);
      if(!model.assignment||model.assignment.target.contractId.toLowerCase()!==row.entry.payload.spec.employmentContractId.toLowerCase()
        || ['shift','calendar','ruleProfile'].some(key=>model.assignment[key].id!==row.entry.payload.spec[key+'EntryId']))throw Error('El borrador se registró, pero su vínculo no pudo conciliarse. Se detuvieron los siguientes; consultá el resultado.');
      row.status='Borrador registrado · Vínculo verificado';show();
    }
    nodes.editorDialog.close();await readList();renderSummary();notice(`${states.length} borradores registrados. Enviá cada uno a revisión y aprobación independiente antes de aplicar su horario.`);show();
  }catch(error){
    if(!model.scope)wipe(error.message);
    else if(!(error instanceof StaleRead)&&generation===model.generation){show();if(model.pending){nodes.editorDialog.close();renderDetail();nodes.detail.showModal();notice('El proceso se detuvo: hay un borrador sin confirmación y no se enviaron los contratos siguientes.',true);notice(error.message,true,true);}else{editorNotice(error.message);notice(error.message,true);}}
  }finally{bulkSending=false;}
}
nodes.editorForm.addEventListener('submit',async e=>{
  e.preventDefault();if(busy || model.pending || bulkAttempt || document.hidden)return;
  const generation=model.generation;busy=true;controls();
  try {
    if(editor.multiple){
      const plan=await editor.bulkPlan();if(generation!==model.generation||document.hidden)return;
      const review={plan,reasonCode:nodes.editorReasonCode.value,reason:nodes.editorReason.value,scope:model.scope};
      timeCatalogCommand({command:'create_draft',kind:'assignment',id:null,expectedVersion:0,payload:plan.entries[0].payload,reasonCode:review.reasonCode,reason:review.reason,scopeVersion:review.scope,manualValidationConfirmed:false});
      if(!bulkReview){bulkReview=review;renderBulkReview(review);return;}
      if(JSON.stringify(review)!==JSON.stringify(bulkReview)||!nodes.bulkConfirmed.checked){clearBulkReview();throw Error('Revisá y confirmá otra vez el conjunto completo.');}
      await sendBulkAssignments(review,generation);return;
    }
    const payload=await editor.payload(); if(generation!==model.generation || document.hidden) return;
    model.prepareDraft(editor.kind,payload,nodes.editorReasonCode.value,nodes.editorReason.value,crypto.randomUUID(),Boolean(editor.original));
    nodes.editorDialog.close(); renderDetail();nodes.detail.showModal();busy=false;await sendPending();
  } catch(error) { if(generation===model.generation)editorNotice(error.message); }
  finally{if(generation===model.generation){busy=false;controls();}}
});
nodes.detail.addEventListener('close', () => { if (focusBeforeDetail?.isConnected) focusBeforeDetail.focus(); });
nodes.command.addEventListener('change', updateDecision);
nodes.decision.addEventListener('submit', e => {
  e.preventDefault(); if (busy || model.pending || document.hidden) return;
  try {
    if (/[\u0000-\u001f\u007f]/.test(nodes.reason.value)) throw new Error('Escribí el fundamento en una sola línea, sin saltos ni tabulaciones.');
    model.prepare(nodes.command.value, nodes.reasonCode.value, nodes.reason.value, nodes.command.value === 'approve' && nodes.approval.checked, crypto.randomUUID());
    sendPending();
  } catch (error) { notice(error.message, true, true); }
});
nodes.retry.addEventListener('click', sendPending);
nodes.consultAttempt.addEventListener('click', async () => {
  if (busy || !model.pending || document.hidden) return;
  const generation = model.generation;
  busy = true; controls();
  try {
    const attempt = model.attempt(), id = JSON.parse(attempt.body).payload.id;
    model.bootstrap(await request({resource: 'bootstrap'})); model.detail(await request({resource: 'detail', id}), id);
    const current = model.selected.version, expected = JSON.parse(attempt.body).payload.expectedVersion;
    if (current <= expected) { notice('La versión consultada todavía no confirma el envío. Conservá el mismo intento.', true, true); return; }
    // A newer state is not proof of which actor/attempt wrote it. Consultations
    // never discard or change the original pending request.
    nodes.recoveryCopy.textContent = `La versión registrada es ${current}. Esto no confirma por sí solo tu envío. Reintentá la misma clave para recuperar su acuse.`;
    renderConfiguration(model.selected); notice('Versión actual consultada. El envío original se conserva.', false, true);
  } catch (e) { if (!(e instanceof StaleRead)) { if (!model.scope) wipe(e.message); else notice(e.message, true, true); } }
  finally { if (generation === model.generation) { busy = false; controls(); } }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) wipe('Se retiraron los datos al ocultar la pantalla. Verificá el acceso para volver a consultar. Si había un envío en curso, consultá su estado.'); });
window.addEventListener('pagehide', () => wipe('La pantalla se cerró. Volvé a verificar el acceso.'));
// Read-only access checks also withdraw an idle open detail on revocation.
// An unavailable check closes the view; it never resends a command.
setInterval(async () => {
  if (busy || document.hidden || !model.scope) return;
  try { model.bootstrap(await request({resource: 'bootstrap'})); }
  catch (e) { if (!(e instanceof StaleRead)) wipe('No se pudo renovar la verificación del acceso. Se retiraron los datos; consultá nuevamente.'); }
}, 30000);
refresh();
