// «Archivos para entidades»: TXT de descuentos por concepto con el diseño de GRH (76 posiciones), desde nuestra base.
// The selected concept summary and every returned row must reconcile before we offer a reference TXT.
import { entityExportResponse, entityDiscountFile, entityFileBytes } from './entity-discount-export.js';
const make = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const centsMoney = c => { const n = BigInt(c), abs = n < 0n ? -n : n; return '$ ' + (n < 0n ? '-' : '') + (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + (abs % 100n).toString().padStart(2, '0'); };
// API validation has already required an exact two-decimal string.
const cents = amount => BigInt(amount.replace('.', ''));
const money = amount => centsMoney(cents(amount));
const counts = (lines, people) => `${lines} ${lines === 1 ? 'renglón' : 'renglones'}, ${people} ${people === 1 ? 'legajo' : 'legajos'}`;

export function mountEntityExport(host) {
  host.classList.add('rc-entity-export');
  host.innerHTML = `<header class="rc-panel-head"><p class="rc-eyebrow">Exportar · formato GRH</p><h3>Archivos para entidades</h3><p>TXT de descuentos por concepto (mutuales, sindicatos, seguros, IPV, Club…) con el mismo diseño de 76 posiciones que hoy genera GRH, armado desde la base de MuniControl.</p></header>
  <p class="rc-source" data-ee-source hidden></p>
  <div class="rc-filter"><label>Concepto<select data-ee-concept disabled><option value="">Elegí una liquidación arriba</option></select></label>
  <button type="button" class="rc-button" data-ee-build disabled>Verificar y generar TXT</button>
  <button type="button" class="rc-button secondary" data-ee-refresh disabled>Actualizar conceptos</button></div>
  <p role="status" aria-live="polite" data-ee-status></p>
  <div data-ee-result hidden><p data-ee-control></p>
  <div class="rc-kpis"><div><span>Renglones en formato válido</span><strong data-ee-lines></strong></div><div><span>Importe de esos renglones</span><strong data-ee-total></strong></div><div><span>Renglones para revisar</span><strong data-ee-review-count></strong></div></div>
  <details data-ee-review hidden><summary>Ver motivos por legajo</summary><ul data-ee-review-list></ul></details>
  <pre class="rc-ee-preview" data-ee-preview hidden aria-label="Primeros renglones del archivo completo"></pre>
  <div class="rc-downloads"><a class="rc-button" data-ee-download download hidden>Descargar TXT de referencia</a></div></div>`;
  const $ = s => host.querySelector('[data-ee-' + s + ']');
  let dataset = null, listing = null, epoch = 0, busy = false, url = null;
  const say = text => { $('status').textContent = text; };
  const reset = () => { $('result').hidden = true; $('preview').hidden = true; $('preview').textContent = ''; $('review-list').replaceChildren(); $('review').open = false; $('download').hidden = true; $('download').removeAttribute('href'); if (url) { URL.revokeObjectURL(url); url = null; } };
  const read = async (id, params) => {
    const r = await fetch('/api/internal-data?' + new URLSearchParams({ resource: 'payrollentityexport', datasetId: id, ...params }), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.ok !== true) throw new Error(j?.error || 'No se pudo consultar la liquidación.');
    const data = entityExportResponse(j.data);
    if (data.found && (data.datasetId !== id.toLowerCase() || data.concept !== (params.concept ?? null))) throw new Error('La respuesta no coincide con la liquidación y el concepto elegidos. Volvé a generar el archivo.');
    return data;
  };
  async function load(id) {
    const mine = ++epoch; busy = true; listing = null; reset(); $('concept').disabled = true; $('build').disabled = true; $('refresh').disabled = true;
    $('concept').replaceChildren(make('option', id ? 'Consultando conceptos…' : 'Elegí una liquidación arriba', undefined)); $('concept').firstChild.value = '';
    if (!id) { busy = false; say(''); return; }
    try {
      const data = await read(id, {});
      if (mine !== epoch) return;
      if (!data.found) { say('La liquidación ya no está disponible.'); return; }
      if (new Set(data.concepts.map(c => c.code)).size !== data.concepts.length) throw Error('El resumen repite códigos de concepto. Revisá la liquidación y actualizá los conceptos.');
      listing = data;
      const sorted = [...listing.concepts].sort((a, b) => (Number(a.code) >= 600 && Number(a.code) < 700 ? 0 : 1) - (Number(b.code) >= 600 && Number(b.code) < 700 ? 0 : 1) || Number(a.code) - Number(b.code));
      $('concept').replaceChildren(make('option', 'Elegí el concepto', undefined), ...sorted.map(c => { const o = make('option', `${c.code} · ${c.description ?? 'sin descripción'} · ${c.people} personas · ${money(c.total)}`); o.value = c.code; return o; }));
      $('concept').firstChild.value = '';
      $('concept').disabled = false; say(`${data.concepts.length} conceptos en la liquidación. Los descuentos (600–699) aparecen primero.`);
    } catch (error) { if (mine === epoch) say(error.message); }
    finally { if (mine === epoch) { busy = false; $('build').disabled = !$('concept').value; $('refresh').disabled = false; } }
  }
  $('refresh').addEventListener('click', () => { if (dataset) return load(dataset); });
  $('concept').addEventListener('change', () => { ++epoch; busy = false; reset(); say(''); $('build').disabled = !$('concept').value; });
  $('build').addEventListener('click', async () => {
    const concept = $('concept').value; if (!dataset || !concept || busy) return;
    const mine = ++epoch; busy = true; $('build').disabled = true; reset(); say('Leyendo todos los renglones del concepto…');
    try {
      const summary = listing?.concepts.find(c => c.code === concept);
      if (!summary) throw Error('El concepto no está en el resumen. Actualizá los conceptos y volvé a elegirlo.');
      const data = await read(dataset, { concept });
      if (mine !== epoch) return;
      if (!data.found || ['datasetId', 'date', 'period', 'month', 'type'].some(key => data[key] !== listing[key])) {
        throw Error('El detalle no coincide con la liquidación consultada. Actualizá los conceptos y volvé a elegir el concepto.');
      }
      const file = entityDiscountFile(data);
      const people = new Set(data.rows.map(r => r.legajo)).size;
      const total = data.rows.reduce((sum, r) => sum + cents(r.amount), 0n);
      const differences = [];
      if (data.rows.length !== summary.lines) differences.push('renglones');
      if (people !== summary.people) differences.push('legajos distintos');
      if (total !== cents(summary.total)) differences.push('importe total');
      $('control').textContent = `Resumen: ${counts(summary.lines, summary.people)}, ${money(summary.total)}. Detalle recibido: ${counts(data.rows.length, people)}, ${centsMoney(total)}.`;
      $('lines').textContent = String(file.lines.length); $('total').textContent = centsMoney(file.totalCents); $('review-count').textContent = String(file.review.length);
      $('review').hidden = !file.review.length;
      $('review-list').replaceChildren(...file.review.map(r => make('li', `Legajo ${r.legajo} · ${money(r.amount)} · ${r.reasons.join(', ')}`)));
      $('result').hidden = false;
      const reasons = [];
      if (differences.length) reasons.push('El detalle difiere del resumen en: ' + differences.join(', ') + '.');
      if (!data.rows.length) reasons.push('El detalle no tiene renglones.');
      if (file.review.length) reasons.push('Hay renglones que no se pueden exportar. Consultá los motivos por legajo y corregí los datos en la fuente.');
      else if (file.lines.length !== data.rows.length || BigInt(file.totalCents) !== total) reasons.push('El archivo no conserva todos los renglones o su importe.');
      if (reasons.length) {
        say('No se generó el TXT. ' + reasons.join(' ') + ' Actualizá los conceptos y volvé a verificar.');
        return;
      }
      url = URL.createObjectURL(new Blob([entityFileBytes(file)], { type: 'text/plain;charset=windows-1252' }));
      $('preview').textContent = file.lines.slice(0, 5).join('\n') + (file.lines.length > 5 ? `\n… y ${file.lines.length - 5} renglones más` : '');
      $('preview').hidden = false;
      $('download').href = url; $('download').download = file.name; $('download').textContent = 'Descargar ' + file.name + ' (referencia)'; $('download').hidden = false;
      say(`TXT de referencia completo para el concepto ${concept}: ${counts(file.lines.length, people)} y ${centsMoney(total)}. Los tres controles coinciden.`);
    } catch (error) { if (mine === epoch) say(error.message); }
    finally { if (mine === epoch) { busy = false; $('build').disabled = !$('concept').value; } }
  });
  return { setDataset(id, source = null) {
    const valid = source?.datasetId === id && typeof source?.sourceLabel === 'string' && source.sourceLabel.trim() && source.sourceLabel.length <= 240
      && /^\d{4}-\d{2}-\d{2}$/.test(source.date) && ['closed', 'open', 'unknown'].includes(source.closureStatus);
    const closure = valid ? { closed: 'Cierre informado por la fuente', open: 'Abierta / preliquidación', unknown: 'Cierre no informado' }[source.closureStatus] : 'Cierre no informado';
    $('source').textContent = (valid ? 'Fuente: ' + source.sourceLabel + ' · Liquidación: ' + source.date.split('-').reverse().join('/') : 'Fuente de referencia seleccionada') + ' · ' + closure + ' · Archivo de referencia.';
    $('source').hidden = !id;
    dataset = id; return load(id);
  } };
}
