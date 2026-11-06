// Entity files (descuentos por concepto) with the layout of GRH «Exportacion Descuentos» (reporte e90001):
//   Depto 2 · Repart 4 (RPAD con '0') · Documento 12 (LPAD '0') · Nombre 23 (RPAD ' ') · ' ' · Importe 10 (centavos, LPAD '0')
//   · Concepto 18 (LPAD '0') · Período 6 (AAAAMM) = 76 posiciones, CRLF, Windows-1252.
// Pure: no requests, no DOM. Missing or unrepresentable rows are reported; numeric fields are never truncated.
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MONEY = /^-?\d{1,18}\.\d{2}$/;
const MAX_CENTS = 9999999999n;
const fail = message => { throw Object.assign(new Error(message), { code: 'PAYROLL_ENTITY_EXPORT_INVALID' }); };
const text = (v, max) => typeof v === 'string' && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const nullable = (v, max) => v === null || text(v, max);
const money = v => typeof v === 'string' && MONEY.test(v);
const count = v => Number.isSafeInteger(v) && v >= 0;
const concept = v => typeof v === 'string' && /^[1-9]\d{0,8}$/.test(v);
export const ENTITY_EXPORT_LAYOUT = Object.freeze({ id: 'grh-exportacion-descuentos-76', width: 76, eol: '\r\n', encoding: 'windows-1252' });

/** Validates the API answer (concept list or rows of one concept). */
export function entityExportResponse(raw) {
  if (!raw || raw.version !== 'payroll-entity-export.v1' || typeof raw.found !== 'boolean') fail('Respuesta de exportación inválida.');
  if (!raw.found) return Object.freeze({ version: raw.version, found: false });
  if (!UUID.test(raw.datasetId) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !Number.isInteger(raw.period) || raw.period < 1 || raw.period > 9999 || !Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12
    || !/^[A-Z]$/.test(raw.type) || !(raw.concept === null || concept(raw.concept)) || !Array.isArray(raw.concepts) || !Array.isArray(raw.rows)) fail('Respuesta de exportación incompleta.');
  for (const c of raw.concepts) if (!c || typeof c.code !== 'string' || !/^\d{1,9}$/.test(c.code) || !nullable(c.description ?? null, 200) || !count(c.lines) || !count(c.people) || !money(c.total)) fail('Concepto inválido.');
  for (const r of raw.rows) if (!r || typeof r.legajo !== 'string' || !/^\d{1,12}$/.test(r.legajo) || !money(r.amount) || !nullable(r.sector, 20) || !count(r.contractMatches)
    || !nullable(r.dni, 30) || !nullable(r.name, 255) || !nullable(r.jurisdiction, 4)) fail('Fila de exportación inválida.');
  return Object.freeze({ version: raw.version, found: true, datasetId: raw.datasetId.toLowerCase(), date: raw.date, period: raw.period, month: raw.month, type: raw.type,
    concept: raw.concept, description: raw.description ?? null, concepts: raw.concepts.map(c => Object.freeze({ ...c, description: c.description ?? null })), rows: raw.rows.map(r => Object.freeze({ ...r })) });
}

const cents = amount => { const negative = amount.startsWith('-'); const [w, f] = amount.replace('-', '').split('.'); const value = BigInt(w) * 100n + BigInt(f); return negative ? -value : value; };
// DNI normalization is deliberately limited to surrounding ASCII spaces and complete groups of three digits
// separated by dots (20.111.222). Letters, signs, CUIL separators and arbitrary punctuation are not removed.
const canonicalDni = value => {
  if (typeof value !== 'string') return null;
  const v = value.replace(/^ +| +$/g, '');
  if (/^\d{5,12}$/.test(v)) return v;
  if (!/^\d{1,3}(?:\.\d{3}){1,3}$/.test(v)) return null;
  const digits = v.replace(/\./g, '');
  return /^\d{5,12}$/.test(digits) ? digits : null;
};
// Windows-1252's printable extensions are not the Unicode C1 control characters with the same byte values.
const CP1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e],
  [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const cp1252Byte = ch => {
  const code = ch.codePointAt(0);
  return code >= 0x20 && code <= 0x7e || code >= 0xa0 && code <= 0xff ? code : CP1252.get(code);
};
const windows1252 = value => [...value].every(ch => cp1252Byte(ch) !== undefined);

/** Builds the file lines; incomplete, ambiguous, negative or unrepresentable rows are listed apart. */
export function entityDiscountFile(data) {
  if (!data?.found || !data.concept) fail('Elegí la liquidación y el concepto.');
  data = entityExportResponse(data);
  const period = String(data.period).padStart(4, '0') + String(data.month).padStart(2, '0');
  const lines = [], review = [];
  let total = 0n;
  for (const r of data.rows) {
    const reasons = [];
    if (!r.jurisdiction) reasons.push('sin jurisdicción');
    else if (!/^\d{1,2}$/.test(r.jurisdiction)) reasons.push('jurisdicción inválida para 2 posiciones');
    if (!r.sector) reasons.push('sin repartición');
    else if (!/^\d{1,4}$/.test(r.sector)) reasons.push('repartición inválida para 4 posiciones');
    if (r.contractMatches !== 1 || !r.dni || !r.name?.trim()) reasons.push(r.contractMatches > 1 ? 'más de una persona para el legajo' : 'sin identidad');
    const dni = canonicalDni(r.dni);
    if (r.dni && dni === null) reasons.push('documento inválido');
    const amount = cents(r.amount);
    if (amount < 0n) reasons.push('importe negativo');
    else if (amount > MAX_CENTS) reasons.push('importe excede 10 posiciones');
    if (r.name && !windows1252(r.name)) reasons.push('nombre con caracteres fuera de Windows-1252');
    if (reasons.length) { review.push(Object.freeze({ legajo: r.legajo, amount: r.amount, reasons: Object.freeze(reasons) })); continue; }
    const line = r.jurisdiction.padEnd(2, ' ') + r.sector.padEnd(4, '0') + dni.padStart(12, '0') + r.name.slice(0, 23).padEnd(23, ' ') + ' ' + amount.toString().padStart(10, '0') + data.concept.padStart(18, '0') + period;
    if (line.length !== ENTITY_EXPORT_LAYOUT.width) fail('Un renglón no tiene 76 posiciones.');
    lines.push(line); total += amount;
  }
  const name = `${data.concept} ${String(data.month).padStart(2, '0')}${data.period}.txt`;
  return Object.freeze({ name, lines: Object.freeze(lines), review: Object.freeze(review), totalCents: total.toString(), rows: data.rows.length });
}

/** Encodes each validated 76-byte line as Windows-1252 and appends CRLF, with no replacement or truncation. */
export function entityFileBytes(file) {
  if (!Array.isArray(file?.lines)) fail('Archivo de exportación inválido.');
  const bytes = new Uint8Array(file.lines.length * (ENTITY_EXPORT_LAYOUT.width + ENTITY_EXPORT_LAYOUT.eol.length));
  let offset = 0;
  for (const line of file.lines) {
    if (typeof line !== 'string' || line.length !== ENTITY_EXPORT_LAYOUT.width) fail('Un renglón no tiene 76 posiciones.');
    for (const ch of line) {
      const code = cp1252Byte(ch);
      if (code === undefined) fail('Carácter fuera de Windows-1252.');
      bytes[offset++] = code;
    }
    bytes[offset++] = 13; bytes[offset++] = 10;
  }
  return bytes;
}
