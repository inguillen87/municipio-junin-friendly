import {
  agreementWorkingTimeBootstrap, agreementWorkingTimeItems,
  AGREEMENT_WORKING_TIME_MAX_BYTES, AGREEMENT_WORKING_TIME_MAX_ROWS,
} from './own-agreement-working-time-model.js';
import { salarySerialized, SalaryInputError } from './native-salary-catalog-model.js';

export const AGREEMENT_TIME_CSV_HEADER = Object.freeze([
  'codigo_convenio', 'identidad', 'convenio', 'permite_nuevas_altas',
  'horas_mensuales_convenio', 'fecha_constancia', 'constancia',
]);
const fail = message => { throw new SalaryInputError('AGREEMENT_TIME_FILE_INVALID', message); };
const cell = value => '"' + (value === '' ? '' : "'" + value).replaceAll('"', '""') + '"';
const literal = value => value.startsWith("'") ? value.slice(1) : value;

function denseList(items) {
  if (!Array.isArray(items) || items.length > AGREEMENT_WORKING_TIME_MAX_ROWS
      || Reflect.ownKeys(items).length !== items.length + 1
      || Array.from({length:items.length}, (_, i) => Object.getOwnPropertyDescriptor(items, String(i)))
        .some(d => !d || !Object.hasOwn(d, 'value'))) fail('Se necesita el conjunto completo, sin huecos ni filas agregadas.');
}
function ownFields(value, fields) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === fields.length
    && fields.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && d.enumerable && Object.hasOwn(d, 'value'); });
}
function matchDraft(b, items) {
  denseList(items);
  if (items.length !== b.source.agreements.length) fail('El archivo debe incluir todos los convenios consultados. No se cargaron filas.');
  for (let i = 0; i < items.length; i++) {
    const r = items[i], s = b.source.agreements[i];
    if (!ownFields(r, ['agreementCode', 'agreementToken', 'definition'])
        || r.agreementCode !== s.agreementCode || r.agreementToken !== s.agreementToken
        || !ownFields(r.definition, ['monthlyHours', 'asOfDate', 'documentReference'])) fail('Cambió, falta o se repite un convenio. Volvé a consultar la plantilla completa.');
    const d = r.definition;
    if (d.monthlyHours !== null && typeof d.monthlyHours !== 'string'
        || typeof d.asOfDate !== 'string' || typeof d.documentReference !== 'string') fail('La preparación contiene un valor sin verificar.');
  }
}

export function agreementTimeDraft(value) {
  const b = agreementWorkingTimeBootstrap(value), existing = new Map(b.configuration.items.map(r => [r.agreementCode, r]));
  return b.source.agreements.map(s => {
    const old = existing.get(s.agreementCode);
    if (old && old.agreementToken !== s.agreementToken) fail('Cambió un convenio desde la declaración aprobada. Revisá el catálogo antes de preparar.');
    return old ? structuredClone(old) : {
      agreementCode:s.agreementCode, agreementToken:s.agreementToken,
      definition:{monthlyHours:null, asOfDate:'', documentReference:''},
    };
  });
}

