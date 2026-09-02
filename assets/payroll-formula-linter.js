const REFERENCE_FAMILIES = new Set(['R', 'N', 'I', 'A', 'L', 'U']);

export const DEFAULT_FORMULA_LIMITS = Object.freeze({
  maxLength: 4096,
  maxTokens: 512,
  maxDepth: 32,
  maxReferences: 256,
  maxCatalogEntries: 250,
  maxCatalogTextLength: 65536,
});

class FormulaSyntaxError extends Error {
  constructor(code, message, position = 0) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.code = code;
    this.position = position;
  }
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, fallback) : fallback;
}

function normalizeLimits(limits = {}) {
  return {
    maxLength: positiveInteger(limits.maxLength, DEFAULT_FORMULA_LIMITS.maxLength),
    maxTokens: positiveInteger(limits.maxTokens, DEFAULT_FORMULA_LIMITS.maxTokens),
    maxDepth: positiveInteger(limits.maxDepth, DEFAULT_FORMULA_LIMITS.maxDepth),
    maxReferences: positiveInteger(limits.maxReferences, DEFAULT_FORMULA_LIMITS.maxReferences),
    maxCatalogEntries: positiveInteger(limits.maxCatalogEntries, DEFAULT_FORMULA_LIMITS.maxCatalogEntries),
    maxCatalogTextLength: positiveInteger(limits.maxCatalogTextLength, DEFAULT_FORMULA_LIMITS.maxCatalogTextLength),
  };
}

function diagnostic(severity, code, message, position = null, reference = null) {
  return { severity, code, message, position, reference };
}

function tokenize(source, limits) {
  if (typeof source !== 'string') {
    throw new FormulaSyntaxError('FORMULA_TYPE_INVALID', 'La fórmula debe ser texto.', 0);
  }
  if (source.length > limits.maxLength) {
    throw new FormulaSyntaxError(
      'FORMULA_TOO_LONG',
      `La fórmula supera el límite de ${limits.maxLength} caracteres.`,
      limits.maxLength,
    );
  }

  const tokens = [];
  let index = 0;
  const push = (type, value, start, end = index) => {
    if (tokens.length >= limits.maxTokens) {
      throw new FormulaSyntaxError(
        'TOKEN_LIMIT_EXCEEDED',
        `La fórmula supera el límite de ${limits.maxTokens} tokens.`,
        start,
      );
    }
    tokens.push({ type, value, start, end });
  };

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const start = index;
    if (/\d/.test(char)) {
      index += 1;
      while (index < source.length && /\d/.test(source[index])) index += 1;
      if (source[index] === '.') {
        index += 1;
        if (!/\d/.test(source[index] || '')) {
          throw new FormulaSyntaxError('NUMBER_INVALID', 'El decimal debe incluir dígitos después del punto.', start);
        }
        while (index < source.length && /\d/.test(source[index])) index += 1;
      }
      push('number', source.slice(start, index), start, index);
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      index += 1;
      while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1;
      const word = source.slice(start, index).toUpperCase();
      if (['AND', 'OR', 'NOT'].includes(word)) {
        push('operator', word, start, index);
        continue;
      }
      if (!REFERENCE_FAMILIES.has(word) || source[index] !== '[') {
        throw new FormulaSyntaxError(
          'IDENTIFIER_NOT_ALLOWED',
          `Identificador no permitido: ${source.slice(start, index)}. Usá referencias R, N, I, A, L o U con corchetes.`,
          start,
        );
      }
      index += 1;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const codeStart = index;
      while (index < source.length && /[A-Za-z0-9_.-]/.test(source[index])) index += 1;
      const code = source.slice(codeStart, index);
      if (!code || code.length > 32) {
        throw new FormulaSyntaxError(
          'REFERENCE_CODE_INVALID',
          'La referencia debe contener entre 1 y 32 caracteres alfanuméricos, punto, guion o guion bajo.',
          codeStart,
        );
      }
      while (index < source.length && /\s/.test(source[index])) index += 1;
      if (source[index] !== ']') {
        throw new FormulaSyntaxError('REFERENCE_UNCLOSED', 'Falta cerrar la referencia con ].', start);
      }
      index += 1;
      push('reference', { family: word, code, reference: `${word}[${code}]` }, start, index);
      continue;
    }

    const pair = source.slice(index, index + 2);
    if (['<=', '>=', '!=', '==', '&&', '||'].includes(pair)) {
      index += 2;
      push('operator', pair, start, index);
      continue;
    }
    if ('+-*/%^<>=!()'.includes(char)) {
      index += 1;
      push(char === '(' || char === ')' ? 'punctuation' : 'operator', char, start, index);
      continue;
    }
    throw new FormulaSyntaxError('CHARACTER_NOT_ALLOWED', `Carácter no permitido: ${char}.`, start);
  }

  tokens.push({ type: 'eof', value: '', start: source.length, end: source.length });
  return tokens;
}

