/** Minimal, source-bound directory projection. Selecting an employee does not certify payroll eligibility. */
export const EMPLOYEE_PICKER_VERSION = 'employee-picker.v1';
export const EMPLOYEE_PICKER_PAGE_SIZE = 20;
const digits = /^(?:0|[1-9]\d{0,19})$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const count = n => Number.isSafeInteger(n) && n >= 0;
export function pickerSearch(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) throw Error('Ingresá un nombre o número de legajo válido.');
  const text = value.trim();
  if (text.length < 2 || text.length > 100) throw Error('Escribí entre 2 y 100 caracteres para buscar por nombre o legajo.');
  return text;
}
export function pickerQuery(search, page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw Error('Página de búsqueda inválida.');
  return '/api/internal-data?' + new URLSearchParams({resource:'employees',view:'novelty-selector',search:pickerSearch(search),status:'administrative_active',includeFacets:'0',limit:String(EMPLOYEE_PICKER_PAGE_SIZE),page:String(page)});
}
function date(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('Fecha de fuente inválida.');
  const civil = value.slice(0,10);
  if(new Date(civil+'T12:00:00Z').toISOString().slice(0,10)!==civil) throw Error('Fecha de fuente inválida.');
  return value;
}
function optionalText(value, max = 240) {
  if (value === null) return null;
  if(typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw Error('Dato de directorio inválido.');
  return value;
}
export function pickerEmployee(row) {
  if(!row || !uuid.test(row.contractId) || typeof row.legajo !== 'string' || !digits.test(row.legajo) || row.activo !== true) throw Error('La respuesta no contiene un legajo activo válido.');
  return Object.freeze({contractId:row.contractId,legajo:row.legajo,nombre:optionalText(row.nombre),sector:optionalText(row.sector),convenio:optionalText(row.convenio),activo:true,statusSnapshotDate:date(row.statusSnapshotDate)});
}
export function pickerResult(payload, expectedPage) {
  const p=payload?.pagination;
  if(payload?.ok!==true || payload.version!==EMPLOYEE_PICKER_VERSION || !Array.isArray(payload.data) || !p || p.page!==expectedPage || p.limit!==20 || !count(p.total) || p.pages!==Math.max(1,Math.ceil(p.total/20)) || payload.data.length!==Math.min(20,Math.max(0,p.total-(p.page-1)*20))) throw Error('La búsqueda devolvió datos incompletos. Volvé a consultar.');
  if(payload.scope?.status!=='administrative_active' || payload.scope?.payrollEligibilityCertified!==false) throw Error('El ámbito del directorio no está confirmado.');
  const ids=new Set(),legajos=new Set();
  const rows=payload.data.map(row=>{const item=pickerEmployee(row);if(ids.has(item.contractId)||legajos.has(item.legajo))throw Error('Hay legajos ambiguos en el directorio. Requieren revisión.');ids.add(item.contractId);legajos.add(item.legajo);return item;});
  const scope=Object.freeze({status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:date(payload.scope.sourceCutoffFrom),sourceCutoffTo:date(payload.scope.sourceCutoffTo)});
  return Object.freeze({rows:Object.freeze(rows),pagination:Object.freeze({...p}),scope});
}
export function addPickerSelection(selected, employee, {maximum=500,excluded=[]}={}) {
  const item=pickerEmployee(employee);
  if(!Array.isArray(selected)||!Number.isSafeInteger(maximum)||maximum<1||maximum>500)throw Error('Capacidad de selección inválida.');
  if(excluded.includes(item.legajo))throw Error('Ese legajo ya está incluido.');
  if(selected.some(x=>x.legajo===item.legajo || x.contractId===item.contractId))throw Error('Ese legajo ya está seleccionado.');
  if(selected.length>=maximum)throw Error('Alcanzaste el máximo de '+maximum+' legajos de esta selección.');
  return [...selected,item];
}
