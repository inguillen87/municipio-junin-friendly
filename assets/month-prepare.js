// «Preparar el mes siguiente»: con un clic deja preparado para el mes nuevo todo lo que el cálculo pide aprobar por período,
// copiando lo aprobado en el mes anterior. No aprueba nada: cada propuesta queda pendiente y otra persona la aprueba desde
// «Aprobar todo». Es idempotente: si el mes nuevo ya tiene una revisión aprobada o una propuesta pendiente, no prepara otra.
// Cubre condiciones de antigüedad/título/insalubridad, docencia/vivienda/base de días, datos familiares, horas por convenio,
// antigüedad reconocida y jornada contractual. Sueldos y reglas tienen su propio paso de vigencia.
import {salaryConditionsBootstrap,prepareSalaryConditions} from './own-contract-salary-conditions-model.js';
import {salaryNativeHistory,salaryNativeDetail,salaryNativeBootstrap,prepareSalaryNative} from './own-contract-salary-conditions-native-model.js';
import {familySelectedHistory,familySelectedDetail,familySelectedBootstrap,prepareFamilySelected} from './own-contract-family-payroll-facts-selection.js';
import {agreementWorkingTimeBootstrap,prepareAgreementWorkingTime} from './own-agreement-working-time-model.js';
import {seniorityBootstrap,prepareSeniority,seniorityPending} from './own-salary-seniority-model.js';
import {workingTimeBootstrap,prepareWorkingTime,workingTimePending} from './own-contract-working-time-model.js';
import {periodLabel,patientRead} from './approvals-inbox-model.js';

export function previousMonth(period){const [y,m]=period.split('-').map(Number);return m===1?(y-1)+'-12':y+'-'+String(m-1).padStart(2,'0');}
export function nextMonth(period){const [y,m]=period.split('-').map(Number);return m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url,init){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...init,headers:{Accept:'application/json',...(init?.headers||{})}});const j=await r.json().catch(()=>null);
 if(!r.ok||j?.ok!==true)throw Object.assign(new Error(j?.error||'No se pudo consultar.'),{status:r.status,code:j?.code});return j.data;}
const read=url=>patientRead(()=>getJson(url));
const readPost=(url,payload)=>patientRead(()=>getJson(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'bootstrap',payload})}));
async function propose(url,payload){const key=crypto.randomUUID();let last;
 for(let attempt=0;attempt<5;attempt++){
  const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',Accept:'application/json','idempotency-key':key},body:JSON.stringify({operation:'command',payload})});
  const j=await r.json().catch(()=>null);if(r.ok&&j?.ok===true)return j.data;last=Object.assign(new Error(j?.error||'No se registró.'),{status:r.status,code:j?.code});
  // Mismo intento: si la respuesta se perdió, reenviar con la misma referencia no duplica la propuesta.
  if(r.status<500&&!/BUSY/.test(j?.code||''))break;await sleep(1500*(attempt+1));}
 throw last;}
const busyPeriod=(b)=>b.configuration.revision>0||b.proposals.some(p=>p.status==='pending');
const qs=o=>new URLSearchParams(o).toString();

