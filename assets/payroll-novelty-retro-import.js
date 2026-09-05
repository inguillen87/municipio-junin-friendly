// RETRO observed layout: LEGAJO [0, 8), IMPORTE [8, 18).
// This reader validates local input only; it does not certify concepts or write GRH.
export const RETRO_MAX_BYTES = 256 * 1024;
export const RETRO_MAX_ROWS = 500;

export function parsePayrollNoveltyRetro(source, { conceptSourceId } = {}) {
  const concept = String(conceptSourceId ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,19})$/.test(concept)) {
    throw new Error('Indicá el concepto GRH para todas las filas del TXT RETRO. No se toma del nombre del archivo.');
  }
  if (typeof source !== 'string') throw new Error('El contenido RETRO debe ser texto UTF-8.');
  if (new TextEncoder().encode(source).byteLength > RETRO_MAX_BYTES) {
    throw new Error('El TXT RETRO supera 256 KiB. Dividí el archivo de origen en lotes de hasta 500 filas y volvé a validarlo.');
  }
  const text = source.startsWith('\uFEFF') ? source.slice(1) : source;
  if (!text) throw new Error('Pegá o cargá un TXT RETRO antes de validar.');
  const lines = text.split(/\r\n|\n/);
  // One final line ending is a delimiter, not an extra record. Other blanks fail.
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length > RETRO_MAX_ROWS) {
    throw new Error('El TXT RETRO debe tener entre 1 y 500 filas. No se recorta el archivo automáticamente.');
  }
  const candidates = [];
  const errors = [];
  const seen = new Map();
  for (const [index, line] of lines.entries()) {
    const rowOrdinal = index + 1;
    const reject = (code, message) => errors.push({ rowOrdinal, code, message });
    if (line.includes('\r')) {
      reject('invalid_line_ending', 'Usá saltos de línea Windows (CRLF) o LF; hay un retorno de carro aislado.');
      continue;
    }
    if (line.length !== 18) {
      reject('invalid_width', `Tiene ${line.length} caracteres; RETRO exige 18: 8 de legajo y 10 de importe. Revisá que sea RETRO y no otro TXT.`);
      continue;
    }
    const legajoToken = line.slice(0, 8);
    const amountToken = line.slice(8);
    if (!/^\d{8}$/.test(legajoToken)) {
      reject('invalid_legajo', 'El legajo debe ocupar los primeros 8 caracteres, sólo con dígitos y ceros de relleno.');
      continue;
    }
    if (!/^\d{7}\.\d{2}$/.test(amountToken)) {
      reject('invalid_amount', 'El importe debe tener 7 dígitos, punto y 2 decimales. No se admiten signos, comas ni centavos implícitos.');
      continue;
    }
    const legajo = legajoToken.replace(/^0+(?=\d)/, '');
    if (seen.has(legajo)) {
      reject('duplicate_business_key', `Repite el legajo y concepto de la fila ${seen.get(legajo)}. Revisá ambas filas antes de volver a validar.`);
      continue;
    }
    seen.set(legajo, rowOrdinal);
    const amountCents = ((BigInt(amountToken.slice(0, 7)) * 100n)
      + BigInt(amountToken.slice(8))).toString();
    candidates.push({
      rowOrdinal, legajo, conceptSourceId: concept,
      costCenterSourceId: null, adjustmentMonth: null, quantityDecimal: null,
      amountCents, movementType: null, legalInstrument: null, observation: null,
      forced: false,
    });
  }
  const ok = errors.length === 0;
  return {
    ok,
    totalRows: lines.length,
    acceptedCount: candidates.length,
    rejectedCount: errors.length,
    // Never expose a prepare-ready subset when the file contains rejected rows.
    rows: ok ? candidates : [],
    errors,
  };
}
