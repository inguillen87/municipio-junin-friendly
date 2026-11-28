// Novedades del mes: los datos de una fila que no entran en las columnas principales (centro de costo, mes de ajuste,
// movimiento, instrumento, observación, forzado) y el movimiento «tal como figura en el origen».
//
// El modelo admite como movimiento cualquier código corto en minúsculas (el mismo patrón que valida el servidor). La
// pantalla ofrece los dos habituales y, además, cargar el código de origen sin traducirlo: una novedad tomada de otro
// sistema conserva su movimiento exacto y acá no se le asigna un significado que no esté documentado.
import {costCenterText} from './grh-cost-centers.js';

export const OWN_NOVELTY_MOVEMENTS=Object.freeze({standard:'Normal',adjustment:'Ajuste'});
export const OWN_NOVELTY_MOVEMENT_OTHER='__source';
const SOURCE_MOVEMENT=/^[a-z0-9][a-z0-9._-]{0,31}$/;

// Lo elegido en la lista y lo escrito en el campo de origen → valor de la fila (null = sin movimiento).
export function ownNoveltyMovementValue(choice,other){
  if(choice===''||choice===null||choice===undefined)return null;
  if(Object.hasOwn(OWN_NOVELTY_MOVEMENTS,choice))return choice;
  if(choice!==OWN_NOVELTY_MOVEMENT_OTHER)throw Error('Elegí el movimiento de la lista.');
  const value=typeof other==='string'?other:'';
  if(!value)throw Error('Escribí el movimiento tal como figura en el origen, o elegí «Sin movimiento».');
  if(!SOURCE_MOVEMENT.test(value))throw Error('El movimiento de origen admite hasta 32 caracteres: letras minúsculas, números, punto, guion y guion bajo.');
  return value;
}
// Valor guardado → cómo se lee.
export function ownNoveltyMovementLabel(value){
  if(value===null||value===undefined||value==='')return 'Sin movimiento';
  return OWN_NOVELTY_MOVEMENTS[value]??'«'+value+'» (tal como figura en el origen)';
}
// Valor guardado → qué mostrar en el formulario al retomarlo.
export function ownNoveltyMovementChoice(value){
  if(value===null||value===undefined||value==='')return {choice:'',other:''};
  return Object.hasOwn(OWN_NOVELTY_MOVEMENTS,value)?{choice:value,other:''}:{choice:OWN_NOVELTY_MOVEMENT_OTHER,other:value};
}
const monthText=value=>{const m=/^(\d{4})-(\d{2})-01$/.exec(typeof value==='string'?value:'');return m?m[2]+'/'+m[1]:value;};
// Los demás datos de una fila, en el orden en que conviene leerlos. Sólo lo informado; lo vacío no se menciona.
export function ownNoveltyRowExtras(values){
  const out=[];
  if(values.forced)out.push('Importe forzado');
  if(values.costCenterSourceId!==null&&values.costCenterSourceId!==undefined)out.push('Centro de costo '+costCenterText(values.costCenterSourceId));
  if(values.adjustmentMonth)out.push('Mes de ajuste '+monthText(values.adjustmentMonth));
  if(values.movementType)out.push('Movimiento: '+ownNoveltyMovementLabel(values.movementType));
  if(values.legalInstrument)out.push('Instrumento: '+values.legalInstrument);
  if(values.observation)out.push('Observación: '+values.observation);
  return out;
}
