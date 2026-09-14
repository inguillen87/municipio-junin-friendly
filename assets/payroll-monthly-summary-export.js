import { storedZip } from './clock-dashboard-zip.js';
import { MONTHLY_SUMMARY_VERSION, monthlyDecimal, monthlyClosure, monthlyType, monthlyObservations } from './payroll-monthly-summary-model.js';

const headings = ['Código', 'Concepto', 'Unidad', 'Ocurrencias', 'Legajos únicos', 'Cantidad', 'Importe', 'Observaciones'];
const xml = v => String(v ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const col = n => String.fromCharCode(65 + n);
const number = raw => ({ numeric: String(raw) });
// Canonical Helvetica AFM widths (ASCII 32..126), in thousandths of an em.
// Accented Latin letters use their base glyph; other WinAnsi characters use
// the font's maximum width as a conservative bound, never an average width.
const regularWidths = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const boldWidths = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function glyphWidth(char, bold) {
  const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), n = base.codePointAt(0);
  return base.length === 1 && n >= 32 && n <= 126 ? (bold ? boldWidths : regularWidths)[n - 32] : 1015;
}
export function monthlyPdfTextWidth(value, size = 8, bold = false) { return [...String(value)].reduce((width, char) => width + glyphWidth(char, bold) * size / 1000, 0); }
export function monthlyPdfLines(value, width, size = 8, bold = false) {
  const result = []; let line = '';
  for (const word of String(value).split(/\s+/)) {
    const candidate = line ? line + ' ' + word : word;
    if (monthlyPdfTextWidth(candidate, size, bold) <= width) { line = candidate; continue; }
    if (line) { result.push(line); line = ''; }
    for (const char of word) {
      if (line && monthlyPdfTextWidth(line + char, size, bold) > width) { result.push(line); line = ''; }
      line += char;
    }
  }
  if (line) result.push(line); return result.length ? result : [''];
}
// Excel keeps at most 15 significant digits. Emit the decimal literal without
// passing through Number; larger values remain exact, non-executable text.
export function monthlyExcelDecimal(raw) {
  if (raw === null) return 'No informado';
  if (!/^-?(?:0|[1-9]\d{0,21})\.\d{2}$/.test(raw)) throw Error('Decimal inválido.');
  const digits = raw.replace(/[-.]/g, '').replace(/^0+/, '');
  return digits.length <= 15 ? number(raw) : raw;
}
function checked(data, view, queriedAt) {
  if (data?.version !== MONTHLY_SUMMARY_VERSION || data.mode !== 'summary' || !Array.isArray(view?.rows)
    || view.rows.length > 1000 || !Number.isFinite(Date.parse(queriedAt))) throw Error('El resumen no está disponible para descargar.');
  const allowed = new Set(data.rows);
  if (view.rows.some(r => !allowed.has(r)) || new Set(view.rows).size !== view.rows.length) throw Error('El filtro no corresponde al resumen consultado.');
}
function controlRows(data, view, queriedAt) {
  return [['Control y procedencia', 'Valor'], ['Reporte', 'Resumen mensual · corridas seleccionadas'], ['Período de imputación', data.period],
    ['Alcance', 'General de las corridas seleccionadas disponibles. No certifica que estén todas las corridas del mes.'],
    ['Uso', 'Control interno. No calcula ni acredita pagos, no constituye cierre ni presentación oficial.'],
    ['Consulta', queriedAt], ['Huella del resumen SHA-256', data.reportHash], ['Corridas seleccionadas', String(data.counts.datasetCount)],
    ['Participaciones en corridas', String(data.counts.statementParticipations)], ['Legajos únicos de la selección', String(data.counts.distinctLegajos)],
    ['Líneas de origen de la selección', String(data.counts.lineCount)], ['Conceptos de la selección', String(data.counts.conceptCount)],
    ['Conceptos exportados', String(view.rows.length)], ['Búsqueda', view.filters.search || 'Sin búsqueda'],
    ['Filtro', { all: 'Todos', missing: 'Con datos faltantes', informed: 'Sin faltantes en las líneas incluidas' }[view.filters.status]],
    ['Paginación', 'El archivo incluye todo el filtro, no sólo la página visible.'],
    ['Ocurrencias', 'Líneas registradas del concepto en las corridas seleccionadas. No equivalen a personas.'],
    ['Legajos únicos', 'Cada legajo se cuenta una vez en la selección o concepto. No sumar esta columna entre conceptos.'],
    ['Cantidades', 'Suma de las cantidades informadas del concepto y su unidad; no implica días ni personas.'],
    ['Faltantes', 'Si falta una cantidad o importe en alguna línea del concepto, su suma se muestra como No informado.'],
    ['Ausencia', 'Un concepto ausente no equivale a cero.'], ['Totales', 'No se suman conceptos entre sí: componentes y totalizadores pueden solaparse.'],
    ['Precisión Excel', 'Decimales de hasta 15 cifras significativas en celdas numéricas. Valores mayores en texto exacto con punto decimal; no se redondean.'],
    ['Fecha y período', 'La fecha de corrida puede estar fuera del período de imputación. La selección usa año y mes de origen.'],
    ['Cierre en origen', 'Es un dato de cada corrida; no certifica el cierre mensual ni un pago.']];
}
function sheet(rows, widths, filter = false) {
  const body = rows.map((row, i) => `<row r="${i + 1}" ht="36" customHeight="1">` + row.map((v, j) => {
    const address = col(j) + (i + 1);
    if (v && typeof v === 'object' && 'numeric' in v) return `<c r="${address}" s="2"><v>${v.numeric}</v></c>`;
    return `<c r="${address}" s="${i ? 0 : 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${filter ? `<autoFilter ref="A1:${col(widths.length - 1)}${rows.length}"/>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LMuniControl · Control interno&amp;RPágina &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
export function monthlySummaryXlsx(data, view, queriedAt) {
  checked(data, view, queriedAt);
  const concepts = [headings, ...view.rows.map(r => [r.code, r.description, r.unit ?? 'No informada', number(r.sourceRows), number(r.distinctLegajos),
    monthlyExcelDecimal(r.quantity), monthlyExcelDecimal(r.amount), monthlyObservations(r)])];
  const sources = [['ID de corrida', 'Fuente', 'Fecha de corrida', 'Período de imputación', 'Tipo', 'Cierre en origen', 'Legajos de la corrida', 'Líneas', 'SHA-256 del respaldo', 'Huella del contenido', 'Incorporación'],
    ...data.sources.map(s => [s.datasetId, s.sourceLabel, s.date, String(s.sourcePeriod) + '-' + String(s.sourceMonth).padStart(2, '0'), s.type + ' · ' + monthlyType(s.type),
      monthlyClosure(s.closureStatus), number(s.statementCount), number(s.lineCount), s.sourceSha256, s.payloadHash, s.importedAt])];
  const names = ['Conceptos', 'Fuentes', 'Control'];
  const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><name val="Calibri"/><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143849"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="center"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0"><alignment wrapText="1" vertical="center"/></xf><xf fontId="0" fillId="0" borderId="0" xfId="0" numFmtId="164" applyNumberFormat="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs></styleSheet>';
  return storedZip([
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="office" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="sheet${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="sheet${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet(concepts, [12, 43, 16, 16, 17, 28, 32, 48], true)],
    ['xl/worksheets/sheet2.xml', sheet(sources, [40, 38, 20, 20, 35, 24, 20, 18, 70, 70, 34], true)],
    ['xl/worksheets/sheet3.xml', sheet(controlRows(data, view, queriedAt), [36, 110])],
  ]);
}

// A compact PDF with separate concept, source and control tables. Decimals are
// already formatted strings, so the PDF never rounds them through Number.
export function monthlySummaryPdf(data, view, queriedAt) {
  checked(data, view, queriedAt);
  const pages = []; let ops, y, activeTitle = '';
  const chars = { 0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02c6: 136,
    0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148,
    0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155, 0x0153: 156, 0x017e: 158, 0x0178: 159, 0x2212: 45 };
  const hex = value => '<' + [...String(value)].map(c => {
    const n = c.codePointAt(0), encoded = n <= 127 || n >= 160 && n <= 255 ? n : chars[n];
    if (encoded === undefined) throw Object.assign(Error('El PDF no admite algunos caracteres de esta fuente sin alterarlos. Descargá el Excel para conservar el texto exacto.'), { exportOnly: true });
    return encoded.toString(16).padStart(2, '0');
  }).join('') + '>';
  const draw = (x, top, value, size = 8, bold = false, color = '0.08 0.22 0.29') => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${595 - top} Tm ${hex(value)} Tj ET`);
  const rect = (x, top, w, h, color) => ops.push(`${color} rg ${x} ${595 - top - h} ${w} ${h} re f`);
  function page() {
    ops = []; pages.push(ops); rect(0, 0, 842, 82, '0.045 0.15 0.20');
    draw(32, 26, 'MuniControl | Resumen mensual', 17, true, '1 1 1');
    draw(32, 48, 'Imputación ' + data.period + ' · ' + data.counts.datasetCount + ' corridas seleccionadas · ' + activeTitle, 10, false, '1 1 1');
    draw(32, 68, 'General disponible · No certifica mes completo, cierre ni pago.', 9, false, '1 1 1');
    draw(32, 566, 'Control interno · Consulta ' + queriedAt + ' · Página ' + pages.length, 7);
    draw(32, 581, 'SHA-256 del resumen: ' + data.reportHash, 6.5); y = 98;
  }
  function table(title, labels, values, widths) {
    activeTitle = title; const total = widths.reduce((a, b) => a + b, 0), sizes = widths.map(w => w / total * 778);
    function header() {
      const parts = labels.map((v, i) => monthlyPdfLines(v, sizes[i] - 12, 8, true));
      const h = Math.max(...parts.map(p => p.length)) * 10 + 14; rect(32, y, 778, h, '0.09 0.24 0.30'); let x = 32;
      parts.forEach((p, i) => { p.forEach((line, j) => draw(x + 5, y + 12 + j * 10, line, 8, true, '1 1 1')); x += sizes[i]; }); y += h;
    }
    page(); header();
    values.forEach((row, index) => {
      const parts = row.map((v, i) => monthlyPdfLines(v, sizes[i] - 12));
      const h = Math.max(...parts.map(p => p.length)) * 11 + 14;
      if (y + h > 546) { page(); header(); }
      if (index % 2 === 0) rect(32, y, 778, h, '0.94 0.97 0.97'); let x = 32;
      parts.forEach((p, i) => { p.forEach((line, j) => draw(x + 5, y + 13 + j * 11, line, 8)); x += sizes[i]; }); y += h;
    });
    if (!values.length) draw(38, y + 24, 'Sin conceptos para este filtro.', 10);
  }
  table('Conceptos del filtro', headings, view.rows.map(r => [r.code, r.description, r.unit ?? 'No informada', String(r.sourceRows), String(r.distinctLegajos), monthlyDecimal(r.quantity), monthlyDecimal(r.amount), monthlyObservations(r)]), [10, 29, 13, 13, 14, 23, 27, 27]);
  table('Fuentes exactas de la selección', ['Corrida y origen', 'Período, tipo y cierre', 'Volumen e incorporación', 'Huellas SHA-256'], data.sources.map(s => [
    s.datasetId + ' · ' + s.sourceLabel + ' · Fecha: ' + s.date,
    s.sourcePeriod + '-' + String(s.sourceMonth).padStart(2, '0') + ' · ' + s.type + ' · ' + monthlyType(s.type) + ' · ' + monthlyClosure(s.closureStatus),
    s.statementCount + ' legajos · ' + s.lineCount + ' líneas · Incorporado: ' + s.importedAt,
    'Respaldo: ' + s.sourceSha256 + ' Contenido: ' + s.payloadHash,
  ]), [28, 22, 22, 34]);
  const controls = controlRows(data, view, queriedAt); table('Control y alcance', controls[0], controls.slice(1), [30, 100]);
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'], kids = [];
  for (const p of pages) { const id = objects.length, content = p.join('\n'); kids.push(id + ' 0 R'); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`); }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`; let result = '%PDF-1.4\n'; const offsets = [0];
  objects.slice(1).forEach((v, i) => { offsets.push(result.length); result += (i + 1) + ' 0 obj\n' + v + '\nendobj\n'; }); const start = result.length;
  result += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(result);
}
