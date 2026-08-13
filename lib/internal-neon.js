import { InternalAuthConfigurationError } from './internal-session.js';

let cachedDatabaseUrl = null;
let cachedSqlPromise = null;

function getDatabaseUrl(env = process.env) {
  const databaseUrl = env?.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    throw new InternalAuthConfigurationError('DATABASE_URL');
  }
  return databaseUrl;
}

export async function getInternalSql(env = process.env) {
  const databaseUrl = getDatabaseUrl(env);
  if (!cachedSqlPromise || cachedDatabaseUrl !== databaseUrl) {
    cachedDatabaseUrl = databaseUrl;
    cachedSqlPromise = import('@neondatabase/serverless')
      .then(({ neon }) => neon(databaseUrl))
      .catch((error) => {
        cachedDatabaseUrl = null;
        cachedSqlPromise = null;
        throw error;
      });
  }
  return cachedSqlPromise;
}

export async function findInternalUserByEmail(email, options = {}) {
  const sql = options.sql ?? await getInternalSql(options.env);
  const rows = await sql`
    SELECT
      email AS id,
      email,
      display_name,
      password_hash,
      role
    FROM internal_users
    WHERE lower(email) = lower(${email})
      AND active IS TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}
