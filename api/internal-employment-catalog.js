import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { parseScopedPrivateJson, readRawPrivateJson } from '../lib/private-json-body.js';
import { EMPLOYMENT_CATALOG_MAX_BYTES, EMPLOYMENT_CATALOG_READ, EMPLOYMENT_CATALOG_CAPS, catalogFail, employmentCatalogError, employmentCatalogOperation } from '../lib/internal-employment-catalog.js';
export const config = {api: {bodyParser: false}};

// Duplicate names are rejected within each object, while repeated row fields in
// separate array entries are expected. JSON.parse remains the grammar validator.
export function parseCatalogJson(source) {
  try {return parseScopedPrivateJson(source);} catch {catalogFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');}
}
export async function readPrivateJsonBody(req, {timeoutMs = 10000, maxBytes = EMPLOYMENT_CATALOG_MAX_BYTES} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > EMPLOYMENT_CATALOG_MAX_BYTES) catalogFail('INPUT_INVALID', 400, 'Límite de lectura inválido.');
  schoolCertificateHttp.checkLength(req, maxBytes);
  return readRawPrivateJson(req, {timeoutMs, maxBytes, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
    if (kind === 'large') catalogFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
    if (kind === 'unavailable') catalogFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Reintentá el mismo contenido.');
    catalogFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
  }});
}
export async function readCatalogBody(req, options = {}) {
  const value = await readPrivateJsonBody(req, options);
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join('|') !== 'operation|payload'
    || !Object.hasOwn(EMPLOYMENT_CATALOG_CAPS, value.operation)) catalogFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
  if (Buffer.byteLength(JSON.stringify(value)) > (options.maxBytes ?? EMPLOYMENT_CATALOG_MAX_BYTES)) catalogFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
  return value;
}
export function createEmploymentCatalogHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); catalogFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      const q = req.query ?? {};
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) catalogFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) catalogFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      let operation, input;
      if (method === 'POST') {
        if (Object.keys(q).length) catalogFail('QUERY_INVALID', 400, 'No se admiten parámetros en la operación.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') catalogFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, EMPLOYMENT_CATALOG_MAX_BYTES);
      } else if (q.resource === 'bootstrap' && Object.keys(q).length === 1) { operation = 'bootstrap'; input = {}; }
      else if (q.resource === 'proposal' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'proposal'; input = {id: q.id}; }
      else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = {key: q.key}; }
      else catalogFail('QUERY_INVALID', 400, 'Consulta inválida.');
      const access = await authorize(req, res, {env, requiredCapabilities: [EMPLOYMENT_CATALOG_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [EMPLOYMENT_CATALOG_READ])) catalogFail('FORBIDDEN', 403, 'La membresía no permite consultar este catálogo.');
      if (method === 'POST') {
        const body = await readCatalogBody(req); operation = body.operation;
        if (!principalHasCapabilities(access.principal, [EMPLOYMENT_CATALOG_CAPS[operation]])) catalogFail('FORBIDDEN', 403, 'La membresía no permite esta operación sobre el catálogo.');
        input = {body: body.payload, key: schoolCertificateHttp.header(req, 'idempotency-key')};
      }
      const data = await employmentCatalogOperation(await getSql(env), access.principal, sessionFor(access, env), operation, input);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (error) {
      const safe = String(error?.code || '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(error) : employmentCatalogError(error);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createEmploymentCatalogHandler();