// Cada paso devuelve {label, prepared, skipped, failed:[mensajes]}.
async function stepLegacy(from,to,reason){
 const o=salaryConditionsBootstrap(await read('/api/internal-own-contract-salary-conditions?'+qs({resource:'bootstrap',period:from})));
 const n=salaryConditionsBootstrap(await read('/api/internal-own-contract-salary-conditions?'+qs({resource:'bootstrap',period:to})));
 if(busyPeriod(n))return{prepared:0,skipped:1,failed:[]};
 if(!o.configuration.revision)return{prepared:0,skipped:0,failed:['El mes anterior no tiene antigüedad, título e insalubridad aprobados.']};
 await propose('/api/internal-own-contract-salary-conditions',prepareSalaryConditions(n,structuredClone(o.configuration.items),reason));
 return{prepared:1,skipped:0,failed:[]};
}
async function stepSelection(kind,from,to,reason){
 const cfg=kind==='native'
  ?{url:'/api/internal-own-contract-salary-conditions-native',history:salaryNativeHistory,detail:salaryNativeDetail,boot:salaryNativeBootstrap,prepare:prepareSalaryNative}
  :{url:'/api/internal-own-contract-family-payroll-facts-selection',history:familySelectedHistory,detail:familySelectedDetail,boot:familySelectedBootstrap,prepare:prepareFamilySelected};
 const h=cfg.history(await read(cfg.url+'?'+qs({resource:'history',period:from})));
 let prepared=0,skipped=0;const failed=[];
 for(const p of h.proposals.filter(x=>x.status==='approved')){
  try{const d=await cfg.detail(await read(cfg.url+'?'+qs({resource:'detail',id:p.id})));const contractIds=[...d.contractIds].sort();
   const o=cfg.boot(await readPost(cfg.url,{period:from,contractIds})),n=cfg.boot(await readPost(cfg.url,{period:to,contractIds}));
   if(n.proposals.some(x=>x.status==='pending')||n.configuration.items.length){skipped++;continue;}
   await propose(cfg.url,cfg.prepare(n,structuredClone(o.configuration.items),reason));prepared++;}
  catch(e){failed.push(e.message);}
 }
 return{prepared,skipped,failed};
}
async function stepAgreement(from,to,reason){
 const url='/api/internal-own-agreement-working-time';
 const o=agreementWorkingTimeBootstrap(await read(url+'?'+qs({resource:'bootstrap',period:from}))),n=agreementWorkingTimeBootstrap(await read(url+'?'+qs({resource:'bootstrap',period:to})));
 if(busyPeriod(n))return{prepared:0,skipped:1,failed:[]};
 if(!o.configuration.revision)return{prepared:0,skipped:0,failed:['El mes anterior no tiene horas por convenio aprobadas.']};
 await propose(url,prepareAgreementWorkingTime(n,structuredClone(o.configuration.items),reason));return{prepared:1,skipped:0,failed:[]};
}
async function stepPerContract(kind,contractIds,from,to,reason,onTick){
 const cfg=kind==='seniority'
  ?{url:'/api/internal-own-salary-seniority',boot:seniorityBootstrap,prepare:prepareSeniority,copy:d=>({years:d.years,months:d.months,asOfDate:d.asOfDate,documentReference:d.documentReference})}
  :{url:'/api/internal-own-contract-working-time',boot:workingTimeBootstrap,prepare:prepareWorkingTime,copy:d=>({dailyHours:d.dailyHours,monthlyHours:d.monthlyHours,asOfDate:d.asOfDate,documentReference:d.documentReference})};
 let prepared=0,skipped=0,done=0;const failed=[];let next=0;
 // Cuatro a la vez: suficiente para no hacer esperar y sin saturar la base. Cada envío reintenta con su misma referencia.
 const worker=async()=>{while(next<contractIds.length){const contractId=contractIds[next++];
  try{const n=cfg.boot(await read(cfg.url+'?'+qs({resource:'bootstrap',contractId,period:to})));
   if(busyPeriod(n)){skipped++;}
   else{const o=cfg.boot(await read(cfg.url+'?'+qs({resource:'bootstrap',contractId,period:from})));
    if(!o.configuration.revision)skipped++;
    else{await propose(cfg.url,cfg.prepare(n,cfg.copy(o.configuration.definition),reason));prepared++;}}}
  catch(e){failed.push(e.message);}
  onTick?.(++done,contractIds.length);
 }};
 await Promise.all([worker(),worker(),worker(),worker()]);
 return{prepared,skipped,failed};
}

