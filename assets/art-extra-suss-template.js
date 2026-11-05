// Official ART "extra-SUSS" presentation template (plantilla_presentacion_extra-suss.xlsx).
// Layout read from the municipal example of 2026-08 (790 agents): eight fixed headers in
// row 1; columns B (document type) and G (birth date) are left empty by the municipality;
// A, C, F and H are numbers; D and E are text. One sheet named Hoja1.
export const ART_EXTRA_SUSS_TEMPLATE_VERSION = 'art-extra-suss-template.v1';
export const ART_EXTRA_SUSS_HEADERS = Object.freeze([
  'Nº Doc.', 'Tipo de Doc.', 'CUIL (sin guiones)', 'Apellido y Nombre',
  'Sexo (M:Masculino F:Femenino \nX: No Binario)', 'Cantidad de Días Trabajados', 'Fecha de Nacimiento', 'Sueldo',
]);
export const ART_EXTRA_SUSS_SHEET = 'Hoja1';
export const ART_EXTRA_SUSS_NAME = /^[A-ZÁÉÍÓÚÜÑ0-9 .,'-]{2,80}$/;
export const artExtraSussFileName = (period) => `plantilla_presentacion_extra-suss_${period}.xlsx`;
// Upper case, single spaces, no control characters; the template is read by the insurer as text.
export function artExtraSussName(value) {
  // NFC first: a decomposed accent (e + U+0301) is the same name and must not be rejected.
  const name = String(value ?? '').normalize('NFC').replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim().toUpperCase();
  return ART_EXTRA_SUSS_NAME.test(name) ? name : null;
}
// Numeric cells are read by the insurer as IEEE doubles: a value is admitted only when the
// consumer recovers exactly the same integer (DNI, CUIL, days) or the same cents (salary).
export const ART_EXTRA_SUSS_MAX_EXACT = 9007199254740991n; // Number.MAX_SAFE_INTEGER
export function artExtraSussExactCents(cents) {
  if (typeof cents !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(cents) || BigInt(cents) > ART_EXTRA_SUSS_MAX_EXACT) return null;
  const whole = cents.length > 2 ? cents.slice(0, -2) : '0', fraction = cents.padStart(3, '0').slice(-2);
  const text = `${whole}.${fraction}`;
  // Round trip through the consumer's arithmetic: what Excel stores must come back as the same cents.
  return Math.round(Number(text) * 100).toString() === cents ? text : null;
}
export function artExtraSussExactInteger(digits) {
  return typeof digits === 'string' && /^[0-9]+$/.test(digits) && BigInt(digits) <= ART_EXTRA_SUSS_MAX_EXACT ? BigInt(digits).toString() : null;
}
// Observations that only the official template needs (the canonical Excel/CSV are unaffected):
// the caller shows them before enabling the download, and the exporter re-checks them.
export function artExtraSussIssues(row) {
  const issues = [];
  if (!artExtraSussName(row?.name)) issues.push('Apellido y nombre no admitidos por la plantilla extra-SUSS (sólo letras, tildes, Ñ, números, espacios y . , \' -; 2 a 80 caracteres).');
  if (artExtraSussExactInteger(String(row?.dni ?? '')) === null || artExtraSussExactInteger(String(row?.cuil ?? '')) === null) issues.push('DNI o CUIL no representables como número exacto en la plantilla extra-SUSS.');
  if (row?.workedDays === null || row?.workedDays === undefined || artExtraSussExactInteger(String(row.workedDays)) === null) issues.push('Días trabajados no representables como número exacto en la plantilla extra-SUSS.');
  if (row?.salaryCents === null || row?.salaryCents === undefined || artExtraSussExactCents(String(row.salaryCents)) === null) issues.push('Sueldo fuera del rango exacto de la plantilla extra-SUSS (los centavos no se conservarían). No se redondea.');
  return issues;
}
export function artExtraSussReadiness(report) {
  const rows = (report?.rows ?? []).map(r => ({ employeeNumber: r.employeeNumber, issues: artExtraSussIssues(r) })).filter(r => r.issues.length);
  return Object.freeze({ canExport: !!report?.canExport && rows.length === 0, issueCount: rows.reduce((n, r) => n + r.issues.length, 0), rows: Object.freeze(rows) });
}
