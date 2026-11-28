import {salaryExact,salaryUuid} from '../assets/native-salary-catalog-model.js';
import {ownEmploymentJobTitleReasons,OWN_EMPLOYMENT_JOB_TITLE_ERROR} from '../assets/own-payroll-employment-print-facts.js';

export const OWN_EMPLOYMENT_PRINT_PREFLIGHT_VERSION='own-employment-print-preflight.v1';
const messages=Object.freeze({
 invalid_type:'El cargo debe ser texto o null.',
 empty:'El texto está vacío; un cargo desconocido debe estar declarado como null.',
 utf16_length:'El cargo supera 120 unidades UTF-16.',
 invalid_unicode:'El cargo contiene un sustituto Unicode aislado.',
 exterior_whitespace:'El cargo contiene espacios exteriores no admitidos.',
 non_nfc:'El cargo no está en forma Unicode NFC.',
 control_characters:'El cargo contiene caracteres de control.',
 bidirectional_controls:'El cargo contiene controles de dirección de escritura.',
 markup_characters:'El cargo contiene los signos < o >.',
});
const fields=['contractId','registrationId','jobTitle'];
const nil='00000000-0000-0000-0000-000000000000';
const dataProperty=(value,key)=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')&&d.enumerable;};
function need(ok){
 if(!ok)throw Object.assign(new Error('El preflight requiere filas explícitas de contrato, registro y cargo, con UUID válidos.'),
  {code:'OWN_EMPLOYMENT_PRINT_PREFLIGHT_INPUT_INVALID'});
}

/**
 * Pure text compatibility check over rows explicitly supplied by the caller.
 * No source lookup, authority/identity resolution, normalization or population
 * completeness claim. The report never contains a title or a title fragment.
 */
export function preflightOwnEmploymentPrintTitles(rows){
 need(Array.isArray(rows)&&rows.length<=10000&&Reflect.ownKeys(rows).length===rows.length+1);
 const rejectedRows=[];
 for(let i=0;i<rows.length;i++){
  need(dataProperty(rows,String(i)));
  const row=rows[i];
  need(salaryExact(row,fields)&&Reflect.ownKeys(row).length===fields.length&&fields.every(field=>dataProperty(row,field)));
  need(salaryUuid(row.contractId)&&row.contractId!==nil&&salaryUuid(row.registrationId)&&row.registrationId!==nil);
  const reasons=ownEmploymentJobTitleReasons(row.jobTitle);
  if(reasons.length)rejectedRows.push({rowOrdinal:i+1,contractId:row.contractId,registrationId:row.registrationId,
   code:OWN_EMPLOYMENT_JOB_TITLE_ERROR,reasons:reasons.map(code=>({code,message:messages[code]}))});
 }
 return {version:OWN_EMPLOYMENT_PRINT_PREFLIGHT_VERSION,scope:'supplied_rows_only',
  populationCoverageVerified:false,installationReady:false,checkedRows:rows.length,
  compatibleRows:rows.length-rejectedRows.length,rejectedRows};
}
