// Municipal normative registry. Every request requires a managed, scoped session.
import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { legalUuid } from '../assets/legal-registry-model.js';
import { documentaryReview } from '../lib/internal-documentary-review.js';
import { documentaryInput } from '../assets/legal-documentary-review.js';
import {
  LegalError, legalFail, legalSafeError, prepareLegalDraft,
  legalOperation, legalDownload,
} from '../lib/internal-legal-registry.js';
export const config = { api: { bodyParser: false } };
const MAX_BODY_BYTES = 3 * 1024 * 1024;

export function strictLegalJson(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{' || char === '[') {
      stack.push(char === '{' ? new Set() : null);
      if (stack.length > 16) legalFail('INPUT_INVALID');
    } else if (char === '}' || char === ']') stack.pop();
    else if (char === '"') {
      const start = i++;
      for (; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') i++;
      }
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (text[next] === ':') {
        let key;
        try { key = JSON.parse(text.slice(start, i + 1)); }
        catch { legalFail('INPUT_INVALID'); }
        const set = stack.at(-1);
        if (!set || set.has(key)) legalFail('INPUT_INVALID');
        set.add(key);
      }
    }
  }
  try { return JSON.parse(text); } catch { legalFail('INPUT_INVALID'); }
}
export async function readLegalBody(req) {
  schoolCertificateHttp.checkLength(req, MAX_BODY_BYTES);
  let value = req.body;
  if (value === undefined && req[Symbol.asyncIterator]) {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) throw new LegalError('TOO_LARGE', 413, 'La solicitud supera el límite.');
      chunks.push(bytes);
    }
    value = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > MAX_BODY_BYTES) throw new LegalError('TOO_LARGE', 413, 'La solicitud supera el límite.');
    value = strictLegalJson(value);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Buffer.byteLength(JSON.stringify(value)) > MAX_BODY_BYTES) legalFail('INPUT_INVALID');
  return value;
}
function query(req, method) {
  const q = req.query || {};
  const raw = new URL(req.url || '', 'http://local.invalid').searchParams;
  if (Object.values(q).some(x => typeof x !== 'string') || raw.size !== Object.keys(q).length
      || new Set(raw.keys()).size !== raw.size || [...raw].some(([k,v]) => q[k] !== v)) legalFail('INPUT_INVALID');
  if (method === 'POST') {
    if (Object.keys(q).length) legalFail('INPUT_INVALID');
    return { op: 'save', input: {} };
  }
  const op = q.resource;
  const fields = { bootstrap:['resource'], list:['resource','q','kind','year','page'],
    detail:['resource','id','version'], download:['resource','id','version'], attempt:['resource','key'], documentary_review:['resource','filter','page'] }[op];
  if (!fields || Object.keys(q).sort().join('|') !== fields.sort().join('|')) legalFail('INPUT_INVALID');
  if (op === 'documentary_review') {
    if (!/^[1-9][0-9]{0,2}$/.test(q.page)) legalFail('INPUT_INVALID');
    return {op,input:documentaryInput(q.filter,+q.page)};
  }
  if (op === 'list') {
    if (!/^[1-9][0-9]{0,2}$/.test(q.page) || +q.page > 200 || q.q.length > 160) legalFail('INPUT_INVALID');
    return {op,input:{q:q.q,kind:q.kind,year:q.year,page:+q.page}};
  }
  if (['detail','download'].includes(op)) {
    if (!legalUuid(q.id) || q.version !== '' && (!/^[1-9][0-9]{0,3}$/.test(q.version) || +q.version > 1000)) legalFail('INPUT_INVALID');
    return {op,input:{id:q.id,version:q.version === '' ? null : +q.version}};
  }
  return {op,input:{},key:q.key};
}
export function createLegalRegistryHandler(deps = {}) {
  const env = deps.env ?? process.env;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET','POST'].includes(method)) {
        res.setHeader('Allow','GET, POST'); throw new LegalError('METHOD',405,'Método no permitido.');
      }
      const {op,input,key} = query(req, method);
      if (method === 'POST') {
        schoolCertificateHttp.assertOrigin(req, env);
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(schoolCertificateHttp.header(req,'content-type'))) throw new LegalError('CONTENT_TYPE',415,'Se requiere application/json.');
        schoolCertificateHttp.checkLength(req, MAX_BODY_BYTES);
      }
      const caps = ['legal.norm.read', ...(['save','attempt'].includes(op) ? ['legal.norm.register'] : [])];
      const access = await (deps.authorize ?? requireCompatibleInternalAccess)(req, res, {
        env, requiredCapabilities:caps, capabilityMode:'all', allowLegacy:false,
        requireDataPlaneReady:false, requireCertifiedDataBinding:false,
      });
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership'
          || !principalHasCapabilities(access.principal, caps)) legalFail('FORBIDDEN');
      const session = deps.sessionFor ? deps.sessionFor(access, env) : access.session;
      const attempt = op === 'save' ? schoolCertificateHttp.header(req,'idempotency-key') : key;
      if (['save','attempt'].includes(op) && (!legalUuid(attempt) || attempt[14] !== '4')) legalFail('INPUT_INVALID');
      const payload = op === 'save' ? await prepareLegalDraft(await readLegalBody(req), deps.validatePdf) : input;
      const sql = await (deps.getSql ?? getActionCenterSql)(env);
      const data = op === 'documentary_review' ? await documentaryReview(sql,access.principal,session,payload) : await legalOperation(sql, access.principal, session, op, payload, attempt ?? null);
      if (op === 'download') {
        const bytes = legalDownload(data);
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`attachment; filename="norma-${input.id}-v${input.version || 'actual'}.pdf"`);
        res.setHeader('Content-Length',String(bytes.length));
        res.setHeader('X-Document-Sha256',data.sha256);
        return res.status(200).end(bytes);
      }
      if (data.replayed) res.setHeader('Idempotency-Replayed','true');
      return res.status(op === 'save' && !data.replayed ? 201 : 200).json({ok:true,data});
    } catch (error) {
      const safe = legalSafeError(error);
      return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
    }
  };
}
export default createLegalRegistryHandler();
