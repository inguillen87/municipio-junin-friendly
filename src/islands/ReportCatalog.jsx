import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_AREAS, CATALOG_FORMATS, catalogEntries, filterCatalog, catalogAreaCounts, normalizeCatalogSearch } from './report-catalog-model.js';

// Scoped, static presentation travels with the optional island. No global
// stylesheet/build change, and the legacy catalog remains usable on load failure.
const styles = `
[data-catalog-workspace] .rc-task-areas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
[data-catalog-workspace] .rc-task-areas button{gap:9px;min-height:44px}
[data-catalog-workspace] .rc-area-count{font-size:11px;font-variant-numeric:tabular-nums;min-width:20px;border:1px solid currentColor;border-radius:20px;padding:1px 5px}
[data-catalog-workspace] .rc-task-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px;margin:0 0 16px;border:1px solid #d4e2e6;border-radius:12px;background:#fff}
[data-catalog-workspace] .rc-task-toolbar .rc-explanation{margin:0;flex:1 1 230px;color:#365566}
[data-catalog-workspace] .rc-task-format{display:flex;align-items:center;flex-wrap:wrap;gap:9px;font-size:12px;font-weight:700;color:#244c5d}
[data-catalog-workspace] .rc-task-format select{font:inherit;min-height:44px;max-width:100%;padding:9px 12px;border:1px solid #b8cdd5;border-radius:7px;background:#fff;color:#163d4d}
[data-catalog-workspace] .rc-task-reset{display:flex;flex-wrap:wrap;gap:8px}
[data-catalog-workspace] input:focus-visible,[data-catalog-workspace] select:focus-visible{outline:3px solid #b16b10;outline-offset:3px}
[data-catalog-workspace] .rc-task-note{font-size:12px;line-height:1.65;color:#405f6f;margin:0 0 20px;max-width:1000px}
[data-catalog-workspace] .rc-card{min-width:0;overflow-wrap:anywhere}
[data-catalog-workspace] .rc-origin{display:block;font-size:11px;font-weight:700;color:#315d53;padding-top:10px;border-top:1px solid #deebe7}
[data-catalog-workspace] .rc-card[data-external-control=true]{border-color:#d6bc8b;background:#fffdf8}
[data-catalog-workspace] .rc-card[data-external-control=true] .rc-origin{color:#775011;border-color:#e8d9bc}
[data-catalog-workspace] .rc-empty{margin:0;border:1px dashed #b8cdd5;border-radius:12px;background:#fff;color:#365566}
@media(max-width:620px){[data-catalog-workspace] .rc-task-areas button{flex:1 1 130px}[data-catalog-workspace] .rc-task-toolbar{align-items:stretch;padding:12px}[data-catalog-workspace] .rc-task-format{width:100%}[data-catalog-workspace] .rc-task-format select{flex:1;min-width:0}[data-catalog-workspace] .rc-task-reset{width:100%}[data-catalog-workspace] .rc-task-reset button{flex:1 1 130px}}
@media print{[data-catalog-workspace] .rc-task-areas,[data-catalog-workspace] .rc-task-toolbar,[data-catalog-workspace] .rc-task-note{display:none!important}}
`;

// Public descriptions only. Payroll data, files and forms stay outside this root.
export default function ReportCatalog({ cards, initialQuery = '', onReady }) {
  const [query, setQuery] = useState(initialQuery);
  const [area, setArea] = useState('all');
  const [format, setFormat] = useState('all');
  const input = useRef(null);
  const countId = useId();
  const formatId = useId();
  const entries = useMemo(() => catalogEntries(cards), [cards]);
  const filters = { query, area, format };
  const visible = filterCatalog(entries, filters);
  const counts = catalogAreaCounts(entries, filters);
  const areas = CATALOG_AREAS.filter(item => item.id === 'all' || entries.some(entry => entry.kind === item.id));
  const areaLabel = CATALOG_AREAS.find(item => item.id === area)?.label;
  const hasFilters = area !== 'all' || format !== 'all';
  const hasSearch = Boolean(normalizeCatalogSearch(query));
  useLayoutEffect(() => { onReady?.(input.current); }, [onReady]);

  function clear() {
    setQuery('');
    input.current?.focus();
  }
  function reset() {
    setArea('all');
    setFormat('all');
    clear();
  }

  return <section data-catalog-workspace="v2" aria-label="Biblioteca de reportes">
    <style>{styles}</style>
    <div className="rc-catalog-intro">
      <h2>¿Qué necesitás resolver?</h2>
      <label>Buscar un reporte
        <input ref={input} type="search" data-catalog-search placeholder="Mutuales, recibos, bancarización…"
          maxLength={80} value={query} onChange={event => setQuery(event.target.value)} aria-describedby={countId} />
      </label>
    </div>
    <div className="rc-task-areas" role="group" aria-label="Área de trabajo">
      {areas.map(item => <button key={item.id} type="button" data-catalog-area={item.id}
        className={`rc-button${area === item.id ? '' : ' secondary'}`} aria-pressed={area === item.id}
        onClick={() => setArea(item.id)}>
        {item.label}<span className="rc-area-count" aria-hidden="true">{counts[item.id]}</span>
      </button>)}
    </div>
    <div className="rc-task-toolbar">
      <p id={countId} className="rc-explanation" role="status" aria-live="polite" aria-atomic="true">
        {visible.length} de {cards.length} reportes{hasSearch || hasFilters ? ' coinciden con los filtros.' : ' disponibles para consultar.'}
        {area !== 'all' ? ` Área: ${areaLabel}.` : ''}{format !== 'all' ? ` Formato: ${format}.` : ''}
      </p>
      <label className="rc-task-format" htmlFor={formatId}>Formato de salida
        <select id={formatId} data-catalog-format value={format} onChange={event => setFormat(event.target.value)}>
          <option value="all">Todos los formatos</option>
          {CATALOG_FORMATS.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {query || hasFilters ? <div className="rc-task-reset">
        {query ? <button type="button" className="rc-button secondary" onClick={clear}>Limpiar búsqueda</button> : null}
        {hasFilters ? <button type="button" className="rc-button secondary" onClick={reset}>Restablecer filtros</button> : null}
      </div> : null}
    </div>
    <p className="rc-task-note">Los reportes internos usan los datos conservados y requieren los permisos correspondientes.
      {' '}Los datos agregados mantienen su fecha de corte. <strong>Controles externos</strong> revisa archivos del sistema anterior: no envía pagos ni presenta declaraciones.</p>
    <div className="rc-catalog">
      {visible.map(entry => <a key={entry.href} className="rc-card" href={entry.href} data-external-control={entry.external ? 'true' : undefined}>
        <span className="rc-eyebrow">{entry.kind}</span>
        <h3>{entry.title}</h3><p>{entry.description}</p><span className="rc-tag">{entry.tag}</span>
        <span className="rc-origin">{entry.origin}</span>
        <span className="rc-card-action">{entry.action} →</span>
      </a>)}
    </div>
    {!visible.length ? <p className="rc-empty">No hay reportes que coincidan. Probá con otra palabra o limpiá la búsqueda.
      {hasFilters ? ' También podés cambiar el área o formato, o restablecer los filtros.' : ''}</p> : null}
  </section>;
}
