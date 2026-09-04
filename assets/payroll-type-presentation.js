const CANONICAL_LABELS = Object.freeze({
  monthly: 'Mensual',
  first_fortnight: 'Primera quincena',
  second_fortnight: 'Segunda quincena',
  sac: 'Aguinaldo (SAC)',
  vacation: 'Vacaciones',
  supplementary: 'Complementaria',
  final: 'Liquidación final',
  other: 'Liquidación adicional / otros conceptos',
});

// Tabla de presentación verificada contra el selector process.tipo31 de GRH
// y el manual oficial GRHW_Formulas_Acrobat. No reemplaza el tipo canónico
// que usa el backend para decidir o escribir: sólo traduce el código de origen
// a lenguaje cotidiano y conserva el valor legado como trazabilidad secundaria.
const GRH_SOURCE_LABELS = Object.freeze({
  F: 'Liquidación final',
  M: 'Mensual / segunda quincena',
  O: 'Liquidación adicional / otros conceptos',
  P: 'Primera quincena',
  S: 'Aguinaldo (SAC)',
  V: 'Vacaciones',
});

function clean(value) {
  return String(value ?? '').trim();
}

export function payrollTypePresentation(canonicalValue, sourceValue) {
  const canonical = clean(canonicalValue).toLowerCase();
  const sourceCode = clean(sourceValue).toUpperCase();
  if (/^[A-Z]$/.test(sourceCode) && GRH_SOURCE_LABELS[sourceCode]) {
    return Object.freeze({
      label: GRH_SOURCE_LABELS[sourceCode],
      detail: `Tipo informado por GRH · código ${sourceCode}`,
      sourceCode,
      verifiedSourceLabel: true,
    });
  }
  if (CANONICAL_LABELS[canonical]) {
    return Object.freeze({
      label: CANONICAL_LABELS[canonical],
      detail: 'Tipo normalizado por MuniControl',
      sourceCode: null,
      verifiedSourceLabel: false,
    });
  }
  if (/^[A-Z]$/.test(sourceCode)) {
    return Object.freeze({
      label: 'Tipo histórico pendiente de identificar',
      detail: `Código de origen GRH ${sourceCode}`,
      sourceCode,
      verifiedSourceLabel: false,
    });
  }
  return Object.freeze({
    label: clean(sourceValue) || clean(canonicalValue) || 'Tipo no informado',
    detail: 'Tipo de liquidación sin código de origen',
    sourceCode: null,
    verifiedSourceLabel: false,
  });
}

export const GRH_PAYROLL_TYPE_PRESENTATION = GRH_SOURCE_LABELS;
