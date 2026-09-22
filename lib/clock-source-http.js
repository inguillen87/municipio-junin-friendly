import { CLOCK_SOURCE_MAX_BODY, CLOCK_SOURCE_ORIGIN, sourceFail } from './clock-source-contract.js';
export function sourceHeaders(res) {
  for (const [key,value] of Object.entries({'Cache-Control':'private, no-store, max-age=0',Pragma:'no-cache',Vary:'Cookie, Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'})) res.setHeader(key,value);
}
export function sourceHeader(req, name) {
  const entries = Object.entries(req.headers || {}).filter(([key]) => key.toLowerCase() === name);
  if (entries.length > 1 || entries.some(([,value]) => typeof value !== 'string')
    || Array.isArray(req.rawHeaders) && req.rawHeaders.filter((value,index) => index % 2 === 0 && String(value).toLowerCase() === name).length > 1) sourceFail('CLOCK_SOURCE_QUERY_INVALID');
  return entries[0]?.[1] || '';
}
export function sourceRequestShape(req, path, write = false) {
  let url; try { url = new URL(req.url || '/', CLOCK_SOURCE_ORIGIN); } catch { sourceFail('CLOCK_SOURCE_QUERY_INVALID'); }
  if (url.origin !== CLOCK_SOURCE_ORIGIN || url.pathname !== path || url.search || url.hash || !req.query && req.query !== undefined
    || req.query && (typeof req.query !== 'object' || Array.isArray(req.query) || Object.keys(req.query).length)) sourceFail('CLOCK_SOURCE_QUERY_INVALID');
  const origin = sourceHeader(req,'origin'), site = sourceHeader(req,'sec-fetch-site'), length = sourceHeader(req,'content-length');
  if (write ? !!origin || !!site : origin && origin !== CLOCK_SOURCE_ORIGIN || site && !['same-origin','none'].includes(site)) sourceFail('CLOCK_SOURCE_ORIGIN_DENIED');
  if (sourceHeader(req,'transfer-encoding') || length && (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length)))) sourceFail('CLOCK_SOURCE_QUERY_INVALID');
  if (!write && (req.body !== undefined || length && length !== '0')) sourceFail('CLOCK_SOURCE_QUERY_INVALID');
  if (write && length && Number(length) > CLOCK_SOURCE_MAX_BODY) sourceFail('CLOCK_SOURCE_BODY_TOO_LARGE');
}
function parseWireJson(text) {
  // All wire object fields are top-level and names are disjoint. Decode escaped
  // property names before comparing so JSON.parse cannot hide duplicate fields.
  const seen = new Set();
  try {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '"') continue;
      const start = i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      const end = i + 1; let next = end;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (text[next] === ':') { const key = JSON.parse(text.slice(start,end)); if (seen.has(key)) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID'); seen.add(key); }
    }
    return JSON.parse(text);
  } catch { sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID'); }
}
export async function readSourceBody(req) {
  let value = req.body;
  if (value === undefined && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = []; let size = 0;
    for await (const chunk of req) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > CLOCK_SOURCE_MAX_BODY) sourceFail('CLOCK_SOURCE_BODY_TOO_LARGE'); chunks.push(bytes); }
    value = Buffer.concat(chunks,size);
  }
  if (typeof value === 'string') value = Buffer.from(value);
  if (!Buffer.isBuffer(value)) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID');
  if (value.length > CLOCK_SOURCE_MAX_BODY) sourceFail('CLOCK_SOURCE_BODY_TOO_LARGE');
  let text; try { text = new TextDecoder('utf-8',{fatal:true}).decode(value); } catch { sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID'); }
  return parseWireJson(text);
}
