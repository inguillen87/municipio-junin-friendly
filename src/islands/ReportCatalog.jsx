import { useLayoutEffect, useRef, useState } from 'react';

const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Public report descriptions only. Payroll data and tools remain outside this root.
export default function ReportCatalog({ cards, initialQuery = '', onReady }) {
  const [query, setQuery] = useState(initialQuery);
  const input = useRef(null);
  const search = fold(query.trim());
  const visible = cards.filter(([title, description, , , kind]) => fold(`${title} ${description} ${kind}`).includes(search));
  useLayoutEffect(() => { onReady?.(input.current); }, [onReady]);

  function clear() {
    setQuery('');
    input.current?.focus();
  }

  return <>
    <div className="rc-catalog-intro">
      <h2>¿Qué necesitás resolver?</h2>
      <label>Buscar un reporte
        <input ref={input} type="search" data-catalog-search placeholder="Dotación, descuentos, ausencias…"
          maxLength={80} value={query} onChange={event => setQuery(event.target.value)} aria-describedby="report-catalog-count" />
      </label>
    </div>
    <p id="report-catalog-count" className="rc-explanation" role="status" aria-live="polite" aria-atomic="true">
      {visible.length} de {cards.length} reportes{search ? ' coinciden con tu búsqueda.' : ' disponibles para consultar.'}
      {query ? <> <button type="button" className="rc-button secondary" onClick={clear}>Limpiar búsqueda</button></> : null}
    </p>
    <div className="rc-catalog">
      {visible.map(([title, description, tag, href, kind]) => <a key={href} className="rc-card" href={href}>
        <span className="rc-eyebrow">{kind}</span>
        <h3>{title}</h3><p>{description}</p><span className="rc-tag">{tag}</span><span className="rc-card-action">Abrir →</span>
      </a>)}
    </div>
    {!visible.length ? <p className="rc-empty">No hay reportes que coincidan. Probá con otra palabra o limpiá la búsqueda.</p> : null}
  </>;
}
