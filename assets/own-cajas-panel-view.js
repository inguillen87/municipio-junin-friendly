import {profiles} from './own-cajas-profiles.js';
import {getCell} from './own-cajas-xml-reader.js';
import {CAJAS_SOURCE_MODES} from './own-cajas-api-client.js';
import {OWN_RUN_TYPES,OWN_RUN_NATURES} from './own-payroll-run-workspace-model.js';
import {SALARY_UNITS} from './native-salary-catalog-model.js';
export const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=String(text);return element;};
const option=(value,label)=>{const element=node('option',label);element.value=value;return element;};
const natureLabels=Object.freeze({remuneration:'Remunerativos',non_remuneration:'No remunerativos',deduction:'Descuentos',employer_contribution:'Aportes patronales'});
const natureLabel=value=>Object.hasOwn(natureLabels,value)?natureLabels[value]:value;
const unitLabel=value=>Object.hasOwn(SALARY_UNITS,value)?SALARY_UNITS[value]:value;
const roles={header:'Encabezado',body:'Dato',blank:'Vacía',total:'Total',control:'Control',note:'Nota',
 financial_role_conflict:'Dato financiero en posición a revisar',unclassified:'Sin clasificar'};
const rowStates={matched:'Sin diferencia conocida',different:'Diferencia conocida',missing:'Falta en el Excel',
 duplicate:'Código repetido',unknown:'Valor sin verificar',own_unknown:'Fuente propia sin verificar',
 own_semantics_unknown:'Unidad o naturaleza sin verificar'};
