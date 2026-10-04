import {savedNoveltyBatch, sameNoveltyDecision} from './payroll-native-monthly-model.js';
import {monthlyDecisionAccess, monthlyDecisionAllowed, sameMonthlyDecisionAccess, monthlyDecisionPlan,
  monthlyDecisionUnchanged, monthlyDecisionAttempt, assertMonthlyDecisionReceipt, MONTHLY_DECISION_COMMANDS, MONTHLY_DECISION_LIMITS} from './payroll-monthly-decisions-model.js';

const API='/api/internal-payroll-novelties?version=2';
const el=(tag,text,id)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(id)node.id='monthlyDecision'+id;return node;};
const button=(text,id)=>{const n=el('button',text,id);n.type='button';n.className='button';return n;};
const field=(text,input)=>{const label=el('label',text);label.append(input);return label;};
const amount=value=>value===null?'No informado':`${BigInt(value)<0n?'-':''}$ ${(BigInt(value)<0n?-BigInt(value):BigInt(value))/100n},${String((BigInt(value)<0n?-BigInt(value):BigInt(value))%100n).padStart(2,'0')}`;
const types={monthly:'Mensual',first_fortnight:'Primera quincena',sac:'SAC',vacation:'Vacaciones',supplementary:'Complementaria',final:'Final',other:'Otra'};
const states={draft:'Borrador',submitted:'En aprobación',approved:'Aprobado para exportar',rejected:'Rechazado',cancelled:'Cancelado'};
const shortId=value=>value.slice(0,8).toUpperCase()+'…'+value.slice(-6).toUpperCase();

