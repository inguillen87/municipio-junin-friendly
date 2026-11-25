// «Aprobar todo»: la persona que revisa ve en una sola lista lo que espera su decisión en el mes y lo aprueba con un clic.
// Cubre lotes de novedades propias enviados y propuestas de participación del período. Cada aprobación sigue siendo una
// decisión registrada por propuesta, con el mismo control independiente del servidor: lo que preparó esta misma cuenta
// se muestra como «lo preparaste vos» y no se intenta aprobar.
import {participationPending, decideParticipation} from './own-period-participation-model.js';
import {lastClosedMonth, periodLabel, patientRead} from './approvals-inbox-model.js';
import {readSalaryBootstrap} from './native-salary-stream-model.js';
import {salaryCommand} from './native-salary-catalog-model.js';
import {ownProgramCommand} from './own-payroll-program-model.js';
import {familySelectedHistory,decideFamilySelected} from './own-contract-family-payroll-facts-selection.js';
import {salaryNativeHistory,decideSalaryNative} from './own-contract-salary-conditions-native-model.js';
import {salaryConditionsBootstrap,decideSalaryConditions} from './own-contract-salary-conditions-model.js';
import {seniorityPending,decideSeniority} from './own-salary-seniority-model.js';
import {workingTimePending,decideWorkingTime} from './own-contract-working-time-model.js';
import {agreementWorkingTimeBootstrap,decideAgreementWorkingTime} from './own-agreement-working-time-model.js';

const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
const key=()=>crypto.randomUUID();
async function getJson(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw Object.assign(new Error(j?.error||'No se pudo consultar.'),{status:r.status,code:j?.code});return j.data;}
async function post(url,body){const k=key();let last;
 for(let attempt=0;attempt<5;attempt++){const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',Accept:'application/json','idempotency-key':k},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);if(r.ok&&j?.ok===true)return j.data;last=Object.assign(new Error(j?.error||'No se registró.'),{status:r.status,code:j?.code});
  if(!/BUSY/.test(j?.code||''))break;await new Promise(s=>setTimeout(s,1500*(attempt+1)));}
 throw last;}

