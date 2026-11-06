// Calcular: which convenios of the chosen population have pay rules in the approved programme for the period and type.
// The engine stops the whole result (PAY_RULE_MISSING) when one selected contract's convenio has no remuneration rule,
// so the screen says it before calculating. Pure: no requests, no DOM.
const key = value => String(value ?? '').trim().toUpperCase();
const PAY = new Set(['remuneration', 'non_remuneration']);
export const ownRunMonthLabel = period => { const [y, m] = String(period).split('-'); const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return names[Number(m) - 1] ? names[Number(m) - 1] + ' ' + y : String(period); };
const monthLabel = ownRunMonthLabel;

/** Rows of the roster inside the chosen scope, with their convenio (labels matched exactly against the catalog). */
function scopeRows(rows, catalogItems, { kind = 'all', values = [] } = {}) {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  const agreements = new Map(), sectors = new Map();
  for (const item of items) {
    if (item?.kind === 'agreements') agreements.set(key(item.label), [...(agreements.get(key(item.label)) ?? []), item]);
    if (item?.kind === 'sectors') sectors.set(key(item.label), [...(sectors.get(key(item.label)) ?? []), item.code]);
  }
  const chosen = new Set(values), inside = []; let unmatched = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'active') continue;
    if (kind === 'contracts' && !chosen.has(row.contractId)) continue;
    if (kind === 'departments') { const codes = sectors.get(key(row.sector)); if (codes?.length !== 1 || !chosen.has(codes[0])) continue; }
    const match = agreements.get(key(row.agreement));
    if (match?.length !== 1) { unmatched++; continue; }
    if (kind === 'agreements' && !chosen.has(match[0].code)) continue;
    inside.push({ row, agreement: match[0] });
  }
  return { inside, unmatched };
}

/** People per convenio code in the selected scope (labels matched exactly against the catalog). */
export function ownRunScopeAgreements(rows, catalogItems, scope = {}) {
  const { inside, unmatched } = scopeRows(rows, catalogItems, scope);
  const out = new Map();
  for (const { agreement: { code, label } } of inside) {
    const entry = out.get(code) ?? { code, label, people: 0 };
    entry.people++; out.set(code, entry);
  }
  return { agreements: [...out.values()].sort((a, b) => Number(a.code) - Number(b.code)), unmatched };
}

// Civil day in Argentina (the engine compares the registration day in America/Argentina/Mendoza).
let civilFormat = null;
const civilDay = iso => { const t = Date.parse(iso ?? ''); if (!Number.isFinite(t)) return null; civilFormat ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Mendoza', year: 'numeric', month: '2-digit', day: '2-digit' }); return civilFormat.format(new Date(t)); };
const lastDayOf = period => { const [y, m] = String(period).split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/**
 * Legajos of the scope registered in MuniControl after the end of the period. For a month before its own registration
 * the engine does not reuse the current encuadre (OWN_RUN_HISTORY_REQUIRED): each one needs an approved encuadre for
 * that period. This screen cannot see those approvals, so it reports the requirement, not a refusal.
 */
export function ownRunRegistrationHistory(rows, catalogItems, { kind = 'all', values = [], period } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period ?? ''))) return Object.freeze({ period, inScope: 0, after: 0, first: null, last: null, firstPeriod: null });
  const end = lastDayOf(period); let after = 0, first = null, last = null;
  const { inside } = scopeRows(rows, catalogItems, { kind, values });
  for (const { row } of inside) {
    const day = civilDay(row.registeredAt);
    if (!day || day <= end) continue;
    after++; if (!first || day < first) first = day; if (!last || day > last) last = day;
  }
  return Object.freeze({ period, inScope: inside.length, after, first, last, firstPeriod: last ? last.slice(0, 7) : null });
}

