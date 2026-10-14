// Versioned facts of the existing namespaced engine; never decimal codes.
export const OWN_PAYROLL_CONDITIONS_VERSION='own-contract-salary-conditions.v1';
export const ownPayrollConditions=v=>v!==null&&typeof v==='object'&&Object.getOwnPropertyDescriptor(v,'salaryConditionsVersion')?.value===OWN_PAYROLL_CONDITIONS_VERSION;
export const CONDITION_FIELD_UNITS=Object.freeze({partialSeniorityYears:'units',titleStatus:'code',titleCode:'code',titlePercentage:'percent',unhealthyWork:'boolean'});
export const CLASSIFICATION_FIELD_UNITS=Object.freeze({categoryCode:'code',agreementCode:'code'});
export const conditionUnit=unit=>unit==='code'||unit==='boolean';
export const conditionValue=(unit,value)=>unit==='boolean'?typeof value==='boolean':unit==='code'&&typeof value==='string'&&/^[A-Za-z0-9_]{1,32}$/.test(value);
