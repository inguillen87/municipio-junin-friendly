import { verifyPreparte, preparteDuration, reviewedSeconds, referencePercentage, preparteNoveltyRows } from './attendance-preparte-model.js';
import { preparteXlsx } from './attendance-preparte-export.js';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function mountAttendancePreparte(host,{ canUse, period, payrollType, onUse, onDenied }={}) {
  host.classList.add('ap-panel');host.dataset.reviewOnly='true';
  host.innerHTML=`<summary>Generar preparte de mayor dedicación desde relojes</summary><div class="ap-body">
  <div class="ap-heading"><div><p class="ap-eyebrow">PERSONAL → PREPARTE → NOVEDADES</p><h3>Horas registradas, revisión por legajo</h3><p>Consultá el mes elegido arriba. Revisá horas, tope individual y porcentaje antes de agregarlos a novedades.</p></div><span class="ap-badge">Sin importe ni pago automático</span></div>
  <div class="ap-toolbar"><label>Fuente<select data-ap-site><option value="pm-10">Edificio Viejo · PM-10</option></select></label><button type="button" class="button primary" data-ap-load>Consultar mes desde relojes</button><button type="button" class="button" data-ap-clear>Descartar preparte</button></div>
  <p data-ap-status role="status" aria-live="polite">El preparte consulta registros conservados. No modifica relojes ni liquida haberes.</p>
  <div data-ap-result hidden><div class="ap-metrics" data-ap-metrics></div>
  <div class="ap-toolbar"><label>Buscar en el preparte<input data-ap-search type="search" placeholder="Persona o legajo" maxlength="120" autocomplete="off"></label><label>Mostrar<select data-ap-filter><option value="all">Todo el corte</option><option value="ready">Con tiempo extra para revisar</option><option value="issues">Con incidencias</option><option value="selected">Seleccionados</option></select></label></div>
  <div class="ap-table"><table><thead><tr><th>Incluir</th><th>Persona / legajo</th><th>Extra observado</th><th>Horas reconocidas</th><th>Tope declarado %</th><th>Porcentaje propuesto</th><th>Control</th></tr></thead><tbody data-ap-rows></tbody></table></div>
  <nav class="ap-toolbar" aria-label="Páginas del preparte"><button type="button" class="button" data-ap-prev>Anterior</button><span data-ap-count></span><button type="button" class="button" data-ap-next>Siguiente</button></nav>
  <label class="ap-document">Documento de Personal que respalda horas, topes y porcentajes<input data-ap-reference maxlength="160" autocomplete="off" placeholder="Resolución o listado autorizado por Hugo, fecha y versión"></label>
  <label class="ap-confirm"><input data-ap-reviewed type="checkbox"><span>Revisé las filas seleccionadas contra la documentación de Personal. Se enviarán como borrador para revisión independiente.</span></label>
  <div class="ap-toolbar"><button type="button" class="button primary" data-ap-use>Agregar seleccionados a novedades</button><button type="button" class="button" data-ap-export>Descargar preparte · Excel</button></div>
  <p class="ap-scope">Alcance: un punto y un mes, no toda la asistencia municipal. Sin turnos y permisos vigentes no se calculan tardanzas ni ausencias. La referencia usa puntos exactos de la tabla mensual aportada, sin interpolar tramos. El tope ingresado queda declarado para revisión; no sustituye una autorización registrada. Las fórmulas de los conceptos 44 y 95 siguen separadas.</p>
  <p class="ap-source" data-ap-source></p></div></div>`;
  const $=s=>host.querySelector(s);let data=null,decisions=new Map(),page=1,busy=false,externalBusy=false,serial=0,lastAccess=null;
  const status=(text,error=false)=>{const n=$('[data-ap-status]');n.textContent=text;n.dataset.error=String(error);};
  const context=()=>({period:period(),site:$('[data-ap-site]').value});
  const decision=row=>{if(!decisions.has(row.key))decisions.set(row.key,{selected:false,hours:row.canPropose&&row.extraSeconds%60===0?preparteDuration(row.extraSeconds).slice(0,-3):'',cap:'',percent:row.canPropose?String(referencePercentage(row.extraSeconds)??''):''});return decisions.get(row.key);};
  const current=()=>data&&data.period===period()&&data.site.key===$('[data-ap-site]').value;
  function controls(){const available=canUse();if(!data&&!busy&&!externalBusy&&available!==lastAccess){status(available?'Listo para consultar el mes elegido desde relojes.':'Se necesitan permisos de asistencia, consulta de legajos y preparación de novedades. Esta sesión aún no los habilita.');lastAccess=available;}host.querySelectorAll('button,input,select').forEach(n=>n.disabled=busy||externalBusy||!canUse());
    host.querySelectorAll('[data-blocked]').forEach(n=>n.disabled=true);$('[data-ap-clear]').disabled=busy||externalBusy;
    $('[data-ap-prev]').disabled=busy||externalBusy||page<=1;$('[data-ap-next]').disabled=busy||externalBusy||page*25>=visible().length;
    $('[data-ap-use]').disabled=busy||externalBusy||!canUse()||!current()||![...decisions.values()].some(v=>v.selected);
    $('[data-ap-export]').disabled=busy||externalBusy||!canUse()||!current();}
  function visible(){const query=$('[data-ap-search]').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),filter=$('[data-ap-filter]').value;
    return (data?.rows||[]).filter(row=>(filter==='all'||filter==='ready'&&row.canPropose||filter==='issues'&&!row.canPropose||filter==='selected'&&decisions.get(row.key)?.selected)&&
      (row.name+' '+(row.legajo||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));}
  function render(){const rows=visible();page=Math.min(page,Math.max(1,Math.ceil(rows.length/25)));const body=$('[data-ap-rows]');body.replaceChildren();
    for(const source of rows.slice((page-1)*25,page*25)){
      const value=decision(source),tr=node('tr');tr.dataset.apKey=source.key;
      const td=(label)=>{const cell=node('td');cell.dataset.label=label;tr.append(cell);return cell;};
      const include=node('input');include.type='checkbox';include.checked=value.selected;include.setAttribute('aria-label','Incluir legajo '+(source.legajo||'sin vínculo'));if(!source.canPropose)include.dataset.blocked='true';td('Incluir').append(include);
      const person=td('Persona / legajo');person.append(node('strong',source.name),node('small',source.legajo?'Legajo '+source.legajo:'Sin vínculo laboral'));
      td('Extra observado').append(node('strong',preparteDuration(source.extraSeconds)),node('small',source.daysObserved+' días observados · '+source.daysToReview+' a revisar'));
      const fields={};
      for(const [key,label,hint,max]of [['hours','Horas reconocidas','HH:MM',6],['cap','Tope declarado %','Falta dato',3],['percent','Porcentaje propuesto','Sin valorar',3]]){
        const input=node('input');input.type='text';input.inputMode=key==='hours'?'text':'numeric';input.value=value[key];input.maxLength=max;input.placeholder=hint;input.autocomplete='off';input.dataset.apField=key;
        input.setAttribute('aria-label',label+' · legajo '+source.legajo);if(!source.canPropose)input.dataset.blocked='true';td(label).append(input);fields[key]=input;
        input.addEventListener('input',()=>{value[key]=input.value;value.edited=true;$('[data-ap-reviewed]').checked=false;if(key==='hours'&&!value.percent){try{const p=referencePercentage(reviewedSeconds(input.value));if(p!==null){value.percent=String(p);fields.percent.value=value.percent;}}catch{}}controls();});
      }
      const control=td('Control');control.append(node('span',source.canPropose?'Revisión documental pendiente':source.issues.join(' · '),source.canPropose?'ap-ready':'ap-issue'));
      if(source.canPropose){const p=referencePercentage(source.extraSeconds);control.append(node('small',p===null?'Sin equivalencia exacta en la tabla: documentar valoración.':'Referencia exacta mensual: '+p+' %. El tope puede reducirla.'));}
      include.addEventListener('change',()=>{value.selected=include.checked;value.edited=true;$('[data-ap-reviewed]').checked=false;counts();controls();});body.append(tr);
    }
    if(!rows.length){const tr=node('tr'),td=node('td','No hay coincidencias. Los filtros no eliminan filas ni decisiones del preparte.');td.colSpan=7;tr.append(td);body.append(tr);}
    counts();controls();
  }
  function counts(){const count=[...decisions.values()].filter(d=>d.selected).length,rows=visible();$('[data-ap-count]').textContent=`${rows.length} coincidencias · Página ${page} de ${Math.max(1,Math.ceil(rows.length/25))} · ${count} seleccionados en todo el preparte`;}
  function clear(){serial++;data=null;decisions=new Map();page=1;$('[data-ap-rows]').replaceChildren();$('[data-ap-result]').hidden=true;$('[data-ap-reference]').value='';$('[data-ap-reviewed]').checked=false;$('[data-ap-search]').value='';$('[data-ap-filter]').value='all';status('Preparte descartado. Las novedades guardadas no se modificaron.');controls();}
  async function read(query,evidence){const params=new URLSearchParams({resource:'clock-preparte',...query,...(evidence?{evidence}:{})});
    const response=await fetch('/api/internal-attendance?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
    let result;try{result=await response.json();}catch{throw Error('La fuente no devolvió un preparte válido.');}
    if(!response.ok){const error=Object.assign(Error(result.error||'No se pudo consultar el preparte.'),{status:response.status});if([401,403].includes(response.status)){clear();status(error.message,true);onDenied?.(error);}throw error;}
    return verifyPreparte(result,query.period,query.site);
  }
  async function load(){if(busy||externalBusy||!canUse())return;
    if(data&&!current()&&[...decisions.values()].some(v=>v.selected||v.cap)&&!window.confirm('¿Cambiar de mes o punto y descartar las decisiones anteriores? Las novedades de la planilla se conservan.'))return;
    const query=context(),token=++serial;busy=true;controls();status('Reconstruyendo el mes completo desde Neon…');
    try{const result=await read(query);if(token!==serial||query.period!==period()||query.site!==context().site)return;
      const previous=current()?new Map(data.rows.map(row=>[row.key,row])):new Map(),kept=new Map();let retained=0,reset=0;
      for(const row of result.rows){const prior=decisions.get(row.key);if(previous.has(row.key)&&prior&&(prior.edited||prior.selected)){
        const same=previous.get(row.key).evidenceHash===row.evidenceHash;
        kept.set(row.key,{...prior,selected:same&&row.canPropose?prior.selected:false});if(same)retained++;else reset++;
      }}
      data=result;decisions=kept;page=1;$('[data-ap-reviewed]').checked=false;$('[data-ap-result]').hidden=false;
      const metrics=$('[data-ap-metrics]');metrics.replaceChildren();for(const [label,n]of [['Personas observadas',data.summary.people],['Con extra para revisar',data.summary.readyForReview],['Sin extra utilizable / incidencias',data.summary.withIncidents]]){const box=node('div');box.append(node('strong',String(n)),node('span',label));metrics.append(box);}
      $('[data-ap-source]').textContent='Período '+data.period+' · '+data.site.label+' · Corte '+data.snapshotId+' · Última recepción '+(data.lastReceiptAt||'sin recepción');
      status(data.rows.length?'Preparte generado. '+retained+' decisiones conservadas; '+reset+' desmarcadas por cambios de origen. No se presume ausencia por falta de marcas.':'No hay personas observadas en este corte. No se generan empleados ni jornadas de ejemplo.');render();
    }catch(error){if(token===serial)status(error.message,true);}finally{busy=false;controls();}
  }
  async function withCurrent(action){if(busy||externalBusy||!canUse()||!current())return;const original=data,token=serial;busy=true;controls();status('Verificando que el corte no cambió…');
    try{const latest=await read({period:original.period,site:original.site.key},original.evidenceHash);if(token!==serial)return;
      if(!current()||latest.evidenceHash!==original.evidenceHash||JSON.stringify(latest.rows)!==JSON.stringify(original.rows))throw Error('El origen cambió. Consultá nuevamente y revisá las decisiones.');
      await action(original);
    }catch(error){if(token===serial)status(error.message,true);}finally{busy=false;controls();}
  }
  $('[data-ap-use]').addEventListener('click',()=>{
    let rows;try{if(payrollType()!=='monthly')throw Error('Este preparte genera novedades mensuales. Elegí Mensual arriba.');rows=preparteNoveltyRows(data,decisions,{documentReference:$('[data-ap-reference]').value,confirmed:$('[data-ap-reviewed]').checked});}
    catch(error){status(error.message,true);return;}
    if(!window.confirm(`¿Agregar ${rows.length} filas revisadas a la planilla del mes ${data.period}? Todavía no se guardará ni liquidará nada.`))return;
    withCurrent(async original=>{if(payrollType()!=='monthly')throw Error('El tipo de liquidación cambió. Revisá el preparte.');
      await onUse({rows,period:original.period});for(const value of decisions.values())value.selected=false;$('[data-ap-reviewed]').checked=false;
      status(rows.length+' filas agregadas a la planilla. Usá Validar y previsualizar y luego Crear lote; se conserva la revisión independiente.');render();});
  });
  $('[data-ap-export]').addEventListener('click',()=>withCurrent(async original=>{
    const bytes=preparteXlsx(original,decisions,$('[data-ap-reference]').value),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=node('a');a.href=url;a.download='preparte-'+original.site.key+'-'+original.period+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Excel generado con todo el preparte y sus decisiones declaradas. No es una liquidación ni una aprobación.');
  }));
  $('[data-ap-load]').addEventListener('click',load);$('[data-ap-clear]').addEventListener('click',()=>{if(!data||window.confirm('¿Descartar las decisiones de este preparte sin guardar?'))clear();});
  for(const type of ['search','filter'])$('[data-ap-'+type+']').addEventListener(type==='search'?'input':'change',()=>{page=1;render();});
  $('[data-ap-prev]').addEventListener('click',()=>{page--;render();});$('[data-ap-next]').addEventListener('click',()=>{page++;render();});
  $('[data-ap-reference]').addEventListener('input',()=>{$('[data-ap-reviewed]').checked=false;});
  $('[data-ap-site]').addEventListener('change',()=>{serial++;if(data)status('La fuente cambió: consultá nuevamente antes de continuar.',true);controls();});
  controls();return {clear,setDisabled(value){externalBusy=Boolean(value);controls();},refreshAccess:controls,
    periodChanged(){serial++;if(!data&&busy)status('Cambió el período. Consultá nuevamente el mes elegido.',true);if(data)status(current()?'Volviste al mes consultado. Las decisiones se conservan.':'El mes cambió. El preparte anterior se conserva, pero no puede trasladarse ni descargarse para otro período.',!current());controls();}};
}
