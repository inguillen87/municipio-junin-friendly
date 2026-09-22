// Shared input rules only. No stored identities, credentials or example employees.
export const LEGACY_EMPLOYEE_FIELDS = Object.freeze(['legajo','fullName','dni','cuil','birthDate','sexCode','startDate','agreementCode','categoryCode','organizationId','sectorCode','jobTitle','legalReference']);
export const EMPLOYEE_FIELDS = Object.freeze([...LEGACY_EMPLOYEE_FIELDS,'jurisdictionCode']);
export const EMPLOYEE_JURISDICTION_CODES = Object.freeze(['42','55']);
export class EmployeeInputError extends Error { constructor(message, field = '') { super(message); this.name = 'EmployeeInputError'; this.field = field; } }
export function validCuil(value) {
  if (!/^\d{11}$/.test(value) || /^0+$/.test(value)) return false;
  const sum = [5,4,3,2,7,6,5,4,3,2].reduce((n,w,i) => n + w * Number(value[i]),0), remainder = 11 - sum % 11;
  return Number(value[10]) === (remainder === 11 ? 0 : remainder === 10 ? 9 : remainder);
}
export function isoDay(value) {
  if (typeof value !== 'string' || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function employeeDraft(input, today = new Date().toISOString().slice(0,10), {requireJurisdiction=false} = {}) {
  const declared = input && Object.hasOwn(input,'jurisdictionCode');
  const fields = declared ? EMPLOYEE_FIELDS : LEGACY_EMPLOYEE_FIELDS;
  if (!input || Array.isArray(input) || Object.keys(input).sort().join('|') !== [...fields].sort().join('|')) throw new EmployeeInputError('El formulario contiene campos no admitidos.');
  if ((requireJurisdiction && !declared) || (declared && !EMPLOYEE_JURISDICTION_CODES.includes(input.jurisdictionCode))) throw new EmployeeInputError('Seleccioná la jurisdicción declarada: 42 o 55.','jurisdictionCode');
  const draft = {};
  for (const key of fields) {
    if (typeof input[key] !== 'string') throw new EmployeeInputError('Revisá este campo.', key);
    draft[key] = input[key].normalize('NFC').trim();
    if (/[\u0000-\u001f\u007f<>]/.test(draft[key])) throw new EmployeeInputError('No se admiten etiquetas ni caracteres de control.',key);
  }
  draft.dni = draft.dni.replace(/[. -]/g,''); draft.cuil = draft.cuil.replace(/[. -]/g,'');
  if (draft.legajo && !/^[1-9]\d{0,8}$/.test(draft.legajo)) throw new EmployeeInputError('Usá un número de legajo de hasta nueve dígitos, sin ceros iniciales.','legajo');
  if (draft.fullName.length < 3 || draft.fullName.length > 160) throw new EmployeeInputError('Ingresá apellido y nombres completos (3 a 160 caracteres).','fullName');
  if (!/^\d{5,8}$/.test(draft.dni) || /^0+$/.test(draft.dni)) throw new EmployeeInputError('Revisá el DNI: debe contener entre cinco y ocho dígitos.','dni');
  if (!validCuil(draft.cuil) || draft.cuil.slice(2,10) !== draft.dni.padStart(8,'0')) throw new EmployeeInputError('El CUIL no es válido o no corresponde al DNI ingresado.','cuil');
  if (!isoDay(draft.birthDate) || draft.birthDate > today) throw new EmployeeInputError('Ingresá una fecha de nacimiento válida, no futura.','birthDate');
  if (!isoDay(draft.startDate) || draft.startDate < draft.birthDate) throw new EmployeeInputError('Revisá la fecha de ingreso.','startDate');
  if (!['','F','M','X'].includes(draft.sexCode)) throw new EmployeeInputError('Elegí una opción válida.','sexCode');
  for (const key of ['agreementCode','categoryCode','organizationId','sectorCode']) if (!/^\d{1,9}$/.test(draft[key])) throw new EmployeeInputError('Seleccioná una opción del catálogo.',key);
  if (draft.jobTitle.length > 120) throw new EmployeeInputError('El cargo admite hasta 120 caracteres.','jobTitle');
  if (draft.legalReference.length < 3 || draft.legalReference.length > 180) throw new EmployeeInputError('Identificá la resolución, disposición o documento de alta.','legalReference');
  return Object.freeze(draft);
}
