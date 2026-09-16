// Operates only on the authorized, normalized rule catalogue; never employee data.
export const LEAVE_RULE_FILTERS = Object.freeze([
  { id: 'all', label: 'Todas las reglas' },
  { id: 'calculable', label: 'Calculables' },
  { id: 'conditional', label: 'Requieren validación' },
  { id: 'not_calculable', label: 'No calculables' },
]);
export function normalizeRuleSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function filterLeaveRules(rules, { query = '', category = 'all' } = {}) {
  const terms = normalizeRuleSearch(query).split(' ').filter(Boolean);
  return rules.filter(rule => (category === 'all' || rule.category === category) && terms.every(term =>
    normalizeRuleSearch([rule.code, rule.label, rule.summary, rule.basis, rule.unit,
      ...(rule.conditions || []), ...(rule.limitations || [])].join(' ')).includes(term)));
}
export function leaveRuleCounts(rules, query = '') {
  const matching = filterLeaveRules(rules, { query });
  return Object.fromEntries(LEAVE_RULE_FILTERS.map(({ id }) => [id,
    id === 'all' ? matching.length : matching.filter(rule => rule.category === id).length]));
}
export function leaveRuleLabel(category) {
  return LEAVE_RULE_FILTERS.find(filter => filter.id === category && filter.id !== 'all')?.label || 'Requieren validación';
}
