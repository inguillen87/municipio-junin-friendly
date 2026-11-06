// Calcular: which convenios of the chosen population have pay rules in the approved programme for the period and type.
// The engine stops the whole result (PAY_RULE_MISSING) when one selected contract's convenio has no remuneration rule,
// so the screen says it before calculating. Pure: no requests, no DOM.
const key = value => String(value ?? '').trim().toUpperCase();
const PAY = new Set(['remuneration', 'non_remuneration']);
const monthLabel = period => { const [y, m] = String(period).split('-'); const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return names[Number(m) - 1] ? names[Number(m) - 1] + ' ' + y : String(period); };

/** People per convenio code in the selected scope (labels matched exactly against the catalog). */
export function ownRunScopeAgreements(rows, catalogItems, { kind = 'all', values = [] } = {}) {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  const agreements = new Map(), sectors = new Map();
  for (const item of items) {
    if (item?.kind === 'agreements') agreements.set(key(item.label), [...(agreements.get(key(item.label)) ?? []), item]);
    if (item?.kind === 'sectors') sectors.set(key(item.label), [...(sectors.get(key(item.label)) ?? []), item.code]);
  }
  const chosen = new Set(values);
  const out = new Map(); let unmatched = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'active') continue;
    if (kind === 'contracts' && !chosen.has(row.contractId)) continue;
    if (kind === 'departments') { const codes = sectors.get(key(row.sector)); if (codes?.length !== 1 || !chosen.has(codes[0])) continue; }
    const match = agreements.get(key(row.agreement));
    if (match?.length !== 1) { unmatched++; continue; }
    const { code, label } = match[0];
    if (kind === 'agreements' && !chosen.has(code)) continue;
    const entry = out.get(code) ?? { code, label, people: 0 };
    entry.people++; out.set(code, entry);
  }
  return { agreements: [...out.values()].sort((a, b) => Number(a.code) - Number(b.code)), unmatched };
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

export function ownRunCoverageText(coverage) {
  if (!coverage || coverage.complete || !coverage.missing.length) return '';
  const when = monthLabel(coverage.period);
  const today = coverage.programAgreements.length
    ? 'Hoy el programa aprobado tiene reglas de haberes para ' + coverage.programAgreements.map(a => 'convenio ' + a.code + ' (' + a.validity.join(', ') + ')').join(', ') + '.'
    : 'Hoy el programa aprobado no tiene reglas de haberes.';
  return `El programa de liquidación no tiene reglas de haberes para ${when} en ${coverage.missing.length} ${coverage.missing.length === 1 ? 'convenio' : 'convenios'} del alcance (${coverage.missingPeople} ${coverage.missingPeople === 1 ? 'persona' : 'personas'}). ${today} El cálculo se detendría sin resultado: completá el programa en Reglas de cálculo o elegí sólo convenios cubiertos.`;
}
