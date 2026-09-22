// Offline coverage only: no connection, environment, SQL execution or publication.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GRH_CONSUMER_RELATIONS = Object.freeze([
  'payroll_run', 'payroll_monthly_fact', 'payroll_snapshot_assignment',
  'employment_movement', 'employment_status_snapshot',
  'vw_empleado_actual', 'vw_dotacion_mensual', 'vw_nomina_totales',
  'vw_liquidacion_mensual', 'vw_dotacion_cierre_mensual', 'vw_payroll_snapshot_actual',
  'vw_movimientos_legajo', 'vw_estructura_actual', 'vw_employment_status_control',
]);

// Counts describe direct FROM/JOIN sites, not rows or a claim of SQL execution.
// Historical migrations stay in this inventory when a later migration replaces
// their functions. A covered reference can still require adaptation (see docs).
export const GRH_PUBLICATION_CONSUMERS = Object.freeze([
  ['api/internal-data.js','integrationQuality',{vw_empleado_actual:2},'current_cohort'],
  ['api/internal-data.js','payrollControl',{vw_liquidacion_mensual:1,vw_nomina_totales:2},'effective_history'],
  ['api/internal-data.js','managementAnalytics',{payroll_monthly_fact:2,payroll_run:4,employment_movement:2},'effective_history'],
  ['api/internal-data.js','directoryBaseSql',{vw_empleado_actual:1,employment_status_snapshot:1,payroll_snapshot_assignment:1},'current_cohort'],
  ['api/internal-data.js','employee',{vw_empleado_actual:1,employment_status_snapshot:1,payroll_run:1,payroll_snapshot_assignment:1,employment_movement:2},'current_and_history'],
  ['lib/workforce-operational-scope.js','operationalDirectorySql',{payroll_run:2,payroll_monthly_fact:1},'effective_history'],
  ['scripts/migrations/002-canonical-integration.sql','validate_payroll_run_link',{payroll_run:1},'preserve_real_run_identity'],
  ['scripts/migrations/002-canonical-integration.sql','vw_empleado_actual',{employment_status_snapshot:1,payroll_run:1},'current_cohort'],
  ['scripts/migrations/002-canonical-integration.sql','vw_dotacion_mensual',{employment_status_snapshot:1},'current_and_history'],
  ['scripts/migrations/002-canonical-integration.sql','vw_nomina_totales',{payroll_run:1,payroll_monthly_fact:1},'effective_history'],
  ['scripts/migrations/002-canonical-integration.sql','vw_liquidacion_mensual',{payroll_run:1,payroll_monthly_fact:1},'effective_history'],
  ['scripts/migrations/002-canonical-integration.sql','vw_dotacion_cierre_mensual',{payroll_run:1,payroll_monthly_fact:1},'effective_history'],
  ['scripts/migrations/002-canonical-integration.sql','vw_payroll_snapshot_actual',{payroll_snapshot_assignment:2,payroll_run:1},'current_cohort'],
  ['scripts/migrations/002-canonical-integration.sql','vw_movimientos_legajo',{employment_movement:1},'effective_history'],
  ['scripts/migrations/002-canonical-integration.sql','vw_estructura_actual',{employment_status_snapshot:1},'current_cohort'],
  ['scripts/migrations/002-canonical-integration.sql','vw_employment_status_control',{employment_status_snapshot:2,payroll_run:1},'current_cohort'],
  ['scripts/migrations/026-governed-payroll-novelties.sql','payroll_novelty_prepare_v1',{employment_movement:5},'movement_preflight'],
  ['scripts/migrations/031-governed-employee-payroll-history.sql','employee_payroll_history_v1',{payroll_monthly_fact:1,payroll_run:1},'effective_history'],
  ['scripts/migrations/032-payroll-type-mapping-fail-closed.sql','DO $upgrade$',{employment_movement:1},'movement_preflight'],
  ['scripts/migrations/035-governed-payroll-reprocessing.sql','payroll_reprocessing_snapshot_v1',{payroll_run:1},'preserve_real_run_identity'],
  ['scripts/migrations/035-governed-payroll-reprocessing.sql','payroll_reprocessing_prepare_v1',{payroll_run:1},'preserve_real_run_identity'],
  ['scripts/migrations/048-payroll-detail-source.sql','employee_payroll_detail_v1',{payroll_monthly_fact:1,payroll_run:1},'independent_detail_comparison'],
  ['scripts/migrations/051-payroll-document-library.sql','employee_payroll_documents_v1',{payroll_monthly_fact:1,payroll_run:1},'independent_detail_comparison'],
  ['scripts/migrations/057-family-schooling-certificates.sql','school_certificate_current_family_v1',{employment_status_snapshot:1},'current_cohort'],
  ['scripts/migrations/061-grh-core-source-version.sql','grh_core_source_base_rows_v1',{payroll_run:2,payroll_monthly_fact:1,employment_movement:1,payroll_snapshot_assignment:1,employment_status_snapshot:1},'preserve_immutable_baseline'],
  ['scripts/migrations/064-employee-family-members.sql','school_certificate_current_family_v2',{employment_status_snapshot:1},'current_cohort'],
  ['scripts/migrations/096-grh-effective-source.sql','grh_effective_source_guard_v1',{payroll_run:3,payroll_monthly_fact:1,employment_movement:1},'publication_validation'],
  ['scripts/migrations/096-grh-effective-source.sql','grh_effective_payroll_run_v1',{payroll_run:1},'preserve_real_run_identity'],
  ['scripts/migrations/096-grh-effective-source.sql','grh_effective_payroll_monthly_fact_v1',{payroll_monthly_fact:1,payroll_run:2},'effective_history'],
  ['scripts/migrations/096-grh-effective-source.sql','grh_effective_employment_movement_v1',{employment_movement:2},'effective_history'],
  ['scripts/migrations/097-grh-effective-consumers.sql','DO $patch_1$',{payroll_run:1},'patch_historical_definition'],
  ['scripts/migrations/097-grh-effective-consumers.sql','DO $patch_2$',{payroll_run:1},'patch_historical_definition'],
  ['scripts/migrations/097-grh-effective-consumers.sql','DO $patch_3$',{payroll_run:1},'patch_historical_definition'],
  ['scripts/migrations/097-grh-effective-consumers.sql','vw_empleado_actual',{employment_status_snapshot:1},'current_cohort'],
  ['scripts/migrations/097-grh-effective-consumers.sql','vw_payroll_snapshot_actual',{payroll_snapshot_assignment:2},'current_cohort'],
  ['scripts/migrations/097-grh-effective-consumers.sql','vw_estructura_actual',{employment_status_snapshot:1},'current_cohort'],
  ['scripts/migrations/097-grh-effective-consumers.sql','vw_employment_status_control',{employment_status_snapshot:2},'current_cohort'],
].map(([file,symbol,relations,disposition]) => Object.freeze({file,symbol,relations:Object.freeze(relations),disposition})));