/** Convenios with and without pay rules in force for the period and liquidation type. */
export function ownRunProgramCoverage(definition, { period, liquidationType, agreements }) {
  const rules = Array.isArray(definition?.rules) ? definition.rules : [];
  const inForce = r => r.validFrom <= period && (r.validUntil === null || r.validUntil >= period) && Array.isArray(r.liquidationTypes) && r.liquidationTypes.includes(liquidationType);
  const paying = new Set(rules.filter(r => PAY.has(r.nature) && inForce(r)).map(r => String(r.agreementCode)));
  const validity = new Map();
  for (const r of rules) if (PAY.has(r.nature)) validity.set(String(r.agreementCode), [...new Set([...(validity.get(String(r.agreementCode)) ?? []), r.validFrom + (r.validUntil === r.validFrom ? '' : '…' + (r.validUntil ?? 'sin fin'))])]);
  const covered = [], missing = [];
  for (const a of agreements ?? []) (paying.has(String(a.code)) ? covered : missing).push({ ...a, validity: validity.get(String(a.code)) ?? [] });
  return Object.freeze({
    period, liquidationType, rules: rules.length, covered, missing,
    complete: missing.length === 0 && covered.length > 0,
    missingPeople: missing.reduce((n, a) => n + a.people, 0),
    programAgreements: [...validity.keys()].sort((a, b) => Number(a) - Number(b)).map(code => ({ code, validity: validity.get(code) })),
  });
}

/** Legajos without repartición inside the given convenios: «Convenios» would include them and the engine rejects the run. */
export function ownRunUnsectoredInAgreements(rows, catalogItems, codes) {
  const agreements = new Map(), wanted = new Set((codes ?? []).map(String));
  for (const item of Array.isArray(catalogItems) ? catalogItems : []) if (item?.kind === 'agreements') agreements.set(key(item.label), [...(agreements.get(key(item.label)) ?? []), String(item.code)]);
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'active' || key(row.sector)) continue;
    const match = agreements.get(key(row.agreement));
    if (match?.length === 1 && wanted.has(match[0])) out.push(String(row.legajo));
  }
  return out.sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : 1));
}

/** Active contracts with repartición inside the given convenios (for «Legajos seleccionados» when «Convenios» cannot be used). */
export function ownRunCoveredContracts(rows, catalogItems, codes) {
  const agreements = new Map(), wanted = new Set((codes ?? []).map(String)), out = [];
  for (const item of Array.isArray(catalogItems) ? catalogItems : []) if (item?.kind === 'agreements') agreements.set(key(item.label), [...(agreements.get(key(item.label)) ?? []), String(item.code)]);
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'active' || !key(row.sector) || typeof row.contractId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.contractId)) continue;
    const match = agreements.get(key(row.agreement));
    if (match?.length === 1 && wanted.has(match[0])) out.push(Object.freeze({ contractId: row.contractId, legajo: String(row.legajo), nombre: typeof row.name === 'string' ? row.name : null, recordOrigin: 'MUNICONTROL' }));
  }
  return out.sort((a, b) => Number(a.legajo) - Number(b.legajo) || (a.legajo < b.legajo ? -1 : 1));
}

export function ownRunCoverageText(coverage) {
  if (!coverage || coverage.complete || !coverage.missing.length) return '';
  const when = monthLabel(coverage.period);
  const today = coverage.programAgreements.length
    ? 'Hoy el programa aprobado tiene reglas de haberes para ' + coverage.programAgreements.map(a => 'convenio ' + a.code + ' (' + a.validity.join(', ') + ')').join(', ') + '.'
    : 'Hoy el programa aprobado no tiene reglas de haberes.';
  return `El programa de liquidación no tiene reglas de haberes para ${when} en ${coverage.missing.length} ${coverage.missing.length === 1 ? 'convenio' : 'convenios'} del alcance (${coverage.missingPeople} ${coverage.missingPeople === 1 ? 'persona' : 'personas'}). ${today} El cálculo se detendría sin resultado: completá el programa en Reglas de cálculo o elegí sólo convenios cubiertos.`;
}

const validityLabel = v => String(v).split('…').map(p => /^\d{4}-\d{2}$/.test(p) ? monthLabel(p) : p).join(' a ');
const inForceAt = (x, period) => !!x && typeof x.validFrom === 'string' && x.validFrom <= period && (x.validUntil === null || x.validUntil === undefined || x.validUntil >= period);

