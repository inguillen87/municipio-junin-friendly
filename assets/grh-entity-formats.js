// Entity TXT files (mutuales, sindicatos, OSEP, IPV, MAYOR/FULL, RETRO…) read with the same field positions GRH uses.
// The definitions copy GRH's formatoimportacion/formatoitem (backup 28/10/2026): item 0 = DNI, 3 = legajo,
// 1 = importe, 4 = cantidad; tipodato 0 = entero, 3 = decimal con punto, 5 = decimales implícitos.
// Pure: no requests and no DOM. Identity is resolved later against the own roster; a DNI is never used as a legajo.
// Format evidence comes from the August 2026 files. Decimal commas and short trailing amount fields preserve the
// file's exact decimal value. Omitting explicit zero rows and selecting the lowest active legajo require separate
// operator choices; the historical sample does not establish a universal identity or zero-value rule.
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
// length: usual record length of the real files of that format (null when no real file was seen). It only feeds hints.
const f = (id, label, items, concepts = [], length = null) => ({ id, label, items, concepts, length });
// [kind, position (0-based), length, tipodato]
export const GRH_ENTITY_FORMATS = freeze([
  f(1, 'Formato Junín · DNI e importe (55)', [['dni', 5, 8, 0], ['amount', 44, 11, 3]], ['614', '638', '639', '641', '650', '651', '665', '675'], 55),
  f(4, 'MAYOR y FULL · DNI y porcentaje/horas (13)', [['dni', 0, 8, 0], ['quantity', 8, 5, 5]], ['44', '95'], 13),
  f(7, 'OSEP CUOTA % (185)', [['dni', 7, 8, 0], ['quantity', 62, 5, 5]], ['601'], 185),
  f(16, 'OSEP · VOLUN. PUROS (185)', [['dni', 7, 8, 0], ['quantity', 82, 3, 0], ['amount', 83, 10, 5]], ['602'], 185),
  f(14, 'OSEP · VOLUN. Estudiante (185)', [['dni', 7, 8, 0], ['quantity', 95, 3, 0], ['amount', 96, 10, 5]], ['603'], 185),
  f(15, 'OSEP · Cuenta corriente (185)', [['dni', 7, 8, 0], ['amount', 161, 10, 0]], [], 185),
  f(20, 'OSEP · CATAST. INDIRECTO (185)', [['dni', 7, 8, 0], ['quantity', 120, 4, 5], ['amount', 126, 6, 5]], [], 185),
  f(8, 'OSEP · CATAST. VOLUN. EST. (185)', [['dni', 7, 8, 0], ['quantity', 147, 3, 0], ['amount', 148, 10, 5]], [], 185),
  f(21, 'OSEP · CATAST. VOLUN. PUROS (185)', [['dni', 7, 8, 0], ['quantity', 134, 3, 0], ['amount', 135, 10, 5]], [], 185),
  f(10, 'IPV · DNI e importe (52)', [['dni', 3, 8, 0], ['amount', 40, 11, 3]], ['618'], 52),
  f(17, 'Colegio Farmacéutico / SOEM / Tres Provincias (80)', [['dni', 3, 8, 0], ['amount', 44, 8, 5]], ['616', '620', '623'], 80),
  f(19, 'Retroactivos Gobierno (c101)', [['dni', 3, 8, 0], ['amount', 44, 8, 5]]),
  f(18, 'SMSV · Seguro', [['dni', 3, 8, 0], ['amount', 41, 11, 3]]),
  f(9, 'RETRO · legajo e importe (18)', [['legajo', 0, 8, 0], ['amount', 8, 10, 3]], ['97', '195', '678'], 18),
  f(22, 'SAC · legajo, cantidad e importe', [['legajo', 0, 8, 0], ['quantity', 8, 6, 3], ['amount', 14, 11, 3]]),
  f(6, 'AMSA · DNI e importe', [['dni', 0, 8, 0], ['amount', 8, 11, 3]]),
  f(2, 'UPCN', [['dni', 3, 8, 0], ['amount', 47, 5, 0]]),
  f(5, 'MUTUALES', [['dni', 3, 8, 0], ['quantity', 8, 4, 0], ['amount', 47, 5, 0]]),
  f(11, 'MERCANTIL', [['dni', 3, 8, 0], ['amount', 47, 5, 0]]),
  f(12, 'Sindicato municipal', [['dni', 3, 8, 0], ['amount', 47, 5, 0]]),
]);
export const ENTITY_TXT_LIMITS = freeze({ bytes: 2 * 1024 * 1024, records: 10000 });
export const entityFormat = id => GRH_ENTITY_FORMATS.find(x => x.id === Number(id)) ?? null;
export const entityFormatNeedsScale = format => format.items.some(([, , , type]) => type === 5);
/** Formats whose usual record length is exactly this one; with `concept`, those that name it come first. */
export function entityFormatsForLength(length, concept = '') {
  const same = GRH_ENTITY_FORMATS.filter(x => x.length === length);
  return [...same.filter(x => x.concepts.includes(concept)), ...same.filter(x => !x.concepts.includes(concept))];
}
/** Most frequent record length of a file's non-empty lines (0 when unreadable). Used only to suggest a format. */
export function entityRecordLength(bytes) {
  let text; try { text = new TextDecoder('windows-1252', { fatal: true }).decode(bytes); } catch { return 0; }
  const counts = new Map(); for (const line of text.replace(/\r\n?/g, '\n').split('\n')) if (line.trim() !== '') counts.set(line.length, (counts.get(line.length) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}
export class EntityTxtError extends Error { constructor(message, issues = []) { super(message); this.name = 'EntityTxtError'; this.issues = issues; } }

function value(raw, type, scale, amount) {
  const v = raw.trim();
  if (v === '') return null;
  let whole, part = '';
  // Some entities write the decimals with a comma (AMAS, Sancor). One separator only: «1.234,56» is still refused.
  if (type === 3) { const m = /^(\d{1,18})(?:[.,](\d{1,6}))?$/.exec(v); if (!m) throw Error('se esperaba un número con punto o coma decimal'); [, whole, part = ''] = m; }
  else { if (!/^\d+$/.test(v)) throw Error('el campo debe tener sólo dígitos'); const places = type === 5 ? scale : 0; const p = v.padStart(places + 1, '0'); whole = places ? p.slice(0, -places) : p; part = places ? p.slice(-places) : ''; }
  if (amount) { if (part.replace(/0+$/, '').length > 2) throw Error('el importe tendría más de dos decimales'); return (BigInt(whole) * 100n + BigInt((part + '00').slice(0, 2))).toString(); }
  part = part.replace(/0+$/, '');
  const out = BigInt(whole).toString() + (part ? '.' + part : '');
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(out)) throw Error('cantidad fuera de rango');
  return out;
}
const addQuantity = (a, b) => {
  if (a === null) return b; if (b === null) return a;
  const places = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0);
  const scaled = x => { const [w, d = ''] = x.split('.'); return BigInt(w) * 10n ** BigInt(places) + BigInt(d.padEnd(places, '0') || '0'); };
  const s = (scaled(a) + scaled(b)).toString().padStart(places + 1, '0');
  return places ? (s.slice(0, -places) + '.' + s.slice(-places)).replace(/\.?0+$/, '') : s;
};

