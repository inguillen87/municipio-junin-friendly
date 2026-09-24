import {STRUCTURE_COLUMNS,STRUCTURE_LIMITS,verifyBudgetStructure,structureView} from './budget-structure-model.js';
import {mountBudgetPayroll} from './budget-payroll-workbench.js';
import {budgetStructurePdf} from './budget-structure-pdf.js';
const REQUIRED=['workforce.structure.read','workforce.employee.read'];
const permitted=s=>s?.ok===true&&s.authenticated===true&&s.sessionVersion===2&&typeof s.user?.id==='string'&&typeof s.access?.tenant?.id==='string'&&REQUIRED.every(c=>s.access.tenantCapabilities?.includes(c))&&Number.isFinite(Date.parse(s.expiresAt))&&Date.parse(s.expiresAt)>Date.now();
const auth=async signal=>{const bounded=AbortSignal.any([signal,AbortSignal.timeout(15000)]);const r=await fetch('/api/internal-auth',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:bounded});if(!r.ok)throw Error('SESSION_REQUIRED');const s=await r.json();if(!permitted(s))throw Error('SESSION_REQUIRED');return s;};
export function readBudgetStructureFile(file,{signal,onProgress=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  if(!file||file.size<5||file.size>STRUCTURE_LIMITS.bytes||signal?.aborted)return reject(Error('STRUCTURE_FILE'));
  let worker;let settled=false;
  const finish=(error,data)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(data)};
  const abort=()=>finish(Error('STRUCTURE_CANCELLED')),timer=setTimeout(()=>finish(Error('STRUCTURE_TIMEOUT')),45000);
  signal?.addEventListener('abort',abort,{once:true});
  void (async()=>{try{
   const buffer=await file.arrayBuffer();if(settled)return;if(buffer.byteLength!==file.size)throw Error('STRUCTURE_FILE');
   worker=new Worker('/assets/budget-structure-worker.js',{type:'module'});
   worker.onerror=()=>finish(Error('STRUCTURE_NOT_VERIFIED'));
   worker.onmessage=({data})=>{if(data?.type==='progress'){if(Number.isInteger(data.page)&&Number.isInteger(data.total)&&data.page>=1&&data.page<=data.total&&data.total<=STRUCTURE_LIMITS.pages)onProgress(data.page,data.total)}
    else if(data?.type==='result'){try{finish(null,verifyBudgetStructure(data.result))}catch(e){finish(e)}}else finish(Error('STRUCTURE_NOT_VERIFIED'))};
   worker.postMessage({buffer},[buffer]);
  }catch(e){finish(e)}})();
 });
}
export function mountBudgetStructure(host,{readSession=auth,readFile=readBudgetStructureFile,download=(bytes)=>{
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='municontrol_estructura_documental.pdf';a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}}={}){
 let data=null,context=null,revision=0,pending=null,expiry=null,blocked=false,disposed=false,query='',order='source',mode='detailed',page=1;const memberPages=new Map(),PAGE=5;
 const add=(parent,tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;parent.append(el);return el;};
 host.classList.add('bs-workbench');host.id='estructura-presupuestaria';
 add(host,'p','NOELIA · MÓDULO 10 · FUENTE DOCUMENTAL','bs-eyebrow');add(host,'h2','Estructura presupuestaria de cargos');
 add(host,'p','Abrí el reporte detallado de GRH para buscar cargos, revisar sus legajos y obtener un PDF simple o detallado. El archivo se procesa sólo en este navegador; no se sube ni se incorpora al padrón.');
 const note=add(host,'p','Abajo podés cotejar la presencia de legajos con una corrida concreta. El cupo anual aprobado y la validación del cargo liquidado siguen pendientes de evidencia y vinculación. “Cant”, “Estado” y “Vacante” se conservan como figuran en el documento.','bs-note');
 const controls=add(host,'div',undefined,'bs-controls'),label=add(controls,'label','Reporte PDF de estructura · Junín'),file=add(label,'input');file.type='file';file.accept='.pdf,application/pdf';file.setAttribute('aria-label','Reporte PDF de estructura');
 const clear=add(controls,'button','Limpiar / cancelar');clear.type='button';
 const status=add(host,'p','Esperando el reporte detallado. Hasta 8 MiB y 120 páginas.','bs-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const tools=add(host,'div',undefined,'bs-controls');tools.hidden=true;
 const searchLabel=add(tools,'label','Buscar cargo, código, legajo o nombre'),search=add(searchLabel,'input');search.type='search';search.maxLength=120;
 const modeLabel=add(tools,'label','Vista'),view=add(modeLabel,'select');view.setAttribute('aria-label','Vista');for(const [v,t]of [['detailed','Detallada'],['simple','Simple']]){const o=add(view,'option',t);o.value=v}
 const orderLabel=add(tools,'label','Orden de legajos'),sort=add(orderLabel,'select');sort.setAttribute('aria-label','Orden de legajos');for(const [v,t]of [['source','Original'],['number','Número de legajo'],['name','Alfabético']]){const o=add(sort,'option',t);o.value=v}
 const exportButton=add(tools,'button','Exportar PDF');exportButton.type='button';
 const result=add(host,'div',undefined,'bs-result');
 const cotejoHost=add(host,'section');const cotejo=mountBudgetPayroll(cotejoHost,{authorize:check});
 const setStatus=t=>{status.textContent=t;};
 function busy(value){host.setAttribute('aria-busy',String(value));file.disabled=blocked||value;exportButton.disabled=value;search.disabled=value;view.disabled=value;sort.disabled=value;}
 function cancel(){revision++;pending?.abort();pending=null;clearTimeout(expiry);expiry=null;}
 function erase(message='Reporte retirado. No se conservaron registros en este navegador.'){
  cotejo.clear();cancel();data=null;context=null;query='';order='source';mode='detailed';page=1;memberPages.clear();file.value='';search.value='';view.value='detailed';sort.value='source';tools.hidden=true;result.replaceChildren();result.hidden=false;busy(false);setStatus(message);
 }
 function revoke(){blocked=true;erase('El acceso o la institución de la sesión cambió. Se retiraron los datos. Volvé a abrir la página.');file.disabled=true;clear.disabled=true;}
 const signature=s=>JSON.stringify([s.user.id,s.access.tenant.id,s.access.tenant.roleKey]);
 async function check(signal){
  const s=await readSession(signal);if(!permitted(s)||context&&signature(s)!==context){revoke();throw Error('SESSION_REQUIRED')}
  if(signal.aborted||disposed||blocked)throw Error('STRUCTURE_CANCELLED');context=signature(s);clearTimeout(expiry);expiry=setTimeout(revoke,Math.min(2147483647,Math.max(1,Date.parse(s.expiresAt)-Date.now())));return s;
 }
 function draw(){
  result.replaceChildren();if(!data||blocked||disposed)return;tools.hidden=false;
  const v=structureView(data,{query,order,mode}),totalPages=Math.max(1,Math.ceil(v.groups.length/PAGE));page=Math.min(page,totalPages);
  const summary=add(result,'div',undefined,'bs-metrics');for(const [n,t]of [[v.visibleGroups,'Estructuras del filtro'],[v.assignments,'Filas nominales'],[v.distinctNumbers,'Legajos distintos'],[v.reportedQuantity,'Cant informada']]){const card=add(summary,'div');add(card,'strong',n);add(card,'span',t)}
  add(result,'p',data.sourcePages+' páginas leídas · Emisión informada: '+data.issuedAt+' · '+v.zeroQuantityGroups+' estructuras con Cant 0. Una cantidad cero no se interpreta como vacante.','bs-note');
  if(v.mismatchedGroups)add(result,'p',v.mismatchedGroups+' estructuras presentan diferencias entre Cant y el detalle nominal. No se corrigió la fuente.','bs-attention');
  add(result,'p','La búsqueda selecciona estructuras completas. No recorta sus legajos ni altera sus cantidades. El archivo no informa vigencia individual: no se aplica un filtro de activos por inferencia.','bs-note');
  const fingerprints=add(result,'details');add(fingerprints,'summary','Identificación del archivo fuente');add(fingerprints,'p','SHA-256: '+data.sha256,'bs-hash');
  const nav=add(result,'div',undefined,'bs-pager');
  const prev=add(nav,'button','Estructuras anteriores');prev.type='button';prev.disabled=page===1;prev.onclick=()=>{page--;draw()};add(nav,'span','Página '+page+' de '+totalPages);
  const next=add(nav,'button','Estructuras siguientes');next.type='button';next.disabled=page===totalPages;next.onclick=()=>{page++;draw()};
  const cards=add(result,'div',undefined,'bs-cards');if(!v.groups.length)add(cards,'p','Sin estructuras que coincidan con la búsqueda.');
  for(const g of v.groups.slice((page-1)*PAGE,page*PAGE)){
   const card=add(cards,'article',undefined,'bs-card');add(card,'p','ID '+g.values[0]+' · Página '+g.sourcePage+' del original','bs-eyebrow');add(card,'h3',g.values[7]);
   const fields=add(card,'dl',undefined,'bs-fields');STRUCTURE_COLUMNS.forEach((name,i)=>{if(i===7)return;const field=add(fields,'div');add(field,'dt',name);add(field,'dd',g.values[i]||'Sin dato')});
   if(mode==='detailed'){
    const table=add(card,'table'),caption=add(table,'caption','Legajos del detalle · '+g.members.length+' filas');const head=add(add(table,'thead'),'tr');for(const t of ['Legajo','Nombre','Pág. fuente']){const th=add(head,'th',t);th.scope='col'}
    const body=add(table,'tbody'),memberTotal=Math.max(1,Math.ceil(g.members.length/25)),memberPage=Math.min(memberPages.get(g.values[0])??1,memberTotal);
    for(const m of g.members.slice((memberPage-1)*25,memberPage*25)){const row=add(body,'tr');add(row,'td',m.number);add(row,'td',m.name);add(row,'td',m.sourcePage)}
    if(!g.members.length){const cell=add(add(body,'tr'),'td','Sin legajos detallados en el archivo.');cell.colSpan=3}
    if(memberTotal>1){const pager=add(card,'div',undefined,'bs-pager'),a=add(pager,'button','Legajos anteriores'),b=add(pager,'button','Legajos siguientes');a.type=b.type='button';a.disabled=memberPage===1;b.disabled=memberPage===memberTotal;add(pager,'span',memberPage+' de '+memberTotal);a.onclick=()=>{memberPages.set(g.values[0],memberPage-1);draw()};b.onclick=()=>{memberPages.set(g.values[0],memberPage+1);draw()}}
   }
  }
 }
 clear.onclick=()=>erase();
 file.onchange=async()=>{
  const source=file.files?.[0];erase('Verificando la sesión y el archivo…');if(!source)return;const token=++revision,controller=new AbortController();pending=controller;busy(true);
  try{await check(controller.signal);const parsed=await readFile(source,{signal:controller.signal,onProgress:(p,n)=>{if(token===revision)setStatus('Leyendo texto nativo · página '+p+' de '+n)}});
   await check(controller.signal);if(token!==revision||disposed||blocked)return;data=verifyBudgetStructure(parsed);draw();cotejo.setSource(data);setStatus('Reporte leído completo. La exportación incluye todas las estructuras del filtro, no sólo esta página.');
  }catch(error){if(token===revision&&!blocked){erase(error?.message==='STRUCTURE_TIMEOUT'?'La lectura agotó su plazo. No se conservó un resultado parcial.':'No se pudo verificar el reporte o la sesión. Se retiraron los datos; podés volver a seleccionar el archivo.')}}
  finally{if(token===revision){pending=null;busy(false)}}
 };
 search.oninput=()=>{query=search.value;page=1;memberPages.clear();draw()};view.onchange=()=>{mode=view.value;draw()};sort.onchange=()=>{order=sort.value;memberPages.clear();draw()};
 exportButton.onclick=async()=>{
  if(!data||pending||blocked)return;const snapshot=data,filters={query,order,mode},token=revision,controller=new AbortController();pending=controller;busy(true);setStatus('Comprobando acceso antes de generar el PDF…');
  try{await check(controller.signal);if(token!==revision||data!==snapshot||disposed||blocked)return;const bytes=budgetStructurePdf(snapshot,filters);download(bytes);setStatus('PDF generado con todas las estructuras del filtro y la huella del original. No es una conciliación homologada ni un documento firmado.')}
  catch{if(token===revision&&!blocked)erase('No se pudo autorizar o completar la exportación. Los datos se retiraron.')}
  finally{if(token===revision){pending=null;busy(false)}}
 };
 const onFocus=async()=>{if(!data||pending||blocked||disposed||document.visibilityState!=='visible')return;const token=revision,c=new AbortController();pending=c;busy(true);result.hidden=true;try{await check(c.signal)}catch{if(token===revision&&!blocked)revoke()}finally{if(token===revision){pending=null;busy(false);result.hidden=false}}};
 const onShow=e=>{if(e.persisted&&disposed)location.reload()};
 const onHide=()=>{if(disposed)return;cotejo.destroy();erase();disposed=true;globalThis.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);document.removeEventListener('municontrol:capabilities-ready',revoke);observer.disconnect();host.replaceChildren()};
 const observer=new MutationObserver(()=>{if(!host.isConnected)onHide()});observer.observe(document.body,{childList:true,subtree:true});
 document.addEventListener('municontrol:capabilities-ready',revoke);globalThis.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);globalThis.addEventListener('pagehide',onHide,{once:true});globalThis.addEventListener('pageshow',onShow);
 return{destroy:onHide,clear:erase};
}
export async function mountAuthorizedBudgetStructure(host){
 host.textContent='Verificando acceso a la estructura documental…';let authorized=false;
 try{
  if(globalThis.MuniControlCapabilityGate?.ready){const access=await globalThis.MuniControlCapabilityGate.ready;authorized=!!access&&REQUIRED.every(c=>access.tenantCapabilities?.has(c));}
  else authorized=permitted(await auth(new AbortController().signal));
 }catch{authorized=false;}
 if(!host.isConnected)return null;
 if(!authorized){host.textContent='La estructura documental requiere una sesión autorizada para consultar estructura y legajos.';return null;}
 host.replaceChildren();return mountBudgetStructure(host);
}

