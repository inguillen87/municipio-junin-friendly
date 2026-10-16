import {ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';
import {readOwnPayrollResponse} from './own-payroll-response.js';
import {nativeRoster,nativeRosterScope} from './native-roster-model.js';
import {OWN_PAYROLL_READINESS_FILTERS,OWN_PAYROLL_READINESS_ROSTER_URL} from './own-payroll-readiness-model.js';
import {OWN_RUN_MAX_RESPONSE} from './own-payroll-run-model.js';

// Read the same complete, authorised own roster as Calcular. Pins are kept in
// memory for one opening; rows are fetched again before applying a selection.
export function createNativeEmployeePickerReader({getAccess,canUse,required,onInvalidated=()=>{}}={}) {
  if(typeof getAccess!=='function'||typeof canUse!=='function'||typeof onInvalidated!=='function'||!Array.isArray(required)||!required.length||required.some(c=>typeof c!=='string'))throw Error('Acceso de búsqueda propia inválido.');
  let source=null;
  const readNativeRoster=async({signal}={})=>{
    const key=getAccess()?.key;
    const current=()=>{
      if(signal?.aborted||!canUse())throw Object.assign(Error('La búsqueda quedó desactualizada.'),{name:'AbortError'});
      if(!key||getAccess()?.key!==key)throw Object.assign(Error('Cambió la cuenta o el ámbito de la búsqueda.'),{status:403});
    };
    const read=async url=>{
      current();const http=new AbortController(),timer=setTimeout(()=>http.abort(),url===OWN_PAYROLL_READINESS_ROSTER_URL?25000:10000),httpSignal=signal?AbortSignal.any([signal,http.signal]):http.signal;
      try{
        const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:httpSignal});
        const payload=await readOwnPayrollResponse(response,{maxBytes:OWN_RUN_MAX_RESPONSE,signal:httpSignal});current();
        if(!response.ok||payload?.ok!==true)throw Object.assign(Error(response.status===401?'La sesión venció. Ingresá nuevamente.':response.status===403?'Tu cuenta ya no permite consultar estos legajos.':'No se pudo consultar el padrón propio completo.'),{status:response.status});
        return payload;
      }finally{clearTimeout(timer);}
    };
    const check=async()=>{
      const payload=await read('/api/internal-auth'),fresh=ownRunWorkspaceAccess(payload);
      if(fresh.key!==key||!required.every(c=>fresh.caps.has(c)))throw Object.assign(Error('Cambió la cuenta o el permiso para esta búsqueda.'),{status:403});
      return payload.access.tenant.id;
    };
    try{
      const tenant=await check(),payload=await read(OWN_PAYROLL_READINESS_ROSTER_URL),roster=nativeRoster(payload.data,OWN_PAYROLL_READINESS_FILTERS);
      if(roster.version!=='native-roster.v2'||roster.scope.tenantId.toLowerCase()!==tenant.toLowerCase())throw Object.assign(Error('Cambió el ámbito del padrón propio.'),{code:'NATIVE_PICKER_CHANGED'});
      await check();current();
      const next={key,scope:nativeRosterScope(roster.scope),snapshot:roster.snapshot,total:roster.total,today:roster.today};
      if(source&&JSON.stringify(source)!==JSON.stringify(next))throw Object.assign(Error('Cambió el padrón propio. Cerrá la búsqueda y verificá nuevamente el acceso.'),{code:'NATIVE_PICKER_CHANGED'});
      source=next;return payload;
    }catch(error){
      if([401,403].includes(error.status)||error.code==='NATIVE_PICKER_CHANGED'){source=null;onInvalidated(error.message);}
      throw error;
    }
  };
  readNativeRoster.reset=()=>{source=null;};
  return readNativeRoster;
}

