// Tarifa propia de asignaciones familiares de un período: importes por región, tipo y tramo de promedio.
// Es un dato municipal que una persona declara y otra aprueba. No se lee de un sistema anterior, no se completa
// por semejanza y lo que no se informó queda vacío: nunca vale cero. Este módulo es puro: valida la declaración
// y resuelve un importe; no consulta nada, no calcula una liquidación y no registra.
import {SalaryInputError, salaryExact as salaryShape, salaryJsonbBytes} from './native-salary-catalog-model.js';
import {civilDay} from './employment-adoption-review-model.js';
import {FAMILY_PAYROLL_FACT_QUANTITIES} from './own-contract-family-payroll-facts-model.js';

export const FAMILY_ALLOWANCE_TARIFF_VERSION = 'own-family-allowance-tariff.v1';
export const FAMILY_ALLOWANCE_TARIFF_MAX_ROWS = 2000;
export const FAMILY_ALLOWANCE_TARIFF_MAX_BYTES = 1024 * 1024;
// Los tipos son los mismos doce hechos familiares que se declaran por contrato: una cantidad sólo se paga
// con la tarifa de su mismo tipo.
export const FAMILY_ALLOWANCE_TARIFF_TYPES = FAMILY_PAYROLL_FACT_QUANTITIES;
// Cómo se lee el tope de un tramo. No hay valor por omisión: si no se declaró, un tramo no se resuelve.
export const FAMILY_ALLOWANCE_BRACKET_RULES = Object.freeze(['upToInclusive', 'upToExclusive']);
// Qué pasa cuando el promedio supera el último tope. Tampoco tiene valor por omisión.
export const FAMILY_ALLOWANCE_ABOVE_LAST = Object.freeze(['notPayable']);
export const FAMILY_ALLOWANCE_UNRESOLVED = Object.freeze(['REGION_NOT_DECLARED', 'TYPE_NOT_IN_TARIFF', 'AMOUNT_NOT_DECLARED', 'AVERAGE_NOT_DECLARED', 'BRACKET_RULE_NOT_DECLARED', 'ABOVE_LAST_BRACKET_NOT_DECLARED']);

