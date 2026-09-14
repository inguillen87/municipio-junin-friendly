import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InventoryScanner, createInventoryCollector, inventoryFile, parseArgs, parseInsertRows, validatePrivatePaths, INVENTORY_LIMITS } from '../scripts/inventory-payroll-formulas.mjs';

// All rows below are fictional. Do not replace this fixture with municipal data.
const schema = 'CREATE TABLE `codliq` (`CODI_02` int, `CODI_27` int, `FOVM_27` varchar(240), `CONM_27` varchar(240), `UNID_27` varchar(1), PRIMARY KEY (`CODI_02`,`CODI_27`));';
const synthetic = `${schema}\nINSERT INTO \`codliq\` VALUES (1,100,'R[200] + 0.10','N[100] != 0','H'),(1,101,NULL,'','U'),(3,100,'EXTERNAL(R[200])','','H');\n`;
const script = fileURLToPath(new URL('../scripts/inventory-payroll-formulas.mjs', import.meta.url));
function collect(sql, chunkSize = 17, limits = INVENTORY_LIMITS) {
  const collector = createInventoryCollector({ limits });
  const scanner = new InventoryScanner(collector.onStatement, limits);
  for (let i = 0; i < sql.length; i += chunkSize) scanner.feed(sql.slice(i, i + chunkSize));
  scanner.feed('', true);
  return collector.finish({ sha256: 'synthetic' });
}
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'formula-inventory-synthetic-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('preserves source expressions, NULL versus empty, scope and unknown validity', () => {
  const result = collect(synthetic);
  assert.equal(result.stage, 'MC-P02A');
  assert.equal(result.payrollExecutionAllowed, false);
  assert.equal(result.summary.requestedCodliqRows, 2);
  assert.equal(result.summary.tableCounts.codliq, 3);
  assert.equal(result.rows[0].expressions.FOVM_27.original, 'R[200] + 0.10');
  assert.deepEqual(result.rows[0].expressions.FOVM_27.dependencies, ['R[200]']);
  assert.equal(result.rows[1].expressions.FOVM_27.original, null);
  assert.equal(result.rows[1].expressions.CONM_27.original, '');
  assert.equal(result.rows[2].requestedOperationalScope, false);
  assert.equal(result.rows[2].expressions.FOVM_27.analysis, 'unsupported_or_invalid_syntax');
  assert.deepEqual(result.rows[2].expressions.FOVM_27.dependencies, ['R[200]']);
  assert.equal(result.rows[0].effectiveFrom, null);
  assert.equal(result.rows[0].validityStatus, 'not_established_by_snapshot');
  assert.equal(result.rows[0].metadata.UNID_27, 'H');
});

test('streaming boundaries, quotes, comments and unselected nominal tables cannot leak', () => {
  const sql = `-- comment\n/* block */\nCREATE TABLE \`persona\` (\`name\` text);\nINSERT INTO \`persona\` VALUES ('FAKE_PRIVATE_PERSON; \\' and newline\nINSERT INTO \`codliq\` VALUES (7)');\n${synthetic}\n# ending`;
  const baseline = collect(sql, 1000);
  for (const size of [1, 2, 3, 7, 37]) assert.deepEqual(collect(sql, size), baseline);
  assert.doesNotMatch(JSON.stringify(baseline), /FAKE_PRIVATE_PERSON|persona|name/);
  const extended = synthetic.replace('`UNID_27` varchar(1)', '`UNID_27` varchar(1), `NOMBRE_PERSONA` varchar(100)').replace("'H')", "'H','FAKE_SECRET')").replace("'U')", "'U','FAKE_SECRET')").replace("'H');", "'H','FAKE_SECRET');");
  assert.doesNotMatch(JSON.stringify(collect(extended)), /FAKE_SECRET|NOMBRE_PERSONA/);
});

test('SQL literal parsing supports escaped and doubled quotes, exact decimals, explicit columns', () => {
  const rows = [];
  parseInsertRows("INSERT INTO `codliq` (`CODI_27`,`CODI_02`,`FOVM_27`) VALUES (100,1,'a''b\\n\\\\c\\\'d,;'),(101,1,123456789012345.123)", ['CODI_02','CODI_27','FOVM_27'], (row) => rows.push(row));
  assert.equal(rows[0].FOVM_27, "a'b\n\\c'd,;");
  assert.equal(rows[1].FOVM_27, '123456789012345.123');
  const omitted = collect(`${schema} INSERT INTO \`codliq\` (\`CODI_02\`,\`CODI_27\`) VALUES (1,100);`);
  assert.deepEqual(omitted.rows[0].unprovidedSourceColumns, ['FOVM_27', 'CONM_27', 'UNID_27']);
  assert.deepEqual(omitted.rows[0].expressions, {});
});

test('fails closed for truncated SQL, column drift, duplicate keys and executable expressions', () => {
  assert.throws(() => collect(synthetic.slice(0, -2)), /FORMULA_SQL_TRUNCATED/);
  assert.throws(() => collect(`${schema} INSERT INTO \`codliq\` VALUES (1,100);`), /COLUMN_COUNT/);
  assert.throws(() => collect(`${synthetic} INSERT INTO \`codliq\` VALUES (1,100,'1','','H');`), /KEY_DUPLICATED/);
  assert.throws(() => collect(`${schema} INSERT INTO \`codliq\` VALUES (1,100,SLEEP(1),'','H');`), /EXPRESSION_NOT_ALLOWED/);
  assert.throws(() => collect(`${schema} INSERT INTO \`codliq\` VALUES (1,100,'1','','H'),;`), /ROW_TRUNCATED/);
  assert.throws(() => collect(`${schema} INSERT INTO \`codliq\` VALUES (1,100,'1','','H') ON DUPLICATE KEY UPDATE x=1;`), /TRAILING_SQL/);
  assert.throws(() => collect('SELECT 1;'), /CODLIQ_REQUIRED/);
});

