import {civilDate} from './civil-date.js';
export const SCHOOL_READING_FIELDS=Object.freeze({institution:'Institución',educationLevel:'Nivel',course:'Curso / sala / grado',schoolYear:'Ciclo lectivo',issuedOn:'Fecha de emisión',expiresOn:'Vencimiento informado'});
const labels=Object.freeze({institucion:'institution','institucion educativa':'institution',escuela:'institution',colegio:'institution',nivel:'educationLevel','nivel educativo':'educationLevel',curso:'course',sala:'course',grado:'course','curso / sala / grado':'course','ciclo lectivo':'schoolYear','ano lectivo':'schoolYear','fecha de emision':'issuedOn',emision:'issuedOn','fecha de vencimiento':'expiresOn',vencimiento:'expiresOn'});
const fail=()=>{throw Error('La lectura o el formulario cambiaron. Leé el archivo nuevamente y revisá los campos.');};
const fold=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function valueFor(key,raw){
 const value=raw.trim();if(!value||/^(?:sin (?:informar|datos)|no (?:consta|informado)|n\/?a|[-–—]+)$/i.test(value))throw Error('El texto no informa un valor. Conservá el campo vacío.');
 if(key==='schoolYear'){if(!/^(19|20)\d{2}$|^2100$/.test(value))throw Error('El ciclo debe constar como un único año de cuatro cifras.');return value;}
 if(key==='issuedOn'||key==='expiresOn'){
  const parts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value),iso=parts?parts[3]+'-'+parts[2]+'-'+parts[1]:value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw Error('La fecha debe constar como día/mes/año o año-mes-día.');
  try{return civilDate(iso);}catch{throw Error('La fecha leída no es válida. Verificala en el original.');}
 }
 const max={institution:180,educationLevel:80,course:100}[key];if(value.length>max)throw Error('El valor supera el tamaño admitido por el campo.');return value;
}
export function schoolingReading(input){
 if(!input||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256)||!Number.isInteger(input.page)||input.page<1||input.page>30||typeof input.text!=='string'||input.text.length>50000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.text)||!['native','ocr'].includes(input.method)||input.method==='ocr'&&(!Number.isFinite(input.confidence)||input.confidence<0||input.confidence>100))fail();
 const source=Object.freeze({sha256:input.sha256,page:input.page,text:input.text,method:input.method,confidence:input.method==='ocr'?input.confidence:null}),matches=Object.fromEntries(Object.keys(SCHOOL_READING_FIELDS).map(k=>[k,[]]));
 // Only explicit labelled lines. Names, identifiers, birth/presentation dates,
 // unlabeled years and narrative interpretations never become suggestions.
 const lines=/[^\r\n]+/g;let line;
 while((line=lines.exec(source.text))){const match=/^\s*([^:\n]{1,45})\s*:\s*(.*?)\s*$/.exec(line[0]);if(!match)continue;const label=fold(match[1]);if(!Object.hasOwn(labels,label))continue;const key=labels[label];
  let value=null,error=null;try{value=valueFor(key,match[2]);}catch(e){error=e.message;}
  matches[key].push(Object.freeze({value,error,quote:line[0],start:line.index,end:line.index+line[0].length}));
 }
 const fields=Object.keys(SCHOOL_READING_FIELDS).map(key=>{const evidence=Object.freeze(matches[key]),values=new Set(evidence.map(e=>e.value));
  const state=!evidence.length?'missing':evidence.some(e=>e.error)?'invalid':values.size>1?'conflict':'suggested';
  return Object.freeze({key,label:SCHOOL_READING_FIELDS[key],state,value:state==='suggested'?evidence[0].value:null,evidence});
 });
 return Object.freeze({version:'schooling-reading.v1',source,fields:Object.freeze(fields),requiresReview:true,administrativePresentationInferred:false});
}
export function schoolingReadingSelection(reading,checked,{currentHash,currentValues,baseline}={}){
 if(!reading||JSON.stringify(reading)!==JSON.stringify(schoolingReading(reading.source))||currentHash!==reading.source.sha256||!Array.isArray(checked)||!checked.length||new Set(checked).size!==checked.length)fail();
 const result={};for(const key of checked){const field=reading.fields.find(f=>f.key===key);if(field?.state!=='suggested'||typeof currentValues?.[key]!=='string'||typeof baseline?.[key]!=='string'||currentValues[key]!==baseline[key])fail();result[key]=field.value;}
 return Object.freeze(result);
}
