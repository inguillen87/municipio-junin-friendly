import {verifyAgenda,agendaView,agendaBucket,agendaCsv,agendaLink,sameAgenda,AGENDA_BUCKETS} from './legal-agenda-model.js';
import {FOLLOWUP_STATES} from './legal-followups-model.js';
import {LEGAL_KINDS} from './legal-registry-model.js';
export async function mountLegalAgenda(root){
 let data=null,filters={q:'',bucket:'all',historicalOnly:false},page=1,busy=false,blocked=false,alive=true,epoch=0,controller=null;
 const add=(parent,tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;parent.append(n);return n;};
 const button=(parent,text,handler)=>{const b=add(parent,'button',text,'button');b.type='button';b.addEventListener('click',handler);return b;};
 root.className='lf-shell la-shell';root.replaceChildren();add(root,'p','JURÍDICA · AGENDA DEL ÁREA','lr-eyebrow');add(root,'h1','Agenda de seguimientos');
 add(root,'p','Todos los seguimientos normativos del municipio, reunidos por fecha objetivo y estado. Abrí uno para ver su historial o continuar su gestión.','lf-source');
 const alert=add(root,'p','Verificando el acceso…','lf-alert');alert.setAttribute('role','status');alert.setAttribute('aria-live','polite');
 const actions=add(root,'div','','lf-tools');const refresh=button(actions,'Actualizar agenda',()=>load()),download=button(actions,'Exportar filtro completo · CSV',()=>exportCurrent());
 const registry=add(actions,'a','Abrir Registro normativo','button');registry.href='/juridica';
 const form=add(root,'form','','la-filters'),label=add(form,'label','Buscar tarea o norma'),search=add(label,'input');search.type='search';search.maxLength=120;search.placeholder='Asunto, título o número de norma';search.autocomplete='off';
 const historicalLabel=add(form,'label','','la-check'),historical=add(historicalLabel,'input');historical.type='checkbox';add(historicalLabel,'span','Sólo referencias a versiones históricas');
 const apply=button(form,'Aplicar búsqueda',()=>{});apply.type='submit';const reset=button(form,'Limpiar filtros',()=>{filters={q:'',bucket:'all',historicalOnly:false};search.value='';historical.checked=false;page=1;render();search.focus();});
 const tiles=add(root,'div','','la-tiles');tiles.setAttribute('aria-label','Seguimientos por fecha objetivo y estado');
 const count=add(root,'p','','lf-note');count.tabIndex=-1;count.setAttribute('role','status');
 const cards=add(root,'div','','lf-cards'),nav=add(root,'nav','','lf-tools');nav.setAttribute('aria-label','Páginas de la agenda');
 const prev=button(nav,'Anterior',()=>{page--;render();count.focus();}),position=add(nav,'span','','lf-note'),next=button(nav,'Siguiente',()=>{page++;render();count.focus();});
 add(root,'p','Las fechas son objetivos internos, no vencimientos legales calculados. Consultar o exportar no resuelve tareas ni envía notificaciones. Para crear un seguimiento, elegí primero su norma en el Registro.','lf-boundary');
 function controls(){for(const n of [refresh,download,search,historical,apply,reset,prev,next])n.disabled=busy||blocked||!alive;root.setAttribute('aria-busy',String(busy));
  download.disabled=busy||blocked||!data||!agendaView(data,filters,page).total;prev.disabled=busy||blocked||!data||page<=1;next.disabled=busy||blocked||!data||page>=agendaView(data,filters,page).pages;
  for(const b of tiles.querySelectorAll('button'))b.disabled=busy||blocked;for(const a of cards.querySelectorAll('a')){if(busy)a.setAttribute('tabindex','-1');else a.removeAttribute('tabindex');}}
 function clearData(){data=null;tiles.replaceChildren();cards.replaceChildren();count.textContent='';position.textContent='';}
 function deny(){epoch++;controller?.abort();clearData();blocked=true;busy=false;filters={q:'',bucket:'all',historicalOnly:false};search.value='';historical.checked=false;alert.textContent='El acceso cambió. La información privada se descartó; volvé al Registro para ingresar.';alert.className='lf-alert lf-error';controls();}
 function render(){tiles.replaceChildren();cards.replaceChildren();if(!data){controls();return;}const v=agendaView(data,filters,page);page=v.page;
  for(const [key,title]of Object.entries(AGENDA_BUCKETS)){const b=button(tiles,'',()=>{filters={...filters,bucket:key};page=1;render();count.focus();});b.className='la-tile';b.dataset.agendaBucket=key;b.setAttribute('aria-pressed',String(key===filters.bucket));add(b,'strong',v.counts[key]);add(b,'span',title);}
  count.textContent=`${v.total} resultados de ${data.total} seguimientos municipales · ${AGENDA_BUCKETS[filters.bucket]}. Los conteos de las tarjetas respetan la búsqueda y el filtro histórico, no la página visible.`;
  position.textContent=`Página ${v.page} de ${v.pages}`;
  if(!v.rows.length){add(cards,'h2',data.total?'Sin coincidencias':'Todavía no hay seguimientos registrados');add(cards,'p',data.total?'Limpiá los filtros o elegí otra categoría.':'Crealos desde una norma registrada; esta agenda reunirá los seguimientos reales del municipio.','lf-note');}
  for(const r of v.rows){const card=add(cards,'article','','lf-card');card.dataset.agendaId=r.id;const bucket=agendaBucket(r,data.today);
   add(card,'span',FOLLOWUP_STATES[r.status]+(r.status==='open'?' · '+AGENDA_BUCKETS[bucket]:''),'lf-tag'+(bucket==='overdue'?' lf-overdue':''));add(card,'h2',r.title);
   add(card,'p',`${LEGAL_KINDS[r.norm.kind]} ${r.norm.number}/${r.norm.year} · ${r.norm.issuer} · ${r.norm.title}`,'lf-meta');
   add(card,'p',`Objetivo: ${r.dueDate?r.dueDate.split('-').reverse().join('/'):'Sin fecha'} · Seguimiento r${r.version} · Norma v${r.normVersion}`,'lf-note');
   if(r.normVersion<r.currentNormVersion)add(card,'p',`Referencia histórica: existe la versión documental ${r.currentNormVersion}. El seguimiento conserva su fuente original.`,'lf-note');
   const open=add(card,'a',data.canManage?'Abrir seguimiento y gestionar':'Abrir seguimiento e historial','button');open.href=agendaLink(r);
  }controls();
 }
 async function request(){const c=new AbortController();controller?.abort();controller=c;const timer=setTimeout(()=>c.abort(),25000);
  try{const r=await fetch('/api/internal-legal-followups?resource=agenda',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:c.signal});
   if(!r.ok)throw Object.assign(Error('No se pudo consultar la agenda.'),{status:r.status});const body=await r.json();if(body?.ok!==true)throw Error('Respuesta no verificable.');return verifyAgenda(body.data);
  }finally{clearTimeout(timer);if(controller===c)controller=null;}}
 async function load(){if(busy||blocked||!alive)return;const token=++epoch;busy=true;clearData();alert.textContent='Consultando los seguimientos del municipio…';alert.className='lf-alert';controls();
  try{const value=await request();if(token!==epoch||!alive)return;data=value;page=1;alert.textContent=`Agenda consultada · ${data.today.split('-').reverse().join('/')} (Mendoza). Los estados sólo cambian mediante una revisión confirmada.`;render();}
  catch(e){if(token!==epoch||!alive)return;if([401,403].includes(e.status)){deny();return;}clearData();alert.textContent='No se pudo verificar la agenda. No se muestran conteos anteriores; usá Actualizar para reintentar.';alert.className='lf-alert lf-error';}
  finally{if(token===epoch&&alive){busy=false;controls();}}}
 async function exportCurrent(){if(busy||blocked||!data||!alive)return;const original=data,selected={...filters},token=++epoch;busy=true;alert.textContent='Revalidando acceso y contenido antes de exportar…';controls();
  try{const fresh=await request();if(token!==epoch||!alive)return;if(!sameAgenda(original,fresh)){data=fresh;page=1;render();throw Error('La agenda cambió. Revisá la información actualizada antes de exportar.');}
   const csv=agendaCsv(fresh,selected),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='agenda-seguimientos-'+fresh.today+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);alert.textContent=`Filtro completo exportado: ${agendaView(fresh,selected).total} seguimientos. No se modificó ningún estado.`;
  }catch(e){if(token!==epoch||!alive)return;if([401,403].includes(e.status)){deny();return;}alert.textContent=e.message==='La agenda cambió. Revisá la información actualizada antes de exportar.'?e.message:'No se pudo revalidar la agenda; no se generó archivo. Actualizá la consulta.';alert.className='lf-alert lf-error';}
  finally{if(token===epoch&&alive){busy=false;controls();}}}
 form.addEventListener('submit',e=>{e.preventDefault();if(busy||blocked||!data)return;filters={...filters,q:search.value,historicalOnly:historical.checked};page=1;render();count.focus();});
 document.addEventListener('municontrol:capabilities-ready',e=>{const v=e.detail?.tenantCapabilities,caps=v instanceof Set?v:new Set(Array.isArray(v)?v:[]);epoch++;controller?.abort();clearData();busy=false;if(!caps.has('legal.norm.read'))deny();else{blocked=false;void load();}});
 window.addEventListener('pagehide',()=>{alive=false;epoch++;controller?.abort();clearData();search.value='';root.replaceChildren();});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 controls();const gate=await globalThis.MuniControlCapabilityGate?.ready;if(!alive)return;if(!gate?.tenantCapabilities?.has('legal.norm.read')){deny();return;}await load();
}
