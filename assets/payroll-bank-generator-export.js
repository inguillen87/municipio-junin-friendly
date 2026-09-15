import { storedZip } from './clock-dashboard-zip.js';
import { monthlyExcelDecimal, monthlyPdfLines } from './payroll-monthly-summary-export.js';
import { bankReportFilter, bankNames, accountNames, bankAccountLabel, bankObservations, bankMoney } from './payroll-bank-generator-model.js';

const shown = value => value === null || value === '' ? 'No informado' : String(value);
const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const col = value => String.fromCharCode(65 + value);
function exactExcelMoney(raw) {
  if (raw === null) return 'No informado';
  if (!/^-?(?:0|[1-9]\d{0,25})\.\d{2}$/.test(raw)) throw Error('Importe de control inválido.');
  return raw.replace(/[-.]/g, '').replace(/^0+/, '').length > 15 ? raw : monthlyExcelDecimal(raw);
}
function checked(data, view, when) {
  if (data?.version !== 'payroll-bank-report.v1' || data.mode !== 'report' || !Array.isArray(view?.rows) || view.rows.length > 5000 || !Number.isFinite(Date.parse(when))) throw Error('La planilla no está disponible para descargar.');
  const selected = bankReportFilter(data, view.filters);
  if (selected.rows.length !== view.rows.length || selected.rows.some((row, index) => row !== view.rows[index])) throw Error('El filtro no corresponde a la fuente consultada.');
}
export function bankControlRows(data, view, when) {
  return [['Control y procedencia', 'Valor'], ['Reporte', 'Planilla bancaria · control interno'], ['Uso', 'No es un archivo bancario de pago. No ordena transferencias ni acredita pagos.'],
    ['Período de imputación', data.dataset.period], ['Fecha de liquidación', data.dataset.date], ['Tipo de liquidación', data.dataset.type],
    ['Fuente de nómina', data.dataset.sourceLabel], ['ID de liquidación', data.dataset.datasetId], ['SHA-256 de nómina', data.dataset.sourceSha256], ['Huella del contenido de nómina', data.dataset.payloadHash],
    ['Corte bancario declarado', data.bankSource.cutoff + ' · hora de origen, sin zona horaria declarada'], ['SHA-256 de fuente bancaria', data.bankSource.sourceSha256], ['Huella del contenido bancario', data.bankSource.payloadSha256],
    ['Huella del reporte', data.reportHash], ['Consulta', when], ['Banco del filtro', bankNames[view.filters.bank] || (view.filters.bank === 'unknown' ? 'Sin identificar' : 'Todos')],
    ['Jurisdicción del filtro', view.filters.jurisdiction === 'all' ? 'Todas' : view.filters.jurisdiction === 'unknown' ? 'No informada' : view.filters.jurisdiction],
    ['Tipo de cuenta del filtro', accountNames[view.filters.account] || (view.filters.account === 'unknown' ? 'Sin verificar' : 'Todos')], ['Búsqueda', view.filters.search || 'Sin búsqueda'],
    ['Observaciones del filtro', { all: 'Todas las filas', observed: 'Con observaciones', informed: 'Sin observaciones informadas' }[view.filters.issues]],
    ['Filas de la liquidación', String(data.rows.length)], ['Filas exportadas', String(view.rows.length)], ['Con observaciones', String(view.observed)], ['Netos ausentes', String(view.missingAmounts)],
    ['Neto del filtro', view.total === null ? 'No evaluable: hay netos ausentes' : bankMoney(view.total)], ['Suma de netos informados', bankMoney(view.knownTotal)],
    ['Cobertura', 'Se incluyen todas las filas del filtro, no sólo la página visible. No certifica todas las liquidaciones del mes.'],
    ['Tipos de cuenta', 'Se conservan los códigos originales. Un tipo no verificado no se presume caja de ahorro ni cuenta corriente.'],
    ['Jurisdicción', 'Corresponde al historial disponible para la corrida; no se reconstruye con el reparto actual.'],
    ['Precisión Excel', 'CBU, cuentas, CUIL y códigos son texto. Netos de hasta 15 cifras significativas son numéricos; importes mayores quedan como texto exacto.']];
}
function groups(data, view) {
  const keys = [...new Set(view.rows.map(row => JSON.stringify([row.bankLabel, row.jurisdiction, row.repartitionCode, row.repartitionLabel])))];
  return keys.map(key => {
    const [bank, jurisdiction, code, label] = JSON.parse(key), rows = view.rows.filter(row => JSON.stringify([row.bankLabel, row.jurisdiction, row.repartitionCode, row.repartitionLabel]) === key);
    const filtered = bankReportFilter({ ...data, rows });
    return { bank, jurisdiction, code, label, count: rows.length, observed: filtered.observed, total: filtered.total };
  });
}
function sheet(rows, widths, filter = false) {
  const cells = rows.map((row, index) => `<row r="${index + 1}"${index ? '' : ' ht="32" customHeight="1"'}>` + row.map((value, c) => value && typeof value === 'object' && 'numeric' in value
    ? `<c r="${col(c)}${index + 1}" s="2"><v>${value.numeric}</v></c>`
    : `<c r="${col(c)}${index + 1}" t="inlineStr" s="${index ? 0 : 1}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('') + '</row>').join('');
  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${cells}</sheetData>${filter ? `<autoFilter ref="A1:${col(widths.length - 1)}${rows.length}"/>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LMuniControl · Control interno, no pago&amp;RPágina &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
export function bankReportXlsx(data, view, when) {
  checked(data, view, when);
  const rows = [['Legajo', 'Apellido y nombre', 'CUIL', 'Banco código', 'Banco', 'Tipo cuenta código', 'Tipo de cuenta', 'Cuenta', 'CBU', 'Jurisdicción', 'Repartición código', 'Repartición', 'Neto a pagar en origen', 'Observaciones'],
    ...view.rows.map(row => [shown(row.legajo), shown(row.name), shown(row.cuil), shown(row.bankCode), shown(row.bankLabel), shown(row.accountTypeCode), accountNames[row.accountType] || 'Sin verificar', shown(row.accountNumber), shown(row.cbu), shown(row.jurisdiction), shown(row.repartitionCode), shown(row.repartitionLabel), exactExcelMoney(row.netAmount), bankObservations(row)])];
  const summary = [['Banco', 'Jurisdicción', 'Repartición código', 'Repartición', 'Filas', 'Con observaciones', 'Neto informado'], ...groups(data, view).map(group => [shown(group.bank), shown(group.jurisdiction), shown(group.code), shown(group.label), String(group.count), String(group.observed), exactExcelMoney(group.total)])];
  const tables = [sheet(rows, [12, 36, 18, 14, 22, 16, 23, 24, 29, 16, 18, 32, 25, 55], true), sheet(summary, [22, 18, 18, 36, 12, 20, 27], true), sheet(bankControlRows(data, view, when), [36, 110])], names = ['Planilla', 'Resumen', 'Control'];
  const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><name val="Calibri"/><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143849"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="center"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0"><alignment wrapText="1" vertical="center"/></xf><xf fontId="0" fillId="0" borderId="0" xfId="0" numFmtId="164" applyNumberFormat="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return storedZip([['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="office" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="sheet${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="sheet${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles], ...tables.map((value, i) => [`xl/worksheets/sheet${i + 1}.xml`, value])]);
}

export function bankReportPdf(data, view, when) {
  checked(data, view, when);
  const pages = []; let ops, y, activeTitle = '';
  const winAnsi = { 0x20ac: 128, 0x2026: 133, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x2212: 45 };
  const hex = value => '<' + [...String(value)].map(char => {
    const code = char.codePointAt(0), byte = code <= 127 || code >= 160 && code <= 255 ? code : winAnsi[code];
    if (byte === undefined) throw Object.assign(Error('El PDF no puede conservar algunos caracteres. Descargá el Excel para mantener el texto exacto.'), { exportOnly: true });
    return byte.toString(16).padStart(2, '0');
  }).join('') + '>';
  const draw = (x, top, value, size = 8, bold = false, color = '0.08 0.22 0.29') => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${595 - top} Tm ${hex(value)} Tj ET`);
  const rect = (x, top, w, h, color) => ops.push(`${color} rg ${x} ${595 - top - h} ${w} ${h} re f`);
  function page() {
    ops = []; pages.push(ops); rect(0, 0, 842, 82, '0.045 0.15 0.20');
    draw(32, 25, 'MuniControl | Planilla bancaria', 17, true, '1 1 1');
    draw(32, 47, data.dataset.period + ' · Liquidación ' + data.dataset.date + ' · ' + activeTitle, 10, false, '1 1 1');
    draw(32, 68, 'Control interno · No ordena transferencias ni acredita pagos.', 9, false, '1 1 1');
    draw(32, 565, 'Corte bancario declarado: ' + data.bankSource.cutoff + ' · Página ' + pages.length, 7);
    draw(32, 582, 'Reporte SHA-256: ' + data.reportHash, 6.5); y = 98;
  }
  function table(title, labels, values, weights, compact = false) {
    activeTitle = title; const widths = weights.map(weight => weight / weights.reduce((a, b) => a + b, 0) * 778);
    const padding = compact ? 9 : 14, lineHeight = 11, fontSize = compact ? 8.5 : 8;
    function header() {
      const parts = labels.map((label, i) => monthlyPdfLines(label, widths[i] - 12, 8, true)), height = Math.max(...parts.map(lines => lines.length)) * 10 + 14;
      rect(32, y, 778, height, '0.09 0.24 0.30'); let x = 32;
      parts.forEach((lines, i) => { lines.forEach((line, j) => draw(x + 5, y + 12 + j * 10, line, 8, true, '1 1 1')); x += widths[i]; }); y += height;
    }
    page(); header();
    values.forEach((row, index) => {
      const parts = row.map((value, i) => monthlyPdfLines(value, widths[i] - 12, fontSize));
      let offset = 0; const totalLines = Math.max(...parts.map(lines => lines.length));
      while (offset < totalLines) {
        let capacity = Math.floor((544 - y - padding) / lineHeight);
        if (capacity < Math.min(totalLines - offset, 3)) { page(); header(); capacity = Math.floor((544 - y - padding) / lineHeight); }
        const count = Math.min(capacity, totalLines - offset), height = count * lineHeight + padding;
        if (index % 2 === 0) rect(32, y, 778, height, '0.94 0.97 0.97'); let x = 32;
        parts.forEach((lines, i) => { lines.slice(offset, offset + count).forEach((line, j) => draw(x + 5, y + (compact ? 12 : 13) + j * lineHeight, line, fontSize)); x += widths[i]; }); y += height; offset += count;
        if (offset < totalLines) { page(); header(); }
      }
    });
    if (!values.length) draw(38, y + 24, 'Sin filas para este filtro.', 10);
  }
  table('Resumen del filtro', ['Banco', 'Jurisdicción / repartición', 'Filas', 'Observadas', 'Neto informado'], groups(data, view).map(group => [shown(group.bank), shown(group.jurisdiction) + ' · ' + shown(group.code) + ' · ' + shown(group.label), String(group.count), String(group.observed), bankMoney(group.total)]), [23, 45, 12, 17, 29]);
  // Short references preserve the exact source labels in a separate legend and
  // avoid repeating long bank/department/observation text on every employee.
  const legend = [], entries = new Map(), counts = { B: 0, T: 0, R: 0, O: 0 };
  function reference(kind, value) {
    const key = JSON.stringify([kind, value]);
    if (!entries.has(key)) {
      const id = kind + (++counts[kind]); entries.set(key, id);
      legend.push([id, { B: 'Banco', T: 'Tipo de cuenta', R: 'Jurisdicción / repartición', O: 'Observación' }[kind], value]);
    }
    return entries.get(key);
  }
  const nominal = view.rows.map(row => [shown(row.legajo), shown(row.name), shown(row.cuil),
    reference('B', shown(row.bankCode) + ' · ' + shown(row.bankLabel)),
    reference('T', bankAccountLabel(row)), shown(row.accountNumber), shown(row.cbu),
    reference('R', shown(row.jurisdiction) + ' · ' + shown(row.repartitionCode) + ' · ' + shown(row.repartitionLabel)),
    bankMoney(row.netAmount), bankObservations(row).split(' · ').map(value => reference('O', value)).join(', ')]);
  table('Todas las filas · B/T/R/O: ver leyenda de códigos', ['Legajo', 'Nombre', 'CUIL', 'Banco', 'Tipo', 'Cuenta', 'CBU', 'Jur. / rep.', 'Neto en origen', 'Obs.'], nominal, [41, 167, 75, 40, 32, 70, 116, 40, 105, 92], true);
  table('Leyenda completa · códigos de la planilla', ['Código', 'Dato', 'Descripción exacta'], legend, [10, 25, 95], true);
  const control = bankControlRows(data, view, when); table('Fuentes y alcance', control[0], control.slice(1), [31, 100]);
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'], kids = [];
  for (const p of pages) { const id = objects.length, content = p.join('\n'); kids.push(id + ' 0 R'); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`); }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`; let result = '%PDF-1.4\n'; const offsets = [0];
  objects.slice(1).forEach((value, i) => { offsets.push(result.length); result += (i + 1) + ' 0 obj\n' + value + '\nendobj\n'; }); const start = result.length;
  result += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(result);
}