/** Lista unificada de lo que espera decisión en el período. */
export async function loadQuickApprovals(periods,{onPartial}={}){
 periods=[].concat(periods);const items=[];const errors=[];
 try{const b=await patientRead(()=>getJson('/api/internal-own-payroll-novelties?resource=bootstrap'));
  for(const x of b.batches??[])if(x.status==='submitted'&&periods.some(period=>x.periodMonth===period+'-01'))items.push({kind:'novelty',id:x.id,revision:x.revision,period:x.periodMonth.slice(0,7),label:'Lote de novedades de '+periodLabel(x.periodMonth)+' · '+x.rowCount+(x.rowCount===1?' fila':' filas'),canApprove:b.permissions?.canApprove===true});}
 catch(e){if(e.status!==403)errors.push('Novedades: '+e.message);}
 for(const period of periods)try{const p=participationPending(await patientRead(()=>getJson('/api/internal-own-period-participation?resource=pending&period='+encodeURIComponent(period))),period);
  for(const x of p.proposals)items.push({kind:'participation',id:x.proposalId,contractId:x.contractId,period,label:'Participación de '+periodLabel(period)+' · legajo '+(x.legajo??'sin número'),canApprove:x.canReview,author:x.authorLabel});}
 catch(e){if(e.status!==403)errors.push('Participación de '+periodLabel(period)+': '+e.message);}
 for(const period of periods)try{const h=familySelectedHistory(await patientRead(()=>getJson('/api/internal-own-contract-family-payroll-facts-selection?'+new URLSearchParams({resource:'history',period}))));
  for(const x of h.proposals)if(x.status==='pending')items.push({kind:'family',id:x.id,period,label:'Datos familiares de '+periodLabel(period)+' · '+x.itemCount+(x.itemCount===1?' contrato':' contratos'),canApprove:x.canReview===true});}
 catch(e){if(e.status!==403)errors.push('Datos familiares de '+periodLabel(period)+': '+e.message);}
 for(const period of periods)try{const h=salaryNativeHistory(await patientRead(()=>getJson('/api/internal-own-contract-salary-conditions-native?'+new URLSearchParams({resource:'history',period}))));
  for(const x of h.proposals)if(x.status==='pending')items.push({kind:'conditions',id:x.id,period,label:'Condiciones salariales de '+periodLabel(period)+' · '+x.itemCount+(x.itemCount===1?' contrato':' contratos'),canApprove:x.canReview===true});}
 catch(e){if(e.status!==403)errors.push('Condiciones salariales de '+periodLabel(period)+': '+e.message);}
 // Antigüedad, título e insalubridad: también se aprueba por mes.
 for(const period of periods)try{const b=salaryConditionsBootstrap(await patientRead(()=>getJson('/api/internal-own-contract-salary-conditions?'+new URLSearchParams({resource:'bootstrap',period}))));
  for(const x of b.proposals)if(x.status==='pending')items.push({kind:'seniority',id:x.id,period,label:'Antigüedad, título e insalubridad de '+periodLabel(period)+' · '+x.itemCount+(x.itemCount===1?' contrato':' contratos'),canApprove:x.canReview===true&&b.permissions.canReview===true});}
 catch(e){if(e.status!==403)errors.push('Antigüedad, título e insalubridad de '+periodLabel(period)+': '+e.message);}
 // Antigüedad reconocida: una propuesta por contrato; se muestra como un solo renglón por mes y se aprueba de una vez.
 for(const period of periods)try{const p=seniorityPending(await patientRead(()=>getJson('/api/internal-own-salary-seniority?'+new URLSearchParams({resource:'pending',period}))),period);
  const mine=p.proposals.filter(x=>x.canReview),others=p.proposals.filter(x=>!x.canReview);
  if(mine.length)items.push({kind:'seniorityYears',period,proposals:mine,label:'Antigüedad reconocida de '+periodLabel(period)+' · '+mine.length+(mine.length===1?' contrato':' contratos'),canApprove:true});
  if(others.length)items.push({kind:'seniorityYears',period,proposals:others,label:'Antigüedad reconocida de '+periodLabel(period)+' · '+others.length+(others.length===1?' contrato':' contratos'),canApprove:false});}
 catch(e){if(e.status!==403)errors.push('Antigüedad reconocida de '+periodLabel(period)+': '+e.message);}
 // Jornada contractual: una propuesta por contrato, agrupada en un renglón por mes.
 for(const period of periods)try{const p=workingTimePending(await patientRead(()=>getJson('/api/internal-own-contract-working-time?'+new URLSearchParams({resource:'pending',period}))),period);
  const mine=p.proposals.filter(x=>x.canReview),others=p.proposals.filter(x=>!x.canReview);
  for(const [list,can] of [[mine,true],[others,false]])if(list.length)items.push({kind:'workingTime',period,proposals:list,label:'Jornada contractual de '+periodLabel(period)+' · '+list.length+(list.length===1?' contrato':' contratos'),canApprove:can});}
 catch(e){if(e.status!==403)errors.push('Jornada contractual de '+periodLabel(period)+': '+e.message);}
 // Jornada del convenio: una propuesta por mes para todos los convenios.
 for(const period of periods)try{const b=agreementWorkingTimeBootstrap(await patientRead(()=>getJson('/api/internal-own-agreement-working-time?'+new URLSearchParams({resource:'bootstrap',period}))));
  for(const x of b.proposals)if(x.status==='pending')items.push({kind:'agreementTime',id:x.id,period,label:'Jornada por convenio de '+periodLabel(period),canApprove:x.canReview===true&&b.permissions.canReview===true});}
 catch(e){if(e.status!==403)errors.push('Jornada por convenio de '+periodLabel(period)+': '+e.message);}
 onPartial?.([...items]);
 // Maestro salarial y reglas no son de un mes: se muestran siempre que esperen decisión.
 try{const sal=await patientRead(()=>getJson('/api/internal-native-salary?resource=pending')).catch(async e=>{if(e.status!==400&&e.status!==503)throw e;
   // Antes de instalar la lectura liviana se usa la lectura completa por bloques.
   return readSalaryBootstrap(async(index,snapshot)=>{const q=new URLSearchParams({resource:'stream',page:String(index)});if(snapshot)q.set('snapshot',snapshot);return getJson('/api/internal-native-salary?'+q);});});
  for(const x of sal.proposals??[])if(x.status==='pending')items.push({kind:'salary',proposal:x,scopeVersion:sal.scopeVersion,label:'Maestro salarial · '+(x.reason||'propuesta'),canApprove:x.canReview===true});}
 catch(e){if(e.status!==403)errors.push('Maestro salarial: '+e.message);}
 try{const pr=await patientRead(()=>getJson('/api/internal-own-payroll-program?resource=bootstrap'));
  for(const x of pr.proposals??[])if(x.status==='pending')items.push({kind:'program',proposal:x,scopeVersion:pr.scopeVersion,label:'Reglas de liquidación · '+(x.reason||'propuesta'),canApprove:x.canReview===true});}
 catch(e){if(e.status!==403)errors.push('Reglas: '+e.message);}
 // El maestro va antes que las reglas: una propuesta de reglas puede depender del maestro nuevo.
 const order={novelty:0,participation:1,family:2,conditions:3,seniority:3,seniorityYears:3,workingTime:3,agreementTime:3,salary:4,program:5};items.sort((a,b)=>order[a.kind]-order[b.kind]);
 return {items,errors};
}

