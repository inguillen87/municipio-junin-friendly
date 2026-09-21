import { fixedBootstrap,fixedEmployee,fixedList,fixedDetail,fixedReceipt,fixedExportData,fixedPrincipalKey,fixedCapability,
  fixedForm,fixedText,fixedPeriod,fixedState,fixedCoverage,fixedView,fixedMoney,fixedMoneyInput,FIXED_TYPES } from './payroll-fixed-novelties-model.js';
import { fixedCsv,fixedXlsx } from './payroll-fixed-novelties-export.js';

const ENDPOINT='/api/internal-payroll-fixed-novelties';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,attr,primary=false)=>{const n=node('button',text,'button'+(primary?' primary':''));n.type='button';n.setAttribute('data-fn-'+attr,'');return n;};
const dayLabel=value=>value?new Intl.DateTimeFormat('es-AR',{timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T12:00:00Z')):'Sin informar';
const stamp=value=>dayLabel(value)+' · '+value.slice(11).replace('T',' ');
const hasRead=caps=>['payroll.novelty.read','payroll.novelty.nominal.read'].every(c=>caps.has(c));
function errorMessage(error){
  if(error.status===401)return 'La sesión venció. Ingresá nuevamente antes de continuar.';
  if(error.code==='PAYROLL_FIXED_EMPLOYMENT_REQUIRED')return 'Falta verificar el vínculo laboral del operador. No se crean vínculos automáticamente.';
  if(error.status===403)return 'No tenés permiso vigente para esta operación. Se retiraron los datos consultados.';
  const messages={VERSION_CONFLICT:'Otra persona modificó el registro. Revisá la versión actual; tu propuesta se conserva.',PENDING_EXISTS:'Hay una propuesta pendiente. Consultala antes de preparar otro cambio.',
    OVERLAP:'La vigencia se superpone con otra novedad aprobada del mismo concepto, centro y tipo. Revisá ambas antes de aprobar.',IDENTITY_CHANGED:'Cambió la identidad del legajo. El borrador no se asociará a otra persona.',
    MAKER_CHECKER_REQUIRED:'La revisión debe hacerla otra persona con permiso vigente.',EMPLOYMENT_REQUIRED:'Falta verificar el vínculo laboral del operador. No se crean vínculos automáticamente.',IDEMPOTENCY_REUSE:'La clave pertenece a otros datos. Verificá el intento antes de iniciar otra operación.',
    SNAPSHOT_CHANGED:'Cambió el resultado consultado. Actualizá la consulta antes de exportar.',SESSION_BUSY:'Hay otra operación en curso. Reintentá con los mismos datos.',
    NOT_FOUND:'No se encontró el registro o legajo solicitado.',ROW_LIMIT:'El resultado supera el límite permitido. No se muestra una lista parcial.',CAPACITY_LIMIT:'No hay capacidad disponible para guardar. Los datos del formulario se conservan.',
    LEGACY_RECONCILIATION_REQUIRED:'Hay novedades fijas de un registro anterior pendientes de conciliar. No se guardaron cambios. Hace falta conciliar ese registro antes de continuar.',
    INVALID_PAYLOAD:'Revisá los datos informados. La propuesta se conserva.',DATES_INVALID:'Revisá las fechas de alta y vencimiento.'};
  const suffix=String(error.code||'').replace(/^PAYROLL_FIXED_/,'');
  return messages[suffix]||(error.name==='AbortError'||error.name==='TimeoutError'?'La consulta demoró demasiado. Reintentá.':error.status?'No se pudo completar la operación. Tus datos se conservan.':error instanceof TypeError?'No se pudo conectar. Tus datos se conservan.':error.message||'No se pudo completar la operación.');
}
function save(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function facts(value){
  const dl=node('dl',undefined,'fn-facts');
  const entries=value?[['Concepto declarado',value.conceptSourceId],['Centro de costo',value.costCenterSourceId??'Sin informar'],['Tipo',FIXED_TYPES[value.payrollType]],
    ['Unidades declaradas',value.quantityDecimal??'Sin informar'],['Importe declarado',fixedMoney(value.amountCents)],['Modo forzado',value.forced?'Sí · '+value.forcedReason:'No'],
    ['Alta',dayLabel(value.validFrom)],['Vencimiento',dayLabel(value.validTo)],['Instrumento',value.legalInstrument]]:[];
  for(const[label,text]of entries){const part=node('div');part.append(node('dt',label),node('dd',text));dl.append(part);}return dl;
}

export function mountFixedNovelties(shell){
  if(!shell)return {setAccess(){},setExternalBusy(){},deny(){}};
  const host=shell.querySelector('[data-fixed-host]');let mounted=false,externalBusy=false,busy=false,stopped=false,seq=0,controller=null;
  let bootstrap=null,data=null,detail=null,editor=null,attempt=null,outerKey=null,access=new Set(),page=1;
  const $=s=>host.querySelector(s),available=()=>!stopped&&shell.isConnected&&shell.open;
  const can=cap=>fixedCapability(bootstrap,access,cap);
  const allowedPrepare=()=>can('payroll.fixed.prepare')&&bootstrap.principal.employmentLinked;
  const allowedReview=()=>can('payroll.fixed.approve')&&bootstrap.principal.employmentLinked;
  const selected=()=>fixedView(data,{search:$('[data-fn-search]').value,status:$('[data-fn-filter]').value});
  function status(text){if(mounted)$('[data-fn-status]').textContent=text;}
  function clearConsulted(){
    bootstrap=null;data=null;detail=null;
    if(mounted){$('[data-fn-list]').replaceChildren();$('[data-fn-detail]').replaceChildren();$('[data-fn-detail]').hidden=true;$('[data-fn-count]').textContent='';$('[data-fn-pagination]').hidden=true;}
    if(editor){editor.subject=editor.subject?{contractId:editor.subject.contractId,legajo:editor.subject.legajo,identityToken:editor.subject.identityToken}:null;
      editor.row=editor.row?{id:editor.row.id,version:editor.row.version}:null;editor.form.querySelector('[data-fn-subject]')?.replaceChildren();
      editor.form.querySelector('[data-fn-comparison]')?.replaceChildren();editor.preview=null;editor.form.querySelector('[data-fn-preview-result]')?.replaceChildren();
      editor.form.querySelector('[data-fn-review-source]')?.replaceChildren();
      editor.form.querySelector('h3').textContent='Propuesta local pendiente';}
  }
  function deny(){seq++;controller?.abort();busy=false;clearConsulted();status('Se retiraron los datos consultados. Verificá la sesión y los permisos para continuar.');if(mounted)controls();}
  function clearAll(){deny();editor?.form.reset();editor=null;attempt=null;if(mounted)$('[data-fn-editor]').replaceChildren();}
  function controls(){
    if(!mounted)return;host.setAttribute('aria-busy',String(busy));
    host.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=busy||externalBusy);
    $('[data-fn-new]').hidden=!allowedPrepare();$('[data-fn-new]').disabled=busy||externalBusy||Boolean(editor)||Boolean(attempt);
    for(const format of ['csv','xlsx'])$('[data-fn-'+format+']').disabled=busy||externalBusy||Boolean(editor)||!can('payroll.novelty.export')||!data?.periodMonth||!data.rows.length;
    $('[data-fn-refresh]').disabled=busy||externalBusy;
    $('[data-fn-previous]').disabled=busy||externalBusy||page<=1;
    $('[data-fn-next]').disabled=busy||externalBusy||!data||page*20>=selected().rows.length;
    host.querySelectorAll('[data-fn-open]').forEach(n=>n.disabled=busy||externalBusy||Boolean(editor));
    for(const name of ['period','search','filter'])$('[data-fn-'+name+']').disabled=busy||externalBusy||Boolean(editor);
    if(editor){
      const locked=busy||externalBusy||Boolean(attempt);editor.form.querySelectorAll('fieldset').forEach(f=>f.disabled=locked);
      const target=editor.form.querySelector('[data-fn-save]')||editor.form.querySelector('[data-fn-decision-save]');
      if(target)target.disabled=locked||editor.needsReview||!(editor.kind==='review'?allowedReview():allowedPrepare())||!editor.preview;
      editor.form.querySelector('[data-fn-preview]')?.toggleAttribute('disabled',locked||editor.needsReview||!allowedPrepare());
      const lookup=editor.form.querySelector('[data-fn-lookup]');if(lookup)lookup.disabled=locked||!allowedPrepare()||Boolean(editor.row);
      editor.form.querySelector('[data-fn-cancel]').disabled=busy||externalBusy||Boolean(attempt);
      const retry=editor.form.querySelector('[data-fn-retry]');retry.hidden=!attempt;retry.disabled=busy||externalBusy||!(attempt?.command==='review'?allowedReview():allowedPrepare());
    }
    if(detail){for(const name of ['correct','annul']){const b=$('[data-fn-'+name+']');if(b)b.disabled=busy||externalBusy||Boolean(editor)||!detail.record.canPropose||!allowedPrepare();}
      for(const name of ['approve','reject']){const b=$('[data-fn-'+name+']');if(b)b.disabled=busy||externalBusy||Boolean(editor)||!detail.record.pending?.canReview||!allowedReview();}}
  }
  async function request(query,options={}){
    const activeController=controller;
    const response=await fetch(ENDPOINT+(query?'?'+new URLSearchParams(query):''),{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([activeController.signal,AbortSignal.timeout(30000)])});
    if(!response.ok){let code='';try{code=(await response.json()).code||'';}catch{}throw Object.assign(Error('Request failed'),{status:response.status,code});}
    const payload=await response.json();if(activeController.signal.aborted)throw new DOMException('Aborted','AbortError');return payload;
  }
  async function operation(callback){
    if(busy||externalBusy||!available())return;controller?.abort();controller=new AbortController();const current=++seq;busy=true;controls();
    try{await callback(()=>current===seq&&available());}catch(error){if(current===seq&&available()){
      if([401,403].includes(error.status))clearConsulted();status(errorMessage(error));if(editor)editor.feedback.textContent=errorMessage(error);}}
    finally{if(current===seq){busy=false;controls();}}
  }
  async function loadBootstrap(){
    const next=fixedBootstrap(await request({resource:'bootstrap'})),oldKey=bootstrap?fixedPrincipalKey(bootstrap):editor?.principalKey||attempt?.principalKey;
    if(oldKey&&oldKey!==fixedPrincipalKey(next)){clearAll();const message='Cambió el municipio, la membresía o la fuente. Se descartó el borrador anterior; no se reenvió. Volvé a consultar.';status(message);throw Error(message);}
    bootstrap=next;if(!hasRead(access)||!hasRead(new Set(next.principal.capabilities))){clearConsulted();throw Error('No hay permiso para consultar novedades nominales.');}return next;
  }
  function currentPeriod(){const value=$('[data-fn-period]').value;return value?fixedPeriod(value):null;}
  async function loadList(){
    const period=currentPeriod();data=null;$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';
    data=fixedList(await request({resource:'list',...(period?{periodMonth:period}:{})}),period);page=1;renderList();
  }
  function renderList(){
    if(!data)return;const view=selected(),pages=Math.max(1,Math.ceil(view.rows.length/20));page=Math.min(page,pages);
    $('[data-fn-count]').textContent=view.rows.length+' registros del filtro completo · '+data.total+' consultados. La página no limita la exportación.';
    const cards=view.rows.slice((page-1)*20,page*20).map(r=>{
      const card=node('article',undefined,'fn-card');card.dataset.fnRecord=r.id;
      const heading=node('div',undefined,'fn-card-head');heading.append(node('h4',(r.subject.employeeName||'Nombre no informado')+' · Legajo '+r.subject.legajo),node('span',fixedState(r),'fn-badge'+(r.pending?' pending':'')));card.append(heading);
      const current=r.approved?.operation==='set'?r.approved.values:null;
      card.append(node('p',current?'Versión aprobada conservada':'Sin valores aprobados activos','fn-note'),facts(current||r.latest.values));
      if(r.pending)card.append(node('p',r.pending.operation==='annul'?'Anulación propuesta; la versión aprobada sigue conservada hasta la decisión.':'Propuesta pendiente; no reemplaza los valores aprobados.','fn-note'));
      if(!r.identityCurrent)card.append(node('p','Identidad de origen por revisar. No se habilitan cambios ni exportación para este vínculo.','fn-note'));
      if(data.periodMonth&&current)card.append(node('p',fixedCoverage(current,data.periodMonth).label+'. Se conservan las unidades e importes completos.','fn-note'));
      const open=button('Ver registro e historial','open');open.addEventListener('click',()=>openDetail(r.id));card.append(open);return card;
    });
    $('[data-fn-list]').replaceChildren(...(cards.length?cards:[node('p','No hay novedades fijas para esta consulta. Cambiá el período o los filtros.','fn-empty')]));
    $('[data-fn-pagination]').hidden=pages<=1;$('[data-fn-page]').textContent='Página '+page+' de '+pages;controls();
  }
  function renderDetail(){
    const target=$('[data-fn-detail]');target.replaceChildren();if(!detail){target.hidden=true;return;}
    const r=detail.record;target.hidden=false;target.append(node('h3',(r.subject.employeeName||'Nombre no informado')+' · Legajo '+r.subject.legajo));
    target.append(node('p',fixedState(r)+' · Revisión '+r.version,'fn-note'));
    if(r.approved){target.append(node('h4','Última decisión aprobada'),node('p',r.approved.operation==='annul'?'Anulación aprobada. Se conserva la historia.':'Valores aprobados para control, sin liquidación salarial.'),facts(r.approved.values));}
    if(r.pending){target.append(node('h4','Propuesta pendiente'),node('p',r.pending.operation==='annul'?'Solicita anular el registro.':'Solicita registrar estos valores.'),facts(r.pending.values),node('p','Motivo: '+r.pending.reason,'fn-note'));
      if(r.approved?.operation==='set')target.append(node('p','La propuesta pendiente no altera la versión aprobada mostrada arriba.','fn-note'));}
    const actions=node('div',undefined,'fn-actions');
    if(r.canPropose&&allowedPrepare()){
      const correct=button(r.approved?'Proponer corrección':'Preparar nueva propuesta','correct');correct.addEventListener('click',()=>openEditor(r,'set'));actions.append(correct);
      if(r.approved?.operation==='set'){const annul=button('Proponer anulación','annul');annul.addEventListener('click',()=>openEditor(r,'annul'));actions.append(annul);}}
    if(r.pending?.canReview&&allowedReview())for(const decision of ['approve','reject']){const b=button(decision==='approve'?'Revisar y aprobar':'Revisar y rechazar',decision);b.addEventListener('click',()=>openReview(r,decision));actions.append(b);}
    const close=button('Cerrar detalle','close');close.addEventListener('click',()=>{if(editor)return;detail=null;renderDetail();});actions.append(close);target.append(actions);
    const history=node('details');history.dataset.fnHistory='';history.append(node('summary','Historial completo · '+detail.history.length+' propuesta(s)'));
    const entries=node('ol',undefined,'fn-history');for(const p of detail.history){const li=node('li');li.dataset.fnHistoryId=p.id;
      li.append(node('strong',(p.operation==='annul'?'Anulación':'Valores propuestos')+' · Versión '+p.version),node('p',stamp(p.proposedAt)+' · '+p.proposedBy,'fn-note'),facts(p.values),node('p','Motivo: '+p.reason));
      if(p.review)li.append(node('p',(p.review.decision==='approve'?'Aprobada':'Rechazada')+' · '+stamp(p.review.reviewedAt)+' · '+p.review.reviewedBy),node('p','Decisión: '+p.review.reason));else li.append(node('p','Pendiente de revisión independiente.'));
      entries.append(li);}history.append(entries);target.append(history);controls();
  }
  async function openDetail(id){if(editor)return;await operation(async live=>{status('Consultando registro e historial…');detail=null;renderDetail();const next=fixedDetail(await request({resource:'detail',recordId:id}),id);if(!live())return;detail=next;renderDetail();status('Registro consultado. Una aprobación sólo habilita control y exportación.');});}
  function makeField(fields,key,label,type='text',max=500){const wrapper=node('label',label),input=node(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.dataset.fnField=key;input.name=key;input.autocomplete='off';input.maxLength=max;if(type==='date'){input.min='1900-01-01';input.max='2100-12-31';}wrapper.append(input);fields[key]=input;return wrapper;}
  function editorShell(title){
    const form=node('form',undefined,'fn-editor');form.append(node('h3',title));const subject=node('p','','fn-note');subject.dataset.fnSubject='';form.append(subject);
    const feedback=node('p','','fn-status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.dataset.fnFormStatus='';
    const preview=node('section',undefined,'fn-preview');preview.dataset.fnPreviewResult='';preview.hidden=true;
    const comparison=node('section',undefined,'fn-preview');comparison.dataset.fnComparison='';comparison.hidden=true;
    const actions=node('div',undefined,'fn-actions'),cancel=button('Cancelar propuesta local','cancel'),retry=button('Reintentar el mismo envío','retry');retry.hidden=true;
    cancel.addEventListener('click',()=>{if(busy||attempt)return;form.reset();form.remove();editor=null;controls();$('[data-fn-new]').focus();});retry.addEventListener('click',()=>sendAttempt());
    actions.append(retry,cancel);form.addEventListener('submit',e=>e.preventDefault());
    $('[data-fn-editor]').replaceChildren(form);return {form,feedback,previewHost:preview,comparison,actions,subjectHost:subject};
  }
  function openEditor(row=null,operationKind='set'){
    if(editor||attempt||busy||!allowedPrepare()||row&&!row.canPropose)return;
    const box=editorShell(operationKind==='annul'?'Proponer anulación':row?'Proponer corrección':'Registrar novedad fija'),fields={};
    const identity=node('fieldset'),legend=node('legend','1 · Legajo y respaldo');identity.append(legend);const grid=node('div',undefined,'fn-grid');
    grid.append(makeField(fields,'legajo','Legajo exacto','text',20));fields.legajo.inputMode='numeric';
    const lookup=button('Verificar legajo','lookup');grid.append(lookup);identity.append(grid);box.form.append(identity);
    if(operationKind==='set'){
      const fieldset=node('fieldset');fieldset.append(node('legend','2 · Valores y vigencia informados'));const inputs=node('div',undefined,'fn-grid');
      for(const[key,label,max]of [['conceptSourceId','Código del concepto',20],['costCenterSourceId','Centro de costo (opcional)',20],['quantityDecimal','Unidades (si constan)',20],['amountArs','Importe en pesos (si consta)',20],['legalInstrument','Instrumento que respalda la novedad',300]])inputs.append(makeField(fields,key,label,'text',max));
      for(const key of ['conceptSourceId','costCenterSourceId'])fields[key].inputMode='numeric';for(const key of ['quantityDecimal','amountArs'])fields[key].inputMode='decimal';
      const type=node('label','Tipo de liquidación'),select=node('select');select.dataset.fnField='payrollType';select.append(Object.assign(node('option','Elegí un tipo'),{value:''}));
      for(const[value,label]of Object.entries(FIXED_TYPES))select.append(Object.assign(node('option',label),{value}));fields.payrollType=select;type.append(select);inputs.append(type);
      inputs.append(makeField(fields,'validFrom','Fecha de alta','date'),makeField(fields,'validTo','Vencimiento (si consta)','date'));
      const forced=makeField(fields,'forced','Valor forzado, con fundamento','checkbox');forced.className='fn-check';inputs.append(forced,makeField(fields,'forcedReason','Fundamento del modo forzado','text',500));
      fields.forcedReason.closest('label').hidden=true;fields.forced.addEventListener('change',()=>{fields.forcedReason.closest('label').hidden=!fields.forced.checked;});
      fieldset.append(inputs);box.form.append(fieldset);
    }else box.form.append(node('p','Se propone retirar la vigencia administrativa. La versión aprobada permanece hasta que otra persona apruebe la anulación. No revierte salarios ni exportaciones previas.','fn-note'));
    const reasonSet=node('fieldset');reasonSet.append(makeField(fields,'reason','Motivo de la propuesta','text',500));box.form.append(reasonSet);
    box.form.append(node('p','Copiá únicamente valores respaldados. Los campos vacíos no se convierten en cero. Las fechas no generan prorrateos, lotes ni liquidaciones automáticas.','fn-note'));
    const previewButton=button('Revisar propuesta','preview',true),saveButton=button('Guardar propuesta para revisión','save',true);saveButton.hidden=true;box.actions.prepend(previewButton,saveButton);
    box.form.append(box.previewHost,box.comparison,box.actions,box.feedback);
    editor={...box,kind:'propose',operation:operationKind,row,subject:row?.subject??null,expectedVersion:row?.version??0,fields,preview:null,needsReview:false,principalKey:fixedPrincipalKey(bootstrap)};
    if(row){fields.legajo.value=row.subject.legajo;fields.legajo.readOnly=true;const v=row.approved?.operation==='set'?row.approved.values:row.latest.values;
      if(v&&operationKind==='set')for(const[key,input]of Object.entries(fields)){if(key==='amountArs')input.value=fixedMoneyInput(v.amountCents);else if(key==='forced')input.checked=v.forced;else if(Object.hasOwn(v,key))input.value=v[key]??'';}
      if(fields.forcedReason)fields.forcedReason.closest('label').hidden=!fields.forced.checked;showSubject();}
    fields.legajo.addEventListener('input',()=>{if(editor&&!editor.row){editor.subject=null;box.subjectHost.replaceChildren();}});
    lookup.addEventListener('click',lookupEmployee);
    box.form.addEventListener('input',()=>{if(!editor||attempt)return;editor.preview=null;box.previewHost.hidden=true;saveButton.hidden=true;previewButton.hidden=false;box.feedback.textContent='';controls();});
    previewButton.addEventListener('click',previewProposal);saveButton.addEventListener('click',prepareSend);
    controls();box.form.scrollIntoView({block:'start'});fields.legajo.focus({preventScroll:true});
  }
  function showSubject(){if(editor?.subject?.employeeName!==undefined)editor.subjectHost.textContent=(editor.subject.employeeName||'Nombre no informado')+' · Legajo '+editor.subject.legajo+' · Fuente al '+dayLabel(editor.subject.sourceCutoff)+'. No certifica elegibilidad salarial.';}
  async function lookupEmployee(){
    if(!editor||editor.kind!=='propose'||editor.row||attempt)return;const active=editor,legajo=active.fields.legajo.value.trim();
    if(!/^(?:0|[1-9]\d{0,19})$/.test(legajo)){active.feedback.textContent='Ingresá un legajo exacto, sin separadores ni ceros iniciales.';return;}
    await operation(async live=>{active.subject=null;active.subjectHost.replaceChildren();const next=fixedEmployee(await request({resource:'employee',legajo}),legajo);if(!live()||editor!==active)return;active.subject=next;showSubject();active.feedback.textContent='Legajo verificado. Completá los valores y revisá la propuesta.';});
  }
  function previewProposal(){
    if(!editor||attempt||busy||editor.needsReview)return;const active=editor;
    try{
      if(!active.subject||active.fields.legajo.value.trim()!==active.subject.legajo)throw Error('Verificá primero el legajo exacto.');
      const fields=Object.fromEntries(Object.entries(active.fields).map(([k,n])=>[k,n.type==='checkbox'?n.checked:n.value]));
      const draft=active.operation==='annul'?{legajo:active.subject.legajo,values:null,reason:fixedText(fields.reason,'el motivo de la anulación')}:fixedForm(fields);
      active.preview={recordId:active.row?.id??null,expectedVersion:active.expectedVersion,contractId:active.subject.contractId,legajo:active.subject.legajo,identityToken:active.subject.identityToken,operation:active.operation,values:draft.values,reason:draft.reason};
      active.previewHost.replaceChildren(node('h4','Revisá antes de guardar'),node('p','Legajo '+active.subject.legajo+' · '+(active.subject.employeeName||'Nombre no informado')),facts(draft.values),node('p','Motivo: '+draft.reason),node('p','Quedará pendiente de otra persona. No modifica la versión aprobada ni calcula haberes.','fn-note'));
      active.previewHost.hidden=false;active.form.querySelector('[data-fn-save]').hidden=false;active.form.querySelector('[data-fn-preview]').hidden=true;active.feedback.textContent='Propuesta preparada; todavía no está guardada.';controls();
    }catch(error){active.feedback.textContent=errorMessage(error);}
  }
  function openReview(row,decision){
    if(editor||attempt||busy||!row.pending?.canReview||!allowedReview())return;
    const box=editorShell(decision==='approve'?'Aprobar para control':'Rechazar propuesta'),fieldset=node('fieldset'),label=node('label','Fundamento de la decisión'),input=node('input');
    input.dataset.fnDecisionReason='';input.maxLength=500;input.autocomplete='off';label.append(input);fieldset.append(label);
    const source=node('section');source.dataset.fnReviewSource='';source.append(facts(row.pending.values),node('p','Motivo de la propuesta: '+row.pending.reason));
    box.form.append(node('p','Revisá la propuesta y su instrumento en el detalle. Esta decisión queda registrada y debe ser independiente del proponente.','fn-note'),source,fieldset);
    const submit=button(decision==='approve'?'Confirmar aprobación de control':'Confirmar rechazo','decision-save',true);box.actions.prepend(submit);box.form.append(box.comparison,box.actions,box.feedback);
    editor={...box,kind:'review',row,subject:row.subject,expectedVersion:row.version,proposalId:row.pending.id,decision,fields:{},decisionInput:input,preview:{},needsReview:false,principalKey:fixedPrincipalKey(bootstrap)};
    showSubject();submit.addEventListener('click',prepareSend);controls();box.form.scrollIntoView({block:'start'});input.focus({preventScroll:true});
  }
  function prepareSend(){
    if(!editor||attempt||busy||editor.needsReview||!(editor.kind==='review'?allowedReview():allowedPrepare()))return;let payload;
    try{payload=editor.kind==='review'?{recordId:editor.row.id,proposalId:editor.proposalId,expectedVersion:editor.expectedVersion,decision:editor.decision,reason:fixedText(editor.decisionInput.value,'el fundamento de la decisión')}:editor.preview;
      if(!payload)throw Error('Revisá la propuesta antes de guardar.');
      attempt={command:editor.kind,payload:structuredClone(payload),key:crypto.randomUUID(),principalKey:editor.principalKey};
      sendAttempt();
    }catch(error){editor.feedback.textContent=errorMessage(error);}
  }
  function trustedFailure(error){return /^PAYROLL_FIXED_(?:VERSION_CONFLICT|PENDING_EXISTS|OVERLAP|IDENTITY_CHANGED|MAKER_CHECKER_REQUIRED|EMPLOYMENT_REQUIRED|LEGACY_RECONCILIATION_REQUIRED|INVALID_PAYLOAD|DATES_INVALID|ROW_LIMIT|CAPACITY_LIMIT|CAPABILITY_REQUIRED|SESSION_BUSY|NOT_FOUND)$/.test(error.code||'');}
  async function sendAttempt(){
    if(!attempt||!editor||!(attempt.command==='review'?allowedReview():allowedPrepare()))return;
    const pending=attempt,active=editor;
    await operation(async live=>{
      active.feedback.textContent='Guardando el mismo intento…';
      try{
        const receipt=fixedReceipt(await request(null,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:JSON.stringify({command:pending.command,payload:pending.payload})}),pending.command,pending.payload);
        if(!live()||attempt!==pending){if(attempt===pending)pending.uncertain=true;return;}await finish(receipt,live);
      }catch(error){if(!live()){if(attempt===pending)pending.uncertain=true;return;}
        // A controlled first refusal confirms no mutation. An uncertain replay
        // stays locked until its receipt is recovered; a 404 is not an outcome.
        if(!pending.uncertain&&trustedFailure(error)){attempt=null;active.preview=null;if(active.kind==='review')active.preview={};
          active.needsReview=['PAYROLL_FIXED_VERSION_CONFLICT','PAYROLL_FIXED_PENDING_EXISTS','PAYROLL_FIXED_IDENTITY_CHANGED','PAYROLL_FIXED_OVERLAP'].includes(error.code);
          if(active.kind==='propose'){active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;}}
        else {pending.uncertain=true;active.feedback.textContent='No se pudo confirmar el guardado. Conservamos exactamente los datos y la clave; reintentá el mismo envío o verificá su estado. No inicies otra propuesta.';}
        if([401,403].includes(error.status))clearConsulted();
        status(errorMessage(error));if(!attempt)active.feedback.textContent=errorMessage(error)+' Usá Actualizar registro para revisar permisos y versión; el formulario se conserva.';
      }
    });
  }
  async function finish(receipt,live){
    const id=receipt.recordId;attempt=null;editor?.form.reset();editor=null;$('[data-fn-editor]').replaceChildren();
    status('Operación confirmada. Se conserva su historial; no se generaron liquidaciones.');
    try{await loadList();const next=fixedDetail(await request({resource:'detail',recordId:id}),id);if(live()){detail=next;renderDetail();}}
    catch(error){if([401,403].includes(error.status))clearConsulted();status('Operación confirmada, pero no pudimos actualizar la vista. Actualizá el registro; no repitas el alta.');}
  }
  async function refresh(){await operation(async live=>{
    status('Verificando permisos y registros…');await loadBootstrap();if(!live())return;
    if(attempt){
      const pending=attempt;
      try{const receipt=fixedReceipt(await request({resource:'attempt',command:pending.command,key:pending.key}),pending.command,pending.payload);if(live()&&attempt===pending)await finish(receipt,live);return;}
      catch(error){if(error.status!==404)throw error;}
      if(editor)editor.feedback.textContent='El intento todavía no tiene confirmación. Puede seguir procesándose. Conservamos los mismos datos y clave para reintentar; no se habilitan cambios.';
      status('El intento sigue sin confirmación. Podés reintentar exactamente el mismo envío.');return;
    }
    await loadList();if(!live())return;
    if(editor){const active=editor;
      if(!active.row){const legajo=active.fields.legajo.value.trim();if(!/^(?:0|[1-9]\d{0,19})$/.test(legajo)){active.feedback.textContent='Permisos revisados. Ingresá y verificá el legajo exacto para continuar.';return;}const next=fixedEmployee(await request({resource:'employee',legajo}),legajo);
        if(active.subject&&(next.contractId!==active.subject.contractId||next.identityToken!==active.subject.identityToken)){active.needsReview=true;active.feedback.textContent='Cambió la identidad. Cancelá esta propuesta local y verificá el legajo; no se reasignó.';}
        else {active.subject=next;showSubject();active.feedback.textContent='Permisos e identidad revisados. El borrador se conserva; revisalo antes de guardar.';}return;}
      const fresh=fixedDetail(await request({resource:'detail',recordId:active.row.id}),active.row.id);if(!live())return;detail=fresh;renderDetail();
      if(!fresh.record.identityCurrent||fresh.record.subject.identityToken!==active.subject?.identityToken){active.needsReview=true;active.feedback.textContent='La identidad cambió. No se reasignará este borrador. Consultá el legajo antes de iniciar otra propuesta.';return;}
      if(fresh.record.version!==active.expectedVersion){active.needsReview=true;active.comparison.replaceChildren(node('h4','El registro cambió'),node('p','Tu propuesta sigue en el formulario. Revisá el estado actual y confirmá si corresponde continuar.'),node('p',fixedState(fresh.record)),facts(fresh.record.approved?.values));active.comparison.hidden=false;
        if(active.kind==='propose'&&fresh.record.canPropose&&(active.operation!=='annul'||fresh.record.approved?.operation==='set')){const accept=button('Revisé el cambio; conservar mi propuesta','confirm-version');active.comparison.append(accept);accept.addEventListener('click',()=>{if(busy||attempt||editor!==active)return;active.row=fresh.record;active.subject=fresh.record.subject;active.expectedVersion=fresh.record.version;active.needsReview=false;active.preview=null;active.comparison.hidden=true;active.feedback.textContent='Versión revisada. Volvé a revisar tu propuesta antes de guardarla.';controls();});}
        else active.comparison.append(node('p','Esta decisión ya no corresponde a la versión consultada. Cancelá la propuesta local y revisá el detalle actual.'));}
      else {active.row=fresh.record;active.subject=fresh.record.subject;active.needsReview=active.kind==='review'?!fresh.record.pending?.canReview:!fresh.record.canPropose;
        if(active.kind==='review'&&!active.needsReview){active.preview={};active.form.querySelector('[data-fn-review-source]').replaceChildren(facts(fresh.record.pending.values),node('p','Motivo de la propuesta: '+fresh.record.pending.reason));}
        showSubject();active.feedback.textContent='Versión y permisos revisados. Tus datos se conservan.';}
    }else status(bootstrap.principal.employmentLinked?'Registro consultado. Las propuestas pendientes y las versiones aprobadas se muestran por separado.':'Consulta disponible. Falta verificar el vínculo laboral del operador para proponer o revisar.');
  });}
  async function exportFile(format){
    if(editor||!data?.periodMonth||!can('payroll.novelty.export'))return;const original=data,view=selected();
    await operation(async live=>{status('Verificando versión y permiso de exportación…');
      try{const snapshot=fixedExportData(await request({resource:'export',periodMonth:original.periodMonth,snapshotToken:original.snapshotToken}),original);
        if(!live()||data!==original)return;const ids=new Set(view.rows.map(r=>r.id)),rows=snapshot.rows.filter(r=>ids.has(r.recordId));
        if(!rows.length){status('No hay versiones aprobadas vigentes para exportar en este filtro.');return;}
        const checked={...snapshot,rows,total:rows.length},options={search:view.search,status:view.status,consultedCount:view.rows.length};
        save(format==='csv'?fixedCsv(checked,options):fixedXlsx(checked,options),'municontrol_novedades-fijas_control_'+snapshot.periodMonth.slice(0,7)+'.'+format,format==='csv'?'text/csv;charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        status('Control exportado: '+rows.length+' versiones aprobadas del filtro completo. No es una liquidación ni un archivo bancario.');
      }catch(error){data=null;detail=null;renderDetail();$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';throw error;}
    });
  }
  function mount(){
    if(mounted)return;mounted=true;
    host.innerHTML=`<div class="fn-toolbar"><p class="fn-note">Registro administrativo. Aprobar habilita sólo una exportación de control.</p><div class="fn-actions"><button type="button" class="button" data-fn-refresh>Actualizar registro</button><button type="button" class="button primary" data-fn-new hidden>Registrar novedad fija</button></div></div><p class="fn-status" role="status" aria-live="polite" data-fn-status>Consultá el registro para continuar.</p><div data-fn-editor></div><form class="fn-filters" data-fn-query><label>Período de consulta (opcional)<input type="month" min="1900-01" max="2100-12" data-fn-period></label><label>Buscar legajo, nombre o concepto<input type="search" maxlength="100" autocomplete="off" data-fn-search></label><label>Mostrar<select data-fn-filter><option value="all">Todos</option><option value="approved">Con versión aprobada</option><option value="pending">Con propuesta pendiente</option><option value="rejected">Última propuesta rechazada</option><option value="annulled">Anuladas</option><option value="partial">Vigencia parcial en el período</option></select></label><button type="submit" class="button" data-fn-consult>Consultar</button></form><p class="fn-note">El período incluye vigencias que coinciden total o parcialmente. No prorratea. Los códigos informados no certifican elegibilidad salarial. Para exportar elegí un período: se incluyen sólo versiones aprobadas vigentes del filtro completo.</p><div class="fn-actions"><button type="button" class="button" data-fn-csv>Descargar CSV de control</button><button type="button" class="button" data-fn-xlsx>Descargar Excel de control</button></div><p class="fn-note" data-fn-count></p><div class="fn-cards" data-fn-list></div><nav class="fn-pagination" data-fn-pagination aria-label="Páginas de novedades fijas" hidden><button type="button" class="button" data-fn-previous>Anterior</button><span data-fn-page></span><button type="button" class="button" data-fn-next>Siguiente</button></nav><section class="fn-detail" data-fn-detail hidden></section>`;
    $('[data-fn-refresh]').addEventListener('click',refresh);$('[data-fn-new]').addEventListener('click',()=>openEditor());$('[data-fn-query]').addEventListener('submit',e=>{e.preventDefault();if(!editor)refresh();});
    for(const key of ['search','filter'])$('[data-fn-'+key+']').addEventListener('input',()=>{if(data&&!busy&&!editor){page=1;renderList();}});
    $('[data-fn-period]').addEventListener('input',()=>{if(editor)return;data=null;detail=null;renderDetail();$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';status('Período cambiado. Presioná Consultar para obtener el resultado completo.');controls();});
    $('[data-fn-previous]').addEventListener('click',()=>{page--;renderList();});$('[data-fn-next]').addEventListener('click',()=>{page++;renderList();});
    for(const format of ['csv','xlsx'])$('[data-fn-'+format+']').addEventListener('click',()=>exportFile(format));controls();
  }
  shell.addEventListener('toggle',()=>{if(shell.open){mount();if(!data&&!editor&&!busy&&hasRead(access))refresh();}else if(busy&&!attempt){seq++;controller?.abort();busy=false;controls();}});
  function capabilityChange(event){const raw=event.detail?.tenantCapabilities;if(!raw)return;const caps=raw instanceof Set?[...raw]:raw;if(Array.isArray(caps)){access=new Set(caps);if(!hasRead(access))deny();else controls();}}
  document.addEventListener('municontrol:capabilities-ready',capabilityChange);
  const warnPending=event=>{if(attempt){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warnPending);
  window.addEventListener('pagehide',()=>{stopped=true;clearAll();document.removeEventListener('municontrol:capabilities-ready',capabilityChange);window.removeEventListener('beforeunload',warnPending);});
  return {setExternalBusy(value){externalBusy=Boolean(value);controls();},deny,setAccess({capabilities,principalKey}){
    if(outerKey&&principalKey!==outerKey)clearAll();outerKey=principalKey;access=new Set(capabilities);
    if(!hasRead(access)){deny();shell.hidden=!editor;return;}shell.hidden=false;if(mounted)controls();
  }};
}
