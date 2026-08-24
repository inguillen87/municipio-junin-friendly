import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EMAIL_OTP_MFA_PROTECTED_RELATIONS,
  EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
  EMAIL_OTP_MFA_SIGNATURES,
  validateEmailOtpMfaEvidence,
  validateEmailOtpMfaMigrationSql,
} from '../scripts/apply-email-otp-mfa-schema.mjs';

const migrationUrl = new URL('../scripts/migrations/015-email-otp-mfa.sql', import.meta.url);
const identityGatewayUrl = new URL('../scripts/migrations/005-tenant-identity-gateway.sql', import.meta.url);

function functionDefinition(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, `funcion ${name} ausente`);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(end > start, `cierre ${name} ausente`);
  return sql.slice(start, end + 4);
}

test('firmas 015 usan la forma canonica que devuelve PostgreSQL', () => {
  assert.equal(
    EMAIL_OTP_MFA_SIGNATURES.prepare,
    'public.tenant_identity_prepare_email_mfa(text,uuid,text,timestamp with time zone,integer,uuid)',
  );
  assert.equal(
    EMAIL_OTP_MFA_SIGNATURES.complete,
    'public.tenant_identity_complete_email_mfa(text,uuid,text,uuid,timestamp with time zone,text,text,integer,uuid,text)',
  );
});

test('015 mantiene TOTP cerrado y modela email recovery en tablas separadas', async () => {
  const [sql, gateway] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(identityGatewayUrl, 'utf8'),
  ]);
  assert.match(gateway, /tenant_identity_mfa_factor_kind_ck CHECK \(factor_kind = 'totp'\)/);
  assert.doesNotMatch(sql, /ALTER TABLE\s+tenant_identity_mfa_factor/i);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+tenant_identity_mfa_factor/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS tenant_identity_email_factor\b/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS tenant_identity_email_otp_challenge\b/);
  assert.match(sql, /NO amplia ni modifica[\s\S]+tenant_identity_mfa_factor/i);
});

test('factor email conserva solo destino cifrado, HMAC, version y ciclo owner-governed', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /user_email text NOT NULL REFERENCES internal_users\(email\)/);
  assert.match(sql, /destination_ciphertext text NOT NULL/);
  assert.match(sql, /destination_hash char\(64\) NOT NULL/);
  assert.match(sql, /key_version smallint NOT NULL DEFAULT 1/);
  assert.match(sql, /status IN \('pending', 'verified', 'revoked'\)/);
  assert.match(sql, /provision_reason_hash char\(64\) NOT NULL/);
  assert.match(sql, /provision_idempotency_key uuid NOT NULL UNIQUE/);
  assert.match(sql, /tenant_identity_email_factor_live_uk[\s\S]+lower\(user_email\)[\s\S]+status IN \('pending', 'verified'\)/);

  const provision = functionDefinition(sql, 'tenant_identity_provision_email_factor_v1');
  assert.match(provision, /pg_advisory_xact_lock/);
  assert.match(provision, /provision_idempotency_key = p_idempotency_key FOR UPDATE/);
  assert.match(provision, /IDENTITY_EMAIL_FACTOR_IDEMPOTENCY_REUSED/);
  assert.doesNotMatch(provision, /replay\.destination_ciphertext IS DISTINCT FROM p_destination_ciphertext/);
  assert.match(provision, /SET status = 'revoked', revoked_at = now\(\), version = version \+ 1/);
  assert.doesNotMatch(provision, /'(?:email|userEmail|destinationCiphertext|destinationHash)'\s*,/);
});

test('desafio email OTP queda ligado al login_mfa, factor, intento, sesion y cinco minutos', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /auth_challenge_id uuid NOT NULL REFERENCES tenant_identity_auth_challenge\(id\)/);
  assert.match(sql, /factor_id uuid NOT NULL REFERENCES tenant_identity_email_factor\(id\)/);
  assert.match(sql, /completed_session_id uuid REFERENCES tenant_identity_session\(id\)/);
  assert.match(sql, /delivery_attempt_id uuid NOT NULL UNIQUE/);
  assert.match(sql, /provider_accepted_at timestamptz/);
  assert.match(sql, /code_hash char\(64\) NOT NULL/);
  assert.match(sql, /max_attempts integer NOT NULL DEFAULT 5/);
  assert.match(sql, /max_attempts = 5 AND attempts BETWEEN 0 AND max_attempts/);
  assert.match(sql, /expires_at <= issued_at \+ interval '5 minutes'/);
  for (const state of ['pending_delivery', 'active', 'failed', 'consumed', 'locked', 'superseded']) {
    assert.match(sql, new RegExp(`'${state}'`));
  }
  assert.match(sql, /tenant_identity_email_otp_live_uk/);
  assert.match(sql, /tenant_identity_email_otp_cooldown_idx/);
  assert.match(sql, /tenant_identity_email_otp_auth_history_idx/);
});

