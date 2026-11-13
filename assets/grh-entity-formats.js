// Entity TXT files (mutuales, sindicatos, OSEP, IPV, MAYOR/FULL, RETRO…) read with the same field positions GRH uses.
// The definitions copy GRH's formatoimportacion/formatoitem (backup 09/11/2026): item 0 = DNI, 3 = legajo,
// 1 = importe, 4 = cantidad; tipodato 0 = entero, 3 = decimal con punto, 5 = decimales implícitos.
// Pure: no requests and no DOM. Identity is resolved later against the own roster; a DNI is never used as a legajo.
// Format evidence comes from the real files of August 2026 and from GRH's own history (2024–2026) for what must hold in
// any month. The entity's file is used as it arrives:
//  · a decimal comma and a row one or two positions short whose amount is the last thing on the line keep the file's
//    exact value;
//  · the original files of SMSV, Sancor and AMARU (ids from 101 on: they are not GRH formats; until now they were
//    retyped by hand into «Formato Junín» before importing);
//  · omitting zero rows is the caller's explicit option (`skipZeroRows`). GRH's import routine never loads them: its
//    log has 1.032.718 «el importe/la cantidad leída es 0» entries across every format in use;
//  · a person with several active legajos gets the novelty on ONE of them, whichever its number (Liquidaciones,
//    13/11/2026). Nothing is inferred: the person importing chooses the contract; the lowest number (GRH, 23 months:
//    1.848 of 1.917 cases) is only offered as a one-step proposal, and a tie between contracts stays unresolved.
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
// length: usual record length of the real files of that format (null when no real file was seen). It only feeds hints.
// extra.scale: implicit decimals fixed by the format (own formats); extra.defaultScale: the one the real files use, offered
// first; extra.wholePesos: GRH has been loading that entity without cents; extra.split: one file feeds two concepts and
// the fee is told apart by its amount; extra.codeAt: [position, length] of the concept code each row carries.
const f = (id, label, items, concepts = [], length = null, extra = {}) => ({ id, label, items, concepts, length, scale: null, defaultScale: null, wholePesos: false, split: null, codeAt: null, ...extra });
// [kind, position (0-based), length, tipodato]
export const GRH_ENTITY_FORMATS = freeze([
  f(1, 'Formato Junín · DNI e importe (55)', [['dni', 5, 8, 0], ['amount', 44, 11, 3]], ['614', '638', '639', '641', '650', '651', '665', '675'], 55, { codeAt: [0, 3] }),
  f(4, 'MAYOR y FULL · DNI y porcentaje/horas (13)', [['dni', 0, 8, 0], ['quantity', 8, 5, 5]], ['44', '95'], 13, { defaultScale: 2 }),
  f(7, 'OSEP CUOTA % (185)', [['dni', 7, 8, 0], ['quantity', 62, 5, 5]], ['601'], 185, { defaultScale: 2 }),
  f(16, 'OSEP · VOLUN. PUROS (185)', [['dni', 7, 8, 0], ['quantity', 82, 3, 0], ['amount', 83, 10, 5]], ['602'], 185, { defaultScale: 2 }),
  f(14, 'OSEP · VOLUN. Estudiante (185)', [['dni', 7, 8, 0], ['quantity', 95, 3, 0], ['amount', 96, 10, 5]], ['603'], 185, { defaultScale: 2 }),
  f(15, 'OSEP · Cuenta corriente (185)', [['dni', 7, 8, 0], ['amount', 161, 10, 0]], [], 185),
  f(20, 'OSEP · CATAST. INDIRECTO (185)', [['dni', 7, 8, 0], ['quantity', 120, 4, 5], ['amount', 126, 6, 5]], [], 185),
  f(8, 'OSEP · CATAST. VOLUN. EST. (185)', [['dni', 7, 8, 0], ['quantity', 147, 3, 0], ['amount', 148, 10, 5]], [], 185),
  f(21, 'OSEP · CATAST. VOLUN. PUROS (185)', [['dni', 7, 8, 0], ['quantity', 134, 3, 0], ['amount', 135, 10, 5]], [], 185),
  // IPV se importa con «Colegio Farmacéutico» (Liquidaciones, 13/11/2026; en el registro de importación de GRH el formato 10
  // no se usa desde 2025). Su otro archivo, de 52 posiciones, lleva el importe con punto: lo lee el formato 18.
  f(17, 'Colegio Farmacéutico / IPV / SOEM / Tres Provincias (80)', [['dni', 3, 8, 0], ['amount', 44, 8, 5]], ['616', '618', '620', '623'], 80, { defaultScale: 2 }),
  f(18, 'SMSV / IPV · DNI e importe con punto (52)', [['dni', 3, 8, 0], ['amount', 41, 11, 3]], ['675', '618'], 52),
  // Archivos originales de la entidad, sin pasarlos a mano a otro formato.
  f(101, 'SMSV · archivo original (49)', [['dni', 3, 8, 0], ['amount', 41, 8, 5]], ['675'], 49, { scale: 2 }),
  f(102, 'Sancor Seguros · archivo original (62)', [['dni', 2, 8, 0], ['amount', 52, 10, 3]], ['641'], 62, { wholePesos: true }),
  f(103, 'AMARU · archivo original, cuota y servicios (54)', [['dni', 5, 8, 0], ['amount', 44, 10, 5]], ['638', '639'], 54, { scale: 2, split: { shared: '638', rest: '639' } }),
  f(9, 'RETRO · legajo e importe (18)', [['legajo', 0, 8, 0], ['amount', 8, 10, 3]], ['97', '195', '678'], 18),
  f(19, 'Retroactivos Gobierno (c101)', [['dni', 3, 8, 0], ['amount', 44, 8, 5]]),
  f(22, 'SAC · legajo, cantidad e importe', [['legajo', 0, 8, 0], ['quantity', 8, 6, 3], ['amount', 14, 11, 3]]),
  f(6, 'AMSA · DNI e importe', [['dni', 0, 8, 0], ['amount', 8, 11, 3]]),
  f(10, 'IPV · formato anterior de GRH (sin uso desde 2025)', [['dni', 3, 8, 0], ['amount', 40, 11, 3]]),
  f(2, 'UPCN', [['dni', 3, 8, 0], ['amount', 47, 5, 0]]),
  f(5, 'MUTUALES', [['dni', 3, 8, 0], ['quantity', 8, 4, 0], ['amount', 47, 5, 0]]),
  f(11, 'MERCANTIL', [['dni', 3, 8, 0], ['amount', 47, 5, 0]]),
  f(12, 'Sindicato municipal', [['dni', 3, 8, 0], ['amount', 47, 5, 0]]),
]);
export const ENTITY_TXT_LIMITS = freeze({ bytes: 2 * 1024 * 1024, records: 10000 });
export const entityFormat = id => GRH_ENTITY_FORMATS.find(x => x.id === Number(id)) ?? null;
/** True when the person has to say how many implicit decimals the file uses (own formats carry it). */
export const entityFormatNeedsScale = format => format.scale === null && format.items.some(([, , , type]) => type === 5);
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
export function readEntityTxt(bytes, { formatId, scale = null, sumRepeated = false, skipZeroRows = false, wholePesos = null } = {}) {
  const format = entityFormat(formatId);
  if (!format) throw new EntityTxtError('Elegí el formato de la entidad.');
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > ENTITY_TXT_LIMITS.bytes) throw new EntityTxtError('El archivo debe tener entre 1 byte y 2 MiB.');
  if (format.scale !== null) scale = format.scale;
  if (entityFormatNeedsScale(format) && !(Number.isInteger(scale) && scale >= 0 && scale <= 4)) throw new EntityTxtError('Indicá cuántos decimales tienen los campos sin punto (no se deduce del archivo).');
  let text;
  try { text = new TextDecoder('windows-1252', { fatal: true }).decode(bytes); } catch { throw new EntityTxtError('El archivo no es texto legible.'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new EntityTxtError('El archivo contiene caracteres de control: no parece un TXT de entidad.');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines.at(-1).trim() === '') lines.pop();
  if (!lines.length || lines.length > ENTITY_TXT_LIMITS.records) throw new EntityTxtError('El archivo debe tener entre 1 y 10.000 renglones.');
  const need = Math.max(...format.items.map(([, p, l]) => p + l));
  const identity = format.items.find(([k]) => k === 'dni' || k === 'legajo')[0];
  const issues = [], parsed = [];
  // The amount, when it is the last field and carries its own decimals, may be taken from the end of a short line.
  const last = format.items.reduce((x, y) => (y[1] > x[1] ? y : x)), tailRule = last[0] === 'amount' && last[3] === 3;
  const isZero = v => v === null || /^0(?:\.0+)?$/.test(v);
  // Sancor bills with cents and GRH has been loading whole pesos (its hand-made file is read three positions off, so only
  // the integer part reaches the novelty). Preserve the source amount unless whole-peso compatibility is requested.
  const whole = format.wholePesos && wholePesos === true;
  let longer = 0, shortLines = 0, zeroLines = 0, dropped = 0n;
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
      if (format.codeAt) { const code = line.slice(format.codeAt[0], format.codeAt[0] + format.codeAt[1]); row.code = /^\d+$/.test(code) ? code : ''; }
      if (whole && row.amountCents !== null) { const cents = BigInt(row.amountCents) % 100n; dropped += cents; row.amountCents = (BigInt(row.amountCents) - cents).toString(); }
      // Some entity files include zero placeholders (OSEP sends every member in every column). Zero is preserved unless
      // the caller elects to omit those rows, as GRH's own import does.
      if (skipZeroRows && isZero(row.quantityDecimal) && isZero(row.amountCents)) { zeroLines++; return; }
      parsed.push(row);
    } catch (error) { issues.push({ line: n, message: error.message }); }
  });
  // One file, two concepts.
  //  · AMARU: the membership fee is the amount every member has (GRH 2024–2026: concept 638 is a single value each month
  //    — $450, $650, $2.500 — and 639 never repeats it). It is recognised in the file, not fixed here; the code AMARU
  //    writes on each row is not reliable (17 of 18 rows said 638 in August 2026).
  //  · «Formato Junín»: every row starts with its concept. AMSA sends 650 and 651 together; by hand they were cut into
  //    two files. Rows are split only when every code is a concept of the format; one single known code is offered as
  //    the concept of the file; anything else is reported and left to the person.
  let split = null, codeConcept = null, mixedCodes = null;
  if (format.split && !issues.length) {
    const people = new Set(parsed.map(r => r.key)), byAmount = new Map();
    for (const r of parsed) byAmount.set(r.amountCents, (byAmount.get(r.amountCents) ?? new Set()).add(r.key));
    const [top, second] = [...byAmount].sort((x, y) => y[1].size - x[1].size);
    if (!top || people.size < 2 || top[1].size !== people.size || (second && second[1].size === top[1].size) || parsed.filter(r => r.amountCents === top[0]).length !== people.size) throw new EntityTxtError(`No se reconoce una cuota social única: el archivo debe tener exactamente un renglón del mismo importe por cada persona. Cargá los conceptos ${format.split.shared} y ${format.split.rest} por separado.`);
    for (const r of parsed) r.concept = r.amountCents === top[0] ? format.split.shared : format.split.rest;
    split = { kind: 'quota', concepts: [format.split.shared, format.split.rest], sharedAmountCents: top[0] };
  } else if (format.codeAt && !issues.length) {
    const codes = [...new Set(parsed.map(r => r.code))].sort(), known = codes.length > 0 && codes.every(c => format.concepts.includes(c));
    if (known && codes.length === 1) codeConcept = codes[0];
    else if (known) { for (const r of parsed) r.concept = r.code; split = { kind: 'code', concepts: codes }; }
    else if (codes.length > 1) mixedCodes = codes.filter(Boolean).slice(0, 12);
  }
  for (const r of parsed) delete r.code;
  const rows = [], byKey = new Map(), firstValue = new Map(), repeats = [];
  const signature = parsed.map(r => r.key + '|' + r.amountCents + '|' + r.quantityDecimal), half = parsed.length / 2;
  const halves = parsed.length >= 4 && Number.isInteger(half) && signature.slice(0, half).every((x, i) => x === signature[half + i]);
  let identicalRepeats = 0;
  for (const row of parsed) {
    const id = row.concept ? row.concept + ':' + row.key : row.key, prior = byKey.get(id);
    const worth = row.amountCents + '|' + row.quantityDecimal;
    if (!prior) { byKey.set(id, row); firstValue.set(id, new Set([worth])); rows.push(row); continue; }
    if (firstValue.get(id).has(worth)) identicalRepeats++; else firstValue.get(id).add(worth);
    repeats.push({ line: row.line, message: `${identity === 'dni' ? 'DNI' : 'legajo'} repetido (también en el renglón ${prior.line}); marcá «Sumar repetidos» si corresponde`, repeated: true });
    if (!sumRepeated) continue;
    prior.quantityDecimal = addQuantity(prior.quantityDecimal, row.quantityDecimal);
    prior.amountCents = prior.amountCents === null ? row.amountCents : row.amountCents === null ? prior.amountCents : (BigInt(prior.amountCents) + BigInt(row.amountCents)).toString();
    prior.sourceLines.push(row.line);
  }
  // A file pasted twice into itself (seen among the real ones): its second half repeats the first, or nine of every ten
  // possible repeats are exact copies.
  // Summing it would double every discount, so it is said in so many words instead of offering the sum.
  const duplicatedFile = halves || (identicalRepeats >= 3 && identicalRepeats * 20 >= parsed.length * 9);
  if (!sumRepeated && repeats.length && !issues.length && duplicatedFile) throw Object.assign(new EntityTxtError(`El archivo parece estar copiado dos veces: ${repeats.length} de sus ${lines.length} renglones repiten un ${identity === 'dni' ? 'DNI' : 'legajo'} que ya estaba, ${identicalRepeats} con el mismo valor. Usá el archivo sin duplicar; si de verdad son dos descuentos iguales por persona, marcá «Sumar repetidos».`, repeats), { duplicatedFile: true });
  if (!sumRepeated) issues.push(...repeats);
  if (issues.length) throw new EntityTxtError(`${issues.length} de ${lines.length} renglones no se pueden leer. No se carga una parte del archivo.`, issues.sort((x, y) => x.line - y.line));
  const totalCents = rows.reduce((sum, r) => sum + BigInt(r.amountCents ?? '0'), 0n).toString();
  const lengths = new Map(); for (const line of lines) lengths.set(line.length, (lengths.get(line.length) ?? 0) + 1);
  const recordLength = [...lengths].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0];
  if (split) split.rows = Object.fromEntries(split.concepts.map(c => [c, rows.filter(r => r.concept === c).length]));
  return freeze({ formatId: format.id, identity, lines: lines.length, rows, longerLines: longer, shortLines, zeroLines, recordLength, totalCents, wholePesos: whole, droppedCents: dropped.toString(), split, codeConcept, mixedCodes, repeatedRows: repeats.length, duplicatedFile, withAmount: rows.filter(r => r.amountCents !== null).length, withQuantity: rows.filter(r => r.quantityDecimal !== null).length });
}