export function mountMonthlyDecisions(host,{request,renderList,onLockChange,onChanged,onAccessInvalidated,externalLocked}) {
  let access=null,batches=[],page=1,plan=null,epoch=0,comparing=false,running=false,stop=false,pending=null,results=[];
  const selected=new Set();
  host.classList.add('monthly-decisions');
  const title=el('h3','Decidir varios lotes', 'Title');host.setAttribute('aria-labelledby',title.id);
  const intro=el('p','Seleccioná lotes de las páginas o filtros y revisá todas sus filas antes de decidir. La consulta muestra los últimos 100 lotes del ámbito; no representa todo el histórico.');
  const filters=el('div');filters.className='monthly-decisions-controls';
  const search=el('input',undefined,'Search');search.type='search';search.maxLength=100;
  const state=el('select',undefined,'State');
  for(const [value,label]of [['all','Todos los estados'],...Object.entries(states)]){const o=el('option',label);o.value=value;state.append(o);}
  filters.append(field('Buscar lote, período o tipo',search),field('Estado',state));
  const previous=button('Página anterior','Previous'),next=button('Página siguiente','Next'),range=el('span',undefined,'Range');range.setAttribute('role','status');
  const pager=el('nav');pager.setAttribute('aria-label','Páginas de lotes');pager.className='monthly-decisions-controls';pager.append(previous,range,next);
  const selectPage=button('Seleccionar lotes de esta página','SelectPage'),reset=button('Retirar selección','Reset'),count=el('p',undefined,'Count');count.setAttribute('role','status');
  const selection=el('div');selection.className='monthly-decisions-controls';selection.append(selectPage,reset,count);
  const action=el('select',undefined,'Action');
  for(const [value,label]of Object.entries(MONTHLY_DECISION_COMMANDS)){const o=el('option',label);o.value=value;action.append(o);}
  const reason=el('select',undefined,'Reason');
  for(const [value,label]of [['invalid_rows','Filas inválidas'],['unsupported_concept','Concepto sin homologar'],['duplicate_or_conflict','Duplicado o conflicto']]){const o=el('option',label);o.value=value;reason.append(o);}
  const reasonField=field('Motivo para rechazar todos los seleccionados',reason);
  const compare=button('Revisar selección completa','Compare');compare.classList.add('primary');
  const decisions=el('div');decisions.className='monthly-decisions-controls';decisions.append(field('Decisión para todos los seleccionados',action),reasonField,compare);
  const review=el('section',undefined,'Review');review.hidden=true;
  const reviewScope=el('p',undefined,'Scope');reviewScope.setAttribute('role','status');
  const reviewed=el('div',undefined,'Batches');
  const confirm=el('input',undefined,'Confirm');confirm.type='checkbox';
  const confirmation=field('Revisé todas las filas de todos los lotes seleccionados.',confirm);
  confirmation.prepend(confirm);
  const consequence=el('p','Cada lote se decide por separado. Si se detiene el recorrido, las decisiones confirmadas se conservan y los demás lotes quedan sin enviar. Aprobar habilita exportación de control; cancelar un lote no anula haberes.');
  const send=button('Confirmar decisiones','Send');send.classList.add('primary');
  const close=button('Cerrar revisión','Close');
  const reviewActions=el('div');reviewActions.className='monthly-decisions-controls';reviewActions.append(send,close);
  review.append(reviewScope,reviewed,consequence,confirmation,reviewActions);
  const stopButton=button('Detener próximas decisiones','Stop');stopButton.hidden=true;
  const retry=button('Recuperar confirmación del envío original','Retry');retry.hidden=true;
  const note=el('p',undefined,'Message');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  const result=el('ul',undefined,'Results');
  host.append(title,intro,filters,pager,selection,decisions,review,stopButton,retry,note,result);

  const locked=()=>comparing||running||Boolean(pending);
  const usable=()=>access&&monthlyDecisionAllowed(access)&&!document.hidden;
  const idle=()=>usable()&&!locked()&&!externalLocked();
  const visibleBatches=()=>batches.filter(b=>(state.value==='all'||b.status===state.value)
    && `${b.id} ${b.periodMonth} ${types[b.payrollType]}`.toLocaleLowerCase('es-AR').includes(search.value.trim().toLocaleLowerCase('es-AR')));
  function view(){if(!monthlyDecisionAllowed(access))return batches;const full=visibleBatches();page=Math.min(Math.max(1,page),Math.max(1,Math.ceil(full.length/20)));return full.slice((page-1)*20,page*20);}
  const say=text=>{if(usable())note.textContent=text;};
  function invalidate(){plan=null;confirm.checked=false;review.hidden=true;reviewed.replaceChildren();reviewScope.textContent='';}
  function renderResults(){result.replaceChildren();if(!usable())return;
    for(const r of results){const li=el('li',`Lote ${shortId(r.id)} · ${r.rows} filas · ${r.status}`);li.dataset.decisionResult=r.status;result.append(li);}
  }
  function update(){
    const allowed=usable();host.hidden=!allowed;
    const full=visibleBatches();view();range.textContent=`Página ${page} de ${Math.max(1,Math.ceil(full.length/20))} · ${full.length} de ${batches.length} lotes consultados`;
    count.textContent=`${selected.size} lotes seleccionados. La búsqueda y las páginas no recortan la selección.`;
    for(const input of [search,state,action,reason,selectPage,reset,compare,close])input.disabled=!idle();
    previous.disabled=!idle()||page<=1;next.disabled=!idle()||page*20>=full.length;
    compare.hidden=Boolean(plan);compare.disabled=!idle()||!selected.size||!monthlyDecisionAllowed(access,action.value);
    reasonField.hidden=action.value!=='reject';
    for(const option of action.options)option.disabled=!monthlyDecisionAllowed(access,option.value);
    confirm.disabled=!idle()||!plan;send.disabled=!idle()||!plan||!confirm.checked;
    stopButton.hidden=!running;stopButton.disabled=stop;
    retry.hidden=!pending;retry.disabled=!allowed||running||comparing||externalLocked()
      ||!sameMonthlyDecisionAccess(access,pending?.access)||!monthlyDecisionAllowed(access,pending?.attempt.command);
    renderResults();
  }
  function changed(){invalidate();results=[];note.textContent='';renderList();update();}
  function clear(){epoch++;stop=true;access=null;batches=[];selected.clear();invalidate();results=[];result.replaceChildren();note.textContent='';search.value='';state.value='all';page=1;update();onLockChange();}
  async function fresh(expected,generation){
    const payload=await request(API+'&resource=bootstrap'),freshAccess=monthlyDecisionAccess(payload);
    if(generation!==epoch||document.hidden)throw Error('La revisión dejó de estar vigente. Volvé a consultar.');
    if(!sameMonthlyDecisionAccess(expected,freshAccess)||!monthlyDecisionAllowed(freshAccess,action.value)){
      onAccessInvalidated();throw Error('El acceso cambió. Actualizá la consulta y revisá de nuevo.');
    }
    return payload;
  }
  async function detail(id){const b=savedNoveltyBatch((await request(API+'&resource=detail&id='+encodeURIComponent(id))).data);
    if(b.id!==id)throw Error('La respuesta corresponde a otro lote.');return b;}
  function showPlan(value){
    reviewScope.textContent=`${MONTHLY_DECISION_COMMANDS[value.command]} · ${value.batches.length} lotes · ${value.rowCount} filas completas. Motivo: ${value.command==='reject'?reason.selectedOptions[0].textContent:'decisión administrativa registrada'}.`;
    reviewed.replaceChildren();
    for(const b of value.batches){
      const section=el('details');section.dataset.monthlyDecisionBatch=b.id;
      section.append(el('summary',`Lote ${shortId(b.id)} · ${b.periodMonth.slice(0,7)} · ${types[b.payrollType]} · ${b.rowCount} filas · ${states[b.status]}`));
      section.append(el('p',`Versión ${b.version} · ${b.contractVersion==='payroll-novelty-batch.v2'?'Alta propia de MuniControl':'Origen histórico'} · ${b.blockingIssueCount ?? 0} bloqueantes · ${b.warningIssueCount ?? 0} avisos`));
      for(const row of b.rows){const item=el('details');item.dataset.monthlyDecisionRow=String(row.rowOrdinal);
        item.append(el('summary',`Fila ${row.rowOrdinal} · Legajo ${row.legajo} · Concepto ${row.conceptSourceId}`));
        const values=[['Persona',row.subject?.employeeName ?? 'Nombre no informado'],['Vínculo de origen',row.employmentContractId],
          ['Registro propio',row.subject?.registrationId ?? 'No corresponde'],['Fecha de alta propia',row.subject?.registeredAt ?? 'No corresponde'],
          ['Identidad vigente',row.identityCurrent===false?'Cambió; sólo admite las decisiones habilitadas por el servidor':row.identityCurrent===true?'Verificada':'Fuente histórica'],
          ['Legajo',row.legajo],['Concepto',row.conceptSourceId],['Centro de costo',row.costCenterSourceId],['Mes de ajuste',row.adjustmentMonth],
          ['Unidades exactas',row.quantityDecimal],['Importe informado',amount(row.amountCents)],['Movimiento',row.movementType],
          ['Instrumento legal',row.legalInstrument],['Observación',row.observation],['Forzado',row.forced?'Sí':'No'],
          ['Validaciones',row.issues.length?row.issues.map(i=>`${i.code} · ${i.severity} · ${i.blocking?'Bloqueante':'Aviso'}${i.details?' · '+JSON.stringify(i.details):''}`).join('\n'):'Sin observaciones']];
        const dl=el('dl');for(const [name,value]of values){dl.append(el('dt',name),el('dd',value===null?'No informado':value));}item.append(dl);section.append(item);
      }
      reviewed.append(section);
    }
    review.hidden=false;confirm.checked=false;send.textContent=`Confirmar: ${MONTHLY_DECISION_COMMANDS[value.command].toLocaleLowerCase('es-AR')}`;
  }
  compare.addEventListener('click',async()=>{
    if(!idle()||!selected.size)return;
    const generation=epoch,expected=access,ids=[...selected],command=action.value,rejectReason=reason.value;
    comparing=true;invalidate();note.textContent='Consultando todas las filas de la selección…';update();onLockChange();
    try{
      const current=await fresh(expected,generation);
      for(const id of ids){const before=batches.find(b=>b.id===id),now=current.batches.find(b=>b.id===id);
        if(!before||!now||before.version!==now.version||before.status!==now.status)throw Error('Cambió un lote seleccionado. Actualizá la consulta y elegilo nuevamente.');}
      const fullRows=ids.reduce((n,id)=>n+current.batches.find(b=>b.id===id).rowCount,0);
      if(fullRows>MONTHLY_DECISION_LIMITS.rows)throw Error(`La selección tiene ${fullRows} filas y supera las 5.000 de esta revisión conjunta. No se omitió ninguna fila ni se envió una decisión.`);
      const items=[];for(const id of ids){items.push(await detail(id));if(generation!==epoch||document.hidden)throw Error('La revisión dejó de estar vigente.');}
      await fresh(expected,generation);
      if(command!==action.value||rejectReason!==reason.value||ids.join('|')!==[...selected].join('|'))throw Error('La selección o decisión cambió. Compará nuevamente.');
      plan=monthlyDecisionPlan(items,command,rejectReason,expected);showPlan(plan);say('Revisión completa, sin escrituras. Abrí los lotes y sus filas; confirmá después de revisar.');
    }catch(error){invalidate();say(error.message);}finally{comparing=false;update();onLockChange();}
  });
  async function sendOriginal(sealed){
    try{
      const response=await request(sealed.attempt.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':sealed.attempt.key},body:sealed.attempt.body});
      assertMonthlyDecisionReceipt(sealed.batch,sealed.attempt,response);pending=null;return true;
    }catch(error){
      // Once uncertain, a later rejection cannot disprove the original commit.
      if(!sealed.uncertain&&!error.stale&&[400,404,409,422].includes(error.status)){pending=null;throw error;}
      sealed.uncertain=true;pending=sealed;throw Error('Confirmación pendiente. Se detuvieron los demás lotes. Recuperá sólo el envío original con la misma cuenta y permisos.');
    }
  }
  send.addEventListener('click',async()=>{
    if(!idle()||!plan||!confirm.checked)return;
    const original=plan,generation=epoch;running=true;stop=false;
    results=original.batches.map(b=>({id:b.id,rows:b.rowCount,status:'Sin enviar'}));update();onLockChange();
    try{
      await fresh(original.access,generation);
      const current=[];for(const b of original.batches){if(stop||generation!==epoch)return;current.push(await detail(b.id));}
      if(stop||generation!==epoch)return;
      if(!monthlyDecisionUnchanged(original,current))throw Error('La selección cambió desde la revisión. No se envió ninguna decisión. Revisá nuevamente.');
      for(const b of original.batches){
        if(stop||generation!==epoch||document.hidden)break;
        await fresh(original.access,generation);const latest=await detail(b.id);
        if(stop||generation!==epoch||document.hidden)break;
        if(!sameNoveltyDecision(b,latest,original.command))throw Error('Cambió un lote antes de enviarlo. Se conservaron las decisiones confirmadas y se detuvo el resto.');
        const sealed={batch:b,access:original.access,attempt:monthlyDecisionAttempt(original,b,crypto.randomUUID()),uncertain:false};pending=sealed;
        try{await sendOriginal(sealed);if(generation===epoch){results.find(r=>r.id===b.id).status='Confirmado';selected.delete(b.id);}}
        catch(error){if(generation===epoch&&pending)results.find(r=>r.id===b.id).status='Confirmación pendiente';throw error;}
        update();
      }
      say(stop?'Recorrido detenido. Se conserva cada decisión confirmada; las restantes necesitan otra selección y revisión.':'Decisiones confirmadas. Se conserva el historial de cada lote.');
    }catch(error){say(error.message);}finally{
      running=false;invalidate();update();onLockChange();
      if(generation===epoch&&!pending)await onChanged();
    }
  });
  retry.addEventListener('click',async()=>{
    const sealed=pending;if(!sealed||!usable()||running||comparing||externalLocked())return;
    const generation=epoch;running=true;stop=true;update();onLockChange();
    try{
      await fresh(sealed.access,generation);const current=await detail(sealed.batch.id);
      if(generation!==epoch||document.hidden)throw Error('La consulta dejó de estar vigente.');
      if(['contractVersion','sourceMode','periodMonth','payrollType','rowCount'].some(k=>current[k]!==sealed.batch[k]))throw Error('El lote consultado no corresponde al envío original.');
      await sendOriginal(sealed);
      if(generation===epoch){const r=results.find(r=>r.id===sealed.batch.id);if(r)r.status='Confirmado';selected.delete(sealed.batch.id);say('Confirmado el envío original. Los demás lotes siguen sin enviar; requieren otra selección y revisión.');}
    }catch(error){say(error.message);}finally{running=false;update();onLockChange();if(generation===epoch&&!pending)await onChanged();}
  });
  stopButton.addEventListener('click',()=>{stop=true;say('Se detendrán las próximas decisiones. Se verificará sólo el envío ya iniciado.');update();});
  confirm.addEventListener('change',update);close.addEventListener('click',()=>{if(idle()){invalidate();update();}});
  action.addEventListener('change',changed);reason.addEventListener('change',changed);
  for(const input of [search,state])input.addEventListener(input===search?'input':'change',()=>{if(idle()){page=1;renderList();update();}});
  previous.addEventListener('click',()=>{if(idle()){page--;renderList();update();}});next.addEventListener('click',()=>{if(idle()){page++;renderList();update();}});
  reset.addEventListener('click',()=>{if(idle()){selected.clear();changed();}});
  selectPage.addEventListener('click',()=>{if(!idle())return;const values=view().filter(b=>b.allowedCommands.some(c=>monthlyDecisionAllowed(access,c)));
    if(new Set([...selected,...values.map(b=>b.id)]).size>100){say('La selección supera 100 lotes. No se incorporó una parte de la página.');return;}
    values.forEach(b=>selected.add(b.id));changed();});
  return {
    locked,clear,update,view,inFlight:()=>running||comparing,hasPending:()=>Boolean(pending),
    setAccess(payload){const nextAccess=monthlyDecisionAccess(payload);
      if(access&&!sameMonthlyDecisionAccess(access,nextAccess))clear();
      access=nextAccess;batches=payload.batches;
      if(!monthlyDecisionAllowed(access)){clear();access=nextAccess;batches=payload.batches;update();return;}
      if(!monthlyDecisionAllowed(access,action.value))action.value=Object.keys(MONTHLY_DECISION_COMMANDS).find(c=>monthlyDecisionAllowed(access,c));
      update();
    },
    addSelector(batch,cell){if(!usable()||!batch.allowedCommands.some(c=>monthlyDecisionAllowed(access,c)))return;
      const input=el('input');input.type='checkbox';input.dataset.monthlyDecisionSelect=batch.id;input.checked=selected.has(batch.id);input.disabled=!idle();
      input.setAttribute('aria-label',`Seleccionar lote ${shortId(batch.id)} · ${batch.periodMonth.slice(0,7)} · ${types[batch.payrollType]}`);
      const label=field('Seleccionar',input);label.className='monthly-decision-pick';cell.prepend(label);
      input.addEventListener('change',()=>{if(!idle())return;if(input.checked){if(selected.size>=100){input.checked=false;say('El límite es 100 lotes. No se recorta la selección.');return;}selected.add(batch.id);}else selected.delete(batch.id);changed();});
    },
  };
}