const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('FAMILY_ALLOWANCE_TARIFF_' + code, message); };
const periodValid = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const codeValid = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const moneyValid = v => typeof v === 'string' && /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/.test(v);
const exact = (v, keys) => salaryShape(v, keys) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable);
// Centavos exactos: los importes nunca pasan por un número de punto flotante.
const cents = v => { const [whole, fraction = ''] = v.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
// La constancia sigue la misma regla explícita por puntos de código que el contrato de hechos familiares.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const EVIDENCE_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029<>]/u;
const EVIDENCE_EDGE = /^[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]|[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]$/u;
const evidence = v => typeof v === 'string' && !LONE_SURROGATE.test(v) && v === v.normalize('NFC') && !EVIDENCE_FORBIDDEN.test(v) && !EVIDENCE_EDGE.test(v) && [...v].length >= 3 && [...v].length <= 180;
const typeOrder = new Map(FAMILY_ALLOWANCE_TARIFF_TYPES.map((k, i) => [k, i]));
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

function rowOrder(a, b) {
 if (a.region !== b.region) return BigInt(a.region) < BigInt(b.region) ? -1 : 1;
 if (a.type !== b.type) return typeOrder.get(a.type) - typeOrder.get(b.type);
 if (a.upTo === null || b.upTo === null) return a.upTo === b.upTo ? 0 : a.upTo === null ? 1 : -1;
 const x = cents(a.upTo), y = cents(b.upTo); return x < y ? -1 : x > y ? 1 : 0;
}

/** Valida la declaración completa de un período y devuelve una copia inmutable. Nunca completa ni convierte. */
export function familyAllowanceTariffDefinition(v, period) {
 need(periodValid(period) && exact(v, ['rows', 'bracketRule', 'aboveLastBracket', 'asOfDate', 'documentReference']), 'Revisá período, filas de la tarifa, lectura de los topes, fecha y constancia.');
 need(Array.isArray(v.rows) && v.rows.length > 0 && v.rows.length <= FAMILY_ALLOWANCE_TARIFF_MAX_ROWS && Reflect.ownKeys(v.rows).length === v.rows.length + 1
  && Array.from({length: v.rows.length}, (_, i) => Object.getOwnPropertyDescriptor(v.rows, String(i))).every(d => d && Object.hasOwn(d, 'value')), 'La tarifa se declara completa, sin huecos ni filas agregadas.', 'CONTRACT_INVALID');
 need(v.bracketRule === null || FAMILY_ALLOWANCE_BRACKET_RULES.includes(v.bracketRule), 'Indicá si el tope de cada tramo se incluye o no, o dejalo sin informar.');
 need(v.aboveLastBracket === null || FAMILY_ALLOWANCE_ABOVE_LAST.includes(v.aboveLastBracket), 'Indicá qué corresponde por encima del último tope, o dejalo sin informar.');
 let previous = null;
 for (const r of v.rows) {
  need(exact(r, ['region', 'type', 'upTo', 'amount']) && codeValid(r.region) && r.region === String(BigInt(r.region)) && typeOrder.has(r.type), 'Cada fila lleva región, tipo de asignación, tope e importe.');
  need(r.upTo === null || moneyValid(r.upTo) && cents(r.upTo) > 0n, 'El tope es un importe mayor que cero con hasta dos decimales, o vacío si la fila no tiene tope.');
  need(r.amount === null || moneyValid(r.amount), 'El importe es un decimal exacto con hasta dos decimales. Vacío significa sin informar; no equivale a cero.');
  need(previous === null || rowOrder(previous, r) < 0, 'Hay una fila repetida o fuera de orden: región, tipo y tope de menor a mayor, con la fila sin tope al final.', 'CONTRACT_INVALID');
  previous = r;
 }
 need(civilDay(v.asOfDate) && /^(19|20)/.test(v.asOfDate) && v.asOfDate.slice(0, 7) <= period && evidence(v.documentReference), 'Informá una fecha válida hasta el período y la constancia que respalda la tarifa.');
 const copy = {rows: v.rows.map(r => ({...r})), bracketRule: v.bracketRule, aboveLastBracket: v.aboveLastBracket, asOfDate: v.asOfDate, documentReference: v.documentReference};
 need(salaryJsonbBytes(copy) <= FAMILY_ALLOWANCE_TARIFF_MAX_BYTES, 'La tarifa completa supera su capacidad. No se recortaron filas.', 'LIMIT');
 return freeze(copy);
}

const unresolved = reason => freeze({status: 'unresolved', reason});

/**
 * Importe que corresponde a una unidad de un tipo, para una región y un promedio semestral declarados.
 * Devuelve `resolved` con el importe exacto, `not_payable` sólo si la tarifa lo declara por encima del último tope,
 * o `unresolved` con el motivo. Un dato sin informar nunca se reemplaza por cero ni por otra fila parecida.
 */
export function familyAllowanceTariffAmount(definition, period, query) {
 const tariff = familyAllowanceTariffDefinition(definition, period);
 need(exact(query, ['region', 'type', 'semesterAverage']) && typeOrder.has(query.type) && (query.region === null || codeValid(query.region) && query.region === String(BigInt(query.region)))
  && (query.semesterAverage === null || moneyValid(query.semesterAverage)), 'La consulta lleva región, tipo de asignación y promedio semestral; lo desconocido va vacío.');
 if (query.region === null) return unresolved('REGION_NOT_DECLARED');
 const group = tariff.rows.filter(r => r.region === query.region && r.type === query.type);
 if (group.length === 0) return unresolved('TYPE_NOT_IN_TARIFF');
 const resolved = r => r.amount === null ? unresolved('AMOUNT_NOT_DECLARED') : freeze({status: 'resolved', amount: r.amount, upTo: r.upTo, region: r.region, type: r.type});
 if (group.length === 1 && group[0].upTo === null) return resolved(group[0]);
 if (query.semesterAverage === null) return unresolved('AVERAGE_NOT_DECLARED');
 if (tariff.bracketRule === null) return unresolved('BRACKET_RULE_NOT_DECLARED');
 const average = cents(query.semesterAverage);
 const row = group.find(r => r.upTo === null || (tariff.bracketRule === 'upToInclusive' ? average <= cents(r.upTo) : average < cents(r.upTo)));
 if (row) return resolved(row);
 return tariff.aboveLastBracket === 'notPayable' ? freeze({status: 'not_payable', region: query.region, type: query.type}) : unresolved('ABOVE_LAST_BRACKET_NOT_DECLARED');
}

/** Resumen para mostrar antes de enviar a revisión: qué se declaró y qué quedó sin informar. */
export function familyAllowanceTariffSummary(definition, period) {
 const tariff = familyAllowanceTariffDefinition(definition, period), groups = new Map();
 for (const r of tariff.rows) { const k = r.region + ':' + r.type; groups.set(k, [...(groups.get(k) ?? []), r]); }
 const bracketed = [...groups.values()].filter(g => g.length > 1 || g[0].upTo !== null);
 return freeze({rows: tariff.rows.length, regions: [...new Set(tariff.rows.map(r => r.region))], types: FAMILY_ALLOWANCE_TARIFF_TYPES.filter(t => tariff.rows.some(r => r.type === t)),
  missingTypes: FAMILY_ALLOWANCE_TARIFF_TYPES.filter(t => !tariff.rows.some(r => r.type === t)), amountsNotDeclared: tariff.rows.filter(r => r.amount === null).length,
  bracketedGroups: bracketed.length, openEndedGroups: bracketed.filter(g => g.at(-1).upTo === null).length,
  bracketRuleDeclared: tariff.bracketRule !== null, aboveLastBracketDeclared: tariff.aboveLastBracket !== null});
}