async function approveOne(item){const period=item.period;
 if(item.kind==='novelty'){
  return post('/api/internal-own-payroll-novelties',{operation:'command',payload:{command:'approve',batchId:item.id,expectedRevision:item.revision,reasonReference:null,reviewConfirmed:true}});
 }
 const reason='Aprobado desde «Aprobar todo» después de revisar la lista del período.';
 if(item.kind==='conditions'){const detail=await getJson('/api/internal-own-contract-salary-conditions-native?'+new URLSearchParams({resource:'detail',id:item.id}));
  return post('/api/internal-own-contract-salary-conditions-native',{operation:'command',payload:await decideSalaryNative(detail,'approve',reason)});}
 if(item.kind==='workingTime'){
  for(const x of item.proposals){const boot=await patientRead(()=>getJson('/api/internal-own-contract-working-time?'+new URLSearchParams({resource:'bootstrap',contractId:x.contractId,period})));
   if(!boot.proposals.some(r=>r.id===x.proposalId&&r.status==='pending'))continue;
   const detail=await patientRead(()=>getJson('/api/internal-own-contract-working-time?'+new URLSearchParams({resource:'detail',id:x.proposalId})));
   await post('/api/internal-own-contract-working-time',{operation:'command',payload:decideWorkingTime(boot,detail,'approve',reason)});item.progress=(item.proposals.indexOf(x)+1)+' de '+item.proposals.length;item.onProgress?.();}
  return {};}
 if(item.kind==='agreementTime'){const boot=await getJson('/api/internal-own-agreement-working-time?'+new URLSearchParams({resource:'bootstrap',period}));const detail=await getJson('/api/internal-own-agreement-working-time?'+new URLSearchParams({resource:'detail',id:item.id}));
  return post('/api/internal-own-agreement-working-time',{operation:'command',payload:await decideAgreementWorkingTime(boot,detail,'approve',reason)});}
 if(item.kind==='seniorityYears'){let done=0;
  for(const x of item.proposals){const boot=await patientRead(()=>getJson('/api/internal-own-salary-seniority?'+new URLSearchParams({resource:'bootstrap',contractId:x.contractId,period})));
   if(!boot.proposals.some(r=>r.id===x.proposalId&&r.status==='pending')){done++;continue;}
   const detail=await patientRead(()=>getJson('/api/internal-own-salary-seniority?'+new URLSearchParams({resource:'detail',id:x.proposalId})));
   await post('/api/internal-own-salary-seniority',{operation:'command',payload:decideSeniority(boot,detail,'approve',reason)});done++;item.progress=done+' de '+item.proposals.length;item.onProgress?.();}
  return {done};}
 if(item.kind==='seniority'){const boot=await getJson('/api/internal-own-contract-salary-conditions?'+new URLSearchParams({resource:'bootstrap',period}));const detail=await getJson('/api/internal-own-contract-salary-conditions?'+new URLSearchParams({resource:'detail',id:item.id}));
  return post('/api/internal-own-contract-salary-conditions',{operation:'command',payload:await decideSalaryConditions(boot,detail,'approve',reason)});}
 if(item.kind==='family'){const detail=await getJson('/api/internal-own-contract-family-payroll-facts-selection?'+new URLSearchParams({resource:'detail',id:item.id}));
  return post('/api/internal-own-contract-family-payroll-facts-selection',{operation:'command',payload:await decideFamilySelected(detail,'approve',reason)});}
 if(item.kind==='salary'){const x=item.proposal;
  return post('/api/internal-native-salary',{operation:'command',payload:salaryCommand({command:'approve',scopeVersion:item.scopeVersion,baseVersion:x.baseVersion,classificationVersion:x.classificationVersion,proposalId:x.id,proposalSha256:x.requestSha256,items:null,reason,reviewConfirmed:true})});}
 if(item.kind==='program'){const x=item.proposal;
  return post('/api/internal-own-payroll-program',{operation:'command',payload:ownProgramCommand({command:'approve',scopeVersion:item.scopeVersion,baseVersion:x.baseVersion,salaryVersion:x.salaryVersion,proposalId:x.id,proposalSha256:x.requestSha256,program:null,reason,reviewConfirmed:true})});}
 const boot=await getJson('/api/internal-own-period-participation?resource=bootstrap&contractId='+item.contractId+'&period='+period);
 const detail=await getJson('/api/internal-own-period-participation?resource=detail&id='+item.id);
 const payload=decideParticipation(boot,detail,'approve',reason);
 return post('/api/internal-own-period-participation',{operation:'command',payload});
}

