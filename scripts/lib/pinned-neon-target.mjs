import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './canonical-import.mjs';

function pinnedValue(argv, prefix, envValue, label, pattern) {
  const matches = argv.filter((argument) => argument.startsWith(prefix));
  if (matches.length > 1) throw new Error(`${label} repetido`);
  const fromArgument = matches[0]?.slice(prefix.length).trim();
  const fromEnvironment = String(envValue || '').trim();
  if (fromArgument && fromEnvironment && fromArgument !== fromEnvironment) {
    throw new Error(`${label} no coincide entre CLI y entorno`);
  }
  const value = fromArgument || fromEnvironment;
  if (!value) throw new Error(`Falta ${label}`);
  if (!pattern.test(value)) throw new Error(`${label} tiene formato invalido`);
  return value;
}

/**
 * Adds four independent Neon control-plane pins to the canonical direct-URL
 * gate. The caller supplies a feature-specific environment prefix so stale
 * values from one migration cannot silently authorize another.
 */
export function resolvePinnedNeonTarget({
  argv = process.argv,
  env = process.env,
  envPrefix,
  targetLabel,
}) {
  if (!/^[A-Z][A-Z0-9_]+$/.test(String(envPrefix || ''))) {
    throw new Error('prefijo de pines Neon invalido');
  }
  const label = String(targetLabel || 'migracion').trim();
  const target = resolveCanonicalDatabaseTarget(argv, env);
  const databaseUrl = directCanonicalDatabaseUrl(argv, env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error(`el target ${label} cambio durante el preflight`);
  }
  const parsed = new URL(databaseUrl);
  const branchId = pinnedValue(
    argv,
    '--expected-neon-branch-id=',
    env[`${envPrefix}_EXPECTED_NEON_BRANCH_ID`],
    `${envPrefix}_EXPECTED_NEON_BRANCH_ID`,
    /^br-[a-z0-9-]+$/,
  );
  const projectId = pinnedValue(
    argv,
    '--expected-neon-project-id=',
    env[`${envPrefix}_EXPECTED_NEON_PROJECT_ID`],
    `${envPrefix}_EXPECTED_NEON_PROJECT_ID`,
    /^[a-z][a-z0-9-]{2,95}$/,
  );
  const expectedHost = pinnedValue(
    argv,
    '--expected-neon-host=',
    env[`${envPrefix}_EXPECTED_NEON_HOST`],
    `${envPrefix}_EXPECTED_NEON_HOST`,
    /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/,
  );
  const expectedDatabase = pinnedValue(
    argv,
    '--expected-database=',
    env[`${envPrefix}_EXPECTED_DATABASE`],
    `${envPrefix}_EXPECTED_DATABASE`,
    /^[A-Za-z_][A-Za-z0-9_$-]*$/,
  );
  let actualDatabase;
  try {
    actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL_UNPOOLED contiene una base invalida');
  }
  if (parsed.hostname !== expectedHost || actualDatabase !== expectedDatabase) {
    throw new Error(`DATABASE_URL_UNPOOLED no coincide con el target ${label} fijado`);
  }
  if (target.mode === 'production' && branchId !== target.branchId) {
    throw new Error(`el pin Neon de ${label} no coincide con la rama de produccion confirmada`);
  }
  const productionBranchId = String(env.CANONICAL_PRODUCTION_BRANCH_ID || '').trim();
  if (target.mode === 'isolated' && productionBranchId && branchId === productionBranchId) {
    throw new Error(`el pin Neon aislado de ${label} coincide con la rama de produccion`);
  }
  return Object.freeze({
    ...target,
    branchId,
    projectId,
    expectedHost,
    expectedDatabase,
    endpointId: expectedHost.split('.')[0],
  });
}

export async function verifyPinnedNeonConnectedTarget(client, target, targetLabel) {
  const result = await client.query(`
    SELECT current_setting('neon.branch_id', true) AS "branchId",
      current_setting('neon.project_id', true) AS "projectId",
      current_setting('neon.endpoint_id', true) AS "endpointId",
      current_database() AS database
  `);
  const actual = Array.isArray(result?.rows) ? result.rows[0] || {} : {};
  if (actual.branchId !== target.branchId || actual.projectId !== target.projectId
      || actual.endpointId !== target.endpointId
      || actual.database !== target.expectedDatabase) {
    throw new Error(
      `la conexion efectiva no coincide con el target Neon ${targetLabel || 'fijado'}`,
    );
  }
  return true;
}