const legajoNumber = m => { const text = String(m.legajo ?? '').trim(); return /^\d+$/.test(text) ? BigInt(text) : null; };
/** The single candidate with the lowest legajo number, or null when a number is missing or two contracts tie. */
const lowestCandidate = matches => {
  const numbers = matches.map(legajoNumber);
  if (!matches.length || numbers.includes(null)) return null;
  const minimum = numbers.reduce((x, y) => (y < x ? y : x)), lowest = matches.filter((m, i) => numbers[i] === minimum);
  return lowest.length === 1 ? lowest[0] : null;
};

/**
 * Matches every read row to exactly one active own contract (by DNI through the own roster, or by legajo).
 * A person with several active legajos gets the novelty on one of them only, and nothing is inferred: the row stays in
 * `ambiguous` until `choices` (row key → contractId) names one of that person's active contracts. `preferLowestLegajo`
 * is the explicit bulk choice; a tie between contracts stays ambiguous. Each such row carries `candidates` (contract,
 * legajo and what tells the posts apart) so the screen can offer the list.
 */
export function resolveEntityRows(read, roster, subjects, { preferLowestLegajo = false, choices = null } = {}) {
  const subjectsById = new Map((subjects ?? []).map(s => [s.contractId.toLowerCase(), s]));
  const active = (roster ?? []).filter(r => r && r.status === 'active' && subjectsById.has(String(r.contractId).toLowerCase()));
  const index = new Map();
  for (const r of active) {
    const raw = read.identity === 'dni' ? String(r.dni ?? '').replace(/\D/g, '') : String(r.legajo ?? '').trim();
    if (!/^\d+$/.test(raw)) continue;
    const key = BigInt(raw).toString();
    index.set(key, [...(index.get(key) ?? []), r]);
  }
  const chosenFor = key => String((choices instanceof Map ? choices.get(key) : choices?.[key]) ?? '').toLowerCase();
  const resolved = [], missing = [], ambiguous = [];
  for (const row of read.rows) {
    const matches = index.get(row.key) ?? [];
    const sorted = matches.every(m => legajoNumber(m) !== null) ? matches.slice().sort((x, y) => (legajoNumber(x) < legajoNumber(y) ? -1 : legajoNumber(x) > legajoNumber(y) ? 1 : 0)) : matches;
    const picked = matches.length > 1 ? matches.find(m => String(m.contractId).toLowerCase() === chosenFor(row.key)) ?? null : null;
    const chosen = matches.length === 1 ? matches[0] : picked ?? (matches.length > 1 && preferLowestLegajo ? lowestCandidate(matches) : null);
    const candidates = matches.length > 1 ? sorted.map(m => ({ contractId: subjectsById.get(String(m.contractId).toLowerCase()).contractId, legajo: String(m.legajo), detail: [m.organization, m.sector, m.category].filter(Boolean).join(' · ') })) : null;
    if (chosen) { const s = subjectsById.get(String(chosen.contractId).toLowerCase()); resolved.push({ ...row, contractId: s.contractId, legajo: s.legajo, identityToken: s.identityToken, name: chosen.name ?? null, ...(candidates ? { chosenAmong: candidates.map(c => c.legajo), candidates, chosenByPerson: !!picked } : {}) }); }
    else (matches.length ? ambiguous : missing).push({ ...row, ...(matches.length && read.identity === 'dni' ? { name: matches[0].name ?? null } : {}), candidates: candidates ?? [] });
  }
  return freeze({ resolved, missing, ambiguous });
}

