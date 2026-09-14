#!/usr/bin/env node
/** MC-P02A: private, offline evidence inventory. Never executes SQL or payroll rules. */
import { createReadStream } from 'node:fs';
import { realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCreateTableStatement } from './profile-grh-backup.mjs';
import { analyzeFormula } from '../assets/payroll-formula-linter.js';

export const REQUESTED_AGREEMENTS = Object.freeze(['1', '2', '4', '5', '6', '7', '11', '12', '13', '14']);
export const INVENTORY_LIMITS = Object.freeze({ sourceBytes: 128 * 1024 * 1024, logicalBytes: 1024 * 1024 * 1024, statementChars: 16 * 1024 * 1024, rows: 50000, compressionRatio: 200 });
const POLICIES = Object.freeze({
  codliq: {
    key: ['CODI_02', 'CODI_27'],
    expressions: ['FOVM_27', 'UNIM_27', 'CONM_27', 'FOVJ_27', 'UNIJ_27', 'CONJ_27', 'FOFM_27', 'FOFJ_27', 'FORMULA_PRE', 'FORMULA_POST'],
    metadata: ['CALC_27', 'SEQU_27', 'TIPO_27', 'SUMA_27', 'RELI_27', 'REAJ_27', 'ACTI_27', 'ALCA_27', 'UNID_27', 'RETR_27', 'TOTA_27', 'LIQU_27', 'ACU1_27', 'ACU2_27', 'VALI_27', 'INDE_27', 'CLASS_M', 'CLASS_J'],
  },
  auxical: {
    key: ['CODI_01', 'CODI_02', 'ITEM_77'],
    expressions: ['ALGV_77', 'ALGF_77', 'COND_77', 'NPIF_77', 'NPIV_77', 'CNPI_77'],
    metadata: ['QINI_77', 'QUIN_77', 'CODI_76', 'NULO_77', 'CLAS_77', 'VALO_77', 'METO_77', 'ALCA_77', 'CLASS_A'],
  },
  concepto: { key: ['CODI_27'], expressions: [], metadata: ['TIPO_15', 'UNID_15', 'TOTA_15', 'TIPO'] },
  calauxi: { key: ['CODI_01', 'ITEM_77'], expressions: [], metadata: [] },
});
const sha = (value) => createHash('sha256').update(value).digest('hex');
function fail(code) { throw new Error(code); }
function pick(row, fields) { return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]])); }

/** Small streaming statement scanner. Unselected table values are never retained. */
export class InventoryScanner {
  constructor(onStatement, limits = INVENTORY_LIMITS) {
    this.onStatement = onStatement; this.limits = limits; this.reset();
    this.quote = null; this.escaped = false; this.comment = null; this.pending = '';
  }
  reset() { this.buffer = ''; this.keep = null; this.hasContent = false; }
  append(character) {
    if (!this.hasContent && /\s/.test(character)) return;
    this.hasContent = true;
    if (this.keep === false) return;
    this.buffer += character;
    if (this.keep === null) {
      const match = /^(CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INSERT\s+INTO)\s+`([A-Za-z0-9_]+)`/i.exec(this.buffer);
      if (match) this.keep = Object.hasOwn(POLICIES, match[2]);
      else if (this.buffer.length > 256) this.keep = false;
      if (this.keep === false) this.buffer = '';
    }
    if (this.buffer.length > this.limits.statementChars) fail('FORMULA_STATEMENT_LIMIT');
  }
  feed(chunk, final = false) {
    const text = this.pending + chunk;
    const end = final ? text.length : Math.max(0, text.length - 2);
    let i = 0;
    for (; i < end; i += 1) {
      const c = text[i], next = text[i + 1];
      if (this.comment === 'line') { if (c === '\n') this.comment = null; continue; }
      if (this.comment === 'block') { if (c === '*' && next === '/') { this.comment = null; i += 1; } continue; }
      if (this.quote) {
        this.append(c);
        if (this.escaped) this.escaped = false;
        else if (c === '\\' && this.quote !== '`') this.escaped = true;
        else if (c === this.quote) this.quote = null;
        continue;
      }
      if (c === '#' || (c === '-' && next === '-' && /\s/.test(text[i + 2] || ''))) { this.comment = 'line'; continue; }
      if (c === '/' && next === '*') { this.comment = 'block'; this.append(' '); i += 1; continue; }
      if (c === "'" || c === '"' || c === '`') this.quote = c;
      if (c === ';') {
        if (this.keep) this.onStatement(this.buffer);
        this.reset();
      } else this.append(c);
    }
    this.pending = text.slice(i);
    if (final && (this.quote || this.comment === 'block' || this.hasContent)) fail('FORMULA_SQL_TRUNCATED');
  }
}