/** Reads the whole file or fails with every line to review; never returns a partial load. */
export function readEntityTxt(bytes, { formatId, scale = null, sumRepeated = false, skipZeroRows = false } = {}) {
  const format = entityFormat(formatId);
  if (!format) throw new EntityTxtError('Elegí el formato de la entidad.');
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > ENTITY_TXT_LIMITS.bytes) throw new EntityTxtError('El archivo debe tener entre 1 byte y 2 MiB.');
  if (entityFormatNeedsScale(format) && !(Number.isInteger(scale) && scale >= 0 && scale <= 4)) throw new EntityTxtError('Indicá cuántos decimales tienen los campos sin punto (no se deduce del archivo).');
  let text;
  try { text = new TextDecoder('windows-1252', { fatal: true }).decode(bytes); } catch { throw new EntityTxtError('El archivo no es texto legible.'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new EntityTxtError('El archivo contiene caracteres de control: no parece un TXT de entidad.');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines.at(-1).trim() === '') lines.pop();
  if (!lines.length || lines.length > ENTITY_TXT_LIMITS.records) throw new EntityTxtError('El archivo debe tener entre 1 y 10.000 renglones.');
  const need = Math.max(...format.items.map(([, p, l]) => p + l));
  const identity = format.items.find(([k]) => k === 'dni' || k === 'legajo')[0];
  const issues = [], rows = [], byKey = new Map();
  // The amount, when it is the last field and carries its own decimals, may be taken from the end of a short line.
  const last = format.items.reduce((x, y) => (y[1] > x[1] ? y : x)), tailRule = last[0] === 'amount' && last[3] === 3;
  const isZero = v => v === null || /^0(?:\.0+)?$/.test(v);
  let longer = 0, shortLines = 0, zeroLines = 0;
  lines.forEach((line, index) => {
    const n = index + 1;
    try {
      let tail = null;
      if (line.length < need) {
        // AMSA and Caja de Ahorro send rows one position short; by hand they were padded before importing.
        const m = tailRule && need - line.length <= 2 ? /\s(\d{1,18}[.,]\d{2})$/.exec(line) : null;
        if (!m || format.items.some(item => item !== last && item[1] + item[2] > m.index + 1)) throw Error(`el renglón tiene ${line.length} posiciones y el formato lee hasta la ${need}`);
        tail = m[1]; shortLines++;
      }
      if (line.length > need) longer++;
      const row = { line: n, sourceLines: [n], identity, key: null, quantityDecimal: null, amountCents: null };
      for (const [kind, p, l, type] of format.items) {
        const raw = tail !== null && kind === 'amount' ? tail : line.slice(p, p + l);
        if (kind === 'dni' || kind === 'legajo') {
          if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) throw Error(kind === 'dni' ? 'DNI vacío o inválido' : 'legajo vacío o inválido');
          row.key = BigInt(raw).toString();
        } else if (kind === 'quantity') row.quantityDecimal = value(raw, type, scale, false);
        else row.amountCents = value(raw, type, scale, true);
      }
      if (row.quantityDecimal === null && row.amountCents === null) throw Error('no informa cantidad ni importe');
      // Some entity files include zero placeholders. Preserve zero unless the operator elects to omit those rows.
      if (skipZeroRows && isZero(row.quantityDecimal) && isZero(row.amountCents)) { zeroLines++; return; }
      const prior = byKey.get(row.key);
      if (prior) {
        if (!sumRepeated) throw Error(`${identity === 'dni' ? 'DNI' : 'legajo'} repetido (también en el renglón ${prior.line}); marcá «Sumar repetidos» si corresponde`);
        prior.quantityDecimal = addQuantity(prior.quantityDecimal, row.quantityDecimal);
        prior.amountCents = prior.amountCents === null ? row.amountCents : row.amountCents === null ? prior.amountCents : (BigInt(prior.amountCents) + BigInt(row.amountCents)).toString();
        prior.sourceLines.push(n);
      } else { byKey.set(row.key, row); rows.push(row); }
    } catch (error) { issues.push({ line: n, message: error.message }); }
  });
  if (issues.length) throw new EntityTxtError(`${issues.length} de ${lines.length} renglones no se pueden leer. No se carga una parte del archivo.`, issues);
  const totalCents = rows.reduce((sum, r) => sum + BigInt(r.amountCents ?? '0'), 0n).toString();
  const lengths = new Map(); for (const line of lines) lengths.set(line.length, (lengths.get(line.length) ?? 0) + 1);
  const recordLength = [...lengths].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0];
  return freeze({ formatId: format.id, identity, lines: lines.length, rows, longerLines: longer, shortLines, zeroLines, recordLength, totalCents, withAmount: rows.filter(r => r.amountCents !== null).length, withQuantity: rows.filter(r => r.quantityDecimal !== null).length });
}

