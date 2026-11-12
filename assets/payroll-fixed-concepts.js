// Novedades fijas: el concepto se elige por su nombre, no se escribe un código.
//
// El registro guarda siempre el código (`conceptSourceId`, sólo dígitos): eso no cambia. Este módulo es la ayuda de
// pantalla que traduce entre ese código y un nombre que se pueda leer, en el formulario y al mostrar lo guardado.
// Como toda la ayuda de carga, no decide nada: el servidor valida cada código y uno fuera de la lista no se bloquea.
import {GRH_CONCEPTS,CONCEPT_GROUPS,conceptInfo} from './grh-concept-dictionary.js';

// Datos fijos que usa la liquidación propia. No son un renglón que se paga: son el dato del que sale el concepto
// («está afiliado», «tiene declarado el seguro del cónyuge»). Su código es 901000000 + el número del concepto.
const OWN_BASE=901000000;
const OWN=[[617,'Afiliación al Sindicato Municipal'],[676,'Afiliación a A.P.E.L.'],[677,'Afiliación a A.T.E.'],[607,'Seguro mutual del cónyuge (Ley 2404)']];
export const FIXED_OWN_ENTRIES=Object.freeze(OWN.map(([concept,label])=>Object.freeze({code:String(OWN_BASE+concept),concept:String(concept),label})));
const ownByCode=new Map(FIXED_OWN_ENTRIES.map(entry=>[entry.code,entry])),ownByConcept=new Map(FIXED_OWN_ENTRIES.map(entry=>[entry.concept,entry]));
const digits=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,19})$/.test(value);
const fold=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
// Un dato fijo de la liquidación propia que todavía no tiene nombre propio en esta lista.
const derived=code=>{const m=/^9010(\d{5})$/.exec(code);return m?String(Number(m[1])):null;};

// Texto de una opción de la lista (y del campo, una vez elegida).
export function fixedConceptOption(code){
  const own=ownByCode.get(code);if(own)return own.label;
  const known=conceptInfo(code);return known?known.code+' · '+known.label:null;
}
// Las opciones, en el orden en que conviene ofrecerlas: primero los datos fijos de la liquidación propia, después los
// conceptos que se cargan por novedad y, al final, el resto; dentro de cada grupo, los más usados arriba. Un concepto que
// sale de un dato fijo se ofrece una sola vez, por ese dato: así la lista no tiene dos opciones para lo mismo.
export const FIXED_CONCEPT_OPTIONS=Object.freeze([
  ...FIXED_OWN_ENTRIES.map(entry=>Object.freeze({code:entry.code,text:entry.label,detail:'Liquidación propia · de acá sale el concepto '+entry.concept})),
  ...GRH_CONCEPTS.filter(c=>!ownByConcept.has(c.code)).sort((a,b)=>Number(b.novelty)-Number(a.novelty)||b.uses-a.uses||Number(a.code)-Number(b.code))
    .map(c=>Object.freeze({code:c.code,text:c.code+' · '+c.label,detail:CONCEPT_GROUPS[c.group]??''})),
]);
const byText=new Map(FIXED_CONCEPT_OPTIONS.map(option=>[fold(option.text),option.code]));

// Lo que hay escrito en el campo → código a guardar, o null si no se puede saber cuál es.
// Vale un número (se valida al guardar) o el texto exacto de una opción de la lista.
export function fixedConceptCode(text){
  const value=typeof text==='string'?text.trim():'';
  if(digits(value))return value;
  return byText.get(fold(value))??null;
}
// Si lo escrito no es una opción exacta pero alcanza para reconocer una sola, esa opción; si no, null.
export function fixedConceptGuess(text){
  const plain=value=>fold(value).replace(/[^a-z0-9 ]/g,''),words=plain(text).split(' ').filter(Boolean);if(!words.length||digits(String(text).trim()))return null;
  const found=FIXED_CONCEPT_OPTIONS.filter(option=>{const name=plain(option.text);return words.every(word=>name.includes(word));});
  return found.length===1?found[0]:null;
}
// Código guardado → cómo se lee en el registro, la revisión y el detalle.
export function fixedConceptName(code){
  if(!digits(code))return typeof code==='string'&&code?code:'Sin informar';
  const own=ownByCode.get(code);if(own)return own.label+' · de acá sale el concepto '+own.concept;
  const from=derived(code);if(from){const known=conceptInfo(from);return 'Dato fijo para el concepto '+from+(known?' · '+known.label:'');}
  const known=conceptInfo(code);return known?known.code+' · '+known.label:'Concepto '+code;
}
// Línea de ayuda debajo del campo, según lo escrito.
export function fixedConceptHint(text){
  const value=typeof text==='string'?text.trim():'';if(!value)return 'Buscá por nombre: sindicato, seguro, cuota… También podés escribir el número del concepto.';
  const code=fixedConceptCode(value);
  if(code===null){const guess=fixedConceptGuess(value);return guess?'¿Es «'+guess.text+'»? Elegilo de la lista.':'Elegí una opción de la lista. Si no aparece, escribí el número del concepto.';}
  const own=ownByCode.get(code);if(own)return 'Dato fijo de la liquidación propia. De acá sale el concepto '+own.concept+'; se carga con 1 unidad y sin importe.';
  const from=derived(code);if(from)return fixedConceptName(code)+'.';
  const known=conceptInfo(code),entry=ownByConcept.get(code);
  if(entry)return known.code+' · '+known.label+'. Para la liquidación propia elegí «'+entry.label+'» de la lista.';
  return known?known.code+' · '+known.label+' · '+(CONCEPT_GROUPS[known.group]??''):'El '+code+' no está en la lista de referencia: se valida al guardar.';
}
export const fixedConceptIsOwn=code=>ownByCode.has(code);

// Respaldos habituales, para elegir y completar el número o la fecha en vez de redactar.
export const FIXED_INSTRUMENT_OPTIONS=Object.freeze(['Formulario de afiliación firmado por el agente, del ','Declaración jurada del agente, del ','Nota de la entidad, del ','Resolución N.º ','Decreto N.º ','Oficio judicial N.º ']);

// Fecha guardada (aaaa-mm-dd) → dd/mm/aaaa; cualquier otro texto queda igual.
export function fixedDayText(value){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value==='string'?value:'');return m?m[3]+'/'+m[2]+'/'+m[1]:value;}
