/** Pinned Oct28 offline recovery of four complete configuration tables. Never executes SQL or formula text. */
import { createReadStream } from 'node:fs';
import { realpath, stat, open, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { InventoryScanner, parseInsertRows, INVENTORY_LIMITS, validatePrivatePaths } from './inventory-payroll-formulas.mjs';
import { parseCreateTableStatement, profileSqlFile } from './profile-grh-backup.mjs';

export const TABLES = Object.freeze(['codliq', 'auxical', 'concepto', 'calauxi']);
export const SOURCE_CONTRACT = Object.freeze({
  gzipSha256: '9daf87941a3d7c92a2ebd680b390c2455c8e9889a7a9c51696587d7e8884f110',
  sqlSha256: 'fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1',
  bytes: 45332016, logicalBytes: 786820775,
  snapshotIdentifier: '2026102815', declaredSnapshotCivil: '2026-10-28T15:16:35',
  rowCounts: Object.freeze({codliq:2740,auxical:547,concepto:294,calauxi:94})
});
export const SOURCE_HASH = SOURCE_CONTRACT.gzipSha256;
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = code => { throw new Error(code); };

/** Adds dialect/count checks; underlying scanner discards bodies of every nonallowlisted table. */
export class StrictConfigScanner extends InventoryScanner {
  constructor(callback, limits = INVENTORY_LIMITS) {
    super(callback, limits);
    this.audit = { statements: 0, creates: 0, inserts: 0 };
  }
  reset() {
    if (this.hasContent && this.audit) {
      if (!this.probeDone && /^(?:INSERT|CREATE)\b/i.test(this.probe)) fail('CONFIG_HEADER_UNSUPPORTED');
      this.audit.statements++;
      if (this.statementKind === 'CREATE') this.audit.creates++;
      if (this.statementKind === 'INSERT') this.audit.inserts++;
    }
    super.reset(); this.probe = ''; this.probeDone = false; this.statementKind = null;
  }
  append(character) {
    if (!this.hasContent && /\s/.test(character)) return;
    if (!this.probeDone) {
      this.probe += character;
      if (/^(?:COPY|REPLACE|LOAD|UPDATE|DELETE|TRUNCATE)\s/i.test(this.probe)) fail('CONFIG_DATA_DIALECT_UNSUPPORTED');
      const selected = /^(CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INSERT\s+INTO)\s+`([A-Za-z0-9_]+)`/i.exec(this.probe);
      if (selected) {
        this.statementKind = /^INSERT/i.test(selected[1]) ? 'INSERT' : 'CREATE';
        this.probeDone = true; this.probe = ''; // No unrelated row value is retained by this audit.
      } else if (this.probe.length > 256) {
        if (/^(?:INSERT|CREATE\s+TABLE)\b/i.test(this.probe)) fail('CONFIG_HEADER_UNSUPPORTED');
        this.probeDone = true; this.probe = '';
      }
    }
    super.append(character);
  }
}

export function configurationCollector(expectedTables) {
  if (!Array.isArray(expectedTables) || expectedTables.length !== TABLES.length || new Set(expectedTables.map(t => t.name)).size !== TABLES.length || expectedTables.some(t => !TABLES.includes(t.name))) fail('CONFIG_EXPECTED_SCHEMA_INVALID');
  const expected = new Map(expectedTables.map(t => [t.name, t]));
  const schemas = new Map(), creates = new Map(), rows = new Map(TABLES.map(t => [t, []])), keys = new Set();
  return {
    onStatement(statement) {
      if (/^CREATE\s/i.test(statement)) {
        const schema = parseCreateTableStatement(statement), contract = expected.get(schema.name);
        if (!contract || schemas.has(schema.name)) fail('CONFIG_SCHEMA_DUPLICATE_OR_NOT_ALLOWED');
        const canonical = columns => columns.map(c => ({ name: c.name, type: c.type, nullable: c.nullable }));
        if (JSON.stringify(canonical(schema.columns)) !== JSON.stringify(canonical(contract.columns)) || JSON.stringify(schema.primaryKey) !== JSON.stringify(contract.primaryKey)) fail('CONFIG_SCHEMA_DRIFT');
        schemas.set(schema.name, schema); creates.set(schema.name, statement); return;
      }
      const table = /^INSERT\s+INTO\s+`([^`]+)`/i.exec(statement)?.[1], schema = schemas.get(table);
      if (!schema || !expected.has(table)) fail('CONFIG_SCHEMA_REQUIRED');
      const columns = schema.columns.map(c => c.name);
      parseInsertRows(statement, columns, row => {
        // This is complete source recovery, so omitted columns are not defaulted or fabricated.
        if (Object.keys(row).length !== columns.length || columns.some(c => !Object.hasOwn(row, c))) fail('CONFIG_INCOMPLETE_ROW');
        if (schema.primaryKey.some(c => !/^\d+$/.test(row[c] ?? ''))) fail('CONFIG_KEY_INVALID');
        const key = `${table}:${schema.primaryKey.map(c => row[c]).join(':')}`;
        if (keys.has(key)) fail('CONFIG_DUPLICATE_KEY'); keys.add(key);
        if (rows.get(table).length >= expected.get(table).rowCount || keys.size > INVENTORY_LIMITS.rows) fail('CONFIG_ROW_COUNT_EXCEEDED');
        rows.get(table).push(row);
      });
    },
    finish(source, audit) {
      if (schemas.size !== TABLES.length) fail('CONFIG_SCHEMA_INCOMPLETE');
      for (const t of TABLES) if (rows.get(t).length !== expected.get(t).rowCount) fail('CONFIG_ROW_COUNT_MISMATCH');
      return { version: 'grh-payroll-complete-configuration.v1', classification: 'private_non_nominal_configuration_evidence', source, audit,
        allowlistedTables: TABLES, payrollExecutionAllowed: false, approved: false, effectiveFrom: null, effectiveUntil: null,
        validityStatus: 'backup_snapshot_does_not_establish_effective_validity',
        limitations: ['Only these four configuration tables are retained.', 'No SQL or payroll rule is executed.', 'No employee, receipt, bank or session table is retained.', 'All source rows and columns in the allowlisted schemas are preserved; no agreement filter is applied.', 'Dependencies are evidence, not an approved native programme.'],
        tables: TABLES.map(table => ({ table, schema: schemas.get(table), createStatement: creates.get(table), createStatementSha256: hash(creates.get(table)), createStatementFormat: 'scanner_statement_without_comments_or_terminator', rowCount: rows.get(table).length, rows: rows.get(table), rowsSha256: hash(rows.get(table)) })) };
    },
  };
}

/** The public profiler supplies metadata only; no private profile or legacy publication selector is imported. */
export function validateConfigurationProfile(profile) {
  const source = profile?.source, sql = profile?.sql;
  if (source?.container !== 'gzip' || source.sha256 !== SOURCE_HASH || source.bytes !== SOURCE_CONTRACT.bytes || source.logicalBytes !== SOURCE_CONTRACT.logicalBytes || sql?.dialect !== 'MariaDB/MySQL') fail('CONFIG_SOURCE_PROFILE_MISMATCH');
  if (!['statementCount','createTableStatements','alterTableStatements','insertStatements'].every(k => Number.isSafeInteger(sql[k]) && sql[k] >= 0)) fail('CONFIG_PROFILE_AUDIT_INVALID');
  if (!Array.isArray(profile.tables)) fail('CONFIG_EXPECTED_SCHEMA_INVALID');
  const expected = profile.tables.filter(t => TABLES.includes(t?.name));
  if (expected.length !== TABLES.length || new Set(expected.map(t => t.name)).size !== TABLES.length) fail('CONFIG_EXPECTED_SCHEMA_INVALID');
  for (const t of expected) {
    if (t.rowCount !== SOURCE_CONTRACT.rowCounts[t.name] || !Array.isArray(t.columns) || t.columns.length === 0 || new Set(t.columns.map(c => c?.name)).size !== t.columns.length || !t.columns.every(c => typeof c?.name === 'string' && c.name.length > 0 && typeof c.type === 'string' && typeof c.nullable === 'boolean') || !Array.isArray(t.primaryKey) || t.primaryKey.length === 0 || new Set(t.primaryKey).size !== t.primaryKey.length || !t.primaryKey.every(k => t.columns.some(c => c.name === k))) fail('CONFIG_EXPECTED_SCHEMA_INVALID');
  }
  return expected;
}
function unchanged(a, b) {
  if (!b.isFile() || a.size !== b.size || a.mtimeMs !== b.mtimeMs || a.ino !== b.ino || a.dev !== b.dev) fail('CONFIG_SOURCE_CHANGED');
}
export function validateConfigurationCustody({sha256,sqlSha256,bytes,logicalBytes,audit}, profile) {
  if (sha256 !== SOURCE_HASH || sqlSha256 !== SOURCE_CONTRACT.sqlSha256 || bytes !== SOURCE_CONTRACT.bytes || logicalBytes !== SOURCE_CONTRACT.logicalBytes || sha256 !== profile.source.sha256 || bytes !== profile.source.bytes || logicalBytes !== profile.source.logicalBytes) fail('CONFIG_SOURCE_HASH_OR_COUNT_MISMATCH');
  const expectedAudit = {statements:profile.sql.statementCount,creates:profile.sql.createTableStatements,inserts:profile.sql.insertStatements};
  if (JSON.stringify(audit) !== JSON.stringify(expectedAudit)) fail('CONFIG_STATEMENT_COUNT_MISMATCH');
}
/** The second-pass IO wrapper accepts a Readable for synthetic fault tests only. */
export async function scanConfigurationSource(input, onStatement) {
  const scanner = new StrictConfigScanner(onStatement);
  const digest = createHash('sha256'), logicalDigest = createHash('sha256');
  let bytes = 0, logicalBytes = 0;
  const tap = new Transform({
    transform(chunk, _encoding, done) {
      if (bytes > SOURCE_CONTRACT.bytes - chunk.length) return done(new Error('CONFIG_SOURCE_SIZE_LIMIT'));
      bytes += chunk.length; digest.update(chunk); done(null, chunk);
    },
  });
  const gunzip = createGunzip(), decoder = new TextDecoder('utf-8', {fatal:true});
  try {
    await pipeline(input, tap, gunzip, async (stream) => {
      for await (const chunk of stream) {
        if (logicalBytes > SOURCE_CONTRACT.logicalBytes - chunk.length
            || logicalBytes > INVENTORY_LIMITS.logicalBytes - chunk.length
            || logicalBytes + chunk.length > SOURCE_CONTRACT.bytes * INVENTORY_LIMITS.compressionRatio) fail('CONFIG_LOGICAL_SIZE_LIMIT');
        logicalBytes += chunk.length; logicalDigest.update(chunk);
        scanner.feed(decoder.decode(chunk, {stream:true}));
      }
      scanner.feed(decoder.decode(), true);
    });
  } finally { input.destroy(); tap.destroy(); gunzip.destroy(); }
  return {sha256:digest.digest('hex'),sqlSha256:logicalDigest.digest('hex'),bytes,logicalBytes,audit:scanner.audit};
}

/** A closed, complete private temporary file is promoted without replacement.
 * link is atomic exclusive creation (EEXIST); ordinary rename can replace a target.
 * Unsupported hardlinks fail closed. There is no check-then-rename fallback.
 */
export async function writeConfigurationResult(outputPath, result, io = {}) {
  const openFile = io.openFile ?? open, linkFile = io.linkFile ?? link, unlinkFile = io.unlinkFile ?? unlink;
  const temporary = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${randomUUID()}.tmp`);
  let handle = null, created = false, delivered = false, failure = null, cleanupFailure = null;
  try {
    handle = await openFile(temporary, 'wx', 0o600); created = true;
    await handle.writeFile(`${JSON.stringify(result,null,2)}\n`, {encoding:'utf8'});
    await handle.sync();
    await handle.close(); handle = null;
    await linkFile(temporary, outputPath); delivered = true;
  } catch (error) { failure = error; }
  finally {
    if (handle) {
      try { await handle.close(); } catch (error) { failure ??= error; }
    }
    if (created) {
      try { await unlinkFile(temporary); } catch (error) { cleanupFailure = error; }
    }
  }
  if (cleanupFailure) {
    throw new Error(delivered ? 'CONFIG_OUTPUT_DELIVERED_TEMP_CLEANUP_REQUIRED' : 'CONFIG_OUTPUT_FAILED_TEMP_CLEANUP_REQUIRED', {cause:failure ?? cleanupFailure});
  }
  if (failure) throw failure;
}

