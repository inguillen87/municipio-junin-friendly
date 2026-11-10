// «Corregir alta histórica»: retira del padrón activo un alta incorporada desde el sistema anterior que no
// corresponde a una relación vigente. No es una baja: no registra fecha de egreso y conserva toda la historia.
// Propone una persona y decide otra (permisos y versiones los da el servidor; esta pantalla no los deduce).
import {VOID_ACKNOWLEDGEMENT,voidUuid,voidProposalInput,voidReviewInput,validateVoidBootstrap,validateVoidProposal,validateVoidReceipt} from './native-employment-void-model.js';

const API='/api/internal-employment-void';
export const VOID_DEFAULT_REASON='Legajo histórico sin relación laboral vigente, retirado del padrón activo por decisión del propietario.';
// Codes a contract outside this correction answers with: the section simply does not appear.
const NOT_APPLICABLE=/_(ORIGIN_NOT_SUPPORTED|NOT_FOUND)$/;
const DEPENDENCY_LABELS={own_payroll_run_capture:'está incluido en un cálculo propio',own_payroll_result:'tiene un resultado de liquidación propio',own_payroll_close:'forma parte de un cierre propio'};
export const voidDependencyLabel=code=>DEPENDENCY_LABELS[code]??'tiene movimientos propios que deben revisarse ('+String(code).replace(/_/g,' ')+')';
const attempts=new Map();// contractId → {key,payload,operation}; survives closing the ficha so an unconfirmed send is never repeated blindly.
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const day=v=>v?v.split('-').reverse().join('/'):'sin fecha';
const when=v=>v?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'';
const plural=(n,one,many)=>n+' '+(n===1?one:many);
const statusLabel={pending:'Pendiente de revisión',approved:'Aprobada',rejected:'Rechazada'};

export function voidPendingText(list){
 const lifecycle=list.filter(p=>p.kind==='lifecycle').length,change=list.length-lifecycle;
 const parts=[];
 if(lifecycle)parts.push(plural(lifecycle,'baja pendiente','bajas pendientes')+' de revisión: si se aprueba esta corrección ya no se '+(lifecycle===1?'podrá aprobar':'podrán aprobar')+'; '+(lifecycle===1?'queda':'quedan')+' en el historial y se '+(lifecycle===1?'puede':'pueden')+' rechazar.');
 if(change)parts.push(plural(change,'cambio de encuadre pendiente','cambios de encuadre pendientes')+': hay que resolverlo antes de corregir el alta.');
 return parts.join(' ');
}

