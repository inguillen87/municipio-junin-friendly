import {GRH_IMPORT_CAPABILITIES,grhAuthority,grhFileRequest,grhPreview,grhWriteAttempt,grhReceipt,grhAmount} from './payroll-grh-import-model.js';
const endpoint='/api/internal-payroll-novelties',q=id=>document.getElementById(id);
const permitted=caps=>{const set=Array.isArray(caps)||caps instanceof Set?new Set(caps):new Set();return GRH_IMPORT_CAPABILITIES.every(c=>set.has(c));};
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
let scope=null,bytes=null,expected=null,view=null,validPreview=null,choices=new Map(),active=null,revision=0,pending=null,saved=false,blocked=false,page=1;
const notice=(id,text,kind='')=>{q(id).textContent=text;q(id).dataset.kind=kind;};
const eligible=()=>Boolean(validPreview?.readyToPrepare&&!active&&!pending&&!saved&&!blocked);
function controls(){q('entryFields').disabled=Boolean(active||pending||saved||blocked);q('saveButton').disabled=!eligible();q('cancelReview').hidden=!active||Boolean(pending);q('intake').setAttribute('aria-busy',String(Boolean(active)));q('retryButton').disabled=Boolean(active||blocked);}
function clearResult(){view=null;validPreview=null;expected=null;choices.clear();page=1;q('search').value='';q('previewPanel').hidden=true;q('rows').replaceChildren();q('metrics').replaceChildren();controls();}
function stop(){revision++;active?.abort();active=null;controls();}
function retire(message){stop();clearResult();bytes?.fill(0);bytes=null;q('file').value='';pending=null;saved=false;q('writeState').hidden=true;notice('progress',message);controls();}
function safeFailure(error){const codes={PAYROLL_NOVELTY_IDENTITY_CHANGED:'Cambió la identidad, la selección o la fuente. Volvé a revisar el TXT completo.',PAYROLL_NOVELTY_DUPLICATE_BATCH:'Ya existe un lote con las mismas novedades. Revisá los lotes antes de intentar una nueva carga.',PAYROLL_NOVELTY_LEGAJO_NOT_FOUND:'Un legajo no tiene un contrato activo y único en la fuente. Revisá los vínculos.',PAYROLL_NOVELTY_GRH_INPUT_INVALID:'El TXT no coincide con el formato elegido. No se guarda una parte del archivo.',PAYROLL_NOVELTY_IDEMPOTENCY_REUSE:'La clave de esta operación ya corresponde a otro contenido. Consultá los lotes existentes.',GRH_SOURCE_CHANGED:'Cambió la fuente municipal mientras se revisaba el archivo. Volvé a consultar.',PAYROLL_NOVELTY_CONCEPT_INVALID:'El concepto no está disponible en la fuente municipal.'};return codes[error.code]||(error.status===401?'La sesión venció. Volvé a ingresar.':error.status===403?'La sesión ya no habilita esta importación. Se retiraron los datos.':error.name==='AbortError'||error.name==='TimeoutError'?'La consulta se interrumpió o agotó su plazo.':'La operación no pudo completarse o verificarse.');}
async function request(url,init={},controller){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',...init,signal:controller?.signal??init.signal});
 if(!r.ok){let code=null;try{const b=await r.json();code=b.code;}catch{}throw Object.assign(Error('HTTP_ERROR'),{status:r.status,code});}
 if(!/^application\/json\b/i.test(r.headers.get('content-type')||'')||!/(?:^|,)\s*(?:private\s*,\s*)?no-store\b/i.test(r.headers.get('cache-control')||''))throw Error('REPLY_NOT_PRIVATE_JSON');
 const reader=r.body.getReader(),parts=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>3*1024*1024)throw Error('REPLY_TOO_LARGE');parts.push(value);}const all=new Uint8Array(total);let at=0;for(const p of parts){all.set(p,at);at+=p.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function authorize(){const b=await request(endpoint+'?resource=bootstrap',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});if(b.ok!==true)throw Error('BOOTSTRAP_INVALID');return grhAuthority(b);}
