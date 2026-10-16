import {createCollectiveWorkingTimeWorkspace,collectiveWorkingTimeFile,COLLECTIVE_WORKING_TIME_MAX_BYTES} from './own-contract-working-time-collective.js';
import {createNativeEmployeePickerReader} from './employee-picker.js';
import {ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';
import {WORKING_TIME_READ} from './own-contract-working-time-model.js';
import {readOwnPayrollResponse} from './own-payroll-response.js';
const endpoint='/api/internal-own-contract-working-time',node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};

export function mountCollectiveWorkingTime(container,{isVisible,otherBlocked=()=>false,changed=()=>{}}){
 if(!container||typeof isVisible!=='function')throw Error('Falta el ámbito visible de Jornada.');
 const host=node('details');host.className='working-time-collective';host.setAttribute('aria-label','Jornadas del padrón completo');
 host.innerHTML=`<summary>Jornada para varios legajos</summary><p>Revisá el padrón activo completo y registrá sus declaraciones con una sola confirmación. Cada contrato conserva su propuesta y revisión independiente. Si una operación se detiene, los comprobantes anteriores se conservan; el conjunto no es una única transacción.</p>
 <p role="status" aria-live="polite" data-collective-time-status>Elegí un archivo completo de declaraciones propias.</p>
 <fieldset data-collective-time-inputs><legend>1. Preparar o revisar el conjunto</legend><div class="working-time-grid"><label>Operación<select data-collective-time-mode><option value="propose">Preparar propuestas</option><option value="approve">Aprobar propuestas por otra persona</option><option value="reject">Rechazar propuestas por otra persona</option></select></label><label>Archivo completo de jornadas o propuestas<input type="file" accept="application/json,.json" data-collective-time-file></label></div><p data-collective-time-file-label>Sin archivo.</p><label>Fundamento común<textarea minlength="10" maxlength="1000" rows="3" data-collective-time-reason></textarea></label><button type="button" data-collective-time-prepare>Revisar conjunto completo</button></fieldset>
 <section data-collective-time-comparison hidden><h3>2. Comparar todas las declaraciones</h3><p data-collective-time-count></p><label>Buscar legajo en la comparación<input type="search" data-collective-time-search></label><p>Buscar y cambiar de página sólo modifica la vista. El envío conserva el conjunto completo.</p><div data-collective-time-rows></div><nav aria-label="Páginas de comparación de jornadas"><button type="button" data-collective-time-previous>Anterior</button><span data-collective-time-page></span><button type="button" data-collective-time-next>Siguiente</button></nav><label class="working-time-check"><input type="checkbox" data-collective-time-confirm>Revisé el conjunto completo, sus cambios, las declaraciones sin cambios y el fundamento.</label><button type="button" data-collective-time-send>Registrar conjunto revisado</button></section>
 <div class="working-time-actions"><button type="button" data-collective-time-recover hidden>Consultar el mismo intento</button><button type="button" data-collective-time-retry hidden>Reintentar el mismo envío</button><button type="button" data-collective-time-resume hidden>Restaurar preparación del avance</button><button type="button" data-collective-time-progress hidden>Guardar avance para continuar</button><button type="button" data-collective-time-review-file hidden>Descargar propuestas para revisión</button><button type="button" data-collective-time-new>Iniciar otro conjunto</button></div>
 <details><summary>Continuar un avance guardado</summary><p>El archivo de avance conserva las referencias y el contenido de un intento incierto. Su carga vuelve a verificar la cuenta y los comprobantes mediante los canales normales. Después cargá el mismo archivo completo de jornadas para continuar.</p><label>Archivo de avance<input type="file" accept="application/json,.json" data-collective-time-progress-input></label></details>`;
 container.append(host);const $=k=>host.querySelector('[data-collective-time-'+k+']');
 let access=null,loaded=null,operation=false,localSeq=0,page=1,lastHash=null,lastRetry=false,workspace;
 const live=()=>isVisible()&&!document.hidden&&host.isConnected;
 const state=(message,kind='neutral')=>{$('status').textContent=message;$('status').dataset.state=kind;};
 const request=async(url,options={})=>{
  if(!live())throw Object.assign(Error('La pantalla no está visible.'),{name:'AbortError'});
  const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),url==='/api/internal-auth'?10000:45000);
  const signal=options.signal?AbortSignal.any([options.signal,timeout.signal]):timeout.signal;
  try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal});const payload=await readOwnPayrollResponse(response,{maxBytes:2*1024*1024,signal});if(!response.ok||payload?.ok!==true)throw Object.assign(Error(response.status===401?'La sesión venció. Volvé a ingresar.':response.status===403?'Tu cuenta no permite esta operación.':payload?.error??'No se confirmó la operación. Consultá el mismo intento.'),{status:response.status,code:payload?.code});return payload;}
  finally{clearTimeout(timer);}
 };
 const reader=createNativeEmployeePickerReader({getAccess:()=>access,canUse:()=>live()&&!otherBlocked()&&WORKING_TIME_READ.every(c=>access?.caps.has(c)),required:WORKING_TIME_READ,onInvalidated:()=>suspend()});
 workspace=createCollectiveWorkingTimeWorkspace({
  isVisible:live,
  authorize:async options=>{const payload=await request('/api/internal-auth',options);access=ownRunWorkspaceAccess(payload);return payload;},
  readRoster:async options=>(await reader(options)).data,
  readBootstrap:async(contractId,period,options)=>(await request(endpoint+'?'+new URLSearchParams({resource:'bootstrap',contractId,period}),options)).data,
  readDetail:async(id,options)=>(await request(endpoint+'?'+new URLSearchParams({resource:'detail',id}),options)).data,
  sendCommand:async(attempt,options)=>(await request(endpoint,{...options,method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:JSON.stringify({operation:'command',payload:attempt.body})})).data,
  readAttempt:async(key,options)=>(await request(endpoint+'?'+new URLSearchParams({resource:'attempt',key}),options)).data,
  changed:()=>{render();changed();}
 });
 function controls(){
  const v=workspace.view(),busy=operation||v.working,unavailable=!live()||otherBlocked();
  $('inputs').disabled=busy||unavailable;
  $('mode').disabled=busy||unavailable||v.hasProgress;
  $('reason').readOnly=v.hasProgress;
  $('file').disabled=busy||unavailable||v.pending&&!v.canRetry;
  $('prepare').disabled=busy||unavailable||!loaded||v.pending&&!v.canRetry;
  $('confirm').disabled=busy||unavailable||!(v.phase==='prepared'||v.phase==='uncertain'&&v.canRetry);
  $('send').disabled=busy||unavailable||!$('confirm').checked||v.phase!=='prepared';
  $('send').textContent=$('mode').value==='propose'?'Registrar todas las propuestas revisadas':$('mode').value==='approve'?'Aprobar todas las propuestas revisadas':'Rechazar todas las propuestas revisadas';
  $('recover').hidden=!v.pending;$('recover').disabled=busy||unavailable;
  $('retry').hidden=!v.pending||!v.canRetry;$('retry').disabled=busy||unavailable||!v.reviewHash||!$('confirm').checked;
  $('resume').hidden=!v.hasProgress||!!v.reviewHash;$('resume').disabled=busy||unavailable;
  $('progress').hidden=!v.hasProgress;$('progress').disabled=busy||unavailable;
  $('review-file').hidden=!v.complete||$('mode').value!=='propose';$('review-file').disabled=busy||unavailable;
  $('new').disabled=busy||unavailable||v.pending||v.hasProgress&&!v.complete;
  $('progress-input').disabled=busy||unavailable||v.hasProgress||!!v.reviewHash;
  host.setAttribute('aria-busy',String(busy));
 }
 function declaration(card,title,d){card.append(node('h5',title));if(d===null){card.append(node('p','Sin declaración aprobada. No se supone cero.'));return;}const list=node('dl');for(const[label,value]of[['Horas diarias',d.dailyHours],['Horas mensuales',d.monthlyHours],['Fecha de constancia',d.asOfDate],['Constancia',d.documentReference]])list.append(node('dt',label),node('dd',value===null?'Sin informar':value));card.append(list);}
 function rows(){
  $('rows').replaceChildren();const v=workspace.view();if(v.masked||!v.reviewHash)return;
  const all=workspace.comparisons(),term=$('search').value.trim().toLocaleLowerCase('es-AR'),filtered=all.filter(r=>!term||r.legajo.toLocaleLowerCase('es-AR').includes(term)),pages=Math.max(1,Math.ceil(filtered.length/25));page=Math.min(Math.max(page,1),pages);
  for(const r of filtered.slice((page-1)*25,page*25)){const card=node('article');card.className='working-time-collective-row';card.append(node('h4','Legajo '+r.legajo),node('p',r.confirmed?'Comprobante individual confirmado.':r.action==='unchanged'?'Declaración aprobada sin cambios.':'Declaración completa para '+(r.action==='propose'?'proponer':r.action==='approve'?'aprobar':'rechazar')+'.'));const grid=node('div');grid.className='working-time-grid';const before=node('section'),after=node('section');declaration(before,'Antes',r.before);declaration(after,'Después',r.after);grid.append(before,after);card.append(grid);$('rows').append(card);}
  $('page').textContent='Página '+page+' de '+pages+' · '+filtered.length+' visibles de '+all.length;$('previous').disabled=page<=1;$('next').disabled=page>=pages;
 }
 function render(){
  if(!workspace)return;const v=workspace.view();if(lastHash!==v.reviewHash||!lastRetry&&v.canRetry){$('confirm').checked=false;lastHash=v.reviewHash;page=1;}lastRetry=v.canRetry;
  $('comparison').hidden=v.masked||!v.reviewHash;$('count').textContent=v.total+' contratos revisados · '+v.changed+' operaciones · '+v.unchanged+' sin cambios · '+v.confirmed+' comprobantes confirmados.';
  if(v.masked){$('rows').replaceChildren();$('search').value='';$('confirm').checked=false;}
  else if(v.reviewHash)rows();
  if(v.phase==='preparing')state('Verificando el conjunto completo: '+v.preparedCount+' de '+v.total+' contratos.');
  else if(v.phase==='sending')state('Registrando en orden: '+v.confirmed+' comprobantes confirmados. No cierres la página sin guardar el avance.');
  else if(v.phase==='complete')state('Conjunto recorrido por completo. Se conservan los comprobantes individuales; no se calcularon ni pagaron haberes.','success');
  controls();
 }
 function clearNominal(){loaded=null;$('file').value='';$('file-label').textContent='Sin archivo.';$('reason').value='';$('rows').replaceChildren();$('search').value='';$('confirm').checked=false;$('comparison').hidden=true;}
 async function action(work){if(operation||!live()||otherBlocked())return;const epoch=++localSeq;operation=true;controls();changed();try{await work();}catch(e){if(epoch===localSeq&&live()){if(workspace.view().masked||[401,403].includes(e.status)||/FORBIDDEN|SCOPE_CHANGED|SESSION_INVALID/.test(e.code??'')){access=null;clearNominal();}state(e.name==='AbortError'?'La operación se interrumpió. Consultá el mismo intento antes de continuar.':e.message,'warning');}}finally{if(epoch===localSeq){operation=false;render();changed();}}}
 async function readFile(input){const f=input.files?.[0];if(!f)throw Error('Elegí un archivo.');if(f.size>COLLECTIVE_WORKING_TIME_MAX_BYTES)throw Error('El archivo completo supera4MiB. No se recorta.');return JSON.parse(await f.text());}
 function download(value,name){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('file').addEventListener('change',()=>action(async()=>{const v=workspace.view();if(!v.hasProgress)workspace.suspend();const epoch=localSeq,value=collectiveWorkingTimeFile(await readFile($('file')));if(epoch!==localSeq||!live())return;loaded=value;$('file-label').textContent=value.total+' contratos · período '+value.period+'. Aún no se registró nada.';state('Archivo completo cargado. Revisá el fundamento y compará todas las declaraciones.');}));
 for(const key of['mode','reason'])$(key).addEventListener('input',()=>{if(workspace.view().hasProgress)return;workspace.suspend();reader.reset();state('Cambió la preparación. Volvé a comparar el conjunto completo.');render();changed();});
 $('prepare').addEventListener('click',()=>action(async()=>{if(!loaded)return;reader.reset();await workspace.prepare(loaded,$('mode').value,$('reason').value);state('Comparación completa verificada. Revisá todas sus páginas y confirmá el conjunto.');}));
 $('confirm').addEventListener('change',controls);$('send').addEventListener('click',()=>action(()=>workspace.send({confirmed:$('confirm').checked,reviewHash:workspace.view().reviewHash})));
 $('recover').addEventListener('click',()=>action(async()=>{const result=await workspace.recover();state(result?'Comprobante original recuperado. Podés continuar el conjunto revisado.':'El intento aún no está registrado. Sólo se habilita el mismo envío; si se retiró la vista, restaurá antes la preparación.');}));
 $('retry').addEventListener('click',()=>action(()=>workspace.retry({confirmed:$('confirm').checked,reviewHash:workspace.view().reviewHash})));
 $('resume').addEventListener('click',()=>action(async()=>{const hint=await workspace.resumeHint();$('mode').value=hint.command;$('reason').value=hint.reason;state('Avance de la cuenta original verificado. Cargá el mismo archivo completo de jornadas para volver a comparar.');}));
 $('progress').addEventListener('click',()=>action(async()=>download(await workspace.progressFile(),'avance-jornadas-propias.json')));
 $('review-file').addEventListener('click',()=>action(async()=>download(workspace.reviewFile(),'propuestas-jornadas-'+loaded.period+'.json')));
 $('progress-input').addEventListener('change',()=>action(async()=>{const value=await readFile($('progress-input'));await workspace.restore(value);clearNominal();const hint=await workspace.resumeHint();$('mode').value=hint.command;$('reason').value=hint.reason;state('Avance recuperado y comprobantes verificados. Consultá el intento pendiente o cargá el mismo archivo completo para continuar.');$('progress-input').value='';}));
 $('new').addEventListener('click',()=>{if(operation)return;try{workspace.startNew();reader.reset();clearNominal();state('Nuevo conjunto. Elegí archivo, operación y fundamento.');render();changed();}catch(e){state(e.message,'warning');}});
 $('search').addEventListener('input',()=>{page=1;rows();});$('previous').addEventListener('click',()=>{page--;rows();});$('next').addEventListener('click',()=>{page++;rows();});
 function suspend(){localSeq++;operation=false;access=null;reader.reset();workspace.suspend();clearNominal();state('Se retiraron los datos visibles. El avance y el intento incierto conservan sus referencias originales.','warning');controls();}
 const poll=setInterval(()=>{const v=workspace.view();if(live()&&!operation&&!v.working&&!otherBlocked()&&(loaded||v.hasProgress||v.reviewHash))action(()=>workspace.revalidate());},20000);
 window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
 controls();return {suspend,update:controls,blocking:()=>operation||workspace.view().working||workspace.view().hasProgress||!!workspace.view().reviewHash};
}
