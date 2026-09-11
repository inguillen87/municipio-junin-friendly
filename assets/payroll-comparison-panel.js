import { payrollSourceReport } from './payroll-source-report-model.js';
import { comparePayrollSources, comparisonDocument, comparisonSourceKey } from './payroll-comparison-model.js';
import { saveReport } from './report-document.js';

const make = (tag,text) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; return n; };
const closure = s => ({closed:'Cierre informado',open:'Abierta',unknown:'Sin cierre informado'})[s];
export function mountPayrollComparison(parent) {
  if(!document.querySelector('[data-pc-styles]')){const link=make('link');link.rel='stylesheet';link.href=new URL('./payroll-comparison-056.css',import.meta.url).href;link.dataset.pcStyles='056';document.head.append(link);}
  const box=make('details');box.className='pc-box';box.dataset.payrollComparison='056';
  box.innerHTML=`<summary>Comparar dos liquidaciones <span>Importes, diferencias y conceptos por revisar</span></summary><section class="pc-content">
    <h3>¿Qué cambió entre estas dos corridas?</h3><p>Compará conceptos del mismo tipo de liquidación. Son totales de cada corrida, no aumentos individuales ni una nueva liquidación.</p>
    <button type="button" class="rc-button secondary" data-pc-catalog>Consultar fuentes para comparar</button>
    <p role="status" aria-live="polite" data-pc-status></p><a href="login.html?next=reportes-rrhh.html%23haberes" data-pc-login hidden>Ingresar al portal interno</a>
    <form class="rc-filter" data-pc-query hidden><label>Base A<select data-pc-a required></select></label><label>Comparar con B<select data-pc-b required></select></label><button type="submit" class="rc-button">Comparar</button></form>
    <div data-pc-result hidden><div class="rc-source" data-pc-source></div><p class="pc-warning" data-pc-warning></p>
    <div class="rc-kpis"><div><span>Conceptos entre ambas fuentes</span><strong data-pc-total></strong></div><div><span>Con diferencia de importe</span><strong data-pc-changed></strong></div><div><span>No comparables</span><strong data-pc-review></strong></div></div>
    <div class="rc-filter" data-pc-filters><label>Mostrar<select data-pc-state><option value="all">Todos</option><option value="changes">Con cambios</option><option value="review">No comparables</option><option value="same">Sin cambios</option></select></label><label>Grupo<select data-pc-group><option value="all">Todos los grupos</option><option value="earnings">Haberes</option><option value="discounts">Descuentos</option><option value="contributions">Aportes patronales</option><option value="totals">Totalizadores</option></select></label><label>Buscar concepto<input data-pc-search type="search" maxlength="100" placeholder="Código o descripción"></label><label>Ordenar<select data-pc-sort><option value="code">Código</option><option value="magnitude">Mayor diferencia absoluta</option></select></label><button type="button" class="rc-button secondary" data-pc-reset>Restablecer filtros</button></div>
    <p data-pc-scope></p><div class="rc-downloads"><button type="button" class="rc-button" data-pc-format="xlsx">Descargar comparación · Excel</button><button type="button" class="rc-button secondary" data-pc-format="pdf">Descargar comparación · PDF</button><button type="button" class="rc-button secondary" data-pc-format="csv">Descargar comparación · CSV</button></div>
    <div class="rc-table-wrap" tabindex="0" role="region" aria-label="Tabla de comparación, desplazable horizontalmente"><table class="rc-table"><caption>Diferencias por concepto · B menos A</caption><thead></thead><tbody></tbody></table></div>
    <p class="rc-explanation">Ausente no es cero. Un importe no informado o una definición distinta deja la diferencia sin evaluar. El porcentaje requiere una base A positiva. No se suman los totalizadores otra vez.</p></div></section>`;
  parent.append(box);
  const $=s=>box.querySelector(s),status=$('[data-pc-status]'),result=$('[data-pc-result]');
  let model=null,catalog=null,epoch=0,controller=null,busy=false;
  const active=()=>box.open&&box.isConnected&&!box.closest('[hidden]');
  const filters=()=>({state:$('[data-pc-state]').value,group:$('[data-pc-group]').value,search:$('[data-pc-search]').value,sort:$('[data-pc-sort]').value});
  const controls=()=>box.querySelectorAll('button').forEach(b=>b.disabled=busy);
  function clear(){model=null;result.hidden=true;$('thead').replaceChildren();$('tbody').replaceChildren();$('[data-pc-source]').textContent='';$('[data-pc-warning]').textContent='';for(const k of ['total','changed','review','scope'])$('[data-pc-'+k+']').textContent='';}
  function cancel(message,reset=false){epoch++;controller?.abort();controller=null;busy=false;clear();if(reset){catalog=null;$('[data-pc-query]').hidden=true;for(const s of ['a','b'])$('[data-pc-'+s+']').replaceChildren();}controls();status.textContent=message;}
  function start(message){controller?.abort();controller=new AbortController();busy=true;controls();status.textContent=message;return{seq:++epoch,abort:controller};}
  const current=job=>job.seq===epoch&&active();
  async function request(id,signal){
    const qs=new URLSearchParams({resource:'payrollsourcereport'});if(id)qs.set('datasetId',id);
    const response=await fetch('/api/internal-data?'+qs,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal});
    if([401,403].includes(response.status)){const e=Error('La sesión no tiene acceso. Ingresá nuevamente con permiso de nómina.');e.access=true;throw e;}
    if(!response.ok)throw Error('No se pudo consultar la fuente. Volvé a intentar.');
    const body=await response.json();if(body.ok!==true)throw Error('Respuesta de consulta inválida.');const d=payrollSourceReport(body.data);
    if(!id&&d.mode!=='catalog'||id&&(d.mode!=='report'||!d.found||d.datasetId!==id))throw Error('La liquidación ya no está disponible.');return d;
  }
  async function run(job,operation){
    const timer=setTimeout(()=>job.abort.abort(),30000);
    try{await operation(job);}catch(e){job.abort.abort();if(job.seq===epoch){clear();if(e.access){catalog=null;$('[data-pc-query]').hidden=true;$('[data-pc-login]').hidden=false;for(const s of ['a','b'])$('[data-pc-'+s+']').replaceChildren();}status.textContent=e.name==='AbortError'?'La consulta se interrumpió. Volvé a intentar.':e.message;}}
    finally{clearTimeout(timer);if(job.seq===epoch){busy=false;controller=null;controls();}}
  }
  function render(){
    if(!model)return;const doc=comparisonDocument(model,filters());
    const label=d=>`${d.date} · tipo ${d.type} · ${d.statementCount} legajos · ${closure(d.closureStatus)} · ${d.sourceLabel}`;
    $('[data-pc-source]').textContent=`A: ${label(model.a)}. B: ${label(model.b)}.`;
    $('[data-pc-warning]').textContent=model.warnings.join(' ');$('[data-pc-warning]').hidden=!model.warnings.length;
    $('[data-pc-total]').textContent=model.rows.length;$('[data-pc-changed]').textContent=model.changed;$('[data-pc-review]').textContent=model.review;
    $('[data-pc-scope]').textContent=doc.rows.length?`${doc.rows.length} de ${model.rows.length} conceptos. Las descargas incluyen exactamente estas filas y este orden.`:'Sin resultados para el filtro. La descarga también estará vacía.';
    const head=make('tr');doc.columns.forEach(c=>{const th=make('th',c.label);th.scope='col';head.append(th);});$('thead').replaceChildren(head);
    $('tbody').replaceChildren(...doc.rows.map(r=>{const tr=make('tr');tr.dataset.pcCode=r[0];r.forEach((v,i)=>{
      const absent=i===2&&r[7]==='Sólo en B'||i===3&&r[7]==='Sólo en A';
      const text=v===null?(absent?'Ausente':i===4?'No evaluable':'No informado'):doc.columns[i].type==='money'?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)):String(v);
      const td=make('td',text);if(i>=2&&i<=4)td.className='pc-money';tr.append(td);
    });return tr;}));result.hidden=false;
  }
  $('[data-pc-catalog]').addEventListener('click',()=>{
    if(busy||!active())return;clear();catalog=null;$('[data-pc-query]').hidden=true;const job=start('Consultando fuentes disponibles…');
    run(job,async job=>{const d=await request(null,job.abort.signal);if(!current(job))return;catalog=d;
      for(const s of ['a','b']){const select=$('[data-pc-'+s+']'),blank=make('option','Elegí una liquidación');blank.value='';select.replaceChildren(blank);d.items.forEach(item=>{const n=make('option',`${item.date} · ${item.type} · ${item.statementCount} legajos · ${closure(item.closureStatus)} · ${item.sourceLabel} [${item.datasetId.slice(0,8)}]`);n.value=item.datasetId;select.append(n);});}
      $('[data-pc-query]').hidden=d.items.length<2;$('[data-pc-login]').hidden=true;
      status.textContent=d.items.length<2?'Se necesitan al menos dos fuentes de liquidación accesibles.':`Elegí la base A y la fuente B del mismo tipo.${d.truncated?' Catálogo limitado a las 240 fuentes más recientes.':''}`;
    });
  });
  $('[data-pc-query]').addEventListener('submit',ev=>{
    ev.preventDefault();if(busy||!catalog||!active())return;const a=$('[data-pc-a]').value,b=$('[data-pc-b]').value;clear();
    const aa=catalog.items.find(i=>i.datasetId===a),bb=catalog.items.find(i=>i.datasetId===b);
    if(!aa||!bb||a===b){status.textContent='Elegí dos liquidaciones distintas.';return;}if(aa.type!==bb.type){status.textContent='Elegí liquidaciones del mismo tipo para comparar.';return;}
    const job=start('Consultando ambas liquidaciones…');run(job,async job=>{const [left,right]=await Promise.all([request(a,job.abort.signal),request(b,job.abort.signal)]);if(!current(job))return;model=comparePayrollSources(left,right);render();status.textContent='Comparación consultada. Filtrá los conceptos y descargá el resultado.';});
  });
  for(const s of ['a','b'])$('[data-pc-'+s+']').addEventListener('change',()=>cancel('Selección modificada. Volvé a comparar antes de descargar.'));
  function changedFilter(){if(busy){epoch++;controller?.abort();controller=null;busy=false;controls();}if(model){try{render();status.textContent='Filtro aplicado a la tabla y a las descargas.';}catch(e){clear();status.textContent=e.message;}}}
  $('[data-pc-filters]').addEventListener('input',changedFilter);
  $('[data-pc-reset]').addEventListener('click',()=>{$('[data-pc-state]').value='all';$('[data-pc-group]').value='all';$('[data-pc-search]').value='';$('[data-pc-sort]').value='code';changedFilter();});
  box.querySelectorAll('[data-pc-format]').forEach(button=>button.addEventListener('click',()=>{
    if(busy||!model||!active())return;const old=model,filter=filters(),job=start('Verificando acceso y ambas fuentes antes de descargar…');
    run(job,async job=>{const [a,b]=await Promise.all([request(old.a.datasetId,job.abort.signal),request(old.b.datasetId,job.abort.signal)]);if(!current(job))return;
      if(comparisonSourceKey(a)!==old.keyA||comparisonSourceKey(b)!==old.keyB)throw Error('Una fuente cambió. Volvé a comparar antes de descargar.');
      const name=saveReport(comparisonDocument(comparePayrollSources(a,b),filter),button.dataset.pcFormat);status.textContent='Archivo generado: '+name;
    });
  }));
  box.addEventListener('toggle',()=>{if(!box.open)cancel('Consultá las fuentes para comenzar una nueva comparación.',true);});
  document.addEventListener('taskchange',()=>{if(!active())cancel('La comparación se limpió al cambiar de área.',true);});
  window.addEventListener('pagehide',()=>cancel('',true));
  return box;
}
