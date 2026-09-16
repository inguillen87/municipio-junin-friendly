import { useId, useLayoutEffect, useRef, useState } from 'react';
import { filterLeaveRules, leaveRuleCounts, leaveRuleLabel, LEAVE_RULE_FILTERS } from './leave-rules-model.js';

const styles = `
[data-leave-rules-workspace]{color:var(--text,#173c4a);min-width:0}
[data-leave-rules-workspace] .lr-intro{display:flex;align-items:start;gap:20px;justify-content:space-between;margin:0 0 18px;flex-wrap:wrap}
[data-leave-rules-workspace] .lr-intro h3{font-size:18px;margin:0 0 6px}
[data-leave-rules-workspace] .lr-intro p{font-size:13px;line-height:1.65;max-width:600px;margin:0;color:#466170}
[data-leave-rules-workspace] .lr-search{display:grid;gap:7px;flex:1 1 240px;max-width:390px;font-size:13px;font-weight:700}
[data-leave-rules-workspace] .lr-search input{box-sizing:border-box;width:100%;min-width:0;min-height:46px;padding:11px 12px;border:1px solid #b6cbd3;border-radius:9px;font:inherit;color:#183e4e;background:#fff}
[data-leave-rules-workspace] .lr-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
[data-leave-rules-workspace] button{display:inline-flex;align-items:center;gap:8px;justify-content:center;min-height:44px;padding:10px 14px;font:inherit;font-size:12px;font-weight:700;border:1px solid #bdd2d7;border-radius:8px;background:#fff;color:#214858;cursor:pointer}
[data-leave-rules-workspace] button[aria-pressed=true]{background:#184c4e;color:#fff;border-color:#184c4e}
[data-leave-rules-workspace] .lr-count{font-variant-numeric:tabular-nums;opacity:.9}
[data-leave-rules-workspace] .lr-resultbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0}
[data-leave-rules-workspace] .lr-resultbar p{font-size:13px;line-height:1.6;margin:0}
[data-leave-rules-workspace] .lr-reset{display:flex;gap:8px;flex-wrap:wrap}
[data-leave-rules-workspace] .lr-results{display:grid;gap:10px}
[data-leave-rules-workspace] .lr-rule{border:1px solid #d2e0e5;border-radius:10px;overflow-wrap:anywhere;background:#fff;min-width:0}
[data-leave-rules-workspace] .lr-rule summary{padding:16px 18px;cursor:pointer;min-height:44px;list-style:none;display:flex;align-items:center;gap:12px;justify-content:space-between}
[data-leave-rules-workspace] .lr-rule summary::-webkit-details-marker{display:none}
[data-leave-rules-workspace] .lr-rule summary::after{content:'+';font-size:24px;line-height:1;width:24px;text-align:center;flex-shrink:0;color:#315f66}
[data-leave-rules-workspace] .lr-rule[open] summary::after{content:'−'}
[data-leave-rules-workspace] .lr-rule-title{flex:1;min-width:0}
[data-leave-rules-workspace] .lr-rule-title strong{display:block;font-size:14px;line-height:1.55}
[data-leave-rules-workspace] .lr-rule-title small{display:block;margin-top:4px;color:#57727d;font-size:11px}
[data-leave-rules-workspace] .lr-category{font-size:11px;font-weight:700;padding:6px 10px;border-radius:7px;background:#fff3db;color:#785313;flex-shrink:0}
[data-leave-rules-workspace] [data-category=calculable] .lr-category{background:#e8f3ef;color:#23594a}
[data-leave-rules-workspace] [data-category=not_calculable] .lr-category{background:#fbeeee;color:#8e3636}
[data-leave-rules-workspace] .lr-detail{border-top:1px solid #e1eaee;padding:16px 18px;font-size:13px;line-height:1.7}
[data-leave-rules-workspace] .lr-detail p{margin:0 0 12px}
[data-leave-rules-workspace] .lr-detail dl{display:grid;gap:12px;margin:0}
[data-leave-rules-workspace] .lr-detail dt{font-size:11px;font-weight:700;color:#58717e;margin:0 0 3px}
[data-leave-rules-workspace] .lr-detail dd{margin:0}
[data-leave-rules-workspace] .lr-scope{padding:12px 14px;margin:16px 0 0;border-left:3px solid #b4883c;background:#fbf7ee;font-size:12px;line-height:1.7;color:#5a522e}
[data-leave-rules-workspace] .lr-empty{padding:24px 16px;border:1px dashed #bdcfd7;border-radius:9px;font-size:14px;line-height:1.7}
[data-leave-rules-workspace] :is(button,input,summary):focus-visible{outline:3px solid #a66b12;outline-offset:3px}
@media(max-width:600px){[data-leave-rules-workspace] .lr-search{max-width:none;width:100%}[data-leave-rules-workspace] .lr-filters button{flex:1 1 120px}[data-leave-rules-workspace] .lr-rule summary{padding:14px;flex-wrap:wrap;gap:8px}[data-leave-rules-workspace] .lr-rule-title{flex-basis:calc(100% - 40px);order:0}[data-leave-rules-workspace] .lr-rule summary::after{order:1}[data-leave-rules-workspace] .lr-category{order:2}[data-leave-rules-workspace] .lr-detail{padding:14px}}
@media print{[data-leave-rules-workspace] .lr-search,[data-leave-rules-workspace] .lr-filters,[data-leave-rules-workspace] .lr-reset{display:none!important}}
`;

