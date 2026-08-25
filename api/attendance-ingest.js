import {
  AttendanceGatewayError,
  attendanceBearerTokenSha256,
  createDefaultAttendanceDriverRegistry,
  ingestAttendanceBatch,
  normalizeAttendanceIngestRequest,
} from '../lib/internal-attendance-gateway.js';
import { TimeDeviceDriverError } from '../lib/internal-time-device-drivers.js';
import { getActionCenterSql } from './internal-actions.js';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

function headers(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function send(res, status, payload) {
  headers(res);
  return res.status(status).json(payload);
}

function firstHeader(req, name) {
  const value = typeof req?.headers?.get === 'function'
    ? req.headers.get(name)
    : (req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]);
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function fail(code, status, message) {
  throw new AttendanceGatewayError(code, status, message);
}

function bearerToken(req) {
  const authorization = firstHeader(req, 'authorization');
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) fail('ATTENDANCE_CONNECTOR_AUTH_INVALID', 401, 'Conector no autorizado');
  return match[1];
}

async function body(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail('ATTENDANCE_CONTENT_TYPE_REQUIRED', 415, 'Content-Type debe ser application/json');
  }
  const declared = Number.parseInt(firstHeader(req, 'content-length'), 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El lote supera 4 MiB');
  }
  let value = req?.body;
  if (value === undefined && req && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El lote supera 4 MiB');
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) {
      fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El lote supera 4 MiB');
    }
    try { value = JSON.parse(value); } catch { fail('ATTENDANCE_JSON_INVALID', 400, 'JSON inválido'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ATTENDANCE_BODY_INVALID', 400, 'El lote debe ser un objeto JSON');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) {
    fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El lote supera 4 MiB');
  }
  return value;
}

function mappedDriverError(error) {
  if (!(error instanceof TimeDeviceDriverError)) return null;
  const unprocessable = /(?:FIELD|TIMEZONE|OFFSET|TIMESTAMP|EVENT|CSV|REL000|CONTEXT|CREDENTIAL)/.test(error.code);
  return new AttendanceGatewayError(
    error.code,
    unprocessable ? 422 : 400,
    'El lote no cumple el contrato del driver',
  );
}

export function createAttendanceIngestHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const normalize = dependencies.normalizeAttendanceIngestRequest ?? normalizeAttendanceIngestRequest;
  const ingest = dependencies.ingestAttendanceBatch ?? ingestAttendanceBatch;
  const registry = dependencies.registry ?? createDefaultAttendanceDriverRegistry();

  return async function attendanceIngestHandler(req, res) {
    const method = String(req?.method || '').toUpperCase();
    try {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
      }
      const tokenSha256 = attendanceBearerTokenSha256(bearerToken(req));
      const requestBody = await body(req);
      const normalized = normalize(requestBody, {
        registry,
        identityPepper: env?.ATTENDANCE_IDENTITY_PEPPER,
      });
      const sql = await getSql(env);
      const receipt = await ingest(
        sql, normalized, tokenSha256, String(env?.VERCEL_GIT_COMMIT_SHA || ''),
      );
      if (receipt.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, receipt.replayed ? 200 : 202, { ok: true, ...receipt });
    } catch (error) {
      const safe = error instanceof AttendanceGatewayError ? error : mappedDriverError(error);
      if (safe) {
        if (safe.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="attendance-connector"');
        return send(res, safe.status, { ok: false, code: safe.code, error: safe.message });
      }
      if (error?.code === 'ACTION_DATABASE_ROLE_REQUIRED') {
        return send(res, 503, {
          ok: false,
          code: 'ATTENDANCE_DATABASE_ROLE_REQUIRED',
          error: 'El rol aislado de marcaciones no está configurado',
        });
      }
      console.error('attendance-ingest unexpected error', { name: error?.name, code: error?.code });
      return send(res, 500, {
        ok: false,
        code: 'ATTENDANCE_INGEST_INTERNAL_ERROR',
        error: 'No se pudo recibir el lote de marcaciones',
      });
    }
  };
}

export default createAttendanceIngestHandler();
