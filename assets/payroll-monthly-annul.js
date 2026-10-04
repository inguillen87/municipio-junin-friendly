import {monthlyDecisionAccess,sameMonthlyDecisionAccess} from './payroll-monthly-decisions-model.js';
import {monthlyAnnulBootstrap,monthlyAnnulDetail,monthlyAnnulPlan,monthlyAnnulReviewPlan,monthlyAnnulUnchanged,monthlyAnnulAttempt,monthlyAnnulReceipt} from './payroll-monthly-annul-model.js';
const API='/api/internal-payroll-monthly-annul';
const el=(tag,text,id)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(id)node.id='monthlyAnnul'+id;return node;};
const button=(text,id)=>{const n=el('button',text,id);n.type='button';n.className='button';return n;};
const field=(text,input)=>{const n=el('label',text);n.append(input);return n;};
const short=id=>id.slice(0,8).toUpperCase()+'…'+id.slice(-6).toUpperCase();
const types={monthly:'Mensual',first_fortnight:'Primera quincena',sac:'SAC',vacation:'Vacaciones',supplementary:'Complementaria',final:'Final',other:'Otra'};
const states={pending:'Propuesta pendiente',approved:'Anulación aprobada',rejected:'Anulación rechazada'};

export function mountMonthlyAnnul(host,{request,onLockChange,onChanged,onAccessInvalidated,externalLocked}){
 let access=null,data=null,epoch=0,page=1,plan=null,opened=null,working=false,pending=null,receiptNotice='',needsLoad=false;const selected=new Set();
 host.classList.add('monthly-annul');const title=el('h3','Anular lotes mensuales aprobados','Title');host.setAttribute('aria-labelledby',title.id);
 const intro=el('p','Elegí los lotes completos, explicá el motivo y enviá una propuesta. Otra persona deberá aprobarla para retirar su exportación. Se conservan la aprobación original, todas las filas y la historia; no se anulan ni recalculan haberes.');
 const period=el('input',undefined,'Period');period.type='month';period.min='2008-01';period.max='2099-12';
 const refresh=button('Consultar anulaciones','Refresh'),search=el('input',undefined,'Search');search.type='search';search.maxLength=100;
 const mode=el('select',undefined,'Mode');for(const[value,text]of [['candidates','Lotes aprobados'],['pending','Propuestas pendientes'],['history','Historia de anulaciones']]){const o=el('option',text);o.value=value;mode.append(o);}
 const controls=el('div');controls.className='monthly-annul-controls';controls.append(field('Período de consulta (opcional)',period),refresh,field('Mostrar',mode),field('Buscar lote, período, tipo o motivo',search));
 const previous=button('Página anterior','Previous'),next=button('Página siguiente','Next'),range=el('p',undefined,'Range');range.setAttribute('role','status');
 const pager=el('nav');pager.setAttribute('aria-label','Páginas de anulaciones mensuales');pager.className='monthly-annul-controls';pager.append(previous,range,next);
 const list=el('div',undefined,'List'),selectPage=button('Seleccionar lotes de esta página','SelectPage'),reset=button('Retirar selección','Reset'),count=el('p',undefined,'Count');count.setAttribute('role','status');
 const selection=el('div');selection.className='monthly-annul-controls';selection.append(selectPage,reset,count);
 const reason=el('textarea',undefined,'Reason');reason.maxLength=1000;reason.rows=3;const reasonField=field('Motivo de la propuesta o decisión (10 a 1.000 caracteres)',reason);
 const decision=el('select',undefined,'Decision');for(const[value,text]of [['approve','Aprobar la anulación completa'],['reject','Rechazar la anulación completa']]){const o=el('option',text);o.value=value;decision.append(o);}const decisionField=field('Decisión independiente',decision);
 const compare=button('Revisar selección completa','Compare');compare.classList.add('primary');
 const review=el('section',undefined,'Review');review.hidden=true;const scope=el('p',undefined,'Scope'),batches=el('div',undefined,'Batches');
 const confirm=el('input',undefined,'Confirm');confirm.type='checkbox';const confirmation=field('Revisé todas las filas de todos los lotes y el motivo.',confirm);confirmation.prepend(confirm);
 const send=button('Enviar propuesta de anulación','Send');send.classList.add('primary');const close=button('Cerrar revisión','Close');
 const actions=el('div');actions.className='monthly-annul-controls';actions.append(send,close);review.append(scope,batches,confirmation,actions);
 const retry=button('Recuperar comprobante del envío original','Retry');retry.hidden=true;
 const note=el('p',undefined,'Message');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 host.append(title,intro,controls,pager,list,selection,reasonField,decisionField,compare,review,retry,note);
 const allowed=()=>access&&access.capabilities.includes('payroll.novelty.read')&&access.capabilities.includes('payroll.novelty.nominal.read')&&!document.hidden;
 const locked=()=>working||Boolean(pending);const idle=()=>allowed()&&data&&!locked()&&!externalLocked();
 const canWrite=command=>command==='propose'?data?.permissions.canPropose:data?.permissions.canReview;
 const say=text=>{if(allowed())note.textContent=text;};
 function invalidate(){plan=null;confirm.checked=false;review.hidden=true;batches.replaceChildren();scope.textContent='';}
 function filtered(){if(!data)return [];const records=mode.value==='candidates'?data.candidates:data.proposals.filter(p=>mode.value==='history'||p.status==='pending');const needle=search.value.trim().toLocaleLowerCase('es-AR');return records.filter(r=>`${r.batchId??r.id} ${r.periodMonth??''} ${types[r.payrollType]??''} ${r.reason??''}`.toLocaleLowerCase('es-AR').includes(needle));}
 function renderList(){list.replaceChildren();if(!allowed()||!data)return;
  const rows=filtered();page=Math.min(Math.max(1,page),Math.max(1,Math.ceil(rows.length/20)));range.textContent=`Página ${page} de ${Math.max(1,Math.ceil(rows.length/20))} · ${rows.length} resultados completos del filtro`;
  for(const item of rows.slice((page-1)*20,page*20)){
   const card=el('article');card.className='monthly-annul-card';
   if(mode.value==='candidates'){
    const check=el('input');check.type='checkbox';check.dataset.annulBatch=item.batchId;check.checked=selected.has(item.batchId);check.disabled=!idle()||!item.canPropose;
    const label=field(`Lote ${short(item.batchId)} · ${item.periodMonth} · ${types[item.payrollType]} · ${item.rowCount} filas · versión ${item.expectedVersion}`,check);label.prepend(check);card.append(label);
    check.addEventListener('change',()=>{invalidate();opened=null;receiptNotice='';if(check.checked&&selected.size>=100){check.checked=false;say('El límite de esta revisión es 100 lotes completos. No se agregó ni recortó ningún lote.');}else{check.checked?selected.add(item.batchId):selected.delete(item.batchId);}update();});
   }else{
    card.append(el('h4',`${states[item.status]} · ${item.batchCount} lotes · ${item.rowCount} filas`),el('p',item.reason),el('p',`Registrada ${item.createdAt}`));
    const open=button(item.canReview?'Revisar propuesta completa':'Consultar historia completa');open.dataset.annulProposal=item.id;open.disabled=!idle();open.addEventListener('click',()=>openProposal(item.id));card.append(open);
   }list.append(card);
  }
  if(!rows.length)list.append(el('p','No hay resultados para esta consulta. No se registró una anulación.'));
 }
 function update(){
  const usable=Boolean(allowed());host.hidden=!usable;
  for(const input of [mode,search,reason,decision,reset,compare,close,selectPage])input.disabled=!idle();
  period.disabled=!usable||locked()||externalLocked();refresh.classList.toggle('primary',!data);
  refresh.disabled=!usable||working||externalLocked();previous.disabled=!idle()||page<=1;next.disabled=!idle()||page*20>=filtered().length;
  selection.hidden=mode.value!=='candidates';reasonField.hidden=Boolean(opened)&&!opened.canReview;decisionField.hidden=!opened?.canReview;
  count.textContent=`${selected.size} lotes seleccionados. Las páginas y la búsqueda no recortan la selección.`;
  compare.hidden=Boolean(plan)||Boolean(opened&&!opened.canReview);compare.disabled=!idle()||!(opened?opened.canReview:selected.size&&data?.permissions.canPropose);
  compare.textContent=opened?'Revisar decisión completa':'Revisar selección completa';confirm.disabled=!idle()||!plan;confirmation.hidden=!plan;send.hidden=!plan;send.disabled=!idle()||!plan||!confirm.checked;
  selectPage.disabled=!idle()||!data?.permissions.canPropose;
  retry.hidden=!pending;retry.disabled=!usable||working||externalLocked()||data?.scopeKey!==pending?.attempt.scopeKey||!canWrite(pending?.attempt.body.command);
  retry.textContent=pending?.resend?'Reintentar únicamente el envío original':'Recuperar comprobante del envío original';renderList();
  if(needsLoad&&allowed()&&!working&&!externalLocked()){needsLoad=false;queueMicrotask(reload);}
 }
 function clear(){epoch++;access=null;data=null;needsLoad=false;selected.clear();opened=null;invalidate();reason.value='';search.value='';list.replaceChildren();count.textContent='';range.textContent='';note.textContent='';receiptNotice='';update();}
 async function read(resource,generation=epoch){try{const result=await request(API+'?'+resource);if(generation!==epoch||!allowed())throw Object.assign(Error('La consulta dejó de estar vigente.'),{stale:true});if(result?.ok!==true)throw Error('No se pudo verificar la respuesta.');return result.data;}catch(error){if([401,403].includes(error.status)){clear();onAccessInvalidated();}throw error;}}
 async function candidateDetail(id,generation){const detail=monthlyAnnulDetail(await read('resource=detail&kind=candidate&id='+id,generation));if(detail.status!=='candidate'||detail.items[0].batch.id!==id)throw Error('La respuesta no corresponde al lote seleccionado.');return detail;}
 async function proposalDetail(id,generation){const detail=monthlyAnnulDetail(await read('resource=detail&kind=proposal&id='+id,generation));if(detail.proposalId!==id)throw Error('La respuesta no corresponde a la propuesta seleccionada.');return detail;}
 async function fresh(expected,generation=epoch){
  const current=monthlyAnnulBootstrap(await read('resource=bootstrap'+(period.value?'&period='+period.value+'-01':''),generation));
  if(expected&&current.scopeKey!==expected){clear();onAccessInvalidated();throw Object.assign(Error('Cambió la cuenta, sesión, fuente o permiso. Consultá nuevamente.'),{stale:true});}return current;
 }
 async function reload(){if(!allowed()||working||externalLocked())return;const generation=epoch;working=true;invalidate();opened=null;update();onLockChange();
  try{const current=await fresh(pending?.attempt.scopeKey??null,generation);data=current;for(const id of selected)if(!current.candidates.some(c=>c.batchId===id))selected.delete(id);say(receiptNotice||'Consulta completa. Elegí los lotes o abrí una propuesta; consultar no cambia sus estados.');}
  catch(error){data=null;selected.clear();list.replaceChildren();say(error.message);}finally{working=false;update();onLockChange();}
 }
 function show(items,reviewReason=null){
  batches.replaceChildren();const total=items.reduce((n,i)=>n+i.batch.rowCount,0);scope.textContent=`${items.length} lotes completos · ${total} filas originales aprobadas. ${reviewReason?'Motivo de la propuesta: '+reviewReason:''}`;
  for(const item of items){const b=item.batch,section=el('details');section.append(el('summary',`Lote ${short(b.id)} · ${b.periodMonth} · ${types[b.payrollType]} · ${b.rowCount} filas · ${b.contractVersion.endsWith('v2')?'Alta propia':'Origen histórico'}`));
   section.append(el('p',`Aprobación original: ${b.decidedAt} · versión ${b.version}. Estos valores se conservan completos.`));
   for(const r of b.rows){const row=el('details');row.dataset.annulRow=String(r.rowOrdinal);row.append(el('summary',`Fila ${r.rowOrdinal} · Legajo ${r.legajo} · Concepto ${r.conceptSourceId}`));const dl=el('dl');
    for(const[label,value]of [['Persona',r.subject?.employeeName??'Nombre no informado'],['Vínculo',r.employmentContractId],['Legajo',r.legajo],['Concepto',r.conceptSourceId],['Centro de costo',r.costCenterSourceId],['Mes de ajuste',r.adjustmentMonth],['Unidades exactas',r.quantityDecimal],['Importe informado en centavos',r.amountCents],['Movimiento',r.movementType],['Instrumento legal',r.legalInstrument],['Observación',r.observation],['Forzado',r.forced?'Sí':'No'],['Registro propio',r.subject?.registrationId??'No corresponde'],['Fecha de alta propia',r.subject?.registeredAt??'No corresponde'],['Validaciones',r.issues.length?JSON.stringify(r.issues):'Sin observaciones']])dl.append(el('dt',label),el('dd',value===null?'No informado':value));row.append(dl);section.append(row);
   }batches.append(section);
  }review.hidden=false;confirm.checked=false;
 }
 async function openProposal(id){if(!idle())return;const generation=epoch,expected=data.scopeKey;working=true;invalidate();opened=null;update();onLockChange();
  try{await fresh(expected,generation);const value=await proposalDetail(id,generation);if(value.scopeKey!==expected)throw Error('Cambió el acceso. Consultá nuevamente.');opened=value;reason.value='';show(value.items,value.reason);
   if(value.decision){batches.prepend(el('p',`${states[value.status]} · ${value.decision.recordedAt} · ${value.decision.reason}`));say('Historia completa. La decisión y todos los valores originales se conservaron.');}else say(value.canReview?'Revisá el motivo y los valores; elegí una decisión y explicá su fundamento.':'La propuesta requiere la revisión de otra persona autorizada.');
  }catch(error){opened=null;invalidate();say(error.message);}finally{working=false;update();onLockChange();}
 }
 compare.addEventListener('click',async()=>{if(!idle())return;const generation=epoch,expected=data.scopeKey,ids=[...selected],chosenReason=reason.value,chosenDecision=decision.value,proposalValue=opened;working=true;invalidate();update();onLockChange();
  try{const current=await fresh(expected,generation);
   if(proposalValue){const detail=await proposalDetail(proposalValue.proposalId,generation);if(detail.scopeKey!==expected||!current.permissions.canReview)throw Error('Cambió la autorización de revisión.');plan=monthlyAnnulReviewPlan(detail,chosenDecision,chosenReason);opened=detail;show(plan.items,detail.reason);}
   else{if(!current.permissions.canPropose)throw Error('El acceso no permite proponer esta anulación.');const all=[];for(const id of ids)all.push(await candidateDetail(id,generation));plan=monthlyAnnulPlan(all,expected,chosenReason);show(plan.items);}
   await fresh(expected,generation);send.textContent=({propose:'Enviar propuesta de anulación',approve:'Aprobar y anular todos los lotes',reject:'Rechazar propuesta completa'})[plan.body.command];say('Revisión completa, sin escritura. Confirmá después de revisar todos los valores y el motivo.');
  }catch(error){invalidate();say(error.message);}finally{working=false;update();onLockChange();}
 });
 async function receive(attempt,resend){try{const result=resend?await request(API,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.serializedBody}):await request(API+'?resource=attempt&key='+attempt.key);if(result?.ok!==true)throw Error('El comprobante no pudo verificarse.');return monthlyAnnulReceipt(result.data,attempt);}catch(error){if([401,403].includes(error.status)){clear();onAccessInvalidated();}throw error;}}
 function finish(receipt){pending=null;selected.clear();opened=null;reason.value='';invalidate();receiptNotice=({pending:'Propuesta completa registrada. Falta la decisión de otra persona autorizada.',approved:'Anulación completa registrada. Se retiró la exportación de los lotes y se conservaron todas las filas e historia.',rejected:'Propuesta rechazada. Los lotes y sus aprobaciones originales se conservaron.'})[receipt.status];say(receiptNotice);onChanged();}
 send.addEventListener('click',async()=>{if(!idle()||!plan||!confirm.checked)return;const original=plan,generation=epoch;working=true;update();onLockChange();
  try{const current=await fresh(original.scopeKey,generation);if(!canWrite(original.body.command)||!(original.body.command==='propose'?current.permissions.canPropose:current.permissions.canReview))throw Error('El acceso dejó de permitir esta decisión.');
   if(original.body.command!=='propose'){const detail=await proposalDetail(original.body.proposalId,generation);if(!detail.canReview||detail.scopeKey!==original.scopeKey||detail.proposalSha256!==original.body.proposalSha256)throw Error('La propuesta cambió desde la revisión.');}
   if(original.body.command!=='reject'){const all=[];for(const item of original.items)all.push(await candidateDetail(item.batch.id,generation));if(!monthlyAnnulUnchanged(original,all))throw Error('Cambió un valor, versión o identidad desde la revisión. No se envió una decisión. Revisá nuevamente.');}
   await fresh(original.scopeKey,generation);if(generation!==epoch||!allowed())return;
   const attempt=monthlyAnnulAttempt(original,crypto.randomUUID());pending={attempt,uncertain:false,resend:false};update();
   try{finish(await receive(attempt,true));}catch(error){if(!error.stale&&[400,404,409,422].includes(error.status)){pending=null;throw error;}pending.uncertain=true;throw Error('Confirmación pendiente. Se conserva sólo el envío original con su misma clave y contenido. Recuperá su comprobante antes de otra escritura.');}
  }catch(error){invalidate();say(error.message);}finally{working=false;update();onLockChange();}
 });
 retry.addEventListener('click',async()=>{if(!pending||working||!allowed()||externalLocked()||data?.scopeKey!==pending.attempt.scopeKey)return;const original=pending,generation=epoch;working=true;update();onLockChange();
  try{const current=await fresh(original.attempt.scopeKey,generation);if(!(original.attempt.body.command==='propose'?current.permissions.canPropose:current.permissions.canReview))throw Error('El acceso no permite recuperar ese envío.');finish(await receive(original.attempt,original.resend));}
  catch(error){if(error.status===404&&!original.resend){original.resend=true;say('Todavía no se encontró el comprobante. Podés reintentar voluntariamente sólo el envío original; no se cambian sus datos o clave.');}else say('El comprobante sigue pendiente. Conservá el envío original y verificá cuenta, permisos y estado antes de otra operación.');}
  finally{working=false;update();onLockChange();}
 });
 refresh.addEventListener('click',reload);period.addEventListener('change',()=>{epoch++;selected.clear();opened=null;invalidate();data=null;receiptNotice='';update();say('Cambió el período. Consultá para obtener una revisión completa vigente.');});
 for(const control of [mode,search])control.addEventListener(control===search?'input':'change',()=>{page=1;update();});
 for(const control of [reason,decision])control.addEventListener(control===reason?'input':'change',()=>{invalidate();receiptNotice='';update();});
 confirm.addEventListener('change',update);previous.addEventListener('click',()=>{if(idle()){page--;update();}});next.addEventListener('click',()=>{if(idle()){page++;update();}});
 selectPage.addEventListener('click',()=>{if(!idle())return;const ids=filtered().slice((page-1)*20,page*20).filter(i=>i.canPropose).map(i=>i.batchId),combined=new Set([...selected,...ids]);if(combined.size>100){say('La selección supera 100 lotes. No se omitió ni dividió ninguno.');return;}ids.forEach(id=>selected.add(id));opened=null;invalidate();update();});
 reset.addEventListener('click',()=>{if(idle()){selected.clear();opened=null;invalidate();update();}});close.addEventListener('click',()=>{if(idle()){opened=null;invalidate();update();}});
 return {clear,update,locked,inFlight:()=>working,hasPending:()=>Boolean(pending),setAccess(payload){const consulted=Boolean(data)||Boolean(pending)||Boolean(receiptNotice),nextAccess=monthlyDecisionAccess(payload);if(access&&!sameMonthlyDecisionAccess(access,nextAccess))clear();access=nextAccess;if(!allowed()){clear();return;}needsLoad=consulted;update();}};
}
