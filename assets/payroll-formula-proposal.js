import { analyzeFormula } from './payroll-formula-linter.js';

export const PAYROLL_FORMULA_PROPOSAL_VERSION = 'payroll-formula-proposal.v1';

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const FORMULA_REFERENCE = /^[RNAILU]\[[0-9]{1,9}\]$/;
const ALLOWED_JURISDICTIONS = new Set(['42', '55']);
const ALLOWED_PAYROLL_TYPES = new Set(['M', 'P', 'S', 'V', 'F', 'O']);
const ALLOWED_ROUNDING = new Set(['nearest_cent', 'truncate_cent']);
const ROUNDING_LABELS = Object.freeze({
  nearest_cent: 'centavo más próximo',
  truncate_cent: 'truncado a centavos',
});
const MAX_INSTRUCTION_LENGTH = 280;
const MAX_LABEL_LENGTH = 100;
const BASIS_POINTS_DENOMINATOR = 10_000n;

export class PayrollFormulaProposalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollFormulaProposalError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollFormulaProposalError(code, message);
}

function cleanText(value, label, maximum = MAX_LABEL_LENGTH) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text || text.length > maximum || /[<>\u0000-\u001f\u007f]/.test(text)) {
    fail('FORMULA_PROPOSAL_SCOPE_INVALID', `${label} no está informado o no tiene un formato admitido.`);
  }
  return text;
}

function foldText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function decimalToBasisPoints(raw) {
  const normalized = raw.replace(',', '.');
  const match = /^(0|[1-9][0-9]{0,2})(?:\.([0-9]{1,2}))?$/.exec(normalized);
  if (!match) fail('FORMULA_PROPOSAL_PERCENT_INVALID', 'El porcentaje debe tener como máximo dos decimales.');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}