test('prepare exige flow/version, cooldown y replay exacto sin exponer email ni codigo', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const prepare = functionDefinition(sql, 'tenant_identity_prepare_email_mfa');
  assert.match(prepare, /tenant_identity_prepare_email_mfa\(\s*p_flow_hash text,\s*p_idempotency_key uuid,\s*p_code_hash text,\s*p_expires_at timestamptz,\s*p_expected_version integer,\s*p_delivery_attempt_id uuid/s);
  assert.match(prepare, /auth_row\.purpose <> 'login_mfa'/);
  assert.match(prepare, /auth_row\.status <> 'pending'/);
  assert.match(prepare, /auth_row\.version IS DISTINCT FROM p_expected_version/);
  assert.match(prepare, /interval '45 seconds'/);
  assert.match(prepare, /SET status = 'superseded'/);
  assert.match(prepare, /IDENTITY_EMAIL_MFA_IDEMPOTENCY_REUSED/);
  for (const field of [
    'id', 'deliveryAttemptId', 'destinationCiphertext', 'destinationHash',
    'expiresAt', 'status', 'flowVersion', 'factorVersion', 'version',
  ]) assert.match(prepare, new RegExp(`'${field}'`));
  assert.doesNotMatch(prepare, /'(?:email|userEmail|code|codeHash)'\s*,/);
});

test('callback de proveedor es exacto, idempotente y no puede reactivar un intento terminal', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const mark = functionDefinition(sql, 'tenant_identity_mark_email_mfa_delivery');
  assert.match(mark, /tenant_identity_mark_email_mfa_delivery\(\s*p_flow_hash text,\s*p_delivery_attempt_id uuid,\s*p_provider_accepted boolean/s);
  assert.match(mark, /delivery_attempt_id = p_delivery_attempt_id FOR UPDATE/);
  assert.match(mark, /otp_row\.status = 'active' AND p_provider_accepted IS TRUE/);
  assert.match(mark, /otp_row\.status = 'failed' AND p_provider_accepted IS FALSE/);
  assert.match(mark, /otp_row\.status <> 'pending_delivery'/);
  assert.match(mark, /SET status = 'active', provider_accepted_at = now_value, version = version \+ 1/);
  assert.match(mark, /SET status = 'failed', failed_at = now_value, version = version \+ 1/);
  assert.doesNotMatch(mark, /'(?:email|userEmail|destinationCiphertext|destinationHash|code|codeHash)'\s*,/);
});