function decodeLiteral(raw) {
  const value = raw.trim();
  if (value === 'NULL') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value; // Never lose decimal precision.
  if (!value.startsWith("'") || !value.endsWith("'")) fail('FORMULA_SQL_LITERAL_UNSUPPORTED');
  let result = '';
  const escapes = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
  for (let i = 1; i < value.length - 1; i += 1) {
    const c = value[i];
    if (c === '\\') {
      const escaped = value[++i];
      if (i >= value.length - 1) fail('FORMULA_SQL_STRING_TRUNCATED');
      result += escapes[escaped] ?? ((escaped === '%' || escaped === '_') ? `\\${escaped}` : escaped);
    } else if (c === "'") {
      if (value[i + 1] !== "'") fail('FORMULA_SQL_STRING_INVALID');
      result += "'"; i += 1;
    } else result += c;
  }
  return result;
}

export function parseInsertRows(statement, columns, onRow) {
  const header = /^INSERT\s+INTO\s+`([A-Za-z0-9_]+)`\s*(\([^)]*\))?\s+VALUES\s*/i.exec(statement);
  if (!header) fail('FORMULA_INSERT_UNSUPPORTED');
  let ordered = columns;
  if (header[2]) {
    if (!/^\(\s*`[A-Za-z0-9_]+`(?:\s*,\s*`[A-Za-z0-9_]+`)*\s*\)$/.test(header[2])) fail('FORMULA_INSERT_COLUMNS_INVALID');
    ordered = [...header[2].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (new Set(ordered).size !== ordered.length || ordered.some((name) => !columns.includes(name))) fail('FORMULA_INSERT_COLUMNS_INVALID');
  }
  let i = header[0].length;
  const skip = () => { while (/\s/.test(statement[i] || '') && i < statement.length) i += 1; };
  while (i < statement.length) {
    skip(); if (statement[i++] !== '(') fail('FORMULA_ROW_INVALID');
    const values = []; let start = i, quote = false, escaped = false, closed = false;
    for (; i < statement.length; i += 1) {
      const c = statement[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === "'") { if (statement[i + 1] === "'") i += 1; else quote = false; }
      } else if (c === "'") quote = true;
      else if (c === ',' || c === ')') {
        values.push(decodeLiteral(statement.slice(start, i))); start = i + 1;
        if (c === ')') { i += 1; closed = true; break; }
      } else if (c === '(') fail('FORMULA_SQL_EXPRESSION_NOT_ALLOWED');
    }
    if (!closed || quote) fail('FORMULA_ROW_TRUNCATED');
    if (values.length !== ordered.length) fail('FORMULA_COLUMN_COUNT_MISMATCH');
    onRow(Object.fromEntries(ordered.map((column, index) => [column, values[index]])));
    skip(); if (i === statement.length) break;
    if (statement[i++] !== ',') fail('FORMULA_INSERT_TRAILING_SQL');
    skip(); if (i === statement.length) fail('FORMULA_ROW_TRUNCATED');
  }
}

function expressionEvidence(original) {
  if (original === null || original === '') return { original, analysis: original === null ? 'source_null' : 'source_empty', dependencies: [] };
  const analysis = analyzeFormula(original);
  // Keep reference extraction useful even when an external function is unsupported.
  const dependencies = [...new Set([...original.matchAll(/\b([RNIALU])\s*\[\s*([A-Za-z0-9_.-]{1,32})\s*\]/gi)].map((m) => `${m[1].toUpperCase()}[${m[2]}]`))].sort();
  return { original, analysis: analysis.ok ? 'syntax_supported_not_semantically_validated' : 'unsupported_or_invalid_syntax', dependencies, dependencyResolution: 'not_resolved_against_complete_source_context', diagnosticCodes: [...new Set(analysis.diagnostics.map((item) => item.code))].sort() };
}