export function agreementTimeView(value, items, search = '', page = 1, pageSize = 25) {
  const b = agreementWorkingTimeBootstrap(value); matchDraft(b, items);
  if (typeof search !== 'string' || !Number.isSafeInteger(page) || page < 1
      || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) fail('La página de consulta no es válida.');
  const term = search.trim().toLocaleLowerCase('es-AR');
  const rows = b.source.agreements.map((agreement, i) => ({agreement, item:items[i], index:i}))
    .filter(r => [r.agreement.agreementCode, r.agreement.label].some(v => v.toLocaleLowerCase('es-AR').includes(term)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, pages);
  return {rows:rows.slice((current - 1) * pageSize, current * pageSize), page:current, pages, filtered:rows.length, total:items.length};
}

export function agreementTimeCsv(value, items) {
  const b = agreementWorkingTimeBootstrap(value); matchDraft(b, items);
  const rows = items.map((r, i) => {
    const s = b.source.agreements[i], d = r.definition;
    return [r.agreementCode, r.agreementToken, s.label, s.registrationAllowed ? 'si' : 'no', d.monthlyHours ?? '', d.asOfDate, d.documentReference];
  });
  const text = '\uFEFF' + AGREEMENT_TIME_CSV_HEADER.map(k => '"' + k + '"').join(';') + '\r\n'
    + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
  if (new TextEncoder().encode(text).length > AGREEMENT_WORKING_TIME_MAX_BYTES) fail('El CSV completo supera 4 MiB. No se descargó un archivo recortado.');
  return text;
}

function csvRows(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > AGREEMENT_WORKING_TIME_MAX_BYTES) fail('El CSV supera 4 MiB. No se cargó ninguna fila.');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], value = '', quoted = false, closed = false, started = false;
  const field = () => {
    row.push(value);
    if (row.length > AGREEMENT_TIME_CSV_HEADER.length) fail('El CSV contiene columnas adicionales. Usá la plantilla completa.');
    value = ''; closed = false; started = false;
  };
  const record = () => {
    field(); rows.push(row); row = [];
    if (rows.length > AGREEMENT_WORKING_TIME_MAX_ROWS + 1) fail('El CSV supera 10.000 convenios. No se recortó ni dividió el archivo.');
  };
  for (let n = 0; n < text.length; n++) {
    const c = text[n];
    if (quoted) { if (c === '"') { if (text[n + 1] === '"') { value += '"'; n++; } else { quoted = false; closed = true; } } else value += c; continue; }
    if (c === ';') { field(); continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && text[n + 1] === '\n') n++; record(); continue; }
    if (closed) fail('Hay caracteres después de una celda entre comillas.');
    if (c === '"') { if (started) fail('Hay comillas fuera de una celda.'); quoted = true; started = true; }
    else { value += c; started = true; }
  }
  if (quoted) fail('El CSV tiene una celda sin cerrar.');
  if (row.length || started || closed || value) record();
  if (!rows.length || salarySerialized(rows[0]) !== salarySerialized(AGREEMENT_TIME_CSV_HEADER)) fail('La cabecera no coincide con la plantilla de horas del convenio.');
  return rows.slice(1);
}

export function agreementTimeFile(value, text) {
  const b = agreementWorkingTimeBootstrap(value), rows = csvRows(text);
  if (rows.length !== b.source.agreements.length) fail('El CSV no contiene todos los convenios. No se cargaron filas.');
  const items = rows.map((row, i) => {
    if (row.length !== AGREEMENT_TIME_CSV_HEADER.length) fail('Fila ' + (i + 2) + ': faltan columnas.');
    const [agreementCode, agreementToken, label, allowed, hours, date, reference] = row.map(literal), s = b.source.agreements[i];
    if (agreementCode !== s.agreementCode || agreementToken !== s.agreementToken || label !== s.label
        || allowed !== (s.registrationAllowed ? 'si' : 'no')) fail('Fila ' + (i + 2) + ': convenio distinto, metadatos modificados o filas desordenadas. No se cargaron filas.');
    return {agreementCode, agreementToken, definition:{monthlyHours:hours === '' ? null : hours, asOfDate:date, documentReference:reference}};
  });
  agreementWorkingTimeItems(items, b.period, {empty:false}); return items;
}

export function agreementTimeComparison(before, after) {
  denseList(before); denseList(after);
  const keyed = items => {
    const result = new Map();
    for (const r of items) {
      if (!ownFields(r, ['agreementCode', 'agreementToken', 'definition']) || result.has(r.agreementCode)) fail('La comparación tiene convenios repetidos o sin verificar.');
      result.set(r.agreementCode, r);
    }
    return result;
  };
  const a = keyed(before), b = keyed(after);
  return [...new Set([...a.keys(), ...b.keys()])].sort()
    .map(agreementCode => ({agreementCode, before:a.get(agreementCode) ?? null, after:b.get(agreementCode) ?? null}))
    .filter(r => salarySerialized(r.before) !== salarySerialized(r.after));
}