function parseTokens(tokens, limits) {
  let cursor = 0;
  let groupDepth = 0;
  const current = () => tokens[cursor];
  const matches = (...values) => values.includes(current().value);
  const advance = () => tokens[cursor++];
  const fail = (code, message, token = current()) => {
    throw new FormulaSyntaxError(code, message, token.start);
  };
  const withDepth = (node, depth) => {
    if (depth > limits.maxDepth) {
      throw new FormulaSyntaxError(
        'DEPTH_LIMIT_EXCEEDED',
        `La fórmula supera la profundidad máxima de ${limits.maxDepth}.`,
        node.start,
      );
    }
    return Object.assign(node, { _depth: depth });
  };
  const binary = (left, operator, right) => withDepth({
    type: 'BinaryExpression', operator, left, right, start: left.start, end: right.end,
  }, Math.max(left._depth, right._depth) + 1);

  function parsePrimary() {
    const token = current();
    if (token.type === 'number') {
      advance();
      const value = Number(token.value);
      if (!Number.isFinite(value)) {
        throw new FormulaSyntaxError(
          'NUMBER_OUT_OF_RANGE',
          'La constante numérica está fuera del rango seguro del analizador.',
          token.start,
        );
      }
      return withDepth({ type: 'NumericLiteral', raw: token.value, value, start: token.start, end: token.end }, 1);
    }
    if (token.type === 'reference') {
      advance();
      return withDepth({ type: 'Reference', ...token.value, start: token.start, end: token.end }, 1);
    }
    if (token.value === '(') {
      groupDepth += 1;
      if (groupDepth > limits.maxDepth) fail('DEPTH_LIMIT_EXCEEDED', `La fórmula supera la profundidad máxima de ${limits.maxDepth}.`, token);
      advance();
      const expression = parseOr();
      if (!matches(')')) fail('PARENTHESIS_UNCLOSED', 'Falta cerrar el paréntesis.', token);
      const close = advance();
      groupDepth -= 1;
      expression.start = token.start;
      expression.end = close.end;
      return expression;
    }
    fail('OPERAND_EXPECTED', 'Se esperaba una referencia, una constante o un paréntesis.', token);
  }

  function parseUnary() {
    if (matches('+', '-', '!', 'NOT')) {
      const operator = advance();
      const argument = parseUnary();
      return withDepth({
        type: 'UnaryExpression', operator: operator.value, argument, start: operator.start, end: argument.end,
      }, argument._depth + 1);
    }
    return parsePrimary();
  }

  function parsePower() {
    const left = parseUnary();
    if (matches('^')) {
      const operator = advance().value;
      return binary(left, operator, parsePower());
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parsePower();
    while (matches('*', '/', '%')) {
      const operator = advance().value;
      left = binary(left, operator, parsePower());
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (matches('+', '-')) {
      const operator = advance().value;
      left = binary(left, operator, parseMultiplicative());
    }
    return left;
  }

  function parseRelational() {
    let left = parseAdditive();
    while (matches('<', '<=', '>', '>=')) {
      const operator = advance().value;
      left = binary(left, operator, parseAdditive());
    }
    return left;
  }

  function parseEquality() {
    let left = parseRelational();
    while (matches('=', '==', '!=')) {
      const operator = advance().value;
      left = binary(left, operator, parseRelational());
    }
    return left;
  }

  function parseAnd() {
    let left = parseEquality();
    while (matches('AND', '&&')) {
      const operator = advance().value;
      left = binary(left, operator, parseEquality());
    }
    return left;
  }

  function parseOr() {
    let left = parseAnd();
    while (matches('OR', '||')) {
      const operator = advance().value;
      left = binary(left, operator, parseAnd());
    }
    return left;
  }

  const ast = parseOr();
  if (current().type !== 'eof') fail('TOKEN_UNEXPECTED', `Token inesperado: ${current().value}.`);
  return ast;
}

function publicAst(node) {
  if (!node || typeof node !== 'object') return node;
  const copy = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '_depth') continue;
    copy[key] = value && typeof value === 'object' ? publicAst(value) : value;
  }
  return copy;
}