import { pickerSearch, pickerQuery, pickerResult, addPickerSelection, nativePayrollPickerView, nativePayrollPickerSelection, addNativePickerSelection } from './employee-picker-model.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const dateLabel=value=>value?new Intl.DateTimeFormat('es-AR',{timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T12:00:00Z')):'fecha no informada';
/** One modal reused by individual, agile and native-sheet entry. All state is in memory. */
export function createEmployeePicker({canUse=()=>true,onDirectoryInvalidated=()=>{},instanceId='employeePicker',selectionIssue=()=>null,historicalAdoptionHelp=false,readNativeRoster=null}={}) {
  if(readNativeRoster!==null&&typeof readNativeRoster!=='function')throw Error('Fuente propia de búsqueda inválida.');
  const native=typeof readNativeRoster==='function';
  if(!/^[A-Za-z][A-Za-z0-9]{1,60}$/.test(instanceId))throw Error('Identificador de búsqueda inválido.');
  const dialog=node('dialog',undefined,'employee-picker');dialog.id=instanceId;dialog.setAttribute('aria-labelledby',instanceId+'Title');
  dialog.innerHTML=`<header class="picker-header"><div><p class="picker-eyebrow">DIRECTORIO MUNICIPAL · SELECCIÓN ASISTIDA</p><h2 id="employeePickerTitle">Buscar legajos activos</h2><p>Elegí personas por nombre o legajo. No hace falta copiar datos de un Excel.</p></div><button class="button" type="button" data-picker-close aria-label="Cerrar búsqueda de legajos">Cerrar</button></header>
  <div class="picker-body"><form data-picker-form class="picker-search"><label for="employeePickerSearch">Nombre, apellido o legajo<input id="employeePickerSearch" type="search" minlength="2" maxlength="100" autocomplete="off" placeholder="Ej.: apellido o número de legajo" required></label><button type="submit" class="button primary">Buscar</button></form>
  <p class="picker-state" role="status" aria-live="polite" data-picker-state></p><a href="login.html?next=novedades-nomina.html" data-picker-login hidden>Ingresar nuevamente al portal</a>
  <p class="picker-source" data-picker-source hidden></p><div data-picker-results class="picker-results" aria-label="Resultados del directorio"></div>
  <aside class="picker-adoption-help" data-picker-adoption-help hidden><strong>Primero incorporá el padrón al circuito propio</strong><p>Revisá la propuesta de adopción en Personas. Su aprobación conserva los legajos y el historial; no calcula ni paga sueldos. Después también deben aprobarse las definiciones salariales y las reglas del período.</p><a class="button" href="/personal#legajos">Revisar incorporación del padrón</a></aside>
  <nav class="picker-pages" aria-label="Páginas de resultados" hidden data-picker-pages><button class="button" type="button" data-picker-previous>Anterior</button><span data-picker-range></span><button class="button" type="button" data-picker-next>Siguiente</button></nav>
  <section class="picker-chosen" data-picker-chosen hidden aria-labelledby="employeePickerChosen"><h3 id="employeePickerChosen">Tu selección</h3><p>La selección se conserva al cambiar de búsqueda o de página; no se seleccionan resultados ocultos.</p><div data-picker-chips></div></section></div>
  <footer class="picker-footer"><div><strong data-picker-count>Sin legajos seleccionados</strong><p>Activo según el estado consultado, no una certificación de liquidación. Cada operación vuelve a validar el vínculo y los permisos.</p></div><button type="button" class="button primary" data-picker-apply disabled>Usar selección</button></footer>`;
  if(instanceId!=='employeePicker')for(const item of dialog.querySelectorAll('[id],[for],[aria-labelledby]'))for(const attribute of ['id','for','aria-labelledby']){const value=item.getAttribute(attribute);if(value?.startsWith('employeePicker'))item.setAttribute(attribute,value.replace('employeePicker',instanceId));}
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s),input=$('#'+instanceId+'Search'),status=$('[data-picker-state]'),results=$('[data-picker-results]'),apply=$('[data-picker-apply]'),searchButton=$('[data-picker-form] button[type=submit]');
  let requestVersion=0,controller=null,selected=[],options=null,view=null,query='',busy=false,pendingPage=null,scopeKey=null,opener=null;
  function stop(){requestVersion++;controller?.abort();controller=null;busy=false;pendingPage=null;}
  function clearResults(){view=null;$('[data-picker-source]').hidden=true;$('[data-picker-source]').textContent='';results.replaceChildren();$('[data-picker-adoption-help]').hidden=true;$('[data-picker-pages]').hidden=true;results.removeAttribute('aria-busy');}
  function reset(){stop();selected=[];options=null;view=null;scopeKey=null;query='';input.value='';status.textContent='';clearResults();$('[data-picker-source]').textContent='';$('[data-picker-source]').hidden=true;$('[data-picker-login]').hidden=true;renderSelection();}
  function close(){if(dialog.open)dialog.close();reset();if(opener?.isConnected&&!opener.disabled)opener.focus();opener=null;}
  function renderSelection(){
    searchButton.disabled=busy||!options||!canUse();searchButton.textContent=busy?'Buscando…':'Buscar';
    $('[data-picker-form]').setAttribute('aria-busy',String(busy));
    $('[data-picker-count]').textContent=selected.length?`${selected.length} legajo${selected.length===1?'':'s'} seleccionado${selected.length===1?'':'s'} · máximo ${options?.maximum||1}`:'Sin legajos seleccionados';
    apply.textContent=selected.length===1?'Usar este legajo':selected.length?`Usar ${selected.length} legajos`:'Usar selección';
    apply.disabled=busy||!options||!selected.length||!canUse();
    $('[data-picker-chosen]').hidden=!selected.length;
    $('[data-picker-chips]').replaceChildren(...selected.map(item=>{const chip=node('span',undefined,'picker-chip'),remove=node('button','×');remove.type='button';remove.disabled=busy||!canUse();remove.setAttribute('aria-label','Quitar legajo '+item.legajo+' de la selección');chip.append(node('span',(item.nombre||'Nombre no informado')+' · '+item.legajo),remove);remove.addEventListener('click',()=>{if(busy||!options||!canUse())return;selected=selected.filter(x=>x.contractId!==item.contractId);renderSelection();renderRows();});return chip;}));
  }
  function renderRows(){
    $('[data-picker-adoption-help]').hidden=historicalAdoptionHelp!==true||!view||busy||!canUse()||!view.rows.some(item=>item.recordOrigin!=='MUNICONTROL'&&Boolean(selectionIssue(item)));
    if(!view){results.replaceChildren();return;}
    results.replaceChildren(...view.rows.map(item=>{
      const label=node('label',undefined,'picker-row'),control=node('input');control.type=options.multiple?'checkbox':'radio';control.name='picker-employee';control.value=item.contractId;
      const excluded=options.excluded.includes(native?item.contractId:item.legajo);
      const issue=selectionIssue(item),own=item.recordOrigin==='MUNICONTROL';
      control.checked=selected.some(x=>x.contractId===item.contractId);control.disabled=excluded||Boolean(issue)||busy||!canUse();control.setAttribute('aria-label','Seleccionar '+(item.nombre||'legajo')+' · '+item.legajo);
      const text=node('span',undefined,'picker-person');text.append(node('strong',item.nombre||'Nombre no informado'),node('span','Legajo '+item.legajo+' · '+(item.sector||'Sector no informado')),node('small',(item.convenio||'Convenio no informado')+' · '+(own?'Registro propio de MuniControl':'Estado al '+dateLabel(item.statusSnapshotDate))));
      if(issue){const reason=node('small',issue,'picker-selection-issue');reason.id=instanceId+'Issue'+item.contractId;control.setAttribute('aria-describedby',reason.id);text.append(reason);}
      label.append(control,text,node('span',excluded?'Ya incluido':own?'Registro propio activo':'Activo al corte',excluded?'picker-pill muted':'picker-pill'));
      control.addEventListener('change',()=>{if(!options||!canUse())return;try{const currentIssue=selectionIssue(item);if(currentIssue)throw Error(currentIssue);if(!control.checked)selected=selected.filter(x=>x.contractId!==item.contractId);else selected=(native?addNativePickerSelection:addPickerSelection)(options.multiple?selected:[],item,options);status.textContent='Selección actualizada. Usá el botón inferior para llevarla a la carga.';}catch(error){status.textContent=error.message;}renderSelection();renderRows();results.querySelector(`input[value="${item.contractId}"]`)?.focus();});
      return label;
    }));
  }
  function requireCurrentAccess(){
    if(canUse())return;
    scopeKey=null;onDirectoryInvalidated();
    throw Error('El acceso a esta carga cambió. Cerrá la búsqueda y revisá tu sesión.');
  }
  async function search(page=1){
    if(!options||!dialog.open||!canUse())return;
    let text;try{text=pickerSearch(input.value);}catch(error){stop();clearResults();status.textContent=error.message;renderSelection();return;}
    // Enter/double submit must not restart the same slow, source-bound read.
    // A different query or page still cancels the previous request. No response cache.
    if(busy&&query===text&&pendingPage===page)return;
    stop();const version=requestVersion;query=text;pendingPage=page;busy=true;clearResults();results.setAttribute('aria-busy','true');renderSelection();status.textContent='Consultando legajos activos…';$('[data-picker-login]').hidden=true;
    controller=new AbortController();const activeController=controller;const timer=native?null:setTimeout(()=>activeController.abort(),20000);
    try{
      let next;
      if(native){const payload=await readNativeRoster({signal:activeController.signal});if(version!==requestVersion||!dialog.open||!options)return;if(activeController.signal.aborted)throw new DOMException('Consulta cancelada.','AbortError');requireCurrentAccess();next=nativePayrollPickerView(payload,text,page);}
      else{const response=await fetch(pickerQuery(text,page),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:activeController.signal});
      if(version!==requestVersion||!dialog.open||!options)return;
      if(activeController.signal.aborted)throw new DOMException('Consulta cancelada.','AbortError');
      requireCurrentAccess();
      if([401,403].includes(response.status)){onDirectoryInvalidated();selected=[];clearResults();scopeKey=null;$('[data-picker-source]').hidden=true;$('[data-picker-login]').hidden=response.status!==401;throw Error(response.status===401?'La sesión venció. Ingresá nuevamente antes de consultar.':'Tu perfil no tiene permiso para consultar nombres del personal. No se modificaron los permisos.');}
      if(!response.ok)throw Error('No se pudo consultar el directorio. Reintentá la búsqueda.');
      const payload=await response.json();if(version!==requestVersion||!dialog.open||!options)return;
      if(activeController.signal.aborted)throw new DOMException('Consulta cancelada.','AbortError');
      requireCurrentAccess();
      next=pickerResult(payload,page);}
      const nextKey=JSON.stringify(next.scope);let changed=false;
      if(scopeKey!==null&&scopeKey!==nextKey){onDirectoryInvalidated();selected=[];changed=true;}
      scopeKey=nextKey;view=next;
      const p=next.pagination;const start=(p.page-1)*p.limit+1,end=start+next.rows.length-1;
      $('[data-picker-source]').hidden=false;$('[data-picker-source]').textContent=native?'Padrón propio completo: '+next.scope.total+' legajos consultados. Situación al '+dateLabel(next.scope.today)+'. La búsqueda muestra contratos activos y no certifica su elegibilidad para liquidar.':'Fuente incorporada: '+dateLabel(next.scope.sourceCutoffFrom)+(next.scope.sourceCutoffTo!==next.scope.sourceCutoffFrom?' a '+dateLabel(next.scope.sourceCutoffTo):'')+'. Se muestran solamente legajos activos al corte; el padrón no se actualiza por abrir esta ventana.';
      $('[data-picker-range]').textContent=next.rows.length?`${start}–${end} de ${p.total} coincidencias · página ${p.page} de ${p.pages}`:'Sin resultados en esta página';
      $('[data-picker-pages]').hidden=p.pages<=1;$('[data-picker-previous]').disabled=p.page<=1;$('[data-picker-next]').disabled=p.page>=p.pages;
      status.textContent=(changed?'Cambió el corte de datos. Volvé a seleccionar los legajos. ':'')+(next.rows.length?`${p.total} coincidencia${p.total===1?'':'s'}. Elegí los legajos que necesitás.`:'No hay coincidencias activas para esta búsqueda. Revisá el nombre o legajo; no se agregaron históricos.');
    }catch(error){
      if(version!==requestVersion||!dialog.open)return;
      selected=[];clearResults();status.textContent=error.name==='AbortError'?(native?'La consulta del padrón propio se interrumpió. Volvé a buscar; no se inició ningún cálculo.':'La consulta demoró demasiado. Volvé a buscar.'):error instanceof TypeError?'No se pudo consultar el directorio. Revisá la conexión y reintentá.':error.message;
    }finally{clearTimeout(timer);if(version===requestVersion){busy=false;pendingPage=null;controller=null;results.removeAttribute('aria-busy');renderSelection();renderRows();}}
  }
  input.addEventListener('input',()=>{stop();clearResults();status.textContent='Presioná Buscar o Enter para consultar. Tu selección anterior no agrega nuevos resultados.';renderSelection();});
  $('[data-picker-form]').addEventListener('submit',e=>{e.preventDefault();search(1);});
  $('[data-picker-previous]').addEventListener('click',()=>{if(view&&!busy)search(view.pagination.page-1);});
  $('[data-picker-next]').addEventListener('click',()=>{if(view&&!busy)search(view.pagination.page+1);});
  $('[data-picker-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  // Search inputs consume Escape natively; close the active modal consistently.
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.open){e.preventDefault();e.stopPropagation();close();}});
  apply.addEventListener('click',async()=>{
    if(!options||busy||!canUse()||!selected.length)return;
    const version=requestVersion;
    try{
      let items=[...selected];
      if(native){busy=true;controller=new AbortController();const activeController=controller;renderSelection();renderRows();status.textContent='Verificando el padrón completo y el acceso antes de usar la selección…';
        const payload=await readNativeRoster({signal:activeController.signal});if(version!==requestVersion||!dialog.open||!options)return;if(activeController.signal.aborted)throw new DOMException('Consulta cancelada.','AbortError');requireCurrentAccess();items=nativePayrollPickerSelection(payload,items,options);
      }
      for(const item of items){const issue=selectionIssue(item);if(issue)throw Error(issue);}const use=options.onUse;use(items);close();
    }catch(error){if(version!==requestVersion||!dialog.open)return;if(native){selected=[];clearResults();}status.textContent=native&&error.name==='AbortError'?'La verificación se interrumpió. Volvé a buscar; no se inició ningún cálculo.':error.message;}
    finally{if(native&&version===requestVersion){busy=false;controller=null;renderSelection();renderRows();}}
  });
  window.addEventListener('pagehide',close);
  return {close,open({multiple=false,maximum=1,excluded=[],onUse,initialSearch=''}={}){
    if(!canUse())return false;if(typeof onUse!=='function'||!Number.isSafeInteger(maximum)||maximum<1||maximum>500)throw Error('No quedan lugares disponibles en la carga.');
    close();opener=document.activeElement;options={multiple,maximum:multiple?maximum:1,excluded:[...excluded],onUse};input.value=initialSearch;
    status.textContent='Buscá por nombre o legajo. La consulta no guarda novedades ni modifica liquidaciones.';renderSelection();dialog.showModal();input.focus();return true;
  }};
}