export function interpretClassScaleInstruction(value) {
  const instruction = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!instruction) fail('FORMULA_PROPOSAL_INSTRUCTION_REQUIRED', 'Escribí el cambio que querés preparar.');
  if (instruction.length > MAX_INSTRUCTION_LENGTH || /[<>\u0000-\u001f\u007f]/.test(instruction)) {
    fail('FORMULA_PROPOSAL_INSTRUCTION_INVALID', 'La instrucción contiene caracteres o una longitud no admitidos.');
  }

  const folded = foldText(instruction);
  const increases = /\b(?:aumentar|aumenta|incrementar|incrementa|subir|sube|sumar|suma|agregar|agrega)\b/.test(folded);
  const decreases = /\b(?:disminuir|disminuye|reducir|reduce|bajar|baja|restar|resta)\b/.test(folded);
  if (increases === decreases) {
    fail('FORMULA_PROPOSAL_OPERATION_AMBIGUOUS', 'Indicá claramente si querés aumentar o disminuir la escala.');
  }

  if (!/\b(?:escala(?: salarial)?|asignacion (?:de la |por )?clase)\b/.test(folded)) {
    fail('FORMULA_PROPOSAL_TARGET_REQUIRED', 'El cambio debe identificar la escala salarial o la asignación de la clase.');
  }
  if (/\b(?:bruto|neto|liquido|haberes? liquidos?|masa salarial|todos? los conceptos|totalidad(?: de (?:los )?conceptos)?|total(?: general)?)\b/.test(folded)) {
    fail(
      'FORMULA_PROPOSAL_TARGET_FORBIDDEN',
      'El porcentaje de escala no se aplica directamente al bruto, al neto, al total ni a todos los conceptos.',
    );
  }

  if (/\bal\s+[0-9]{1,3}(?:[.,][0-9]{1,2})?\s*(?:%|por ciento\b)/.test(folded)) {
    fail(
      'FORMULA_PROPOSAL_PERCENT_AMBIGUOUS',
      '“Llevar al” un porcentaje puede significar un valor final distinto del aumento. Escribí “aumentar” o “disminuir” seguido del porcentaje del cambio.',
    );
  }

  const percentageTokens = [...folded.matchAll(/([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*(?:%|por ciento\b)/g)];
  if (percentageTokens.length !== 1) {
    fail(
      percentageTokens.length ? 'FORMULA_PROPOSAL_PERCENT_AMBIGUOUS' : 'FORMULA_PROPOSAL_PERCENT_REQUIRED',
      percentageTokens.length ? 'Indicá un solo porcentaje por propuesta.' : 'Indicá el porcentaje del cambio.',
    );
  }
  const percentageBasisPoints = decimalToBasisPoints(percentageTokens[0][1]);
  if (percentageBasisPoints < 1 || percentageBasisPoints > 30_000) {
    fail('FORMULA_PROPOSAL_PERCENT_OUT_OF_RANGE', 'El porcentaje debe ser mayor que 0 y no superar 300%.');
  }
  if (decreases && percentageBasisPoints >= 10_000) {
    fail('FORMULA_PROPOSAL_PERCENT_OUT_OF_RANGE', 'Una disminución debe ser menor que 100%.');
  }

  return Object.freeze({
    instruction,
    target: 'class_assignment',
    targetLabel: 'Asignación de la clase',
    operation: increases ? 'increase_percentage' : 'decrease_percentage',
    percentageBasisPoints,
  });
}

function parseAmountToCents(value) {
  let raw = String(value ?? '').trim().replace(/\s+/g, '').replace(/^(?:ars|\$)/i, '');
  if (!raw || raw.startsWith('-')) {
    fail('FORMULA_PROPOSAL_SAMPLE_INVALID', 'Ingresá una asignación de clase de prueba igual o mayor que cero.');
  }
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let decimalSeparator = '';
  if (lastComma >= 0 && lastDot >= 0) decimalSeparator = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) decimalSeparator = ',';
  else if (lastDot >= 0 && !/^\d{1,3}(?:\.\d{3})+$/.test(raw)) decimalSeparator = '.';

  if (decimalSeparator) {
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    const split = raw.split(decimalSeparator);
    const integerPattern = groupingSeparator === '.'
      ? /^\d{1,3}(?:\.\d{3})*$/
      : /^\d{1,3}(?:,\d{3})*$/;
    const integerValid = split.length === 2 && (
      split[0].includes(groupingSeparator)
        ? integerPattern.test(split[0])
        : /^\d{1,15}$/.test(split[0])
    );
    if (!integerValid || !/^\d{1,2}$/.test(split[1])) {
      fail('FORMULA_PROPOSAL_SAMPLE_INVALID', 'El monto de prueba admite hasta dos decimales.');
    }
    const integerDigits = split[0].replaceAll(groupingSeparator, '');
    return BigInt(integerDigits) * 100n + BigInt(split[1].padEnd(2, '0'));
  }

  raw = raw.replace(/[.,]/g, '');
  if (!/^\d{1,15}$/.test(raw)) {
    fail('FORMULA_PROPOSAL_SAMPLE_INVALID', 'El monto de prueba no tiene un formato admitido.');
  }
  return BigInt(raw) * 100n;
}

function applyFactor(cents, numerator, rounding) {
  const product = cents * numerator;
  if (rounding === 'truncate_cent') return product / BASIS_POINTS_DENOMINATOR;
  return (product + BASIS_POINTS_DENOMINATOR / 2n) / BASIS_POINTS_DENOMINATOR;
}