function walk(node, visit) {
  visit(node);
  if (node.type === 'UnaryExpression') walk(node.argument, visit);
  if (node.type === 'BinaryExpression') {
    walk(node.left, visit);
    walk(node.right, visit);
  }
}

function isLiteralZero(node) {
  if (node.type === 'NumericLiteral') return node.value === 0;
  return node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator) && isLiteralZero(node.argument);
}

function metadataFor(metadata, raw, value) {
  if (metadata instanceof Map) return metadata.get(raw) ?? metadata.get(String(value));
  if (metadata && typeof metadata === 'object') return metadata[raw] ?? metadata[String(value)];
  return undefined;
}

function inspectAst(ast, options, limits) {
  const references = new Map();
  const constants = new Map();
  const diagnostics = [];
  let referenceCount = 0;

  walk(ast, (node) => {
    if (node.type === 'Reference') {
      referenceCount += 1;
      const previous = references.get(node.reference) || {
        family: node.family, code: node.code, reference: node.reference, occurrences: 0, positions: [],
      };
      previous.occurrences += 1;
      previous.positions.push(node.start);
      references.set(node.reference, previous);
    }
    if (node.type === 'NumericLiteral') {
      const key = node.raw;
      const previous = constants.get(key) || {
        raw: node.raw, value: node.value, occurrences: 0, positions: [], metadata: metadataFor(options.constantMetadata, node.raw, node.value) ?? null,
      };
      previous.occurrences += 1;
      previous.positions.push(node.start);
      constants.set(key, previous);
    }
    if (node.type === 'BinaryExpression' && node.operator === '/' && isLiteralZero(node.right)) {
      diagnostics.push(diagnostic('error', 'LITERAL_DIVISION_BY_ZERO', 'La expresión divide por cero literal.', node.right.start));
    }
  });

  if (referenceCount > limits.maxReferences) {
    diagnostics.push(diagnostic(
      'error', 'REFERENCE_LIMIT_EXCEEDED',
      `La fórmula contiene ${referenceCount} referencias y el límite es ${limits.maxReferences}.`,
      ast.start,
    ));
  }
  for (const entry of references.values()) {
    if (entry.occurrences > 1) {
      diagnostics.push(diagnostic(
        'warning', 'DUPLICATE_REFERENCE',
        `${entry.reference} aparece ${entry.occurrences} veces; verificá si la repetición es intencional.`,
        entry.positions[1], entry.reference,
      ));
    }
  }
  for (const entry of constants.values()) {
    if (entry.metadata == null) {
      diagnostics.push(diagnostic(
        'warning', 'CONSTANT_METADATA_MISSING',
        `La constante ${entry.raw} no tiene concepto, unidad ni vigencia documentados.`,
        entry.positions[0],
      ));
    }
  }
  return { dependencies: [...references.values()], constants: [...constants.values()], diagnostics };
}

function normalizeCatalog(catalog, limits) {
  const entries = Array.isArray(catalog)
    ? catalog.map((entry) => [entry?.id, entry?.formula, entry?.constantMetadata])
    : Object.entries(catalog || {}).map(([id, value]) => (
      typeof value === 'string' ? [id, value, undefined] : [id, value?.formula, value?.constantMetadata]
    ));
  if (entries.length > limits.maxCatalogEntries) {
    throw new FormulaSyntaxError(
      'CATALOG_LIMIT_EXCEEDED',
      `El catálogo supera el límite de ${limits.maxCatalogEntries} fórmulas.`,
      0,
    );
  }
  return entries;
}

function canonicalReference(value) {
  const match = /^\s*([RNIALU])\[([A-Za-z0-9_.-]{1,32})\]\s*$/i.exec(String(value ?? ''));
  return match ? `${match[1].toUpperCase()}[${match[2]}]` : null;
}