/** What is still missing to calculate the period, in the order the work happens: salary master, rules in force, approval. */
export function ownRunPeriodReadiness(programData, { period, liquidationType, agreements, history = null }) {
  const definition = programData?.program?.definition ?? null;
  const coverage = ownRunProgramCoverage(definition, { period, liquidationType, agreements });
  const items = Array.isArray(programData?.salaryCatalog?.items) ? programData.salaryCatalog.items.filter(i => i && i.active !== false) : [];
  const scope = (agreements ?? []).map(a => String(a.code));
  const masterFor = new Map();
  for (const item of items) if (inForceAt(item, period)) masterFor.set(String(item.agreementCode), (masterFor.get(String(item.agreementCode)) ?? 0) + 1);
  const withoutMaster = scope.filter(code => !masterFor.get(code));
  // Definitions that the approved rules of these convenios use and that have no version in force for the period.
  const namespaced = definition?.namespaceVersion === 'own-payroll-namespaces.v2';
  const have = new Set(items.filter(i => inForceAt(i, period)).map(i => i.kind + ':' + i.agreementCode + ':' + i.code));
  const missingDefinitions = new Map();
  for (const rule of Array.isArray(definition?.rules) ? definition.rules : []) {
    if (!scope.includes(String(rule.agreementCode))) continue;
    const kind = namespaced && rule.nature === 'auxiliary' ? 'auxiliary' : 'concept', id = kind + ':' + rule.agreementCode + ':' + rule.code;
    if (!have.has(id)) missingDefinitions.set(id, { kind, agreementCode: String(rule.agreementCode), code: String(rule.code) });
  }
  const proposals = Array.isArray(programData?.proposals) ? programData.proposals : [];
  const pending = proposals.filter(p => p?.status === 'pending');
  const forPeriod = pending.filter(p => (Array.isArray(p?.definition?.rules) ? p.definition.rules : []).some(r => PAY.has(r.nature) && inForceAt(r, period) && Array.isArray(r.liquidationTypes) && r.liquidationTypes.includes(liquidationType) && scope.includes(String(r.agreementCode))));
  const registered = history && history.period === period && history.after > 0 ? history : null;
  return Object.freeze({
    period, liquidationType, coverage, rulesReady: coverage.complete, ready: coverage.complete && !registered, history: registered,
    master: { scope: scope.length, withMaster: scope.length - withoutMaster.length, withoutMaster, missingDefinitions: [...missingDefinitions.values()] },
    program: { revision: Number(programData?.program?.revision ?? 0), covered: coverage.covered.length, missing: coverage.missing.length, history: coverage.programAgreements },
    approval: { pending: pending.length, forPeriod: forPeriod.length, canPropose: programData?.permissions?.canPropose === true, canReview: programData?.permissions?.canReview === true },
  });
}

