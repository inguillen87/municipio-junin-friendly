// PostgreSQL jsonb must be fetched as ::text. Ordinary JSON decoding rounds
// numeric(20,6) and bigint before the application can inspect their values.
import {timeCatalogNumeric} from '../assets/time-catalog-contract.js';
export class TimeCatalogJsonNumber { constructor(text) { this.text = text; } }
export function parseTimeCatalogSqlJson(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 2 * 1024 * 1024) throw Error('TIME_CATALOG_RESPONSE_INVALID');
  let i = 0;
  const ws = () => { while (/[ \t\r\n]/.test(source[i] ?? '') && i < source.length) i++; };
  const string = () => {
    const a = i++;
    while (i < source.length) {
      const c = source[i++]; if (c === '\\') i++; else if (c === '"') return JSON.parse(source.slice(a, i));
    }
    throw Error('TIME_CATALOG_RESPONSE_INVALID');
  };
  const read = depth => {
    if (depth > 12) throw Error('TIME_CATALOG_RESPONSE_INVALID');
    ws(); const c = source[i];
    if (c === '"') return string();
    if (c === '[' || c === '{') {
      i++; ws(); const object = c === '{', result = object ? Object.create(null) : [], close = object ? '}' : ']';
      if (source[i] === close) { i++; return result; }
      while (i < source.length) {
        ws(); let key;
        if (object) { if (source[i] !== '"') throw Error(); key = string(); if (Object.hasOwn(result, key)) throw Error(); ws(); if (source[i++] !== ':') throw Error(); }
        const v = read(depth + 1); if (object) result[key] = v; else result.push(v);
        ws(); const next = source[i++]; if (next === close) return result; if (next !== ',') throw Error();
      }
      throw Error();
    }
    for (const [token, value] of [['true', true], ['false', false], ['null', null]]) if (source.startsWith(token, i)) { i += token.length; return value; }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(i));
    if (!match) throw Error('TIME_CATALOG_RESPONSE_INVALID'); i += match[0].length; return new TimeCatalogJsonNumber(match[0]);
  };
  const result = read(0); ws(); if (i !== source.length) throw Error('TIME_CATALOG_RESPONSE_INVALID'); return result;
}
export function normalizeTimeCatalogSqlJson(value, key = '') {
  if (value instanceof TimeCatalogJsonNumber) {
    if (key === 'integerValue' || key === 'decimalValue') return timeCatalogNumeric(value.text, key === 'integerValue' ? 'integer' : 'decimal');
    if (!/^(?:0|[1-9]\d*)$/.test(value.text) || !Number.isSafeInteger(Number(value.text))) throw Error('TIME_CATALOG_RESPONSE_INVALID');
    return Number(value.text);
  }
  // A SQL numeric slot returned as a JSON string has changed its contract.
  if (key === 'integerValue' || key === 'decimalValue') throw Error('TIME_CATALOG_RESPONSE_INVALID');
  if (Array.isArray(value)) return value.map(v => normalizeTimeCatalogSqlJson(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeTimeCatalogSqlJson(v, k)]));
  return value;
}
export function timeCatalogSqlPayload(payload) {
  if (payload === null) return null;
  const serialize = (v, rawValue = false) => {
    if (rawValue) return v; // Numeric strings already checked against the fixed SQL grammar.
    if (Array.isArray(v)) return '[' + v.map(row => serialize(row)).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + serialize(v[k], k === 'value' && ['integer', 'decimal'].includes(v.valueKind))).join(',') + '}';
    return JSON.stringify(v);
  };
  // This helper is deliberately safe even if called without the command validator.
  if (payload.spec?.parameters) payload.spec.parameters.forEach(p => { if (['integer', 'decimal'].includes(p.valueKind)) timeCatalogNumeric(p.value, p.valueKind); });
  return serialize(payload);
}
