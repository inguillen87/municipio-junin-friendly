import {coordinationProposal,verifyCoordination,sameCoordination} from './legal-coordination-model.js';
import {followupId,FOLLOWUP_STATES} from './legal-followups-model.js';
const root=document.getElementById('coordinationRoot');
if(root)void mountCoordination(root);
export async function mountCoordination(host){
 const p=new URLSearchParams(location.search),id=p.get('seguimiento');
 let data=null,draft=null,review=null,pending=null,latest=null,busy=false,blocked=false,alive=true,epoch=0,conflict=false;
 let message='Verificando la coordinación…',error=false;const controllers=new Set();
 const add=(parent,tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;parent.append(n);return n;};
 const button=(parent,text,fn)=>{const b=add(parent,'button',text,'button');b.type='button';b.disabled=busy;b.onclick=fn;return b;};
 const say=(s,e=false)=>{message=s;error=e;};
 const stop=()=>{epoch++;for(const c of controllers)c.abort();controllers.clear();};
 const wipe=()=>{stop();data=null;draft=null;review=null;pending=null;latest=null;conflict=false;};
 const deny=()=>{wipe();busy=false;blocked=true;say('El acceso cambió. Se descartó la información privada; volvé a ingresar.',true);render();};
 const focus=s=>host.querySelector(s)?.focus();
 async function request(op,input={},key=null){const c=new AbortController();controllers.add(c);const timer=setTimeout(()=>c.abort(),25000);
  try{const post=op==='save',url='/api/internal-legal-coordination'+(post?'':'?'+new URLSearchParams({resource:op,...input}));
   const r=await fetch(url,{method:post?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:c.signal,headers:{Accept:'application/json',...(post?{'Content-Type':'application/json','Idempotency-Key':key}:{})},...(post?{body:JSON.stringify(input)}:{})});
   let value;try{value=await r.json();}catch{throw Object.assign(Error('No llegó una confirmación verificable.'),{status:r.ok?503:r.status});}
   if(!r.ok||value?.ok!==true)throw Object.assign(Error(value?.error||'No se pudo confirmar la coordinación.'),{status:r.status,code:value?.code});
   const result=verifyCoordination(op,value.data);if((op==='detail'?result.followup.id:result.followupId)!==id)throw Error('La respuesta no pertenece a este seguimiento.');return result;
  }finally{clearTimeout(timer);controllers.delete(c);}}
 async function run(fn){if(busy||blocked||!alive)return;busy=true;const token=epoch;render();
  try{await fn(token);}catch(e){if(!alive||token!==epoch)return;if([401,403].includes(e.status)){deny();return;}say(e.name==='AbortError'||e instanceof TypeError?'No se recibió confirmación. Conservamos el intento original y tu propuesta.':e.message||'No se pudo completar la operación.',true);}
  finally{if(alive&&token===epoch){busy=false;render();}}}
 async function load(){if(draft||pending||busy)return;data=null;latest=null;await run(async token=>{const fresh=await request('detail',{followupId:id});if(token!==epoch||!alive)return;data=fresh;say('Coordinación actualizada. Asignar no concede permisos ni envía avisos.');});}
 function edit(){if(!data?.canManage||busy)return;draft={followupId:id,expectedRevision:data.revision,expectedFollowupVersion:data.followup.version,responsibleId:data.responsible?.id??null,nextAction:data.nextAction,reason:''};review=null;latest=null;conflict=false;say('Prepará la próxima actuación y quién debe realizarla. Todavía no se guardó nada.');render();focus('[name=responsibleId]');}
 function discard(){if(busy||pending)return;if(draft&&!confirm('¿Descartar la propuesta de coordinación sin guardar?'))return;draft=null;review=null;conflict=false;if(latest)data=latest;latest=null;say('Propuesta descartada. No se modificó ningún registro.');render();}
 function back(){if(busy||pending)return;review=null;say('Propuesta conservada para editar. No se guardó una revisión.');render();focus('[name=nextAction]');}
 async function send(recover=false){if(!pending)return;const intent=pending;await run(async token=>{
  try{const receipt=await request(recover?'attempt':'save',recover?{key:intent.key}:intent.body,recover?null:intent.key);
   if(!alive||token!==epoch)return;if(receipt.revision!==intent.body.expectedRevision+1||receipt.followupVersion!==intent.body.expectedFollowupVersion)throw Error('La confirmación no coincide con la revisión propuesta.');
   pending=null;draft=null;review=null;latest=null;conflict=false;data=null;say(`Coordinación guardada · revisión ${receipt.revision}. El seguimiento mantiene su estado.`);
   try{const fresh=await request('detail',{followupId:id});if(token===epoch&&alive)data=fresh;}catch(e){if([401,403].includes(e.status))throw e;say('Guardado confirmado. No se pudo actualizar la vista; usá Actualizar coordinación.',true);}
  }catch(e){if(token===epoch&&!recover&&['COORDINATION_INPUT_INVALID','COORDINATION_VERSION_CONFLICT','COORDINATION_MEMBER_UNAVAILABLE','COORDINATION_CLOSED','COORDINATION_CAPACITY','COORDINATION_NO_CHANGE'].includes(e.code)){pending=null;conflict=e.code!=='COORDINATION_INPUT_INVALID'&&e.code!=='COORDINATION_NO_CHANGE';}throw e;}
 });}
 async function confirmReview(){if(!review||busy||pending)return;const selected=review,token=epoch;let ready=false;
  await run(async()=>{const fresh=await request('detail',{followupId:id});if(token!==epoch||!alive)return;
   if(!fresh.canManage){data=fresh;draft=null;review=null;latest=null;conflict=false;say('La coordinación ya no es editable con el estado o permiso actual. Tu propuesta no se guardó.',true);return;}
   if(!sameCoordination(data,fresh)){latest=fresh;review=null;conflict=true;throw Error('La coordinación, la persona habilitada o el seguimiento cambió. Tu propuesta se conserva; revisá la versión actual antes de confirmar.');}
   ready=true;
  });if(!ready||!alive||token!==epoch||review!==selected)return;
  pending={body:selected.body,key:crypto.randomUUID()};review=null;void send();
 }
 async function inspectConflict(){await run(async token=>{const fresh=await request('detail',{followupId:id});if(token!==epoch||!alive)return;latest=fresh;say('Versión actual consultada. Contrastala con tu propuesta; no se actualizó ni guardó automáticamente.');});}
 function adoptCurrent(){if(!latest||busy||!draft)return;if(!latest.canManage){data=latest;draft=null;review=null;latest=null;conflict=false;say('El estado actual solo permite consulta. No se guardó la propuesta.',true);render();return;}
  data=latest;latest=null;draft={...draft,expectedRevision:data.revision,expectedFollowupVersion:data.followup.version};conflict=false;review=null;say('Usás la versión actual como base. Revisá nuevamente la persona y la propuesta antes de guardar.');render();focus('[name=responsibleId]');}
 function reviewDraft(e){e.preventDefault();if(busy||pending||conflict)return;try{review=coordinationProposal({...draft,nextAction:draft.nextAction.trim(),reason:draft.reason.trim()},data);draft={...review.body};say('Revisá los cambios completos. Confirmar volverá a comprobar el acceso y la versión.');render();focus('[data-coordination-review]');}catch(e){say(e.message,true);render();focus('[name=responsibleId]');}}
 function render(){host.replaceChildren();host.className='lf-shell lc-shell';host.setAttribute('aria-busy',String(busy));
  add(host,'p','JURÍDICA · RESPONSABLE Y PRÓXIMA ACTUACIÓN','lr-eyebrow');add(host,'h1','Coordinar seguimiento');
  const alert=add(host,'p',message,'lf-alert'+(error?' lf-error':''));alert.setAttribute('role','status');alert.setAttribute('aria-live','polite');
  if(blocked){const a=add(host,'a','Volver al Registro','button');a.href='/juridica';return;}
  if(data){add(host,'h2',data.followup.title,'lc-title');add(host,'p',`${FOLLOWUP_STATES[data.followup.status]} · Seguimiento r${data.followup.version} · Coordinación r${data.revision} · Norma v${data.followup.normVersion}`,'lf-note');
   const a=add(host,'a','Volver al seguimiento y su historial','button');a.href='/internal-legal-followups.html?'+new URLSearchParams({norma:data.followup.normId,version:String(data.followup.normVersion),seguimiento:id});}
  add(host,'p','Coordinación interna del área. No cambia la norma, el estado del seguimiento, permisos, haberes ni plazos legales. No envía notificaciones.','lf-boundary');
  if(pending){const box=add(host,'section','','lf-form lc-pending');add(box,'h2','Confirmación pendiente');add(box,'p','Conservamos la misma propuesta y clave. No abras otro intento ni cierres esta página hasta comprobar el resultado.');const actions=add(box,'div','','lf-tools');button(actions,'Consultar este intento',()=>send(true));button(actions,'Reenviar mismo intento',()=>send(false));return;}
  if(review){renderReview();return;}if(draft){renderForm();return;}
  const actions=add(host,'div','','lf-tools');button(actions,'Actualizar coordinación',load);if(data?.canManage)button(actions,'Editar coordinación',edit);
  if(!data)return;renderCurrent();
 }
 function pair(parent,label,value){const box=add(parent,'div','','lc-value');add(box,'h3',label);add(box,'p',value);return box;}
 function renderCurrent(){const panel=add(host,'section','','lf-form lc-current');add(panel,'h2','Coordinación registrada');
  const grid=add(panel,'div','','lc-current-grid');pair(grid,'Responsable',data.responsible?.label||'Sin responsable');pair(grid,'Próxima actuación',data.nextAction||'Sin próxima actuación registrada');
  if(data.responsible&&!data.responsible.eligible)add(panel,'p','La persona asignada ya no está habilitada para este circuito. Se conserva el antecedente; un gestor debe revisar la asignación.','lf-alert lf-error');
  if(!data.canManage)add(panel,'p',data.followup.status==='open'?'Consulta sin edición: el permiso o límite actual no permite modificar esta coordinación.':'El seguimiento está cerrado. La coordinación permanece como antecedente; reabrirlo requiere su circuito independiente.','lf-note');
  const history=add(host,'details','','lf-form lc-history');add(history,'summary',`Historial de coordinación · ${data.history.length} revisiones`);
  if(!data.history.length)add(history,'p','Todavía no se registraron asignaciones o próximas actuaciones. No se creó información de ejemplo.','lf-note');
  const ol=add(history,'ol');for(const item of data.history){const li=add(ol,'li');add(li,'h3',`Coordinación r${item.revision} · Seguimiento r${item.followupVersion}`);add(li,'p','Responsable: '+(item.responsibleLabel||'Sin responsable'));add(li,'p',item.nextAction||'Sin próxima actuación');add(li,'p','Motivo: '+item.reason);add(li,'small',item.actorLabel+' · '+new Date(item.recordedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Mendoza'})+' (Mendoza)');}
 }
 function renderForm(){const form=add(host,'form','','lf-form lc-editor');add(form,'h2','Preparar coordinación');
  if(conflict){const box=add(form,'section','','lc-conflict');add(box,'h3','La versión base necesita revisión');add(box,'p','Tu texto sigue intacto. No se reenviará sobre una versión diferente sin tu decisión.');
   button(box,'Consultar versión actual',inspectConflict);if(latest){pair(box,'Responsable actual',latest.responsible?.label||'Sin responsable');pair(box,'Actuación actual',latest.nextAction||'Sin próxima actuación');add(box,'p',`Coordinación r${latest.revision} · Seguimiento r${latest.followup.version} · ${FOLLOWUP_STATES[latest.followup.status]}`);button(box,latest.canManage?'Usar versión actual y conservar propuesta':'Cerrar propuesta y consultar estado actual',adoptCurrent);}}
  const fields=add(form,'fieldset');fields.disabled=busy;const grid=add(fields,'div','','lf-grid');
  const label=add(grid,'label','Persona responsable','lf-wide'),select=add(label,'select');select.name='responsibleId';
  const empty=add(select,'option','Sin responsable');empty.value='';
  for(const candidate of data.candidates){const option=add(select,'option',candidate.label);option.value=candidate.id;}
  if(draft.responsibleId&&!data.candidates.some(c=>c.id===draft.responsibleId)){const unavailable=add(select,'option',(data.responsible?.id===draft.responsibleId?data.responsible.label:'Persona de la propuesta')+' · No habilitada');unavailable.value=draft.responsibleId;unavailable.disabled=true;}
  select.value=draft.responsibleId??'';select.onchange=()=>{draft.responsibleId=select.value||null;};
  add(fields,'p','Solo se ofrecen cuentas activas y habilitadas para Jurídica en este municipio. Elegir una persona no amplía sus permisos.','lf-note');
  const actionLabel=add(grid,'label','Próxima actuación (máximo 500 caracteres)','lf-wide'),action=add(actionLabel,'input');action.name='nextAction';action.type='text';action.maxLength=500;action.value=draft.nextAction;action.oninput=()=>{draft.nextAction=action.value;};
  const reasonLabel=add(grid,'label','Motivo que quedará en el historial','lf-wide'),reason=add(reasonLabel,'input');reason.name='reason';reason.type='text';reason.maxLength=500;reason.minLength=5;reason.required=true;reason.value=draft.reason;reason.oninput=()=>{draft.reason=reason.value;};
  if(data.candidates.length===0)add(fields,'p','No hay personas elegibles para una nueva asignación. Podés registrar una próxima actuación sin responsable o retirar una asignación anterior.','lf-alert');
  const actions=add(fields,'div','','lf-tools');const submit=button(actions,'Revisar coordinación',()=>{});submit.type='submit';submit.disabled=busy||conflict;button(actions,'Descartar propuesta',discard);form.onsubmit=reviewDraft;
 }
 function renderReview(){const panel=add(host,'section','','lf-form lf-change-review lc-review');const heading=add(panel,'h2','Revisar coordinación antes de guardar');heading.tabIndex=-1;heading.dataset.coordinationReview='';
  add(panel,'p',`Se propone la coordinación r${review.nextRevision} sobre la revisión ${data.revision}; seguimiento r${data.followup.version}.`,'lf-note');
  for(const [label,before,after]of [['Responsable',review.beforeLabel,review.afterLabel],['Próxima actuación',review.beforeAction,review.afterAction]]){const box=add(panel,'section','','lf-change-field'+(before!==after?' lf-field-changed':''));add(box,'h3',label+(before!==after?' · Cambia':' · Sin cambios'));const grid=add(box,'div','','lf-change-pair');const left=add(grid,'div'),right=add(grid,'div');add(left,'h4','Antes');add(left,'p',before);add(right,'h4','Propuesto');add(right,'p',after);}
  const motive=add(panel,'div','','lf-change-reason');add(motive,'h3','Motivo');add(motive,'p',review.body.reason);
  const actions=add(panel,'div','','lf-tools');button(actions,'Confirmar coordinación',confirmReview);button(actions,'Volver a editar',back);button(actions,'Descartar propuesta',discard);
  panel.onkeydown=e=>{if(e.key==='Escape'&&!busy){e.preventDefault();back();}};
 }
 const beforeUnload=e=>{if(draft||pending){e.preventDefault();e.returnValue='';}};
 const hide=()=>{alive=false;wipe();host.replaceChildren();};
 window.addEventListener('beforeunload',beforeUnload);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 if(p.size!==1||p.getAll('seguimiento').length!==1||!followupId(id)){blocked=true;say('La referencia al seguimiento no es válida. Abrí la coordinación desde su ficha.',true);render();return;}
 const gate=await globalThis.MuniControlCapabilityGate?.ready;if(!alive)return;
 if(!gate?.tenantCapabilities?.has('legal.norm.read')){deny();return;}
 document.addEventListener('municontrol:capabilities-ready',e=>{if(!alive)return;const v=e.detail?.tenantCapabilities,caps=v instanceof Set?v:new Set(Array.isArray(v)?v:[]);wipe();busy=false;
  if(!caps.has('legal.norm.read'))deny();else{blocked=false;void load();}});
 await load();
}
