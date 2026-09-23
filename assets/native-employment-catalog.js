import {CATALOG_KINDS,catalogProposalInput,catalogReviewInput,catalogDiff,validateCatalogBootstrap,validateCatalogProposal,validateCatalogReceipt} from './native-employment-catalog-model.js';
const API='/api/internal-employment-catalog',PAGE=50;
const labels={agreements:'Convenios',categories:'Categorías / clases',organizations:'Sectores',sectors:'Reparticiones'};
const natural=new Intl.Collator('es',{numeric:true}),displayItems=items=>[...items].sort((a,b)=>CATALOG_KINDS.indexOf(a.kind)-CATALOG_KINDS.indexOf(b.kind)||natural.compare(a.agreementCode||'',b.agreementCode||'')||natural.compare(a.code,b.code)||a.code.localeCompare(b.code));
const statuses={pending:'Pendiente de revisión',approved:'Aprobada y publicada',rejected:'Rechazada'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action)=>{const b=el('button',text,'ec-button');b.type='button';if(action)b.dataset.ecAction=action;return b;};
const stamp=value=>value?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Sin publicación propia';
const message=e=>[401,403].includes(e.status)?'Tu sesión o permiso cambió. Volvé a consultar con una sesión autorizada.':e.code==='CATALOG_ACTOR_CHANGED'?'Cambió la cuenta o el ámbito. Se descartó el borrador; ningún intento anterior se reenviará desde esta identidad.':e.status===409?'El catálogo o la propuesta cambió. Conservamos tu borrador; revisá la versión vigente antes de continuar.':e.status===404?'Todavía no hay una confirmación para este intento. Podés consultar otra vez o reenviar exactamente el mismo envío.':e.status>=500||e.name==='TypeError'||e.name==='TimeoutError'||e.name==='AbortError'?'No se pudo confirmar la operación. Se conservan los datos y, si hubo un envío, su misma referencia.':e.safeMessage||'No se pudo verificar la respuesta. Volvé a consultar.';

