import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact, salaryKey, salaryUuid} from '../assets/native-salary-catalog-model.js';
import {periodClassificationCommand, periodClassificationPeriod, PERIOD_CLASSIFICATION_MAX_BYTES} from '../assets/own-period-classification-model.js';
import {PERIOD_CLASSIFICATION_READ, PERIOD_CLASSIFICATION_CAPS, periodClassificationFail, periodClassificationError, periodClassificationOperation} from '../lib/internal-own-period-classification.js';
export const config = {api:{bodyParser:false}};
export function createOwnPeriodClassificationHandler(deps = {}) {
 const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
 return async (req, res) => {
  schoolCertificateHttp.headers(res);
  try {
   const method = req.method || 'GET', query = req.query ?? {}; let operation, input;
   if (!['GET', 'POST'].includes(method)) {res.setHeader('Allow', 'GET, POST'); periodClassificationFail('METHOD_INVALID', 405, 'Método no admitido.');}
   if (!query || typeof query !== 'object' || Array.isArray(query) || Object.values(query).some(value => typeof value !== 'string')) periodClassificationFail('QUERY_INVALID', 400, 'Consulta inválida.');
   if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(query).length || entries.some(([key, value]) => query[key] !== value) || new Set(entries.map(([key]) => key)).size !== entries.length) periodClassificationFail('QUERY_INVALID', 400, 'Consulta ambigua.');
   }
   if (method === 'POST') {
    if (Object.keys(query).length) periodClassificationFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req, env);
    if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') periodClassificationFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req, PERIOD_CLASSIFICATION_MAX_BYTES);
   } else if (query.resource === 'bootstrap' && Object.keys(query).sort().join('|') === 'contractId|period|resource') {operation = 'bootstrap'; input = {contractId:query.contractId, period:query.period};}
   else if (query.resource === 'detail' && Object.keys(query).sort().join('|') === 'id|resource') {operation = 'detail'; input = {id:query.id};}
   else if (query.resource === 'attempt' && Object.keys(query).sort().join('|') === 'key|resource') {operation = 'attempt'; input = {key:query.key};}
   else periodClassificationFail('QUERY_INVALID', 400, 'Consulta inválida.');
   const access = await authorize(req, res, {env, requiredCapabilities:PERIOD_CLASSIFICATION_READ, capabilityMode:'all', requireDataPlaneReady:true, requireCertifiedDataBinding:true, allowLegacy:false});
   if (!access) return;
   if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, PERIOD_CLASSIFICATION_READ)) periodClassificationFail('FORBIDDEN', 403, 'La membresía no permite consultar encuadres propios por período.');
   const session = sessionFor(access, env); employeeContext(access.principal, session);
   if (method === 'POST') {
    const envelope = await readRawPrivateJson(req, {maxBytes:PERIOD_CLASSIFICATION_MAX_BYTES, maxDepth:8, timeoutMs:10000, declaredLength:schoolCertificateHttp.header(req, 'content-length'), fail:kind => {
     if (kind === 'large') periodClassificationFail('LIMIT', 413, 'El formulario completo supera el tamaño permitido.');
     if (kind === 'unavailable') periodClassificationFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Consultá el mismo intento.');
     periodClassificationFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
    }});
    if (!salaryExact(envelope, ['operation', 'payload']) || envelope.operation !== 'command') periodClassificationFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
    const command = periodClassificationCommand(envelope.payload);
    if (!principalHasCapabilities(access.principal, PERIOD_CLASSIFICATION_CAPS[command.command])) periodClassificationFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
    operation = 'command'; input = {body:command, key:schoolCertificateHttp.header(req, 'idempotency-key')};
   }
   if (operation === 'bootstrap' && (!salaryUuid(input.contractId) || !periodClassificationPeriod(input.period)) || operation === 'detail' && !salaryUuid(input.id)) periodClassificationFail('INPUT_INVALID', 400, 'Elegí un contrato, propuesta y período válidos.');
   if (['attempt', 'command'].includes(operation) && !salaryKey(input.key)) periodClassificationFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
   const sql = await getSql(env), data = await periodClassificationOperation(sql, access.principal, session, operation, input);
   if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
   return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok:true, data});
  } catch (error) {
   const safe = String(error?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(error) : periodClassificationError(error);
   return res.status(safe.status).json({ok:false, code:safe.code, error:safe.message});
  }
 };
}
export default createOwnPeriodClassificationHandler();