/**
 * The one-step proposal for rows still without a contract: row key → contractId of the lowest-numbered legajo, only
 * where that is a single contract. It decides nothing by itself; the screen applies it when the person asks for it.
 */
export function lowestLegajoChoices(rows) {
  const out = new Map();
  for (const row of rows ?? []) {
    const lowest = lowestCandidate(row.candidates ?? []);
    if (lowest && (row.candidates ?? []).length > 1) out.set(row.key, lowest.contractId);
  }
  return out;
}

/**
 * Formats that fit this file: the usual record length matches (or the file is one or two positions short, as AMSA and
 * Caja de Ahorro send it) AND the whole file reads with them. Length alone is not enough: a 54-position file may be
 * AMARU's original or Caja de Ahorro's one-short «Formato Junín». Exact length first; with `concept`, the formats that
 * name it first. Only used to propose a format.
 */
export function entityFormatsForFile(bytes, concept = '') {
  const length = entityRecordLength(bytes);
  if (!length) return freeze({ length: 0, formats: [], concept: null, split: null });
  const got = new Map();
  const reads = format => { try { got.set(format.id, readEntityTxt(bytes, { formatId: format.id, scale: format.scale ?? format.defaultScale ?? 2, sumRepeated: true, skipZeroRows: true })); return true; } catch { return false; } };
  const rank = x => (x.length === length ? 0 : 2) + (x.concepts.includes(concept) ? 0 : 1);
  const formats = GRH_ENTITY_FORMATS.filter(x => x.length !== null && x.length - length >= 0 && x.length - length <= 2).filter(reads).sort((x, y) => rank(x) - rank(y));
  const first = formats.length ? got.get(formats[0].id) : null;
  return freeze({ length, formats: formats.map(x => x.id), concept: first?.codeConcept ?? null, split: first?.split ? first.split.concepts.slice() : null });
}

