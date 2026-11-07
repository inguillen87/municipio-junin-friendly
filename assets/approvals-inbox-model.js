// «Pendientes de aprobación»: one read per module that lists second-person reviews for the whole municipality.
// Pure: URLs, capability gates and parsers. Nothing here approves; every decision stays in the module's own screen.
const list = v => Array.isArray(v) ? v : [];
const text = (v, max = 90) => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s.length > max ? s.slice(0, max - 1) + '…' : s; };
const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodLabel = p => { const m = /^(\d{4})-(\d{2})/.exec(String(p ?? '')); return m && months[Number(m[2]) - 1] ? months[Number(m[2]) - 1] + ' ' + m[1] : ''; };
export const shortDate = iso => { const t = Date.parse(iso ?? ''); if (!Number.isFinite(t)) return ''; const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
const typeLabel = t => ({ monthly: 'mensual', sac: 'SAC', final: 'final', vacation: 'vacaciones', M: 'mensual', S: 'SAC' })[t] ?? (t ? String(t) : '');
export const lastClosedMonth = (now = new Date()) => { const m = now.getMonth(); return m ? now.getFullYear() + '-' + String(m).padStart(2, '0') : (now.getFullYear() - 1) + '-12'; };

// Common proposal summary (author, date, reason, canReview) used by most governed modules.
function proposals(items, describe) {
  const pending = list(items).filter(p => p && p.status === 'pending');
  return { count: pending.length, reviewable: pending.filter(p => p.canReview === true).length, items: pending.slice(0, 3).map(p => ({ who: text(p.authorLabel, 60), when: shortDate(p.createdAt), what: describe ? describe(p) : text(p.reason) })) };
}

// Monthly novelty batches: who prepared each one (from the commands the server allows) and why the account cannot decide.
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
function batchWhat(b) {
  const rows = list(b.rows), first = rows[0];
  const detail = rows.length === 1 && first ? ['legajo ' + (first.legajo ?? '?'), first.conceptSourceId ? 'concepto ' + first.conceptSourceId : '', first.quantityDecimal != null ? 'cant. ' + first.quantityDecimal : ''].filter(Boolean).join(' · ')
    : Number.isInteger(b.rowCount) ? plural(b.rowCount, 'fila', 'filas') : '';
  return text([periodLabel(b.periodMonth), typeLabel(b.payrollType), detail].filter(Boolean).join(' · '));
}
export function monthlyBatches(p) {
  const rows = list(p?.batches).filter(b => b?.status === 'submitted');
  const commands = b => list(b.allowedCommands);
  const reviewable = rows.filter(b => commands(b).includes('approve')).length, mine = rows.filter(b => commands(b).includes('cancel')).length;
  const caps = new Set(list(p?.principal?.capabilities)), unlinked = p?.principal?.employmentLinked === false && caps.has('payroll.novelty.approve');
  const others = rows.length - reviewable - mine;
  const notes = [];
  if (reviewable) notes.push(reviewable === rows.length ? (reviewable === 1 ? 'Podés aprobarlo o rechazarlo.' : 'Podés aprobarlos o rechazarlos.') : plural(reviewable, 'lo podés aprobar o rechazar vos.', 'los podés aprobar o rechazar vos.'));
  if (mine) notes.push((mine === 1 ? '1 lo preparaste vos: podés cancelarlo; lo aprueba otra persona.' : mine + ' los preparaste vos: podés cancelarlos; los aprueba otra persona.'));
  if (others) notes.push(unlinked ? (others === 1 ? '1 lo preparó otra cuenta. ' : others + ' los preparó otra cuenta. ') + 'Tu cuenta no está vinculada a un legajo, así que no aprueba: lo decide una cuenta vinculada con permiso, o quien lo preparó lo cancela.'
    : (others === 1 ? '1 lo decide otra persona con permiso de aprobación.' : others + ' los decide otra persona con permiso de aprobación.'));
  return { count: rows.length, reviewable, note: notes.join(' ') || undefined,
    items: rows.slice(0, 3).map(b => ({ who: commands(b).includes('cancel') ? 'preparado por vos' : '', when: shortDate(b.submittedAt ?? b.createdAt), what: batchWhat(b),
      href: typeof b.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id) ? '/novedades?batchId=' + b.id + '#lotes' : undefined })) };
}