const error = (code, details) => Object.assign(new Error(code), { code, details });
const canonicalPath = value => value.replaceAll('\\', '/');
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Preserve offsets/newlines while removing comments, including nested SQL blocks.
 * SQL inside JS strings/templates remains visible deliberately. This is a lexical
 * inventory, not a SQL/JS parser: dynamically assembled relation names need QA.
 */
export function maskConsumerComments(source, javascript = false) {
  let result = '', index = 0, quote = null;
  while (index < source.length) {
    const character = source[index];
    if (quote && quote !== '`') {
      result += character; index++;
      if (character === '\\' && javascript && index < source.length) result += source[index++];
      else if (character === quote) {
        if (source[index] === quote) result += source[index++];
        else quote = null;
      }
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 1; result += '  '; index += 2;
      while (index < source.length && depth) {
        if (source.startsWith('/*', index)) { depth++; result += '  '; index += 2; }
        else if (source.startsWith('*/', index)) { depth--; result += '  '; index += 2; }
        else result += source[index++] === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (source.startsWith('--', index) || (javascript && !quote && source.startsWith('//', index))) {
      while (index < source.length && source[index] !== '\n') { result += ' '; index++; }
      continue;
    }
    if (character === '`' && javascript) quote = quote === '`' ? null : '`';
    else if (!quote && (character === "'" || character === '"')) quote = character;
    result += character; index++;
  }
  return result;
}

function declarations(source, javascript) {
  const pattern = javascript
    ? /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/gm
    : /^\s*(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|VIEW)\s+(?:public\.)?"?([a-z_][a-z_0-9]*)"?|DO\s+(\$[a-z_0-9]*\$))/gim;
  return [...source.matchAll(pattern)].map(match => ({ index: match.index, symbol: match[1] || `DO ${match[2]}` }));
}

export function findGrhConsumerReferences(file, source) {
  if (typeof file !== 'string' || typeof source !== 'string') throw error('GRH_CONSUMER_INPUT_INVALID');
  const normalized = canonicalPath(file), javascript = /\.[cm]?js$/.test(normalized);
  const masked = maskConsumerComments(source, javascript), symbols = declarations(masked, javascript);
  const relations = GRH_CONSUMER_RELATIONS.map(escapeRegExp).join('|');
  const pattern = new RegExp(`\\b(?:FROM|JOIN)\\s+(?:ONLY\\s+)?(?:(?:"public"|public)\\s*\\.\\s*)?"?(${relations})"?(?![a-z_0-9])`, 'gi');
  return [...masked.matchAll(pattern)].map(match => {
    const symbol = symbols.findLast(item => item.index <= match.index)?.symbol || '<module>';
    return { file: normalized, symbol, relation: match[1].toLowerCase(), line: source.slice(0, match.index).split('\n').length };
  });
}

export function auditGrhPublicationConsumers(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw error('GRH_CONSUMER_INPUT_INVALID');
  const references = Object.entries(files).flatMap(([file, source]) => findGrhConsumerReferences(file, source));
  const known = new Map(GRH_PUBLICATION_CONSUMERS.map(item => [`${item.file}#${item.symbol}`, item]));
  const observed = new Map();
  for (const reference of references) {
    const key = `${reference.file}#${reference.symbol}`;
    if (!observed.has(key)) observed.set(key, { file: reference.file, symbol: reference.symbol, relations: {}, lines: [] });
    const item = observed.get(key); item.relations[reference.relation] = (item.relations[reference.relation] || 0) + 1;
    item.lines.push(reference.line);
  }
  const findings = [];
  for (const [key, item] of observed) {
    const expected = known.get(key);
    if (!expected) findings.push({ code: 'GRH_CONSUMER_UNCATALOGUED', ...item });
    else for (const [relation, count] of Object.entries(item.relations)) {
      if (count > (expected.relations[relation] || 0)) findings.push({ code: 'GRH_CONSUMER_NEW_DIRECT_REFERENCE', file: item.file, symbol: item.symbol, relation, observed: count, catalogued: expected.relations[relation] || 0 });
    }
  }
  const supplied = new Set(Object.keys(files).map(canonicalPath));
  for (const file of new Set(GRH_PUBLICATION_CONSUMERS.map(item => item.file))) {
    if (!supplied.has(file)) findings.push({ code: 'GRH_CONSUMER_FILE_MISSING', file });
  }
  return {
    version: 'grh-publication-consumers.v1', coverageComplete: findings.length === 0,
    // Covering old references is not adapting them, nor proving an installed DB.
    publicationReady: false, databaseChecked: false, findings,
    consumers: [...observed.values()].map(item => ({ ...item,
      disposition: known.get(`${item.file}#${item.symbol}`)?.disposition || 'unclassified',
      evidenceKind: item.file.startsWith('scripts/migrations/') ? 'historical_sql_definition' : 'runtime_source',
    })),
    limitations: ['lexical_sql_references_only', 'historical_migrations_not_installed_bodies', 'dynamic_sql_requires_postgres_tests'],
  };
}

export function assertGrhConsumerCoverage(report) {
  if (report?.version !== 'grh-publication-consumers.v1' || report.coverageComplete !== true || !Array.isArray(report.findings) || report.findings.length) {
    throw error('GRH_CONSUMER_COVERAGE_INCOMPLETE', report?.findings);
  }
  return report;
}

const UUID = /^(?!00000000-0000-0000-0000-000000000000$)[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const SELECTION_KEYS = ['version','tenantId','sourceBindingId','sourceDatabase','companyId','baselineBatchId','sourceVersionId','revision','sourceSha256','sourceDeclaredCutoff','sourcePayrollDate'];
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2100-12-31'
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}
function validSelection(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === SELECTION_KEYS.length && SELECTION_KEYS.every(key => Object.hasOwn(value,key))
    && value.version === 'grh-source-selection.v1'
    && ['tenantId','sourceBindingId','baselineBatchId','sourceVersionId'].every(key => typeof value[key] === 'string' && UUID.test(value[key]))
    && typeof value.sourceDatabase === 'string' && /^[A-Za-z0-9_]{1,120}$/.test(value.sourceDatabase)
    && Number.isSafeInteger(value.companyId) && value.companyId > 0 && ['baseline','candidate'].includes(value.revision)
    && typeof value.sourceSha256 === 'string' && HASH.test(value.sourceSha256)
    && typeof value.sourceDeclaredCutoff === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value.sourceDeclaredCutoff)
    && validDate(value.sourceDeclaredCutoff.slice(0,10)) && validDate(value.sourcePayrollDate);
}

