// Consulta nominal del directorio existente, sin cambiar permisos ni datos municipales.
const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const button=(label,action)=>{const n=element('button',label,'button');n.type='button';n.addEventListener('click',action);return n;};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function verifyStructurePeople(payload,page){
 const p=payload?.pagination;
 if(payload?.ok!==true||!Array.isArray(payload.data)||!p||p.page!==page||p.limit!==25||!Number.isSafeInteger(p.total)||p.total<0||p.pages!==Math.max(1,Math.ceil(p.total/25))||payload.data.length!==Math.min(25,Math.max(0,p.total-(page-1)*25)))throw Error('La respuesta del directorio está incompleta.');
 const seen=new Set();for(const row of payload.data){if(!uuid.test(row.contractId)||seen.has(row.contractId)||typeof row.legajo!=='string'||(row.nombre!==null&&typeof row.nombre!=='string'))throw Error('No se pudo verificar la identidad del listado.');seen.add(row.contractId);}
 return payload;
}
export function openStructurePeople({label,field,trigger}){
 if(!['organization','sector'].includes(field)||typeof label!=='string'||!label.trim())return;
 document.getElementById('structurePeopleDialog')?.close();
 const dialog=element('dialog',undefined,'sp-dialog');dialog.id='structurePeopleDialog';dialog.setAttribute('aria-labelledby','spTitle');
 const header=element('header',undefined,'sp-header'),heading=element('div');heading.append(element('p','Personas de la asignación','sp-eyebrow'));const title=element('h2',label);title.id='spTitle';heading.append(title);header.append(heading,button('Cerrar listado',()=>dialog.close()));dialog.append(header);
 const notice=element('p','Directorio laboral de esta asignación. No acredita cargos presupuestados ni vacantes; sus estados pueden diferir del agregado histórico.','sp-note');dialog.append(notice);
 const form=element('form',undefined,'sp-filters'),searchLabel=element('label','Nombre o legajo'),search=element('input');search.type='search';search.maxLength=100;search.autocomplete='off';searchLabel.append(search);
 const statusLabel=element('label','Situación'),status=element('select');status.setAttribute('aria-label','Situación');for(const [value,text]of [['all','Todos los legajos'],['administrative_active','Activos administrativos'],['inactive','Inactivos']]){const option=element('option',text);option.value=value;status.append(option);}statusLabel.append(status);
 const submit=element('button','Consultar','button');submit.type='submit';form.append(searchLabel,statusLabel,submit);dialog.append(form);
 const message=element('p','Consultando directorio…','sp-status');message.setAttribute('role','status');dialog.append(message);
 const results=element('div',undefined,'sp-results');dialog.append(results);
 const pager=element('nav',undefined,'sp-pager');pager.setAttribute('aria-label','Páginas del listado nominal');dialog.append(pager);
 let page=1,query='',state='all',controller=null,generation=0,closed=false;
 function clear(){results.replaceChildren();pager.replaceChildren();}
 dialog.addEventListener('close',()=>{closed=true;generation++;controller?.abort();clear();dialog.remove();if(trigger?.isConnected)trigger.focus();});
 form.addEventListener('submit',event=>{event.preventDefault();query=search.value.trim();state=status.value;page=1;load();});
 document.body.append(dialog);dialog.showModal();load();
 async function load(){
  if(closed)return;controller?.abort();const current=++generation,c=new AbortController();controller=c;const requestedPage=page;
  clear();submit.disabled=true;dialog.setAttribute('aria-busy','true');message.textContent='Consultando personas de esta asignación…';
  try{
   const params=new URLSearchParams({resource:'employees',[field]:label,search:query,status:state,includeFacets:'0',limit:'25',page:String(requestedPage)});
   const response=await fetch('/api/internal-data?'+params,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([c.signal,AbortSignal.timeout(15000)])});
   if(current!==generation||closed)return;
   if(!response.ok)throw Object.assign(Error('READ_FAILED'),{status:response.status});
   const payload=verifyStructurePeople(await response.json(),requestedPage);if(current!==generation||closed)return;
   if(payload.pagination.page>payload.pagination.pages){page=1;return load();}
   const table=element('table'),head=element('thead'),tr=element('tr');for(const text of ['Legajo','Nombre y apellido','Cargo informado','Situación']){const th=element('th',text);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
   const body=element('tbody');body.dataset.spRows='';
   const labels={active:'Activo',inactive:'Inactivo',suspended:'Suspendido',leave_without_pay:'Licencia sin goce',pending_termination:'Baja pendiente',pending_start:'Alta futura',state_error:'Revisar estado',unknown:'No informado'};
   for(const row of payload.data){const line=element('tr');for(const value of [row.legajo,row.nombre||'Nombre no informado',row.cargo||'Cargo no informado',labels[row.administrativeStatus]||'No informado'])line.append(element('td',value));body.append(line);}
   table.append(body);if(payload.data.length){const scroll=element('div',undefined,'sp-table');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Legajos de la asignación');scroll.append(table);results.append(scroll,element('p','Deslizá la tabla para ver el cargo y la situación.','sp-mobile-hint'));}else results.append(element('p','No hay legajos que coincidan con esta consulta.','sp-empty'));
   const p=payload.pagination;message.textContent=p.total+' legajos en el directorio · página '+p.page+' de '+p.pages;
   const previous=button('Anterior',()=>{page--;load();}),next=button('Siguiente',()=>{page++;load();});previous.disabled=page<=1;next.disabled=page>=p.pages;pager.append(previous,element('span','25 filas por página'),next);
  }catch(error){if(current!==generation||closed||c.signal.aborted)return;clear();message.textContent=error.status===401?'La sesión ya no es válida. Volvé a ingresar.':error.status===403?'Tu perfil no tiene acceso al detalle nominal.':error.status===409?'La fuente cambió. Volvé a consultar el listado.':'No se pudo consultar el directorio. Podés reintentar sin perder los filtros.';results.append(button('Reintentar listado',load));}
  finally{if(current===generation&&!closed){submit.disabled=false;dialog.removeAttribute('aria-busy');}}
 }
}
