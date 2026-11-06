// Entity files (descuentos por concepto) with the exact layout of GRH «Exportacion Descuentos» (reporte e90001):
//   Depto 2 · Repart 4 (RPAD con '0') · Documento 12 (LPAD '0') · Nombre 23 (RPAD ' ') · ' ' · Importe 10 (centavos, LPAD '0')
//   · Concepto 18 (LPAD '0') · Período 6 (AAAAMM) = 76 posiciones, CRLF, Windows-1252.
// Verified against GRH's August-2026 files from our own database: 581 of 599 lines byte-identical; the rest lack the
// jurisdiction in our records. Pure: no requests, no DOM. Rows we cannot complete are reported, never guessed.
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MONEY = /^-?\d{1,18}\.\d{2}$/;
const fail = message => { throw Object.assign(new Error(message), { code: 'PAYROLL_ENTITY_EXPORT_INVALID' }); };
const text = (v, max) => typeof v === 'string' && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const nullable = (v, max) => v === null || text(v, max);
export const ENTITY_EXPORT_LAYOUT = Object.freeze({ id: 'grh-exportacion-descuentos-76', width: 76, eol: '\r\n', encoding: 'windows-1252' });

/** Validates the API answer (concept list or rows of one concept). */
export function entityExportResponse(raw) {
  if (!raw || raw.version !== 'payroll-entity-export.v1' || typeof raw.found !== 'boolean') fail('Respuesta de exportación inválida.');
  if (!raw.found) return Object.freeze({ version: raw.version, found: false });
  if (!UUID.test(raw.datasetId) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !Number.isInteger(raw.period) || !Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12
    || !/^[A-Z]$/.test(raw.type) || !(raw.concept === null || /^[1-9]\d{0,8}$/.test(raw.concept)) || !Array.isArray(raw.concepts) || !Array.isArray(raw.rows)) fail('Respuesta de exportación incompleta.');
  for (const c of raw.concepts) if (!c || !/^\d{1,9}$/.test(c.code) || !nullable(c.description ?? null, 200) || !Number.isInteger(c.lines) || !Number.isInteger(c.people) || !MONEY.test(c.total)) fail('Concepto inválido.');
  for (const r of raw.rows) if (!r || !/^\d{1,12}$/.test(r.legajo) || !MONEY.test(r.amount) || !nullable(r.sector, 20) || !Number.isInteger(r.contractMatches)
    || !nullable(r.dni, 30) || !nullable(r.name, 255) || !nullable(r.jurisdiction, 4)) fail('Fila de exportación inválida.');
  return Object.freeze({ version: raw.version, found: true, datasetId: raw.datasetId.toLowerCase(), date: raw.date, period: raw.period, month: raw.month, type: raw.type,
    concept: raw.concept, description: raw.description ?? null, concepts: raw.concepts.map(c => Object.freeze({ ...c, description: c.description ?? null })), rows: raw.rows.map(r => Object.freeze({ ...r })) });
}

const rpad = (v, n, ch = ' ') => (String(v ?? '') + ch.repeat(n)).slice(0, n);
const lpad = (v, n, ch = '0') => (ch.repeat(n) + String(v ?? '')).slice(-n);
const cents = amount => { const negative = amount.startsWith('-'); const [w, f] = amount.replace('-', '').split('.'); const value = BigInt(w) * 100n + BigInt(f); return negative ? -value : value; };
const latin1 = v => [...String(v ?? '')].every(ch => ch.codePointAt(0) <= 0xff);

/** Builds the file lines; rows without jurisdiction, identity or with a negative amount are listed apart. */
export function entityDiscountFile(data) {
  if (!data?.found || !data.concept) fail('Elegí la liquidación y el concepto.');
  const period = String(data.period).padStart(4, '0') + String(data.month).padStart(2, '0');
  const lines = [], review = [];
  let total = 0n;
  for (const r of data.rows) {
    const reasons = [];
    if (!r.jurisdiction) reasons.push('sin jurisdicción');
    if (r.contractMatches !== 1 || !r.dni || !r.name) reasons.push(r.contractMatches > 1 ? 'más de una persona para el legajo' : 'sin identidad');
    const dni = String(r.dni ?? '').replace(/\D/g, '');
    if (r.dni && !/^\d{5,12}$/.test(dni)) reasons.push('documento inválido');
    const amount = cents(r.amount);
    if (amount < 0n) reasons.push('importe negativo');
    if (r.name && !latin1(r.name)) reasons.push('nombre con caracteres fuera de Windows-1252');
    if (reasons.length) { review.push(Object.freeze({ legajo: r.legajo, amount: r.amount, reasons })); continue; }
    const line = rpad(String(r.jurisdiction).slice(-2), 2) + rpad(r.sector ?? '', 4, '0') + lpad(dni, 12) + rpad(r.name, 23) + ' ' + lpad(amount.toString(), 10) + lpad(data.concept, 18) + period;
    if (line.length !== ENTITY_EXPORT_LAYOUT.width) fail('Un renglón no tiene 76 posiciones.');
    lines.push(line); total += amount;
  }
  const name = `${data.concept} ${String(data.month).padStart(2, '0')}${data.period}.txt`;
  return Object.freeze({ name, lines: Object.freeze(lines), review: Object.freeze(review), totalCents: total.toString(), rows: data.rows.length });
}

/** Windows-1252 bytes (Latin-1 range only; checked above) with CRLF after every line, as GRH writes them. */
export function entityFileBytes(file) {
  const textValue = file.lines.map(l => l + ENTITY_EXPORT_LAYOUT.eol).join('');
  const bytes = new Uint8Array(textValue.length);
  for (let i = 0; i < textValue.length; i++) { const code = textValue.charCodeAt(i); if (code > 0xff) fail('Carácter fuera de Windows-1252.'); bytes[i] = code; }
  return bytes;
}
