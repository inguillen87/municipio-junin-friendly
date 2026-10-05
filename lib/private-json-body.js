// JSON.parse validates grammar. Property names must be unique in their own
// object; repeating the same row fields in another array entry is valid JSON.
export function parseScopedPrivateJson(source, { maxDepth = 8 } = {}) {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 48) throw Error('Invalid private JSON depth');
  const parsed = JSON.parse(source), stack = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') {
      const start = i++;
      for (; i < source.length && source[i] !== '"'; i++) if (source[i] === '\\') i++;
      let next = i + 1; while (/\s/.test(source[next] ?? '') && next < source.length) next++;
      if (source[next] === ':') {
        const key = JSON.parse(source.slice(start, i + 1)), seen = stack.at(-1);
        if (!(seen instanceof Set) || seen.has(key)) throw Error('Invalid private JSON');
        seen.add(key);
      }
    } else if (source[i] === '{' || source[i] === '[') {
      stack.push(source[i] === '{' ? new Set() : null);
      if (stack.length > maxDepth) throw Error('Invalid private JSON');
    } else if (source[i] === '}' || source[i] === ']') stack.pop();
  }
  return parsed;
}

function streamBytes(req, timeoutMs, maxBytes, fail) {
  return new Promise((resolve, reject) => {
    const chunks = [], listeners = []; let size = 0, settled = false, iterator;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      for (const [emitter, event, listener] of listeners) emitter?.removeListener?.(event, listener);
      if (error) {chunks.length = 0; if (iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {}); reject(error);}
      else resolve(Buffer.concat(chunks, size));
    };
    const failure = kind => {try {fail(kind);} catch (error) {finish(error);}};
    const unavailable = () => failure('unavailable');
    const timer = setTimeout(unavailable, timeoutMs);
    const accept = chunk => {
      if (settled) return;
      if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) return failure('invalid');
      size += chunk.byteLength;
      if (size > maxBytes) return failure('large');
      chunks.push(Buffer.from(chunk));
    };
    try {
      if (req.aborted) return unavailable();
      if (typeof req.on === 'function' && typeof req.read === 'function') {
        // Vercel restores original bytes on the emitter returned by req.on.
        // Reading its lazy body getter would lose duplicate property names.
        for (const [event, listener] of [['end', () => finish()], ['error', unavailable], ['aborted', unavailable], ['close', () => {if (!req.complete) unavailable();}], ['data', accept]]) {
          const emitter = req.on(event, listener); listeners.push([emitter, event, listener]);
        }
      } else {
        iterator = req[Symbol.asyncIterator]();
        (async () => {while (!settled) {const next = await iterator.next(); if (settled) return; if (next.done) return finish(); accept(next.value);}})().catch(unavailable);
      }
    } catch {unavailable();}
  });
}

export const hasPrivateBodyStream = req => typeof req.on === 'function' && typeof req.read === 'function' || typeof req[Symbol.asyncIterator] === 'function';
export async function readRawPrivateJson(req, {maxBytes, timeoutMs = 10000, declaredLength = '', fail, maxDepth = 8}) {
  let bytes = hasPrivateBodyStream(req) ? await streamBytes(req, timeoutMs, maxBytes, fail) : Object.getOwnPropertyDescriptor(req, 'body')?.value;
  if (typeof bytes === 'string') bytes = Buffer.from(bytes);
  if (!Buffer.isBuffer(bytes)) fail('invalid');
  if (bytes.length > maxBytes) fail('large');
  if (declaredLength && Number(declaredLength) !== bytes.length) fail('invalid');
  let source;
  try {source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);} catch {fail('invalid');}
  try {return parseScopedPrivateJson(source, { maxDepth });} catch {fail('invalid');}
}