function factorLiteral(numerator) {
  const whole = numerator / BASIS_POINTS_DENOMINATOR;
  const fraction = String(numerator % BASIS_POINTS_DENOMINATOR).padStart(4, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function normalizeReference(value) {
  const reference = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (reference && !FORMULA_REFERENCE.test(reference)) {
    fail(
      'FORMULA_PROPOSAL_REFERENCE_INVALID',
      'La referencia homologada debe usar la notación R, N, I, A, L o U seguida de su código entre corchetes.',
    );
  }
  return reference;
}

export function createPayrollFormulaProposal(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('FORMULA_PROPOSAL_INPUT_INVALID', 'La propuesta debe recibirse como un formulario estructurado.');
  }
  const interpreted = interpretClassScaleInstruction(input.instruction);
  const jurisdiction = String(input.jurisdiction ?? '').trim();
  if (!ALLOWED_JURISDICTIONS.has(jurisdiction)) {
    fail('FORMULA_PROPOSAL_JURISDICTION_REQUIRED', 'Elegí la jurisdicción 42 o 55.');
  }
  const agreement = cleanText(input.agreement, 'El convenio o régimen');
  const validFrom = String(input.validFrom ?? '').trim();
  if (!PERIOD.test(validFrom)) {
    fail('FORMULA_PROPOSAL_VALIDITY_REQUIRED', 'Elegí el mes desde el que debería regir la propuesta.');
  }
  const payrollType = String(input.payrollType ?? '').trim().toUpperCase();
  if (!ALLOWED_PAYROLL_TYPES.has(payrollType)) {
    fail('FORMULA_PROPOSAL_PAYROLL_TYPE_REQUIRED', 'Elegí un tipo de liquidación para evaluar la propuesta.');
  }
  const rounding = String(input.rounding ?? '').trim();
  if (!ALLOWED_ROUNDING.has(rounding)) {
    fail('FORMULA_PROPOSAL_ROUNDING_REQUIRED', 'Elegí cómo redondear esta simulación.');
  }
  const baseReference = normalizeReference(input.baseReference);
  const scaleVersion = typeof input.scaleVersion === 'string'
    ? input.scaleVersion.trim().replace(/\s+/g, ' ')
    : '';
  if (scaleVersion && (scaleVersion.length > 80 || /[<>\u0000-\u001f\u007f]/.test(scaleVersion))) {
    fail('FORMULA_PROPOSAL_SCALE_VERSION_INVALID', 'La versión de escala no tiene un formato admitido.');
  }
  const beforeCents = parseAmountToCents(input.sampleAmount);
  const change = BigInt(interpreted.percentageBasisPoints);
  const factorNumerator = interpreted.operation === 'increase_percentage'
    ? BASIS_POINTS_DENOMINATOR + change
    : BASIS_POINTS_DENOMINATOR - change;
  const afterCents = applyFactor(beforeCents, factorNumerator, rounding);
  const deltaCents = afterCents - beforeCents;
  const factor = factorLiteral(factorNumerator);
  const expression = baseReference ? `${baseReference} * ${factor}` : '';
  const analysis = expression ? analyzeFormula(expression, {
    constantMetadata: {
      [factor]: {
        concept: 'factor porcentual propuesto sobre asignación de clase',
        unit: 'ratio',
        validFrom,
      },
    },
  }) : null;
  if (analysis && !analysis.ok) {
    fail('FORMULA_PROPOSAL_GENERATED_FORMULA_INVALID', 'La expresión propuesta no superó el analizador estructural.');
  }

  const blockers = [];
  if (!baseReference) {
    blockers.push({
      code: 'CLASS_ASSIGNMENT_REFERENCE_UNHOMOLOGATED',
      message: 'Falta vincular “Asignación de la clase” con su referencia vigente de GRH.',
    });
  } else {
    blockers.push({
      code: 'CLASS_ASSIGNMENT_REFERENCE_UNVERIFIED',
      message: `La referencia ${baseReference} fue declarada para este borrador, pero todavía no está verificada contra el catálogo certificado.`,
    });
  }
  if (!scaleVersion) {
    blockers.push({
      code: 'CLASS_SCALE_VERSION_REQUIRED',
      message: 'Falta identificar la versión vigente de la escala que se está modificando.',
    });
  } else {
    blockers.push({
      code: 'CLASS_SCALE_VERSION_UNVERIFIED',
      message: `La versión “${scaleVersion}” fue declarada, pero todavía no está verificada contra la escala certificada.`,
    });
  }
  blockers.push({
    code: 'APPROVED_CASES_REQUIRED',
    message: 'Antes de publicar deben compararse casos aprobados y conciliar el resultado centavo a centavo con GRH.',
  });

  return Object.freeze({
    version: PAYROLL_FORMULA_PROPOSAL_VERSION,
    status: baseReference && scaleVersion ? 'draft_for_structural_review' : 'scope_pending',
    publicationReady: false,
    instruction: interpreted.instruction,
    target: Object.freeze({
      key: interpreted.target,
      label: interpreted.targetLabel,
      baseReference: baseReference || null,
      scaleVersion: scaleVersion || null,
      referenceVerification: 'unverified',
    }),
    operation: Object.freeze({
      kind: interpreted.operation,
      percentageBasisPoints: interpreted.percentageBasisPoints,
      factorNumerator: Number(factorNumerator),
      factorDenominator: Number(BASIS_POINTS_DENOMINATOR),
    }),
    scope: Object.freeze({ jurisdiction, agreement, validFrom, payrollTypes: Object.freeze([payrollType]) }),
    rounding,
    expression: expression || null,
    analysis,
    simulation: Object.freeze({
      beforeCents: beforeCents.toString(),
      deltaCents: deltaCents.toString(),
      afterCents: afterCents.toString(),
      illustrativeOnly: true,
    }),
    propagation: Object.freeze({
      directTarget: 'class_assignment',
      independentConceptsChanged: false,
      dependentConceptsPolicy: 'recalculate_with_each_versioned_formula',
    }),
    blockers: Object.freeze(blockers.map((entry) => Object.freeze(entry))),
  });
}

function money(cents) {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  const grouped = new Intl.NumberFormat('es-AR', {
    useGrouping: true, maximumFractionDigits: 0,
  }).format(whole);
  return `${negative ? '-' : ''}$ ${grouped},${fraction}`;
}

function appendItem(host, text, className = '') {
  const item = document.createElement('li');
  if (className) item.className = className;
  item.textContent = text;
  host.appendChild(item);
}

export function mountPayrollFormulaProposal(root = document) {
  const host = root.querySelector('[data-payroll-formula-proposal]');
  if (!host || host.dataset.mounted === 'true') return false;
  const form = host.querySelector('[data-formula-proposal-form]');
  const status = host.querySelector('[data-formula-proposal-status]');
  const resultHost = host.querySelector('[data-formula-proposal-result]');
  const summary = host.querySelector('[data-formula-proposal-summary]');
  const before = host.querySelector('[data-formula-proposal-before]');
  const delta = host.querySelector('[data-formula-proposal-delta]');
  const after = host.querySelector('[data-formula-proposal-after]');
  const scope = host.querySelector('[data-formula-proposal-scope]');
  const expression = host.querySelector('[data-formula-proposal-expression]');
  const blockers = host.querySelector('[data-formula-proposal-blockers]');
  const sendToLinter = host.querySelector('[data-formula-proposal-send-linter]');
  if (!form || !status || !resultHost || !summary || !before || !delta || !after
      || !scope || !expression || !blockers || !sendToLinter) return false;

  let latest = null;
  function render(proposal) {
    latest = proposal;
    const direction = proposal.operation.kind === 'increase_percentage' ? 'aumento' : 'disminución';
    const percentage = (proposal.operation.percentageBasisPoints / 100).toLocaleString('es-AR', {
      minimumFractionDigits: 0, maximumFractionDigits: 2,
    });
    summary.textContent = `${percentage}% de ${direction} aplicado únicamente sobre la asignación de la clase.`;
    before.textContent = money(proposal.simulation.beforeCents);
    delta.textContent = money(proposal.simulation.deltaCents);
    after.textContent = money(proposal.simulation.afterCents);
    scope.textContent = `Jurisdicción ${proposal.scope.jurisdiction} · ${proposal.scope.agreement} · ${proposal.scope.validFrom} · tipo ${proposal.scope.payrollTypes[0]}`;
    expression.textContent = proposal.expression || 'Pendiente: falta homologar la referencia de asignación de la clase.';
    blockers.replaceChildren();
    proposal.blockers.forEach((entry) => appendItem(
      blockers,
      entry.message,
      entry.code === 'APPROVED_CASES_REQUIRED' || entry.code.endsWith('_UNVERIFIED') ? 'warning' : 'error',
    ));
    sendToLinter.disabled = !proposal.expression;
    resultHost.hidden = false;
    status.dataset.state = proposal.status === 'draft_for_structural_review' ? 'warning' : 'error';
    status.textContent = proposal.status === 'draft_for_structural_review'
      ? 'Borrador preparado para control estructural. La referencia y la versión declaradas aún deben verificarse contra el catálogo certificado; no está aprobado ni publicado.'
      : 'La intención se entendió y la simulación está lista, pero faltan datos de homologación.';
  }

  function showError(error) {
    latest = null;
    resultHost.hidden = true;
    sendToLinter.disabled = true;
    status.dataset.state = 'error';
    status.textContent = error instanceof PayrollFormulaProposalError
      ? error.message
      : 'No se pudo preparar la propuesta.';
  }

  function invalidatePreparedProposal() {
    if (!latest) return;
    latest = null;
    resultHost.hidden = true;
    sendToLinter.disabled = true;
    status.dataset.state = 'warning';
    status.textContent = 'Cambiaste datos de la propuesta. Volvé a prepararla para actualizar el resultado.';
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    try {
      render(createPayrollFormulaProposal({
        instruction: fields.get('instruction'),
        jurisdiction: fields.get('jurisdiction'),
        agreement: fields.get('agreement'),
        validFrom: fields.get('validFrom'),
        payrollType: fields.get('payrollType'),
        rounding: fields.get('rounding'),
        sampleAmount: fields.get('sampleAmount'),
        baseReference: fields.get('baseReference'),
        scaleVersion: fields.get('scaleVersion'),
      }));
    } catch (error) {
      showError(error);
    }
  });
  form.addEventListener('input', invalidatePreparedProposal);
  form.addEventListener('change', invalidatePreparedProposal);

  sendToLinter.addEventListener('click', () => {
    if (!latest?.expression) return;
    const technicalInput = root.querySelector('[data-formula-input]');
    const technicalForm = root.querySelector('[data-formula-form]');
    const technicalDetails = root.querySelector('[data-formula-technical-details]');
    if (!technicalInput || !technicalForm) return;
    if (technicalDetails) technicalDetails.open = true;
    technicalInput.value = latest.expression;
    const factor = factorLiteral(BigInt(latest.operation.factorNumerator));
    const lab = root.querySelector('[data-payroll-formula-lab]');
    lab?.dispatchEvent(new CustomEvent('payroll-formula:analyze-proposal', {
      detail: {
        constantMetadata: {
          [factor]: {
            concept: 'factor porcentual propuesto sobre asignación de clase',
            unit: 'ratio',
            validFrom: latest.scope.validFrom,
          },
        },
        contextLabel: `Borrador · Jurisdicción ${latest.scope.jurisdiction} · ${latest.scope.agreement} · vigencia ${latest.scope.validFrom} · liquidación ${latest.scope.payrollTypes[0]} · redondeo ${ROUNDING_LABELS[latest.rounding]} · escala ${latest.target.scaleVersion}. Referencia y versión todavía no verificadas contra el catálogo certificado.`,
      },
    }));
    technicalInput.focus();
  });

  host.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountPayrollFormulaProposal(), { once: true });
  } else {
    mountPayrollFormulaProposal();
  }
}
