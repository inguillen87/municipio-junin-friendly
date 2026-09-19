import {DOCUMENTARY_FILTERS,verifyDocumentaryReview,documentaryReference} from './legal-documentary-review.js';
import {LEGAL_KINDS} from './legal-registry-model.js';
export function mountDocumentaryReview(host,{onDenied=()=>{}}={}){
 const doc=host.ownerDocument;let alive=true,epoch=0,controller=null,data=null,filter='all',page=1,busy=false;
 const add=(parent,tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;parent.appendChild(n);return n;};
 host.className='ldr-workspace';host.replaceChildren();
 const head=add(host,'header','','ldr-heading');const title=add(head,'h2','Revisión documental');title.tabIndex=-1;
 add(head,'p','Revisá información todavía no cargada en las últimas versiones de las normas. Estas categorías no determinan validez, vigencia ni obligación de publicar.');
 const refresh=add(head,'button','Actualizar revisión','button');refresh.type='button';
 const message=add(host,'p','Consultando el registro municipal…','ldr-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const tiles=add(host,'div','','ldr-tiles');tiles.setAttribute('aria-label','Categorías de revisión documental');
 const results=add(host,'div','','ldr-results');
 function clearPrivate(){data=null;tiles.replaceChildren();results.replaceChildren();}
 function render(){
  tiles.replaceChildren();results.replaceChildren();if(!data)return;
  for(const [key,label]of Object.entries(DOCUMENTARY_FILTERS)){
   const b=add(tiles,'button','','ldr-tile');b.type='button';b.disabled=busy;b.setAttribute('aria-pressed',String(key===data.filter));b.dataset.documentaryFilter=key;
   add(b,'strong',String(data.summary[key]));add(b,'span',label);b.addEventListener('click',()=>load(key,1));
  }
  add(results,'p',`${data.total} fichas · ${DOCUMENTARY_FILTERS[data.filter]} · Página ${data.page}`,'ldr-result-count');
  add(results,'p','Una ficha puede aparecer en varias categorías; los números no se suman. Las fechas ausentes pueden no corresponder al tipo de documento.','ldr-context');
  if(!data.rows.length){add(results,'h3',data.summary.all===0?'Todavía no hay normas registradas':'No hay fichas en esta página de la categoría');add(results,'p',data.summary.all===0?'El panel se completará con las normas que se incorporen al registro.':'Elegí otra categoría o volvé a la página anterior.');}
  for(const row of data.rows){const card=add(results,'article','','ldr-card');
   add(card,'span',`${LEGAL_KINDS[row.kind]} ${row.number}/${row.year} · ${row.issuer} · Versión ${row.version}`,'ldr-meta');add(card,'h3',row.title);
   const labels=Object.keys(row.flags).filter(k=>row.flags[k]).map(k=>DOCUMENTARY_FILTERS[k]);add(card,'p',labels.join(' · ')||'Sin campos ausentes entre los revisados. Esto no certifica completitud jurídica.','ldr-flags');
   const link=add(card,'a','Abrir ficha de esta versión','button');link.href=documentaryReference(row);link.dataset.documentaryOpen=row.id;
  }
  const nav=add(results,'nav','','ldr-pagination');nav.setAttribute('aria-label','Páginas de revisión documental');
  const prev=add(nav,'button','Anterior','button');prev.type='button';prev.disabled=busy||data.page<=1;prev.addEventListener('click',()=>load(data.filter,data.page-1));
  const next=add(nav,'button','Siguiente','button');next.type='button';next.disabled=busy||data.page*data.pageSize>=data.total;next.addEventListener('click',()=>load(data.filter,data.page+1));
  add(results,'p','Consulta: '+new Date(data.observedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Mendoza'})+' · Hora de Mendoza. Sin modificaciones automáticas.','ldr-context');
 }
 async function load(nextFilter=filter,nextPage=page){
  if(!alive)return;controller?.abort();const token=++epoch;controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),25000);
  filter=nextFilter;page=nextPage;busy=true;refresh.disabled=true;clearPrivate();message.textContent='Consultando la última información del registro…';
  try{const response=await fetch('/api/internal-legal-registry?'+new URLSearchParams({resource:'documentary_review',filter,page:String(page)}),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok)throw Object.assign(Error('La revisión no está disponible.'),{status:response.status});const payload=await response.json();if(!payload?.ok)throw Error('Respuesta no verificable.');
   const value=verifyDocumentaryReview(payload.data);if(value.filter!==nextFilter||value.page!==nextPage)throw Error('Respuesta fuera de alcance.');
   if(!alive||token!==epoch)return;data=value;busy=false;render();message.textContent='Revisión actualizada. No se modificó ninguna norma ni se evaluó su vigencia.';
  }catch(e){if(!alive||token!==epoch)return;clearPrivate();if([401,403].includes(e.status)){message.textContent='El acceso cambió. La información anterior se descartó.';onDenied();}else message.textContent='No se pudo verificar la revisión. No se muestran conteos anteriores; usá Actualizar para reintentar.';}
  finally{clearTimeout(timer);if(alive&&token===epoch){busy=false;refresh.disabled=false;}}
 }
 const revoked=event=>{const value=event.detail?.tenantCapabilities,caps=value instanceof Set?value:new Set(Array.isArray(value)?value:[]);controller?.abort();epoch++;clearPrivate();if(!caps.has('legal.norm.read'))onDenied();else void load('all',1);};
 const hide=()=>{controller?.abort();epoch++;clearPrivate();};
 doc.addEventListener('municontrol:capabilities-ready',revoked);globalThis.addEventListener('pagehide',hide);refresh.addEventListener('click',()=>load());void load();
 return ()=>{alive=false;epoch++;controller?.abort();doc.removeEventListener('municontrol:capabilities-ready',revoked);globalThis.removeEventListener('pagehide',hide);clearPrivate();host.replaceChildren();};
}