/** The expected selection comes from the authenticated binding + sealed version,
 * never from the same request being validated. This performs no authorization.
 * 061 timestamps have no timezone: do not silently add Z or reinterpret them.
 */
export function assertGrhSourceSelection(selection, expected) {
  if (!validSelection(selection) || !validSelection(expected)) throw error('GRH_SOURCE_SELECTION_INVALID');
  if (SELECTION_KEYS.some(key => selection[key] !== expected[key])) throw error('GRH_SOURCE_SELECTION_MISMATCH');
  return Object.freeze({ ...selection });
}
export function assertGrhComparableSelections(left, right) {
  if (!validSelection(left) || !validSelection(right)) throw error('GRH_SOURCE_SELECTION_INVALID');
  if (['tenantId','sourceBindingId','sourceDatabase','companyId','baselineBatchId','sourceVersionId'].some(key => left[key] !== right[key])
    || left.revision !== 'baseline' || right.revision !== 'candidate'
    || left.sourceDeclaredCutoff >= right.sourceDeclaredCutoff || left.sourceSha256 === right.sourceSha256) throw error('GRH_SOURCE_COMPARISON_MISMATCH');
  return { sourcePairComparable: true, equalPayrollPeriod: left.sourcePayrollDate === right.sourcePayrollDate, payrollClosedCertified: false };
}

export async function readGrhConsumerSources(root) {
  const files = {};
  async function walk(relative) {
    for (const entry of await readdir(path.join(root,relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw error('GRH_CONSUMER_SYMLINK_REJECTED');
      if (entry.isDirectory()) await walk(name);
      else if (/\.(?:js|mjs|sql)$/.test(entry.name)) files[name] = await readFile(path.join(root,name),'utf8');
    }
  }
  for (const directory of ['api','lib','scripts/migrations']) await walk(directory);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(value => value !== '--require-covered')) throw error('GRH_CONSUMER_ARGUMENT_INVALID');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const report = auditGrhPublicationConsumers(await readGrhConsumerSources(root));
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
  if (process.argv.includes('--require-covered') && !report.coverageComplete) process.exitCode = 1;
}