test('enforces finite retained statement and row limits without buffering unrelated rows', () => {
  assert.throws(() => collect(synthetic, 13, { ...INVENTORY_LIMITS, rows: 1 }), /ROW_LIMIT/);
  assert.throws(() => collect(synthetic, 13, { ...INVENTORY_LIMITS, statementChars: 100 }), /STATEMENT_LIMIT/);
  const ignored = `INSERT INTO \`persona\` VALUES ('${'q'.repeat(10000)}');`;
  assert.equal(collect(ignored + synthetic, 19, { ...INVENTORY_LIMITS, statementChars: 300 }).summary.tableCounts.codliq, 3);
});

test('catalog keys include agreement and auxiliary company, no cross-agreement collapsing', () => {
  const aux = 'CREATE TABLE `auxical` (`CODI_01` int, `CODI_02` int, `ITEM_77` int, `ALGV_77` varchar(240)); INSERT INTO `auxical` VALUES (1,1,88,\'A[90]\'),(2,1,88,\'A[91]\');';
  const result = collect(synthetic + aux);
  assert.equal(result.summary.requestedAuxicalRows, 2);
  assert.ok(result.rows.some((row) => row.id === 'auxical:1:1:88'));
  assert.ok(result.rows.some((row) => row.id === 'auxical:2:1:88'));
  assert.notEqual(result.rows[0].definitionSha256, result.rows[1].definitionSha256);
});

test('gzip input hashes compressed original, is deterministic and verifies expected hash', async (t) => {
  const directory = await temporary(t), input = path.join(directory, 'synthetic.sql.gz');
  const bytes = gzipSync(Buffer.from(synthetic)); await writeFile(input, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const first = await inventoryFile(input, { expectedSha256: digest });
  assert.equal(first.source.sha256, digest);
  assert.deepEqual(await inventoryFile(input), first);
  await assert.rejects(inventoryFile(input, { expectedSha256: '0'.repeat(64) }), /HASH_MISMATCH/);
  await assert.rejects(inventoryFile(input, { limits: { ...INVENTORY_LIMITS, logicalBytes: 50 } }), /LOGICAL_SIZE/);
  await assert.rejects(inventoryFile(input, { limits: { ...INVENTORY_LIMITS, sourceBytes: 3 } }), /SOURCE_SIZE/);
});

test('CLI requires explicit output and never prints formulas or source paths', async (t) => {
  const directory = await temporary(t), input = path.join(directory, 'source.sql.gz'), output = path.join(directory, 'private.json');
  await writeFile(input, gzipSync(Buffer.from(synthetic)));
  assert.throws(() => parseArgs(['--input', input]), /EXPLICIT_INPUT_AND_OUTPUT/);
  assert.throws(() => parseArgs(['--input', input, '--output', output, '--expected-sha256', 'wrong']), /EXPECTED_HASH/);
  const missing = spawnSync(process.execPath, [script, '--input', input], { encoding: 'utf8' });
  assert.equal(missing.status, 1); assert.equal(missing.stdout, '');
  const success = spawnSync(process.execPath, [script, '--input', input, '--output', output], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  assert.doesNotMatch(success.stdout + success.stderr, /R\[200\]|source\.sql|private\.json/);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).rows.length, 3);
  const original = await readFile(output, 'utf8');
  const duplicate = spawnSync(process.execPath, [script, '--input', input, '--output', output], { encoding: 'utf8' });
  assert.equal(duplicate.status, 1); assert.equal(await readFile(output, 'utf8'), original);
});

test('rejects repository inputs and nonignored outputs; permits only untracked ignored output', async (t) => {
  const directory = await temporary(t), repository = path.join(directory, 'repo');
  await mkdir(repository); execFileSync('git', ['init', repository], { stdio: 'ignore' });
  const input = path.join(directory, 'source.sql.gz'); await writeFile(input, gzipSync(Buffer.from(synthetic)));
  await assert.rejects(validatePrivatePaths(input, path.join(repository, 'unsafe.json')), /PRIVATE_OR_IGNORED/);
  await writeFile(path.join(repository, '.gitignore'), 'private/\n'); await mkdir(path.join(repository, 'private'));
  assert.equal((await validatePrivatePaths(input, path.join(repository, 'private', 'output.json'))).input, input);
  const tracked = path.join(repository, 'tracked.json'); await writeFile(tracked, '{}'); execFileSync('git', ['-C', repository, 'add', 'tracked.json'], { stdio: 'ignore' });
  await assert.rejects(validatePrivatePaths(input, tracked), /OUTPUT_TRACKED/);
  const inside = path.join(repository, 'private', 'source.sql.gz'); await writeFile(inside, gzipSync(Buffer.from(synthetic)));
  await assert.rejects(validatePrivatePaths(inside, path.join(directory, 'output.json')), /INPUT_MUST_BE_OUTSIDE/);
});