test('complete persiste lockout e idempotencia, entrega sesion al backend y audita sin email', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const complete = functionDefinition(sql, 'tenant_identity_complete_email_mfa');
  assert.match(complete, /tenant_identity_complete_email_mfa\(\s*p_flow_hash text,\s*p_idempotency_key uuid,\s*p_code_hash text,\s*p_session_id uuid,\s*p_session_expires_at timestamptz,\s*p_device text,\s*p_ip_approx text,\s*p_expected_version integer,\s*p_delivery_attempt_id uuid,\s*p_command_hash text/s);
  assert.match(complete, /otp_row\.status <> 'active'/);
  assert.match(complete, /otp_row\.version IS DISTINCT FROM p_expected_version/);
  assert.match(complete, /next_attempts := otp_row\.attempts \+ 1/);
  assert.match(complete, /status = CASE WHEN locked_value THEN 'locked' ELSE 'active' END/);
  assert.match(complete, /'remainingAttempts', otp_row\.max_attempts - otp_row\.attempts/);
  assert.ok((complete.match(/INSERT INTO tenant_iam_event/g) || []).length >= 2);
  assert.match(complete, /audit_row\.command_hash IS DISTINCT FROM p_command_hash/);
  assert.match(complete, /IDENTITY_EMAIL_MFA_REPLAY/);
  assert.match(complete, /SET status = 'verified', verified_at = now_value, version = version \+ 1/);
  assert.match(complete, /tenant_identity_create_session\([\s\S]+p_session_expires_at, 'recovery'/);
  assert.match(complete, /SET status = 'consumed', consumed_at = now_value/);
  assert.match(complete, /'session', session_value,/);
  assert.match(complete, /audit_value := \(response_value - 'session'\)[\s\S]+?'session', session_value - 'email'/);
  assert.match(complete, /jsonb_set\([\s\S]+?response_value, '\{session,email\}'/);
  assert.doesNotMatch(
    complete.replaceAll("'session', session_value,", "'sessionSanitized', session_value,")
      .replaceAll("'session', session_value - 'email'", "'sessionSanitized', session_value_sanitized")
      .replaceAll("'{session,email}'", "'{sessionDestination}'"),
    /'(?:email|userEmail|destinationCiphertext|destinationHash|code|codeHash)'\s*,/,
  );
});

test('ACL deja DML owner-only y runtime ejecuta solo las tres fachadas dedicadas', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE tenant_identity_email_factor,\s*tenant_identity_email_otp_challenge FROM PUBLIC CASCADE/);
  assert.match(sql, /aclexplode\(COALESCE\([\s\S]+relation\.relacl/);
  assert.match(sql, /aclexplode\(attribute\.attacl\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE tenant_identity_email_factor,[\s\S]+FROM municontrol_actions_runtime_app CASCADE/);
  const runtimeGrants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION\s+(tenant_identity_[a-z0-9_]+)\([^;]+?TO municontrol_actions_runtime_app;/gs)]
    .map((match) => match[1]);
  assert.deepEqual(runtimeGrants, [
    'tenant_identity_prepare_email_mfa',
    'tenant_identity_mark_email_mfa_delivery',
    'tenant_identity_complete_email_mfa',
  ]);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION tenant_identity_provision_email_factor_v1[\s\S]+TO municontrol_actions_runtime_app/);
  for (const name of [
    'tenant_identity_email_factor_guard_v1',
    'tenant_identity_email_otp_guard_v1',
    'tenant_identity_provision_email_factor_v1',
    'tenant_identity_prepare_email_mfa',
    'tenant_identity_mark_email_mfa_delivery',
    'tenant_identity_complete_email_mfa',
  ]) {
    const definition = functionDefinition(sql, name);
    assert.match(definition, /SECURITY DEFINER/);
    assert.match(definition, /SET search_path = pg_catalog, public, pg_temp/);
  }
});

test('contrato no contiene destinos de prueba ni material OTP en claro', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /gmail\.com|guillen|marcelo@/i);
  assert.doesNotMatch(sql, /\b(?:raw_code|plain_code|otp_code)\b/i);
  assert.match(sql, /Auditoria separada para recovery email/i);
  assert.match(sql, /nunca codigo ni PII en resultados/i);
  assert.match(sql, /destination_hash y code_hash son HMAC SHA-256/i);
});

test('runner 015 exige search_path endurecido, ACL exacta y allowlist runtime cerrada', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.equal(validateEmailOtpMfaMigrationSql(sql), true);
  const owner = 'neondb_owner';
  const functions = Object.values(EMAIL_OTP_MFA_SIGNATURES).map((signature) => ({
    signature, securityDefiner: true, ownerMatches: true, safeSearchPath: true, owner,
    grants: signature === EMAIL_OTP_MFA_SIGNATURES.provision
      ? [`${owner}:EXECUTE`]
      : [`${owner}:EXECUTE`, 'municontrol_actions_runtime_app:EXECUTE'],
  }));
  const evidence = {
    functions,
    runtimeFunctions: [...EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST],
    relations: EMAIL_OTP_MFA_PROTECTED_RELATIONS.map((name) => ({
      name, ownerMatches: true, runtimeSelect: false, runtimeInsert: false,
      runtimeUpdate: false, runtimeDelete: false, publicAccess: false,
      nonOwnerPrivilegeCount: 0,
    })),
  };
  assert.equal(validateEmailOtpMfaEvidence(evidence), true);
  assert.throws(
    () => validateEmailOtpMfaEvidence({
      ...evidence,
      functions: functions.map((entry, index) => (
        index === 0 ? { ...entry, safeSearchPath: false } : entry
      )),
    }),
    /funcion 015 insegura/,
  );
});
