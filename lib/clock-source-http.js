import { CLOCK_SOURCE_MAX_BODY, CLOCK_SOURCE_ORIGIN, ClockSourceError, sourceFail } from './clock-source-contract.js';
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
function sourceStreamBytes(req, timeoutMs) {
  return new Promise((resolve,reject) => {
    const chunks = [], listeners = []; let size = 0, settled = false, iterator;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      for (const [emitter,event,listener] of listeners) emitter?.removeListener?.(event,listener);
      if (error) { chunks.length = 0; if (iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {}); reject(error); }
      else resolve(Buffer.concat(chunks,size));
    };
    const unavailable = () => finish(new ClockSourceError('CLOCK_SOURCE_UNAVAILABLE'));
    const timer = setTimeout(unavailable,timeoutMs);
    const accept = chunk => {
      if (settled) return;
      // A stream decoded by upstream middleware has already lost invalid UTF-8.
      if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) return finish(new ClockSourceError('CLOCK_SOURCE_PAYLOAD_INVALID'));
      size += chunk.byteLength;
      if (size > CLOCK_SOURCE_MAX_BODY) return finish(new ClockSourceError('CLOCK_SOURCE_BODY_TOO_LARGE'));
      chunks.push(Buffer.from(chunk));
    };
    try {
      if (req.aborted) return unavailable();
      if (typeof req.on === 'function' && typeof req.read === 'function') {
        // @vercel/node restores original bytes through req.on(data/end), even
        // when the IncomingMessage has ended. Its req.body getter JSON.parses
        // the same bytes and cannot preserve duplicate keys. Never touch it.
        // Store the returned emitter: Vercel forwards data/end to PassThrough.
        for (const [event,listener] of [['end',()=>finish()],['error',unavailable],['aborted',unavailable],['close',()=>{if (!req.complete) unavailable();}],['data',accept]]) {
          const emitter = req.on(event,listener); listeners.push([emitter,event,listener]);
        }
      } else {
        iterator = req[Symbol.asyncIterator]();
        (async () => { while (!settled) { const next = await iterator.next(); if (settled) return; if (next.done) return finish(); accept(next.value); } })().catch(unavailable);
      }
    } catch { unavailable(); }
  });
}
export async function readSourceBody(req, {timeoutMs = 10000} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID');
  let value;
  if (typeof req.on === 'function' && typeof req.read === 'function' || typeof req[Symbol.asyncIterator] === 'function') {
    value = await sourceStreamBytes(req,timeoutMs);
  } else {
    // Buffer/string adapters are accepted only as concrete own properties;
    // never evaluate a parser getter or serialize an already parsed object.
    value = Object.getOwnPropertyDescriptor(req,'body')?.value;
  }
  if (typeof value === 'string') value = Buffer.from(value);
  if (!Buffer.isBuffer(value)) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID');
  if (value.length > CLOCK_SOURCE_MAX_BODY) sourceFail('CLOCK_SOURCE_BODY_TOO_LARGE');
  const length = sourceHeader(req,'content-length');
  if (length && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) !== value.length)) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID');
  let text; try { text = new TextDecoder('utf-8',{fatal:true}).decode(value); } catch { sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID'); }
  return parseWireJson(text);
}