export function mountQuickApprovals(host,{onDone}={}){
 if(!host||host.dataset.quickMounted)return null;host.dataset.quickMounted='';
 const href=new URL('approvals-inbox.css',import.meta.url).href;if(![...document.querySelectorAll('link[rel=stylesheet]')].some(l=>l.href===href)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
host.className='mc-quick-approvals';
 host.innerHTML='<header><h3>Aprobar todo lo del mes</h3><p>Revisá la lista y aprobá todo junto. Lo que preparaste vos lo aprueba otra persona.</p></header>'
  +'<div class="mc-quick-row"><label>Mes <input type="month" data-quick-period></label><button type="button" class="button secondary" data-quick-load>Ver pendientes</button></div>'
  +'<p role="status" aria-live="polite" data-quick-status></p><ul class="mc-quick-list" data-quick-list></ul>'
  +'<button type="button" class="button" data-quick-approve hidden></button>';
 const $=s=>host.querySelector('[data-quick-'+s+']');let items=[];let busy=false;
 $('period').value=lastClosedMonth();
 const render=()=>{const list=$('list');list.replaceChildren(...items.map(x=>{const li=el('li',x.state==='ok'?'is-ok':x.state==='error'?'is-error':'');li.append(el('span',null,x.label));
   li.append(el('small',null,x.state==='ok'?' · aprobado':x.state==='error'?' · '+x.message:!x.canApprove?' · lo preparaste vos o no podés decidirlo':''));return li;}));
  const can=items.filter(x=>x.canApprove&&x.state!=='ok');const b=$('approve');b.hidden=!can.length;b.textContent='Aprobar todo ('+can.length+')';b.disabled=busy;};
 async function load(){if(busy)return;busy=true;$('status').textContent='Consultando…';items=[];render();
  const picked=$('period').value,[y,m]=picked.split('-').map(Number),following=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');
  try{const r=await loadQuickApprovals([picked,following],{onPartial:partial=>{items=partial;$('status').textContent='Ya aparecen las novedades. Sigo buscando en el maestro salarial y las reglas (puede tardar unos segundos)…';render();}});items=r.items;
   $('status').textContent=(items.length?items.length+' pendiente'+(items.length===1?'':'s')+' entre '+periodLabel(picked)+' y '+periodLabel(following)+'.':'No hay nada pendiente en '+periodLabel(picked)+' ni en '+periodLabel(following)+'.')+(r.errors.length?' '+r.errors.join(' '):'');}
  catch(e){$('status').textContent=e.message;}finally{busy=false;render();}}
 async function approveAll(){if(busy)return;busy=true;render();const todo=items.filter(x=>x.canApprove&&x.state!=='ok');let ok=0;
  for(const [i,x] of todo.entries()){$('status').textContent='Aprobando '+(i+1)+' de '+todo.length+'…';
   x.onProgress=()=>{$('status').textContent='Aprobando '+(i+1)+' de '+todo.length+' · '+x.label+': '+x.progress+'…';};
   try{await approveOne(x);x.state='ok';ok++;}catch(e){x.state='error';x.message=/INDEPENDENT_REQUIRED/.test(e.code||'')?'lo preparaste vos: lo aprueba otra persona':(e.message||'No se aprobó.');}render();}
  busy=false;$('status').textContent=ok+' de '+todo.length+' aprobados.'+(ok<todo.length?' Revisá los que quedaron marcados.':'');render();onDone?.();}
 $('load').addEventListener('click',load);$('period').addEventListener('change',load);$('approve').addEventListener('click',approveAll);
 load();return {load};
}
