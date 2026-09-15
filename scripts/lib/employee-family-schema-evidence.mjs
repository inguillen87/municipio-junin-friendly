import assert from 'node:assert/strict';

// Keep hashes only in memory. Appended reads/registrations are legitimate while
// applying the additive schema; every pre-existing immutable row must survive.
export async function employeeFamilySchemaEvidence(client) {
  return (await client.query(`SELECT
    (SELECT coalesce(jsonb_object_agg(id,md5((to_jsonb(c)-'own_family_id')::text)),'{}'::jsonb) FROM school_certificate c) AS certificates,
    (SELECT coalesce(jsonb_object_agg(tenant_id::text||':'||sha256,md5(to_jsonb(b)::text)),'{}'::jsonb) FROM school_certificate_blob b) AS blobs,
    (SELECT coalesce(jsonb_object_agg(id,md5(to_jsonb(e)::text)),'{}'::jsonb) FROM school_certificate_event e) AS events,
    (SELECT coalesce(jsonb_object_agg(p.oid::text,md5(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text)),'{}'::jsonb)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'school_certificate_%' AND p.proname NOT LIKE '%_v2') AS legacy_functions,
    (SELECT jsonb_object_agg(c.relname,md5(coalesce(c.relacl::text,'')||c.relowner::text)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('school_certificate','school_certificate_blob','school_certificate_event','school_certificate_storage_policy')) AS legacy_table_acl`)).rows[0];
}

export function assertEmployeeFamilySchemaPreserved(before, after) {
  for (const group of ['certificates','blobs','events']) {
    for (const [key, hash] of Object.entries(before[group])) assert.equal(after[group][key], hash, 'EXISTING_SCHOOLING_ROW_CHANGED');
  }
  assert.deepEqual(after.legacy_functions, before.legacy_functions, 'SCHOOLING_057_FUNCTION_OR_ACL_CHANGED');
  assert.deepEqual(after.legacy_table_acl, before.legacy_table_acl, 'SCHOOLING_057_TABLE_ACL_CHANGED');
}

export function employeeFamilyStorageMeasurement(row) {
  const c = row.capacity;
  assert.ok(c && [row.database_bytes,c.clusterBytes,c.clusterLimitBytes,c.clusterReserveBytes].every(value => value !== null && value !== undefined && value !== ''), 'STORAGE_MEASUREMENT_UNAVAILABLE');
  const databaseBytes = Number(row.database_bytes), clusterBytes = Number(c.clusterBytes), clusterLimitBytes = Number(c.clusterLimitBytes);
  assert.ok([databaseBytes, clusterBytes, clusterLimitBytes, c.clusterReserveBytes].every(n => Number.isSafeInteger(n) && n >= 0), 'STORAGE_MEASUREMENT_UNAVAILABLE');
  assert.ok(c.capacityBytes >= 0 && c.capacityBytes <= 8388608, 'STORAGE_QUOTA_INVALID');
  assert.ok(c.clusterReserveBytes >= 16777216, 'STORAGE_RESERVE_INVALID');
  const clusterFreeBytes = clusterLimitBytes - clusterBytes;
  assert.ok(clusterFreeBytes >= c.clusterReserveBytes, 'STORAGE_ACTUAL_RESERVE_EXHAUSTED');
  return { databaseBytes, clusterBytes, clusterLimitBytes, clusterFreeBytes, clusterReserveBytes:c.clusterReserveBytes,
    bytesAboveReserve:clusterFreeBytes-c.clusterReserveBytes, mode:c.mode, usedBytes:c.usedBytes,
    capacityBytes:c.capacityBytes, remainingBytes:c.remainingBytes };
}

export function employeeFamilyApplierArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-z]+(?:-[a-z]+)*)=(.+)$/.exec(arg);
    assert.ok(match, 'INVALID_ARGUMENT_FORMAT');
    assert.ok(['confirm-operational-branch','backup-report','apply','expected-checksum'].includes(match[1]), 'UNKNOWN_ARGUMENT');
    assert.ok(!Object.hasOwn(args,match[1]), 'DUPLICATE_ARGUMENT'); args[match[1]]=match[2];
  }
  assert.match(args['expected-checksum'] ?? '', /^[a-f0-9]{64}$/, 'EXPECTED_CHECKSUM_REQUIRED');
  assert.ok(args.apply === undefined || ['true','false'].includes(args.apply), 'INVALID_APPLY_MODE');
  return args;
}

export function employeeFamilyOperationalUrl(value) {
  let url; try { url = new URL(value); } catch { throw Error('DATABASE_URL_INVALID'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'INVALID_DATABASE_PROTOCOL');
  assert.equal(decodeURIComponent(url.username), 'neondb_owner', 'OWNER_CONNECTION_REQUIRED');
  assert.ok(url.password, 'DATABASE_PASSWORD_REQUIRED');
  assert.equal(url.hostname, 'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech', 'OPERATIONAL_ENDPOINT_REQUIRED');
  assert.equal(url.port, '5432', 'OPERATIONAL_PORT_REQUIRED');
  assert.equal(url.pathname, '/neondb', 'OPERATIONAL_DATABASE_REQUIRED');
  assert.equal(url.hash, '', 'UNEXPECTED_CONNECTION_ROUTING');
  const keys = [...url.searchParams.keys()];
  assert.ok(keys.every(key => ['sslmode','channel_binding'].includes(key)) && new Set(keys).size === keys.length, 'UNEXPECTED_CONNECTION_ROUTING');
  assert.ok(['require','verify-full'].includes(url.searchParams.get('sslmode')), 'DATABASE_TLS_REQUIRED');
  assert.ok(!url.searchParams.has('channel_binding') || url.searchParams.get('channel_binding') === 'require', 'DATABASE_CHANNEL_BINDING_INVALID');
  return url;
}

export async function readEmployeeFamilyStorageMeasurement(client) {
  const row = (await client.query('SELECT pg_database_size(current_database()) AS database_bytes, school_certificate_storage_capacity_v1() AS capacity')).rows[0];
  return employeeFamilyStorageMeasurement(row);
}
