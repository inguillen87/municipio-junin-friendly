import { payrollRoster, payrollRosterDocument } from './payroll-roster-model.js';
import { saveReport } from './report-document.js';

const make = (tag, content) => { const n = document.createElement(tag); if (content !== undefined) n.textContent = content; return n; };
export function mountPayrollRoster(host) {
  host.classList.add('rc-roster');
  host.innerHTML = `<header class="rc-panel-head"><p class="rc-eyebrow">Datos del legajo · sin editar planillas</p><h3>Agentes y datos para exportar</h3><p>DNI, CUIL y sexo F/M desde MuniControl. Revisá una sola vez los datos faltantes; no se adivinan.</p></header>
    <button type="button" class="rc-button secondary" data-roster-load>Consultar agentes de esta liquidación</button>
    <p role="status" aria-live="polite" data-roster-status></p>
    <div data-roster-result hidden><div class="rc-kpis"><div><span>Agentes en esta liquidación</span><strong data-roster-total></strong></div><div><span>Sexo F/M informado</span><strong data-roster-sex></strong></div><div><span>Identificaciones por revisar</span><strong data-roster-review></strong></div></div>
    <div class="rc-filter"><label>Planilla<select data-roster-mode><option value="identities">Identificación · F/M automático</option><option value="art-base">Base de trabajo ART · 993 + 995</option></select></label><label>Buscar agente<input type="search" maxlength="100" data-roster-search placeholder="Legajo, nombre, DNI o CUIL"></label><label>Identificación<select data-roster-quality><option value="all">Todos</option><option value="review">Sólo casos por revisar</option></select></label></div>
    <p class="rc-source" data-roster-scope></p><div class="rc-downloads"><button type="button" class="rc-button" data-roster-format="xlsx">Descargar Excel</button><button type="button" class="rc-button secondary" data-roster-format="csv">Descargar CSV</button><button type="button" class="rc-button secondary" data-roster-format="pdf">Descargar PDF</button></div>
    <div class="rc-table-wrap"><table class="rc-table"><thead></thead><tbody></tbody></table></div><p class="rc-explanation">Los datos personales sólo se consultan con permisos de nómina y legajos. La base ART deja los días pendientes hasta validar su fuente; no es un archivo listo para presentar.</p></div>`;
  const $ = s => host.querySelector(s), status = $('[data-roster-status]'), result = $('[data-roster-result]');
  let dataset = null, model = null, epoch = 0, busy = false, abort = null;
  const filters = () => ({ mode: $('[data-roster-mode]').value, search: $('[data-roster-search]').value, reviewOnly: $('[data-roster-quality]').value === 'review' });
  function clear() { model = null; result.hidden = true; $('thead').replaceChildren(); $('tbody').replaceChildren(); }
  function controls() { host.querySelectorAll('button').forEach(b => b.disabled = busy || !dataset); }
  async function request(id) {
    abort = new AbortController(); const timer = setTimeout(() => abort?.abort(), 30000);
    try {
      const query = new URLSearchParams({ resource: 'payrollexportroster', datasetId: id });
      const response = await fetch('/api/internal-data?' + query, {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:abort.signal});
      if ([401,403].includes(response.status)) throw new Error('Se requiere una sesión con permisos de nómina y legajos.');
      if (!response.ok) throw new Error('No se pudo consultar el padrón. Volvé a intentar.');
      const body = await response.json(); if (body.ok !== true) throw new Error('No se pudo consultar el padrón.');
      const checked = payrollRoster(body.data); if (!checked.found || checked.datasetId !== id) throw new Error('La liquidación ya no está disponible.');
      return checked;
    } finally { clearTimeout(timer); }
  }
  function render() {
    if (!model) return;
    const doc = payrollRosterDocument(model, filters());
    $('[data-roster-total]').textContent = model.total;
    $('[data-roster-sex]').textContent = `${model.sexReady} / ${model.total}`;
    $('[data-roster-review]').textContent = model.identitiesToReview;
    $('[data-roster-scope]').textContent = `${doc.rows.length} agentes del filtro · ${model.sourceLabel}. ` + (filters().mode === 'art-base' ? 'Sueldo: 993 + 995. Días pendientes de fuente validada; no presentar esta base como planilla completa.' : 'F/M se completa desde el legajo. Los casos sin equivalencia quedan señalados, no convertidos.');
    const header = make('tr'); doc.columns.forEach(c => { const th = make('th',c.label); th.scope='col'; header.append(th); }); $('thead').replaceChildren(header);
    $('tbody').replaceChildren(...doc.rows.map(row => { const tr=make('tr'); row.forEach((v,i) => tr.append(make('td',v === null ? 'Pendiente' : doc.columns[i].type === 'money' ? new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)) : String(v)))); return tr; }));
    result.hidden = false;
  }
  $('[data-roster-load]').addEventListener('click', async () => {
    if (busy || !dataset) return; const id = dataset, seq = ++epoch; busy = true; controls(); clear(); status.textContent='Consultando legajos y conceptos…';
    try { const next = await request(id); if (seq !== epoch) return; model=next; render(); status.textContent='Padrón consultado. Los filtros se aplican también a cada descarga.'; }
    catch (e) { if (seq === epoch) { clear(); status.textContent=e.name === 'AbortError' ? 'La consulta se interrumpió. Volvé a intentar.' : e.message; } }
    finally { busy=false; controls(); }
  });
  for (const selector of ['[data-roster-mode]','[data-roster-quality]','[data-roster-search]']) $(selector).addEventListener('input',render);
  host.querySelectorAll('[data-roster-format]').forEach(button => button.addEventListener('click',async () => {
    if (busy || !model || !dataset) return; const old=model, seq=epoch, selected=filters(); busy=true; controls(); status.textContent='Verificando acceso y datos antes de descargar…';
    try {
      const fresh=await request(dataset);
      if (seq !== epoch || fresh.datasetId !== old.datasetId || fresh.reportHash !== old.reportHash || fresh.payloadHash !== old.payloadHash) throw new Error('Los datos cambiaron. Consultá nuevamente antes de descargar.');
      const filename=saveReport(payrollRosterDocument(fresh, selected),button.dataset.rosterFormat);
      status.textContent='Archivo generado: '+filename;
    } catch(e) { if(seq===epoch){clear();status.textContent=e.name==='AbortError'?'La verificación se interrumpió. Consultá nuevamente.':e.message;} }
    finally {busy=false;controls();}
  }));
  controls();
  return { setDataset(id) { if (id !== dataset) { epoch++; abort?.abort(); dataset=id; clear(); status.textContent=''; controls(); } } };
}
