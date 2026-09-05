// Reads saved amounts from Noelia's observed guarantee template. Never evaluates formulas.
export const GUARANTEE_XLSX_MAX_BYTES = 2 * 1024 * 1024;
export const GUARANTEE_XLSX_MAX_ROWS = 500;
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
let zipLoader;
const fail = (message) => { throw new Error(message); };

async function loadZip() {
  if (globalThis.fflate?.unzipSync) return globalThis.fflate.unzipSync;
  if (!zipLoader) zipLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      script.remove(); reject(new Error('El lector de Excel tardó demasiado. Revisá la conexión y reintentá; conservamos tu archivo.'));
    }, 15000);
    script.src = new URL('./vendor/fflate.min.js', import.meta.url).href;
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.fflate?.unzipSync) resolve(globalThis.fflate.unzipSync);
      else reject(new Error('No se pudo abrir el lector de Excel. Reintentá.'));
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('No se pudo cargar el lector de Excel. Revisá la conexión y reintentá.')); };
    document.head.appendChild(script);
  }).catch((error) => { zipLoader = null; throw error; });
  return zipLoader;
}

function entities(raw) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(raw)) fail('El Excel contiene texto XML inválido.');
  return raw.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, token) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, token)) return named[token];
    const n = token[1] === 'x' ? parseInt(token.slice(2), 16) : Number(token.slice(1));
    if (!(n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff)
      || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff))) fail('El Excel contiene un carácter XML inválido.');
    return String.fromCodePoint(n);
  });
}

