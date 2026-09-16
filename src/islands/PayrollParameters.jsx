import { useEffect, useRef, useState } from 'react';
import { AGREEMENT_LABELS, PARAMETER_RULES, PARAMETER_STATUSES, PARAMETER_COMMANDS, PARAMETER_REASONS, PARAMETER_REASON_LABELS, parameterRule, parseParameterMoney, parameterMoney, parameterPreview, verifiedParameterProposal } from '../../lib/payroll-parameter-contract.js';
import { parameterRequest, parameterAttempt } from './payroll-parameter-client.js';
import { parameterArtifact } from './payroll-parameter-export.js';
import PayrollCatalog from './PayrollCatalog.jsx';
const css = `
[data-parameter-workspace]{color:#163e50;min-width:0;margin:18px 0 24px;font-size:14px;line-height:1.6}
[data-parameter-workspace] *{box-sizing:border-box}
[data-parameter-workspace] h2{font-size:25px;line-height:1.25;margin:0 0 10px}[data-parameter-workspace] h3{font-size:18px;line-height:1.4;margin:0 0 12px}
[data-parameter-workspace] p{margin:0 0 12px}[data-parameter-workspace] small{font-size:12px;color:#45616f;display:block}
[data-parameter-workspace] .pp-hero{border:1px solid #c7dfdf;border-top:4px solid #008278;border-radius:14px;background:linear-gradient(115deg,#eff8f5,#fff);padding:25px;margin-bottom:20px}
[data-parameter-workspace] .pp-eyebrow{color:#00736d;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase}
[data-parameter-workspace] .pp-steps{display:flex;gap:12px;flex-wrap:wrap;margin:15px 0 0;font-size:12px;font-weight:700}
[data-parameter-workspace] .pp-steps span{padding:7px 12px;border:1px solid #bcd7d4;border-radius:7px;background:#fff}
[data-parameter-workspace] .pp-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;gap:20px}
[data-parameter-workspace] .pp-panel{min-width:0;border:1px solid #cfdee4;border-radius:12px;background:#fff;padding:22px;margin-bottom:20px}
[data-parameter-workspace] label{font-weight:700;display:grid;gap:6px;margin-bottom:16px;min-width:0;font-size:13px}
[data-parameter-workspace] input:not([type=checkbox]),[data-parameter-workspace] select{font:inherit;color:#183d4b;width:100%;max-width:100%;min-height:44px;border:1px solid #b7cbd4;border-radius:7px;padding:10px 12px;background:#fff}
[data-parameter-workspace] fieldset{border:0;padding:0;margin:0;min-width:0}[data-parameter-workspace] legend{font-size:13px;font-weight:700;padding:0;margin-bottom:8px}
[data-parameter-workspace] .pp-agreements{padding:14px;background:#f3f7f8;border:1px solid #d7e3e7;border-radius:9px;margin-bottom:16px}
[data-parameter-workspace] .pp-agreements label{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;cursor:pointer}
[data-parameter-workspace] input[type=checkbox]{width:20px;height:20px;accent-color:#007b72}
[data-parameter-workspace] .pp-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:14px}
[data-parameter-workspace] button{min-height:44px;padding:10px 14px;border:1px solid #b6cbd4;border-radius:7px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#fff;color:#164557}
[data-parameter-workspace] .pp-primary{background:#007d75;color:#fff;border-color:#007d75}[data-parameter-workspace] button:disabled{opacity:.5;cursor:not-allowed}
[data-parameter-workspace] :is(input,select,button,summary):focus-visible{outline:3px solid #a5660d;outline-offset:3px}
[data-parameter-workspace] .pp-status{padding:12px 15px;border:1px solid #cedee3;border-left:4px solid #007c75;border-radius:7px;background:#f4f9f8;overflow-wrap:anywhere;margin-bottom:18px}
[data-parameter-workspace] .pp-status[data-error=true]{border-left-color:#a14f20;background:#fff8ee}
[data-parameter-workspace] .pp-preview{padding:15px;background:#ecf7f2;border-radius:9px;border:1px solid #bfdbd0;margin-top:12px}
[data-parameter-workspace] .pp-preview-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #d3e5dd}
[data-parameter-workspace] .pp-preview-row:last-child{border:0}[data-parameter-workspace] .pp-preview-row strong{font-variant-numeric:tabular-nums}
[data-parameter-workspace] .pp-filter{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:15px}[data-parameter-workspace] .pp-filter label{margin:0}
[data-parameter-workspace] .pp-records{display:grid;gap:8px}[data-parameter-workspace] .pp-record{width:100%;text-align:left;font-weight:400;padding:14px 16px}
[data-parameter-workspace] .pp-record[aria-pressed=true]{border:2px solid #007c75;background:#f1f8f6}
[data-parameter-workspace] .pp-record strong{display:block;font-size:14px}[data-parameter-workspace] .pp-badge{display:inline-block;font-size:11px;font-weight:700;color:#46626f;background:#eff4f6;padding:3px 8px;border-radius:5px;margin:5px 0}
[data-parameter-workspace] .pp-meta{display:grid;grid-template-columns:145px 1fr;gap:8px;font-size:13px;margin:14px 0}[data-parameter-workspace] .pp-meta dt{color:#52707c}[data-parameter-workspace] .pp-meta dd{margin:0;overflow-wrap:anywhere}
[data-parameter-workspace] .pp-history{border-top:1px solid #d7e4e5;margin-top:17px;padding-top:15px}[data-parameter-workspace] .pp-event{border-left:2px solid #bcdad2;padding:6px 12px;margin:8px 0;font-size:12px}
[data-parameter-workspace] dialog{max-width:560px;width:calc(100% - 28px);max-height:90dvh;overflow:auto;border:1px solid #b6cdd5;border-radius:14px;padding:26px;color:#163e50;box-shadow:0 18px 70px #0a2a4433}[data-parameter-workspace] dialog::backdrop{background:#102b3cb3}
[data-parameter-workspace] .pp-scope{font-size:12px;border-top:1px solid #d8e4e4;padding-top:12px;color:#49646f}
@media(max-width:1000px){[data-parameter-workspace] .pp-grid{grid-template-columns:1fr}}
@media(max-width:600px){[data-parameter-workspace] .pp-panel,[data-parameter-workspace] .pp-hero{padding:16px}[data-parameter-workspace] .pp-filter{grid-template-columns:1fr}[data-parameter-workspace] .pp-meta{grid-template-columns:1fr;gap:3px}[data-parameter-workspace] .pp-meta dd{margin-bottom:9px}[data-parameter-workspace] .pp-actions button{flex:1 1 150px}}
`;
const blank = () => ({ ruleId: '', amount: '', validFrom: '', sourceReference: '', rounding: 'nearest_cent', agreementIds: [] });
function draftFrom(form) { return { ruleId: form.ruleId, baseAmountCents: parseParameterMoney(form.amount), validFrom: form.validFrom, sourceReference: form.sourceReference.trim(), rounding: form.rounding, agreementIds: [...form.agreementIds].sort((a, b) => a - b) }; }
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('es-AR') : 'No informada';
function Values({ draft }) { return <div className="pp-preview">{parameterPreview(draft).map(row => <div className="pp-preview-row" key={row.agreementId}><span>{row.agreementId} · {AGREEMENT_LABELS[row.agreementId]}<small>Auxiliar {row.auxiliaryId} · clase {row.baseClass}</small></span><strong>{parameterMoney(row.newValueCents)}</strong></div>)}</div>; }
export default function PayrollParameters({ request = parameterRequest }) {
  const [principal, setPrincipal] = useState(null), [form, setForm] = useState(blank), [records, setRecords] = useState([]), [total, setTotal] = useState(0), [filter, setFilter] = useState({ status: 'all', period: '', page: 1 }), [selected, setSelected] = useState(null), [confirmation, setConfirmation] = useState(null), [reason, setReason] = useState('source_mismatch'), [pending, setPending] = useState(null), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [notice, setNotice] = useState('Consultando los parámetros guardados…'), [bad, setBad] = useState(false);
  const mounted = useRef(true), exclusive = useRef(false), ticket = useRef(0), dialog = useRef(null), filterRef = useRef(filter);
  filterRef.current = filter;
  function message(text, isBad = false) { if (mounted.current) { setNotice(text); setBad(isBad); } }
  function failure(e) { message(e.message || 'La consulta no se completó.', true); if (e.status === 409) { setSelected(null); setConfirmation(null); } if ([401, 403].includes(e.status)) { ticket.current++; setBlocked(true); setPrincipal(null); setRecords([]); setSelected(null); setConfirmation(null); setForm(blank()); } }
  async function transaction(fn) { if (exclusive.current) return; exclusive.current = true; setBusy(true); try { await fn(); } catch (e) { if (mounted.current) failure(e); } finally { exclusive.current = false; if (mounted.current) setBusy(false); } }
  async function loadList() {
    const t = ++ticket.current, f = filterRef.current;
    const result = await request({ resource: 'list', status: f.status, period: f.period, page: String(f.page), limit: '10' });
    if (!mounted.current || t !== ticket.current) return;
    result.proposals.forEach(verifiedParameterProposal); setRecords(result.proposals); setTotal(Number(result.total));
  }
  useEffect(() => {
    mounted.current = true;
    transaction(async () => { const result = await request({ resource: 'bootstrap' }); if (!mounted.current) return; setPrincipal(result.principal); await loadList(); message('Parámetros disponibles. Podés preparar un cambio o revisar las propuestas guardadas.'); });
    const logout = () => { mounted.current = false; ticket.current++; setBlocked(true); setPrincipal(null); setSelected(null); setRecords([]); setConfirmation(null); setForm(blank()); setPending(null); };
    document.getElementById('logoutButton')?.addEventListener('click', logout);
    return () => { mounted.current = false; ticket.current++; document.getElementById('logoutButton')?.removeEventListener('click', logout); };
  }, []);
  useEffect(() => { if (confirmation) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmation]);
  const canPrepare = principal?.employmentLinked === true && principal?.capabilities?.includes('payroll.parameter.prepare');
  const disabled = busy || pending !== null || blocked;
  const rule = parameterRule(form.ruleId);
  let preview = null; try { preview = draftFrom(form); parameterPreview(preview); } catch { preview = null; }
  const edit = (key, value) => setForm(old => ({ ...old, [key]: value }));
  async function openProposal(id) { await transaction(async () => { setSelected(null); const result = await request({ resource: 'detail', id }); if (!mounted.current) return; verifiedParameterProposal(result.proposal); setSelected(result.proposal); message('Propuesta consultada. Las acciones dependen de su estado y de tu permiso.'); }); }
  async function confirmed(result) {
    if (!mounted.current) return;
    verifiedParameterProposal(result.proposal); setSelected(result.proposal); setPending(null); setConfirmation(null);
    // Reconsult the version and server-authorized commands after every mutation.
    const latest = await request({ resource: 'detail', id: result.proposal.id });
    if (!mounted.current) return;
    setSelected(verifiedParameterProposal(latest.proposal)); await loadList(); message('Operación confirmada y guardada en Neon.');
  }
  async function send(attempt) {
    setPending(attempt); setConfirmation(null);
    let result;
    try { result = await request({}, attempt); }
    catch (e) { if (e.status < 500) setPending(null); throw e; }
    await confirmed(result);
  }
  function askSave(e) { e.preventDefault(); try { const draft = draftFrom(form); parameterPreview(draft); setConfirmation({ command: 'prepare', draft }); } catch (e) { failure(e); } }
  function confirm() { transaction(async () => {
    const c = confirmation;
    const payload = c.command === 'prepare' ? { bindingId: principal.certifiedBindingId, draft: c.draft } : { proposalId: selected.id, expectedVersion: selected.version, reasonCode: c.command === 'reject' ? reason : PARAMETER_REASONS[c.command][0], reasonReference: 'ref:' + crypto.randomUUID() };
    await send(parameterAttempt(c.command, payload));
  }); }
  async function recover() { await transaction(async () => {
    try { const result = await request({ resource: 'attempt', key: pending.key, command: pending.command }); await confirmed(result); }
    catch (e) { if (e.code === 'PAYROLL_PARAMETER_ATTEMPT_NOT_FOUND') message('No hay confirmación todavía. Podés consultar otra vez o reenviar exactamente el mismo intento.', true); else throw e; }
  }); }
  async function download(extension) { await transaction(async () => {
    const result = await request({ resource: 'detail', id: selected.id });
    if (!mounted.current) return;
    const current = verifiedParameterProposal(result.proposal); setSelected(current);
    if (current.version !== selected.version) { message('La propuesta cambió. Revisá la nueva versión y volvé a descargar.', true); return; }
    const artifact = parameterArtifact(current, extension, new Date().toISOString()), url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.type })), a = document.createElement('a'); a.href = url; a.download = artifact.filename; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); message('Documento generado desde la versión guardada y reconsultada.');
  }); }
  const selectedDraft = selected && (() => { const { rows, sourceSha256, applied, currentCatalogVerified, ...input } = selected.draft; return input; })();
  return <section data-parameter-workspace="v1" aria-label="Gestión de parámetros salariales">
    <style>{css}</style>
    <header className="pp-hero"><p className="pp-eyebrow">Configuración salarial · Registro propio en Neon</p><h2>Parámetros salariales</h2><p>Prepará los auxiliares 88 y 90 desde la escala aprobada, revisá el resultado por convenio y enviá el cambio a otra persona para su control. Sin escribir fórmulas ni reconstruir planillas.</p><div className="pp-steps"><span>1 · Preparar valores</span><span>2 · Guardar propuesta</span><span>3 · Revisión independiente</span></div></header>
    <div className="pp-status" data-error={bad} role="status" aria-live="polite">{notice}</div>
    {pending && <div className="pp-panel"><h3>Este intento necesita confirmación</h3><p>Conservamos la misma clave para no duplicar el cambio. No prepares otro hasta resolverlo.</p><small>Intento: {pending.key}</small><div className="pp-actions"><button disabled={busy || blocked} onClick={recover}>Consultar confirmación</button><button disabled={busy || blocked} onClick={() => transaction(() => send(pending))}>Reenviar el mismo intento</button></div></div>}
    {blocked ? <div className="pp-panel"><p>El acceso a Parámetros no está disponible con esta sesión. No se muestran los datos anteriores.</p><a href="/acceso?returnTo=%2Fnomina%23parametros">Revisar acceso</a></div> : <div className="pp-grid">
      <div className="pp-panel"><h3>Preparar un cambio de escala</h3>{principal && !canPrepare && <p>Tu perfil permite consultar. Preparar un cambio requiere permiso y un vínculo laboral verificado.</p>}
        <form onSubmit={askSave}><fieldset disabled={disabled || !canPrepare}>
          <label>¿Qué valor necesitás actualizar?<select value={form.ruleId} onChange={e => { const r = parameterRule(e.target.value); setForm(old => ({ ...old, ruleId: e.target.value, agreementIds: r ? [...r.agreements] : [] })); }} required><option value="">Elegí un auxiliar</option>{PARAMETER_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
          <label>Importe básico de la clase {rule?.baseClass || 'de referencia'}<input inputMode="decimal" value={form.amount} onChange={e => edit('amount', e.target.value)} maxLength={20} required placeholder="Importe de la escala, en pesos" autoComplete="off"/><small>{rule?.numerator === 3 ? 'Ingresá el básico de la clase 13-I. MuniControl aplica el coeficiente documentado 1,50.' : 'Ingresá el valor de la escala salarial; no el sueldo total de un empleado.'}</small></label>
          <label>Desde qué mes<input type="month" required value={form.validFrom} onChange={e => edit('validFrom', e.target.value)}/></label>
          <label>Resolución o escala que respalda el importe<input required maxLength={180} value={form.sourceReference} onChange={e => edit('sourceReference', e.target.value)} placeholder="Identificación del documento y fecha" autoComplete="off"/><small>Esta referencia será visible al revisor y en las descargas.</small></label>
          <fieldset className="pp-agreements"><legend>Convenios incluidos</legend>{rule ? rule.agreements.map(a => <label key={a}><input type="checkbox" checked={form.agreementIds.includes(a)} onChange={e => edit('agreementIds', e.target.checked ? [...form.agreementIds, a].sort((x,y) => x-y) : form.agreementIds.filter(x => x !== a))}/>{a} · {AGREEMENT_LABELS[a]}</label>) : <small>Elegí el auxiliar para ver los convenios correspondientes.</small>}</fieldset>
          <label>Tratamiento de fracciones de centavo<select value={form.rounding} onChange={e => edit('rounding', e.target.value)}><option value="nearest_cent">Redondear al centavo más próximo</option><option value="truncate_cent">Truncar al centavo</option></select></label>
          {preview && <><small>Vista previa · todavía no guardada</small><Values draft={preview}/></>}
          <div className="pp-actions"><button className="pp-primary" type="submit">Revisar y guardar borrador</button><button type="button" onClick={() => setForm(blank())}>Limpiar formulario</button></div>
        </fieldset></form>
      </div>
      <div>
        <section className="pp-panel" aria-label="Propuestas guardadas"><h3>Cambios guardados</h3>
          <form className="pp-filter" onSubmit={e => { e.preventDefault(); filterRef.current = { ...filter, page: 1 }; setFilter(filterRef.current); transaction(loadList); }}>
            <label>Estado<select value={filter.status} disabled={disabled} onChange={e => setFilter({ ...filter, status: e.target.value })}><option value="all">Todos</option>{Object.entries(PARAMETER_STATUSES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Mes<input type="month" disabled={disabled} value={filter.period} onChange={e => setFilter({ ...filter, period: e.target.value })}/></label><button disabled={disabled}>Consultar</button>
          </form>
          <p><small>{total} propuestas en la consulta · Página {filter.page}</small></p>
          <div className="pp-records">{records.map(p => <button className="pp-record" key={p.id} disabled={disabled} aria-pressed={selected?.id === p.id} onClick={() => openProposal(p.id)}><strong>{parameterRule(p.draft.ruleId)?.label}</strong><span className="pp-badge">{PARAMETER_STATUSES[p.status]}</span><small>Desde {p.draft.validFrom} · Convenios {p.draft.agreementIds.join(', ')} · Versión {p.version}</small></button>)}</div>
          {!records.length && <p>No hay propuestas guardadas para esta consulta. No se muestran ejemplos como si fueran registros.</p>}
          <div className="pp-actions">{[['Anterior', -1], ['Siguiente', 1]].map(([label, delta]) => <button key={label} disabled={disabled || (delta < 0 ? filter.page === 1 : filter.page * 10 >= total)} onClick={() => { filterRef.current = { ...filter, page: filter.page + delta }; setFilter(filterRef.current); transaction(loadList); }}>{label}</button>)}</div>
        </section>
        {selected && <section className="pp-panel" data-parameter-detail><h3>{PARAMETER_STATUSES[selected.status]}</h3><p>{parameterRule(selected.draft.ruleId).label}</p><dl className="pp-meta"><dt>Vigencia propuesta</dt><dd>{selected.draft.validFrom}</dd><dt>Escala / resolución</dt><dd>{selected.draft.sourceReference}</dd><dt>Versión</dt><dd>{selected.version}</dd><dt>Última actualización</dt><dd>{date(selected.updatedAt)}</dd></dl><Values draft={selectedDraft}/>
          <div className="pp-actions">{(selected.allowedCommands || []).filter(c => Object.hasOwn(PARAMETER_COMMANDS, c)).map(c => <button key={c} className={['submit','approve'].includes(c) ? 'pp-primary' : ''} disabled={disabled} onClick={() => { setReason('source_mismatch'); setConfirmation({ command: c }); }}>{PARAMETER_COMMANDS[c]}</button>)}</div>
          <div className="pp-actions">{['xlsx', 'pdf', 'csv'].map(ext => <button disabled={disabled} key={ext} onClick={() => download(ext)}>Descargar {ext === 'xlsx' ? 'Excel' : ext.toUpperCase()}</button>)}</div>
          {principal?.capabilities?.includes('payroll.parameter.audit.read') && <details className="pp-history"><summary>Historial del cambio</summary>{(selected.timeline || []).map(event => <div className="pp-event" key={event.id}><strong>{event.command === 'prepare' ? 'Borrador guardado' : PARAMETER_COMMANDS[event.command] || event.command}</strong><small>{date(event.occurredAt)} · {event.actorRoleKey} · Versión {event.resultingVersion}</small><small>Referencia: {event.reasonReference || 'Preparación inicial'}</small></div>)}</details>}
          <p className="pp-scope">La aprobación conserva esta propuesta. Para incorporarla al catálogo vigente, revisá el impacto y confirmá su activación por separado. Ninguna de estas operaciones recalcula haberes.</p>
        </section>}
      </div>
    </div>}
    {!blocked && <PayrollCatalog proposal={selected} onDenied={failure} />}
    <dialog ref={dialog} aria-labelledby="pp-confirm-title" onCancel={() => { if (!busy) setConfirmation(null); }}>
      <h3 id="pp-confirm-title">{confirmation?.command === 'prepare' ? 'Revisar antes de guardar' : PARAMETER_COMMANDS[confirmation?.command]}</h3>
      {confirmation?.command === 'prepare' ? <><p>Desde {confirmation.draft.validFrom} · {confirmation.draft.sourceReference}</p><Values draft={confirmation.draft}/></> : selected && <><p>Desde {selected.draft.validFrom} · Versión {selected.version}</p><p>{selected.draft.sourceReference}</p>{confirmation?.command === 'reject' && <label>Motivo del rechazo<select value={reason} onChange={e => setReason(e.target.value)}>{PARAMETER_REASONS.reject.map(r => <option key={r} value={r}>{PARAMETER_REASON_LABELS[r]}</option>)}</select></label>}</>}
      <p className="pp-scope">Se registra esta operación con tu sesión y una referencia única. No se modifica una liquidación.</p>
      <div className="pp-actions"><button onClick={() => setConfirmation(null)} disabled={busy}>Volver sin guardar</button><button className="pp-primary" disabled={busy} onClick={confirm}>Confirmar {confirmation?.command === 'prepare' ? 'borrador' : 'operación'}</button></div>
    </dialog>
  </section>;
}