export const APPROVAL_SOURCES = Object.freeze([
  { key: 'program', area: 'Liquidaciones', title: 'Programa de cálculo', href: '/nomina#reglas', caps: ['workforce.employee.read', 'payroll.parameter.read'],
    url: () => '/api/internal-own-payroll-program?resource=bootstrap', pick: p => proposals(p?.data?.proposals) },
  { key: 'parameters', area: 'Liquidaciones', title: 'Parámetros salariales', href: '/nomina#parametros', caps: ['payroll.parameter.read'],
    url: () => '/api/internal-payroll-parameters?resource=list&status=submitted&page=1&limit=50',
    pick: p => { const rows = list(p?.proposals).filter(r => r?.status === 'submitted'); const total = Number.isSafeInteger(p?.total) ? p.total : rows.length;
      return { count: total, reviewable: null, items: rows.slice(0, 3).map(r => ({ who: '', when: shortDate(r.submittedAt ?? r.createdAt), what: text([r.draft?.ruleId, r.draft?.validFrom ? 'desde ' + periodLabel(r.draft.validFrom) : ''].filter(Boolean).join(' · ') || 'Propuesta enviada') })) }; } },
  { key: 'agreement-time', area: 'Liquidaciones', title: 'Horas por convenio', href: '/nomina#horas-convenio', caps: ['workforce.employee.read', 'payroll.parameter.read'],
    url: ctx => '/api/internal-own-agreement-working-time?resource=bootstrap&period=' + ctx.period, pick: p => proposals(p?.data?.proposals), period: true },
  { key: 'bank-accounts', area: 'Liquidaciones', title: 'Cuentas bancarias', href: '/nomina#cuentas', caps: ['workforce.employee.read', 'payroll.parameter.read'],
    url: () => '/api/internal-own-bank-accounts?resource=bootstrap', pick: p => proposals(p?.data?.proposals, x => text(x.reason) + (Number.isInteger(x.accountCount) ? ' · ' + x.accountCount + ' cuentas' : '')) },
  { key: 'accounting', area: 'Liquidaciones', title: 'Asociaciones contables', href: '/nomina#contabilidad', caps: ['workforce.employee.read', 'payroll.parameter.read'],
    url: () => '/api/internal-own-payroll-accounting?resource=bootstrap', pick: p => proposals(p?.data?.proposals) },
  { key: 'own-novelties', area: 'Novedades', title: 'Lotes de novedades', href: '/novedades#ownNativeBulkNovelties', caps: ['workforce.employee.read', 'payroll.novelty.read', 'payroll.novelty.nominal.read'],
    url: () => '/api/internal-own-payroll-novelties?resource=bootstrap',
    pick: p => { const rows = list(p?.data?.batches).filter(b => b?.status === 'submitted'); const can = p?.data?.permissions?.canApprove === true;
      return { count: rows.length, reviewable: can ? null : 0, items: rows.slice(0, 3).map(b => ({ who: '', when: '', what: [periodLabel(b.periodMonth), typeLabel(b.payrollType), Number.isInteger(b.rowCount) ? b.rowCount + (b.rowCount === 1 ? ' fila' : ' filas') : ''].filter(Boolean).join(' · ') })) }; } },
  { key: 'fixed-novelties', area: 'Novedades', title: 'Novedades fijas', href: '/novedades#fixedNovelties', caps: ['payroll.novelty.read', 'payroll.novelty.nominal.read'],
    url: () => '/api/internal-payroll-fixed-novelties?resource=list',
    pick: p => { const rows = list(p?.data?.rows).filter(r => r?.pending); return { count: rows.length, reviewable: rows.filter(r => r.pending.canReview === true).length,
      items: rows.slice(0, 3).map(r => ({ who: '', when: shortDate(r.pending.proposedAt), what: text(['Legajo ' + (r.subject?.legajo ?? '?'), r.pending.operation === 'annul' ? 'anular' : 'alta o cambio', r.pending.values?.conceptSourceId ? 'concepto ' + r.pending.values.conceptSourceId : ''].filter(Boolean).join(' · ')) })) }; } },
  { key: 'monthly-batches', area: 'Novedades', title: 'Lotes mensuales', href: '/novedades#lotes', caps: ['payroll.novelty.read'],
    url: () => '/api/internal-payroll-novelties?resource=bootstrap&version=2', pick: monthlyBatches },
  { key: 'monthly-annul', area: 'Novedades', title: 'Anulaciones de lotes', href: '/novedades#monthlyAnnul', caps: ['payroll.novelty.read', 'payroll.novelty.nominal.read'],
    url: () => '/api/internal-payroll-monthly-annul?resource=bootstrap', pick: p => proposals(p?.data?.proposals) },
  { key: 'monthly-correction', area: 'Novedades', title: 'Correcciones de lotes', href: '/novedades#monthlyCorrection', caps: ['payroll.novelty.read', 'payroll.novelty.nominal.read'],
    url: () => '/api/internal-payroll-monthly-correction?resource=bootstrap', pick: p => proposals(p?.data?.proposals) },
  { key: 'adoption', area: 'Personas', title: 'Altas al padrón propio', href: '/personal?adopcion=pendientes#legajos', caps: ['workforce.employee.read', 'employee.record.approve'],
    url: () => '/api/internal-municipal-adoption?resource=queue',
    pick: p => { const rows = list(p?.data?.rows).filter(r => r?.proposal?.status === 'pending'); return { count: rows.length, reviewable: rows.filter(r => r.independent === true).length,
      items: rows.slice(0, 3).map(r => ({ who: '', when: '', what: Number.isInteger(r.proposal.total) ? r.proposal.total + (r.proposal.total === 1 ? ' legajo' : ' legajos') : 'Propuesta de adopción' })) }; } },
  { key: 'leave', area: 'Personas', title: 'Licencias solicitadas', href: '/acciones', caps: ['actions.read'],
    url: () => '/api/internal-actions?resource=list&caseType=leave_request&type=leave_request&view=authorized&status=submitted&page=1&limit=3',
    pick: p => { const rows = list(p?.data); const total = Number.isSafeInteger(p?.pagination?.total) ? p.pagination.total : rows.length;
      return { count: total, reviewable: null, items: rows.slice(0, 3).map(r => ({ who: text(r.subject?.displayName, 50), when: shortDate(r.updatedAt), what: text([r.subject?.legajo ? 'Legajo ' + r.subject.legajo : '', r.payload?.startsOn ? 'desde ' + r.payload.startsOn.split('-').reverse().join('/') : ''].filter(Boolean).join(' · ')) })) }; } },
]);

