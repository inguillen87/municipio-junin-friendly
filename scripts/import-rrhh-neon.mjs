import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import process from 'node:process';
import { Client } from '@neondatabase/serverless';

const DATA_DIR = new URL('../rrhh-data/', import.meta.url);
const MANIFEST_FILE = 'curated-manifest.json';
const LOCK_NAME = 'municipio-junin-friendly:rrhh-curated-import:v1';
const SOURCE_NAME = 'grh_junin_curated';

const EXPECTED_COUNTS = Object.freeze({
  employees: 2450,
  absences: 31572,
  leaves: 3448,
  familyMembers: 3647,
  sectors: 36,
  categories: 156,
  unions: 6,
  agreements: 14,
});

const OUTPUTS = Object.freeze({
  employees: 'curated-employees.json',
  absences: 'curated-absences.json',
  leaves: 'curated-leaves.json',
  familyMembers: 'curated-family-members.json',
  sectors: 'curated-sectors.json',
  categories: 'curated-categories.json',
  unions: 'curated-unions.json',
  unionMemberships: 'curated-union-memberships.json',
  agreements: 'curated-agreements.json',
  absenceReasons: 'curated-absence-reasons.json',
  familyRelationships: 'curated-family-relationships.json',
  jobRoles: 'curated-job-roles.json',
  organizations: 'curated-organizations.json',
  exitReasons: 'curated-exit-reasons.json',
  employmentStatuses: 'curated-employment-statuses.json',
});

const CATALOGS = Object.freeze([
  { output: 'sectors', catalog: 'sectors' },
  { output: 'categories', catalog: 'categories' },
  { output: 'unions', catalog: 'unions' },
  { output: 'agreements', catalog: 'agreements' },
  { output: 'absenceReasons', catalog: 'absence_reasons' },
  { output: 'familyRelationships', catalog: 'family_relationships' },
  { output: 'jobRoles', catalog: 'job_roles' },
  { output: 'organizations', catalog: 'organizations' },
  { output: 'exitReasons', catalog: 'exit_reasons' },
  { output: 'employmentStatuses', catalog: 'employment_statuses' },
]);

function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseInteger(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (!/^-?\d+$/.test(String(value))) {
    throw new Error(`${fieldName} no es entero: ${String(value)}`);
  }
  return Number.parseInt(String(value), 10);
}

