// «Archivos para entidades»: TXT de descuentos por concepto con el diseño de GRH (76 posiciones), desde nuestra base.
// Reads the liquidation chosen in the reports centre; nothing is written. Rows we cannot complete are listed for review.
import { entityExportResponse, entityDiscountFile, entityFileBytes } from './entity-discount-export.js';
const make = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const money = v => { const n = Number(v); return Number.isFinite(n) ? '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v; };
const centsMoney = c => money((Number(BigInt(c)) / 100).toFixed(2));

export function mountEntityExport(host) {
  host.classList.add('rc-entity-export');
  host.innerHTML = `<header class="rc-panel-head"><p class="rc-eyebrow">Exportar · formato GRH</p><h3>Archivos para entidades</h3><p>TXT de descuentos por concepto (mutuales, sindicatos, seguros, IPV, Club…) con el mismo diseño de 76 posiciones que hoy genera GRH, armado desde la base de MuniControl.</p></header>
  <div class="rc-filter"><label>Concepto<select data-ee-concept disabled><option value="">Elegí una liquidación arriba</option></select></label>
  <button type="button" class="rc-button" data-ee-build disabled>Generar TXT</button></div>
  <p role="status" aria-live="polite" data-ee-status></p>
  <div data-ee-result hidden><div class="rc-kpis"><div><span>Renglones del archivo</span><strong data-ee-lines></strong></div><div><span>Total</span><strong data-ee-total></strong></div><div><span>Para revisar</span><strong data-ee-review-count></strong></div></div>
  <pre class="rc-ee-preview" data-ee-preview aria-label="Primeros renglones del archivo"></pre>
  <div class="rc-downloads"><a class="rc-button" data-ee-download download>Descargar TXT</a></div>
  <details data-ee-review hidden><summary>Legajos que no entran en el archivo</summary><ul data-ee-review-list></ul></details></div>`;
  const $ = s => host.querySelector('[data-ee-' + s + ']');
  let dataset = null, epoch = 0, busy = false, url = null;
  const say = text => { $('status').textContent = text; };
  const reset = () => { $('result').hidden = true; $('preview').textContent = ''; $('review-list').replaceChildren(); if (url) { URL.revokeObjectURL(url); url = null; } };
  const read = async params => {
    const r = await fetch('/api/internal-data?' + new URLSearchParams({ resource: 'payrollentityexport', datasetId: dataset, ...params }), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.ok !== true) throw new Error(j?.error || 'No se pudo consultar la liquidación.');
    return entityExportResponse(j.data);
  };
  async function load(id) {
    const mine = ++epoch; busy = true; reset(); $('concept').disabled = true; $('build').disabled = true;
    $('concept').replaceChildren(make('option', id ? 'Consultando conceptos…' : 'Elegí una liquidación arriba', undefined)); $('concept').firstChild.value = '';
    if (!id) { busy = false; say(''); return; }
    try {
      const data = await read({});
      if (mine !== epoch) return;
      if (!data.found) { say('La liquidación ya no está disponible.'); return; }
      const sorted = [...data.concepts].sort((a, b) => (Number(a.code) >= 600 && Number(a.code) < 700 ? 0 : 1) - (Number(b.code) >= 600 && Number(b.code) < 700 ? 0 : 1) || Number(a.code) - Number(b.code));
      $('concept').replaceChildren(make('option', 'Elegí el concepto', undefined), ...sorted.map(c => { const o = make('option', `${c.code} · ${c.description ?? 'sin descripción'} · ${c.people} personas · ${money(c.total)}`); o.value = c.code; return o; }));
      $('concept').firstChild.value = '';
      $('concept').disabled = false; say(`${data.concepts.length} conceptos en la liquidación. Los descuentos (600–699) aparecen primero.`);
    } catch (error) { if (mine === epoch) say(error.message); }
    finally { if (mine === epoch) { busy = false; $('build').disabled = !$('concept').value; } }
  }
  $('concept').addEventListener('change', () => { reset(); $('build').disabled = busy || !$('concept').value; });
  $('build').addEventListener('click', async () => {
    const concept = $('concept').value; if (!dataset || !concept || busy) return;
    const mine = ++epoch; busy = true; $('build').disabled = true; reset(); say('Leyendo todos los renglones del concepto…');
    try {
      const data = await read({ concept });
      if (mine !== epoch) return;
      const file = entityDiscountFile(data);
      $('lines').textContent = String(file.lines.length); $('total').textContent = centsMoney(file.totalCents); $('review-count').textContent = String(file.review.length);
      $('preview').textContent = file.lines.slice(0, 5).join('\n') + (file.lines.length > 5 ? `\n… y ${file.lines.length - 5} renglones más` : '');
      url = URL.createObjectURL(new Blob([entityFileBytes(file)], { type: 'text/plain;charset=windows-1252' }));
      $('download').href = url; $('download').download = file.name; $('download').textContent = 'Descargar ' + file.name;
      $('review').hidden = !file.review.length;
      $('review-list').replaceChildren(...file.review.map(r => make('li', `Legajo ${r.legajo} · ${money(r.amount)} · ${r.reasons.join(', ')}`)));
      $('result').hidden = false;
      say(`Archivo listo: ${file.lines.length} renglones de ${file.rows} del concepto ${concept}.${file.review.length ? ' ' + file.review.length + ' quedan para revisar (no se adivinan datos).' : ''}`);
    } catch (error) { if (mine === epoch) say(error.message); }
    finally { if (mine === epoch) { busy = false; $('build').disabled = !$('concept').value; } }
  });
  return { setDataset(id) { if (id !== dataset) { dataset = id; load(id); } } };
}
