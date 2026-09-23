import { storedZip } from './clock-dashboard-zip.js';
import { certificateState, schoolingEffectiveDates, schoolingDateOrigin, schoolingData, MAX_SCHOOLING_ROWS } from './family-schooling-model.js';

const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const col = i => { let result = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) result = String.fromCharCode(65 + (i - 1) % 26) + result; return result; };
const sourceState = state => ({ valid: 'Fecha válida de la fuente', null: 'Sin fecha informada', absent: 'Campo ausente', invalid: 'Fecha no válida; por revisar' })[state] ?? 'Sin fuente histórica';
function sheet(rows, widths, filter = false) {
  const body = rows.map((row, i) => '<row r="' + (i + 1) + '" ht="32" customHeight="1">' + row.map((v, j) => {
    const address = col(j) + (i + 1), style = i === 0 ? 1 : 0;
    // Source values always remain inline strings; formulas are never inferred.
    return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${filter ? `<autoFilter ref="A1:${col(widths.length - 1)}${rows.length}"/>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LMuniControl · Control interno&amp;RPágina &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
export function schoolingXlsx(data, view, queriedAt) {
  if (!['family-schooling.v1','family-schooling.v2','family-schooling.v3','family-schooling.v4','family-schooling.v5'].includes(data?.version) || !Array.isArray(view?.rows) || view.rows.length > MAX_SCHOOLING_ROWS
    || !Number.isFinite(Date.parse(queriedAt))) throw Error('El reporte no está disponible para exportar.');
  const allowed = new Set(data.rows);
  if (view.rows.some(r => !allowed.has(r)) || new Set(view.rows.map(r => r.key)).size !== view.rows.length) throw Error('El filtro no corresponde al reporte consultado.');
  const nativeOrigins = data.version === 'family-schooling.v5';
  if (nativeOrigins) {
    // The exporter receives normalized rows, but still checks the complete v5
    // wire contract before producing an artifact. Derived row keys are local.
    schoolingData({ok:true,data:{...data,rows:data.rows.map(({key,...row})=>row)}},
      {version:5,resource:data.scope.cohort==='contract_children'?'family':'report',contractId:data.scope.cohort==='contract_children'?data.rows[0]?.contractId:undefined});
  }
  const unified = data.version !== 'family-schooling.v1', complete = ['family-schooling.v3','family-schooling.v4','family-schooling.v5'].includes(data.version), sourceDates = ['family-schooling.v4','family-schooling.v5'].includes(data.version);
  const headers = ['Legajo', 'Agente', 'Hijo/a', 'Nacimiento informado', 'Fin del vínculo informado', nativeOrigins ? 'Situación administrativa consultada' : 'Estado del legajo al corte',
    sourceDates ? 'Presentación informada' : 'Presentación registrada', sourceDates ? 'Vencimiento informado' : 'Vencimiento registrado', 'Registro del certificado', 'Archivo', 'Control documental', unified ? 'Corte laboral GRH' : 'Corte de origen',
    ...(unified ? ['Origen del vínculo','Estado del vínculo',nativeOrigins?'Registro del vínculo familiar':'Alta en MuniControl','Vigente desde (informado)','Coincidencias por revisar'] : []),
    ...(complete ? ['Institución informada','Nivel informado','Curso / sala / grado informado','Ciclo lectivo informado','Emisión informada','Forma de presentación','Referencia de presentación en papel','Motivo del registro','Registros conservados'] : []),
    ...(sourceDates ? ['Origen de las fechas mostradas','Presentación histórica GRH','Vencimiento histórico GRH','Estado de presentación en la fuente','Estado de vencimiento en la fuente','Corte de las fechas GRH','Corte declarado sin zona horaria','Revisión de la fuente'] : []),
    ...(nativeOrigins ? ['Origen del legajo','Contrato en MuniControl','Registro del alta propia','Fecha del alta propia'] : [])];
  const rows = [headers, ...view.rows.map(r => [r.legajo, r.employeeName ?? 'Nombre no informado', r.familyName ?? 'Nombre no informado', r.birthDate ?? 'Fecha no informada',
    r.familyEndDate ?? 'Sin baja informada', nativeOrigins && r.employeeOrigin === 'MUNICONTROL' ? r.administrativeActive ? 'Alta propia activa a la consulta' : 'Alta propia fuera del padrón activo' : r.administrativeActive ? 'Activo al corte' : 'Fuera del padrón activo',
    schoolingEffectiveDates(r).presentedOn ?? 'Fecha no informada', schoolingEffectiveDates(r).expiresOn ?? 'Sin vencimiento informado',
    r.certificate?.recordedAt ?? 'Sin registro en MuniControl', r.certificate?.filename ?? 'Sin archivo registrado',
    certificateState(r, view.filters.asOf), nativeOrigins && r.employeeOrigin === 'MUNICONTROL' ? 'No corresponde: alta propia' : r.sourceCutoff ?? 'Fecha no informada',
    ...(unified ? [r.familyRef.kind === 'own' ? 'MuniControl' : 'GRH', r.declarationState === 'declared' ? 'Declarado; no implica aprobación' : 'Incorporado desde GRH',
      r.familyRecordedAt ?? 'No corresponde',r.validFrom ?? 'Fecha no informada',r.identityReviewRequired ? 'Por revisar; no contar como hijo distinto confirmado' : 'Sin coincidencias detectadas'] : []),
    ...(complete ? [r.certificate?.institution ?? 'Sin informar',r.certificate?.educationLevel ?? 'Sin informar',r.certificate?.course ?? 'Sin informar',
      r.certificate?.schoolYear ?? 'Sin informar',r.certificate?.issuedOn ?? 'Fecha no informada',
      r.certificate ? r.certificate.evidenceMode === 'paper_declared' ? 'Presentación en papel declarada; sin adjunto' : r.certificate.recordKind === 'legacy_pdf' ? 'PDF del registro anterior' : 'PDF adjunto' : 'Sin registro en MuniControl',
      r.certificate?.paperReference ?? 'No corresponde',r.certificate?.reason ?? 'No informado',r.historyCount] : []),
    ...(sourceDates ? [schoolingDateOrigin(r),r.sourceSchooling?.presentedOn ?? 'Fecha no informada',r.sourceSchooling?.expiresOn ?? 'Fecha no informada',
      sourceState(r.sourceSchooling?.presentationState),sourceState(r.sourceSchooling?.expiryState),r.sourceSchooling?.sourceCutoff ?? 'No corresponde',
      r.sourceSchooling?.sourceDeclaredCutoff ?? 'No corresponde',r.sourceSchooling ? 'Histórica; por revisar; sin documento adjunto' : 'No corresponde'] : []),
    ...(nativeOrigins ? [r.employeeOrigin === 'MUNICONTROL' ? 'Alta propia de MuniControl' : 'GRH',r.contractId,
      r.nativeRegistrationId ?? 'No corresponde',r.nativeRegisteredAt ?? 'No corresponde'] : [])])];
  const statuses = { all: 'Todos', registered: 'Con certificado registrado', unregistered: 'Sin registro en MuniControl', expired: 'Vencimiento informado superado', no_expiry: 'Sin vencimiento informado' };
  const control = [['Control y procedencia', 'Valor'], ['Reporte', 'Legajos activos con hijos · certificados escolares'],
    ['Uso', 'Control interno. No aprueba escolaridad ni habilita haberes.'], ['Fuente de los vínculos', unified ? 'GRH y vínculos declarados en MuniControl, identificados por fila' : 'GRH incorporado en MuniControl'],
    ['Fuente de las fechas del certificado', sourceDates ? 'Origen indicado por fila: registro manual o fechas históricas GRH por revisar. El registro manual prevalece para ambas fechas, incluso si el vencimiento no consta.' : 'Registro manual en MuniControl; no son fechas inferidas desde GRH'],
    ['Corte desde', data.scope.sourceCutoffFrom ?? 'No informado'], ['Corte hasta', data.scope.sourceCutoffTo ?? 'No informado'],
    ['Consulta del reporte', queriedAt], ['Búsqueda', view.filters.search || 'Sin búsqueda'], ['Filtro documental', statuses[view.filters.status]],
    ['Fecha de comparación de vencimientos', view.filters.asOf], ['Legajos distintos del filtro', view.counts.contracts],
    [unified ? 'Vínculos sin coincidencias detectadas' : 'Hijos/as del filtro', view.counts.children], ['Vínculos con certificado registrado', view.counts.registered],
    ...(unified ? [['Filas con coincidencias por revisar',view.counts.review],['Conteo de coincidencias','Las filas por revisar se muestran separadas; no se suman como hijos distintos confirmados.'],['Fecha de alta propia','Es independiente del corte laboral GRH.']] : []),
    ['Sin registro en MuniControl', view.counts.unregistered], ['Alcance del archivo', 'Incluye todas las filas del filtro, no sólo la página visible.'],
    ['Fecha ausente', 'No permite afirmar que el certificado no se presentó.'], ['Padrón', nativeOrigins ? 'GRH: activo al corte incorporado. Altas propias: situación administrativa a la consulta. Ninguna acredita elegibilidad salarial.' : 'Activo según el corte incorporado; no certifica altas o bajas posteriores.'],
    ...(nativeOrigins ? [['Origen del legajo','Se distingue del origen del vínculo familiar. El contrato identifica a la persona elegida, incluso ante legajos coincidentes.'],
      ['Altas propias','Registro nativo de MuniControl, sin lote ni corte GRH inventados. Fecha de registro del alta, presentación escolar y carga del certificado son hechos distintos.']] : []),
    ['Vencimiento', sourceDates ? 'Se compara la fecha informada con su origen explícito; no determina elegibilidad legal. Las fechas ausentes o inválidas no se consideran vencidas.' : 'La fecha fue registrada por un operador; su comparación no determina elegibilidad legal.'],
    ...(sourceDates ? [['Histórico GRH','No constituye una presentación manual en MuniControl ni agrega registros al historial de certificados.'],['Corte declarado','Se conserva la hora de la fuente sin asignarle una zona horaria.']] : []),
    ...(complete ? [['Presentación en papel','Declaración administrativa sin archivo digital; no es aprobación de escolaridad.'],
      ['Fechas separadas','Emisión del establecimiento, presentación municipal y carga en el sistema son hechos distintos.'],
      ['Historia','La planilla muestra el último registro. La ficha permite consultar los registros anteriores sin sobrescribirlos.']] : [])];
  const names = ['Hijos y certificados', 'Control'];
  const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF173B4C"/></font><font><sz val="11"/><name val="Calibri"/><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143849"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>';
  return storedZip([
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="office" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="sheet${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="sheet${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet(rows, [15, 30, 30, 20, 22, 22, 22, 24, 29, 35, 35, 20, ...(unified ? [20,32,28,24,42] : []), ...(complete ? [35,24,24,22,22,36,45,45,22] : []), ...(sourceDates ? [38,24,24,36,36,30,32,44] : []), ...(nativeOrigins ? [32,40,40,30] : [])], true)],
    ['xl/worksheets/sheet2.xml', sheet(control, [38, 110])],
  ]);
}
