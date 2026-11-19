import {createCajasControl} from './own-cajas-control-factory.js';
import {createCajasApiClient,CAJAS_SOURCE_MODES} from './own-cajas-api-client.js';
import {createCajasPanelView,node} from './own-cajas-panel-view.js';
import {ownReportQuery} from './own-payroll-report-model.js';
import {hasOwnRunAccess,ownRunEventCapabilities} from './own-payroll-run-workspace-model.js';
import {OWN_CLOSE_NOMINAL} from './own-payroll-close-model.js';
export function mountOwnCajasControl(host,{taskId='conciliacion',client=createCajasApiClient(),model=createCajasControl()}={}){
 const href=new URL('./own-cajas-panel.css',import.meta.url).href;
 if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){
  const link=node('link');link.rel='stylesheet';link.href=href;document.head.append(link);
 }
 const view=createCajasPanelView(host),$=view.$;
 let active=taskId===null,stopped=false,busy=false,sequence=0,controller=null,pollController=null;
 let bytes=null,loaded=null,preview=null,result=null,phase='empty',attempt=0,retryStage='read';
 const live=()=>active&&!stopped&&!document.hidden&&host.isConnected;
 const status=(text,state='pending')=>{$('status').textContent=text;$('status').dataset.state=state;};
 const mapping=()=>[...$('mappings').querySelectorAll('select')].filter(select=>select.value!=='')
  .map(select=>({kind:select.dataset.mappingKind,raw:select.dataset.mappingRaw,conceptCode:select.value}));
 const conceptCodes=()=>[...$('concepts').selectedOptions].map(option=>option.value);
 const query=()=>ownReportQuery({from:$('period').value,to:$('period').value,
  types:[...$('types').selectedOptions].map(option=>option.value)});
 function scope(codes=conceptCodes()){
  return {period:$('period').value,types:[...$('types').selectedOptions].map(option=>option.value),
   jurisdiction:$('jurisdiction').value,unit:$('unit').value,nature:$('nature').value,
   population:'complete_closed_participations',conceptCodes:codes};
 }
 function selection(maps,codes=conceptCodes()){
  return {profileId:$('profile').value,scope:scope(codes),amountColumn:$('column').value,
   conceptMappings:maps,declaredRoles:{}};
 }
 function audit(stage,outcome,error=null){
  const item=node('li','Intento '+attempt+' · '+stage+' · '+outcome+
   (error?.code?' · '+String(error.code).replace(/[^A-Z0-9_]/g,''):''));
  $('audit').append(item);while($('audit').children.length>20)$('audit').firstChild.remove();
 }
 function controls(){
  const available=live(),hasSource=!!loaded&&!!bytes;
  $('fields').disabled=busy||!available;$('read').disabled=busy||!available;
  $('mapping-box').disabled=busy||!available||!hasSource;
  $('compare').disabled=busy||!available||!hasSource||!$('confirm').checked||mapping().length===0||conceptCodes().length===0;
  $('clear').disabled=busy&&!available;host.setAttribute('aria-busy',String(busy));
 }
 function clearResults(){preview=null;result=null;view.clearResult();view.clearPreview();}
 function retire(message,{sensitive=false}={}){
  sequence++;controller?.abort();pollController?.abort();controller=null;pollController=null;
  client.retire();model.retire();busy=false;
  if(bytes)bytes.fill(0);bytes=null;loaded=null;clearResults();phase='empty';
  $('concepts').replaceChildren();$('mappings').replaceChildren();$('confirm').checked=false;
  $('source-summary').textContent='Primero leé el archivo y la fuente completa.';
  $('retry').hidden=true;$('error').hidden=true;
  if(sensitive)$('file').value='';
  status(message);controls();
 }
 function invalidateMapping(){
  sequence++;controller?.abort();controller=null;model.retire();busy=false;clearResults();phase=loaded?'mapping':'empty';
  $('retry').hidden=true;status('Cambió el alcance de conceptos o una correspondencia. Compará nuevamente el conjunto completo.');controls();
 }
 async function perform(stage,work){
  if(!live()||busy)return;
  const stamp=++sequence;controller=new AbortController();const owned=controller;
  const valid=()=>stamp===sequence&&live()&&!owned.signal.aborted;
  const timer=setTimeout(()=>owned.abort(),90000);
  busy=true;attempt++;retryStage=stage;$('error').hidden=true;$('retry').hidden=true;
  audit(stage,'iniciado');controls();
  try{await work({valid,signal:owned.signal});if(valid())audit(stage,'completo');}
  catch(error){
   if(stamp===sequence&&live()){
    model.retire();clearResults();
    if([401,403].includes(error.status)){
     retire('Se retiró la revisión por un cambio de sesión o permisos.',{sensitive:true});
     $('login').hidden=error.status!==401;
    }else{
     const message=error.name==='AbortError'?'La lectura no se completó. Reintentá el conjunto entero sin recortar el archivo.':error.message;
     $('error').textContent=message;$('error').hidden=false;$('retry').hidden=false;
     $('retry').textContent=stage==='compare'?'Reintentar comparación completa':'Reintentar lectura completa';
     phase=loaded?'mapping':'error';status(message,'error');$('error').focus();
    }
    audit(stage,'no completado',error);
   }
  }finally{clearTimeout(timer);if(stamp===sequence){busy=false;controller=null;controls();}}
 }
 async function read(){
  if(!live()||busy)return;
  if(!$('form').reportValidity())return;
  retire('Leyendo el conjunto completo…');
  return perform('read',async({valid,signal})=>{
   const file=$('file').files[0];
   if(!file)throw Error('Elegí el Excel de cajas asistenciales.');
   if(file.size<=0||file.size>8*1024*1024)throw Error('El Excel debe tener contenido y no superar8MiB. No se recortaron filas.');
   const native=await client.load(query(),{mode:$('mode').value,signal});if(!valid())return;
   const local=new Uint8Array(await file.arrayBuffer());
   if(!valid()){local.fill(0);return;}bytes=local;
   const next=await model.decode(bytes,selection([],[]),{signal});if(!valid())return;
   loaded=native;preview=next;phase='mapping';$('login').hidden=true;
   view.populateMappings(loaded,preview);view.renderPreview(preview);
   $('source-notice').textContent=CAJAS_SOURCE_MODES[native.mode].notice;
   status('Archivo completo leído. Declarar correspondencias y conceptos todavía no acredita el control externo.');
  });
 }
 async function compare(){
  if(!live()||busy||!loaded||!bytes)return;
  const maps=mapping(),codes=conceptCodes();
  if(!maps.length||!codes.length||!$('confirm').checked){
   status('Elegí el alcance de conceptos y confirmá al menos una correspondencia explícita.','error');return;
  }
  const chosen=selection(maps,codes),original=loaded;model.retire();clearResults();
  return perform('compare',async({valid,signal})=>{
   const fresh=await client.revalidate(original,{signal});if(!valid())return;
   const next=await model.decode(bytes,chosen,{signal});if(!valid())return;
   const source=await model.prepareOwn(fresh.input,chosen.scope);if(!valid())return;
   const compared=model.compare(next,source);if(!valid())return;
   loaded=fresh;preview=next;result=compared;phase='result';view.renderPreview(preview);view.renderComparison(result);
   const messages={known_mismatch:'Hay diferencias conocidas. Revisá cada concepto; no se compensan.',
    incomplete:'La cobertura está incompleta. Se conservan las filas faltantes, extra o sin alcance verificado.',
    unknown:'Hay valores o identidades sin verificar. No hay coincidencia global.',
    scope_unverified:'Sin diferencias entre valores conocidos. El alcance externo y el histórico independiente siguen pendientes.'};
   status(messages[result.status],result.status);
  });
 }
 const onSubmit=event=>{event.preventDefault();read();};
 $('form').addEventListener('submit',onSubmit);
 $('compare').addEventListener('click',compare);
 $('retry').addEventListener('click',()=>retryStage==='compare'&&loaded?compare():read());
 $('clear').addEventListener('click',()=>retire('Se retiró el archivo y la revisión.',{sensitive:true}));
 $('login').addEventListener('click',()=>{location.href='login.html?returnTo='+encodeURIComponent('nomina-control.html#conciliacion');});
 for(const key of ['period','types','jurisdiction','unit','nature','profile','column','mode','file'])
  $(key).addEventListener('change',()=>{
   retire('Cambió el archivo o el alcance. Leé nuevamente el conjunto completo.');
   if(key==='profile')view.columns();
   if(key==='mode')$('source-notice').textContent=CAJAS_SOURCE_MODES[$('mode').value]?.notice??'Elegí la base de lectura propia.';
  });
 for(const key of ['concepts','confirm','mappings'])$(key).addEventListener('change',invalidateMapping);
 $('sheet').addEventListener('change',()=>{if(preview)view.renderSheet(preview);});
 const task=event=>{if(taskId===null)return;active=event.detail?.id===taskId;if(!active)retire('Se retiraron los datos al cambiar de tarea.',{sensitive:true});else controls();};
 const visibility=()=>{if(document.hidden)retire('Se retiraron los datos al ocultar la página.',{sensitive:true});else controls();};
 const revoke=event=>{if(!hasOwnRunAccess(ownRunEventCapabilities(event.detail?.tenantCapabilities),OWN_CLOSE_NOMINAL))retire('Se retiraron los datos por cambio de permisos.',{sensitive:true});};
 const logout=()=>retire('Sesión cerrada. Se retiraron los datos.',{sensitive:true});
 document.addEventListener('taskchange',task);document.addEventListener('visibilitychange',visibility);
 document.addEventListener('municontrol:capabilities-ready',revoke);document.addEventListener('municontrol:session-changed',logout);
 document.getElementById('logoutButton')?.addEventListener('click',logout);
 const poll=setInterval(async()=>{
  if(!live()||busy||!loaded||pollController)return;
  const stamp=sequence,owned=new AbortController();pollController=owned;
  const timeout=setTimeout(()=>owned.abort(),15000);
  try{await client.checkSession({signal:owned.signal});}
  catch{if(stamp===sequence&&live())retire('No se pudo revalidar la sesión. Volvé a leer con la cuenta autorizada.',{sensitive:true});}
  finally{clearTimeout(timeout);if(pollController===owned)pollController=null;}
 },60000);
 function destroy(){
  stopped=true;active=false;retire('Página retirada.',{sensitive:true});clearInterval(poll);
  document.removeEventListener('taskchange',task);document.removeEventListener('visibilitychange',visibility);
  document.removeEventListener('municontrol:capabilities-ready',revoke);document.removeEventListener('municontrol:session-changed',logout);
  document.getElementById('logoutButton')?.removeEventListener('click',logout);
 }
 window.addEventListener('pagehide',destroy,{once:true});view.columns();controls();
 return Object.freeze({destroy,retire,getState:()=>Object.freeze({phase,busy,hasPreview:!!preview,
  hasSource:!!loaded,hasResult:!!result,attempt,admission:'not_admitted'})});
}