function requiredText(value, fieldName) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${fieldName}`);
  return text;
}

function jsonPayload(value) {
  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === 'string' ? nestedValue.replaceAll('\u0000', '\\u0000') : nestedValue,
  );
}

function countNullCharacters(value) {
  let count = 0;
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') {
      count += current.split('\u0000').length - 1;
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current && typeof current === 'object') {
      pending.push(...Object.values(current));
    }
  }
  return count;
}

function activeUnionNames(employee, cutoffDate) {
  const active = (employee.unionMemberships ?? [])
    .filter((membership) => !membership.endDate || membership.endDate >= cutoffDate)
    .sort((left, right) => {
      const byStartDate = String(right.startDate ?? '').localeCompare(String(left.startDate ?? ''));
      return byStartDate || String(left.unionCode ?? '').localeCompare(String(right.unionCode ?? ''));
    });

  return [...new Set(active.map((membership) => membership.unionName).filter(Boolean))].join('; ') || null;
}

function activeUnionWorkplaces(employee, cutoffDate) {
  const activeWorkplaces = (employee.unionMemberships ?? [])
    .filter((membership) => !membership.endDate || membership.endDate >= cutoffDate)
    .map((membership) => membership.workplace)
    .filter(Boolean);
  return [...new Set(activeWorkplaces)].join('; ') || null;
}

async function readAndVerifySources() {
  const manifestBuffer = await readFile(new URL(MANIFEST_FILE, DATA_DIR));
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  const manifestSha256 = createHash('sha256').update(manifestBuffer).digest('hex').toUpperCase();
  const datasets = {};

  for (const [outputName, fileName] of Object.entries(OUTPUTS)) {
    const output = manifest.outputs?.[outputName];
    if (!output || output.file !== fileName) {
      throw new Error(`El manifiesto no describe correctamente ${outputName}/${fileName}`);
    }

    const fileUrl = new URL(fileName, DATA_DIR);
    const [buffer, fileStat] = await Promise.all([readFile(fileUrl), stat(fileUrl)]);
    const sha256 = createHash('sha256').update(buffer).digest('hex').toUpperCase();
    if (sha256 !== output.sha256) {
      throw new Error(`SHA-256 inválido en ${fileName}: ${sha256} != ${output.sha256}`);
    }
    if (fileStat.size !== output.bytes) {
      throw new Error(`Tamaño inválido en ${fileName}: ${fileStat.size} != ${output.bytes}`);
    }

    const records = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(records) || records.length !== output.records) {
      throw new Error(`Conteo inválido en ${fileName}: ${records.length} != ${output.records}`);
    }
    datasets[outputName] = records;
  }

  for (const [outputName, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = datasets[outputName]?.length;
    if (actual !== expected) {
      throw new Error(`Conteo crítico inválido en ${outputName}: ${actual} != ${expected}`);
    }
  }

  const embeddedMemberships = datasets.employees.reduce(
    (total, employee) => total + (employee.unionMemberships?.length ?? 0),
    0,
  );
  if (embeddedMemberships !== datasets.unionMemberships.length) {
    throw new Error(
      `Las afiliaciones embebidas no coinciden: ${embeddedMemberships} != ${datasets.unionMemberships.length}`,
    );
  }

  return { manifest, manifestSha256, datasets, embeddedMemberships };
}

function makeMultiRowInsert(table, columns, rows, casts = {}) {
  if (!rows.length) return null;
  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      const cast = casts[column] ?? '';
      return `$${values.length}${cast}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
    values,
  };
}

async function insertInBatches(client, table, columns, rows, { batchSize, casts = {}, label }) {
  const startedAt = process.hrtime.bigint();
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const query = makeMultiRowInsert(table, columns, batch, casts);
    const result = await client.query(query.text, query.values);
    inserted += result.rowCount;
  }
  if (inserted !== rows.length) {
    throw new Error(`Inserción incompleta en ${table}: ${inserted} != ${rows.length}`);
  }
  console.log(`${label}: ${inserted} filas (${elapsedMs(startedAt).toFixed(0)} ms)`);
}

function mapEmployees(records, runId, cutoffDate) {
  return records.map((employee) => {
    const sourceKey = employee.sourceKey ?? {};
    const identity = employee.identity ?? {};
    const address = employee.address ?? {};
    const employment = employee.employment ?? {};
    return {
      company_id: parseInteger(sourceKey.companyCode, 'employees.sourceKey.companyCode'),
      legajo: requiredText(sourceKey.employeeNumber, 'employees.sourceKey.employeeNumber'),
      person_id: employee.personId === null ? null : requiredText(employee.personId, 'employees.personId'),
      nombre: identity.fullName ?? null,
      sexo: identity.sexLabel ?? identity.sexCode ?? null,
      fecha_nacimiento: identity.birthDate ?? null,
      dni: identity.documentNumber ?? null,
      cuil: identity.cuil ?? null,
      telefono: identity.phone ?? null,
      email: identity.email ?? null,
      domicilio: address.raw ?? null,
      localidad: address.locality ?? null,
      fecha_ingreso: employment.hireDate ?? null,
      fecha_egreso: employment.exitDate ?? null,
      activo: employment.activeProxy === true,
      sector_code: employment.sectorCode ?? null,
      sector: employment.sectorName ?? null,
      categoria_code: employment.categoryCode ?? null,
      categoria: employment.categoryName ?? null,
      convenio_code: employment.agreementCode ?? null,
      convenio: employment.agreementName ?? null,
      cargo_code: employment.cargoId ?? null,
      cargo: employment.cargoName ?? null,
      gremio: activeUnionNames(employee, cutoffDate),
      lugar_trabajo: employment.workplace ?? activeUnionWorkplaces(employee, cutoffDate),
      profesion: employment.profession ?? null,
      source_payload: jsonPayload(employee),
      import_run_id: runId,
    };
  });
}