export function entityConceptSuggestion(fileName, format) {
  const code = /(?:^|[\\/])(\d{2,3})\s?\d{6}\.txt$/i.exec(String(fileName ?? ''))?.[1];
  if (code && (!format?.concepts.length || format.concepts.includes(code))) return code;
  return format?.concepts.length === 1 ? format.concepts[0] : '';
}

// ── Rows copied from a spreadsheet ────────────────────────────────────────────────────────────────────────────────
// Some entities and offices send an Excel sheet instead of a TXT (Club Junín, municipal rates, garnishments). Until now
// a TXT by legajo was typed from it. Excel puts copied cells in the clipboard as tab-separated text, so the rows can be
// pasted as they are: the person says which column identifies the employee and which one is the amount or the quantity,
// and the result has the same shape as a TXT read, so the same legajo resolution and the same batch are used.
export const PASTED_SHEET_LIMITS = freeze({ chars: 2 * 1024 * 1024, rows: 10000, columns: 40 });
const sheetNumber = /^[-+]?\$?\s*[\d.,]+$/, sheetTitle = /legajo|d\.?\s?n\.?\s?i|documento|importe|monto|cantidad|horas|apellido|nombre|concepto/i;
/** Splits the pasted text into trimmed cells and says where the titles are. Never interprets a value. */
export function pastedSheetCells(text) {
  if (typeof text !== 'string' || !text.trim()) throw new EntityTxtError('Pegá las filas copiadas de la planilla.');
  if (text.length > PASTED_SHEET_LIMITS.chars) throw new EntityTxtError('Lo pegado es demasiado grande: copiá hasta 10.000 filas.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new EntityTxtError('Lo pegado contiene caracteres de control: copiá las celdas desde la planilla.');
  const source = text.replace(/\r\n?/g, '\n');
  // Only delimiters outside quoted cells choose the format; a tab inside a quoted semicolon-separated cell is data.
  let delimiterQuoted = false, tabs = 0, semicolons = 0;
  for (let i = 0; i < source.length; i++) { const ch = source[i]; if (ch === '"') { if (delimiterQuoted && source[i + 1] === '"') i++; else delimiterQuoted = !delimiterQuoted; } else if (!delimiterQuoted) { if (ch === '\t') tabs++; else if (ch === ';') semicolons++; } }
  const separator = tabs ? '\t' : semicolons ? ';' : null;
  if (!separator) throw new EntityTxtError('No parecen celdas copiadas de una planilla: hacen falta al menos dos columnas (por ejemplo legajo e importe).');
  // Excel quotes cells containing line breaks, separators or quotes. Parse the complete selection or reject it.
  const all = []; let cells = [], cell = '', quoted = false, closedQuote = false, started = 1, line = 1, cellLine = 1;
  const malformed = message => { throw new EntityTxtError('La planilla tiene una celda entre comillas inválida. No se carga una parte de la selección.', [{ line: cellLine, message }]); };
  for (let i = 0; i <= source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === undefined) malformed('comilla sin cerrar al final de la selección');
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else { cell += ch; if (ch === '\n') line++; }
      continue;
    }
    if (closedQuote && ch !== separator && ch !== '\n' && ch !== undefined) {
      if (ch === ' ' || ch === '\u00a0') continue;
      malformed('hay contenido después de cerrar las comillas; debe seguir una separación de columna o fila');
    }
    if (ch === '"') { if (cell.trim() !== '') malformed('comilla inesperada dentro de una celda sin delimitar'); cell = ''; quoted = true; }
    else if (ch === separator) { cells.push(cell); cell = ''; closedQuote = false; cellLine = line; }
    else if (ch === '\n' || ch === undefined) {
      cells.push(cell); const normalized = cells.map(c => c.replace(/\s+/g, ' ').trim());
      if (normalized.some(c => c !== '')) all.push({ line: started, cells: normalized, embeddedBreaks: cells.flatMap((c, i) => /[\n\t]/.test(c) ? [i] : []) });
      if (all.length > PASTED_SHEET_LIMITS.rows + 15) throw new EntityTxtError('Pegá entre 1 y 10.000 filas.');
      cells = []; cell = ''; closedQuote = false; line++; started = line; cellLine = line;
    } else cell += ch;
  }
  if (!all.length || all.length > PASTED_SHEET_LIMITS.rows + 15) throw new EntityTxtError('Pegá entre 1 y 10.000 filas.');
  const columns = Math.max(...all.map(r => r.cells.length));
  if (columns < 2 || columns > PASTED_SHEET_LIMITS.columns) throw new EntityTxtError('La selección debe tener entre 2 y 40 columnas.');
  for (const r of all) while (r.cells.length < columns) r.cells.push('');
  // Titles name known columns. Only a one-cell textual heading may precede them; an internal header must never
  // silently discard earlier data. An arbitrary first text row is not assumed to be a header.
  const texts = r => { const cells = r.cells.filter(c => c !== ''); return cells.length >= 2 && cells.every(c => !sheetNumber.test(c)); };
  const at = all.slice(0, 15).findIndex(r => texts(r) && r.cells.some(c => sheetTitle.test(c)));
  const beforeTitles = at > 0 ? all.slice(0, at).filter(r => { const cells = r.cells.filter(c => c !== ''); return cells.length !== 1 || !/\p{L}/u.test(cells[0]) || sheetNumber.test(cells[0]); }) : [];
  if (beforeTitles.length) throw new EntityTxtError('Hay filas antes de los títulos que podrían contener datos. No se omiten: revisá la selección completa.', beforeTitles.map(r => ({ line: r.line, message: 'fila anterior a los títulos; no se puede descartar como encabezado' })));
  const rows = at >= 0 ? all.slice(at + 1) : all;
  if (rows.length > PASTED_SHEET_LIMITS.rows) throw new EntityTxtError('Pegá hasta 10.000 filas de datos.');
  return freeze({ columns, header: at >= 0 ? all[at].cells : null, leading: Math.max(at, 0), rows });
}
const columnLetter = i => String.fromCharCode(65 + (i % 26)).padStart(i < 26 ? 1 : 2, String.fromCharCode(64 + Math.floor(i / 26)));
const sheetIdentity = raw => { const v = raw.replace(/\s/g, ''); const m = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:[.,]0+)?$/.exec(v); return m && !/^0+$/.test(m[1].replace(/\./g, '')) ? BigInt(m[1].replace(/\./g, '')).toString() : null; };
/** A number as Excel shows it in Argentina («1.234,56», «1234,5», «13690») or with a decimal point («1234.56»). */
function sheetDecimal(raw, places) {
  const v = raw.replace(/[$\s]/g, '');
  if (v === '') return null;
  if (/^[-(]/.test(v)) throw Error('no se admiten valores negativos');
  if (places !== 2 && /^[1-9]\d{0,2}\.\d{3}$/.test(v)) throw Error('cantidad ambigua: usá coma para los decimales o escribí los miles sin puntos');
  let whole, part = '';
  // A grouping separator cannot start with a zero group: 0.125 is a fraction, never 125.
  if (/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(v)) [whole, part = ''] = v.replace(/\./g, '').split(',');
  else if (/^\d+(?:,\d+)?$/.test(v)) [whole, part = ''] = v.split(',');
  else if (/^\d+\.\d+$/.test(v)) [whole, part] = v.split('.');
  else throw Error('no se entiende el número «' + raw.slice(0, 20) + '»');
  part = part.replace(/0+$/, '');
  if (part.length > places) throw Error(places === 2 ? 'el importe tendría más de dos decimales' : 'la cantidad tendría más de seis decimales');
  return { whole: BigInt(whole).toString(), part };
}
/** Which column is what, proposed from the titles and, without titles, from what the cells look like. */
export function pastedSheetSuggestion(sheet) {
  const labels = Array.from({ length: sheet.columns }, (_, i) => columnLetter(i) + ' · ' + (sheet.header?.[i] || (sheet.rows[0]?.cells[i] ? 'ej.: ' + sheet.rows[0].cells[i].slice(0, 18) : 'vacía')));
  const named = pattern => (sheet.header ?? []).findIndex(h => pattern.test(h));
  const share = (i, test) => { const rows = sheet.rows.filter(r => r.cells[i] !== ''); return rows.length ? rows.filter(r => !r.embeddedBreaks.includes(i) && test(r.cells[i])).length / rows.length : 0; };
  const digits = (i, min, max) => share(i, c => { const k = sheetIdentity(c); return k !== null && k.length >= min && k.length <= max; });
  const columns = Array.from({ length: sheet.columns }, (_, i) => i);
  let identityColumn = named(/^leg(ajo)?\.?$|legajo/i), identity = identityColumn >= 0 ? 'legajo' : null;
  if (identityColumn < 0) { identityColumn = named(/d\.?\s?n\.?\s?i|documento/i); if (identityColumn >= 0) identity = 'dni'; }
  if (identityColumn < 0) { identityColumn = columns.find(i => digits(i, 7, 8) >= 0.9) ?? -1; if (identityColumn >= 0) identity = 'dni'; }
  if (identityColumn < 0) { identityColumn = columns.find(i => digits(i, 1, 5) >= 0.9) ?? -1; if (identityColumn >= 0) identity = 'legajo'; }
  const money = i => i !== identityColumn && share(i, c => { try { return sheetDecimal(c, 2) !== null; } catch { return false; } }) >= 0.9;
  const quantityColumn = named(/cantidad|horas|porcentaje|unidades|d[ií]as/i);
  let amountColumn = named(/importe|monto/i);
  // Without an amount title: the last column that reads as money, unless the sheet only brings a named quantity.
  if (amountColumn < 0 && !(quantityColumn >= 0 && sheet.columns === 2)) amountColumn = columns.filter(i => i !== quantityColumn && money(i) && digits(i, 7, 8) < 0.9).at(-1) ?? -1;
  // If an amount is present, hours can be an intermediate calculation; only an explicit column choice loads them.
  return freeze({ labels, identityColumn: identityColumn >= 0 ? identityColumn : null, identity, amountColumn: amountColumn >= 0 ? amountColumn : null, quantityColumn: amountColumn < 0 && quantityColumn >= 0 && quantityColumn !== identityColumn ? quantityColumn : null });
}
const sheetValue = cell => cell.trim().replace(/\s+/g, ' ').toUpperCase();
/**
 * The different values of one column with how many rows carry each, so the person can leave some out by unticking them
 * (the club writes «jubilado» or «cobrar a domicilio» in a column and those rows are not discounted). Null when the
 * column has too many different values to be a classification.
 */
export function pastedSheetValues(sheet, column) {
  if (!Number.isInteger(column) || column < 0 || column >= sheet.columns) return null;
  const counts = new Map();
  for (const { cells } of sheet.rows) { const v = sheetValue(cells[column]); counts.set(v, (counts.get(v) ?? 0) + 1); }
  return counts.size > 60 ? null : freeze([...counts].map(([value, rows]) => ({ value, rows })).sort((x, y) => y.rows - x.rows || (x.value < y.value ? -1 : 1)));
}
/** Reads the pasted rows with the chosen columns: the whole selection or nothing, like a TXT. */
export function readPastedSheet(text, { identityColumn, identity, amountColumn = null, quantityColumn = null, sumRepeated = false, skipZeroRows = false, filterColumn = null, filterValues = null } = {}) {
  const sheet = pastedSheetCells(text), inRange = i => Number.isInteger(i) && i >= 0 && i < sheet.columns;
  if (!inRange(identityColumn) || !['legajo', 'dni'].includes(identity)) throw new EntityTxtError('Elegí la columna que identifica a la persona y si trae legajo o DNI.');
  if (amountColumn === null && quantityColumn === null) throw new EntityTxtError('Elegí la columna del importe o la de la cantidad.');
  if ([amountColumn, quantityColumn].some(i => i !== null && (!inRange(i) || i === identityColumn)) || (amountColumn !== null && amountColumn === quantityColumn)) throw new EntityTxtError('Cada dato tiene que venir de una columna distinta.');
  const isZero = v => v === null || /^0(?:\.0+)?$/.test(v);
  if (filterColumn !== null && (!inRange(filterColumn) || !(filterValues instanceof Set))) throw new EntityTxtError('Elegí la columna del filtro y qué valores se cargan.');
  const issues = [], parsed = [], noValue = []; let zeroLines = 0, blankIdentity = 0, filteredOut = 0;
  for (const { line, cells, embeddedBreaks } of sheet.rows) {
    try {
      const amountRaw = amountColumn === null ? '' : cells[amountColumn], quantityRaw = quantityColumn === null ? '' : cells[quantityColumn];
      // A row with no identity cannot be a novelty (totals), and neither can one with no amount and no quantity (a
      // subtitle, a person listed with a remark only): they are counted and left out, never guessed.
      if (cells[identityColumn] === '') { blankIdentity++; continue; }
      if (filterColumn !== null && !filterValues.has(sheetValue(cells[filterColumn]))) { filteredOut++; continue; }
      if ([identityColumn, amountColumn, quantityColumn].some(i => i !== null && embeddedBreaks.includes(i))) throw Error('el legajo, DNI, importe y cantidad no pueden contener saltos de renglón ni tabulaciones dentro de una celda');
      if (amountRaw === '' && quantityRaw === '') { noValue.push(line); continue; }
      const key = sheetIdentity(cells[identityColumn]);
      if (key === null || (identity === 'dni' && (key.length < 6 || key.length > 8)) || (identity === 'legajo' && key.length > 8)) throw Error(identity === 'dni' ? 'DNI inválido' : 'legajo inválido');
      const amount = sheetDecimal(amountRaw, 2), quantity = sheetDecimal(quantityRaw, 6);
      if (amount === null && quantity === null) throw Error('no informa cantidad ni importe');
      const row = { line, sourceLines: [line], identity, key, quantityDecimal: quantity === null ? null : quantity.whole + (quantity.part ? '.' + quantity.part : ''), amountCents: amount === null ? null : (BigInt(amount.whole) * 100n + BigInt((amount.part + '00').slice(0, 2))).toString() };
      if (row.quantityDecimal !== null && !/^\d{1,12}(?:\.\d{1,6})?$/.test(row.quantityDecimal)) throw Error('cantidad fuera de rango');
      if (row.amountCents !== null && row.amountCents.length > 20) throw Error('importe fuera de rango');
      if (skipZeroRows && isZero(row.quantityDecimal) && isZero(row.amountCents)) { zeroLines++; continue; }
      parsed.push(row);
    } catch (error) { issues.push({ line, message: error.message }); }
  }
  const rows = [], byKey = new Map(), seen = new Map(), repeats = []; let identicalRepeats = 0;
  const signature = parsed.map(r => r.key + '|' + r.amountCents + '|' + r.quantityDecimal), half = parsed.length / 2;
  const halves = parsed.length >= 4 && Number.isInteger(half) && signature.slice(0, half).every((x, i) => x === signature[half + i]);
  for (const row of parsed) {
    const prior = byKey.get(row.key), worth = row.amountCents + '|' + row.quantityDecimal;
    if (!prior) { byKey.set(row.key, row); seen.set(row.key, new Set([worth])); rows.push(row); continue; }
    if (seen.get(row.key).has(worth)) identicalRepeats++; else seen.get(row.key).add(worth);
    repeats.push({ line: row.line, message: `${identity === 'dni' ? 'DNI' : 'legajo'} repetido (también en la fila ${prior.line}); marcá «Sumar repetidos» si corresponde`, repeated: true });
    if (!sumRepeated) continue;
    prior.quantityDecimal = addQuantity(prior.quantityDecimal, row.quantityDecimal);
    prior.amountCents = prior.amountCents === null ? row.amountCents : row.amountCents === null ? prior.amountCents : (BigInt(prior.amountCents) + BigInt(row.amountCents)).toString();
    prior.sourceLines.push(row.line);
  }
  const duplicatedFile = halves || (identicalRepeats >= 3 && identicalRepeats * 20 >= parsed.length * 9);
  if (!sumRepeated && repeats.length && !issues.length && duplicatedFile) throw Object.assign(new EntityTxtError(`Las filas parecen estar pegadas dos veces: ${repeats.length} repiten un ${identity === 'dni' ? 'DNI' : 'legajo'} que ya estaba, ${identicalRepeats} con el mismo valor. Pegalas una sola vez; si de verdad son dos descuentos iguales por persona, marcá «Sumar repetidos».`, repeats), { duplicatedFile: true });
  if (!sumRepeated) issues.push(...repeats);
  if (issues.length) throw new EntityTxtError(`${issues.length} de ${sheet.rows.length} filas no se pueden leer. No se carga una parte de la planilla.`, issues.sort((x, y) => x.line - y.line));
  const totalCents = rows.reduce((sum, r) => sum + BigInt(r.amountCents ?? '0'), 0n).toString();
  return freeze({ formatId: null, identity, lines: sheet.rows.length, rows, longerLines: 0, shortLines: 0, zeroLines, blankIdentity, noValueLines: noValue, filteredOut, leadingLines: sheet.leading, recordLength: null, totalCents, wholePesos: false, droppedCents: '0', split: null, codeConcept: null, mixedCodes: null, repeatedRows: repeats.length, duplicatedFile, withAmount: rows.filter(r => r.amountCents !== null).length, withQuantity: rows.filter(r => r.quantityDecimal !== null).length });
}