export function mountEmploymentCatalog(entry){
 if(!entry||entry.dataset.ecMounted)return;entry.dataset.ecMounted='true';
 const dialog=el('dialog',undefined,'ec-dialog');dialog.setAttribute('aria-labelledby','ec-title');
 dialog.innerHTML=`<header class="ec-heading"><div><p class="ec-eyebrow">PERSONAS · ENCUADRES</p><h2 id="ec-title">Catálogo de encuadres</h2><p>Convenios, categorías, sectores y reparticiones disponibles para nuevas altas.</p></div><button type="button" class="ec-close" data-ec-close aria-label="Cerrar catálogo">×</button></header>
 <p class="ec-status" data-ec-status role="status" aria-live="polite"></p><p class="ec-note" data-ec-origin></p>
 <div class="ec-actions"><button type="button" class="ec-button" data-ec-refresh>Actualizar consulta</button><button type="button" class="ec-button primary" data-ec-create hidden>Preparar cambios</button></div>
 <section class="ec-pending" data-ec-pending hidden><h3>Envío sin confirmar</h3><p>Conservamos el mismo contenido y su referencia. Primero consultá el resultado; no prepares otra propuesta.</p><p data-ec-attempt></p><div class="ec-actions"><button type="button" class="ec-button primary" data-ec-recover>Consultar confirmación</button><button type="button" class="ec-button" data-ec-retry disabled>Reenviar el mismo intento</button></div></section>
 <section data-ec-content hidden><div class="ec-section-head"><h3 data-ec-table-title>Catálogo vigente</h3><button type="button" class="ec-button" data-ec-discard hidden>Empezar desde vigente</button></div>
 <p class="ec-note" data-ec-draft-note></p><div class="ec-tabs" role="group" aria-label="Clases de encuadre" data-ec-kinds></div>
 <div class="ec-filters"><label>Buscar código o descripción<input type="search" maxlength="160" data-ec-search></label><button type="button" class="ec-button" data-ec-add hidden>Agregar fila</button></div>
 <div class="ec-table-wrap"><table class="ec-table"><thead><tr><th>Código</th><th>Descripción</th><th data-ec-agreement-head>Convenio</th><th data-ec-edit-head hidden>Acción</th></tr></thead><tbody data-ec-rows></tbody></table></div>
 <div class="ec-pagination"><button type="button" class="ec-button" data-ec-prev>Anterior</button><span data-ec-page></span><button type="button" class="ec-button" data-ec-next>Siguiente</button></div>
 <form data-ec-propose hidden><h3>Revisá tus cambios</h3><div data-ec-diff></div><label>Motivo de la propuesta<textarea data-ec-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><p class="ec-note">Se envía el catálogo completo para que otra persona lo revise. No se calculan haberes ni se cambian legajos existentes.</p><button type="submit" class="ec-button primary" data-ec-send>Enviar a revisión</button></form>
 </section><section data-ec-history hidden><h3>Propuestas recientes</h3><p data-ec-history-note></p><div data-ec-proposals></div></section>
 <section class="ec-review" data-ec-detail hidden><div class="ec-section-head"><h3>Revisión de propuesta</h3><button type="button" class="ec-button" data-ec-detail-close>Cerrar comparación</button></div><p data-ec-proposal-summary></p><p data-ec-proposal-reason></p><div data-ec-comparison></div><details class="ec-full-proposal"><summary>Ver todas las opciones propuestas</summary><div data-ec-full-proposal></div></details><p data-ec-review-receipt></p><form data-ec-review-form hidden><label>Motivo de la decisión<textarea data-ec-review-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><p class="ec-note">Aprobar publica este catálogo para nuevas altas. No cambia el encuadre de legajos ya creados.</p><div class="ec-actions"><button type="submit" class="ec-button primary" data-ec-decision="approve">Aprobar y publicar</button><button type="submit" class="ec-button" data-ec-decision="reject">Rechazar</button></div></form></section>`;
 document.body.append(dialog);const $=s=>dialog.querySelector(s);
 let bootstrap=null,draft=null,detail=null,actor=null,scope=null,detailScope=null,pending=null,busy=false,epoch=0,controller=null,kind='agreements',page=0;
 const say=(text,error=false)=>{$('[data-ec-status]').textContent=text;$('[data-ec-status]').dataset.error=String(error);};
 const changedActor=()=>{pending=null;draft=null;detail=null;bootstrap=null;actor=null;scope=null;detailScope=null;erase();throw Object.assign(Error(),{code:'CATALOG_ACTOR_CHANGED'});};
 async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
  let payload;try{payload=await response.json();}catch{throw Object.assign(Error(),{status:503});}
  if(!response.ok||payload?.ok!==true)throw Object.assign(Error(),{status:response.status,code:typeof payload?.code==='string'?payload.code:''});return payload;
 }
 async function authority(seq){
  const value=await request('/api/internal-auth'),email=value.user?.email,caps=value.access?.tenantCapabilities;
  if(seq!==epoch)throw new DOMException('Consulta descartada','AbortError');
  if(value.authenticated!==true||typeof email!=='string'||!email.trim()||!Array.isArray(caps))throw Object.assign(Error(),{status:401});
  const next=JSON.stringify([email.trim().toLowerCase(),value.access.tenant?.id??null,value.access.tenant?.roleKey??value.user.role??null]);
  if(actor&&actor!==next)changedActor();actor=next;
  if(!caps.includes('workforce.employee.read'))throw Object.assign(Error(),{status:403});return caps;
 }
 function erase(){
  bootstrap=null;draft=null;detail=null;for(const s of ['[data-ec-origin]','[data-ec-rows]','[data-ec-diff]','[data-ec-comparison]','[data-ec-full-proposal]','[data-ec-proposals]','[data-ec-proposal-summary]','[data-ec-proposal-reason]','[data-ec-review-receipt]','[data-ec-history-note]','[data-ec-page]','[data-ec-draft-note]'])$(s).replaceChildren();
  $('[data-ec-reason]').value='';$('[data-ec-review-reason]').value='';$('[data-ec-search]').value='';
  for(const s of ['[data-ec-content]','[data-ec-history]','[data-ec-detail]','[data-ec-create]','[data-ec-pending]'])$(s).hidden=true;
 }
 function fail(error){if([401,403].includes(error.status)){epoch++;controller?.abort();busy=false;erase();controls();}say(message(error),true);}
 function controls(){
  dialog.querySelectorAll('button,input,textarea,select').forEach(n=>{if(n.hasAttribute('data-ec-close'))return;n.disabled=busy;});
  const locked=!!pending,stale=draft&&bootstrap&&draft.baseVersion!==bootstrap.catalog.version;
  $('[data-ec-create]').hidden=!bootstrap?.permissions.canPropose||!!draft||locked;
  $('[data-ec-add]').hidden=!draft;$('[data-ec-discard]').hidden=!draft;$('[data-ec-propose]').hidden=!draft;
  $('[data-ec-pending]').hidden=!pending||!bootstrap;
  $('[data-ec-retry]').disabled=busy||!pending?.retryReady;
  if(pending)$('[data-ec-attempt]').textContent='Referencia: '+pending.key;
  for(const n of dialog.querySelectorAll('[data-ec-rows] input,[data-ec-rows] select,[data-ec-rows] button,[data-ec-reason],[data-ec-add],[data-ec-discard],[data-ec-send],[data-ec-review-reason],[data-ec-decision]'))n.disabled=busy||locked;
  $('[data-ec-send]').disabled=busy||locked||!!stale||!bootstrap?.permissions.canPropose;
  $('[data-ec-review-form]').hidden=!!pending||!bootstrap?.permissions.canReview||detail?.status!=='pending'||detail?.canReview!==true;
  const count=filtered().length;$('[data-ec-prev]').disabled=busy||page===0;$('[data-ec-next]').disabled=busy||(page+1)*PAGE>=count;
 }
 function filtered(){const q=$('[data-ec-search]').value.toLocaleLowerCase('es');return (draft?.items||displayItems(bootstrap?.catalog.items||[])).map((item,index)=>({item,index})).filter(({item})=>item.kind===kind&&(!q||(item.code+' '+item.label).toLocaleLowerCase('es').includes(q)));}
 function differences(host,base,items){
  host.replaceChildren();let diffs;try{diffs=catalogDiff(base,items);}catch{host.append(el('p','Completá códigos, descripciones y convenios para revisar las diferencias.','ec-note'));return;}
  host.append(el('p',diffs.length?`${diffs.filter(d=>d.change==='added').length} incorporaciones · ${diffs.filter(d=>d.change==='changed').length} cambios · ${diffs.filter(d=>d.change==='removed').length} retiros`:'No hay cambios respecto de la versión de origen.','ec-note'));
  const list=el('ul',undefined,'ec-differences');for(const d of diffs){const row=el('li');row.append(el('strong',`${labels[d.kind]} · ${d.code}${d.agreementCode?' · convenio '+d.agreementCode:''}: `),el('span',d.change==='added'?'Agregar «'+d.after.label+'»':d.change==='removed'?'Retirar «'+d.before.label+'»':'«'+d.before.label+'» → «'+d.after.label+'»'));list.append(row);}host.append(list);
 }
 function renderTable(){
  const rows=filtered();page=Math.min(page,Math.max(0,Math.ceil(rows.length/PAGE)-1));$('[data-ec-rows]').replaceChildren();
  $('[data-ec-table-title]').textContent=draft?'Borrador completo del catálogo':'Catálogo vigente';
  $('[data-ec-draft-note]').textContent=draft?(draft.baseVersion!==bootstrap.catalog.version?'La versión vigente cambió. Tu borrador se conserva sin mezclarlo con otra versión. Revisalo antes de empezar uno nuevo.':draft.baseOrigin==='GRH'?'Se propone adoptar estas opciones como catálogo propio; requiere revisión de otra persona. Podés enviarlas sin modificar su contenido.':'Estás editando una copia completa. Los cambios todavía no se guardaron.'):'Consultá los valores disponibles. Para cambiarlos, prepará una propuesta.';
  $('[data-ec-agreement-head]').hidden=kind!=='categories';$('[data-ec-edit-head]').hidden=!draft;
  for(const {item,index}of rows.slice(page*PAGE,(page+1)*PAGE)){
   const tr=el('tr');tr.dataset.ecRow=String(index);
   for(const field of ['code','label']){const td=el('td');td.dataset.label=field==='code'?'Código':'Descripción';if(draft){const input=el('input');input.value=item[field];input.setAttribute('aria-label',(field==='code'?'Código':'Descripción')+' de fila '+(index+1));input.dataset.ecField=field;input.maxLength=field==='code'?9:160;if(field==='code')input.inputMode='numeric';input.addEventListener('input',()=>{item[field]=input.value;item.key=`${item.kind}:${item.agreementCode||''}:${item.code}`;differences($('[data-ec-diff]'),draft.baseItems,draft.items);});td.append(input);}else td.textContent=item[field];tr.append(td);}
   const ac=el('td');ac.dataset.label='Convenio';ac.hidden=kind!=='categories';if(kind==='categories'&&draft){const select=el('select');select.dataset.ecField='agreementCode';select.setAttribute('aria-label','Convenio de fila '+(index+1));select.add(new Option('Elegí convenio',''));for(const a of draft.items.filter(x=>x.kind==='agreements'))select.add(new Option(a.code+' · '+a.label,a.code));if(item.agreementCode&&!Array.from(select.options).some(o=>o.value===item.agreementCode))select.add(new Option(item.agreementCode+' · retirado del borrador',item.agreementCode));select.value=item.agreementCode||'';select.addEventListener('change',()=>{item.agreementCode=select.value;item.key=`${item.kind}:${item.agreementCode}:${item.code}`;differences($('[data-ec-diff]'),draft.baseItems,draft.items);});ac.append(select);}else ac.textContent=item.agreementCode||'';tr.append(ac);
   if(draft){const td=el('td'),remove=button('Quitar');td.dataset.label='Acción';remove.dataset.ecRemove=String(index);remove.addEventListener('click',()=>{if(busy||pending)return;draft.items.splice(index,1);renderTable();});td.append(remove);tr.append(td);} $('[data-ec-rows]').append(tr);
  }
  if(!rows.length){const tr=el('tr'),td=el('td','No hay valores en esta selección.');td.colSpan=draft?4:3;tr.append(td);$('[data-ec-rows]').append(tr);}
  $('[data-ec-page]').textContent=rows.length?`${page*PAGE+1}–${Math.min(rows.length,(page+1)*PAGE)} de ${rows.length}`:'0 valores';
  for(const b of $('[data-ec-kinds]').children)b.setAttribute('aria-pressed',String(b.dataset.kind===kind));
  if(draft)differences($('[data-ec-diff]'),draft.baseItems,draft.items);controls();
 }
 function render(){
  if(!bootstrap)return;const c=bootstrap.catalog;
  $('[data-ec-origin]').textContent=c.origin==='GRH'?'Origen vigente: catálogo incorporado de GRH. La primera propuesta aprobada publicará un catálogo propio para nuevas altas.':'Origen vigente: catálogo propio de MuniControl · revisión '+c.revision+' · '+stamp(c.publishedAt)+'. La nómina y los legajos históricos conservan sus fuentes.';
  $('[data-ec-content]').hidden=false;$('[data-ec-history]').hidden=false;
  $('[data-ec-history-note]').textContent=bootstrap.historyTruncated?'Se muestran las 20 propuestas más recientes. Hay antecedentes anteriores fuera de esta lista.':'Se muestran '+bootstrap.proposals.length+' propuestas recientes.';
  $('[data-ec-proposals]').replaceChildren();for(const p of bootstrap.proposals){const b=button(statuses[p.status]+' · '+p.authorLabel+' · '+stamp(p.createdAt));b.dataset.ecProposal=p.id;b.addEventListener('click',()=>loadProposal(p.id));$('[data-ec-proposals]').append(b);}renderTable();
 }
 async function load(){
  if(busy)return;const seq=++epoch;controller?.abort();controller=new AbortController();busy=true;controls();say('Consultando catálogo y permisos…');
  try{await authority(seq);const d=validateCatalogBootstrap((await request(API+'?resource=bootstrap')).data);if(seq!==epoch)return;if(scope&&scope!==d.scopeVersion)changedActor();scope=d.scopeVersion;bootstrap=d;render();say(pending?'Hay un envío sin confirmar. Consultá el mismo intento antes de continuar.':draft?'Consulta actualizada. Tu borrador se conserva con su versión de origen.':'Catálogo consultado. Los cambios requieren propuesta y revisión de otra persona.');}
  catch(e){if(seq===epoch)fail(e);}finally{if(seq===epoch){busy=false;controls();}}
 }
 async function loadProposal(id){
  if(busy||pending)return;const seq=epoch;busy=true;controls();say('Consultando propuesta…');
  try{await authority(seq);const data=validateCatalogProposal((await request(API+'?'+new URLSearchParams({resource:'proposal',id}))).data);if(seq!==epoch)return;if(data.proposal.id!==id)throw Error();detail=data.proposal;detailScope=scope;
   $('[data-ec-proposal-summary]').textContent=statuses[detail.status]+' · '+detail.authorLabel+' · '+stamp(detail.createdAt);$('[data-ec-proposal-reason]').textContent='Motivo: '+detail.reason;
   $('[data-ec-full-proposal]').replaceChildren();$('.ec-full-proposal').open=false;for(const k of CATALOG_KINDS){const group=el('section'),list=el('ul');group.append(el('h4',labels[k]));for(const item of displayItems(detail.items).filter(i=>i.kind===k))list.append(el('li',item.code+' · '+item.label+(item.agreementCode?' · convenio '+item.agreementCode:'')));group.append(list);$('[data-ec-full-proposal]').append(group);}
   differences($('[data-ec-comparison]'),detail.baseItems,detail.items);if(bootstrap.catalog.origin==='GRH'&&detail.baseVersion===bootstrap.catalog.version&&!catalogDiff(detail.baseItems,detail.items).length)$('[data-ec-comparison]').append(el('p','Se propone adoptar estas opciones de GRH como catálogo propio, sin modificar su contenido. La adopción requiere revisión de otra persona.','ec-note'));$('[data-ec-review-receipt]').textContent=detail.review?statuses[detail.status]+' por '+detail.review.reviewerLabel+' · '+stamp(detail.review.reviewedAt)+' · '+detail.review.reason:detail.canReview?'La publicación requiere tu decisión explícita.':'Esta propuesta no está habilitada para tu revisión. La persona autora no puede aprobarla.';
   $('[data-ec-review-reason]').value='';$('[data-ec-detail]').hidden=false;say('Comparación consultada. Todavía no se cambió el catálogo.');$('[data-ec-detail]').scrollIntoView({block:'start'});
  }catch(e){if(seq===epoch)fail(e);}finally{if(seq===epoch){busy=false;controls();}}
 }
 function prepare(){if(busy||pending||!bootstrap?.permissions.canPropose)return;draft={scopeVersion:scope,baseVersion:bootstrap.catalog.version,baseOrigin:bootstrap.catalog.origin,baseItems:structuredClone(bootstrap.catalog.items),items:displayItems(structuredClone(bootstrap.catalog.items))};detail=null;$('[data-ec-detail]').hidden=true;$('[data-ec-reason]').value='';$('[data-ec-search]').value='';page=0;render();say('Borrador iniciado desde la versión consultada. Todavía no se guardó.');}
 function accept(raw,attempt){const r=validateCatalogReceipt(raw);if(r.operation!==attempt.body.operation||r.operation==='propose'&&r.catalogVersion!==attempt.body.payload.baseVersion||r.operation==='review'&&r.proposalId!==attempt.body.payload.proposalId||r.status!==(r.operation==='propose'?'pending':attempt.body.payload.decision==='approve'?'approved':'rejected'))throw Object.assign(Error(),{status:503});pending=null;draft=null;detail=null;$('[data-ec-reason]').value='';$('[data-ec-detail]').hidden=true;return r;}
 async function send(recovery=false){
  if(busy||!pending)return;const attempt=pending,seq=epoch;busy=true;controls();say(recovery?'Consultando la confirmación del intento…':'Enviando la operación…');let saved=null;
  try{await authority(seq);if(attempt.actor!==actor)changedActor();const fresh=validateCatalogBootstrap((await request(API+'?resource=bootstrap')).data);if(seq!==epoch)return;if(fresh.scopeVersion!==attempt.body.payload.scopeVersion||scope&&fresh.scopeVersion!==scope)changedActor();scope=fresh.scopeVersion;bootstrap=fresh;
   if(!(attempt.body.operation==='propose'?fresh.permissions.canPropose:fresh.permissions.canReview))throw Object.assign(Error(),{status:403});
   const data=(await request(recovery?API+'?'+new URLSearchParams({resource:'attempt',key:attempt.key}):API,recovery?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.bytes})).data;
   if(seq!==epoch)return;saved=accept(data,attempt);say(saved.status==='approved'?'Catálogo aprobado y publicado. Los legajos existentes no cambiaron.':saved.status==='rejected'?'Propuesta rechazada. El catálogo vigente se conserva.':'Propuesta enviada a revisión. El catálogo vigente se conserva.');
  }catch(e){if(seq!==epoch)return;if(pending===attempt){if(recovery||attempt.uncertain||!e.status||e.status>=500){attempt.uncertain=true;attempt.retryReady=recovery&&e.status===404;}else pending=null;}fail(e);}
  finally{if(seq===epoch){busy=false;controls();}}
  if(saved&&seq===epoch){const status=$('[data-ec-status]').textContent,refreshEpoch=epoch+1;await load();if(bootstrap&&epoch===refreshEpoch)say(status);}
 }
 async function begin(body){
  if(busy||pending)return;pending={key:crypto.randomUUID(),actor,body:structuredClone(body),bytes:JSON.stringify(body),uncertain:false,retryReady:false};await send();
 }
 for(const k of CATALOG_KINDS){const b=button(labels[k]);b.dataset.kind=k;b.addEventListener('click',()=>{kind=k;page=0;renderTable();});$('[data-ec-kinds]').append(b);}
 $('[data-ec-search]').addEventListener('input',()=>{page=0;renderTable();});$('[data-ec-prev]').addEventListener('click',()=>{page--;renderTable();});$('[data-ec-next]').addEventListener('click',()=>{page++;renderTable();});
 $('[data-ec-create]').addEventListener('click',prepare);$('[data-ec-discard]').addEventListener('click',prepare);$('[data-ec-refresh]').addEventListener('click',load);
 $('[data-ec-add]').addEventListener('click',()=>{if(busy||pending||!draft)return;if(draft.items.length>=1500){say('El catálogo admite hasta 1500 valores.',true);return;}draft.items.push({kind,key:'',code:'',label:'',agreementCode:kind==='categories'?'':null});$('[data-ec-search]').value='';page=Math.floor((filtered().length-1)/PAGE);renderTable();$('[data-ec-rows] tr:last-child input')?.focus();});
 $('[data-ec-propose]').addEventListener('submit',ev=>{ev.preventDefault();if(busy||pending||!draft||!bootstrap?.permissions.canPropose)return;try{if(draft.baseVersion!==bootstrap.catalog.version)throw Object.assign(Error(),{status:409});const payload=catalogProposalInput({scopeVersion:draft.scopeVersion,baseVersion:draft.baseVersion,reason:$('[data-ec-reason]').value,items:draft.items});if(draft.baseOrigin!=='GRH'&&!catalogDiff(draft.baseItems,payload.items).length){say('Agregá, modificá o retirá un valor antes de enviar.',true);return;}begin({operation:'propose',payload});}catch(e){say(e.message||'Revisá el borrador.',true);}});
 $('[data-ec-review-form]').addEventListener('submit',ev=>{ev.preventDefault();if(busy||pending||!bootstrap?.permissions.canReview||!detail?.canReview||detail.status!=='pending')return;try{begin({operation:'review',payload:catalogReviewInput({scopeVersion:detailScope,proposalId:detail.id,decision:ev.submitter?.dataset.ecDecision,reason:$('[data-ec-review-reason]').value})});}catch(e){say(e.message||'Revisá el motivo.',true);}});
 $('[data-ec-recover]').addEventListener('click',()=>send(true));$('[data-ec-retry]').addEventListener('click',()=>{if(pending?.retryReady)send(false);});
 $('[data-ec-detail-close]').addEventListener('click',()=>{detail=null;$('[data-ec-detail]').hidden=true;controls();});
 const close=()=>{epoch++;controller?.abort();if(pending)pending.uncertain=true;busy=false;dialog.close();entry.focus();};
 $('[data-ec-close]').addEventListener('click',close);dialog.addEventListener('cancel',ev=>{ev.preventDefault();close();});
 entry.addEventListener('click',()=>{if(dialog.open)return;dialog.showModal();load();});
 document.addEventListener('municontrol:capabilities-ready',ev=>{const caps=ev.detail?.tenantCapabilities;if(!Array.isArray(caps))return;if(!caps.includes('workforce.employee.read')){epoch++;controller?.abort();if(pending)pending.uncertain=true;busy=false;erase();say('Tu permiso de consulta cambió. Los datos fueron retirados.',true);}else if(bootstrap){if(!caps.includes('employee.catalog.propose'))bootstrap.permissions.canPropose=false;if(!caps.includes('employee.catalog.approve'))bootstrap.permissions.canReview=false;}controls();});
 document.getElementById('logoutButton')?.addEventListener('click',()=>{epoch++;controller?.abort();busy=false;pending=null;actor=null;scope=null;erase();controls();dialog.close();});
 window.addEventListener('beforeunload',ev=>{if(pending?.uncertain||pending&&busy){ev.preventDefault();ev.returnValue='';}});
 window.addEventListener('pagehide',()=>{epoch++;controller?.abort();busy=false;pending=null;actor=null;scope=null;erase();controls();});
}
if(typeof document!=='undefined')mountEmploymentCatalog(document.querySelector('[data-employment-catalog]'));
