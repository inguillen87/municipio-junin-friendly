/** Explicit administrative source value only. Never infer from names or CUIL. */
const MAP = Object.freeze({ F: 'F', FEMENINO: 'F', M: 'M', MASCULINO: 'M', X: 'X' });
export function exportSexCode(value, { profile = 'internal' } = {}) {
  if (!['internal', 'art-fm'].includes(profile)) throw new Error('Perfil de sexo no admitido');
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const code = Object.hasOwn(MAP, raw) ? MAP[raw] : null;
  const issue = !raw ? 'missing' : !code ? 'unmapped' : profile === 'art-fm' && code === 'X' ? 'destination_review' : null;
  return Object.freeze({ code, exportValue: issue ? null : code, issue });
}
export const SEX_ISSUE_LABELS = Object.freeze({
  missing: 'Sexo no informado en el legajo',
  unmapped: 'Código de sexo sin equivalencia verificada',
  destination_review: 'El formato F/M requiere revisar este caso; se conserva X',
});
