// Exact arithmetic for explicitly declared rules. No municipal rate or policy.
export class OwnPayrollError extends Error {
  constructor(code, message) { super(message); this.name = 'OwnPayrollError'; this.code = code; }
}
export function payrollRequire(condition, code, message) {
  if (!condition) throw new OwnPayrollError(code, message);
}
export const ROUNDING_MODES = Object.freeze(['exact', 'half_up', 'half_even', 'toward_zero', 'floor', 'ceiling']);
const abs = n => n < 0n ? -n : n;
function gcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; }
export function rational(numerator, denominator = 1n) {
  payrollRequire(typeof numerator === 'bigint' && typeof denominator === 'bigint', 'DECIMAL_INVALID', 'El valor debe ser decimal exacto.');
  payrollRequire(denominator !== 0n, 'DIVISION_BY_ZERO', 'La regla divide por cero.');
  payrollRequire(abs(numerator).toString().length <= 512 && abs(denominator).toString().length <= 512, 'ARITHMETIC_LIMIT', 'La operación supera la capacidad exacta admitida; no se recorta.');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ n: numerator / divisor, d: denominator / divisor });
}
export function decimal(value) {
  payrollRequire(typeof value === 'string' && /^-?(?:0|[1-9][0-9]{0,95})(?:\.[0-9]{1,8})?$/.test(value) && !/^-0(?:\.0+)?$/.test(value), 'DECIMAL_INVALID', 'Informá un decimal como texto, sin exponente, separador de miles ni cero negativo.');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  return rational((value.startsWith('-') ? -1n : 1n) * BigInt(whole + fraction), 10n ** BigInt(fraction.length));
}
export const exactAdd = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const exactSubtract = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const exactMultiply = (a, b) => rational(a.n * b.n, a.d * b.d);
export const exactDivide = (a, b) => rational(a.n * b.d, a.d * b.n);
export const exactCompare = (a, b) => { const difference = a.n * b.d - b.n * a.d; return difference < 0n ? -1 : difference > 0n ? 1 : 0; };
export const exactEvidence = a => ({ numerator: a.n.toString(), denominator: a.d.toString() });
export function roundingPolicy(policy) {
  payrollRequire(policy && Object.getPrototypeOf(policy) === Object.prototype && Reflect.ownKeys(policy).every(k => typeof k === 'string') && Reflect.ownKeys(policy).sort().join('|') === 'mode|precision' && Object.values(Object.getOwnPropertyDescriptors(policy)).every(d => Object.hasOwn(d, 'value')) && Number.isInteger(policy.precision) && policy.precision >= 0 && policy.precision <= 8 && ROUNDING_MODES.includes(policy.mode), 'ROUNDING_REQUIRED', 'Declarar precisión (0 a 8) y modo de redondeo es obligatorio.');
  return { precision: policy.precision, mode: policy.mode };
}
export function quantize(value, policy) {
  const { precision, mode } = roundingPolicy(policy);
  const multiplier = 10n ** BigInt(precision), scaled = value.n * multiplier;
  let quotient = scaled / value.d;
  const remainder = scaled % value.d, sign = scaled < 0n ? -1n : 1n;
  if (remainder !== 0n) {
    payrollRequire(mode !== 'exact', 'ROUNDING_NEEDED', 'El resultado requiere un redondeo que la regla no autoriza.');
    if (mode === 'floor' && sign < 0n || mode === 'ceiling' && sign > 0n) quotient += sign;
    if (mode === 'half_up' || mode === 'half_even') {
      const twice = abs(remainder) * 2n;
      if (twice > value.d || twice === value.d && (mode === 'half_up' || abs(quotient) % 2n === 1n)) quotient += sign;
    }
  }
  const digits = abs(quotient).toString().padStart(precision + 1, '0');
  const amount = (quotient < 0n ? '-' : '') + (precision ? digits.slice(0, -precision) + '.' + digits.slice(-precision) : digits);
  return { amount, value: rational(quotient, multiplier) };
}