export function createCajasPanelView(host){
 host.classList.add('own-cajas');
 host.innerHTML='<header><h2>Comparar cajas asistenciales</h2><p>Revisá el Excel completo frente a liquidaciones propias. Declarar un alcance o una correspondencia no acredita la autoridad del archivo.</p></header>'+
 '<p data-cajas-status role="status" aria-live="polite">Elegí período, tipos, alcance y archivo para iniciar.</p>'+
 '<p data-cajas-error role="alert" tabindex="-1" hidden></p><button type="button" data-cajas-login hidden>Volver a ingresar</button>'+
 '<form data-cajas-form><fieldset data-cajas-fields><legend>1. Archivo y fuente propia</legend><div class="own-cajas-grid">'+
 '<label>Período declarado<input data-cajas-period type="month" min="1900-01" max="2099-12" required></label>'+
 '<label>Tipos de liquidación<select data-cajas-types multiple size="4" required></select></label>'+
 '<label>Jurisdicción declarada<select data-cajas-jurisdiction required><option value="">Elegir</option><option value="all">Todas:42 y55</option><option value="42">Jurisdicción42</option><option value="55">Jurisdicción55</option></select></label>'+
 '<label>Unidad declarada<select data-cajas-unit required></select></label>'+
 '<label>Naturaleza de conceptos<select data-cajas-nature required></select></label>'+
 '<label>Diseño observado<select data-cajas-profile required></select></label>'+
 '<label>Columna a comparar<select data-cajas-column required></select></label>'+
 '<label>Fuente propia<select data-cajas-mode required></select></label>'+
 '<label class="own-cajas-wide">Excel de cajas asistenciales<input data-cajas-file type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>'+
 '</div><p data-cajas-source-notice>El nombre del archivo no define la jurisdicción. GENERAL conserva ambas jurisdicciones.</p></fieldset>'+
 '<div class="own-cajas-actions"><button type="submit" data-cajas-read>Leer Excel y fuente propia</button><button type="button" data-cajas-clear>Limpiar revisión</button></div></form>'+
 '<p class="own-cajas-notice">Histórico independiente: pendiente de habilitar el lector admitido. Las fórmulas, cachés y dependencias externas siguen sin verificar; no se abren vínculos.</p>'+
 '<fieldset data-cajas-mapping-box disabled><legend>2. Declarar alcance y correspondencias</legend>'+
 '<p data-cajas-source-summary>Primero leé el archivo y la fuente completa.</p>'+
 '<label>Conceptos propios incluidos en esta comparación<select data-cajas-concepts multiple size="6"></select></label>'+
 '<p>Elegí expresamente todos los conceptos que corresponden al control. Las opciones provienen del conjunto propio completo, antes de seleccionar jurisdicción.</p>'+
 '<div data-cajas-mappings></div><label class="own-cajas-check"><input type="checkbox" data-cajas-confirm>Confirmo las correspondencias declaradas. Las filas sin correspondencia seguirán visibles y sin verificar.</label>'+
 '<div class="own-cajas-actions"><button type="button" data-cajas-compare disabled>Comparar el conjunto completo</button></div></fieldset>'+
 '<button type="button" data-cajas-retry hidden>Reintentar lectura completa</button>'+
 '<section data-cajas-result hidden aria-label="Comparación de conceptos"><h3>Resultado de la comparación</h3>'+
 '<p>No hay coincidencia global ni admisión externa del control municipal.</p><p data-cajas-result-summary></p>'+
 '<div class="own-cajas-scroll" tabindex="0" role="region" aria-label="Diferencias exactas por concepto"><table><thead><tr><th>Concepto</th><th>Unidad capturada</th><th>Propio</th><th>Excel</th><th>Diferencia exacta</th><th>Estado</th></tr></thead><tbody data-cajas-comparison></tbody></table></div>'+
 '<h4>Filas del Excel que requieren revisión</h4><div class="own-cajas-scroll" tabindex="0" role="region" aria-label="Todas las filas financieras con diferencias o sin correspondencia"><table><thead><tr><th>Fila</th><th>Celda</th><th>Concepto declarado</th><th>Importe conocido</th><th>Estado</th></tr></thead><tbody data-cajas-external-issues></tbody></table></div>'+
 '<p>Las diferencias no se compensan entre conceptos. Un dato no informado no equivale a cero.</p></section>'+
 '<section data-cajas-preview hidden><h3>Previa completa del Excel</h3><p data-cajas-inventory></p><p data-cajas-warnings></p>'+
 '<label>Hoja conservada<select data-cajas-sheet></select></label>'+
 '<div class="own-cajas-scroll" tabindex="0" role="region" aria-label="Todas las filas físicas de la hoja"><table><thead data-cajas-headers></thead><tbody data-cajas-rows></tbody></table></div></section>'+
 '<details><summary>Lecturas y reintentos de esta revisión</summary><p>Registro local no nominal; no es una auditoría durable.</p><ol data-cajas-audit></ol></details>';
 const $=key=>host.querySelector('[data-cajas-'+key+']');
 $('types').replaceChildren(...Object.entries(OWN_RUN_TYPES).map(([value,label])=>option(value,label)));
 $('unit').replaceChildren(option('','Elegir'),...Object.entries(SALARY_UNITS).map(([value,label])=>option(value,typeof label==='string'?label:value)));
 $('nature').replaceChildren(option('','Elegir'),option('all','Todos los conceptos financieros'),...Object.entries(OWN_RUN_NATURES).filter(([value])=>value!=='auxiliary').map(([value,label])=>option(value,Object.hasOwn(natureLabels,value)?natureLabels[value]:label)));
 $('profile').replaceChildren(option('','Elegir diseño'),...Object.entries(profiles).map(([value,p])=>option(value,p.sheet)));
 $('mode').replaceChildren(option('','Elegir fuente'),...Object.entries(CAJAS_SOURCE_MODES).map(([value,mode])=>option(value,mode.label)));
 function columns(){
  $('column').replaceChildren(option('','Elegir columna'));
  const profile=profiles[$('profile').value];
  if(profile)for(const [column,jurisdiction]of Object.entries(profile.amountColumns))
   $('column').append(option(column,column+' · '+(jurisdiction==='all'?'ambas jurisdicciones':jurisdiction)));
 }
 function clearResult(){ $('result').hidden=true;$('comparison').replaceChildren();$('external-issues').replaceChildren();$('result-summary').textContent=''; }
 function clearPreview(){ $('preview').hidden=true;for(const key of ['rows','headers','sheet'])$(key).replaceChildren();for(const key of ['inventory','warnings'])$(key).textContent=''; }
 function renderSheet(preview){
  const sheet=preview.sheets.find(sheet=>sheet.name===$('sheet').value);
  const columns=[...new Set(sheet.rows.flatMap(row=>Object.keys(row.cells)))].sort((a,b)=>a.length-b.length||a.localeCompare(b));
  const header=node('tr');header.append(node('th','Fila / función'),...columns.map(column=>node('th',column)));$('headers').replaceChildren(header);
  $('rows').replaceChildren(...sheet.rows.map(row=>{
   const tr=node('tr');tr.dataset.originRow=String(row.rowNumber);
   tr.append(node('th',row.rowNumber+' · '+(roles[row.role]??'Otra hoja')+(row.hidden?' · oculta en origen':'')));
   for(const column of columns){
    const cell=row.cells[column],value=!cell?'Ausente':cell.kind==='formula'?'Fórmula sin evaluar · valor desconocido'
     :cell.kind==='blank'?'Sin valor':cell.raw===''?'Texto vacío':cell.raw??'Desconocido';
    const td=node('td',value);td.dataset.cell=column+row.rowNumber;td.dataset.kind=cell?.kind??'absent';tr.append(td);
   }return tr;
  }));
 }
 function renderPreview(preview){
  $('preview').hidden=false;$('preview').dataset.immutable=String(Object.isFrozen(preview));
  $('sheet').replaceChildren(...preview.sheets.map(sheet=>option(sheet.name,sheet.name)));$('sheet').value=preview.selectedSheet;
  $('inventory').textContent=preview.sheets.length+' hojas · '+preview.sheets.reduce((sum,sheet)=>sum+sheet.rows.length,0)+' filas físicas conservadas. La hoja visible no recorta la comparación.';
  $('warnings').textContent=preview.warnings.length?'Hay dependencias o cobertura pendientes. Sus destinos no se abren ni se muestran.':'La estructura fue leída; la autoridad externa sigue pendiente.';
  renderSheet(preview);
 }
 function populateMappings(loaded,preview){
  const byCode=new Map();
  for(const choice of loaded.conceptChoices)if(choice.financial){
   const labels=byCode.get(choice.code)??[];labels.push(natureLabel(choice.nature)+' / '+unitLabel(choice.unit));byCode.set(choice.code,labels);
  }
  const entries=[...byCode].sort((a,b)=>a[0].localeCompare(b[0]));
  $('concepts').replaceChildren(...entries.map(([code,labels])=>option(code,code+' · '+labels.join('; '))));
  const sheet=preview.sheets.find(sheet=>sheet.name===preview.selectedSheet),financial=new Set(preview.financialRows),codes=new Map(),unknown=[];
  for(const row of sheet.rows)if(financial.has(row.rowNumber)){
   const cell=getCell(row,'B');
   const eligible=['text','number'].includes(cell.kind)&&typeof cell.raw==='string'&&/^[0-9]{1,9}$/.test(cell.raw)
    &&(cell.kind!=='number'||/^(0|[1-9][0-9]{0,8})$/.test(cell.raw));
   if(!eligible){unknown.push(row.rowNumber);continue;}
   const key=cell.kind+':'+cell.raw,entry=codes.get(key)??{kind:cell.kind,raw:cell.raw,rows:[]};entry.rows.push(row.rowNumber);codes.set(key,entry);
  }
  $('mappings').replaceChildren();
  for(const entry of codes.values()){
   const label=node('label',(entry.kind==='text'?'Código textual':'Código numérico literal')+' '+entry.raw+' · filas '+entry.rows.join(', '));
   const select=node('select');select.dataset.mappingKind=entry.kind;select.dataset.mappingRaw=entry.raw;
   select.append(option('','Sin correspondencia'),...entries.map(([code,labels])=>option(code,code+' · '+labels.join('; '))));label.append(select);$('mappings').append(label);
  }
  if(unknown.length)$('mappings').append(node('p','Identidad sin verificar en filas '+unknown.join(', ')+'. Se conservan como desconocidas; no se excluirán.'));
  $('source-summary').textContent=loaded.bundle.employees.length+' participaciones propias verificadas antes de filtros · '+entries.length+' códigos financieros disponibles. Base: detalle operativo vigente, no censo histórico independiente.';
  $('confirm').checked=false;
 }
 function renderComparison(result){
  $('result').hidden=false;$('result').dataset.state=result.status;
  $('result-summary').textContent=result.counts.financialRows+' filas financieras conservadas · '+result.counts.expectedConcepts+' conceptos propios del alcance declarado.';
  $('external-issues').replaceChildren(...result.rows.filter(row=>row.status!=='matched').map(row=>{
   const tr=node('tr');tr.dataset.financialRow=String(row.rowNumber);tr.dataset.state=row.status;
   const labels={identity_unknown:'Código sin correspondencia',outside_selected_scope:'Fuera del alcance declarado',
    duplicate:'Código repetido',unknown:'Valor sin verificar',missing:'Falta concepto propio',different:'Diferencia conocida'};
   tr.append(...[row.rowNumber,row.reference,row.conceptCode??'Sin correspondencia',row.amount??'Desconocido',
    labels[row.status]??rowStates[row.status]??'Sin verificar'].map(value=>node('td',value)));return tr;
  }));
  $('comparison').replaceChildren(...result.comparisons.map(comparison=>{
   const row=node('tr');row.append(...[comparison.conceptCode,unitLabel(comparison.unit??'Sin verificar'),
    comparison.expected??'Desconocido',comparison.observed??'Desconocido',comparison.difference??'Desconocida',
    rowStates[comparison.status]??'Sin verificar'].map(value=>node('td',value)));return row;
  }));
 }
 return {$,columns,clearResult,clearPreview,renderSheet,renderPreview,populateMappings,renderComparison};
}