function findCycles(graph) {
  const state = new Map();
  const stack = [];
  const cycles = [];
  const seen = new Set();

  function recordCycle(target) {
    const start = stack.indexOf(target);
    const cycle = [...stack.slice(start), target];
    const core = cycle.slice(0, -1);
    const rotations = core.map((_, index) => [...core.slice(index), ...core.slice(0, index)].join(' -> '));
    const signature = rotations.sort()[0];
    if (!seen.has(signature)) {
      seen.add(signature);
      cycles.push(cycle);
    }
  }

  function visit(node) {
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (state.get(next) === 1) recordCycle(next);
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const node of graph.keys()) if (!state.has(node)) visit(node);
  return cycles;
}

export function analyzeFormulaCatalog(catalog, options = {}) {
  const limits = normalizeLimits(options.limits);
  const diagnostics = [];
  const formulas = [];
  let entries;
  try {
    entries = normalizeCatalog(catalog, limits);
  } catch (error) {
    diagnostics.push(diagnostic('error', error.code || 'CATALOG_INVALID', error.message, error.position ?? 0));
    return { ok: false, formulas, cycles: [], diagnostics, limits };
  }
  const ids = new Set();
  for (const [rawId] of entries) {
    const id = canonicalReference(rawId);
    if (!id) diagnostics.push(diagnostic('error', 'CATALOG_REFERENCE_INVALID', `Clave de catálogo inválida: ${String(rawId)}.`, 0));
    else if (ids.has(id)) diagnostics.push(diagnostic('error', 'CATALOG_REFERENCE_DUPLICATED', `La referencia ${id} está duplicada en el catálogo.`, 0, id));
    else ids.add(id);
  }

  const graph = new Map([...ids].map((id) => [id, []]));
  const processed = new Set();
  for (const [rawId, formula, entryMetadata] of entries) {
    const id = canonicalReference(rawId);
    if (!id) continue;
    const duplicated = processed.has(id);
    if (!duplicated) processed.add(id);
    const result = analyzeFormula(formula, {
      limits,
      constantMetadata: entryMetadata ?? options.constantMetadata,
    });
    formulas.push({ id, ...result });
    for (const entry of result.diagnostics) {
      diagnostics.push({ ...entry, message: `${id}: ${entry.message}`, reference: id });
    }
    if (result.ast) {
      const resolved = [];
      for (const dependency of result.dependencies) {
        if (ids.has(dependency.reference)) resolved.push(dependency.reference);
        else diagnostics.push(diagnostic(
          'error', 'UNRESOLVED_REFERENCE',
          `${id}: la dependencia ${dependency.reference} no existe en el catálogo revisado.`,
          dependency.positions[0], dependency.reference,
        ));
      }
      if (!duplicated) graph.set(id, resolved);
    }
  }

  const cycles = findCycles(graph);
  for (const cycle of cycles) {
    diagnostics.push(diagnostic(
      'error', 'CATALOG_CYCLE',
      `Dependencia circular: ${cycle.join(' -> ')}.`,
      null, cycle[0],
    ));
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), formulas, cycles, diagnostics, limits };
}

export function parseFormulaCatalogText(source, options = {}) {
  const limits = normalizeLimits(options.limits);
  const diagnostics = [];
  const entries = [];
  if (typeof source !== 'string') {
    return {
      ok: false, entries, limits,
      diagnostics: [diagnostic('error', 'CATALOG_TEXT_TYPE_INVALID', 'El catálogo debe ser texto.', 0)],
    };
  }
  if (source.length > limits.maxCatalogTextLength) {
    return {
      ok: false, entries, limits,
      diagnostics: [diagnostic(
        'error', 'CATALOG_TEXT_TOO_LONG',
        `El catálogo supera el límite de ${limits.maxCatalogTextLength} caracteres.`,
        limits.maxCatalogTextLength,
      )],
    };
  }

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    const separator = raw.indexOf('=');
    const id = separator >= 0 ? canonicalReference(raw.slice(0, separator)) : null;
    const formula = separator >= 0 ? raw.slice(separator + 1).trim() : '';
    if (!id) {
      diagnostics.push(diagnostic(
        'error', 'CATALOG_ASSIGNMENT_INVALID',
        `Línea ${index + 1}: usá una asignación como R[100] = N[200] + 1.`,
        0,
      ));
      continue;
    }
    if (!formula) {
      diagnostics.push(diagnostic(
        'error', 'CATALOG_FORMULA_EMPTY',
        `Línea ${index + 1}: ${id} no tiene una expresión.`,
        separator + 1, id,
      ));
      continue;
    }
    entries.push({ id, formula, line: index + 1 });
  }
  if (!entries.length && !diagnostics.length) {
    diagnostics.push(diagnostic('error', 'CATALOG_EMPTY', 'Ingresá al menos una asignación.', 0));
  }
  if (entries.length > limits.maxCatalogEntries) {
    diagnostics.push(diagnostic(
      'error', 'CATALOG_LIMIT_EXCEEDED',
      `El catálogo supera el límite de ${limits.maxCatalogEntries} fórmulas.`,
      0,
    ));
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), entries, diagnostics, limits };
}

