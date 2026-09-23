/** Synthetic result of the single-statement directory query; never a DB fixture. */
export function directoryQueryRows({ rows = [], total = rows.length, scope = {}, sectors = [], organizations = [], agreements = [] } = {}) {
  return (rows.length ? rows : [{ contractId: null }]).map((row, index) => ({
    __total: total, __scope: scope,
    __sourceCutoffFrom: scope.sourceCutoffFrom ?? null,
    __sourceCutoffTo: scope.sourceCutoffTo ?? null,
    __sectors: sectors, __organizations: organizations, __agreements: agreements,
    __pageOrder: rows.length ? String(index + 1) : null, ...row,
  }));
}