// Small bounded XML tree, identical in browsers and Node. Names/amounts stay text.
function xml(bytes, expectedRoot, namespace) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 4 * 1024 * 1024) fail('Falta una parte del Excel o supera el tamaño permitido.');
  const input = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(input)) fail('El Excel contiene una declaración no admitida.');
  const stack = []; let root; let offset = 0; let count = 0;
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g;
  for (const match of input.matchAll(tokens)) {
    if (match.index !== offset) fail('El XML del Excel está incompleto.');
    offset += match[0].length;
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (!token.startsWith('<') || token.startsWith('<![CDATA[')) {
      const value = token.startsWith('<![CDATA[') ? token.slice(9, -3) : entities(token);
      if (stack.length) stack.at(-1).text += value;
      else if (value.trim()) fail('El XML del Excel contiene texto fuera de la hoja.');
      continue;
    }
    const close = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(token);
    if (close) {
      if (!stack.length || stack.pop().tag !== close[1]) fail('El XML del Excel no cierra sus elementos correctamente.');
      continue;
    }
    const open = /^<([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/.exec(token);
    if (!open || ++count > 40000 || stack.length > 24) fail('El Excel contiene XML no admitido o demasiado extenso.');
    const attributes = Object.create(null);
    let rest = open[2];
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(rest);
      if (!attr || Object.hasOwn(attributes, attr[1])) fail('El Excel contiene atributos XML inválidos.');
      attributes[attr[1]] = entities(attr[2] ?? attr[3]);
      rest = rest.slice(attr[0].length);
    }
    const node = { tag: open[1], name: open[1].split(':').at(-1), attributes, children: [], text: '' };
    if (stack.length) stack.at(-1).children.push(node);
    else if (root) fail('El Excel contiene más de una raíz XML.');
    else root = node;
    if (!open[3]) stack.push(node);
  }
  if (offset !== input.length || stack.length || root?.name !== expectedRoot) fail('La estructura XML no corresponde a esta planilla.');
  const prefix = root.tag.includes(':') ? `xmlns:${root.tag.split(':')[0]}` : 'xmlns';
  if (root.attributes[prefix] !== namespace) fail('El archivo no usa el formato Excel admitido.');
  return root;
}
const children = (node, name) => node?.children.filter((child) => child.name === name) || [];
function one(node, name, optional = false) {
  const items = children(node, name);
  if (items.length !== 1 && !(optional && items.length === 0)) fail(`El Excel no contiene un único elemento ${name}.`);
  return items[0];
}
function textNodes(node) {
  return node?.name === 't' ? node.text : (node?.children || []).map(textNodes).join('');
}
function cellValue(node, strings) {
  if (!node) return '';
  const type = node.attributes.t;
  if (type === 'e' || type === 'b') fail('La celda contiene un error de Excel o un valor no numérico.');
  if (type === 'inlineStr') return textNodes(one(node, 'is'));
  const v = one(node, 'v', true);
  if (children(node, 'f').length && (!v || !v.text.trim())) fail('La fórmula no tiene un importe guardado. Recalculá y guardá el Excel.');
  const raw = v?.text.trim() || '';
  if (type === 's') {
    if (!/^\d{1,5}$/.test(raw) || strings[Number(raw)] === undefined) fail('La celda referencia texto ausente.');
    return strings[Number(raw)];
  }
  return raw;
}
function cents(raw) {
  // Exact decimal arithmetic; no Number/Math.round or formula evaluation.
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,24}))?$/.exec(raw);
  if (!match) fail('El importe debe ser un número guardado, no negativo, de hasta 9.999.999,99.');
  const fraction = (match[2] || '').padEnd(2, '0');
  let value = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2));
  if (fraction.length > 2 && fraction[2] >= '5') value += 1n;
  if (value > 999999999n) fail('El importe redondeado supera el límite del formato RETRO.');
  return { value, rounded: /[1-9]/.test(fraction.slice(2)) };
}
const decimal = (value) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export async function parseGuaranteeXlsx(sourceBytes, { period, conceptCode, unzipImpl } = {}) {
  const issues = []; const candidates = []; let total = 0n; let roundingCount = 0; let sheetName = null;
  const issue = (rowNumber, column, message) => issues.push({ rowNumber, column, code: 'guarantee_input_invalid', message });
  let files;
  try {
    if (!/^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])$/.test(period || '') || conceptCode !== '195') fail('Elegí un período válido y el formato de garantía del concepto 195.');
    const bytes = sourceBytes instanceof Uint8Array ? new Uint8Array(sourceBytes)
      : sourceBytes instanceof ArrayBuffer ? new Uint8Array(sourceBytes.slice(0)) : null;
    if (!bytes || bytes.length < 22 || bytes.length > GUARANTEE_XLSX_MAX_BYTES || bytes[0] !== 80 || bytes[1] !== 75) fail('Seleccioná un Excel .xlsx de garantía de hasta 2 MiB.');
    const unzip = unzipImpl || await loadZip();
    let entries = 0; let expanded = 0; const paths = new Set();
    files = unzip(bytes, { filter(entry) {
      if (++entries > 160 || paths.has(entry.name) || !Number.isSafeInteger(entry.originalSize)
        || entry.originalSize < 0 || entry.originalSize > 4 * 1024 * 1024
        || entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.split('/').includes('..')
        || /vba|activeX|embeddings|externalLinks|connections|queryTables/i.test(entry.name)) fail('El Excel incluye contenido o tamaños no admitidos. Guardá una copia .xlsx simple.');
      paths.add(entry.name); expanded += entry.originalSize;
      if (expanded > 12 * 1024 * 1024) fail('El contenido expandido del Excel supera el límite.');
      return /^(?:xl\/(?:workbook\.xml|sharedStrings\.xml|worksheets\/[^/]+\.xml)|.*\.rels)$/.test(entry.name);
    } });
    for (const [path, bytesPart] of Object.entries(files)) {
      if (!(bytesPart instanceof Uint8Array) || bytesPart.length > 4 * 1024 * 1024) fail('Una parte del Excel supera el límite.');
      if (path.endsWith('.rels')) {
        const rels = xml(bytesPart, 'Relationships', REL_NS);
        if (children(rels, 'Relationship').some((rel) => rel.attributes.TargetMode?.toLowerCase() === 'external')) fail('La planilla tiene vínculos externos. Guardá una copia sin ellos.');
      }
    }
    const book = xml(files['xl/workbook.xml'], 'workbook', NS);
    const sheets = children(one(book, 'sheets'), 'sheet');
    if (sheets.length !== 1 || (sheets[0].attributes.state && sheets[0].attributes.state !== 'visible')) fail('Elegí el libro original de garantía con una sola hoja visible.');
    const sheet = sheets[0]; sheetName = sheet.attributes.name;
    if (sheetName !== `195 ${period.slice(5)}.${period.slice(0, 4)}`) fail('El mes de la hoja de garantía no coincide con el período elegido. Revisá ambos; no se cambia el período automáticamente.');
    const rels = xml(files['xl/_rels/workbook.xml.rels'], 'Relationships', REL_NS);
    const matches = children(rels, 'Relationship').filter((rel) => rel.attributes.Id === sheet.attributes['r:id']);
    if (matches.length !== 1 || !matches[0].attributes.Type?.endsWith('/worksheet')) fail('No se pudo identificar la hoja de garantía.');
    const target = matches[0].attributes.Target;
    if (!/^worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(target || '')) fail('La hoja del Excel tiene una ubicación no admitida.');
    const strings = files['xl/sharedStrings.xml']
      ? children(xml(files['xl/sharedStrings.xml'], 'sst', NS), 'si').map(textNodes) : [];
    if (strings.length > 10000 || strings.some((s) => s.length > 2000)) fail('La planilla contiene demasiado texto.');
    const worksheet = xml(files[`xl/${target}`], 'worksheet', NS);
    if (children(one(worksheet, 'cols', true), 'col').some((col) => ['1', 'true'].includes(col.attributes.hidden))) fail('La planilla tiene columnas ocultas; mostralas antes de revisar la carga.');
    const rows = children(one(worksheet, 'sheetData'), 'row');
    if (rows.length < 2 || rows.length > GUARANTEE_XLSX_MAX_ROWS + 2) fail('La planilla debe contener entre 1 y 500 legajos, además del encabezado y total.');
    const seen = new Set(); let prior = 0; let totalFound = false;
    for (const row of rows) {
      const n = Number(row.attributes.r);
      if (!Number.isSafeInteger(n) || n < 1 || n > 502 || n !== prior + 1) fail('Las filas no son consecutivas. Revisá filas vacías o fuera de rango.');
      prior = n;
      if (['1', 'true'].includes(row.attributes.hidden)) fail('Hay filas ocultas. Mostralas antes de revisar la carga.');
      const cells = Object.create(null);
      for (const cell of children(row, 'c')) {
        const ref = /^([A-Z]{1,3})([1-9]\d*)$/.exec(cell.attributes.r || '');
        if (!ref || Number(ref[2]) !== n || cells[ref[1]]) fail('El Excel repite o mezcla referencias de celda.');
        cells[ref[1]] = cell;
        for (const formula of children(cell, 'f')) {
          if (/[\[\]]|https?:|DDE|WEBSERVICE|HYPERLINK/i.test(formula.text)) fail('La planilla contiene fórmulas con vínculos no admitidos.');
        }
      }
      if (n === 1) {
        const normalized = (v) => v.trim().toUpperCase().replace(/\s+/g, '');
        if (normalized(cellValue(cells.B, strings)) !== 'LEGAJO' || normalized(cellValue(cells.K, strings)) !== 'COEF.81%') fail('No es la plantilla de garantía: se esperan B «Legajo» y K «COEF. 81%».');
        continue;
      }
      try {
        const rawLegajo = cellValue(cells.B, strings);
        if (!rawLegajo) {
          const f = one(cells.K, 'f', true);
          if (n !== rows.length || totalFound || !f || f.text.trim().toUpperCase() !== `SUM(K2:K${n - 1})`) fail('Falta el legajo; sólo se excluye un total SUM al final.');
          cellValue(cells.K, strings); // Cached total must exist, but is not the sum of rounded rows.
          totalFound = true;
          continue;
        }
        if (children(cells.B, 'f').length || !/^\d{1,8}$/.test(rawLegajo)) fail('El legajo debe estar guardado como hasta 8 dígitos, no como una fórmula.');
        const legajo = BigInt(rawLegajo).toString();
        if (seen.has(legajo)) fail('Este legajo está repetido. Corregí ambas filas antes de crear el lote.');
        seen.add(legajo);
        if (cells.K?.attributes.t && cells.K.attributes.t !== 'n') fail('El importe debe ser numérico; no se aceptan números almacenados como texto.');
        const amount = cents(cellValue(cells.K, strings));
        total += amount.value; roundingCount += Number(amount.rounded);
        candidates.push({ legajo, conceptCode: '195', amountDecimal: decimal(amount.value), quantityDecimal: '0.0000' });
      } catch (error) { issue(n, 'B / K', error.message); }
    }
    if (!candidates.length || candidates.length > GUARANTEE_XLSX_MAX_ROWS) fail('No hay un lote válido de entre 1 y 500 legajos.');
  } catch (error) { issue(0, '', error instanceof Error ? error.message : 'No se pudo abrir el Excel de garantía.'); }
  finally { if (files) for (const part of Object.values(files)) part.fill(0); }
  const ok = issues.length === 0;
  return {
    ok, rows: ok ? candidates : [], issues,
    summary: { rowCount: candidates.length + issues.filter((i) => i.rowNumber > 0).length,
      acceptedCount: candidates.length, rejectedCount: issues.length, roundingCount,
      totalAmountCents: ok ? total.toString() : null, totalAmountDecimal: ok ? decimal(total) : null },
    source: { sheetName, period, conceptCode, formulaPolicy: 'cached_values_half_up' },
  };
}
