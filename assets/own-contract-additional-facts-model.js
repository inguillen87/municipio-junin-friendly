// Adicionales propios de un contrato en un período: datos que una persona declara y otra aprueba, y que las reglas
// de liquidación leen como entradas. No se leen de un sistema anterior ni se deducen de otros datos. Lo que no se
// informó queda vacío: nunca vale «no», cero ni «sin adicional». Módulo puro: sólo valida la declaración.
import {SalaryInputError, salaryExact as salaryShape} from './native-salary-catalog-model.js';
import {civilDay} from './employment-adoption-review-model.js';
import {evidenceText} from './evidence-text.js';

export const CONTRACT_ADDITIONAL_FACTS_VERSION = 'own-contract-additional-facts.v1';
// Unidad de cada hecho para una entrada del programa (misma idea que CONDITION_FIELD_UNITS).
export const CONTRACT_ADDITIONAL_FIELD_UNITS = Object.freeze({teachingPay: 'boolean', teachingHourlyAmount: 'money', guaranteeSupplement: 'boolean', fullDedication: 'boolean', spouseLifeInsuranceUnits: 'units', childLifeInsuranceUnits: 'units'});
export const CONTRACT_ADDITIONAL_FIELDS = Object.freeze(Object.keys(CONTRACT_ADDITIONAL_FIELD_UNITS));
// Cómo nombraba cada dato el diccionario de variables anterior, sólo como referencia para preparar reglas.
// Atención con la garantía: allá «0» significaba que sí se paga; acá se declara sí o no, sin inversión.
export const CONTRACT_ADDITIONAL_SOURCE_REFERENCES = Object.freeze({teachingPay: 'L[301]', teachingHourlyAmount: 'L[302]', guaranteeSupplement: 'L[311]', fullDedication: 'L[400]', spouseLifeInsuranceUnits: 'L[163]', childLifeInsuranceUnits: 'L[164]'});

const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('CONTRACT_ADDITIONAL_FACTS_' + code, message); };
const periodValid = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const exact = (v, keys) => salaryShape(v, keys) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable);
const valid = Object.freeze({
 boolean: v => v === null || v === true || v === false,
 money: v => v === null || typeof v === 'string' && /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/.test(v),
 units: v => v === null || typeof v === 'string' && /^(0|[1-9][0-9]?)$/.test(v),
});
const message = Object.freeze({
 boolean: 'Se declara sí o no. Vacío significa sin informar; no equivale a «no».',
 money: 'El importe es un decimal exacto con hasta dos decimales. Vacío significa sin informar; no equivale a cero.',
 units: 'La cantidad es un entero de 0 a 99 escrito como texto. Vacío significa sin informar; no equivale a cero.',
});

/** Valida la declaración completa de un contrato y devuelve una copia inmutable. Nunca completa ni convierte. */
export function contractAdditionalFactsDefinition(v, period) {
 need(periodValid(period) && exact(v, [...CONTRACT_ADDITIONAL_FIELDS, 'asOfDate', 'documentReference']), 'Revisá período, adicionales del contrato, fecha y constancia.');
 for (const field of CONTRACT_ADDITIONAL_FIELDS) { const unit = CONTRACT_ADDITIONAL_FIELD_UNITS[field]; need(valid[unit](v[field]), message[unit]); }
 need(civilDay(v.asOfDate) && /^(19|20)/.test(v.asOfDate) && v.asOfDate.slice(0, 7) <= period && evidenceText(v.documentReference, 3, 180), 'Informá una fecha válida hasta el período y la constancia que respalda los adicionales.');
 return Object.freeze({...v});
}

/** Qué quedó sin informar, para mostrar antes de enviar a revisión. */
export function contractAdditionalFactsMissing(v, period) {
 const definition = contractAdditionalFactsDefinition(v, period);
 return Object.freeze(CONTRACT_ADDITIONAL_FIELDS.filter(field => definition[field] === null));
}