// Reviewed inside each person's record or per period+contract: no municipality-wide list exists to count them.
export const APPROVAL_ELSEWHERE = Object.freeze([
  { title: 'Bajas, reingresos y cambios de encuadre', where: 'en la ficha de cada persona', href: '/personal#legajos' },
  { title: 'Maestro salarial', where: 'en Parámetros', href: '/nomina#parametros' },
  { title: 'Encuadre por período, jornada, antigüedad y datos fiscales', where: 'en su pantalla, eligiendo legajo y mes', href: '/nomina#encuadre' },
  { title: 'Confirmar liquidaciones calculadas', where: 'en Confirmar y anular', href: '/nomina#decisiones' },
]);

export function visibleApprovalSources(capabilities) {
  const caps = capabilities instanceof Set ? capabilities : new Set(list(capabilities));
  return APPROVAL_SOURCES.filter(s => s.caps.every(c => caps.has(c)));
}

/** Totals for the header: how many items wait and how many the account can decide. Unknown reviewable counts are excluded. */
export function approvalTotals(results) {
  let waiting = 0, reviewable = 0, unknown = 0;
  for (const r of list(results)) { if (!r || r.error || !Number.isInteger(r.count)) continue; waiting += r.count; if (Number.isInteger(r.reviewable)) reviewable += r.reviewable; else unknown += r.count; }
  return { waiting, reviewable, unknown };
}
