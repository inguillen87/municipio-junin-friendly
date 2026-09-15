import { storedZip } from './clock-dashboard-zip.js';
import { certificateState, MAX_SCHOOLING_ROWS } from './family-schooling-model.js';

const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const col = i => String.fromCharCode(65 + i);
function sheet(rows, widths, filter = false) {
  const body = rows.map((row, i) => '<row r="' + (i + 1) + '" ht="32" customHeight="1">' + row.map((v, j) => {
    const address = col(j) + (i + 1), style = i === 0 ? 1 : 0;
    // Source values always remain inline strings; formulas are never inferred.
    return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${filter ? `<autoFilter ref="A1:${col(widths.length - 1)}${rows.length}"/>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LMuniControl · Control interno&amp;RPágina &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
export function schoolingXlsx(data, view, queriedAt) {
  if (!['family-schooling.v1','family-schooling.v2'].includes(data?.version) || !Array.isArray(view?.rows) || view.rows.length > MAX_SCHOOLING_ROWS
    || !Number.isFinite(Date.parse(queriedAt))) throw Error('El reporte no está disponible para exportar.');
  const allowed = new Set(data.rows);
  if (view.rows.some(r => !allowed.has(r)) || new Set(view.rows.map(r => r.key)).size !== view.rows.length) throw Error('El filtro no corresponde al reporte consultado.');
  const unified = data.version === 'family-schooling.v2';
  const headers = ['Legajo', 'Agente', 'Hijo/a', 'Nacimiento informado', 'Fin del vínculo informado', 'Estado del legajo al corte',
    'Presentación registrada', 'Vencimiento registrado', 'Registro del certificado', 'Archivo', 'Control documental', unified ? 'Corte laboral GRH' : 'Corte de origen',
    ...(unified ? ['Origen del vínculo','Estado del vínculo','Alta en MuniControl','Vigente desde (informado)','Coincidencias por revisar'] : [])];
  const rows = [headers, ...view.rows.map(r => [r.legajo, r.employeeName ?? 'Nombre no informado', r.familyName ?? 'Nombre no informado', r.birthDate ?? 'Fecha no informada',
    r.familyEndDate ?? 'Sin baja informada', r.administrativeActive ? 'Activo al corte' : 'Fuera del padrón activo',
    r.certificate?.presentedOn ?? 'Fecha no informada', r.certificate?.expiresOn ?? 'Sin vencimiento informado',
    r.certificate?.recordedAt ?? 'Sin registro en MuniControl', r.certificate?.filename ?? 'Sin archivo registrado',
    certificateState(r, view.filters.asOf), r.sourceCutoff ?? 'Fecha no informada',
    ...(unified ? [r.familyRef.kind === 'own' ? 'MuniControl' : 'GRH', r.declarationState === 'declared' ? 'Declarado; no implica aprobación' : 'Incorporado desde GRH',
      r.familyRecordedAt ?? 'No corresponde',r.validFrom ?? 'Fecha no informada',r.identityReviewRequired ? 'Por revisar; no contar como hijo distinto confirmado' : 'Sin coincidencias detectadas'] : [])])];
  const statuses = { all: 'Todos', registered: 'Con certificado registrado', unregistered: 'Sin registro en MuniControl', expired: 'Vencimiento informado superado', no_expiry: 'Sin vencimiento informado' };
  const control = [['Control y procedencia', 'Valor'], ['Reporte', 'Legajos activos con hijos · certificados escolares'],
    ['Uso', 'Control interno. No aprueba escolaridad ni habilita haberes.'], ['Fuente de los vínculos', unified ? 'GRH y vínculos declarados en MuniControl, identificados por fila' : 'GRH incorporado en MuniControl'],
    ['Fuente de las fechas del certificado', 'Registro manual en MuniControl; no son fechas inferidas desde GRH'],
    ['Corte desde', data.scope.sourceCutoffFrom ?? 'No informado'], ['Corte hasta', data.scope.sourceCutoffTo ?? 'No informado'],
    ['Consulta del reporte', queriedAt], ['Búsqueda', view.filters.search || 'Sin búsqueda'], ['Filtro documental', statuses[view.filters.status]],
    ['Fecha de comparación de vencimientos', view.filters.asOf], ['Legajos distintos del filtro', view.counts.contracts],
    [unified ? 'Vínculos sin coincidencias detectadas' : 'Hijos/as del filtro', view.counts.children], ['Vínculos con certificado registrado', view.counts.registered],
    ...(unified ? [['Filas con coincidencias por revisar',view.counts.review],['Conteo de coincidencias','Las filas por revisar se muestran separadas; no se suman como hijos distintos confirmados.'],['Fecha de alta propia','Es independiente del corte laboral GRH.']] : []),
    ['Sin registro en MuniControl', view.counts.unregistered], ['Alcance del archivo', 'Incluye todas las filas del filtro, no sólo la página visible.'],
    ['Fecha ausente', 'No permite afirmar que el certificado no se presentó.'], ['Padrón', 'Activo según el corte incorporado; no certifica altas o bajas posteriores.'],
    ['Vencimiento', 'La fecha fue registrada por un operador; su comparación no determina elegibilidad legal.']];
  const names = ['Hijos y certificados', 'Control'];
  const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF173B4C"/></font><font><sz val="11"/><name val="Calibri"/><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143849"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>';
  return storedZip([
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="office" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="sheet${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="sheet${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet(rows, [15, 30, 30, 20, 22, 22, 22, 24, 29, 35, 35, 20, ...(unified ? [20,32,28,24,42] : [])], true)],
    ['xl/worksheets/sheet2.xml', sheet(control, [38, 110])],
  ]);
}