export function analyzeFormulaCatalogText(source, options = {}) {
  const parsed = parseFormulaCatalogText(source, options);
  const analysis = analyzeFormulaCatalog(parsed.entries, options);
  const diagnostics = [...parsed.diagnostics, ...analysis.diagnostics];
  return {
    ...analysis,
    ok: !diagnostics.some((item) => item.severity === 'error'),
    entries: parsed.entries,
    diagnostics,
  };
}

export function analyzeFormula(source, options = {}) {
  const limits = normalizeLimits(options.limits);
  const diagnostics = [];
  let tokens;
  let ast;
  try {
    tokens = tokenize(source, limits);
    if (tokens.length === 1) throw new FormulaSyntaxError('FORMULA_EMPTY', 'Ingresá una fórmula para analizar.', 0);
    ast = parseTokens(tokens, limits);
  } catch (error) {
    diagnostics.push(diagnostic(
      'error', error.code || 'FORMULA_INVALID',
      error instanceof Error ? error.message : 'La fórmula no se pudo analizar.',
      Number.isInteger(error?.position) ? error.position : 0,
    ));
    return { ok: false, ast: null, dependencies: [], constants: [], diagnostics, limits, tokenCount: tokens ? tokens.length - 1 : 0 };
  }

  const inspection = inspectAst(ast, options, limits);
  diagnostics.push(...inspection.diagnostics);
  let catalog = null;
  if (options.catalog != null) {
    catalog = analyzeFormulaCatalog(options.catalog, { limits, constantMetadata: options.constantMetadata });
    diagnostics.push(...catalog.diagnostics);
  }
  return {
    ok: !diagnostics.some((item) => item.severity === 'error'),
    ast: publicAst(ast),
    dependencies: inspection.dependencies,
    constants: inspection.constants,
    diagnostics,
    limits,
    tokenCount: tokens.length - 1,
    ...(catalog ? { catalog } : {}),
  };
}

function appendTextItem(host, text, className = '') {
  const item = document.createElement('li');
  if (className) item.className = className;
  item.textContent = text;
  host.appendChild(item);
}

