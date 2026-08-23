import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  BackupProfileError,
  parseCreateTableStatement,
  profileSqlFile,
  renderMarkdown,
} from '../scripts/profile-grh-backup.mjs';

const fixture = `-- MariaDB dump, schema-only output must never retain values
CREATE TABLE \`persona\` (
  \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
  \`nombre\` varchar(120) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`persona_nombre_idx\` (\`nombre\`)
) ENGINE=InnoDB;
CREATE TABLE \`turno\`\`especial\` (
  \`id\` bigint NOT NULL,
  \`persona_id\` bigint NOT NULL,
  \`hora_inicio\` time NOT NULL,
  \`tolerancia_minutos\` int DEFAULT 0,
  \`modalidad\` enum('SECRETO_A','SECRETO_B') NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`turno_persona_idx\` (\`persona_id\`),
  CONSTRAINT \`turno_persona_fk\` FOREIGN KEY (\`persona_id\`) REFERENCES \`persona\` (\`id\`)
);
INSERT INTO \`persona\` VALUES
(1,'NOMBRE_PRIVADO'),
(2,'valor con (parentesis), coma y ; punto'),
(3,'escape \\' privado');
INSERT INTO \`turno\`\`especial\` (\`id\`,\`persona_id\`,\`hora_inicio\`,\`tolerancia_minutos\`,\`modalidad\`) VALUES (1,1,'08:00:00',5,'SECRETO_A'),(2,2,concat('0','9'),10,'SECRETO_B');
ALTER TABLE \`turno\`\`especial\` ADD UNIQUE KEY \`turno_hora_unique\` (\`hora_inicio\`);
`;

async function withTempDirectory(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'grh-profiler-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('perfila SQL plano sin conservar valores ni literales de ENUM', async () => {
  await withTempDirectory(async (directory) => {
    const sqlPath = path.join(directory, 'fixture.sql');
    await writeFile(sqlPath, fixture, 'utf8');

    const profile = await profileSqlFile(sqlPath);
    assert.equal(profile.source.container, 'plain-sql');
    assert.equal(profile.source.logicalBytes, Buffer.byteLength(fixture));
    assert.equal(profile.source.sha256, createHash('sha256').update(fixture).digest('hex'));
    assert.equal(profile.summary.tableCount, 2);
    assert.equal(profile.summary.rowCount, 5);
    assert.equal(profile.sql.insertStatements, 2);
    assert.deepEqual(profile.privacy, {
      rawRowsRetained: false,
      dataLiteralsEmitted: false,
      samplesEmitted: false,
      outputScope: 'schema_metadata_and_aggregate_counts_only',
    });

    const persona = profile.tables.find((table) => table.name === 'persona');
    const turn = profile.tables.find((table) => table.name === 'turno`especial');
    assert.equal(persona.rowCount, 3);
    assert.equal(turn.rowCount, 2);
    assert.deepEqual(turn.primaryKey, ['id']);
    assert.equal(turn.foreignKeys[0].referencedTable, 'persona');
    assert.equal(turn.indexes.length, 2);
    assert.equal(turn.columns.find((column) => column.name === 'modalidad').type, 'enum');
    assert.ok(profile.candidates.turnos.some((entry) => entry.table === 'turno`especial'));

    const serialized = JSON.stringify(profile);
    const markdown = renderMarkdown(profile);
    for (const secret of ['NOMBRE_PRIVADO', 'SECRETO_A', 'SECRETO_B', '08:00:00']) {
      assert.doesNotMatch(serialized, new RegExp(secret));
      assert.doesNotMatch(markdown, new RegExp(secret));
    }
  });
});

test('gzip y SQL plano producen el mismo inventario y conteo logico', async () => {
  await withTempDirectory(async (directory) => {
    const plainPath = path.join(directory, 'fixture.sql');
    const gzipPath = path.join(directory, 'fixture.sql.gz');
    await writeFile(plainPath, fixture, 'utf8');
    await writeFile(gzipPath, gzipSync(Buffer.from(fixture)), null);

    const [plain, gzip] = await Promise.all([profileSqlFile(plainPath), profileSqlFile(gzipPath)]);
    assert.equal(gzip.source.container, 'gzip');
    assert.equal(gzip.source.logicalBytes, plain.source.logicalBytes);
    assert.deepEqual(gzip.tables, plain.tables);
    assert.deepEqual(gzip.candidates, plain.candidates);
    assert.notEqual(gzip.source.sha256, plain.source.sha256);
  });
});

test('cuenta INSERT extendidos grandes en streaming e ignora parentesis dentro de literales', async () => {
  await withTempDirectory(async (directory) => {
    const rowCount = 20_000;
    const rows = Array.from({ length: rowCount }, (_, index) => `(${index},'literal (${index});,')`).join(',');
    const sql = `CREATE TABLE \`fichadas\` (\`id\` bigint, \`marca_hora\` datetime);\nINSERT INTO \`fichadas\` VALUES ${rows};\n`;
    const file = path.join(directory, 'large.sql.gz');
    await writeFile(file, gzipSync(Buffer.from(sql)), null);
    const profile = await profileSqlFile(file);
    assert.equal(profile.summary.rowCount, rowCount);
    assert.equal(profile.tables[0].rowCount, rowCount);
    assert.ok(profile.candidates.fichadas.some((entry) => entry.table === 'fichadas'));
    assert.doesNotMatch(JSON.stringify(profile), /literal/);
  });
});