/** Plain-language checklist for the Calcular screen. Each step: done | wait | todo, a sentence and where to do it. */
export function ownRunReadinessSteps(r) {
  if (!r) return [];
  const when = monthLabel(r.period), total = r.program.covered + r.program.missing, rules = r.rulesReady ?? r.ready;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const byAgreement = new Map();
  for (const d of r.master.missingDefinitions) byAgreement.set(d.agreementCode, [...(byAgreement.get(d.agreementCode) ?? []), d]);
  const missingText = [...byAgreement].map(([code, list]) => {
    const concepts = list.filter(d => d.kind === 'concept').length, aux = list.length - concepts;
    return 'al convenio ' + code + ' le faltan ' + [concepts ? plural(concepts, 'concepto', 'conceptos') : '', aux ? plural(aux, 'auxiliar', 'auxiliares') : ''].filter(Boolean).join(' y ');
  }).join('; ');
  const masterDone = !r.master.withoutMaster.length && !r.master.missingDefinitions.length;
  const history = r.program.history.length
    ? ' El programa aprobado' + (r.program.revision ? ' (revisión ' + r.program.revision + ')' : '') + ' tiene reglas de ' + r.program.history.map(a => 'convenio ' + a.code + ' para ' + a.validity.map(validityLabel).join(', ')).join('; ') + '.'
    : ' Todavía no hay un programa aprobado.';
  const approvalState = rules ? 'done' : r.approval.forPeriod ? 'wait' : 'todo';
  const h = r.history, day = d => d.split('-').reverse().join('/');
  const steps = [
    { key: 'master', state: masterDone ? 'done' : 'todo', title: 'Maestro salarial de ' + when,
      text: masterDone ? 'Tiene valores vigentes para ' + plural(r.master.scope, 'convenio', 'convenios') + ' del alcance.'
        : 'Tiene valores vigentes para ' + r.master.withMaster + ' de ' + plural(r.master.scope, 'convenio', 'convenios') + ' del alcance.' + (missingText ? ' Además, ' + missingText + ' con versión de ' + when + '.' : ''),
      href: '/nomina#parametros', action: 'Abrir Parámetros' },
    { key: 'program', state: rules ? 'done' : 'todo', title: 'Reglas de cálculo vigentes para ' + when,
      text: (r.program.covered ? r.program.covered + ' de ' + plural(total, 'convenio tiene', 'convenios tienen') + ' reglas vigentes.' : (total === 1 ? 'El convenio del alcance no tiene' : 'Ningún convenio del alcance tiene') + ' reglas vigentes.') + (rules ? '' : history),
      href: '/nomina#reglas', action: 'Abrir Reglas de cálculo' },
    { key: 'approval', state: approvalState, title: 'Aprobación de la versión de ' + when,
      text: rules ? 'La versión vigente está aprobada.'
        : r.approval.forPeriod ? plural(r.approval.forPeriod, 'versión espera', 'versiones esperan') + ' aprobación. La revisa otra persona con permiso de aprobar' + (r.approval.canReview ? '; tu cuenta puede revisarla.' : '.')
        : 'Todavía no hay una versión propuesta para ' + when + '. La prepara una persona con permiso de preparar y la aprueba otra distinta.',
      href: '/nomina#reglas', action: r.approval.forPeriod ? 'Ver propuestas' : 'Ir a Reglas de cálculo' },
  ];
  // A month before the legajos were registered in MuniControl: the current encuadre is not applied backwards.
  if (h) steps.push({ key: 'history', state: 'todo', title: 'Encuadre de ' + when,
    text: (h.after === h.inScope ? (h.after === 1 ? 'El legajo del alcance se registró' : 'Los ' + h.after + ' legajos del alcance se registraron') : plural(h.after, 'legajo', 'legajos') + ' de ' + h.inScope + (h.after === 1 ? ' se registró' : ' se registraron'))
      + ' en MuniControl ' + (h.first === h.last ? 'el ' + day(h.first) : 'entre el ' + day(h.first) + ' y el ' + day(h.last)) + ', después de ' + when + '. '
      + 'Para un mes anterior al alta, el sistema no usa el encuadre actual: cada legajo necesita su encuadre de ' + when + ' aprobado por otra persona.'
      + (h.firstPeriod ? ' Con el encuadre actual se calcula desde ' + monthLabel(h.firstPeriod) + '.' : ''),
    href: '/nomina#encuadre', action: 'Abrir Encuadre por período' });
  steps.push({ key: 'calculate', state: r.ready ? 'done' : 'todo', title: 'Calcular',
    text: r.ready ? 'Todo listo: elegí el alcance y calculá.'
      : h && h.firstPeriod && rules ? 'El cálculo de ' + when + ' se detendría hasta que ese encuadre esté aprobado. Para calcular ya, elegí ' + monthLabel(h.firstPeriod) + ' o un mes posterior.'
      : 'Se habilita cuando los pasos anteriores estén listos. Mientras tanto podés preparar el alcance; nada se guarda hasta calcular.' });
  return steps;
}

/** Heading of the readiness box. */
export function ownRunReadinessTitle(r) {
  if (!r) return '';
  const when = monthLabel(r.period), total = r.program.covered + r.program.missing;
  const cap = when.charAt(0).toUpperCase() + when.slice(1);
  if (r.ready) return cap + ': listo para calcular';
  if (r.history && (r.rulesReady ?? false)) return cap + ' todavía no se puede calcular';
  return r.program.covered ? cap + ': ' + r.program.covered + ' de ' + total + ' convenios listos para calcular' : cap + ' todavía no se puede calcular';
}
