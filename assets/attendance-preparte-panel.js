import { verifyPreparte, preparteDuration, reviewedSeconds, dedicationPercent, reviewPreparteSelections } from './attendance-preparte-model.js';
import { preparteXlsx } from './attendance-preparte-export.js';
import { referenceStart, monthlyTardiness, reviewPreparteAll, fractionLabel, TARDINESS_DEFAULT } from './attendance-tardiness-model.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function mountAttendancePreparte(host,{ canUse, unavailableReason=()=>null, period, payrollType, onUse, onDenied }={}) {
  host.classList.add('ap-panel');host.dataset.reviewOnly='true';
  host.innerHTML=`<summary>Generar preparte de relojes: mayor dedicación y tardanzas</summary><div class="ap-body">
  <div class="ap-heading"><div><p class="ap-eyebrow">PERSONAL → PREPARTE → NOVEDADES</p><h3>Horas registradas, revisión por legajo</h3><p>Consultá el mes elegido arriba. Revisá horas, tope individual y porcentaje antes de agregarlos a novedades.</p></div><span class="ap-badge">Sin importe ni pago automático</span></div>
  <div class="ap-toolbar"><label>Fuente<select data-ap-site><option value="pm-10">Edificio Viejo · PM-10</option><option value="pm-14">Edificio Nuevo · PM-14</option><option value="pm-03">Galpón Municipal · PM-03</option><option value="pm-02">Compras y Suministros · PM-02</option><option value="pm-05">Delegación La Colonia · PM-05</option><option value="pm-06">Polideportivo La Colonia · PM-06</option></select></label><button type="button" class="button primary" data-ap-load>Consultar mes desde relojes</button><button type="button" class="button" data-ap-clear>Descartar preparte</button></div>
  <p data-ap-status role="status" aria-live="polite">El preparte consulta registros conservados. No modifica relojes ni liquida haberes.</p>
  <div data-ap-result hidden><div class="ap-metrics" data-ap-metrics></div>
  <div class="ap-toolbar"><label>Buscar en el preparte<input data-ap-search type="search" placeholder="Persona o legajo" maxlength="120" autocomplete="off"></label><label>Mostrar<select data-ap-filter><option value="all">Todo el corte</option><option value="ready">Con tiempo extra para revisar</option><option value="issues">Con incidencias</option><option value="selected">Seleccionados</option></select></label></div>
  <div class="ap-table" role="region" aria-label="Revisión por legajo del preparte" tabindex="0"><table><thead><tr><th>Incluir</th><th>Persona / legajo</th><th>Extra observado</th><th>Horas reconocidas</th><th>Tope declarado %</th><th>Porcentaje propuesto</th><th>Control</th></tr></thead><tbody data-ap-rows></tbody></table></div>
  <nav class="ap-toolbar" aria-label="Páginas del preparte"><button type="button" class="button" data-ap-prev>Anterior</button><span data-ap-count></span><button type="button" class="button" data-ap-next>Siguiente</button></nav>
  <section class="ap-tardiness" data-ap-td aria-label="Tardanzas del mes"><h4>Tardanzas del mes · Ley 5.811 art. 65 y tabla de Junín</h4><p class="ap-td-rule">Minutos tarde sumados en el mes sobre la entrada de referencia de cada persona: hasta 5 sin descuento; hasta 15, ¼ de jornada; hasta 1 h, ½; hasta 2 h 30, ¾; más, la jornada completa. Va al concepto 101. Las excepciones horarias de Personal no cuentan.</p><p data-ap-td-status role="status" aria-live="polite"></p>
  <div class="ap-toolbar"><label>Mostrar<select data-ap-td-filter><option value="late">Con descuento propuesto</option><option value="all">Todas las personas con legajo</option><option value="selected">Seleccionadas</option></select></label></div>
  <div class="ap-table" role="region" aria-label="Tardanzas por legajo" tabindex="0"><table><thead><tr><th>Incluir</th><th>Persona / legajo</th><th>Entrada de referencia</th><th>Tardanzas del mes</th><th>Descuento propuesto</th></tr></thead><tbody data-ap-td-rows></tbody></table></div>
  <nav class="ap-toolbar" aria-label="Páginas de tardanzas"><button type="button" class="button" data-ap-td-prev>Anterior</button><span data-ap-td-count></span><button type="button" class="button" data-ap-td-next>Siguiente</button></nav></section>
  <section class="ap-corrections" data-ap-corrections hidden aria-label="Correcciones del preparte seleccionado"><h4>Revisá estas correcciones</h4><p data-ap-correction-count role="status" aria-live="polite"></p><ol data-ap-correction-list></ol></section>
  <label class="ap-document">Documento de Personal que respalda horas, topes y porcentajes<input data-ap-reference maxlength="160" autocomplete="off" placeholder="Resolución o listado autorizado por Hugo, fecha y versión"></label>
  <label class="ap-confirm"><input data-ap-reviewed type="checkbox"><span>Revisé las filas seleccionadas contra la documentación de Personal. Se enviarán como borrador para revisión independiente.</span></label>
  <div class="ap-toolbar"><button type="button" class="button" data-ap-check>Revisar seleccionados</button><button type="button" class="button primary" data-ap-use>Agregar seleccionados a novedades</button><button type="button" class="button" data-ap-export>Descargar preparte · Excel</button></div>
  <p class="ap-scope">Alcance: un punto y un mes, no toda la asistencia municipal. Las tardanzas usan la entrada de referencia de cada persona (estimada por sus marcas; Personal la confirma o corrige) y las excepciones horarias registradas; un día con una sola salida queda sin entrada, nunca como tardanza. No se presumen ausencias por falta de marcas. La escala propone 5 % por cada 6 horas mensuales reconocidas (Acta 20: 120 h = 100 %), al escalón más cercano; el tope del decreto y la revisión la limitan. Los distintos vínculos o equipos de un mismo legajo no se suman como horas reconocibles: quedan bloqueados para revisión. El tope ingresado queda declarado para revisión; no sustituye una autorización registrada. Las fórmulas de los conceptos 44 y 95 siguen separadas.</p>
  <p class="ap-source" data-ap-source></p></div></div>`;
  const $=s=>host.querySelector(s);let data=null,decisions=new Map(),page=1,busy=false,externalBusy=false,serial=0,lastAccess=null,reviewActive=false,tdDecisions=new Map(),tdPage=1,exceptions=null;
  const status=(text,error=false)=>{const n=$('[data-ap-status]');n.textContent=text;n.dataset.error=String(error);};
  const context=()=>({period:period(),site:$('[data-ap-site]').value});
  const decision=row=>{if(!decisions.has(row.key))decisions.set(row.key,{selected:false,hours:row.canPropose&&row.extraSeconds%60===0?preparteDuration(row.extraSeconds).slice(0,-3):'',cap:'',percent:row.canPropose?String(dedicationPercent(row.extraSeconds)||''):'',percentAuto:true});return decisions.get(row.key);};
  const current=()=>data&&data.period===period()&&data.site.key===$('[data-ap-site]').value;
  function controls(){const available=canUse();if(!data&&!busy&&!externalBusy&&available!==lastAccess){status(available?'Listo para consultar el mes elegido desde relojes.':unavailableReason()==='source'?'Relojes: disponible cuando estén incorporadas las marcaciones del mes.':'Se necesitan permisos de asistencia, consulta de legajos y preparación de novedades. Esta sesión aún no los habilita.');lastAccess=available;}host.querySelectorAll('button,input,select').forEach(n=>n.disabled=busy||externalBusy||!canUse());
    host.querySelectorAll('[data-blocked]').forEach(n=>n.disabled=true);$('[data-ap-clear]').disabled=busy||externalBusy;
    $('[data-ap-prev]').disabled=busy||externalBusy||page<=1;$('[data-ap-next]').disabled=busy||externalBusy||page*25>=visible().length;
    $('[data-ap-use]').disabled=busy||externalBusy||!canUse()||!current()||![...decisions.values()].some(v=>v.selected)&&![...tdDecisions.values()].some(v=>v.selected);
    $('[data-ap-td-prev]').disabled=busy||externalBusy||tdPage<=1;$('[data-ap-td-next]').disabled=busy||externalBusy||tdPage*25>=tdVisible().length;
    $('[data-ap-check]').disabled=busy||externalBusy||!canUse()||!current();
    $('[data-ap-export]').disabled=busy||externalBusy||!canUse()||!current();}
  function visible(){const query=$('[data-ap-search]').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),filter=$('[data-ap-filter]').value;
    return (data?.rows||[]).filter(row=>(filter==='all'||filter==='ready'&&row.canPropose||filter==='issues'&&!row.canPropose||filter==='selected'&&decisions.get(row.key)?.selected)&&
      (row.name+' '+(row.legajo||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));}
  function selectionReview(){return reviewPreparteAll(data,decisions,tdDecisions,{documentReference:$('[data-ap-reference]').value,confirmed:$('[data-ap-reviewed]').checked,exceptions});}
  const tdStatus=(text,error=false)=>{const n=$('[data-ap-td-status]');n.textContent=text;n.dataset.error=String(error);};
  const tdDecision=row=>{if(!tdDecisions.has(row.key))tdDecisions.set(row.key,{selected:false,start:referenceStart(row.entries)});return tdDecisions.get(row.key);};
  const tdMonth=row=>{try{return monthlyTardiness({period:data.period,entries:row.entries,start:tdDecision(row).start,legajo:row.legajo,exceptions:exceptions||[]});}catch{return null;}};
  function tdVisible(){if(!data)return[];const filter=$('[data-ap-td-filter]').value;
    return data.rows.filter(row=>row.legajo&&row.entryReady&&row.entries.length&&(filter==='all'||filter==='selected'&&tdDecisions.get(row.key)?.selected||filter==='late'&&tdMonth(row)?.units));}
  function tdCounts(){const rows=tdVisible(),count=[...tdDecisions.values()].filter(d=>d.selected).length;$('[data-ap-td-count]').textContent=`${rows.length} personas · Página ${tdPage} de ${Math.max(1,Math.ceil(rows.length/25))} · ${count} seleccionadas`;}
  function renderTd(){const rows=tdVisible();tdPage=Math.min(tdPage,Math.max(1,Math.ceil(rows.length/25)));const body=$('[data-ap-td-rows]');body.replaceChildren();
    for(const source of rows.slice((tdPage-1)*25,tdPage*25)){
      const value=tdDecision(source),tr=node('tr');tr.dataset.apTdKey=source.key;
      const td=label=>{const cell=node('td');cell.dataset.label=label;tr.append(cell);return cell;};
      const include=node('input');include.type='checkbox';include.dataset.apTdField='td-selected';include.checked=value.selected;include.setAttribute('aria-label','Incluir tardanzas del legajo '+source.legajo);
      if(!Array.isArray(exceptions))include.dataset.blocked='true';td('Incluir').append(include);
      const person=td('Persona / legajo');person.append(node('strong',source.name),node('small','Legajo '+source.legajo));
      const start=node('input');start.type='text';start.inputMode='numeric';start.maxLength=5;start.placeholder='HH:MM';start.value=value.start;start.autocomplete='off';start.dataset.apTdField='td-start';
      start.setAttribute('aria-label','Entrada de referencia · legajo '+source.legajo);td('Entrada de referencia').append(start,node('small','Estimada por sus marcas; corregila si su horario es otro.'));
      const summary=td('Tardanzas del mes'),result=td('Descuento propuesto');
      const paint=()=>{const month=tdMonth(source);summary.replaceChildren();result.replaceChildren();
        if(!month){summary.append(node('span','Entrada de referencia inválida (HH:MM)','ap-issue'));return;}
        summary.append(node('strong',month.lateDays+(month.lateDays===1?' día':' días')+' · '+month.totalLateMinutes+' min'),node('small',source.entries.length+' llegadas registradas'+(month.excusedDays?' · '+month.excusedDays+' con excepción de Personal':'')));
        result.append(node('strong',fractionLabel(month.percent),month.units?'ap-issue':'ap-ready'),node('small',month.units?'Concepto 101: '+month.units.replace('.',',')+' de jornada':'Nada para trasladar'));};
      paint();
      start.addEventListener('input',()=>{value.start=start.value;value.edited=true;$('[data-ap-reviewed]').checked=false;paint();refreshCorrections();controls();});
      include.addEventListener('change',()=>{value.selected=include.checked;value.edited=true;$('[data-ap-reviewed]').checked=false;refreshCorrections();tdCounts();controls();});
      body.append(tr);
    }
    if(!rows.length){const tr=node('tr'),cell=node('td',Array.isArray(exceptions)?'No hay personas en este filtro.':'Sin las excepciones horarias de Personal no se proponen descuentos.');cell.colSpan=5;tr.append(cell);body.append(tr);}
    tdCounts();
  }
  async function readExceptions(month){
    const [y,m]=month.split('-').map(Number),last=String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0');
    const params=new URLSearchParams({resource:'time-exceptions',from:month+'-01',to:month+'-'+last});
    try{const response=await fetch('/api/internal-attendance?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
      const result=await response.json();
      if(!response.ok||result?.version!=='attendance-time-exceptions.v1'||!Array.isArray(result.items))return null;
      const date=/^\d{4}-\d{2}-\d{2}$/,time=/^([01]\d|2[0-3]):[0-5]\d$/;
      if(result.items.some(i=>!i||!/^[1-9]\d{0,19}$/.test(i.legajo)||!Array.isArray(i.weekdays)||!i.weekdays.every(d=>Number.isInteger(d)&&d>=1&&d<=7)||!date.test(i.validFrom)||i.validTo!==null&&!date.test(i.validTo)||
        !['entrada_diferida','salida_transitoria','salida_anticipada','exento'].includes(i.kind)||i.kind!=='exento'&&(!time.test(i.from)||!time.test(i.to)||i.from>=i.to)))return null;
      return Object.freeze(result.items.map(i=>Object.freeze({id:i.id,legajo:i.legajo,kind:i.kind,weekdays:[...i.weekdays],from:i.from,to:i.to,validFrom:i.validFrom,validTo:i.validTo,revokedAt:i.revokedAt??null})));
    }catch{return null;}
  }
  function clearCorrections(){reviewActive=false;$('[data-ap-correction-list]').replaceChildren();$('[data-ap-correction-count]').textContent='';$('[data-ap-corrections]').hidden=true;}
  function focusCorrection(issue){
    if(busy||externalBusy||!canUse()||!current())return;
    if(issue.key&&issue.field.startsWith('td-')){
      $('[data-ap-td-filter]').value='all';const index=tdVisible().findIndex(row=>row.key===issue.key);if(index<0)return;tdPage=Math.floor(index/25)+1;renderTd();controls();
      const row=host.querySelector(`[data-ap-td-key="${issue.key}"]`);row?.querySelector(`[data-ap-td-field="${issue.field}"]`)?.focus();row?.scrollIntoView({block:'nearest'});return;
    }
    if(issue.key){
      const index=data.rows.findIndex(row=>row.key===issue.key);if(index<0)return;
      $('[data-ap-search]').value='';$('[data-ap-filter]').value='all';page=Math.floor(index/25)+1;render();
      const row=host.querySelector(`[data-ap-key="${issue.key}"]`),input=row?.querySelector(`[data-ap-field="${issue.field}"]`);
      input?.focus();row?.scrollIntoView({block:'nearest'});
    }else{
      const target={reference:'reference',reviewed:'reviewed',source:'load',selected:'check'}[issue.field];
      $('[data-ap-'+target+']')?.focus();
    }
  }
  function showCorrections(review){
    reviewActive=true;const list=$('[data-ap-correction-list]');list.replaceChildren();
    const selected=review.selected===1?'1 fila seleccionada':`${review.selected} filas seleccionadas`;
    $('[data-ap-correction-count]').textContent=review.valid?`${selected} ${review.selected===1?'revisada':'revisadas'} sin correcciones pendientes. Todavía no se agregaron a novedades.`
      :`${review.issues.length===1?'1 corrección pendiente':review.issues.length+' correcciones pendientes'} en ${selected}. Se revisó toda la selección, incluidas otras páginas y filtros. No se agregó ninguna fila.`;
    for(const issue of review.issues){
      const item=node('li');item.append(node('span',issue.message));
      const button=node('button',issue.key?'Ir a la fila':'Ir al dato','button compact');button.type='button';
      button.dataset.apCorrectionField=issue.field;if(issue.key)button.dataset.apCorrectionKey=issue.key;
      button.setAttribute('aria-label',issue.message+' · Ir a corregir');
      button.addEventListener('click',()=>focusCorrection(issue));item.append(button);list.append(item);
    }
    $('[data-ap-corrections]').hidden=false;controls();
  }
  function refreshCorrections(){if(reviewActive&&current()&&canUse())showCorrections(selectionReview());}
  function render(){const rows=visible();page=Math.min(page,Math.max(1,Math.ceil(rows.length/25)));const body=$('[data-ap-rows]');body.replaceChildren();
    for(const source of rows.slice((page-1)*25,page*25)){
      const value=decision(source),tr=node('tr');tr.dataset.apKey=source.key;
      const td=(label)=>{const cell=node('td');cell.dataset.label=label;tr.append(cell);return cell;};
      const include=node('input');include.type='checkbox';include.dataset.apField='selected';include.checked=value.selected;include.setAttribute('aria-label','Incluir legajo '+(source.legajo||'sin vínculo'));if(!source.canPropose)include.dataset.blocked='true';td('Incluir').append(include);
      const person=td('Persona / legajo');person.append(node('strong',source.name),node('small',source.legajo?'Legajo '+source.legajo:'Sin vínculo laboral'));
      td('Extra observado').append(node('strong',preparteDuration(source.extraSeconds)),node('small',source.daysObserved+' días observados · '+source.daysToReview+' a revisar'));
      const fields={};
      for(const [key,label,hint,max]of [['hours','Horas reconocidas','HH:MM',6],['cap','Tope declarado %','Falta dato',3],['percent','Porcentaje propuesto','Sin valorar',3]]){
        const input=node('input');input.type='text';input.inputMode=key==='hours'?'text':'numeric';input.value=value[key];input.maxLength=max;input.placeholder=hint;input.autocomplete='off';input.dataset.apField=key;
        input.setAttribute('aria-label',label+' · legajo '+source.legajo);if(!source.canPropose)input.dataset.blocked='true';td(label).append(input);fields[key]=input;
        input.addEventListener('input',()=>{value[key]=input.value;value.edited=true;$('[data-ap-reviewed]').checked=false;if(key==='percent')value.percentAuto=false;if(key==='hours'&&value.percentAuto!==false){try{const p=dedicationPercent(reviewedSeconds(input.value));value.percent=p?String(p):'';fields.percent.value=value.percent;}catch{}}refreshCorrections();controls();});
      }
      const control=td('Control');control.append(node('span',source.canPropose?'Revisión documental pendiente':source.issues.join(' · '),source.canPropose?'ap-ready':'ap-issue'));
      if(source.canPropose){const p=dedicationPercent(source.extraSeconds);control.append(node('small',p?'Escala 6 h = 5 %: hasta '+p+' % por lo observado. El tope del decreto puede reducirla.':'Menos de 3 h reconocibles: la escala no alcanza el primer 5 %.'));}
      include.addEventListener('change',()=>{value.selected=include.checked;value.edited=true;$('[data-ap-reviewed]').checked=false;refreshCorrections();counts();controls();});body.append(tr);
    }
    if(!rows.length){const tr=node('tr'),td=node('td','No hay coincidencias. Los filtros no eliminan filas ni decisiones del preparte.');td.colSpan=7;tr.append(td);body.append(tr);}
    renderTd();counts();controls();
  }
  function counts(){const count=[...decisions.values()].filter(d=>d.selected).length,rows=visible();$('[data-ap-count]').textContent=`${rows.length} coincidencias · Página ${page} de ${Math.max(1,Math.ceil(rows.length/25))} · ${count} seleccionados en todo el preparte`;}
  function clear(){serial++;data=null;decisions=new Map();page=1;tdDecisions=new Map();tdPage=1;exceptions=null;clearCorrections();$('[data-ap-rows]').replaceChildren();$('[data-ap-td-rows]').replaceChildren();$('[data-ap-result]').hidden=true;$('[data-ap-reference]').value='';$('[data-ap-reviewed]').checked=false;$('[data-ap-search]').value='';$('[data-ap-filter]').value='all';status('Preparte descartado. Las novedades guardadas no se modificaron.');controls();}
  async function read(query,evidence){const params=new URLSearchParams({resource:'clock-preparte',...query,...(evidence?{evidence}:{})});
    const response=await fetch('/api/internal-attendance?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
    let result;try{result=await response.json();}catch{throw Error('La fuente no devolvió un preparte válido.');}
    if(!response.ok){const error=Object.assign(Error(result.error||'No se pudo consultar el preparte.'),{status:response.status});if([401,403].includes(response.status)){clear();status(error.message,true);onDenied?.(error);}throw error;}
    return verifyPreparte(result,query.period,query.site);
  }
  async function load(){if(busy||externalBusy||!canUse()||document.hidden)return;
    if(data&&!current()&&[...decisions.values()].some(v=>v.selected||v.cap)&&!window.confirm('¿Cambiar de mes o punto y descartar las decisiones anteriores? Las novedades de la planilla se conservan.'))return;
    const query=context(),token=++serial;busy=true;controls();status('Reconstruyendo el mes completo desde Neon…');
    try{const result=await read(query);if(token!==serial||query.period!==period()||query.site!==context().site)return;
      const loadedExceptions=await readExceptions(query.period);if(token!==serial||query.period!==period()||query.site!==context().site)return;
      if(!canUse()||document.hidden){clear();status('El acceso o la visibilidad cambió. Consultá nuevamente antes de continuar.',true);return;}
      const tdKept=new Map();for(const row of result.rows){const prior=tdDecisions.get(row.key);if(current()&&prior?.edited&&data.rows.find(r=>r.key===row.key)?.evidenceHash===row.evidenceHash)tdKept.set(row.key,{...prior});}
      const previous=current()?new Map(data.rows.map(row=>[row.key,row])):new Map(),kept=new Map();let retained=0,reset=0;
      for(const row of result.rows){const prior=decisions.get(row.key);if(previous.has(row.key)&&prior&&(prior.edited||prior.selected)){
        const same=previous.get(row.key).evidenceHash===row.evidenceHash;
        kept.set(row.key,{...prior,selected:same&&row.canPropose?prior.selected:false});if(same)retained++;else reset++;
      }}
      data=result;decisions=kept;page=1;tdDecisions=tdKept;tdPage=1;exceptions=loadedExceptions;clearCorrections();
      tdStatus(Array.isArray(exceptions)?`${exceptions.length} excepciones horarias de Personal leídas para el mes; se descuentan de las tardanzas. Regla por defecto: ${TARDINESS_DEFAULT.law}.`:'No se pudieron leer las excepciones horarias de Personal: las tardanzas se muestran, pero no se proponen descuentos hasta poder leerlas.',!Array.isArray(exceptions));$('[data-ap-reviewed]').checked=false;$('[data-ap-result]').hidden=false;
      const metrics=$('[data-ap-metrics]');metrics.replaceChildren();for(const [label,n]of [['Personas observadas',data.summary.people],['Con extra para revisar',data.summary.readyForReview],['Sin extra utilizable / incidencias',data.summary.withIncidents]]){const box=node('div');box.append(node('strong',String(n)),node('span',label));metrics.append(box);}
      $('[data-ap-source]').textContent='Período '+data.period+' · '+data.site.label+' · Corte '+data.snapshotId+' · Última recepción '+(data.lastReceiptAt||'sin recepción');
      status(data.rows.length?'Preparte generado. '+retained+' decisiones conservadas; '+reset+' desmarcadas por cambios de origen. No se presume ausencia por falta de marcas.':'No hay personas observadas en este corte. No se generan empleados ni jornadas de ejemplo.');render();
    }catch(error){if(token===serial)status(error.message,true);}finally{busy=false;controls();}
  }
  const reviewState=()=>JSON.stringify([[...decisions].map(([key,value])=>[key,value.selected,value.hours,value.cap,value.percent]),[...tdDecisions].map(([key,value])=>[key,value.selected,value.start]),$('[data-ap-reference]').value,$('[data-ap-reviewed]').checked]);
  async function withCurrent(action){if(busy||externalBusy||!canUse()||!current()||document.hidden)return;const original=data,token=serial,review=reviewState();busy=true;controls();status('Verificando que el corte no cambió…');
    try{const latest=await read({period:original.period,site:original.site.key},original.evidenceHash);if(token!==serial)return;
      if(!canUse()||document.hidden){clear();status('El acceso o la visibilidad cambió. Consultá nuevamente antes de continuar.',true);return;}
      if(externalBusy||review!==reviewState())throw Error('La selección o su revisión cambió durante la consulta. Revisá nuevamente antes de continuar.');
      if(!current()||latest.evidenceHash!==original.evidenceHash||JSON.stringify(latest.rows)!==JSON.stringify(original.rows))throw Error('El origen cambió. Consultá nuevamente y revisá las decisiones.');
      if([...tdDecisions.values()].some(v=>v.selected)){const latestExceptions=await readExceptions(original.period);if(token!==serial)return;
        if(JSON.stringify(latestExceptions)!==JSON.stringify(exceptions))throw Error('Las excepciones horarias de Personal cambiaron. Consultá nuevamente y revisá las tardanzas.');}
      await action(original);
    }catch(error){if(token===serial)status(error.message,true);}finally{busy=false;controls();}
  }
  $('[data-ap-check]').addEventListener('click',()=>{
    if(busy||externalBusy||!canUse()||!current())return;
    const review=selectionReview();showCorrections(review);
    status(review.valid?'Selección revisada. Podés agregar todas las filas seleccionadas como borrador.':'Corregí los datos indicados antes de agregar la selección.',!review.valid);
  });
  $('[data-ap-use]').addEventListener('click',()=>{
    if(busy||externalBusy||!canUse()||!current()||document.hidden)return;
    let rows;try{if(payrollType()!=='monthly')throw Error('Este preparte genera novedades mensuales. Elegí Mensual arriba.');const review=selectionReview();showCorrections(review);if(!review.valid){status('Corregí todas las incidencias indicadas; no se agregó ninguna fila.',true);return;}rows=review.rows;}
    catch(error){status(error.message,true);return;}
    if(!window.confirm(`¿Agregar ${rows.length} filas revisadas a la planilla del mes ${data.period}? Todavía no se guardará ni liquidará nada.`))return;
    return withCurrent(async original=>{if(payrollType()!=='monthly')throw Error('El tipo de liquidación cambió. Revisá el preparte.');
      await onUse({rows,period:original.period});for(const value of decisions.values())value.selected=false;for(const value of tdDecisions.values())value.selected=false;$('[data-ap-reviewed]').checked=false;clearCorrections();
      status(rows.length+' filas agregadas a la planilla. Usá Validar y previsualizar y luego Crear lote; se conserva la revisión independiente.');render();});
  });
  $('[data-ap-export]').addEventListener('click',()=>withCurrent(async original=>{
    const tardiness=original.rows.filter(row=>row.legajo&&row.entryReady&&row.entries.length).map(row=>{const month=tdMonth(row),value=tdDecision(row);return [row.legajo,row.name,value.start||'',row.entries.length,month?month.lateDays:'',month?month.totalLateMinutes:'',month?month.excusedDays:'',month?fractionLabel(month.percent):'Entrada inválida',month?.units||'',value.selected?'Sí':'No'];});
    const bytes=preparteXlsx(original,decisions,$('[data-ap-reference]').value,tardiness),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=node('a');a.href=url;a.download='preparte-'+original.site.key+'-'+original.period+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Excel generado con todo el preparte y sus decisiones declaradas. No es una liquidación ni una aprobación.');
  }));
  $('[data-ap-load]').addEventListener('click',load);$('[data-ap-clear]').addEventListener('click',()=>{if(!data||window.confirm('¿Descartar las decisiones de este preparte sin guardar?'))clear();});
  for(const type of ['search','filter'])$('[data-ap-'+type+']').addEventListener(type==='search'?'input':'change',()=>{page=1;render();});
  $('[data-ap-td-filter]').addEventListener('change',()=>{tdPage=1;renderTd();controls();});
  $('[data-ap-td-prev]').addEventListener('click',()=>{tdPage--;renderTd();controls();});$('[data-ap-td-next]').addEventListener('click',()=>{tdPage++;renderTd();controls();});
  $('[data-ap-prev]').addEventListener('click',()=>{page--;render();});$('[data-ap-next]').addEventListener('click',()=>{page++;render();});
  $('[data-ap-reference]').addEventListener('input',()=>{$('[data-ap-reviewed]').checked=false;refreshCorrections();});
  $('[data-ap-reviewed]').addEventListener('change',refreshCorrections);
  $('[data-ap-site]').addEventListener('change',()=>{serial++;clearCorrections();if(data)status('La fuente cambió: consultá nuevamente antes de continuar.',true);controls();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  controls();return {clear,setDisabled(value){externalBusy=Boolean(value);controls();},refreshAccess:controls,
    periodChanged(){serial++;clearCorrections();if(!data&&busy)status('Cambió el período. Consultá nuevamente el mes elegido.',true);if(data)status(current()?'Volviste al mes consultado. Las decisiones se conservan.':'El mes cambió. El preparte anterior se conserva, pero no puede trasladarse ni descargarse para otro período.',!current());controls();}};
}
