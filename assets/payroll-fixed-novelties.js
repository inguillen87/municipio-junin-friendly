import { fixedBootstrap,fixedEmployee,fixedList,fixedDetail,fixedReceipt,fixedExportData,fixedPrincipalKey,fixedCapability,
  fixedForm,fixedText,fixedPeriod,fixedState,fixedCoverage,fixedView,fixedMoney,fixedMoneyInput,fixedOriginLabel,fixedJunin638Data,fixedComparison,fixedDetailEqual,fixedSubjectEqual,FIXED_TYPES } from './payroll-fixed-novelties-model.js';
import { fixedCsv,fixedXlsx } from './payroll-fixed-novelties-export.js';
import {junin638Txt,junin638Filename} from './payroll-junin-638.js';
import {junin638Readiness,junin638FileReview} from './payroll-junin-638-review.js';
import {createEmployeePicker} from './employee-picker.js';
import {fixedGroupEligible,fixedGroupDraft,fixedCorrectionGroupDraft,fixedReviewGroupEligible,fixedReviewGroupDraft,fixedGroupReceipt,fixedGroupUnchanged} from './payroll-fixed-groups-model.js';

const ENDPOINT='/api/internal-payroll-fixed-novelties';
const GROUP_ENDPOINT='/api/internal-payroll-fixed-groups';
const CORRECTION_GROUP_ENDPOINT='/api/internal-payroll-fixed-correction-groups';
const REVIEW_GROUP_ENDPOINT='/api/internal-payroll-fixed-review-groups';
const isGroupKind=kind=>['annulGroup','correctGroup','reviewGroup'].includes(kind);
const groupEndpoint=kind=>kind==='reviewGroup'?REVIEW_GROUP_ENDPOINT:kind==='correctGroup'?CORRECTION_GROUP_ENDPOINT:GROUP_ENDPOINT;
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
    SNAPSHOT_CHANGED:'Cambió el resultado consultado. Actualizá la consulta antes de exportar.',CONTRACT_DRIFT:'No se pudo verificar el archivo completo. Actualizá el registro antes de exportar.',SESSION_BUSY:'Hay otra operación en curso. Reintentá con los mismos datos.',
    NOT_FOUND:'No se encontró el registro o legajo solicitado.',ROW_LIMIT:'El resultado supera el límite permitido. No se muestra una lista parcial.',CAPACITY_LIMIT:'No hay capacidad disponible para guardar. Los datos del formulario se conservan.',
    LEGACY_RECONCILIATION_REQUIRED:'Hay novedades fijas de un registro anterior pendientes de conciliar. No se guardaron cambios. Hace falta conciliar ese registro antes de continuar.',
    INVALID_PAYLOAD:'Revisá los datos informados. La propuesta se conserva.',DATES_INVALID:'Revisá las fechas de alta y vencimiento.',JUNIN638_DNI_REQUIRED:'El TXT 638 requiere DNI válido de 5 a 8 dígitos. Revisá los legajos observados.',JUNIN638_AMOUNT_REQUIRED:'El TXT 638 requiere un importe válido, no negativo y dentro del ancho del archivo receptor.'};
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
function comparison(row,operation,values){
  const model=fixedComparison(row,operation,values),section=node('section',undefined,'fn-change-review');section.dataset.fnChangeReview='';
  section.append(node('h4',operation==='annul'?'Valores que se propone retirar':'Valores aprobados y propuesta'));
  section.append(node('p',operation==='annul'?'Sólo una aprobación independiente retira esta novedad del control y de futuras exportaciones. El historial, las liquidaciones y los archivos anteriores se conservan.':'La propuesta no sustituye la versión aprobada hasta una decisión independiente. No se calculan importes ni prorrateos.','fn-note'));
  const region=node('div',undefined,'fn-change-table');region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','Comparación completa de los diez campos de la novedad fija');
  const table=node('table'),caption=node('caption','Diez campos · última versión aprobada frente a la propuesta');table.append(caption);
  const head=node('thead'),tr=node('tr');for(const title of ['Campo','Última versión aprobada','Propuesta','Cambio']){const th=node('th',title);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
  const body=node('tbody');for(const field of model.fields){const r=node('tr');r.dataset.fnChangeField=field.key;const label=node('th',field.label);label.scope='row';r.append(label);for(const [title,value]of [['Última versión aprobada',field.before],['Propuesta',field.after],['Cambio',field.changed?'Cambia':'Se conserva']]){const cell=node('td',value);cell.dataset.label=title;r.append(cell);}body.append(r);}table.append(body);region.append(table);section.append(region);return section;
}
function reviewSource(row,decision){const source=node('section');source.dataset.fnReviewSource='';source.append(node('p',(row.pending.operation==='annul'?'Anulación propuesta':'Valores propuestos')+' · Revisión '+row.version,'fn-note'),comparison(row,row.pending.operation,row.pending.values),node('p','Motivo de la propuesta: '+row.pending.reason),node('p',decision==='reject'?'Rechazar conserva la última versión aprobada y registra el rechazo.':'Aprobar habilita únicamente control y exportación; no calcula haberes.','fn-note'));return source;}

export function mountFixedNovelties(shell,onLock=()=>{}){
  if(!shell)return {setAccess(){},setExternalBusy(){},deny(){}};
  const host=shell.querySelector('[data-fixed-host]');let mounted=false,externalBusy=false,busy=false,stopped=false,seq=0,controller=null,reportedLock=false;
  let bootstrap=null,data=null,detail=null,editor=null,attempt=null,outerKey=null,access=new Set(),page=1;
  const groupIds=new Set(),reviewGroupIds=new Set();
  const $=s=>host.querySelector(s),available=()=>!stopped&&shell.isConnected&&shell.open&&!document.hidden;
  const can=cap=>fixedCapability(bootstrap,access,cap);
  const allowedPrepare=()=>can('payroll.fixed.prepare')&&bootstrap.principal.employmentLinked;
  const allowedReview=()=>can('payroll.fixed.approve')&&bootstrap.principal.employmentLinked;
  let groupGateAllowed=false,reviewGroupGateAllowed=false;
  const groupAllowedPrepare=()=>allowedPrepare()&&groupGateAllowed;
  const groupAllowedReview=()=>allowedReview()&&reviewGroupGateAllowed;
  const groupAuthority=kind=>kind==='reviewGroup'?groupAllowedReview():groupAllowedPrepare();
  let picker=null,directoryAllowed=false,directoryGateSeen=false,requestedContract=new URL(location.href).searchParams.get('fixedContractId');
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestedContract||''))requestedContract=null;
  else requestedContract=requestedContract.toLowerCase();
  const selected=()=>fixedView(data,{search:$('[data-fn-search]').value,status:$('[data-fn-filter]').value});
  const has638=()=>Boolean(data?.periodMonth&&data.rows.some(r=>r.identityCurrent&&r.approved?.operation==='set'&&r.approved.values.conceptSourceId==='638'&&fixedCoverage(r.approved.values,data.periodMonth).intersects));
  function status(text){if(mounted)$('[data-fn-status]').textContent=text;}
  function clearTxtReview(){const box=mounted?$('[data-fn-txt638-review]'):null;if(box){box.replaceChildren();box.hidden=true;}}
  function txtAvailability(){return junin638Readiness({list:data,canExport:can('payroll.novelty.export'),readAllowed:hasRead(access)&&Boolean(bootstrap),editing:Boolean(editor),busy:busy||externalBusy});}
  function showTxtReview(review){
    const box=$('[data-fn-txt638-review]');box.replaceChildren(node('h3','TXT 638 generado · control del archivo'));
    const fields=node('dl',undefined,'fn-facts');
    for(const [label,value]of [['Archivo',review.filename],['Período',review.periodMonth.slice(0,7)],['Registros incluidos',String(review.records)],['Total de importes del TXT',fixedMoney(review.totalCents)],['Tamaño exacto',review.byteLength+' bytes'],['SHA-256 del archivo',review.sha256]]){const item=node('div');item.append(node('dt',label),node('dd',value));fields.append(item);}
    box.append(fields,node('p','Se generó el archivo; no se envió a AMARU. La aceptación por el receptor sigue pendiente.','fn-note'),node('p','55 bytes por registro. Separación CRLF, sin salto final: convención de MuniControl que debe contrastarse con un archivo aceptado por AMARU. El resumen no muestra DNI ni nombres.','fn-note'));box.hidden=false;
  }
  function clearConsulted(){clearTxtReview();
    groupIds.clear();reviewGroupIds.clear();
    bootstrap=null;data=null;detail=null;
    if(mounted){$('[data-fn-list]').replaceChildren();$('[data-fn-detail]').replaceChildren();$('[data-fn-detail]').hidden=true;$('[data-fn-count]').textContent='';$('[data-fn-pagination]').hidden=true;}
    if(editor){editor.subject=editor.subject?{contractId:editor.subject.contractId,legajo:editor.subject.legajo,identityToken:editor.subject.identityToken}:null;
      if(isGroupKind(editor.kind)){editor.groupRows=null;editor.needsReview=true;editor.form.querySelector('[data-fn-group-source]')?.replaceChildren();}
      editor.row=editor.row?{id:editor.row.id,version:editor.row.version}:null;editor.form.querySelector('[data-fn-subject]')?.replaceChildren();
      editor.form.querySelector('[data-fn-comparison]')?.replaceChildren();editor.preview=null;editor.form.querySelector('[data-fn-preview-result]')?.replaceChildren();
      editor.form.querySelector('[data-fn-review-source]')?.replaceChildren();
      editor.detailSnapshot=null;if(editor.reviewed)editor.reviewed.checked=false;
      editor.form.querySelector('h3').textContent='Propuesta local pendiente';}
  }
  function deny(){seq++;controller?.abort();picker?.close();busy=false;clearConsulted();status('Se retiraron los datos consultados. Verificá la sesión y los permisos para continuar.');if(mounted)controls();}
  function clearAll(){deny();editor?.form.reset();editor=null;attempt=null;if(mounted){$('[data-fn-editor]').replaceChildren();controls();}}
  function controls(){
    const locked=busy||Boolean(attempt);if(locked!==reportedLock){reportedLock=locked;onLock(locked);}
    if(!mounted)return;host.setAttribute('aria-busy',String(busy));
    host.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=busy||externalBusy);
    $('[data-fn-new]').hidden=!allowedPrepare();$('[data-fn-new]').disabled=busy||externalBusy||Boolean(editor)||Boolean(attempt);
    const groupButton=$('[data-fn-group-open]');if(groupButton){groupButton.hidden=!groupAllowedPrepare();groupButton.disabled=busy||externalBusy||Boolean(editor)||Boolean(attempt)||!groupIds.size;
      groupButton.textContent='Revisar '+groupIds.size+' para anular';const correctionButton=$('[data-fn-group-correct]');correctionButton.hidden=!groupAllowedPrepare();correctionButton.disabled=groupButton.disabled;correctionButton.textContent='Corregir '+groupIds.size+' seleccionadas';$('[data-fn-group-clear]').disabled=busy||externalBusy||Boolean(editor)||!groupIds.size;
      const matches=data?selected().rows:[],eligible=matches.filter(fixedGroupEligible);$('[data-fn-group-select]').textContent='Seleccionar '+eligible.length+' disponibles del filtro';
      $('[data-fn-group-select]').disabled=busy||externalBusy||Boolean(editor)||!groupAllowedPrepare()||!eligible.length;
      $('[data-fn-group-count]').textContent=groupIds.size+' seleccionadas en toda la consulta · '+[...groupIds].filter(id=>!matches.some(r=>r.id===id)).length+' fuera del filtro actual. La búsqueda y la página no cambian la selección.';
      host.querySelectorAll('[data-fn-group-id]').forEach(n=>n.disabled=busy||externalBusy||Boolean(editor)||!groupAllowedPrepare()||!fixedGroupEligible(data?.rows.find(r=>r.id===n.dataset.fnGroupId)));
    }
    const reviewToolbar=$('[data-fn-review-group-toolbar]');if(reviewToolbar){reviewToolbar.hidden=!groupAllowedReview();
      const matches=data?selected().rows:[],eligible=matches.filter(fixedReviewGroupEligible),locked=busy||externalBusy||Boolean(editor)||Boolean(attempt)||!groupAllowedReview();
      $('[data-fn-review-group-select]').textContent='Seleccionar '+eligible.length+' pendientes del filtro';$('[data-fn-review-group-select]').disabled=locked||!eligible.length;
      $('[data-fn-review-group-clear]').disabled=locked||!reviewGroupIds.size;
      for(const decision of ['approve','reject']){const b=$('[data-fn-review-group-'+decision+']');b.textContent='Revisar '+reviewGroupIds.size+' para '+(decision==='approve'?'aprobar':'rechazar');b.disabled=locked||!reviewGroupIds.size;}
      $('[data-fn-review-group-count]').textContent=reviewGroupIds.size+' pendientes seleccionadas · '+[...reviewGroupIds].filter(id=>!matches.some(r=>r.id===id)).length+' fuera del filtro actual. La decisión incluye toda la selección.';
      host.querySelectorAll('[data-fn-review-group-id]').forEach(n=>n.disabled=locked||!fixedReviewGroupEligible(data?.rows.find(r=>r.id===n.dataset.fnReviewGroupId)));
    }
    for(const format of ['csv','xlsx'])$('[data-fn-'+format+']').disabled=busy||externalBusy||Boolean(editor)||!can('payroll.novelty.export')||!data?.periodMonth||!data.rows.length;
    const txtReady=txtAvailability();$('[data-fn-junin638]').disabled=!txtReady.ready;$('[data-fn-txt638-availability]').textContent=txtReady.message;
    $('[data-fn-refresh]').disabled=busy||externalBusy;
    $('[data-fn-previous]').disabled=busy||externalBusy||page<=1;
    $('[data-fn-next]').disabled=busy||externalBusy||!data||page*20>=selected().rows.length;
    host.querySelectorAll('[data-fn-open]').forEach(n=>n.disabled=busy||externalBusy||Boolean(editor));
    for(const name of ['period','search','filter'])$('[data-fn-'+name+']').disabled=busy||externalBusy||Boolean(editor);
    if(editor){
      const locked=busy||externalBusy||Boolean(attempt);editor.form.querySelectorAll('fieldset').forEach(f=>f.disabled=locked);
      if(editor.kind==='correctGroup'){for(const [key,input]of Object.entries(editor.correctionFields))input.disabled=locked||!editor.correctionChoices[key].checked;const preview=editor.form.querySelector('[data-fn-group-preview]');preview.disabled=locked||editor.needsReview||!groupAllowedPrepare();preview.hidden=Boolean(editor.preview);editor.form.querySelector('[data-fn-save]').hidden=!editor.preview;}
      const target=editor.form.querySelector('[data-fn-save]')||editor.form.querySelector('[data-fn-decision-save]');
      if(target)target.disabled=locked||editor.needsReview||!(editor.kind==='review'?allowedReview():allowedPrepare())||!editor.preview||editor.kind==='review'&&!editor.reviewed.checked;
      if(target&&isGroupKind(editor.kind))target.disabled=locked||editor.needsReview||!groupAuthority(editor.kind)||!editor.preview||!editor.reviewed.checked;
      editor.form.querySelector('[data-fn-preview]')?.toggleAttribute('disabled',locked||editor.needsReview||!allowedPrepare());
      const lookup=editor.form.querySelector('[data-fn-lookup]');if(lookup)lookup.disabled=locked||!allowedPrepare()||Boolean(editor.row);
      const choose=editor.form.querySelector('[data-fn-choose]');if(choose){choose.hidden=!directoryAllowed;choose.disabled=locked||!directoryAllowed||!allowedPrepare()||Boolean(editor.row);}
      editor.form.querySelector('[data-fn-cancel]').disabled=busy||externalBusy||Boolean(attempt);
      const retry=editor.form.querySelector('[data-fn-retry]');retry.hidden=!attempt;retry.disabled=busy||externalBusy||!(attempt?.command==='review'?allowedReview():allowedPrepare());
      if(isGroupKind(attempt?.command))retry.disabled=busy||externalBusy||!groupAuthority(attempt.command);
    }
    if(detail){for(const name of ['correct','annul']){const b=$('[data-fn-'+name+']');if(b)b.disabled=busy||externalBusy||Boolean(editor)||!detail.record.canPropose||!allowedPrepare();}
      for(const name of ['approve','reject']){const b=$('[data-fn-'+name+']');if(b)b.disabled=busy||externalBusy||Boolean(editor)||!detail.record.pending?.canReview||!allowedReview();}}
  }
  async function request(query,options={},endpoint=ENDPOINT){
    const activeController=controller;
    const response=await fetch(endpoint+(query?'?'+new URLSearchParams(query):''),{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([activeController.signal,AbortSignal.timeout(30000)])});
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
    if(oldKey&&oldKey!==fixedPrincipalKey(next)){const pending=Boolean(attempt);if(pending)clearConsulted();else clearAll();const message=pending?'El guardado pendiente corresponde a otro ámbito. Se conservan su contenido y clave originales; volvé a la sesión que lo inició. No se reenviaron datos.':'Cambió el municipio, la membresía o la fuente. Se descartó el borrador anterior; no se reenvió. Volvé a consultar.';status(message);throw Error(message);}
    bootstrap=next;if(!hasRead(access)||!hasRead(new Set(next.principal.capabilities))){clearConsulted();throw Error('No hay permiso para consultar novedades nominales.');}
    if(!groupAllowedReview()){reviewGroupIds.clear();if(editor?.kind==='reviewGroup'){editor.groupRows=null;editor.preview=null;editor.needsReview=true;editor.reviewed.checked=false;editor.sourceHost.replaceChildren();}}
    return next;
  }
  function currentPeriod(){const value=$('[data-fn-period]').value;return value?fixedPeriod(value):null;}
  async function loadList(){
    if(!editor&&!attempt){groupIds.clear();reviewGroupIds.clear();}
    clearTxtReview();const period=currentPeriod();data=null;$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';
    data=fixedList(await request({resource:'list',...(period?{periodMonth:period}:{})}),period);page=1;renderList();
  }
  function renderList(){
    if(!data)return;const view=selected(),pages=Math.max(1,Math.ceil(view.rows.length/20));page=Math.min(page,pages);
    $('[data-fn-count]').textContent=view.rows.length+' registros del filtro completo · '+data.total+' consultados. La página no limita la exportación.';
    const cards=view.rows.slice((page-1)*20,page*20).map(r=>{
      const card=node('article',undefined,'fn-card');card.dataset.fnRecord=r.id;
      const heading=node('div',undefined,'fn-card-head');heading.append(node('h4',(r.subject.employeeName||'Nombre no informado')+' · Legajo '+r.subject.legajo),node('span',fixedState(r),'fn-badge'+(r.pending?' pending':'')));card.append(heading);
      const current=r.approved?.operation==='set'?r.approved.values:null;
      if(allowedPrepare()){const label=node('label',undefined,'fn-group-select'),check=node('input');check.type='checkbox';check.dataset.fnGroupId=r.id;check.checked=groupIds.has(r.id);check.disabled=!fixedGroupEligible(r);
        label.append(check,node('span','Seleccionar para corregir o anular'));check.addEventListener('change',()=>{if(editor||busy||attempt||!groupAllowedPrepare()||!fixedGroupEligible(r)){check.checked=groupIds.has(r.id);return;}check.checked?groupIds.add(r.id):groupIds.delete(r.id);controls();});card.append(label);
        if(!fixedGroupEligible(r))card.append(node('p',r.pending?'Requiere resolver la propuesta pendiente antes de anular.':!r.identityCurrent?'Requiere verificar la identidad de origen.':r.version>=200?'Alcanzó el límite de historia admitido.':'Sin una versión aprobada activa para anular.','fn-note'));}
      card.append(node('p',fixedOriginLabel(r.subject)+' · '+(current?'Versión aprobada conservada':'Sin valores aprobados activos'),'fn-note'),facts(current||r.latest.values));
      if(groupAllowedReview()&&r.pending){const label=node('label',undefined,'fn-group-select'),check=node('input');check.type='checkbox';check.dataset.fnReviewGroupId=r.id;check.checked=reviewGroupIds.has(r.id);check.disabled=!fixedReviewGroupEligible(r);label.append(check,node('span','Seleccionar para revisión independiente'));check.addEventListener('change',()=>{if(editor||busy||attempt||!groupAllowedReview()||!fixedReviewGroupEligible(r)){check.checked=reviewGroupIds.has(r.id);return;}check.checked?reviewGroupIds.add(r.id):reviewGroupIds.delete(r.id);controls();});card.append(label);}
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
    target.append(node('p',fixedOriginLabel(r.subject)+' · '+fixedState(r)+' · Revisión '+r.version,'fn-note'));
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
  async function openGroupEditor(mode='annul'){
    if(editor||attempt||busy||!groupAllowedPrepare()||!data||!groupIds.size)return;
    const original=data.rows.filter(r=>groupIds.has(r.id)),period=data.periodMonth;
    await operation(async live=>{
      await loadBootstrap();if(!live()||!groupAllowedPrepare())return;
      const fresh=fixedList(await request({resource:'list',...(period?{periodMonth:period}:{})}),period);if(!live()||!groupAllowedPrepare())return;
      if(!fixedGroupUnchanged(original,fresh)||original.length!==groupIds.size)throw Error('Cambió una novedad seleccionada. Actualizá el registro y revisá la selección; no se guardó nada.');
      const box=editorShell((mode==='correct'?'Corregir ':'Proponer anulación de ')+original.length+(original.length===1?' novedad fija':' novedades fijas')),source=node('section',undefined,'fn-group-source');source.dataset.fnGroupSource='';
      source.append(node('p','Incluye toda la selección, también las novedades fuera de la página y de la búsqueda. Se conservan las versiones aprobadas hasta una decisión independiente. No anula liquidaciones ni revierte archivos ya entregados.','fn-note'));
      for(const r of original){const section=node('article',undefined,'fn-card');section.dataset.fnGroupReviewedId=r.id;section.append(node('h4',(r.subject.employeeName||'Nombre no informado')+' · Legajo '+r.subject.legajo),node('p',fixedOriginLabel(r.subject)+' · Revisión '+r.version,'fn-note'),comparison(r,mode==='correct'?'set':'annul',mode==='correct'?r.approved.values:null));source.append(section);}
      const correctionFields={},correctionChoices={},patchFields=node('fieldset'),grid=node('div',undefined,'fn-grid');
      if(mode==='correct'){patchFields.append(node('legend','Campos que vas a corregir'));patchFields.append(node('p','Marcá cada campo que cambiará. Los demás conservan el valor de cada novedad. Un campo elegido y vacío retira ese dato cuando es opcional. No se calculan importes ni porcentajes.','fn-note'));
        for(const [key,title,type,max]of [['conceptSourceId','Código del concepto','text',20],['costCenterSourceId','Centro de costo (opcional)','text',20],['quantityDecimal','Unidades declaradas (opcional)','text',20],['amountArs','Importe en pesos (opcional)','text',20],['legalInstrument','Instrumento que respalda la novedad','text',300],['validFrom','Fecha de alta','date',10],['validTo','Vencimiento (opcional)','date',10],['forced','Modo forzado','checkbox',0],['forcedReason','Fundamento forzado','text',500]]){
          const cell=node('div'),choice=node('label',undefined,'fn-group-select'),check=node('input');check.type='checkbox';check.dataset.fnGroupChange=key;choice.append(check,node('span','Cambiar '+title.toLowerCase()));cell.append(choice,makeField(correctionFields,key,title,type,max));correctionChoices[key]=check;grid.append(cell);
        }
        const cell=node('div'),choice=node('label',undefined,'fn-group-select'),check=node('input');check.type='checkbox';check.dataset.fnGroupChange='payrollType';choice.append(check,node('span','Cambiar tipo de liquidación'));const label=node('label','Tipo de liquidación'),type=node('select');type.dataset.fnField='payrollType';type.append(Object.assign(node('option','Elegí un tipo'),{value:''}));for(const [value,title]of Object.entries(FIXED_TYPES))type.append(Object.assign(node('option',title),{value}));label.append(type);cell.append(choice,label);correctionChoices.payrollType=check;correctionFields.payrollType=type;grid.append(cell);patchFields.append(grid);
      }
      const fields=node('fieldset'),label=node('label','Motivo del conjunto'),reason=node('textarea');reason.maxLength=500;reason.dataset.fnGroupReason='';label.append(reason);fields.append(label);
      const acknowledgement=node('label',undefined,'fn-group-select'),reviewed=node('input');reviewed.type='checkbox';reviewed.dataset.fnGroupReviewed='';acknowledgement.append(reviewed,node('span',original.length===1?'Revisé la novedad y el alcance administrativo de su anulación.':'Revisé las '+original.length+' novedades y el alcance administrativo de sus anulaciones.'));fields.append(acknowledgement);
      const send=button('Proponer '+original.length+(mode==='correct'?(original.length===1?' corrección':' correcciones'):(original.length===1?' anulación':' anulaciones')),'save',true),preview=button('Revisar todas las correcciones','group-preview',true);box.actions.prepend(send);if(mode==='correct'){box.actions.prepend(preview);box.form.append(patchFields);}box.form.append(source,fields,box.feedback,box.actions);
      editor={...box,kind:mode==='correct'?'correctGroup':'annulGroup',correctionFields,correctionChoices,sourceHost:source,groupRows:original,period,reviewed,reasonInput:reason,preview:null,needsReview:false,principalKey:fixedPrincipalKey(bootstrap)};
      const active=editor;const update=()=>{if(editor!==active||attempt||busy)return;if(mode==='correct'){active.preview=null;reviewed.checked=false;source.replaceChildren(node('p','Volvé a revisar el conjunto completo después de cambiar los campos o el motivo.','fn-note'));active.feedback.textContent='Elegí los campos y presioná Revisar todas las correcciones.';}else{try{active.preview=fixedGroupDraft(active.groupRows,reason.value);active.feedback.textContent=reviewed.checked?'Conjunto revisado. Guardar crea todas las propuestas o ninguna.':'Confirmá la revisión de todo el conjunto antes de guardar.';}catch(error){active.preview=null;active.feedback.textContent=error.message;}}controls();};
      if(mode==='correct'){reviewed.closest('label').querySelector('span').textContent='Revisé todos los valores anteriores y propuestos del conjunto. Cada corrección requerirá una decisión independiente.';
        for(const [key,check]of Object.entries(correctionChoices)){const input=correctionFields[key];input.dataset.fnGroupValue=key;check.addEventListener('change',update);input.addEventListener('input',update);}preview.addEventListener('click',()=>{if(editor!==active||busy||attempt||active.needsReview||!active.groupRows)return;try{const changes=Object.fromEntries(Object.entries(correctionChoices).filter(([,n])=>n.checked).map(([key])=>[key,correctionFields[key].type==='checkbox'?correctionFields[key].checked:correctionFields[key].value]));active.preview=fixedCorrectionGroupDraft(active.groupRows,changes,reason.value);reviewed.checked=false;source.replaceChildren(node('p',active.preview.items.length+' correcciones. Incluye toda la selección, también fuera de la búsqueda y la página.','fn-note'));active.groupRows.forEach((r,i)=>{const card=node('article',undefined,'fn-card');card.dataset.fnGroupReviewedId=r.id;card.append(node('h4',(r.subject.employeeName||'Nombre no informado')+' · Legajo '+r.subject.legajo),node('p',fixedOriginLabel(r.subject)+' · Revisión '+r.version,'fn-note'),comparison(r,'set',active.preview.items[i].values));source.append(card);});active.feedback.textContent='Compará todos los campos y confirmá la revisión antes de proponer el conjunto.';}catch(error){active.preview=null;active.feedback.textContent=error.message;}controls();});}
      reason.addEventListener('input',update);reviewed.addEventListener('change',mode==='correct'?controls:update);send.addEventListener('click',prepareSend);box.feedback.textContent='Informá el motivo y revisá todo el conjunto. Todavía no se guardó ninguna propuesta.';reason.focus();
    });
  }
  async function openReviewGroup(decision){
    if(editor||attempt||busy||!groupAllowedReview()||!data||!reviewGroupIds.size)return;
    const original=data.rows.filter(r=>reviewGroupIds.has(r.id)),period=data.periodMonth;
    await operation(async live=>{
      await loadBootstrap();if(!live()||!groupAllowedReview())return;
      const fresh=fixedList(await request({resource:'list',...(period?{periodMonth:period}:{})}),period);if(!live()||!groupAllowedReview())return;
      if(!fixedGroupUnchanged(original,fresh,true)||original.length!==reviewGroupIds.size)throw Error('Cambió una propuesta seleccionada. Actualizá y revisá el conjunto; no se decidió nada.');
      const quantityLabel=original.length+(original.length===1?' propuesta':' propuestas');
      const box=editorShell((decision==='approve'?'Aprobar':'Rechazar')+' '+quantityLabel+' para control'),source=node('section',undefined,'fn-group-source');source.dataset.fnGroupSource='';
      source.append(node('p','Incluye toda la selección, también fuera de la búsqueda y la página. Se registra una decisión por propuesta; todas se deciden juntas o ninguna. No calcula, confirma ni anula liquidaciones.','fn-note'));
      for(const r of original){const card=node('article',undefined,'fn-card');card.dataset.fnGroupReviewedId=r.id;card.append(node('h4',(r.subject.employeeName||'Nombre no informado')+' · Legajo '+r.subject.legajo),node('p',fixedOriginLabel(r.subject)+' · Propuesta por '+r.pending.proposedBy+' · '+stamp(r.pending.proposedAt),'fn-note'),reviewSource(r,decision));source.append(card);}
      const fields=node('fieldset'),label=node('label','Fundamento de la decisión conjunta'),reason=node('textarea');reason.maxLength=500;reason.dataset.fnGroupReason='';label.append(reason);fields.append(label);
      const acknowledgement=node('label',undefined,'fn-group-select'),reviewed=node('input');reviewed.type='checkbox';reviewed.dataset.fnGroupReviewed='';acknowledgement.append(reviewed,node('span','Revisé los diez campos, instrumentos, motivos y alcance de todas las propuestas.'));fields.append(acknowledgement);
      const send=button((decision==='approve'?'Aprobar':'Rechazar')+' '+quantityLabel+' para control','save',true);box.actions.prepend(send);box.form.append(source,fields,box.feedback,box.actions);box.form.querySelector('[data-fn-cancel]').textContent='Cancelar decisión local';
      editor={...box,kind:'reviewGroup',decision,sourceHost:source,groupRows:original,period,reviewed,reasonInput:reason,preview:null,needsReview:false,principalKey:fixedPrincipalKey(bootstrap)};
      const active=editor,update=()=>{if(editor!==active||attempt||busy)return;try{active.preview=fixedReviewGroupDraft(active.groupRows,decision,reason.value);active.feedback.textContent=reviewed.checked?'Revisión confirmada. Se guardarán todas las decisiones o ninguna, conservando su historial.':'Confirmá la revisión completa. Cada decisión conservará su historial.';}catch(error){active.preview=null;active.feedback.textContent=error.message;}controls();};
      reason.addEventListener('input',()=>{reviewed.checked=false;update();});reviewed.addEventListener('change',update);send.addEventListener('click',prepareSend);box.feedback.textContent='Revisá todas las propuestas e informá el fundamento. Todavía no se guardó ninguna decisión.';reason.focus();
    });
  }
  async function prepareGroupSend(){
    const active=editor;if(!active||attempt||busy||active.needsReview||!groupAuthority(active.kind)||!active.reviewed.checked||!active.preview)return;
    const payload=active.preview;let ready=false;
    await operation(async live=>{
      await loadBootstrap();if(!live()||editor!==active||!groupAuthority(active.kind)||active.principalKey!==fixedPrincipalKey(bootstrap))return;
      const fresh=fixedList(await request({resource:'list',...(active.period?{periodMonth:active.period}:{})}),active.period);if(!live()||editor!==active||!groupAuthority(active.kind))return;
      if(!active.groupRows||!fixedGroupUnchanged(active.groupRows,fresh,active.kind==='reviewGroup')){active.needsReview=true;active.preview=null;active.reviewed.checked=false;throw Error('Cambió el conjunto completo, incluidos valores o permisos. No se enviaron propuestas. Actualizá y revisá de nuevo; el motivo se conserva.');}
      ready=true;
    });
    if(!ready||!available()||editor!==active||attempt)return;
    attempt={command:active.kind,payload:structuredClone(payload),key:crypto.randomUUID(),principalKey:active.principalKey};sendAttempt();
  }
  function openEditor(row=null,operationKind='set',selectedSubject=null){
    if(editor||attempt||busy||!allowedPrepare()||row&&!row.canPropose)return;
    const box=editorShell(operationKind==='annul'?'Proponer anulación':row?'Proponer corrección':'Registrar novedad fija'),fields={};
    const identity=node('fieldset'),legend=node('legend','1 · Legajo y respaldo');identity.append(legend);const grid=node('div',undefined,'fn-grid');
    grid.append(makeField(fields,'legajo','Legajo exacto','text',20));fields.legajo.inputMode='numeric';
    const lookup=button('Verificar legajo GRH','lookup'),choose=button('Buscar y elegir persona','choose');grid.append(lookup,choose);identity.append(grid,node('p','Podés elegir un alta propia por su ficha. El número de legajo por sí solo consulta únicamente la fuente GRH.','fn-note'));box.form.append(identity);
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
    editor={...box,kind:'propose',operation:operationKind,row,detailSnapshot:row?detail:null,subject:row?.subject??selectedSubject,lookupContractId:selectedSubject?.contractId??null,expectedVersion:row?.version??0,fields,preview:null,needsReview:false,principalKey:fixedPrincipalKey(bootstrap)};
    if(selectedSubject){fields.legajo.value=selectedSubject.legajo;fields.legajo.readOnly=true;showSubject();}
    if(row){fields.legajo.value=row.subject.legajo;fields.legajo.readOnly=true;const v=row.approved?.operation==='set'?row.approved.values:row.latest.values;
      if(v&&operationKind==='set')for(const[key,input]of Object.entries(fields)){if(key==='amountArs')input.value=fixedMoneyInput(v.amountCents);else if(key==='forced')input.checked=v.forced;else if(Object.hasOwn(v,key))input.value=v[key]??'';}
      if(fields.forcedReason)fields.forcedReason.closest('label').hidden=!fields.forced.checked;showSubject();}
    fields.legajo.addEventListener('input',()=>{if(editor&&!editor.row){editor.subject=null;editor.lookupContractId=null;box.subjectHost.replaceChildren();}});
    lookup.addEventListener('click',lookupEmployee);
    choose.addEventListener('click',()=>{
      if(busy||attempt||!editor||editor.row||!directoryAllowed||!allowedPrepare())return;const active=editor;
      picker??=createEmployeePicker({instanceId:'fixedEmployeePicker',canUse:()=>available()&&!busy&&!attempt&&Boolean(editor)&&!editor.row&&directoryAllowed&&allowedPrepare(),onDirectoryInvalidated:deny});
      picker.open({onUse:rows=>{if(editor===active&&rows.length===1)lookupContract(rows[0].contractId);},initialSearch:active.fields.legajo.value});
    });
    box.form.addEventListener('input',()=>{if(!editor||attempt)return;editor.preview=null;box.previewHost.hidden=true;saveButton.hidden=true;previewButton.hidden=false;box.feedback.textContent='';controls();});
    previewButton.addEventListener('click',previewProposal);saveButton.addEventListener('click',prepareSend);
    controls();box.form.scrollIntoView({block:'start'});fields.legajo.focus({preventScroll:true});
  }
  function showSubject(){
    if(editor?.subject?.employeeName!==undefined){
      const s=editor.subject;
      if(editor.fields?.legajo)editor.fields.legajo.maxLength=s.origin==='MUNICONTROL'?128:20;
      editor.subjectHost.textContent=(s.employeeName||'Nombre no informado')+' · Legajo '+s.legajo+' · '+fixedOriginLabel(s)+' · '+(s.origin==='MUNICONTROL'?'Registro propio desde '+dayLabel(s.registeredAt):'Fuente al '+dayLabel(s.sourceCutoff))+'. No certifica elegibilidad salarial.';
    }
  }
  async function lookupContract(contractId){
    if(!editor||editor.kind!=='propose'||editor.row||attempt)return;const active=editor;active.lookupContractId=contractId;
    await operation(async live=>{active.subject=null;active.preview=null;active.previewHost.hidden=true;active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;active.subjectHost.replaceChildren();const next=fixedEmployee(await request({resource:'employee',contractId}),{contractId});if(!live()||editor!==active)return;
      active.subject=next;active.fields.legajo.value=next.legajo;active.fields.legajo.readOnly=true;active.needsReview=false;showSubject();active.feedback.textContent='Persona elegida y origen verificado. Revisá los valores antes de guardar.';
      active.previewHost.hidden=true;active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;});
  }
  async function lookupEmployee(){
    if(!editor||editor.kind!=='propose'||editor.row||attempt)return;const active=editor,legajo=active.fields.legajo.value.trim();
    if(!/^(?:0|[1-9]\d{0,19})$/.test(legajo)){active.feedback.textContent='Ingresá un legajo exacto, sin separadores ni ceros iniciales.';return;}
    active.lookupContractId=null;
    await operation(async live=>{active.subject=null;active.preview=null;active.previewHost.hidden=true;active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;active.subjectHost.replaceChildren();const next=fixedEmployee(await request({resource:'employee',legajo}),legajo);if(!live()||editor!==active)return;active.subject=next;active.fields.legajo.readOnly=false;active.needsReview=false;showSubject();active.feedback.textContent='Legajo GRH verificado. Completá los valores y revisá la propuesta.';});
  }
  function previewProposal(){
    if(!editor||attempt||busy||editor.needsReview)return;const active=editor;
    try{
      if(!active.subject||(active.subject.origin==='MUNICONTROL'?active.fields.legajo.value:active.fields.legajo.value.trim())!==active.subject.legajo)throw Error('Verificá primero el legajo exacto.');
      const fields=Object.fromEntries(Object.entries(active.fields).map(([k,n])=>[k,n.type==='checkbox'?n.checked:n.value]));
      const draft=active.operation==='annul'?{legajo:active.subject.legajo,values:null,reason:fixedText(fields.reason,'el motivo de la anulación')}:fixedForm(fields,active.subject);
      active.preview={recordId:active.row?.id??null,expectedVersion:active.expectedVersion,contractId:active.subject.contractId,legajo:active.subject.legajo,identityToken:active.subject.identityToken,operation:active.operation,values:draft.values,reason:draft.reason};
      active.previewHost.replaceChildren(node('h4','Revisá antes de guardar'),node('p','Legajo '+active.subject.legajo+' · '+(active.subject.employeeName||'Nombre no informado')+' · '+fixedOriginLabel(active.subject)),comparison(active.row,active.operation,draft.values),node('p','Motivo: '+draft.reason),node('p','Quedará pendiente de otra persona. No modifica la versión aprobada ni calcula haberes.','fn-note'));
      active.previewHost.hidden=false;active.form.querySelector('[data-fn-save]').hidden=false;active.form.querySelector('[data-fn-preview]').hidden=true;active.feedback.textContent='Propuesta preparada; todavía no está guardada.';controls();
    }catch(error){active.feedback.textContent=errorMessage(error);}
  }
  function openReview(row,decision){
    if(editor||attempt||busy||!row.pending?.canReview||!allowedReview())return;
    const box=editorShell(decision==='approve'?'Aprobar para control':'Rechazar propuesta'),fieldset=node('fieldset'),label=node('label','Fundamento de la decisión'),input=node('input');
    input.dataset.fnDecisionReason='';input.maxLength=500;input.autocomplete='off';label.append(input);fieldset.append(label);
    const source=reviewSource(row,decision),reviewLabel=node('label',undefined,'fn-check fn-review-check'),reviewed=node('input');reviewed.type='checkbox';reviewed.dataset.fnReviewed='';reviewLabel.append(reviewed,node('span','Revisé los diez campos, el instrumento y el alcance de esta decisión.'));fieldset.append(reviewLabel);
    box.form.append(node('p','Revisá la propuesta y su instrumento en el detalle. Esta decisión queda registrada y debe ser independiente del proponente.','fn-note'),source,fieldset);
    const submit=button(decision==='approve'?'Confirmar aprobación de control':'Confirmar rechazo','decision-save',true);box.actions.prepend(submit);box.form.append(box.comparison,box.actions,box.feedback);
    editor={...box,kind:'review',row,detailSnapshot:detail,subject:row.subject,expectedVersion:row.version,proposalId:row.pending.id,decision,fields:{},decisionInput:input,reviewed,preview:{},needsReview:false,principalKey:fixedPrincipalKey(bootstrap)};
    reviewed.addEventListener('change',controls);input.addEventListener('input',()=>{reviewed.checked=false;controls();});
    showSubject();submit.addEventListener('click',prepareSend);controls();box.form.scrollIntoView({block:'start'});input.focus({preventScroll:true});
  }
  async function prepareSend(){
    if(isGroupKind(editor?.kind)){await prepareGroupSend();return;}
    if(!editor||attempt||busy||editor.needsReview||!(editor.kind==='review'?allowedReview():allowedPrepare()))return;let payload;
    try{payload=editor.kind==='review'?{recordId:editor.row.id,proposalId:editor.proposalId,expectedVersion:editor.expectedVersion,decision:editor.decision,reason:fixedText(editor.decisionInput.value,'el fundamento de la decisión')}:editor.preview;
      if(!payload)throw Error('Revisá la propuesta antes de guardar.');
      if(editor.kind==='review'&&!editor.reviewed.checked)throw Error('Revisá los diez campos y el alcance antes de confirmar la decisión.');
      const active=editor,preview=active.preview;let ready=false;
      await operation(async live=>{
        active.feedback.textContent='Comprobando permisos y el contenido completo antes de enviar…';await loadBootstrap();if(!live()||editor!==active)return;
        if(active.principalKey!==fixedPrincipalKey(bootstrap)||!(active.kind==='review'?allowedReview():allowedPrepare()))throw Error('La sesión vigente no habilita este envío. Verificá el acceso; no se enviaron datos.');
        if(active.row){
          const fresh=fixedDetail(await request({resource:'detail',recordId:active.row.id}),active.row.id);if(!live()||editor!==active)return;
          if(!fixedDetailEqual(fresh,active.detailSnapshot)){
            active.needsReview=true;active.preview=null;if(active.reviewed)active.reviewed.checked=false;
            active.previewHost.replaceChildren();active.previewHost.hidden=true;active.form.querySelector('[data-fn-review-source]')?.replaceChildren();
            if(active.kind==='propose'){active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;}
            throw Error('El registro cambió, incluidos sus valores o permisos. No se envió la operación. Actualizá el registro y revisá nuevamente; tu propuesta se conserva.');
          }
        }else{
          const fresh=fixedEmployee(await request({resource:'employee',contractId:active.subject.contractId}),{contractId:active.subject.contractId});if(!live()||editor!==active)return;
          if(!fixedSubjectEqual(fresh,active.subject)){active.needsReview=true;active.preview=null;active.previewHost.replaceChildren();active.previewHost.hidden=true;active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;throw Error('La identidad cambió. No se enviaron datos ni se reasignó la propuesta.');}
        }
        if(!live()||editor!==active||active.preview!==preview||active.kind==='review'&&(!active.reviewed.checked||fixedText(active.decisionInput.value,'el fundamento de la decisión')!==payload.reason))return;ready=true;
      });
      if(!ready||editor!==active||attempt||!available())return;
      attempt={command:active.kind,payload:structuredClone(payload),key:crypto.randomUUID(),principalKey:active.principalKey};
      sendAttempt();
    }catch(error){if(editor)editor.feedback.textContent=errorMessage(error);}
  }
  function trustedFailure(error){return /^PAYROLL_FIXED_(?:VERSION_CONFLICT|PENDING_EXISTS|OVERLAP|IDENTITY_CHANGED|MAKER_CHECKER_REQUIRED|EMPLOYMENT_REQUIRED|LEGACY_RECONCILIATION_REQUIRED|INVALID_PAYLOAD|DATES_INVALID|ROW_LIMIT|CAPACITY_LIMIT|CAPABILITY_REQUIRED|SESSION_BUSY|NOT_FOUND)$/.test(error.code||'');}
  async function sendAttempt(){
    if(isGroupKind(attempt?.command)&&!groupAuthority(attempt.command))return;
    if(!attempt||!editor||!(isGroupKind(attempt.command)?groupAuthority(attempt.command):attempt.command==='review'?allowedReview():allowedPrepare()))return;
    const pending=attempt,active=editor;
    await operation(async live=>{
      active.feedback.textContent='Guardando el mismo intento…';
      try{
        const isGroup=isGroupKind(pending.command);
        const envelope=await request(null,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:JSON.stringify({command:isGroup?(pending.command==='reviewGroup'?'review':pending.command==='correctGroup'?'correct':'annul'):pending.command,payload:pending.payload})},isGroup?groupEndpoint(pending.command):ENDPOINT);
        const receipt=isGroup?fixedGroupReceipt(envelope,pending.key,pending.payload):fixedReceipt(envelope,pending.command,pending.payload);
        if(!live()||attempt!==pending){if(attempt===pending)pending.uncertain=true;return;}await finish(receipt,live);
      }catch(error){if(!live()){if(attempt===pending)pending.uncertain=true;return;}
        // A controlled first refusal confirms no mutation. An uncertain replay
        // stays locked until its receipt is recovered; a 404 is not an outcome.
        if(!pending.uncertain&&trustedFailure(error)){attempt=null;active.preview=null;if(active.kind==='review'){active.preview={};active.reviewed.checked=false;}
          active.needsReview=['PAYROLL_FIXED_VERSION_CONFLICT','PAYROLL_FIXED_PENDING_EXISTS','PAYROLL_FIXED_IDENTITY_CHANGED','PAYROLL_FIXED_OVERLAP'].includes(error.code);
          if(isGroupKind(active.kind)){active.needsReview=true;active.reviewed.checked=false;active.groupRows=null;active.form.querySelector('[data-fn-group-source]')?.replaceChildren();}
          if(active.kind==='propose'){active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;}}
        else {pending.uncertain=true;active.feedback.textContent='No se pudo confirmar el guardado. Conservamos exactamente los datos y la clave; reintentá el mismo envío o verificá su estado. No inicies otra propuesta.';}
        if([401,403].includes(error.status))clearConsulted();
        status(errorMessage(error));if(!attempt)active.feedback.textContent=errorMessage(error)+' Usá Actualizar registro para revisar permisos y versión; el formulario se conserva.';
      }
    });
  }
  async function finish(receipt,live){
    const id=receipt.recordId;attempt=null;editor?.form.reset();editor=null;groupIds.clear();reviewGroupIds.clear();$('[data-fn-editor]').replaceChildren();
    status(receipt.decision?receipt.total+' propuestas '+(receipt.decision==='approve'?'aprobadas':'rechazadas')+' juntas para control. Se conserva el historial; no se generaron liquidaciones.':receipt.total?receipt.total+' propuestas confirmadas juntas. Requieren revisión independiente; se conservan las versiones aprobadas.':'Operación confirmada. Se conserva su historial; no se generaron liquidaciones.');
    try{await loadList();if(id){const next=fixedDetail(await request({resource:'detail',recordId:id}),id);if(live()){detail=next;renderDetail();}}else {detail=null;renderDetail();}}
    catch(error){if([401,403].includes(error.status))clearConsulted();status('Operación confirmada, pero no pudimos actualizar la vista. Actualizá el registro; no repitas el alta.');}
  }
  async function refresh(){await operation(async live=>{
    status('Verificando permisos y registros…');await loadBootstrap();if(!live())return;
    if(attempt){
      const pending=attempt;
      if(pending.command==='reviewGroup'&&!groupAllowedReview()){status('Falta permiso vigente de aprobación. Se conserva el intento original; no se consultó ni reenvió.');return;}
      try{const isGroup=isGroupKind(pending.command),envelope=await request({resource:'attempt',...(!isGroup?{command:pending.command}:{}),key:pending.key},{},isGroup?groupEndpoint(pending.command):ENDPOINT);
        const receipt=isGroup?fixedGroupReceipt(envelope,pending.key,pending.payload):fixedReceipt(envelope,pending.command,pending.payload);if(live()&&attempt===pending)await finish(receipt,live);return;}
      catch(error){if(error.status!==404)throw error;}
      if(editor)editor.feedback.textContent='El intento todavía no tiene confirmación. Puede seguir procesándose. Conservamos los mismos datos y clave para reintentar; no se habilitan cambios.';
      status('El intento sigue sin confirmación. Podés reintentar exactamente el mismo envío.');return;
    }
    await loadList();if(!live())return;
    if(editor){const active=editor;
      if(isGroupKind(active.kind)){active.preview=null;active.reviewed.checked=false;active.needsReview=true;active.feedback.textContent='El motivo se conserva. Cancelá esta propuesta local y seleccioná nuevamente el conjunto consultado para revisar todos sus valores.';return;}
      if(!active.row){const legajo=active.fields.legajo.value.trim(),contractId=active.subject?.contractId||active.lookupContractId;if(!contractId&&!/^(?:0|[1-9]\d{0,19})$/.test(legajo)){active.feedback.textContent='Permisos revisados. Ingresá y verificá el legajo exacto para continuar.';return;}const lookup=contractId?{contractId}:{legajo};const next=fixedEmployee(await request({resource:'employee',...lookup}),contractId?lookup:legajo);if(!live()||editor!==active)return;
        if(active.subject&&(next.contractId!==active.subject.contractId||next.identityToken!==active.subject.identityToken)){active.needsReview=true;active.feedback.textContent='Cambió la identidad. Cancelá esta propuesta local y verificá el legajo; no se reasignó.';}
        else {active.subject=next;if(contractId){active.fields.legajo.value=next.legajo;active.fields.legajo.readOnly=true;}showSubject();active.feedback.textContent='Permisos e identidad revisados. El borrador se conserva; revisalo antes de guardar.';}return;}
      const fresh=fixedDetail(await request({resource:'detail',recordId:active.row.id}),active.row.id);if(!live())return;detail=fresh;renderDetail();
      if(!fresh.record.identityCurrent||fresh.record.subject.identityToken!==active.subject?.identityToken){active.needsReview=true;active.feedback.textContent='La identidad cambió. No se reasignará este borrador. Consultá el legajo antes de iniciar otra propuesta.';return;}
      if(fresh.record.version!==active.expectedVersion){active.needsReview=true;active.comparison.replaceChildren(node('h4','El registro cambió'),node('p','Tu propuesta sigue en el formulario. Revisá el estado actual y confirmá si corresponde continuar.'),node('p',fixedState(fresh.record)),facts(fresh.record.approved?.values));active.comparison.hidden=false;
        if(active.kind==='propose'&&fresh.record.canPropose&&(active.operation!=='annul'||fresh.record.approved?.operation==='set')){const accept=button('Revisé el cambio; conservar mi propuesta','confirm-version');active.comparison.append(accept);accept.addEventListener('click',()=>{if(busy||attempt||editor!==active)return;active.row=fresh.record;active.detailSnapshot=fresh;active.subject=fresh.record.subject;active.expectedVersion=fresh.record.version;active.needsReview=false;active.preview=null;active.comparison.hidden=true;active.feedback.textContent='Versión revisada. Volvé a revisar tu propuesta antes de guardarla.';controls();});}
        else active.comparison.append(node('p','Esta decisión ya no corresponde a la versión consultada. Cancelá la propuesta local y revisá el detalle actual.'));}
      else {active.row=fresh.record;active.detailSnapshot=fresh;active.subject=fresh.record.subject;active.needsReview=active.kind==='review'?!fresh.record.pending?.canReview:!fresh.record.canPropose;
        if(active.kind==='propose'){active.preview=null;active.previewHost.replaceChildren();active.previewHost.hidden=true;active.form.querySelector('[data-fn-save]').hidden=true;active.form.querySelector('[data-fn-preview]').hidden=false;}
        if(active.kind==='review'&&!active.needsReview){active.preview={};active.reviewed.checked=false;active.form.querySelector('[data-fn-review-source]').replaceWith(reviewSource(fresh.record,active.decision));}
        showSubject();active.feedback.textContent='Versión y permisos revisados. Tus datos se conservan.';}
    }else if(requestedContract&&allowedPrepare()){
      const contractId=requestedContract;requestedContract=null;const chosen=fixedEmployee(await request({resource:'employee',contractId}),{contractId});
      if(live()){busy=false;openEditor(null,'set',chosen);busy=true;status('Alta seleccionada por su ficha. Revisá el origen y prepará la propuesta; todavía no se guardó ninguna novedad.');}
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
      }catch(error){data=null;detail=null;renderDetail();$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';$('[data-fn-pagination]').hidden=true;throw error;}
    });
  }
  async function exportJunin638(){
    if(editor||!data?.periodMonth||!can('payroll.novelty.export')||!has638())return;const original=data;
    await operation(async live=>{clearTxtReview();status('Verificando identidad, versión e importes del TXT 638 AMARU…');
      try{const snapshot=fixedJunin638Data(await request({resource:'junin638',periodMonth:original.periodMonth,snapshotToken:original.snapshotToken}),original);
        if(!live()||data!==original)return;
        if(!snapshot.rows.length){status('No hay versiones aprobadas del concepto 638 vigentes en este período.');return;}
        const bytes=junin638Txt(snapshot),review=await junin638FileReview(snapshot,bytes);
        if(!live()||data!==original||!can('payroll.novelty.export'))return;
        save(bytes,junin638Filename(),'text/plain');showTxtReview(review);
        status('amaru.txt generado: '+snapshot.rows.length+' registros · Formato Junín · DNI pos. 5/8 · importe pos. 44/11 · 55 bytes. No liquida ni importa a GRH.');
      }catch(error){data=null;detail=null;renderDetail();$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';$('[data-fn-pagination]').hidden=true;throw error;}
    });
  }
  function mount(){
    if(mounted)return;mounted=true;
    host.innerHTML=`<div class="fn-toolbar"><p class="fn-note">Registro administrativo. Aprobar habilita sólo una exportación de control.</p><div class="fn-actions"><button type="button" class="button" data-fn-refresh>Actualizar registro</button><button type="button" class="button primary" data-fn-new hidden>Registrar novedad fija</button></div></div><p class="fn-status" role="status" aria-live="polite" data-fn-status>Consultá el registro para continuar.</p><div data-fn-editor></div><form class="fn-filters" data-fn-query><label>Período de consulta (opcional)<input type="month" min="1900-01" max="2100-12" data-fn-period></label><label>Buscar legajo, nombre o concepto<input type="search" maxlength="100" autocomplete="off" data-fn-search></label><label>Mostrar<select data-fn-filter><option value="all">Todos</option><option value="approved">Con versión aprobada</option><option value="pending">Con propuesta pendiente</option><option value="rejected">Última propuesta rechazada</option><option value="annulled">Anuladas</option><option value="partial">Vigencia parcial en el período</option></select></label><button type="submit" class="button" data-fn-consult>Consultar</button></form><p class="fn-note">El período incluye vigencias que coinciden total o parcialmente. No prorratea. Los códigos informados no certifican elegibilidad salarial. Elegí un período para exportar. CSV y Excel incluyen las versiones aprobadas vigentes del filtro completo. El TXT 638 incluye todas las novedades 638 aprobadas vigentes del período; no aplica la búsqueda ni el filtro de pantalla.</p><div class="fn-actions"><button type="button" class="button" data-fn-csv>Descargar CSV de control</button><button type="button" class="button" data-fn-xlsx>Descargar Excel de control</button><button type="button" class="button primary" data-fn-junin638 aria-describedby="fixedTxt638Availability">Descargar TXT 638 · AMARU</button></div><p id="fixedTxt638Availability" class="fn-note fn-txt638-availability" role="status" data-fn-txt638-availability></p><section class="fn-txt638-review" data-fn-txt638-review hidden></section><p class="fn-note" data-fn-count></p><div class="fn-cards" data-fn-list></div><nav class="fn-pagination" data-fn-pagination aria-label="Páginas de novedades fijas" hidden><button type="button" class="button" data-fn-previous>Anterior</button><span data-fn-page></span><button type="button" class="button" data-fn-next>Siguiente</button></nav><section class="fn-detail" data-fn-detail hidden></section>`;
    const groupToolbar=node('section',undefined,'fn-group-toolbar');groupToolbar.setAttribute('aria-label','Corrección y anulación conjunta de novedades fijas');const groupActions=node('div',undefined,'fn-actions');
    const chooseGroup=button('Seleccionar disponibles del filtro','group-select'),clearGroup=button('Retirar selección','group-clear'),openGroup=button('Revisar selección para anular','group-open');
    const correctGroup=button('Corregir selección','group-correct');groupActions.append(chooseGroup,clearGroup,correctGroup,openGroup);correctGroup.addEventListener('click',()=>openGroupEditor('correct'));const groupCount=node('p','','fn-note');groupCount.dataset.fnGroupCount='';groupCount.setAttribute('role','status');groupToolbar.append(groupActions,groupCount);$('[data-fn-list]').before(groupToolbar);
    chooseGroup.addEventListener('click',()=>{if(editor||busy||attempt||!groupAllowedPrepare()||!data)return;for(const r of selected().rows.filter(fixedGroupEligible))groupIds.add(r.id);renderList();});
    clearGroup.addEventListener('click',()=>{if(editor||busy||attempt)return;groupIds.clear();reviewGroupIds.clear();renderList();});openGroup.addEventListener('click',()=>openGroupEditor('annul'));
    $('[data-fn-refresh]').addEventListener('click',refresh);$('[data-fn-new]').addEventListener('click',()=>openEditor());$('[data-fn-query]').addEventListener('submit',e=>{e.preventDefault();if(!editor)refresh();});
    const reviewToolbar=node('section');reviewToolbar.dataset.fnReviewGroupToolbar='';reviewToolbar.append(node('h3','Revisión independiente del conjunto'),node('p','Elegí propuestas de otra persona para aprobar o rechazar todas juntas. No decide liquidaciones.','fn-note'));
    const reviewActions=node('div',undefined,'fn-actions');for(const [key,title]of [['select','Seleccionar pendientes del filtro'],['clear','Retirar selección de revisión'],['approve','Revisar para aprobar'],['reject','Revisar para rechazar']]){const b=button(title,'review-group-'+key);reviewActions.append(b);b.addEventListener('click',()=>{if(editor||attempt||busy||!groupAllowedReview()||!data)return;if(key==='select'){for(const r of selected().rows.filter(fixedReviewGroupEligible))reviewGroupIds.add(r.id);renderList();}else if(key==='clear'){reviewGroupIds.clear();renderList();}else openReviewGroup(key);});}const reviewCount=node('p','','fn-note');reviewCount.dataset.fnReviewGroupCount='';reviewToolbar.append(reviewActions,reviewCount);$('[data-fn-list]').before(reviewToolbar);
    for(const key of ['search','filter'])$('[data-fn-'+key+']').addEventListener('input',()=>{if(data&&!busy&&!editor){page=1;renderList();}});
    $('[data-fn-period]').addEventListener('input',()=>{if(editor)return;groupIds.clear();reviewGroupIds.clear();clearTxtReview();data=null;detail=null;renderDetail();$('[data-fn-list]').replaceChildren();$('[data-fn-count]').textContent='';status('Período cambiado. Presioná Consultar para obtener el resultado completo.');controls();});
    $('[data-fn-previous]').addEventListener('click',()=>{page--;renderList();});$('[data-fn-next]').addEventListener('click',()=>{page++;renderList();});
    for(const format of ['csv','xlsx'])$('[data-fn-'+format+']').addEventListener('click',()=>exportFile(format));$('[data-fn-junin638]').addEventListener('click',exportJunin638);controls();
  }
  shell.addEventListener('toggle',()=>{if(shell.open){mount();if(!data&&!editor&&!busy&&hasRead(access))refresh();}else if(groupIds.size||reviewGroupIds.size||isGroupKind(editor?.kind)||isGroupKind(attempt?.command)){deny();}else if(busy&&!attempt){seq++;controller?.abort();busy=false;controls();}});
  const groupVisibility=()=>{if(document.hidden&&(groupIds.size||reviewGroupIds.size||isGroupKind(editor?.kind)||isGroupKind(attempt?.command)))deny();};
  document.addEventListener('visibilitychange',groupVisibility);
  function acceptDirectoryGate(detail){const current=new Set(detail?.tenantCapabilities||[]);directoryAllowed=current.has('workforce.employee.read');if(!directoryAllowed)picker?.close();groupGateAllowed=current.has('payroll.fixed.prepare');reviewGroupGateAllowed=current.has('payroll.fixed.approve');
    const lostEditor=isGroupKind(editor?.kind)&&!(editor.kind==='reviewGroup'?reviewGroupGateAllowed:groupGateAllowed),lostAttempt=isGroupKind(attempt?.command)&&!(attempt.command==='reviewGroup'?reviewGroupGateAllowed:groupGateAllowed);
    if(!groupGateAllowed&&groupIds.size||!reviewGroupGateAllowed&&reviewGroupIds.size||lostEditor||lostAttempt){seq++;controller?.abort();busy=false;}
    if(!groupGateAllowed)groupIds.clear();if(!reviewGroupGateAllowed)reviewGroupIds.clear();
    if(lostEditor){editor.groupRows=null;editor.preview=null;editor.needsReview=true;editor.reviewed.checked=false;editor.form.querySelector('[data-fn-group-source]')?.replaceChildren();}controls();}
  function capabilityChange(event){const raw=event.detail?.tenantCapabilities;if(!raw)return;const caps=raw instanceof Set?[...raw]:raw;if(Array.isArray(caps)){directoryGateSeen=true;acceptDirectoryGate(event.detail);access=new Set(caps);if(!hasRead(access))deny();else controls();}}
  document.addEventListener('municontrol:capabilities-ready',capabilityChange);
  Promise.resolve(globalThis.MuniControlCapabilityGate?.ready).then(result=>{if(!stopped&&!directoryGateSeen)acceptDirectoryGate(result);}).catch(()=>{});
  const warnPending=event=>{if(attempt){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warnPending);
  window.addEventListener('pagehide',()=>{stopped=true;clearAll();document.removeEventListener('visibilitychange',groupVisibility);document.removeEventListener('municontrol:capabilities-ready',capabilityChange);window.removeEventListener('beforeunload',warnPending);});
  return {setExternalBusy(value){externalBusy=Boolean(value);controls();},deny,setAccess({capabilities,principalKey}){
    if(outerKey&&principalKey!==outerKey){if(attempt)deny();else clearAll();}outerKey=principalKey;access=new Set(capabilities);
    if(!hasRead(access)){deny();shell.hidden=!editor;return;}shell.hidden=false;if(mounted)controls();
    if(requestedContract&&!shell.open)shell.open=true;
  }};
}