export function createInventoryCollector({ limits = INVENTORY_LIMITS } = {}) {
  const schemas = new Map(), rows = [], keys = new Set();
  const onStatement = (statement) => {
    if (/^CREATE\s/i.test(statement)) {
      const schema = parseCreateTableStatement(statement);
      if (schemas.has(schema.name)) fail('FORMULA_SCHEMA_DUPLICATED');
      const policy = POLICIES[schema.name];
      if (!policy) fail('FORMULA_TABLE_NOT_ALLOWED');
      const columns = schema.columns.map((column) => column.name);
      if (policy.key.some((field) => !columns.includes(field))) fail('FORMULA_KEY_COLUMN_MISSING');
      schemas.set(schema.name, columns); return;
    }
    const table = /^INSERT\s+INTO\s+`([^`]+)`/i.exec(statement)?.[1];
    const columns = schemas.get(table), policy = POLICIES[table];
    if (!columns || !policy) fail('FORMULA_SCHEMA_REQUIRED');
    parseInsertRows(statement, columns, (row) => {
      if (rows.length >= limits.rows) fail('FORMULA_ROW_LIMIT');
      const key = pick(row, policy.key);
      if (policy.key.some((field) => !/^\d+$/.test(key[field] ?? ''))) fail('FORMULA_KEY_INVALID');
      const id = `${table}:${policy.key.map((field) => key[field]).join(':')}`;
      if (keys.has(id)) fail('FORMULA_KEY_DUPLICATED'); keys.add(id);
      const agreement = key.CODI_02 ?? null;
      const expressions = Object.fromEntries(policy.expressions.filter((field) => Object.hasOwn(row, field)).map((field) => [field, expressionEvidence(row[field])]));
      const metadata = pick(row, policy.metadata);
      rows.push({ id, table, key, agreement, requestedOperationalScope: agreement ? REQUESTED_AGREEMENTS.includes(agreement) : null, metadata, expressions, missingSourceColumns: [...policy.expressions, ...policy.metadata].filter((field) => !columns.includes(field)), unprovidedSourceColumns: [...policy.expressions, ...policy.metadata].filter((field) => columns.includes(field) && !Object.hasOwn(row, field)), effectiveFrom: null, effectiveTo: null, validityStatus: 'not_established_by_snapshot', definitionSha256: sha(JSON.stringify({ key, metadata, expressions: pick(row, policy.expressions) })) });
    });
  };
  return {
    onStatement,
    finish(source) {
      if (!schemas.has('codliq') || !rows.some((row) => row.table === 'codliq')) fail('FORMULA_CODLIQ_REQUIRED');
      rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const tableCounts = Object.fromEntries(Object.keys(POLICIES).map((table) => [table, rows.filter((row) => row.table === table).length]));
      const coverage = REQUESTED_AGREEMENTS.map((agreement) => ({ agreement, codliq: rows.filter((row) => row.table === 'codliq' && row.agreement === agreement).length, auxical: rows.filter((row) => row.table === 'auxical' && row.agreement === agreement).length }));
      const expressions = rows.flatMap((row) => Object.values(row.expressions));
      return { version: 'payroll-formula-inventory.v1', stage: 'MC-P02A', classification: 'private_payroll_rule_evidence', source, requestedAgreements: REQUESTED_AGREEMENTS, payrollExecutionAllowed: false, municipalAcceptance: null, limitations: ['Snapshot date does not establish effective validity.', 'No formulas were executed, approved, or promoted.', 'Dependency references are lexical evidence; complete resolution and cycles remain pending.', 'Only allowlisted configuration fields are retained; person/payroll-detail tables are discarded.'], summary: { tableCounts, coverage, requestedCodliqRows: coverage.reduce((n, row) => n + row.codliq, 0), requestedAuxicalRows: coverage.reduce((n, row) => n + row.auxical, 0), missingRequestedAgreements: coverage.filter((row) => row.codliq === 0).map((row) => row.agreement), nonemptyExpressions: expressions.filter((value) => value.original !== null && value.original !== '').length, unsupportedOrInvalidExpressions: expressions.filter((value) => value.analysis === 'unsupported_or_invalid_syntax').length }, rows };
    },
  };
}

export async function inventoryFile(inputPath, { expectedSha256, limits = INVENTORY_LIMITS } = {}) {
  const absolute = await realpath(inputPath), before = await stat(absolute);
  if (!before.isFile() || before.size < 1 || before.size > limits.sourceBytes) fail('FORMULA_SOURCE_SIZE_INVALID');
  const hash = createHash('sha256'); let bytes = 0, logicalBytes = 0;
  const input = createReadStream(absolute);
  const hashTap = new Transform({ transform(chunk, encoding, done) { bytes += chunk.length; if (bytes > limits.sourceBytes) return done(new Error('FORMULA_SOURCE_SIZE_INVALID')); hash.update(chunk); done(null, chunk); } });
  const compressed = absolute.toLowerCase().endsWith('.gz');
  const gunzip = compressed ? createGunzip() : null;
  const stream = gunzip ? input.pipe(hashTap).pipe(gunzip) : input.pipe(hashTap);
  input.on('error', (error) => stream.destroy(error));
  hashTap.on('error', (error) => stream.destroy(error));
  const collector = createInventoryCollector({ limits }), scanner = new InventoryScanner(collector.onStatement, limits);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const chunk of stream) {
      logicalBytes += chunk.length;
      if (logicalBytes > limits.logicalBytes || (compressed && logicalBytes > before.size * limits.compressionRatio)) fail('FORMULA_LOGICAL_SIZE_LIMIT');
      scanner.feed(decoder.decode(chunk, { stream: true }));
    }
    scanner.feed(decoder.decode(), true);
  } finally { input.destroy(); hashTap.destroy(); gunzip?.destroy(); }
  const after = await stat(absolute), digest = hash.digest('hex');
  if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail('FORMULA_SOURCE_CHANGED');
  if (expectedSha256 && digest !== expectedSha256.toLowerCase()) fail('FORMULA_SOURCE_HASH_MISMATCH');
  return collector.finish({ sha256: digest, bytes, logicalBytes, container: compressed ? 'gzip' : 'sql', encoding: 'utf-8', effectiveDate: null });
}

function gitRoot(directory) {
  try { return execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) {
    if (error.code === 'ENOENT') fail('FORMULA_GIT_REQUIRED_FOR_PATH_CHECK');
    // Ownership, permission and corrupted-repository failures are not proof that
    // this directory is outside a repository.
    if (/not a git repository/i.test(String(error.stderr || ''))) return null;
    fail('FORMULA_REPOSITORY_PATH_CHECK_FAILED');
  }
}
export async function validatePrivatePaths(inputPath, outputPath) {
  const input = await realpath(inputPath);
  if (gitRoot(path.dirname(input))) fail('FORMULA_INPUT_MUST_BE_OUTSIDE_REPOSITORY');
  const parent = await realpath(path.dirname(path.resolve(outputPath)));
  const output = path.join(parent, path.basename(outputPath));
  if (input.toLowerCase() === output.toLowerCase()) fail('FORMULA_OUTPUT_EQUALS_INPUT');
  const repository = gitRoot(parent);
  if (repository) {
    const relative = path.relative(repository, output);
    let tracked = false;
    try { execFileSync('git', ['-C', repository, 'ls-files', '--error-unmatch', '--', relative], { stdio: 'ignore' }); tracked = true; } catch { /* Untracked is required. */ }
    if (tracked) fail('FORMULA_OUTPUT_TRACKED');
    try { execFileSync('git', ['-C', repository, 'check-ignore', '-q', '--', relative], { stdio: 'ignore' }); }
    catch { fail('FORMULA_OUTPUT_MUST_BE_PRIVATE_OR_IGNORED'); }
  }
  return { input, output };
}

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!['--input', '--output', '--expected-sha256'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) fail('FORMULA_ARGUMENT_INVALID');
    const key = argv[i].slice(2); if (options[key]) fail('FORMULA_ARGUMENT_DUPLICATED'); options[key] = argv[++i];
  }
  if (!options.input || !options.output) fail('FORMULA_EXPLICIT_INPUT_AND_OUTPUT_REQUIRED');
  if (options['expected-sha256'] && !/^[a-f0-9]{64}$/i.test(options['expected-sha256'])) fail('FORMULA_EXPECTED_HASH_INVALID');
  return options;
}
export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv), targets = await validatePrivatePaths(options.input, options.output);
    const inventory = await inventoryFile(targets.input, { expectedSha256: options['expected-sha256'] });
    await writeFile(targets.output, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ stage: inventory.stage, sourceSha256: inventory.source.sha256, ...inventory.summary })}\n`);
    return 0;
  } catch (error) {
    // No raw SQL, field values, local paths, or arbitrary parser errors on stdout/stderr.
    process.stderr.write(`${/^FORMULA_[A-Z_]+$/.test(error.message) ? error.message : 'FORMULA_INVENTORY_FAILED'}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main();