function mapAbsences(records, runId) {
  return records.map((absence) => ({
    company_id: parseInteger(absence.sourceKey?.companyCode, 'absences.sourceKey.companyCode'),
    legajo: requiredText(absence.sourceKey?.employeeNumber, 'absences.sourceKey.employeeNumber'),
    fecha: requiredText(absence.absenceDate, 'absences.absenceDate'),
    motivo_code: absence.reasonCode ?? null,
    cantidad: absence.quantity ?? null,
    dias: absence.days ?? null,
    fecha_hasta: absence.untilDate ?? null,
    comentario: absence.sourceFields?.comment ?? null,
    source_payload: jsonPayload(absence),
    import_run_id: runId,
  }));
}

function mapLeaves(records, runId) {
  return records.map((leave) => ({
    company_id: parseInteger(leave.sourceKey?.companyCode, 'leaves.sourceKey.companyCode'),
    legajo: requiredText(leave.sourceKey?.employeeNumber, 'leaves.sourceKey.employeeNumber'),
    periodo: parseInteger(leave.sourceKey?.period, 'leaves.sourceKey.period'),
    tipo: leave.typeCode ?? null,
    fecha_inicio: requiredText(leave.startDate, 'leaves.startDate'),
    fecha_fin: leave.endDate ?? null,
    dias: leave.days ?? null,
    observaciones: leave.observations ?? null,
    source_payload: jsonPayload(leave),
    import_run_id: runId,
  }));
}

function mapFamily(records, runId) {
  return records.map((member) => ({
    family_id: requiredText(member.sourceKey?.familyMemberId, 'family.sourceKey.familyMemberId'),
    company_id: parseInteger(member.employeeSourceKey?.companyCode, 'family.employeeSourceKey.companyCode'),
    legajo: requiredText(member.employeeSourceKey?.employeeNumber, 'family.employeeSourceKey.employeeNumber'),
    nombre: member.fullName ?? null,
    sexo: member.sexCode ?? null,
    fecha_nacimiento: member.birthDate ?? null,
    dni: member.documentNumber ?? null,
    cuil: member.cuil ?? null,
    vinculo_code: member.relationshipId ?? null,
    fecha_baja: member.endDate ?? null,
    source_payload: jsonPayload(member),
    import_run_id: runId,
  }));
}

function mapCatalogs(datasets, runId) {
  return CATALOGS.flatMap(({ output, catalog }) =>
    datasets[output].map((record) => ({
      catalog,
      source_key: stableJson(record.sourceKey),
      label: record.name ?? record.fullName ?? record.abbreviation ?? null,
      source_payload: jsonPayload(record),
      import_run_id: runId,
    })),
  );
}

async function verifyDatabaseCounts(client, expectedCatalogCounts) {
  const tables = await client.query(`
    SELECT
      (SELECT count(*)::int FROM grh_employees) AS employees,
      (SELECT count(*)::int FROM grh_absences) AS absences,
      (SELECT count(*)::int FROM grh_leaves) AS leaves,
      (SELECT count(*)::int FROM grh_family) AS family,
      (SELECT count(*)::int FROM grh_catalog_rows) AS catalog_rows
  `);
  const tableCounts = tables.rows[0];
  const expectedTables = {
    employees: EXPECTED_COUNTS.employees,
    absences: EXPECTED_COUNTS.absences,
    leaves: EXPECTED_COUNTS.leaves,
    family: EXPECTED_COUNTS.familyMembers,
    catalog_rows: Object.values(expectedCatalogCounts).reduce((sum, count) => sum + count, 0),
  };

  for (const [key, expected] of Object.entries(expectedTables)) {
    if (tableCounts[key] !== expected) {
      throw new Error(`Verificación Neon falló para ${key}: ${tableCounts[key]} != ${expected}`);
    }
  }

  const catalogResult = await client.query(`
    SELECT catalog, count(*)::int AS records
    FROM grh_catalog_rows
    GROUP BY catalog
    ORDER BY catalog
  `);
  const catalogCounts = Object.fromEntries(catalogResult.rows.map((row) => [row.catalog, row.records]));
  for (const [catalog, expected] of Object.entries(expectedCatalogCounts)) {
    if (catalogCounts[catalog] !== expected) {
      throw new Error(`Verificación Neon falló para catálogo ${catalog}: ${catalogCounts[catalog]} != ${expected}`);
    }
  }

  return { ...tableCounts, catalogs: catalogCounts };
}