export async function prepareMonth(to,{onProgress}={}){
 const from=previousMonth(to),label=periodLabel(to),reason=label.charAt(0).toUpperCase()+label.slice(1)+': se mantiene lo aprobado en '+periodLabel(from)+' (preparado con «Preparar el mes siguiente»).';
 const steps=[],say=(text)=>onProgress?.(text,steps);
 const run=async(name,fn)=>{say(name+'…');let r;try{r=await fn();}catch(e){r={prepared:0,skipped:0,failed:[e.message]};}steps.push({name,...r});say(name+' listo.');};
 await run('Antigüedad, título e insalubridad',()=>stepLegacy(from,to,reason));
 await run('Docencia, vivienda y base de días',()=>stepSelection('native',from,to,reason));
 await run('Datos familiares',()=>stepSelection('family',from,to,reason));
 await run('Horas por convenio',()=>stepAgreement(from,to,reason));
 // Los contratos activos salen de la fuente completa de condiciones del mes nuevo.
 let contracts=[];try{contracts=salaryConditionsBootstrap(await read('/api/internal-own-contract-salary-conditions?'+qs({resource:'bootstrap',period:to}))).source.subjects.map(s=>s.contractId);}catch(e){steps.push({name:'Contratos activos',prepared:0,skipped:0,failed:[e.message]});}
 await run('Antigüedad reconocida',()=>stepPerContract('seniority',contracts,from,to,reason,(i,t)=>say('Antigüedad reconocida: '+i+' de '+t+'…')));
 await run('Jornada contractual',()=>stepPerContract('working',contracts,from,to,reason,(i,t)=>say('Jornada contractual: '+i+' de '+t+'…')));
 return {from,to,steps};
}

export function mountMonthPrepare(host){
 if(!host||host.dataset.monthPrepareMounted)return null;host.dataset.monthPrepareMounted='';
 host.className='mc-quick-approvals mc-month-prepare';
 host.innerHTML='<header><h3>Preparar el mes siguiente</h3><p>Copia lo aprobado del mes anterior (condiciones, familia, antigüedad y jornada) para el mes que elijas. Después otra persona lo aprueba con «Aprobar todo».</p></header>'
  +'<div class="mc-quick-row"><label>Mes a preparar <input type="month" data-mp-period></label><button type="button" class="button" data-mp-go>Preparar</button></div>'
  +'<progress data-mp-bar max="6" value="0" hidden></progress><p role="status" aria-live="polite" data-mp-status></p><ul class="mc-quick-list" data-mp-list></ul>';
 const $=s=>host.querySelector('[data-mp-'+s+']');let busy=false;
 const now=new Date();$('period').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const li=(text,cls)=>{const x=document.createElement('li');if(cls)x.className=cls;x.textContent=text;return x;};
 $('go').addEventListener('click',async()=>{if(busy)return;const to=$('period').value;if(!/^\d{4}-\d{2}$/.test(to))return;busy=true;$('go').disabled=true;$('bar').hidden=false;$('bar').value=0;$('list').replaceChildren();
  try{const r=await prepareMonth(to,{onProgress:(text,steps)=>{$('status').textContent=text;$('bar').value=steps.length;}});
   $('list').replaceChildren(...r.steps.map(s=>li(s.name+': '+(s.prepared?s.prepared+' preparado'+(s.prepared===1?'':'s'):'nada nuevo')+(s.skipped?' · '+s.skipped+' ya estaba'+(s.skipped===1?'':'n'):'')+(s.failed.length?' · '+s.failed.length+' con problema: '+s.failed[0]:''),s.failed.length?'is-error':'is-ok')));
   $('status').textContent='Listo. Ahora otra persona entra a «Aprobar todo», elige '+periodLabel(to)+' y aprueba.';}
  catch(e){$('status').textContent=e.message;}
  finally{busy=false;$('go').disabled=false;$('bar').value=6;}});
 return {};
}

