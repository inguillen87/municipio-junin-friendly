// Ayuda para los campos que guardan un código (concepto, centro de costo): se elige por nombre y se guarda el código.
//
// Agrega al campo una lista de sugerencias (el valor es el código; la etiqueta, el nombre) y una línea que dice a qué
// corresponde lo escrito. Al salir del campo, si lo escrito es un nombre que reconoce una sola opción, se reemplaza por
// su código. No valida ni bloquea: la pantalla y el servidor siguen validando el código como siempre.
import {GRH_CONCEPTS,CONCEPT_GROUPS,conceptInfo,conceptLabel,searchConcepts} from './grh-concept-dictionary.js';
import {GRH_COST_CENTERS,costCenterCode,costCenterHint} from './grh-cost-centers.js';

const digits=value=>/^\d+$/.test(value);
let sequence=0;

export function attachCodeHelp(input,{options,resolve,hint,placeholder}){
  if(!input||input.dataset.codeHelp==='on')return null;
  const document=input.ownerDocument,list=document.createElement('datalist'),line=document.createElement('small');
  list.id='codeHelp'+(++sequence);line.className='code-help';line.dataset.codeHelpHint='';line.setAttribute('aria-live','polite');
  for(const item of options){const option=document.createElement('option');option.value=item.code;option.label=item.label;list.append(option);}
  input.setAttribute('list',list.id);input.setAttribute('autocomplete','off');input.inputMode='text';input.dataset.codeHelp='on';
  if(placeholder)input.placeholder=placeholder;if(input.maxLength>0&&input.maxLength<80)input.maxLength=80;
  input.after(list,line);
  const show=()=>{line.textContent=hint(input.value);};
  input.addEventListener('input',show);
  input.addEventListener('change',()=>{const code=resolve(input.value);if(code&&code!==input.value.trim()){input.value=code;input.dispatchEvent(new Event('input',{bubbles:true}));}show();});
  show();
  return {refresh:show};
}

// Código guardado → cómo se lee al revisar: «601 · NOMBRE». Uno fuera de la lista se muestra tal cual.
export function conceptText(code){const known=conceptInfo(code);return known?known.code+' · '+known.label:String(code??'');}
// Sólo la denominación ('' si el código no está en la lista de referencia): para mostrarla debajo del código en tablas angostas.
export function conceptName(code){return conceptInfo(code)?.label??'';}
// Lo escrito → código del concepto; '' si está vacío; null si no alcanza para reconocer uno solo.
export function conceptCodeFromText(text){
  const value=typeof text==='string'?text.trim():'';if(!value)return '';
  if(digits(value))return value;
  const found=searchConcepts(value,{limit:2});return found.length===1?found[0].code:null;
}
export function conceptHintFromText(text){
  const value=typeof text==='string'?text.trim():'';if(!value)return '';
  const known=conceptInfo(value);if(known)return conceptLabel(known);
  if(digits(value))return 'El código '+value+' no está en la lista de referencia: se valida al guardar.';
  const found=searchConcepts(value,{limit:3});
  return found.length?(found.length===1?'':'¿Cuál? ')+found.map(c=>c.code+' · '+c.label).join(' / '):'Sin coincidencias. Elegí un concepto de la lista o escribí su número.';
}
const CONCEPT_OPTIONS=GRH_CONCEPTS.slice().sort((a,b)=>Number(b.novelty)-Number(a.novelty)||b.uses-a.uses||Number(a.code)-Number(b.code)).map(c=>({code:c.code,label:c.label+' · '+(CONCEPT_GROUPS[c.group]??'')}));

export const attachConceptHelp=input=>attachCodeHelp(input,{options:CONCEPT_OPTIONS,resolve:conceptCodeFromText,hint:conceptHintFromText,placeholder:'Nombre o número: sindicato, presentismo, 638…'});
export const attachCostCenterHelp=input=>attachCodeHelp(input,{options:GRH_COST_CENTERS,resolve:costCenterCode,hint:costCenterHint,placeholder:'Nombre o número: servicios públicos, 2…'});