async function main() {
  const startedAt = process.hrtime.bigint();
  process.loadEnvFile?.('.env.local');
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL_UNPOOLED en .env.local');
  const host = new URL(databaseUrl).hostname;
  if (host.includes('-pooler.')) {
    throw new Error('DATABASE_URL_UNPOOLED apunta a un endpoint pooled; se requiere conexión directa');
  }

  const source = await readAndVerifySources();
  const { manifest, manifestSha256, datasets, embeddedMemberships } = source;
  const cutoffTimestamp = requiredText(manifest.source?.dumpCompletedAt, 'manifest.source.dumpCompletedAt');
  const cutoffDate = cutoffTimestamp.slice(0, 10);
  const sourceSha256 = requiredText(manifest.source?.sha256, 'manifest.source.sha256');
  const activeMemberships = datasets.unionMemberships.filter(
    (membership) => !membership.endDate || membership.endDate >= cutoffDate,
  );
  const employeesWithActiveUnion = datasets.employees.filter((employee) =>
    (employee.unionMemberships ?? []).some(
      (membership) => !membership.endDate || membership.endDate >= cutoffDate,
    ),
  ).length;

  const expectedCatalogCounts = Object.fromEntries(
    CATALOGS.map(({ output, catalog }) => [catalog, datasets[output].length]),
  );
  const sourceCounts = Object.fromEntries(
    Object.entries(datasets).map(([output, rows]) => [output, rows.length]),
  );
  const escapedNullCharacters = Object.values(datasets).reduce(
    (total, records) => total + countNullCharacters(records),
    0,
  );
  const qualityFlags = {
    schemaVersion: manifest.schemaVersion,
    profile: manifest.profile,
    manifestSha256,
    strictSnapshot: manifest.validation?.strictSnapshot === true,
    allOutputHashesVerified: true,
    postgresJsonCompatibility: {
      escapedNullCharacters,
      strategy: 'source NUL characters are preserved reversibly as the literal text \\u0000',
    },
    unionProjection: {
      strategy: 'unionMemberships with no endDate or endDate on/after source cutoff; distinct names joined with semicolon',
      embeddedMemberships,
      activeMemberships: activeMemberships.length,
      employeesWithActiveUnion,
    },
    joins: manifest.validation?.joins ?? {},
    mappingNotes: manifest.mappingNotes ?? [],
  };

  const client = new Client({ connectionString: databaseUrl });
  let runId = null;
  let inTransaction = false;
  let committed = false;
  let lockAcquired = false;

  try {
    await client.connect();
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAME]);
    lockAcquired = true;

    const runResult = await client.query(
      `INSERT INTO data_import_runs
        (source_name, source_sha256, source_cutoff, status, table_counts, quality_flags)
       VALUES ($1, $2, $3::timestamp, 'running', $4::jsonb, $5::jsonb)
       RETURNING id`,
      [
        SOURCE_NAME,
        sourceSha256,
        cutoffTimestamp,
        jsonPayload({ source: sourceCounts }),
        jsonPayload(qualityFlags),
      ],
    );
    runId = runResult.rows[0].id;

    const employees = mapEmployees(datasets.employees, runId, cutoffDate);
    const absences = mapAbsences(datasets.absences, runId);
    const leaves = mapLeaves(datasets.leaves, runId);
    const family = mapFamily(datasets.familyMembers, runId);
    const catalogs = mapCatalogs(datasets, runId);

    await client.query('BEGIN');
    inTransaction = true;
    await client.query(`
      TRUNCATE TABLE
        grh_absences,
        grh_leaves,
        grh_family,
        grh_catalog_rows,
        grh_employees
    `);

    await insertInBatches(
      client,
      'grh_employees',
      [
        'company_id', 'legajo', 'person_id', 'nombre', 'sexo', 'fecha_nacimiento', 'dni', 'cuil',
        'telefono', 'email', 'domicilio', 'localidad', 'fecha_ingreso', 'fecha_egreso', 'activo',
        'sector_code', 'sector', 'categoria_code', 'categoria', 'convenio_code', 'convenio',
        'cargo_code', 'cargo', 'gremio', 'lugar_trabajo', 'profesion', 'source_payload', 'import_run_id',
      ],
      employees,
      { batchSize: 200, casts: { source_payload: '::jsonb' }, label: 'grh_employees' },
    );
    await insertInBatches(
      client,
      'grh_absences',
      [
        'company_id', 'legajo', 'fecha', 'motivo_code', 'cantidad', 'dias', 'fecha_hasta',
        'comentario', 'source_payload', 'import_run_id',
      ],
      absences,
      { batchSize: 500, casts: { source_payload: '::jsonb' }, label: 'grh_absences' },
    );
    await insertInBatches(
      client,
      'grh_leaves',
      [
        'company_id', 'legajo', 'periodo', 'tipo', 'fecha_inicio', 'fecha_fin', 'dias',
        'observaciones', 'source_payload', 'import_run_id',
      ],
      leaves,
      { batchSize: 500, casts: { source_payload: '::jsonb' }, label: 'grh_leaves' },
    );
    await insertInBatches(
      client,
      'grh_family',
      [
        'family_id', 'company_id', 'legajo', 'nombre', 'sexo', 'fecha_nacimiento', 'dni', 'cuil',
        'vinculo_code', 'fecha_baja', 'source_payload', 'import_run_id',
      ],
      family,
      { batchSize: 500, casts: { source_payload: '::jsonb' }, label: 'grh_family' },
    );
    await insertInBatches(
      client,
      'grh_catalog_rows',
      ['catalog', 'source_key', 'label', 'source_payload', 'import_run_id'],
      catalogs,
      { batchSize: 500, casts: { source_payload: '::jsonb' }, label: 'grh_catalog_rows' },
    );

    const verifiedCounts = await verifyDatabaseCounts(client, expectedCatalogCounts);
    const tableCounts = {
      ...verifiedCounts,
      critical: EXPECTED_COUNTS,
      source: sourceCounts,
    };
    await client.query(
      `UPDATE data_import_runs
       SET status = 'completed', completed_at = now(), table_counts = $2::jsonb, quality_flags = $3::jsonb
       WHERE id = $1`,
      [runId, jsonPayload(tableCounts), jsonPayload(qualityFlags)],
    );
    await client.query('COMMIT');
    inTransaction = false;
    committed = true;

    console.log(
      JSON.stringify(
        {
          status: 'completed',
          importRunId: String(runId),
          sourceSha256,
          manifestSha256,
          cutoff: cutoffTimestamp,
          counts: verifiedCounts,
          activeUnionProjection: {
            memberships: activeMemberships.length,
            employees: employeesWithActiveUnion,
          },
          elapsedMs: Math.round(elapsedMs(startedAt)),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original import error is more useful than a secondary rollback error.
      }
    }
    if (runId && !committed) {
      try {
        await client.query(
          `UPDATE data_import_runs
           SET status = 'failed', completed_at = now(), error_message = $2
           WHERE id = $1`,
          [runId, String(error?.message ?? error).slice(0, 4000)],
        );
      } catch {
        // Preserve and rethrow the original import error.
      }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]);
      } catch {
        // Closing the session releases the advisory lock as a final fallback.
      }
    }
    await client.end().catch(() => undefined);
  }
}

await main();
