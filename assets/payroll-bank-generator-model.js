import { civilDate } from './civil-date.js';

export const BANK_REPORT_VERSION = 'payroll-bank-report.v1';
export const bankNames = Object.freeze({ credicoop: 'Credicoop', santander: 'Santander', nacion: 'Nación' });
export const accountNames = Object.freeze({ caja_ahorro: 'Caja de ahorro', cuenta_corriente: 'Cuenta corriente' });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const decimal = /^-?(?:0|[1-9]\d{0,21})\.\d{2}$/;
const issueNames = {
  ACCOUNT_TYPE_UNVERIFIED: 'Tipo de cuenta sin verificar', BANK_SOURCE_UNAVAILABLE: 'Fuente bancaria no disponible',
  ACCOUNT_NUMBER_INVALID: 'Cuenta con formato inválido',
  BANK_UNMAPPED: 'Banco sin correspondencia verificada', CBU_CONFLICT: 'Más de un CBU en la fuente', IDENTITY_MISSING: 'Identidad incompleta', JURISDICTION_UNAVAILABLE: 'Jurisdicción no disponible para esta liquidación',
  BANK_MISSING: 'Banco no informado', BANK_UNKNOWN: 'Banco sin identificar', ACCOUNT_NUMBER_MISSING: 'Cuenta no informada',
  CBU_MISSING: 'CBU no informado', CBU_INVALID: 'CBU inválido', CUIL_MISSING: 'CUIL no informado', CUIL_INVALID: 'CUIL inválido',
  JURISDICTION_MISSING: 'Jurisdicción no informada para esta liquidación', NET_AMOUNT_MISSING: 'Neto no informado',
};
const fail = () => { throw Error('La respuesta bancaria no cumple el contrato de consulta. No se habilitaron descargas.'); };
function text(value, nullable = false, max = 300) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail();
  return value;
}
function dataset(value) {
  if (!value || !uuid.test(value.datasetId) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.period) || !hash.test(value.sourceSha256)) fail();
  civilDate(value.date);
  return { datasetId: value.datasetId, period: value.period, date: value.date, type: text(value.type, false, 80), sourceLabel: text(value.sourceLabel), sourceSha256: value.sourceSha256, ...(value.payloadHash ? { payloadHash: value.payloadHash } : {}), ...(Number.isSafeInteger(value.statementCount) ? { statementCount: value.statementCount } : {}) };
}
export function bankReportData(payload, expected = {}) {
  const data = payload?.data;
  if (payload?.ok !== true || !data || data.version !== BANK_REPORT_VERSION || !['catalog', 'report'].includes(data.mode)
    || expected.resource && data.mode !== expected.resource) fail();
  if (data.mode === 'catalog') {
    if (!Array.isArray(data.items) || data.items.length > 240) fail();
    const items = data.items.map(item => {
      const row = dataset(item);
      if (!Number.isSafeInteger(item.statementCount) || item.statementCount < 0 || typeof item.bankSourceAvailable !== 'boolean') fail();
      return Object.freeze({ ...row, statementCount: item.statementCount, bankSourceAvailable: item.bankSourceAvailable });
    });
    if (new Set(items.map(item => item.datasetId)).size !== items.length) fail();
    return Object.freeze({ version: BANK_REPORT_VERSION, mode: 'catalog', items: Object.freeze(items) });
  }
  const source = dataset(data.dataset);
  if (expected.datasetId && source.datasetId !== expected.datasetId || !hash.test(data.reportHash)
    || !hash.test(source.payloadHash) || !Array.isArray(data.rows) || data.rows.length > 5000 || source.statementCount !== data.rows.length || !data.scope
    || data.scope.official !== false || data.scope.payrollPosted !== false || data.scope.bankTransferGenerated !== false) fail();
  if (!data.bankSource || !hash.test(data.bankSource.sourceSha256) || !hash.test(data.bankSource.payloadSha256) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(data.bankSource.cutoff)) fail();
  if (data.bankSource.sourceSha256 !== source.sourceSha256) fail();
  civilDate(data.bankSource.cutoff.slice(0, 10));
  const rows = data.rows.map(value => {
    if (!value || !Array.isArray(value.issues) || value.issues.length > 40 || value.netAmount !== null && (typeof value.netAmount !== 'string' || !decimal.test(value.netAmount) || value.netAmount === '-0.00')) fail();
    const row = {};
    for (const key of ['legajo', 'name', 'cuil', 'bankCode', 'bankLabel', 'accountTypeCode', 'accountNumber', 'cbu', 'jurisdiction', 'repartitionCode', 'repartitionLabel']) row[key] = text(value[key], true);
    if (value.bankKey !== null && !Object.hasOwn(bankNames, value.bankKey) || value.accountType !== null && !Object.hasOwn(accountNames, value.accountType)) fail();
    return Object.freeze({ ...row, bankKey: value.bankKey, accountType: value.accountType, netAmount: value.netAmount, issues: Object.freeze(value.issues.map(issue => text(issue, false, 200))) });
  });
  if (rows.some(row => !row.legajo) || new Set(rows.map(row => row.legajo)).size !== rows.length) fail();
  return Object.freeze({ version: BANK_REPORT_VERSION, mode: 'report', dataset: Object.freeze(source), bankSource: data.bankSource ? Object.freeze({ ...data.bankSource }) : null,
    rows: Object.freeze(rows), reportHash: data.reportHash, scope: Object.freeze({ official: false, payrollPosted: false, bankTransferGenerated: false }) });
}
export function bankObservations(row) {
  const issues = [...row.issues];
  const missing = [['cuil', 'CUIL_MISSING'], ['bankCode', 'BANK_MISSING'], ['accountNumber', 'ACCOUNT_NUMBER_MISSING'], ['cbu', 'CBU_MISSING'], ['jurisdiction', 'JURISDICTION_MISSING'], ['netAmount', 'NET_AMOUNT_MISSING']];
  for (const [key, code] of missing) if ((row[key] === null || row[key] === '')
    && !(key === 'accountNumber' && issues.includes('ACCOUNT_NUMBER_INVALID'))
    && !(key === 'cbu' && issues.some(issue => ['CBU_INVALID', 'CBU_CONFLICT'].includes(issue)))
    && !(key === 'jurisdiction' && issues.includes('JURISDICTION_UNAVAILABLE'))) issues.push(code);
  if (row.accountType === null) issues.push('ACCOUNT_TYPE_UNVERIFIED');
  return [...new Set(issues)].map(code => issueNames[code] || code).join(' · ') || 'Sin observaciones informadas';
}
export function bankHasIssues(row) { return bankObservations(row) !== 'Sin observaciones informadas'; }
export function bankAccountLabel(row) { return (accountNames[row.accountType] || 'Tipo sin verificar') + (row.accountTypeCode ? ' · código ' + row.accountTypeCode : ''); }
export function bankMoney(value) {
  if (value === null) return 'No informado';
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,25})\.\d{2}$/.test(value)) fail();
  const [whole, fraction] = value.split('.'), negative = whole.startsWith('-');
  return '$ ' + (negative ? '−' : '') + (negative ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction;
}
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function bankReportFilter(data, input = {}) {
  if (data?.mode !== 'report') fail();
  const filters = { bank: input.bank || 'all', jurisdiction: input.jurisdiction || 'all', account: input.account || 'all', search: String(input.search || '').trim().slice(0, 100), issues: input.issues || 'all' };
  if (!['all', 'unknown', ...Object.keys(bankNames)].includes(filters.bank) || !['all', 'unknown', ...Object.keys(accountNames)].includes(filters.account)
    || !['all', 'observed', 'informed'].includes(filters.issues) || ['santander', 'nacion'].includes(filters.bank) && filters.account === 'cuenta_corriente') fail();
  const rows = data.rows.filter(row => {
    if (filters.bank !== 'all' && (filters.bank === 'unknown' ? row.bankKey !== null : row.bankKey !== filters.bank)) return false;
    if (filters.jurisdiction !== 'all' && (filters.jurisdiction === 'unknown' ? row.jurisdiction !== null : row.jurisdiction !== filters.jurisdiction)) return false;
    if (filters.account !== 'all' && (filters.account === 'unknown' ? row.accountType !== null : row.accountType !== filters.account)) return false;
    if (filters.issues === 'observed' && !bankHasIssues(row) || filters.issues === 'informed' && bankHasIssues(row)) return false;
    return !filters.search || fold([row.legajo, row.name, row.cuil, row.repartitionCode, row.repartitionLabel].join(' ')).includes(fold(filters.search));
  });
  let cents = 0n;
  for (const row of rows) if (row.netAmount !== null) cents += BigInt(row.netAmount.replace('.', ''));
  const negative = cents < 0n, absolute = (negative ? -cents : cents).toString().padStart(3, '0');
  const total = (negative ? '-' : '') + absolute.slice(0, -2) + '.' + absolute.slice(-2);
  return Object.freeze({ rows: Object.freeze(rows), filters: Object.freeze(filters), missingAmounts: rows.filter(row => row.netAmount === null).length,
    observed: rows.filter(bankHasIssues).length, total: rows.some(row => row.netAmount === null) ? null : total, knownTotal: total });
}
export function bankReportRevision(data) { return JSON.stringify([data.dataset, data.bankSource, data.reportHash]); }
