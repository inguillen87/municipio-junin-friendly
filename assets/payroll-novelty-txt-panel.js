import {NOVELTY_INPUT_FORMATS,TXT_LAYOUTS,noveltyInputTemplate} from './payroll-novelty-txt.js';
/** Settings are volatile and explicit. Unknown DNI-based files are not treated as legajo files. */
export function mountNoveltyTxtOptions(host,onChange){
 host.innerHTML=`<div class="form-grid">
 <div class="field"><label for="bulkFormat">Formato de importación</label><select id="bulkFormat"></select></div>
 <div class="field"><label for="bulkEncoding">Codificación del archivo</label><select id="bulkEncoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 / ANSI</option></select></div>
 <div class="field full"><p id="bulkFormatHelp" class="panel-note" role="status"></p></div>
 <div id="bulkColumnSettings" class="field full" hidden><div class="form-grid">
  <div class="field"><label for="bulkLayout">Columnas del TXT</label><select id="bulkLayout"><option value="both">Legajo · Concepto · Unidades · Importe</option><option value="quantity">Legajo · Concepto · Unidades</option><option value="amount">Legajo · Concepto · Importe</option><option value="commonQuantity">Legajo · Unidades (concepto común)</option><option value="commonAmount">Legajo · Importe (concepto común)</option></select></div>
  <div class="field"><label for="bulkSeparator">Separador de columnas</label><select id="bulkSeparator"><option value="semicolon">Punto y coma (;)</option><option value="tab">Tabulación</option><option value="pipe">Barra vertical (|)</option></select></div>
  <div class="field"><label class="checkbox"><input type="checkbox" id="bulkHasHeader"> El TXT tiene encabezado</label></div>
 </div></div>
 <div id="bulkCommonConceptField" class="field" hidden><label for="bulkCommonConcept">Concepto común del archivo</label><input id="bulkCommonConcept" inputmode="numeric" maxlength="20" placeholder="Elegí el código; no se deduce del nombre"></div>
 <div id="bulkFixedSettings" class="field full" hidden><div class="form-grid">
  <div class="field"><label for="bulkRecordWidth">Longitud exacta de registro</label><input id="bulkRecordWidth" type="number" min="1" max="512" value="18"></div>
  <div class="field"><label for="bulkIdStart">Legajo: posición inicial (desde 1)</label><input id="bulkIdStart" type="number" min="1" max="512" value="1"></div>
  <div class="field"><label for="bulkIdLength">Legajo: longitud</label><input id="bulkIdLength" type="number" min="1" max="20" value="8"></div>
  <div class="field"><label for="bulkValueStart">Valor: posición inicial (desde 1)</label><input id="bulkValueStart" type="number" min="1" max="512" value="9"></div>
  <div class="field"><label for="bulkValueLength">Valor: longitud</label><input id="bulkValueLength" type="number" min="1" max="30" value="10"></div>
  <div class="field"><label for="bulkValueKind">El valor representa</label><select id="bulkValueKind"><option value="amount">Importe en pesos</option><option value="quantity">Unidades (no importe)</option></select></div>
 </div></div>
 <div id="bulkDecimalField" class="field" hidden><label for="bulkDecimal">Interpretación decimal</label><select id="bulkDecimal"><option value="point">Punto explícito: 123.45</option><option value="comma">Coma explícita: 123,45</option><option value="implied">Decimales implícitos (sin separador)</option></select></div>
 <div id="bulkScaleField" class="field" hidden><label for="bulkScale">Cantidad de decimales implícitos</label><input id="bulkScale" type="number" min="0" max="6" value="2"><small>Ejemplo: 12345 con 2 decimales se interpreta como 123.45.</small></div>
 <div class="field full"><button type="button" class="button" id="bulkTemplate">Descargar encabezado de plantilla</button><small>La plantilla no incluye personas ni valores de ejemplo. Completarla no guarda novedades.</small></div>
 </div>`;
 const get=id=>host.querySelector('#'+id);for(const [value,label]of Object.entries(NOVELTY_INPUT_FORMATS))get('bulkFormat').append(new Option(label,value));
 function options(){return{format:get('bulkFormat').value,encoding:get('bulkEncoding').value,layout:get('bulkLayout').value,separator:get('bulkSeparator').value,header:get('bulkHasHeader').checked,concept:get('bulkCommonConcept').value,recordWidth:Number(get('bulkRecordWidth').value),idStart:Number(get('bulkIdStart').value),idLength:Number(get('bulkIdLength').value),valueStart:Number(get('bulkValueStart').value),valueLength:Number(get('bulkValueLength').value),valueKind:get('bulkValueKind').value,decimal:get('bulkDecimal').value,scale:get('bulkScale').value===''?NaN:Number(get('bulkScale').value)};}
 function render(){const o=options(),cols=o.format==='columns',fixed=o.format==='fixed';
  get('bulkColumnSettings').hidden=!cols;get('bulkFixedSettings').hidden=!fixed;
  get('bulkCommonConceptField').hidden=!(o.format==='retro'||fixed||cols&&!TXT_LAYOUTS[o.layout].includes('concepto'));
  get('bulkDecimalField').hidden=!(cols||fixed);get('bulkScaleField').hidden=!(cols||fixed)||o.decimal!=='implied';get('bulkTemplate').hidden=!(cols||o.format==='csv');
  const help=o.format==='csv'?'10 columnas con encabezado obligatorio, separadas por punto y coma. El mismo contenido puede venir como .csv o .txt.':cols?'Un registro por línea. Elegí el orden de columnas, el separador y si tiene encabezado. Unidades e importes son campos diferentes; un valor vacío no equivale a cero.':o.format==='retro'?'RETRO: 18 caracteres por registro, legajo en los primeros 8 e importe decimal con punto en los 10 siguientes. Elegí el concepto. Se conservan los ceros de relleno del archivo y se validan como identificadores numéricos.':'Definí el legajo y el valor por posiciones; no se infieren por la longitud del archivo. Fuera de esos campos sólo se admite relleno en blanco.';
  get('bulkFormatHelp').textContent=help+' Los archivos identificados por DNI (por ejemplo, Formato Junín o MAYOR y FULL de GRH) requieren conciliación de identidad y no se admiten como legajos.';
  const current=host.ownerDocument.getElementById('bulkCsvHeader');if(current)current.hidden=o.format!=='csv';
 }
 host.addEventListener('input',()=>render());host.addEventListener('change',event=>{render();onChange?.({encodingChanged:event.target.id==='bulkEncoding'});});
 get('bulkTemplate').onclick=()=>{const o=options(),text=noveltyInputTemplate(o.format,o),url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'})),a=host.ownerDocument.createElement('a');a.href=url;a.download='plantilla_novedades_'+o.format+(o.format==='csv'?'.csv':'.txt');host.ownerDocument.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 render();return{options,reset(){get('bulkFormat').value='csv';get('bulkEncoding').value='utf-8';get('bulkLayout').value='both';get('bulkSeparator').value='semicolon';get('bulkHasHeader').checked=false;get('bulkCommonConcept').value='';for(const [id,value]of Object.entries({bulkRecordWidth:18,bulkIdStart:1,bulkIdLength:8,bulkValueStart:9,bulkValueLength:10,bulkScale:2}))get(id).value=String(value);get('bulkValueKind').value='amount';get('bulkDecimal').value='point';render();}};
}