export async function recoverConfiguration(inputPath) {
  const absolute = await realpath(inputPath), before = await stat(absolute);
  if (!before.isFile() || before.size !== SOURCE_CONTRACT.bytes || before.size > INVENTORY_LIMITS.sourceBytes || !absolute.toLowerCase().endsWith('.gz')) fail('CONFIG_SOURCE_SIZE_INVALID');
  // First pass uses the existing public metadata-only parser; the fixed physical size is checked BEFORE it opens the stream.
  const profile = await profileSqlFile(absolute), expected = validateConfigurationProfile(profile);
  unchanged(before, await stat(absolute));
  const collector = configurationCollector(expected);
  const custody = await scanConfigurationSource(createReadStream(absolute), collector.onStatement);
  unchanged(before, await stat(absolute));
  validateConfigurationCustody(custody,profile);
  const {sha256,sqlSha256,bytes,logicalBytes,audit} = custody;
  return collector.finish({sha256,sqlSha256,bytes,logicalBytes,encoding:'utf-8',container:'gzip',snapshotIdentifier:SOURCE_CONTRACT.snapshotIdentifier,declaredSnapshotCivil:SOURCE_CONTRACT.declaredSnapshotCivil,declaredSnapshotMeaning:'source_label_not_effective_validity',effectiveFrom:null,effectiveUntil:null},audit);
}
export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) fail('CONFIG_EXPLICIT_PATHS_REQUIRED');
  const options = {};
  for (let i=0;i<argv.length;i+=2) {
    if (!['--input','--output'].includes(argv[i]) || Object.hasOwn(options,argv[i].slice(2)) || typeof argv[i+1] !== 'string' || !argv[i+1] || argv[i+1].startsWith('--')) fail('CONFIG_ARGUMENT_INVALID');
    options[argv[i].slice(2)] = argv[i+1];
  }
  if (!options.input || !options.output) fail('CONFIG_EXPLICIT_PATHS_REQUIRED');
  return options;
}
export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv), paths = await validatePrivatePaths(options.input,options.output);
    const result = await recoverConfiguration(paths.input);
    await writeConfigurationResult(paths.output, result);
    process.stdout.write(`${JSON.stringify({version:result.version,sourceSha256:result.source.sha256,sqlSha256:result.source.sqlSha256,snapshotIdentifier:result.source.snapshotIdentifier,tables:result.tables.map(t=>({table:t.table,rows:t.rowCount,columns:t.schema.columns.length})),audit:result.audit,payrollExecutionAllowed:false})}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${/^CONFIG_[A-Z_]+$|^FORMULA_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'CONFIG_RECOVERY_FAILED'}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main();