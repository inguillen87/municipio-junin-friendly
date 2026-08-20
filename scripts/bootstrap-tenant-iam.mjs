import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { stableJson } from './lib/canonical-import.mjs';

function required(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${name}`);
  return text;
}

function deterministicUuidV4(value) {
  const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function bootstrapConfiguration(env = process.env) {
  const ownerEmail = required(env.PLATFORM_OWNER_EMAIL, 'PLATFORM_OWNER_EMAIL').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 254) {
    throw new Error('PLATFORM_OWNER_EMAIL invalido');
  }
  const config = {
    ownerEmail,
    slug: String(env.JUNIN_TENANT_SLUG || 'junin-mendoza').trim().toLowerCase(),
    legalName: String(env.JUNIN_TENANT_LEGAL_NAME || 'Municipalidad de Junín').trim(),
    shortName: String(env.JUNIN_TENANT_SHORT_NAME || 'Junín').trim(),
    kind: String(env.JUNIN_TENANT_KIND || 'municipality').trim(),
    jurisdiction: String(env.JUNIN_TENANT_JURISDICTION || 'Mendoza, Argentina').trim(),
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.slug)) throw new Error('JUNIN_TENANT_SLUG invalido');
  return Object.freeze(config);
}

async function main() {
  const config = bootstrapConfiguration();
  const commandMaterial = stableJson({ version: 1, ...config });
  const commandHash = createHash('sha256').update(commandMaterial).digest('hex');
  const idempotencyKey = deterministicUuidV4(`tenant-iam-bootstrap:${commandMaterial}`);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:tenant-iam-bootstrap'))`);
    const owners = await client.query(`
      SELECT email, display_name
      FROM internal_users
      WHERE lower(email) = lower($1) AND active IS TRUE
      FOR SHARE
    `, [config.ownerEmail]);
    if (owners.rowCount !== 1) {
      throw new Error('PLATFORM_OWNER_EMAIL debe coincidir con exactamente un usuario interno activo');
    }

    const existingTenant = await client.query(
      'SELECT * FROM platform_tenant WHERE lower(slug) = lower($1) FOR UPDATE', [config.slug],
    );
    let tenant;
    if (existingTenant.rowCount) {
      tenant = existingTenant.rows[0];
      if (tenant.legal_name !== config.legalName
          || tenant.short_name !== config.shortName
          || tenant.tenant_kind !== config.kind
          || tenant.jurisdiction !== config.jurisdiction) {
        throw new Error('El tenant Junin existente no coincide con el bootstrap confirmado');
      }
    } else {
      const inserted = await client.query(`
        INSERT INTO platform_tenant (
          slug, legal_name, short_name, tenant_kind, jurisdiction,
          status, created_by_user_email
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
        RETURNING *
      `, [
        config.slug, config.legalName, config.shortName, config.kind,
        config.jurisdiction, owners.rows[0].email,
      ]);
      tenant = inserted.rows[0];
    }

    await client.query(`
      INSERT INTO platform_crm_account (tenant_id, implementation_stage, service_owner_user_email)
      VALUES ($1, 'live', $2)
      ON CONFLICT (tenant_id) DO NOTHING
    `, [tenant.id, owners.rows[0].email]);
    const previous = await client.query(`
      SELECT command_hash FROM tenant_iam_event
      WHERE lower(actor_user_email) = lower($1) AND idempotency_key = $2
    `, [owners.rows[0].email, idempotencyKey]);
    if (previous.rowCount && previous.rows[0].command_hash.trim() !== commandHash) {
      throw new Error('La identidad idempotente del bootstrap fue reutilizada con otro contenido');
    }
    const existingOwnerRole = await client.query(`
      SELECT active, revoked_at
      FROM platform_user_role
      WHERE user_email = $1 AND role_key = 'PLATFORM_OWNER'
      FOR UPDATE
    `, [owners.rows[0].email]);
    if (existingOwnerRole.rowCount && existingOwnerRole.rows[0].active !== true) {
      throw new Error('PLATFORM_OWNER fue revocado y el bootstrap no puede reactivarlo');
    }
    if (previous.rowCount && existingOwnerRole.rowCount !== 1) {
      throw new Error('El bootstrap ya fue aplicado pero PLATFORM_OWNER no esta asignado; requiere recuperacion auditada');
    }
    if (!previous.rowCount && !existingOwnerRole.rowCount) {
      await client.query(`
        INSERT INTO platform_user_role (user_email, role_key, active, granted_by_user_email)
        VALUES ($1, 'PLATFORM_OWNER', true, $1)
      `, [owners.rows[0].email]);
    }
    if (!previous.rowCount) {
      const safeResult = {
        tenant: { id: tenant.id, slug: tenant.slug, status: tenant.status },
        platformRole: 'PLATFORM_OWNER',
        operationalLegacyRoleChanged: false,
        employmentLinkCreated: false,
      };
      await client.query(`
        INSERT INTO tenant_iam_event (
          actor_user_email, tenant_id, command, target_type, target_id,
          idempotency_key, command_hash, result
        ) VALUES ($1, $2::uuid, 'bootstrap_platform_owner', 'tenant', $2::uuid::text, $3, $4, $5::jsonb)
      `, [owners.rows[0].email, tenant.id, idempotencyKey, commandHash, JSON.stringify(safeResult)]);
    }
    await client.query('COMMIT');
    console.log(`tenant IAM bootstrap: OK (tenant ${tenant.id}, PLATFORM_OWNER asignado, sin cuentas nuevas)`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