export function mountPayrollFormulaLab(root = document) {
  const host = root.querySelector('[data-payroll-formula-lab]');
  if (!host || host.dataset.mounted === 'true') return false;
  const form = host.querySelector('[data-formula-form]');
  const input = host.querySelector('[data-formula-input]');
  const status = host.querySelector('[data-formula-status]');
  const dependencies = host.querySelector('[data-formula-dependencies]');
  const constantsHost = host.querySelector('[data-formula-constants]');
  const diagnosticsHost = host.querySelector('[data-formula-diagnostics]');
  const structure = host.querySelector('[data-formula-structure]');
  const catalogForm = host.querySelector('[data-catalog-form]');
  const catalogInput = host.querySelector('[data-catalog-input]');
  const catalogStatus = host.querySelector('[data-catalog-status]');
  const catalogGraph = host.querySelector('[data-catalog-graph]');
  const catalogDiagnostics = host.querySelector('[data-catalog-diagnostics]');
  if (!form || !input || !status || !dependencies || !constantsHost || !diagnosticsHost || !structure
      || !catalogForm || !catalogInput || !catalogStatus || !catalogGraph || !catalogDiagnostics) return false;

  function render() {
    const result = analyzeFormula(input.value);
    dependencies.replaceChildren();
    constantsHost.replaceChildren();
    diagnosticsHost.replaceChildren();
    structure.textContent = result.ast ? JSON.stringify(result.ast, null, 2) : 'La estructura no está disponible hasta corregir la sintaxis.';

    if (result.dependencies.length) {
      for (const entry of result.dependencies) {
        appendTextItem(
          dependencies,
          `${entry.reference} · ${entry.occurrences} ${entry.occurrences === 1 ? 'uso' : 'usos'}`,
        );
      }
    } else {
      appendTextItem(dependencies, 'Sin dependencias reconocidas.', 'formula-lab-empty');
    }

    if (result.constants.length) {
      for (const entry of result.constants) {
        const metadataState = entry.metadata == null ? 'metadatos pendientes' : 'metadatos informados';
        appendTextItem(
          constantsHost,
          `${entry.raw} · ${entry.occurrences} ${entry.occurrences === 1 ? 'uso' : 'usos'} · ${metadataState}`,
          entry.metadata == null ? 'warning' : 'ok',
        );
      }
    } else {
      appendTextItem(constantsHost, 'Sin constantes literales.', 'formula-lab-empty');
    }

    if (result.diagnostics.length) {
      for (const entry of result.diagnostics) {
        const prefix = entry.severity === 'error' ? 'Error' : 'Revisión';
        appendTextItem(
          diagnosticsHost,
          `${prefix} · ${entry.message}${Number.isInteger(entry.position) ? ` (posición ${entry.position + 1})` : ''}`,
          entry.severity,
        );
      }
    } else {
      appendTextItem(diagnosticsHost, 'Sin observaciones estructurales.', 'ok');
    }

    const errorCount = result.diagnostics.filter((entry) => entry.severity === 'error').length;
    const warningCount = result.diagnostics.length - errorCount;
    status.dataset.state = errorCount ? 'error' : warningCount ? 'warning' : 'ok';
    status.textContent = errorCount
      ? `Fórmula inválida · ${errorCount} ${errorCount === 1 ? 'error' : 'errores'}.`
      : `Sintaxis válida para este analizador · ${result.dependencies.length} referencias · ${result.constants.length} constantes · ${warningCount} ${warningCount === 1 ? 'revisión' : 'revisiones'}.`;
  }

  function renderCatalog() {
    const result = analyzeFormulaCatalogText(catalogInput.value);
    catalogGraph.replaceChildren();
    catalogDiagnostics.replaceChildren();

    if (result.formulas.length) {
      for (const entry of result.formulas) {
        const dependencyLabels = entry.dependencies.map((dependency) => dependency.reference);
        appendTextItem(
          catalogGraph,
          `${entry.id} → ${dependencyLabels.length ? dependencyLabels.join(', ') : 'sin dependencias'}`,
          entry.ok ? '' : 'error',
        );
      }
    } else {
      appendTextItem(catalogGraph, 'Sin fórmulas analizables.', 'formula-lab-empty');
    }

    if (result.diagnostics.length) {
      for (const entry of result.diagnostics) {
        const prefix = entry.severity === 'error' ? 'Error' : 'Revisión';
        appendTextItem(catalogDiagnostics, `${prefix} · ${entry.message}`, entry.severity);
      }
    } else {
      appendTextItem(catalogDiagnostics, 'Catálogo cerrado sin observaciones estructurales.', 'ok');
    }

    const errorCount = result.diagnostics.filter((entry) => entry.severity === 'error').length;
    const warningCount = result.diagnostics.length - errorCount;
    const unresolvedCount = result.diagnostics.filter((entry) => entry.code === 'UNRESOLVED_REFERENCE').length;
    const duplicateCount = result.diagnostics.filter((entry) => entry.code === 'CATALOG_REFERENCE_DUPLICATED').length;
    catalogStatus.dataset.state = errorCount ? 'error' : warningCount ? 'warning' : 'ok';
    catalogStatus.textContent = errorCount
      ? `Catálogo con pendientes · ${result.formulas.length} fórmulas · ${result.cycles.length} ciclos · ${unresolvedCount} referencias inexistentes · ${duplicateCount} duplicados.`
      : `Catálogo estructuralmente válido · ${result.formulas.length} fórmulas · ${warningCount} ${warningCount === 1 ? 'revisión' : 'revisiones'}.`;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
  catalogForm.addEventListener('submit', (event) => {
    event.preventDefault();
    renderCatalog();
  });
  host.dataset.mounted = 'true';
  render();
  renderCatalog();
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountPayrollFormulaLab(), { once: true });
  else mountPayrollFormulaLab();
}
