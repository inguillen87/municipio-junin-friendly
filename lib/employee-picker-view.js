import { EMPLOYEE_PICKER_VERSION, pickerSearch, pickerEmployee } from '../assets/employee-picker-model.js';
/** Input and output restrictions apply only to the dedicated projection. Existing directory API is unchanged. */
export function assertEmployeePickerRequest(query, binding) {
  const allowed=new Set(['resource','view','search','status','includeFacets','page','limit']);
  if(!query || Object.keys(query).some(k=>!allowed.has(k)||typeof query[k]!=='string') || query.resource!=='employees' || query.view!=='novelty-selector' || query.status!=='administrative_active' || query.includeFacets!=='0' || query.limit!=='20' || !/^[1-9]\d{0,5}$/.test(query.page||'') || Number(query.page)>100000)throw Error('La búsqueda debe usar el directorio activo y una página válida.');
  pickerSearch(query.search);
  if(!binding || !/^[a-zA-Z0-9_-]{1,120}$/.test(binding.database) || !Number.isSafeInteger(binding.companyId)||binding.companyId<1)throw Error('El origen del directorio no está configurado.');
}
const serializedDate=value=>value instanceof Date?value.toISOString():value??null;
export function employeePickerPayload(rows,pagination,scope) {
  return {ok:true,version:EMPLOYEE_PICKER_VERSION,data:rows.map(row=>pickerEmployee({contractId:row.contractId,legajo:row.legajo,nombre:row.nombre??null,sector:row.sector??null,convenio:row.convenio??null,activo:row.activo,statusSnapshotDate:serializedDate(row.statusSnapshotDate)})),pagination,scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:serializedDate(scope?.sourceCutoffFrom),sourceCutoffTo:serializedDate(scope?.sourceCutoffTo)}};
}
export function escapePickerLike(value){return value.replace(/[\\%_]/g,'\\$&');}