/** Matches every read row to exactly one active own contract (by DNI through the own roster, or by legajo). */
export function resolveEntityRows(read, roster, subjects, { preferLowestLegajo = false } = {}) {
  const subjectsById = new Map((subjects ?? []).map(s => [s.contractId.toLowerCase(), s]));
  const active = (roster ?? []).filter(r => r && r.status === 'active' && subjectsById.has(String(r.contractId).toLowerCase()));
  const index = new Map();
  for (const r of active) {
    const raw = read.identity === 'dni' ? String(r.dni ?? '').replace(/\D/g, '') : String(r.legajo ?? '').trim();
    if (!/^\d+$/.test(raw)) continue;
    const key = BigInt(raw).toString();
    index.set(key, [...(index.get(key) ?? []), r]);
  }
  const resolved = [], missing = [], ambiguous = [];
  for (const row of read.rows) {
    const matches = index.get(row.key) ?? [];
    // The lowest legajo is an explicit choice, not an inferred identity. A tie between contracts stays ambiguous.
    const numbered = matches.every(m => /^\d+$/.test(String(m.legajo ?? '').trim()));
    let chosen = matches.length === 1 ? matches[0] : null;
    if (!chosen && matches.length > 1 && preferLowestLegajo && numbered) {
      const minimum = matches.reduce((lowest, item) => { const n = BigInt(String(item.legajo).trim()); return lowest === null || n < lowest ? n : lowest; }, null);
      const lowest = matches.filter(item => BigInt(String(item.legajo).trim()) === minimum);
      if (lowest.length === 1) chosen = lowest[0];
    }
    if (chosen) { const s = subjectsById.get(String(chosen.contractId).toLowerCase()); resolved.push({ ...row, contractId: s.contractId, legajo: s.legajo, identityToken: s.identityToken, name: chosen.name ?? null, ...(matches.length > 1 ? { chosenAmong: matches.map(m => String(m.legajo)) } : {}) }); }
    else (matches.length ? ambiguous : missing).push({ ...row, candidates: matches.map(m => String(m.legajo)) });
  }
  return freeze({ resolved, missing, ambiguous });
}

export function entityConceptSuggestion(fileName, format) {
  const code = /(?:^|[\\/])(\d{2,3})\s?\d{6}\.txt$/i.exec(String(fileName ?? ''))?.[1];
  if (code && (!format?.concepts.length || format.concepts.includes(code))) return code;
  return format?.concepts.length === 1 ? format.concepts[0] : '';
}