test('falla cerrado ante gzip falso, SQL truncado e INSERT sin definicion', async () => {
  await withTempDirectory(async (directory) => {
    const falseGzip = path.join(directory, 'false.sql.gz');
    const truncated = path.join(directory, 'truncated.sql');
    const orphan = path.join(directory, 'orphan.sql');
    await writeFile(falseGzip, fixture, 'utf8');
    await writeFile(truncated, "CREATE TABLE `t` (`id` int); INSERT INTO `t` VALUES (1,'sin cierre", 'utf8');
    await writeFile(orphan, 'CREATE TABLE `t` (`id` int); INSERT INTO `otra` VALUES (1);', 'utf8');

    await assert.rejects(() => profileSqlFile(falseGzip), BackupProfileError);
    await assert.rejects(() => profileSqlFile(truncated), /sin cierre|sin terminador/);
    await assert.rejects(() => profileSqlFile(orphan), /sin definicion/);
  });
});

test('falla cerrado ante formas de datos que impiden un conteo completo', async () => {
  await withTempDirectory(async (directory) => {
    const statements = [
      'INSERT INTO `t` SELECT 1',
      'INSERT INTO `t` SET `id` = 1',
      'REPLACE INTO `t` VALUES (1)',
      "LOAD DATA INFILE 'privado.csv' INTO TABLE `t`",
      'UPDATE `t` SET `id` = 2',
      'DELETE FROM `t`',
      'TRUNCATE TABLE `t`',
    ];
    for (const [index, statement] of statements.entries()) {
      const file = path.join(directory, `unsupported-${index}.sql`);
      await writeFile(file, `CREATE TABLE \`t\` (\`id\` int); ${statement};`, 'utf8');
      await assert.rejects(
        () => profileSqlFile(file),
        /solo se admite INSERT|sentencia de datos no soportada/,
      );
    }
  });
});

test('limita expansion gzip antes de procesar un archivo bomba', async () => {
  await withTempDirectory(async (directory) => {
    const sql = `CREATE TABLE \`t\` (\`id\` int);\n-- ${'x'.repeat(9 * 1024 * 1024)}`;
    const file = path.join(directory, 'expansion.sql.gz');
    await writeFile(file, gzipSync(Buffer.from(sql)), null);
    await assert.rejects(() => profileSqlFile(file), /expansion gzip excede/);
  });
});

test('parser CREATE TABLE soporta identificadores MySQL y metadatos de indices', () => {
  const table = parseCreateTableStatement(`CREATE TABLE IF NOT EXISTS \`esquema\`.\`reloj\`\`marca\` (
    \`id\`\`marca\` bigint unsigned NOT NULL PRIMARY KEY,
    \`fecha_hora\` datetime(6) NOT NULL,
    FULLTEXT KEY \`busqueda\` (\`fecha_hora\`)
  ) ENGINE=InnoDB`);
  assert.equal(table.name, 'reloj`marca');
  assert.deepEqual(table.primaryKey, ['id`marca']);
  assert.equal(table.columns[0].type, 'bigint unsigned');
  assert.deepEqual(table.indexes[0], {
    name: 'busqueda', unique: false, kind: 'fulltext', columns: ['fecha_hora'],
  });
});

test('clasifica las tablas legacy centrales de control horario GRH', async () => {
  await withTempDirectory(async (directory) => {
    const legacyTables = ['esperanza', 'legaturn', 'prenove', 'locales', 'motause', 'reglic'];
    const sql = legacyTables
      .map((name) => `CREATE TABLE \`${name}\` (\`id\` bigint); INSERT INTO \`${name}\` VALUES (1);`)
      .join('\n');
    const file = path.join(directory, 'legacy-time.sql');
    await writeFile(file, sql, 'utf8');
    const profile = await profileSqlFile(file);
    const byName = Object.fromEntries(profile.tables.map((table) => [table.name, table]));

    for (const name of ['esperanza', 'legaturn', 'prenove', 'locales']) {
      assert.ok(byName[name].functionalDomains.includes('control_horario'), name);
    }
    for (const name of ['motause', 'reglic']) {
      assert.ok(byName[name].functionalDomains.includes('novedades_licencias'), name);
    }
    for (const name of ['esperanza', 'legaturn']) {
      assert.ok(profile.candidates.turnos.some((candidate) => candidate.table === name), name);
    }
    for (const name of ['prenove', 'locales']) {
      assert.ok(profile.candidates.fichadas.some((candidate) => candidate.table === name), name);
    }
    for (const name of ['motause', 'reglic']) {
      assert.ok(profile.candidates.calendarios.some((candidate) => candidate.table === name), name);
    }
    for (const name of ['prenove', 'motause', 'reglic']) {
      assert.ok(profile.candidates.reglas.some((candidate) => candidate.table === name), name);
    }
  });
});

test('CLI escribe JSON y Markdown solo cuando se solicitan por flags', async () => {
  await withTempDirectory(async (directory) => {
    const sqlPath = path.join(directory, 'fixture.sql.gz');
    const jsonPath = path.join(directory, 'profile.json');
    const markdownPath = path.join(directory, 'profile.md');
    await writeFile(sqlPath, gzipSync(Buffer.from(fixture)), null);
    const script = path.resolve('scripts/profile-grh-backup.mjs');
    const result = spawnSync(process.execPath, [
      script, '--input', sqlPath, '--json', jsonPath, '--markdown', markdownPath,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(await readFile(jsonPath, 'utf8'));
    const markdown = await readFile(markdownPath, 'utf8');
    assert.equal(json.summary.rowCount, 5);
    assert.match(markdown, /Perfil estructural seguro/);
    assert.doesNotMatch(markdown, /NOMBRE_PRIVADO|SECRETO_A|SECRETO_B/);
  });
});
