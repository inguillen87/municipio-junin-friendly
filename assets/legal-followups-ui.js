import {followupReview,reviewFieldText} from './legal-followup-review.js';
import {FOLLOWUP_STATES,FollowupInputError,followupId,normalizeFollowup,verifyFollowupResponse,followupTiming} from './legal-followups-model.js';
import {verifyLegalResponse,LEGAL_KINDS} from './legal-registry-model.js';
const host=document.getElementById('followupRoot');
const API='/api/internal-legal-followups';
if(host){if(location.search==='')import('./legal-agenda-ui.js').then(m=>m.mountLegalAgenda(host)).catch(()=>{host.textContent='No se pudo cargar la agenda. Actualizá la página.';});else void start(host);}
async function start(root){
 let norm=null,data=null,draft=null,baseline='',pending=null,detail=null,busy=false,blocked=false,epoch=0,alive=true,message='',error=false,mode='all';
 let originalDraft=null,reviewed=null;
 const controllers=new Set();
 const params=new URLSearchParams(location.search),normId=params.get('norma'),version=params.get('version'),focusId=params.get('seguimiento');
 const valid=followupId(normId)&&/^[1-9][0-9]{0,3}$/.test(version||'')&&+version<=1000&&((params.size===2&&focusId===null)||(params.size===3&&followupId(focusId)))&&new Set(params.keys()).size===params.size&&[...params.keys()].every(k=>['norma','version','seguimiento'].includes(k));
 const add=(parent,tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);if(cls)node.className=cls;parent.append(node);return node;};
 const button=(parent,label,fn,disabled=false)=>{const b=add(parent,'button',label,'button');b.type='button';b.disabled=busy||disabled;b.addEventListener('click',fn);return b;};
 const say=(text,isError=false)=>{message=text;error=isError;};
 const stop=()=>{epoch++;for(const c of controllers)c.abort();controllers.clear();};
 const wipe=()=>{stop();norm=null;data=null;draft=null;pending=null;detail=null;baseline='';originalDraft=null;reviewed=null;};
 const deny=()=>{wipe();blocked=true;say('La sesión o el alcance cambió. Se descartó la información privada. Volvé a ingresar.',true);render();};
 const dirty=()=>!!draft&&JSON.stringify(draft)!==baseline;
 async function request(op,input={},attempt=null){
  const c=new AbortController();controllers.add(c);const timer=setTimeout(()=>c.abort(),25000);
  try{const save=op==='save',qs=save?'':'?'+new URLSearchParams({resource:op,...input});
   const r=await fetch(API+qs,{method:save?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:c.signal,headers:{Accept:'application/json',...(save?{'Content-Type':'application/json','Idempotency-Key':attempt}: {})},...(save?{body:JSON.stringify(input)}:{})});
   let value;try{value=await r.json();}catch{throw Object.assign(Error('No llegó una respuesta verificable.'),{status:r.ok?503:r.status});}
   if(!r.ok||value?.ok!==true)throw Object.assign(Error(value?.error||'No se confirmó la operación.'),{status:r.status,code:value?.code});
   let d;try{d=verifyFollowupResponse(op,value.data);if(op==='list'&&d.normId!==normId||op==='detail'&&d.record.id!==input.id)throw Error('SCOPE');}catch{throw Error('No se verificó el contenido recibido.');}return d;
  }finally{clearTimeout(timer);controllers.delete(c);}
 }
 async function refresh(){data=null;const token=epoch;const value=await request('list',{normId});if(alive&&token===epoch)data=value;}
 async function run(fn){if(busy||blocked||!alive)return;busy=true;const token=epoch;render();try{await fn(token);}catch(e){if(!alive||token!==epoch)return;if([401,403].includes(e.status)){deny();return;}say(e.name==='AbortError'||e instanceof TypeError?'No se recibió confirmación. Consultá el mismo intento si estabas guardando.':e.message||'No se pudo completar la operación.',true);}finally{if(alive&&token===epoch){busy=false;render();}}}
 async function initialize(){
  if(!valid){blocked=true;say('La referencia a la norma no es válida. Abrí el seguimiento desde Revisión documental.',true);render();return;}
  await run(async token=>{
   const c=new AbortController();controllers.add(c);const timer=setTimeout(()=>c.abort(),25000);
   try{const r=await fetch('/api/internal-legal-registry?'+new URLSearchParams({resource:'detail',id:normId,version}),{credentials:'same-origin',cache:'no-store',signal:c.signal});const payload=await r.json();if(!r.ok||!payload?.ok)throw Object.assign(Error('No se pudo verificar la norma de referencia.'),{status:r.status});const verified=verifyLegalResponse('detail',payload.data).record;if(verified.id!==normId||verified.version!==+version)throw Error('Referencia documental no verificada.');if(token!==epoch||!alive)return;norm=verified;}finally{clearTimeout(timer);controllers.delete(c);}
   await refresh();if(token===epoch&&focusId){if(!data.rows.some(r=>r.id===focusId))throw Error('El seguimiento solicitado no pertenece a esta norma o ya no está disponible.');const focused=await request('detail',{id:focusId});if(token===epoch&&focused.record.normId===normId){detail=focused.record;data.canManage=focused.canManage;}}
   if(token===epoch)say('Seguimientos internos consultados. Las fechas objetivo no son vencimientos legales ni generan notificaciones.');
  });
 }
 function begin(row=null){
  if(!data?.canManage||busy||pending)return;
  draft=row?{id:row.id,normId:row.normId,normVersion:row.normVersion,expectedVersion:row.version,title:row.title,dueDate:row.dueDate,status:row.status,note:row.note,reason:''}:{id:null,normId,normVersion:+version,expectedVersion:0,title:'',dueDate:'',status:'open',note:'',reason:''};
  originalDraft=row?structuredClone(row):null;reviewed=null;baseline=JSON.stringify(draft);detail=null;say('Prepará el seguimiento. Todavía no se guardó nada.');render();root.querySelector('[name=title]')?.focus();
 }
 async function open(row,edit=false){detail=null;await run(async token=>{const d=await request('detail',{id:row.id});if(token!==epoch)return;if(d.record.normId!==normId)throw Error('La referencia del seguimiento no coincide.');detail=d.record;if(data)data.canManage=d.canManage;});if(edit&&detail&&data?.canManage&&detail.version<100)begin(detail);}
 function cancel(){if(pending||busy)return;if(dirty()&&!confirm('¿Descartar los cambios sin guardar?'))return;draft=null;detail=null;baseline='';originalDraft=null;reviewed=null;say('Formulario cerrado sin modificar registros.');render();}
 async function send(recover=false){
  if(!pending)return;const attempt=pending;
  await run(async token=>{try{const receipt=await request(recover?'attempt':'save',recover?{key:attempt.key}:attempt.body,recover?null:attempt.key);
    if(token!==epoch)return;if(receipt.recordVersion!==attempt.body.expectedVersion+1||attempt.body.id&&receipt.id!==attempt.body.id)throw Error('La confirmación no coincide con el intento.');
    pending=null;draft=null;baseline='';detail=null;originalDraft=null;reviewed=null;say('Guardado confirmado · revisión '+receipt.recordVersion+'.');
    try{await refresh();}catch(e){if([401,403].includes(e.status))throw e;say('Guardado confirmado. No se pudo actualizar la lista; usá Actualizar antes de otra acción.',true);}
   }catch(e){if(token===epoch&&!recover&&e.status>=400&&e.status<500&&e.status!==408){pending=null;say(e.message,true);}throw e;}});
 }
 function render(){
  root.replaceChildren();root.className='lf-shell';add(root,'p','JURÍDICA · SEGUIMIENTO INTERNO','lr-eyebrow');add(root,'h1','Seguimientos de la norma');
  const alert=add(root,'p',message||'Consultando…','lf-alert'+(error?' lf-error':''));alert.setAttribute('role','status');alert.setAttribute('aria-live','polite');
  if(blocked){const a=add(root,'a','Volver al registro','button');a.href='/juridica';return;}
  if(!norm){if(!busy)button(root,'Reintentar consulta',initialize);return;}
  add(root,'p',`${LEGAL_KINDS[norm.kind]} ${norm.number}/${norm.year} · ${norm.metadata.title}`,'lf-source');
  add(root,'p',`Versión de referencia ${version} de ${norm.currentVersion}${+version<norm.currentVersion?' · Referencia histórica':''}. Cada seguimiento conserva la versión que lo originó.`,'lf-note');
  const agenda=add(root,'a','Volver a la agenda del área','button');agenda.href='/internal-legal-followups.html';
  const source=add(root,'a','Abrir ficha y PDF fuente','button');source.href='/juridica?'+new URLSearchParams({norma:normId,version});
  add(root,'p','Para coordinación del área: pendiente, resuelto o cancelado con motivo e historial. No evalúa vigencia, no cambia la norma y no envía avisos. No cargues documentación reservada o datos personales ajenos al circuito.','lf-boundary');
  if(pending){const panel=add(root,'section','','lf-form lf-review');add(panel,'h2',busy?'Consultando confirmación…':'Confirmación pendiente');add(panel,'p','No inicies otra carga: conservamos la misma clave para recuperar el resultado sin duplicar registros.');const controls=add(panel,'div','','lf-tools');button(controls,'Consultar este intento',()=>send(true));button(controls,'Reenviar mismo intento',()=>send(false));return;}
  if(reviewed){renderReview();return;}
  if(draft){renderForm();return;}
  const tools=add(root,'div','','lf-tools');button(tools,'Actualizar',()=>run(async token=>{detail=null;await refresh();if(token===epoch)say('Listado actualizado.');}));
  if(data?.canManage)button(tools,'Nuevo seguimiento',()=>begin(),data.rows.length>=100);
  if(!data)return;
  const filterLabel=add(tools,'label','Estado ');const filter=add(filterLabel,'select',null,'lf-filter');filter.setAttribute('aria-label','Filtrar seguimientos por estado');for(const [key,label]of Object.entries({all:'Todos',...FOLLOWUP_STATES})){const o=add(filter,'option',label);o.value=key;}filter.value=mode;filter.disabled=busy;filter.onchange=()=>{mode=filter.value;render();};
  add(root,'p',`${data.rows.length} seguimientos registrados · Fecha de referencia: ${data.today.split('-').reverse().join('/')} (Mendoza).`,'lf-note');
  if(detail){const history=add(root,'section','','lf-form lf-history');add(history,'h2','Historial del seguimiento');add(history,'h3',detail.title);const coordinate=add(history,'a','Responsable y pr?xima actuaci?n','button');coordinate.href='/internal-legal-coordination.html?'+new URLSearchParams({seguimiento:detail.id});if(data.canManage&&detail.version<100)button(history,'Gestionar este seguimiento',()=>begin(detail));button(history,'Cerrar historial',()=>{detail=null;render();});const ol=add(history,'ol');for(const h of detail.history){const li=add(ol,'li');add(li,'strong',`Revisión ${h.version} · ${FOLLOWUP_STATES[h.status]}`);add(li,'p',h.title);add(li,'p','Fecha objetivo: '+(h.dueDate||'Sin fecha'));add(li,'p',h.note||'Sin nota');add(li,'p','Motivo: '+h.reason);add(li,'small',`${h.recordedBy} · ${new Date(h.recordedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Mendoza'})}`);}}
  const cards=add(root,'div','','lf-cards'),rows=data.rows.filter(r=>mode==='all'||r.status===mode);
  if(!rows.length)add(cards,'p',data.rows.length?'No hay seguimientos con este estado.':'Todavía no hay seguimientos registrados para esta norma.','lf-alert');
  for(const row of rows){const card=add(cards,'article','','lf-card');card.dataset.followupId=row.id;const timing=followupTiming(row,data.today);
   add(card,'span',FOLLOWUP_STATES[row.status]+(timing==='overdue'?' · Fecha objetivo pasada':timing==='today'?' · Objetivo para hoy':''),'lf-tag'+(timing==='overdue'?' lf-overdue':''));add(card,'h3',row.title);add(card,'p',row.note||'Sin nota adicional.');add(card,'p',`Objetivo: ${row.dueDate?row.dueDate.split('-').reverse().join('/'):'Sin fecha'} · Revisión ${row.version} · Norma v${row.normVersion}`,'lf-meta');
   if(row.normVersion<row.currentNormVersion)add(card,'p','La norma tiene una versión documental posterior; este seguimiento conserva su referencia histórica.','lf-note');
   const actions=add(card,'div','','lf-tools');button(actions,'Ver historial',()=>open(row));const coordinate=add(actions,'a','Responsable y pr?xima actuaci?n','button');coordinate.href='/internal-legal-coordination.html?'+new URLSearchParams({seguimiento:row.id});if(data.canManage)button(actions,'Gestionar seguimiento',()=>open(row,true),row.version>=100);
  }
 }
 function backToDraft(){if(busy||pending)return;reviewed=null;say('Podés corregir tu propuesta. No se guardó ninguna revisión.');render();root.querySelector('[name=title]')?.focus();}
 async function confirmReview(){
  if(!reviewed||busy||pending||blocked)return;const selection=reviewed,token=epoch;let accepted=false;
  await run(async()=>{const fresh=selection.body.id?await request('detail',{id:selection.body.id}):await request('list',{normId});if(token!==epoch||!alive)return;
   if(!fresh.canManage){deny();return;}
   if(selection.body.id&&JSON.stringify(fresh.record)!==JSON.stringify(originalDraft)){reviewed=null;throw Error('El seguimiento o su referencia cambió. Tu texto se conserva, pero no se guardó. Consultá el historial actual antes de volver a editar.');}
   accepted=true;
  });
  if(!accepted||token!==epoch||!alive||blocked||reviewed!==selection)return;
  pending={key:crypto.randomUUID(),body:selection.body};reviewed=null;void send();
 }
 function renderReview(){
  const review=reviewed,panel=add(root,'section','','lf-form lf-change-review');panel.setAttribute('aria-label','Revisión previa al guardado');
  const heading=add(panel,'h2',review.isNew?'Revisar alta del seguimiento':'Revisar cambios antes de guardar');heading.tabIndex=-1;heading.dataset.reviewHeading='';
  add(panel,'p',review.isNew?'Se creará la revisión 1. Todavía no existe un seguimiento guardado.':`Se propone la revisión ${review.nextRevision} sobre la revisión ${review.originalRevision}. ${review.changeCount} campos cambian.`,'lf-note');
  add(panel,'p',`La norma de referencia conserva su versión ${review.normVersion}. El motivo y el historial no se eliminan.`,'lf-boundary');
  for(const field of review.fields){const box=add(panel,'section','','lf-change-field'+(field.changed?' lf-field-changed':''));box.dataset.reviewField=field.key;add(box,'h3',field.label+(field.changed?' · '+(review.isNew?'Nuevo':'Cambia'):' · Sin cambios'));
   const pair=add(box,'div','','lf-change-pair');if(!review.isNew){const before=add(pair,'div','','lf-change-before');add(before,'h4','Antes');add(before,'p',reviewFieldText(field.key,field.before));}
   const after=add(pair,'div','','lf-change-after');add(after,'h4',review.isNew?'Se registrará':'Propuesto');add(after,'p',reviewFieldText(field.key,field.after));
  }
  const reason=add(panel,'section','','lf-change-reason');add(reason,'h3','Motivo que quedará en el historial');add(reason,'p',review.body.reason);
  add(panel,'p','Este cambio organiza el seguimiento interno. No modifica la norma, no emite un dictamen, no calcula un plazo legal y no envía notificaciones.','lf-note');
  const controls=add(panel,'div','','lf-tools');button(controls,'Confirmar y guardar',confirmReview);button(controls,'Volver a editar',backToDraft);button(controls,'Descartar propuesta',cancel);
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'&&!busy){e.preventDefault();backToDraft();}});
 }
 function renderForm(){
  const form=add(root,'form','','lf-form');add(form,'h2',draft.id?'Registrar una nueva revisión':'Preparar seguimiento');const fields=add(form,'fieldset');fields.disabled=busy;const grid=add(fields,'div','','lf-grid');
  const field=(name,label,type,max,wide=false)=>{const l=add(grid,'label',label,wide?'lf-wide':'');const node=add(l,type==='textarea'?'textarea':'input');node.name=name;if(type!=='textarea')node.type=type;node.value=draft[name];if(max)node.maxLength=max;node.required=['title','reason'].includes(name);if(type==='date'){node.min='1900-01-01';node.max='2100-12-31';}node.addEventListener('input',()=>{draft[name]=node.value;});return node;};
  field('title','Tarea o asunto','text',160,true);field('dueDate','Fecha objetivo interna (opcional)','date');const sl=add(grid,'label','Estado'),select=add(sl,'select');select.name='status';for(const [k,v]of Object.entries(FOLLOWUP_STATES)){if(!draft.id&&k!=='open')continue;const o=add(select,'option',v);o.value=k;}select.value=draft.status;select.onchange=()=>{draft.status=select.value;};
  field('note','Nota de trabajo (opcional)','textarea',2000,true);field('reason','Motivo del alta o del cambio','text',500,true);add(fields,'p',`Se conservará la norma v${draft.normVersion}. Resolver o cancelar no borra su historial.`,'lf-note');
  const controls=add(fields,'div','','lf-tools');const submit=button(controls,'Revisar y confirmar',()=>{});submit.type='submit';button(controls,'Cancelar',cancel);
  form.onsubmit=e=>{e.preventDefault();if(busy)return;try{draft=normalizeFollowup({...draft,title:draft.title.trim(),note:draft.note.trim(),reason:draft.reason.trim()});reviewed=followupReview(draft,originalDraft);say('Revisá el contenido completo antes de confirmar. Todavía no se guardó nada.');render();root.querySelector('[data-review-heading]')?.focus();}catch(e){say(e.message||'Revisá el formulario.',true);render();}};
 }
 const before=e=>{if(dirty()||pending){e.preventDefault();e.returnValue='';}};
 const pagehide=()=>{alive=false;wipe();root.replaceChildren();};
 window.addEventListener('beforeunload',before);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 const gate=await globalThis.MuniControlCapabilityGate?.ready;
 if(!gate?.tenantCapabilities?.has('legal.norm.read')){deny();return;}
 document.addEventListener('municontrol:capabilities-ready',event=>{const v=event.detail?.tenantCapabilities;const caps=v instanceof Set?v:new Set(Array.isArray(v)?v:[]);wipe();busy=false;if(!caps.has('legal.norm.read'))deny();else{blocked=false;void initialize();}});
 void initialize();
}
