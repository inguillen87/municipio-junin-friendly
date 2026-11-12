// Versioned facts of the existing namespaced engine; never decimal codes.
export const OWN_PAYROLL_CONDITIONS_VERSION='own-contract-salary-conditions.v1';
export const OWN_PAYROLL_CONDITIONS_V2_VERSION='own-contract-salary-conditions.v2';
export const ownPayrollConditionsVersion=v=>{const version=v!==null&&typeof v==='object'?Object.getOwnPropertyDescriptor(v,'salaryConditionsVersion')?.value:null;return [OWN_PAYROLL_CONDITIONS_VERSION,OWN_PAYROLL_CONDITIONS_V2_VERSION].includes(version)?version:null;};
export const ownPayrollConditions=v=>ownPayrollConditionsVersion(v)!==null;
export const CONDITION_FIELD_UNITS=Object.freeze({partialSeniorityYears:'units',titleStatus:'code',titleCode:'code',titlePercentage:'percent',unhealthyWork:'boolean'});
export const NATIVE_CONDITION_FIELD_UNITS=Object.freeze({teacherPayEnabled:'boolean',teacherReferenceAmount:'money',housingHigherDedicationPayEnabled:'boolean',payrollMonthBaseDays:'days'});
export const CONDITION_V2_FIELD_UNITS=Object.freeze({...CONDITION_FIELD_UNITS,...NATIVE_CONDITION_FIELD_UNITS});
export const conditionFieldUnits=v=>ownPayrollConditionsVersion(v)===OWN_PAYROLL_CONDITIONS_V2_VERSION?CONDITION_V2_FIELD_UNITS:CONDITION_FIELD_UNITS;
export const CLASSIFICATION_FIELD_UNITS=Object.freeze({categoryCode:'code',agreementCode:'code'});
export const conditionUnit=unit=>unit==='code'||unit==='boolean';
export const conditionValue=(unit,value)=>unit==='boolean'?typeof value==='boolean':unit==='code'&&typeof value==='string'&&/^[A-Za-z0-9_]{1,32}$/.test(value);
