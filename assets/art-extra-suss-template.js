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
  const name = String(value ?? '').replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim().toUpperCase();
  return ART_EXTRA_SUSS_NAME.test(name) ? name : null;
}