function deny(error){blocked=true;retire(safeFailure(error));notice('accessStatus',safeFailure(error),'error');q('intake').hidden=true;if(error.status===401)location.replace('acceso-interno.html?next='+encodeURIComponent('/importar-novedades-grh.html'));}
function render(){
 if(!view)return;q('previewPanel').hidden=false;q('metrics').replaceChildren();
 for(const [label,value]of [['Registros leídos',view.inputRows],['Vínculos resueltos',view.resolvedRows],['Pendientes',view.outputRows-view.resolvedRows],['Importe del archivo',grhAmount(view.totalAmountCents)]]){const card=node('div');card.className='metric';card.append(node('span',label),node('strong',String(value)));q('metrics').append(card);}
 q('fileReference').textContent='SHA-256 del archivo original: '+view.sourceSha256;
 const ready=Boolean(validPreview?.readyToPrepare),over=view.outputRows>view.writerLimit;
 notice('reviewStatus',!validPreview?'Cambiaste una selección de vínculo. Volvé a revisar el archivo antes de guardar.':over?'El archivo contiene '+view.outputRows+' registros; el guardado actual admite '+view.writerLimit+'. No se divide ni se guarda una parte.':ready?'Archivo completo revisado: '+view.outputRows+' de '+view.inputRows+' registros con vínculo definido. Todavía no se guardaron novedades.':'Hay vínculos pendientes. Los casos sin coincidencia deben corregirse en el padrón; para vínculos múltiples de la misma persona, elegí el contrato correspondiente y volvé a revisar.',ready?'success':'warning');
 const needle=q('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const all=view.rows.filter(r=>[r.dni,...r.candidates.flatMap(c=>[c.legajo,c.name])].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle));const pages=Math.max(1,Math.ceil(all.length/50));page=Math.min(page,pages);q('rows').replaceChildren();
 for(const r of all.slice((page-1)*50,page*50)){const tr=node('tr');tr.append(node('td',String(r.rowOrdinal)),node('td',r.dni));const subject=node('td');
  const chosen=choices.get(r.rowOrdinal)||r.contractId,c=r.candidates.find(c=>c.contractId===chosen);
  if(r.status==='identity_review')subject.append(node('span','Identidad duplicada en el padrón. Requiere corrección.'));
  else if(r.candidates.length>1){const s=node('select');s.setAttribute('aria-label','Vínculo de la fila '+r.rowOrdinal);s.append(new Option('Elegí el contrato de esta persona',''));for(const c of r.candidates)s.append(new Option(c.legajo+' · '+c.name,c.contractId));s.value=chosen||'';s.disabled=Boolean(active||pending||saved);s.onchange=()=>{if(s.value)choices.set(r.rowOrdinal,s.value);else choices.delete(r.rowOrdinal);validPreview=null;render();};subject.append(s);}
  else if(c){subject.append(node('strong','Legajo '+c.legajo),node('small',c.name));}else subject.append(node('span','Sin vínculo para este período'));
  tr.append(subject,node('td',r.conceptSourceId),node('td',grhAmount(r.amountCents)));const state=node('td'),tag=node('span',({resolved:'Vínculo definido',choose_contract:'Elegir contrato',not_found:'No encontrado',duplicate_target:'Legajo duplicado',identity_review:'Revisar identidad'})[r.status]);tag.className='status-tag '+(r.status==='resolved'?'':r.status==='choose_contract'?'warn':'bad');state.append(tag);tr.append(state);q('rows').append(tr);
 }
 if(!all.length){const td=node('td','No hay coincidencias para esta búsqueda. El archivo completo permanece seleccionado.');td.colSpan=6;const tr=node('tr');tr.append(td);q('rows').append(tr);}
 q('visibleCount').textContent=all.length+' de '+view.outputRows+' registros coinciden';q('pageLabel').textContent='Página '+page+' de '+pages;q('previous').disabled=page===1;q('next').disabled=page===pages;controls();
}
async function review(event){event?.preventDefault();if(blocked||active||pending||saved)return;
 const file=q('file').files?.[0];if(!file||!/^.+\.txt$/i.test(file.name)){notice('progress','Seleccioná el archivo .txt original.');return;}
 const period=q('period').value,concept=q('concept').value;if(!/^\d{4}-\d{2}$/.test(period)||!/^[1-9]\d{0,19}$/.test(concept)){notice('progress','Completá concepto y período.');return;}
 const controller=new AbortController(),seq=++revision;active=controller;controls();notice('progress','Leyendo el archivo y comprobando sus vínculos…');validPreview=null;const timer=setTimeout(()=>controller.abort(),45000);
 try{
  if(file.size<1||file.size>150000)throw Error('El TXT está vacío o supera el tamaño admitido.');bytes?.fill(0);bytes=new Uint8Array(await file.arrayBuffer());if(seq!==revision||controller.signal.aborted)return;
  const prepared=await grhFileRequest(bytes,{concept,periodMonth:period+'-01',choices:[...choices].map(([rowOrdinal,contractId])=>({rowOrdinal,contractId}))});
  const p=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({command:'grhPreview',payload:prepared.request})},controller);
  const checked=grhPreview(p,prepared);if(seq!==revision||controller.signal.aborted)return;
  if(await authorize()!==scope)throw Object.assign(Error('SCOPE_CHANGED'),{status:403});if(seq!==revision||controller.signal.aborted)return;expected=prepared;view=checked;validPreview=checked;page=1;notice('progress','Revisión completada. No se guardó ninguna novedad.');render();q('previewTitle').tabIndex=-1;q('previewTitle').focus({preventScroll:true});
 }catch(error){if(seq!==revision)return;if([401,403].includes(error.status)){deny(error);return;}clearResult();notice('progress',error.status?safeFailure(error):String(error.message==='HTTP_ERROR'?safeFailure(error):error.message));}
 finally{clearTimeout(timer);if(active===controller){active=null;controls();render();}}
}
async function save(){if(!eligible())return;pending=grhWriteAttempt(expected,validPreview,crypto.randomUUID(),scope);await performWrite();}
async function performWrite(){
 if(!pending||active||blocked)return;const attempt=pending,controller=new AbortController(),seq=++revision;active=controller;q('writeState').hidden=false;q('retryButton').hidden=true;q('newButton').hidden=true;notice('writeMessage','Guardando el lote completo. No vuelvas a enviar el archivo mientras se confirma el resultado.');controls();render();const timer=setTimeout(()=>controller.abort(),45000);let sent=false;
 try{
  const currentScope=await authorize();if(currentScope!==scope||seq!==revision)throw Object.assign(Error('SCOPE_CHANGED'),{status:403});
  sent=true;const result=await request(attempt.url,{method:'POST',headers:attempt.headers,body:attempt.body},controller);const receipt=await grhReceipt(result,expected,validPreview);if(seq!==revision||controller.signal.aborted)return;
  pending=null;saved=true;q('newButton').hidden=false;notice('writeMessage',receipt.inputRows+' registros leídos · '+receipt.savedRows+' guardados · 0 omitidos. Lote '+receipt.batch.id+' en borrador'+(result.replayed?' · Se recuperó el recibo del mismo guardado.':'.')+' Observaciones bloqueantes: '+(Number.isInteger(receipt.batch.blockingIssueCount)?receipt.batch.blockingIssueCount:'consultar lote')+'. Todavía no se calculó ni se confirmó una liquidación.','success');
  q('writeTitle').tabIndex=-1;q('writeTitle').focus({preventScroll:true});
 }catch(error){if(seq!==revision)return;
  if([401,403].includes(error.status)){deny(error);return;}
  const uncertain=sent&&(!error.status||error.status>=500||error.status===408);
  if(uncertain){q('retryButton').hidden=false;notice('writeMessage','No se recibió una confirmación verificable. El lote puede haberse guardado. Consultá o reintentá la misma operación: se conservarán el archivo, la selección y la clave para evitar duplicados.','warning');}
  else{pending=null;validPreview=null;notice('writeMessage',safeFailure(error)+' No se habilita un nuevo guardado sin revisar otra vez.','error');}
 }finally{clearTimeout(timer);if(active===controller){active=null;controls();render();}}
}
q('importForm').onsubmit=review;q('saveButton').onclick=save;q('retryButton').onclick=performWrite;
q('file').onchange=()=>{if(active||pending||saved)return;clearResult();bytes?.fill(0);bytes=null;q('writeState').hidden=true;notice('progress','Archivo cambiado. Revisá el contenido completo antes de guardar.');controls();};
for(const id of ['concept','period','profile','payrollType'])q(id).oninput=()=>{if(pending||saved)return;stop();clearResult();q('writeState').hidden=true;notice('progress','Selección modificada. Volvé a revisar el TXT para este destino.');};
q('search').oninput=()=>{page=1;render();};q('previous').onclick=()=>{page--;render();};q('next').onclick=()=>{page++;render();};
q('clearButton').onclick=()=>{if(!pending)retire('Archivo y resultado retirados.');};q('newButton').onclick=()=>{retire('Seleccioná el archivo de la nueva importación.');q('file').focus();};
q('cancelReview').onclick=()=>{stop();clearResult();notice('progress','Espera cancelada. La revisión no guarda novedades; el archivo sigue seleccionado para reintentar.');};
document.addEventListener('municontrol:capabilities-ready',event=>{const caps=event.detail?.tenantCapabilities;if(scope&&!permitted(caps))deny({status:403});});
document.addEventListener('visibilitychange',()=>{if(document.hidden){const wasWrite=Boolean(pending);blocked=true;retire(wasWrite?'Se retiraron los datos al ocultar la pantalla. Un guardado enviado podría haber terminado; revisá los lotes al volver.':'Se retiraron los datos al ocultar la pantalla. Volvé a abrir la importación.');notice('accessStatus','Volvé a abrir esta página para comprobar la sesión de nuevo.','warning');}});
window.addEventListener('pagehide',()=>{blocked=true;retire('');});
try{const gate=await window.MuniControlCapabilityGate?.ready;if(!gate||!permitted(gate.tenantCapabilities))throw Object.assign(Error('ACCESS'),{status:403});scope=await authorize();q('intake').hidden=false;notice('accessStatus','Acceso verificado para preparar y revisar novedades nominales.','success');controls();}catch(error){deny(error);}