export default function LeaveRulesBrowser({ rules, onReady }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const input = useRef(null);
  const id = useId();
  const visible = filterLeaveRules(rules, { query, category });
  const counts = leaveRuleCounts(rules, query);
  useLayoutEffect(() => { onReady(); }, [onReady]);
  function clear() { setQuery(''); input.current?.focus(); }
  function reset() { setCategory('all'); clear(); }
  return <div data-leave-rules-workspace="v1">
    <style>{styles}</style>
    <div className="lr-intro">
      <div><h3>Encontrá la regla que necesitás revisar</h3><p>Buscá por licencia, código, artículo o documentación requerida. Abrí una regla para consultar sus condiciones y límites.</p></div>
      <label className="lr-search">Buscar una regla<input ref={input} type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} aria-describedby={id} placeholder="Anual, familiar, antigüedad…" /></label>
    </div>
    <div className="lr-filters" role="group" aria-label="Calculabilidad de la regla">
      {LEAVE_RULE_FILTERS.map(filter => <button type="button" key={filter.id} aria-pressed={category === filter.id} onClick={() => setCategory(filter.id)}>{filter.label}<span className="lr-count" aria-hidden="true">{counts[filter.id]}</span></button>)}
    </div>
    <div className="lr-resultbar">
      <p id={id} role="status" aria-live="polite" aria-atomic="true">{visible.length} de {rules.length} reglas{category !== 'all' ? ` · ${leaveRuleLabel(category)}` : ''}{query ? ' · Búsqueda aplicada' : ''}.</p>
      <div className="lr-reset">{query ? <button type="button" onClick={clear}>Limpiar búsqueda</button> : null}{category !== 'all' ? <button type="button" onClick={reset}>Restablecer filtros</button> : null}</div>
    </div>
    <div className="lr-results">
      {visible.map(rule => <details className="lr-rule" key={rule.key} data-category={rule.category}>
        <summary><span className="lr-rule-title"><strong>{rule.label}</strong><small>{rule.code ? `Código: ${rule.code}` : 'Sin código informado'}{rule.basis ? ` · ${rule.basis}` : ''}</small></span><span className="lr-category">{leaveRuleLabel(rule.category)}</span></summary>
        <div className="lr-detail">{rule.summary ? <p>{rule.summary}</p> : null}<dl>
          {rule.unit ? <div><dt>Unidad</dt><dd>{rule.unit}</dd></div> : null}
          {rule.referenceValue !== null && rule.referenceValue !== undefined && rule.referenceValue !== '' ? <div><dt>Referencia informada</dt><dd>{String(rule.referenceValue)}</dd></div> : null}
          <div><dt>Condiciones que deben verificarse</dt><dd>{rule.conditions.length ? rule.conditions.join(' · ') : 'No se informaron condiciones en este catálogo. No implica autorización automática.'}</dd></div>
          <div><dt>Límites y revisión</dt><dd>{rule.limitations.length ? rule.limitations.join(' · ') : 'Consultar la fuente y la documentación del caso antes de decidir.'}</dd></div>
        </dl></div>
      </details>)}
    </div>
    {!visible.length ? <p className="lr-empty">{rules.length ? 'No hay reglas que coincidan. Cambiá la búsqueda o restablecé los filtros.' : 'La consulta no devolvió reglas. No se agregan reglas ni plazos de ejemplo.'}</p> : null}
    <p className="lr-scope"><strong>Regla, evidencia y decisión son cosas distintas.</strong> “Calculable” no significa saldo disponible, licencia aprobada ni novedad salarial confirmada.</p>
  </div>;
}
