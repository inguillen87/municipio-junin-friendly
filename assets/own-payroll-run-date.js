import {civilDate} from './civil-date.js';
// A declared civil date, never a timestamp, payment date or inferred old fact.
export function ownRunDate(value){
 if(typeof value!=='string'||!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value))return false;
 try{return civilDate(value)===value;}catch{return false;}
}
export function ownRunPeriodEnd(period){
 if(typeof period!=='string'||!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(period))throw Error('Elegí un período válido antes de usar su último día.');
 const [year,month]=period.split('-').map(Number);return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
}
export function ownRunDateLabel(value){
 if(value===null||value===undefined)return 'Fecha no declarada en esta corrida';
 if(!ownRunDate(value))throw Error('La fecha declarada no cumple el contrato.');
 return 'Fecha de liquidación: '+value.split('-').reverse().join('/');
}