// «¿Está listo el mes?»: lista corta de lo que el cálculo exige aprobado para el período, en lenguaje simple.
// Sólo lee. Cada renglón dice «listo», «falta aprobar» o «falta preparar».
export async function monthStatus(period){
 const out=[];const add=(label,state,detail='')=>out.push({label,state,detail});
 const safe=async(label,fn)=>{try{await fn();}catch(e){add(label,'unknown',e.message);}};
 await safe('Antigüedad, título e insalubridad',async()=>{const b=salaryConditionsBootstrap(await read('/api/internal-own-contract-salary-conditions?'+qs({resource:'bootstrap',period})));
  add('Antigüedad, título e insalubridad',b.configuration.revision>0?'ok':b.proposals.some(p=>p.status==='pending')?'toApprove':'prepare');});
 await safe('Docencia, vivienda y base de días',async()=>{const h=salaryNativeHistory(await read('/api/internal-own-contract-salary-conditions-native?'+qs({resource:'history',period})));
  add('Docencia, vivienda y base de días',h.proposals.some(p=>p.status==='pending')?'toApprove':h.proposals.some(p=>p.status==='approved')?'ok':'prepare');});
 await safe('Datos familiares',async()=>{const h=familySelectedHistory(await read('/api/internal-own-contract-family-payroll-facts-selection?'+qs({resource:'history',period})));
  add('Datos familiares',h.proposals.some(p=>p.status==='pending')?'toApprove':h.proposals.some(p=>p.status==='approved')?'ok':'prepare');});
 await safe('Horas por convenio',async()=>{const b=agreementWorkingTimeBootstrap(await read('/api/internal-own-agreement-working-time?'+qs({resource:'bootstrap',period})));
  add('Horas por convenio',b.configuration.revision>0?'ok':b.proposals.some(p=>p.status==='pending')?'toApprove':'prepare');});
 await safe('Antigüedad reconocida',async()=>{const p=seniorityPending(await read('/api/internal-own-salary-seniority?'+qs({resource:'pending',period})),period);
  add('Antigüedad reconocida',p.proposals.length?'toApprove':'ok',p.proposals.length?p.proposals.length+' contratos esperan aprobación':'sin pendientes');});
 await safe('Jornada contractual',async()=>{const p=workingTimePending(await read('/api/internal-own-contract-working-time?'+qs({resource:'pending',period})),period);
  add('Jornada contractual',p.proposals.length?'toApprove':'ok',p.proposals.length?p.proposals.length+' contratos esperan aprobación':'sin pendientes');});
 return out;
}
const STATE_TEXT={ok:'Listo',toApprove:'Falta aprobar',prepare:'Falta preparar',unknown:'No se pudo consultar'};
export function mountMonthStatus(host){
 if(!host||host.dataset.monthStatusMounted)return null;host.dataset.monthStatusMounted='';
 host.className='mc-quick-approvals mc-month-status';
 host.innerHTML='<header><h3>¿Está listo el mes para calcular?</h3><p>Lo que el cálculo necesita aprobado. Verde: listo. Amarillo: falta un paso.</p></header>'
  +'<div class="mc-quick-row"><label>Mes <input type="month" data-ms-period></label><button type="button" class="button secondary" data-ms-go>Revisar</button></div>'
  +'<p role="status" aria-live="polite" data-ms-status></p><ul class="mc-quick-list mc-status-list" data-ms-list></ul>';
 const $=s=>host.querySelector('[data-ms-'+s+']');const now=new Date();$('period').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 let busy=false;
 async function run(){if(busy)return;busy=true;$('status').textContent='Revisando…';$('list').replaceChildren();
  try{const rows=await monthStatus($('period').value);
   $('list').replaceChildren(...rows.map(r=>{const li=document.createElement('li');li.className=r.state==='ok'?'is-ok':'is-warn';const b=document.createElement('strong');b.textContent=(r.state==='ok'?'✓ ':'• ')+r.label;const sm=document.createElement('small');sm.textContent=' · '+STATE_TEXT[r.state]+(r.detail?' ('+r.detail+')':'');li.append(b,sm);return li;}));
   const left=rows.filter(r=>r.state!=='ok');
   $('status').textContent=!left.length?'Todo listo: ya se puede calcular '+periodLabel($('period').value)+'.':left.some(r=>r.state==='prepare')?'Falta preparar: usá «Preparar el mes siguiente» y después «Aprobar todo».':'Sólo falta aprobar: otra persona entra a «Aprobar todo».';}
  catch(e){$('status').textContent=e.message;}finally{busy=false;}}
 $('go').addEventListener('click',run);$('period').addEventListener('change',run);run();return {run};
}
