// Texto de una constancia municipal: una sola regla explícita por puntos de código, la misma que valida el SQL
// de hechos familiares (226). Sin sustitutos sueltos, en forma NFC, sin controles ni separadores de línea, sin
// «<» ni «>», sin blancos en los bordes y con longitud contada en caracteres, no en unidades UTF-16.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029<>]/u;
const EDGE = /^[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]|[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]$/u;
export function evidenceText(v, min, max) {
 if (typeof v !== 'string' || LONE_SURROGATE.test(v) || v !== v.normalize('NFC') || FORBIDDEN.test(v) || EDGE.test(v)) return false;
 const length = [...v].length; return length >= min && length <= max;
}
