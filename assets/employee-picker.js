import { pickerSearch, pickerQuery, pickerResult, addPickerSelection } from './employee-picker-model.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const dateLabel=value=>value?new Intl.DateTimeFormat('es-AR',{timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T12:00:00Z')):'fecha no informada';
/** One modal reused by individual, agile and native-sheet entry. All state is in memory. */
export function createEmployeePicker({canUse=()=>true,onDirectoryInvalidated=()=>{}}={}) {
  const dialog=node('dialog',undefined,'employee-picker');dialog.id='employeePicker';dialog.setAttribute('aria-labelledby','employeePickerTitle');
  dialog.innerHTML=`<header class="picker-header"><div><p class="picker-eyebrow">DIRECTORIO MUNICIPAL · SELECCIÓN ASISTIDA</p><h2 id="employeePickerTitle">Buscar legajos activos</h2><p>Elegí personas por nombre o legajo. No hace falta copiar datos de un Excel.</p></div><button class="button" type="button" data-picker-close aria-label="Cerrar búsqueda de legajos">Cerrar</button></header>
  <div class="picker-body"><form data-picker-form class="picker-search"><label for="employeePickerSearch">Nombre, apellido o legajo<input id="employeePickerSearch" type="search" minlength="2" maxlength="100" autocomplete="off" placeholder="Ej.: apellido o número de legajo" required></label><button type="submit" class="button primary">Buscar</button></form>
  <p class="picker-state" role="status" aria-live="polite" data-picker-state></p><a href="login.html?next=novedades-nomina.html" data-picker-login hidden>Ingresar nuevamente al portal</a>
  <p class="picker-source" data-picker-source hidden></p><div data-picker-results class="picker-results" aria-label="Resultados del directorio"></div>
  <nav class="picker-pages" aria-label="Páginas de resultados" hidden data-picker-pages><button class="button" type="button" data-picker-previous>Anterior</button><span data-picker-range></span><button class="button" type="button" data-picker-next>Siguiente</button></nav>
  <section class="picker-chosen" data-picker-chosen hidden aria-labelledby="employeePickerChosen"><h3 id="employeePickerChosen">Tu selección</h3><p>La selección se conserva al cambiar de búsqueda o de página; no se seleccionan resultados ocultos.</p><div data-picker-chips></div></section></div>
  <footer class="picker-footer"><div><strong data-picker-count>Sin legajos seleccionados</strong><p>Activo según el último estado incorporado, no una certificación de liquidación. Crear el lote vuelve a validar cada vínculo.</p></div><button type="button" class="button primary" data-picker-apply disabled>Usar selección</button></footer>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s),input=$('#employeePickerSearch'),status=$('[data-picker-state]'),results=$('[data-picker-results]'),apply=$('[data-picker-apply]');
  let requestVersion=0,controller=null,selected=[],options=null,view=null,query='',busy=false,scopeKey=null,opener=null;
  function stop(){requestVersion++;controller?.abort();controller=null;busy=false;}
  function clearResults(){view=null;results.replaceChildren();$('[data-picker-pages]').hidden=true;results.removeAttribute('aria-busy');}
  function reset(){stop();selected=[];options=null;view=null;scopeKey=null;query='';input.value='';status.textContent='';clearResults();$('[data-picker-source]').textContent='';$('[data-picker-source]').hidden=true;$('[data-picker-login]').hidden=true;renderSelection();}
  function close(){if(dialog.open)dialog.close();reset();if(opener?.isConnected&&!opener.disabled)opener.focus();opener=null;}
  function renderSelection(){
    $('[data-picker-count]').textContent=selected.length?`${selected.length} legajo${selected.length===1?'':'s'} seleccionado${selected.length===1?'':'s'} · máximo ${options?.maximum||1}`:'Sin legajos seleccionados';
    apply.textContent=selected.length===1?'Usar este legajo':selected.length?`Usar ${selected.length} legajos`:'Usar selección';
    apply.disabled=busy||!options||!selected.length||!canUse();
    $('[data-picker-chosen]').hidden=!selected.length;
    $('[data-picker-chips]').replaceChildren(...selected.map(item=>{const chip=node('span',undefined,'picker-chip'),remove=node('button','×');remove.type='button';remove.setAttribute('aria-label','Quitar legajo '+item.legajo+' de la selección');chip.append(node('span',(item.nombre||'Nombre no informado')+' · '+item.legajo),remove);remove.addEventListener('click',()=>{selected=selected.filter(x=>x.contractId!==item.contractId);renderSelection();renderRows();});return chip;}));
  }
  function renderRows(){
    if(!view){results.replaceChildren();return;}
    results.replaceChildren(...view.rows.map(item=>{
      const label=node('label',undefined,'picker-row'),control=node('input');control.type=options.multiple?'checkbox':'radio';control.name='picker-employee';control.value=item.contractId;
      const excluded=options.excluded.includes(item.legajo);
      control.checked=selected.some(x=>x.contractId===item.contractId);control.disabled=excluded||busy||!canUse();control.setAttribute('aria-label','Seleccionar '+(item.nombre||'legajo')+' · '+item.legajo);
      const text=node('span',undefined,'picker-person');text.append(node('strong',item.nombre||'Nombre no informado'),node('span','Legajo '+item.legajo+' · '+(item.sector||'Sector no informado')),node('small',(item.convenio||'Convenio no informado')+' · Estado al '+dateLabel(item.statusSnapshotDate)));
      label.append(control,text,node('span',excluded?'Ya incluido':'Activo al corte',excluded?'picker-pill muted':'picker-pill'));
      control.addEventListener('change',()=>{if(!options||!canUse())return;try{if(!control.checked)selected=selected.filter(x=>x.contractId!==item.contractId);else selected=addPickerSelection(options.multiple?selected:[],item,options);status.textContent='Selección actualizada. Usá el botón inferior para llevarla a la carga.';}catch(error){status.textContent=error.message;}renderSelection();renderRows();results.querySelector(`input[value="${item.contractId}"]`)?.focus();});
      return label;
    }));
  }
  async function search(page=1){
    if(!options||!dialog.open||!canUse())return;
    let text;try{text=pickerSearch(input.value);}catch(error){stop();clearResults();status.textContent=error.message;renderSelection();return;}
    stop();const version=requestVersion;query=text;busy=true;clearResults();results.setAttribute('aria-busy','true');renderSelection();status.textContent='Consultando legajos activos…';$('[data-picker-login]').hidden=true;
    controller=new AbortController();const activeController=controller;const timer=setTimeout(()=>activeController.abort(),20000);
    try{
      const response=await fetch(pickerQuery(text,page),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:activeController.signal});
      if(version!==requestVersion||!dialog.open||!options)return;
      if([401,403].includes(response.status)){onDirectoryInvalidated();selected=[];clearResults();scopeKey=null;$('[data-picker-source]').hidden=true;$('[data-picker-login]').hidden=response.status!==401;throw Error(response.status===401?'La sesión venció. Ingresá nuevamente antes de consultar.':'Tu perfil no tiene permiso para consultar nombres del personal. No se modificaron los permisos.');}
      if(!response.ok)throw Error('No se pudo consultar el directorio. Reintentá la búsqueda.');
      const payload=await response.json();if(version!==requestVersion||!dialog.open||!options)return;
      const next=pickerResult(payload,page),nextKey=JSON.stringify(next.scope);let changed=false;
      if(scopeKey!==null&&scopeKey!==nextKey){onDirectoryInvalidated();selected=[];changed=true;}
      scopeKey=nextKey;view=next;
      const p=next.pagination;const start=(p.page-1)*p.limit+1,end=start+next.rows.length-1;
      $('[data-picker-source]').hidden=false;$('[data-picker-source]').textContent='Fuente incorporada: '+dateLabel(next.scope.sourceCutoffFrom)+(next.scope.sourceCutoffTo!==next.scope.sourceCutoffFrom?' a '+dateLabel(next.scope.sourceCutoffTo):'')+'. Se muestran solamente legajos activos al corte; el padrón no se actualiza por abrir esta ventana.';
      $('[data-picker-range]').textContent=next.rows.length?`${start}–${end} de ${p.total} coincidencias · página ${p.page} de ${p.pages}`:'Sin resultados en esta página';
      $('[data-picker-pages]').hidden=p.pages<=1;$('[data-picker-previous]').disabled=p.page<=1;$('[data-picker-next]').disabled=p.page>=p.pages;
      status.textContent=(changed?'Cambió el corte de datos. Volvé a seleccionar los legajos. ':'')+(next.rows.length?`${p.total} coincidencia${p.total===1?'':'s'}. Elegí los legajos que necesitás.`:'No hay coincidencias activas para esta búsqueda. Revisá el nombre o legajo; no se agregaron históricos.');
    }catch(error){
      if(version!==requestVersion||!dialog.open)return;
      selected=[];clearResults();status.textContent=error.name==='AbortError'?'La consulta demoró demasiado. Volvé a buscar.':error instanceof TypeError?'No se pudo consultar el directorio. Revisá la conexión y reintentá.':error.message;
    }finally{clearTimeout(timer);if(version===requestVersion){busy=false;controller=null;results.removeAttribute('aria-busy');renderSelection();renderRows();}}
  }
  input.addEventListener('input',()=>{stop();clearResults();status.textContent='Presioná Buscar o Enter para consultar. Tu selección anterior no agrega nuevos resultados.';renderSelection();});
  $('[data-picker-form]').addEventListener('submit',e=>{e.preventDefault();search(1);});
  $('[data-picker-previous]').addEventListener('click',()=>{if(view&&!busy)search(view.pagination.page-1);});
  $('[data-picker-next]').addEventListener('click',()=>{if(view&&!busy)search(view.pagination.page+1);});
  $('[data-picker-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  // Search inputs consume Escape natively; close the active modal consistently.
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.open){e.preventDefault();e.stopPropagation();close();}});
  apply.addEventListener('click',()=>{if(!options||busy||!canUse()||!selected.length)return;try{const use=options.onUse;use([...selected]);close();}catch(error){status.textContent=error.message;}});
  window.addEventListener('pagehide',close);
  return {close,open({multiple=false,maximum=1,excluded=[],onUse,initialSearch=''}={}){
    if(!canUse())return false;if(typeof onUse!=='function'||!Number.isSafeInteger(maximum)||maximum<1||maximum>500)throw Error('No quedan lugares disponibles en la carga.');
    close();opener=document.activeElement;options={multiple,maximum:multiple?maximum:1,excluded:[...excluded],onUse};input.value=initialSearch;
    status.textContent='Buscá por nombre o legajo. La consulta no guarda novedades ni modifica liquidaciones.';renderSelection();dialog.showModal();input.focus();return true;
  }};
}