export function mountNativeEmploymentVoid(host,{contractId,onApplied}={}){
 if(!host||host.dataset.nevMounted||!voidUuid(contractId))return null;
 contractId=contractId.toLowerCase();host.dataset.nevMounted='true';host.classList.add('nlc-panel','nev-panel');host.hidden=true;
 let boot=null,detail=null,busy=false,seq=0,closed=false,controller=null;
 const live=()=>!closed&&host.isConnected&&!document.hidden;
 async function call(url,options={}){
  controller?.abort();controller=new AbortController();
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:controller.signal});
  let payload=null;try{payload=await response.json();}catch{}
  if(!response.ok||payload?.ok!==true)throw Object.assign(Error(payload?.error||'No se pudo verificar la respuesta. Volvé a consultar.'),{status:response.status,code:payload?.code??''});
  return payload.data;
 }
 const get=(resource,extra='')=>call(API+'?resource='+resource+'&contractId='+contractId+extra);
 function render(message=''){
  host.replaceChildren();if(!boot){if(message){host.hidden=false;host.append(el('p',message,'nlc-note'));}return;}
  host.hidden=false;
  const s=boot.subject,state=boot.state,pending=boot.proposals.filter(p=>p.status==='pending'),attempt=attempts.get(contractId);
  host.append(el('h4','Corregir alta histórica'),el('p','Retira del padrón activo un alta incorporada desde el sistema anterior que no corresponde a una relación vigente. No es una baja: no registra fecha de egreso y conserva toda la historia. La aprueba otra persona.','nlc-note'));
  const card=el('div',undefined,'nlc-card'),head=el('div',undefined,'nlc-card-head');
  const pill=el('span',state.voided?'Retirado del padrón por corrección de alta':s.status==='active'?'En el padrón activo':'Fuera del padrón activo','nlc-pill '+(state.voided||s.status!=='active'?'nlc-pill-inactive':'nlc-pill-active'));
  head.append(el('span','Legajo '+s.legajo+' · ingreso '+day(s.startDate)+' · '+(s.endDate?'egreso '+day(s.endDate):'sin fecha de egreso')),pill);card.append(head);
  if(state.voided)card.append(el('p','Corrección aprobada el '+when(state.approvedAt)+'. Las fechas laborales no cambiaron.','nlc-note'));
  if(!state.voided&&boot.dependencies.length)card.append(el('p','No se puede corregir mientras '+boot.dependencies.map(voidDependencyLabel).join(' y ')+'.','nlc-note'));
  if(!state.voided&&boot.pendingOperations.length)card.append(el('p',voidPendingText(boot.pendingOperations),'nlc-note'));
  host.append(card);
  if(message)host.append(el('p',message,'nlc-status'));
  if(attempt&&busy)host.append(el('p','Enviando… no cierres la ficha hasta ver el resultado.','nlc-status'));
  if(attempt&&!busy){const box=el('section',undefined,'nlc-pending');box.append(el('h4','Envío sin confirmar'),el('p','Se conserva el mismo contenido y su referencia. Consultá el resultado antes de preparar otro cambio.'));
   const actions=el('div',undefined,'nlc-actions'),check=el('button','Consultar confirmación'),again=el('button','Reenviar el mismo intento');check.type=again.type='button';check.disabled=again.disabled=busy;
   check.addEventListener('click',()=>recover());again.addEventListener('click',()=>send(attempt));actions.append(check,again);box.append(actions);host.append(box);}
  if(boot.proposals.length){const list=el('ul',undefined,'nev-proposals');for(const p of boot.proposals){const li=el('li');li.append(el('span',statusLabel[p.status]+' · propuso '+p.authorLabel+' · '+when(p.createdAt)));
    const open=el('button',p.canReview?'Ver y decidir':'Ver propuesta');open.type='button';open.disabled=busy;open.addEventListener('click',()=>consult(p.id));li.append(open);list.append(li);}host.append(el('h4','Propuestas de corrección'),list);}
  if(detail)host.append(renderDetail(detail));
  if(!state.voided&&boot.permissions.canPropose&&!pending.length&&!attempt&&!detail)host.append(renderForm());
 }
 function compare(before,after){const t=el('table',undefined,'nev-compare'),head=el('tr');for(const h of['','Antes','Después'])head.append(el('th',h));t.append(head);
  for(const[label,a,b]of[['Padrón activo',before.status==='active'?'Sí':'No',after.status==='active'?'Sí':'No (retirado por corrección de alta)'],['Ingreso',day(before.startDate),day(after.startDate)],['Egreso',before.endDate?day(before.endDate):'sin fecha',after.endDate?day(after.endDate):'sin fecha (no se registra)']]){const r=el('tr');r.append(el('th',label),el('td',a),el('td',b));t.append(r);}return t;}
 function renderForm(){
  const s=boot.subject,form=el('form',undefined,'nev-form');form.append(el('h4','Preparar la corrección'),compare({status:s.status,startDate:s.startDate,endDate:s.endDate},{status:'inactive',startDate:s.startDate,endDate:s.endDate}));
  const reason=el('textarea');reason.required=true;reason.minLength=10;reason.maxLength=1000;reason.rows=3;reason.value=VOID_DEFAULT_REASON;const rl=el('label','Motivo');rl.append(reason);
  const ack=el('input');ack.type='checkbox';ack.required=true;const al=el('label',undefined,'nlc-reviewed');al.append(ack,document.createTextNode('Confirmo que es un alta histórica sin relación laboral vigente con el municipio.'));
  const go=el('button','Enviar a revisión','nlc-primary');go.type='submit';const actions=el('div',undefined,'nlc-actions');actions.append(go);
  form.append(rl,al,actions);
  form.addEventListener('submit',e=>{e.preventDefault();if(busy||!ack.checked)return;let payload;try{payload=voidProposalInput({contractId,scopeVersion:boot.scopeVersion,baseVersion:boot.baseVersion,reason:reason.value,acknowledgement:VOID_ACKNOWLEDGEMENT});}catch(err){render(err.message);return;}
   const a={operation:'propose',payload,key:crypto.randomUUID()};attempts.set(contractId,a);send(a);});
  return form;
 }
 function renderDetail(v){
  const p=v.proposal,box=el('section',undefined,'nev-detail');
  box.append(el('h4','Propuesta · '+statusLabel[p.status]),el('p','Propuso '+p.authorLabel+' el '+when(p.createdAt)+'.','nlc-note'),el('p','Motivo: '+p.reason),compare(p.before,p.after));
  if(p.pendingOperations.length)box.append(el('p',voidPendingText(p.pendingOperations),'nlc-note'));
  if(p.review)box.append(el('p',(p.review.decision==='approve'?'Aprobó ':'Rechazó ')+p.review.reviewerLabel+' el '+when(p.review.reviewedAt)+'. Motivo: '+p.review.reason));
  if(p.status==='pending'&&!p.canReview)box.append(el('p','La decide otra persona con permiso de aprobación: no se puede aprobar una propuesta propia.','nlc-note'));
  if(p.status==='pending'&&p.canReview){const reason=el('textarea');reason.minLength=10;reason.maxLength=1000;reason.rows=3;const rl=el('label','Motivo de la decisión');rl.append(reason);
   const actions=el('div',undefined,'nlc-actions'),approve=el('button','Aprobar corrección','nlc-primary'),reject=el('button','Rechazar');approve.type=reject.type='button';approve.disabled=reject.disabled=busy;
   const decide=decision=>{if(busy)return;let payload;try{payload=voidReviewInput({contractId,proposalId:p.id,scopeVersion:v.scopeVersion,proposalVersion:p.proposalVersion,decision,reason:reason.value});}catch(err){render(err.message);return;}
    const a={operation:'review',payload,key:crypto.randomUUID()};attempts.set(contractId,a);send(a);};
   approve.addEventListener('click',()=>decide('approve'));reject.addEventListener('click',()=>decide('reject'));actions.append(approve,reject);box.append(rl,actions);}
  const close=el('button','Cerrar propuesta','nlc-ghost');close.type='button';close.addEventListener('click',()=>{detail=null;render();});box.append(close);return box;
 }
 const errorText=e=>e.status===401?'La sesión venció. Volvé a ingresar.':e.message;
 async function run(work){if(busy||!live())return;const mine=++seq;busy=true;render();try{await work(()=>mine===seq&&live());}catch(e){if(mine===seq&&!closed){if(e.name==='AbortError')return;if(NOT_APPLICABLE.test(e.code)&&!boot){host.hidden=true;host.replaceChildren();return;}render(errorText(e));}}finally{if(mine===seq){busy=false;if(host.isConnected&&!closed&&boot)render(host.querySelector('.nlc-status')?.textContent??'');}}}
 function load(message=''){return run(async valid=>{const data=validateVoidBootstrap(await get('bootstrap'),contractId);if(!valid())return;boot=data;if(detail)detail=null;render(message);});}
 function consult(id){return run(async valid=>{const data=validateVoidProposal(await get('proposal','&id='+id),contractId,id.toLowerCase());if(valid()){detail=data;render();}});}
 function finish(receipt){attempts.delete(contractId);detail=null;
  const text=receipt.operation==='propose'?'Propuesta enviada a revisión. La decide otra persona.':receipt.status==='approved'?'Corrección aprobada: el legajo salió del padrón activo y conserva su historia.'+(receipt.supersededProposals.length?' '+plural(receipt.supersededProposals.length,'baja pendiente ya no se puede aprobar','bajas pendientes ya no se pueden aprobar')+'; se pueden rechazar.':''):'Corrección rechazada: el legajo sigue en el padrón activo.';
  boot=null;return {text,applied:receipt.operation==='review'&&receipt.status==='approved'};}
 // A definite refusal (4xx other than BUSY) recorded nothing: the attempt is dropped. Network or server doubt keeps it.
 const definite=e=>Number.isInteger(e.status)&&e.status>=400&&e.status<500&&!/_BUSY$/.test(e.code??'')&&!/_IDEMPOTENCY_REUSE$/.test(e.code??'');
 function send(a){return run(async valid=>{let data;try{data=await call(API,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':a.key},body:JSON.stringify({operation:a.operation,payload:a.payload})});}catch(e){if(definite(e))attempts.delete(contractId);throw e;}const receipt=validateVoidReceipt(data,contractId);
  const r=finish(receipt);if(r.applied&&typeof onApplied==='function')onApplied();if(valid()){boot=validateVoidBootstrap(await get('bootstrap'),contractId);render(r.text);}});}
 function recover(){const a=attempts.get(contractId);if(!a)return;return run(async valid=>{let receipt;try{receipt=validateVoidReceipt(await get('attempt','&key='+a.key),contractId);}catch(e){if(e.status===404)throw Object.assign(Error('Todavía no hay confirmación de ese envío. Podés consultar otra vez o reenviar el mismo intento.'),{status:404});throw e;}
  const r=finish(receipt);if(r.applied&&typeof onApplied==='function')onApplied();if(valid()){boot=validateVoidBootstrap(await get('bootstrap'),contractId);render(r.text);}});}
 const visibility=()=>{if(document.hidden){seq++;controller?.abort();busy=false;boot=null;detail=null;host.replaceChildren();host.hidden=true;}else if(host.isConnected&&!closed)load();};
 const stop=()=>{closed=true;seq++;controller?.abort();boot=null;detail=null;host.replaceChildren();document.removeEventListener('visibilitychange',visibility);};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop,{once:true});document.getElementById('logoutButton')?.addEventListener('click',stop);
 load();
 return {load,stop};
}
