import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  analyzeFormula,
  analyzeFormulaCatalog,
  DEFAULT_FORMULA_LIMITS,
} from '../assets/payroll-formula-linter.js';

test('analiza la notación funcional permitida sin evaluar importes', () => {
  const result = analyzeFormula(
    '(R[100] + N[200] - I[300]) >= A[010] AND U[900] != L[001]',
  );

  assert.equal(result.ok, true);
  assert.equal(result.ast.type, 'BinaryExpression');
  assert.equal(result.ast.operator, 'AND');
  assert.deepEqual(
    result.dependencies.map(({ reference }) => reference),
    ['R[100]', 'N[200]', 'I[300]', 'A[010]', 'U[900]', 'L[001]'],
  );
  assert.deepEqual(result.constants, []);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.tokenCount, 13);
});

test('respeta precedencia aritmética, relacional y lógica en un AST serializable', () => {
  const result = analyzeFormula('R[1] + N[2] * I[3] = A[4] OR NOT U[5]');

  assert.equal(result.ok, true);
  assert.equal(result.ast.operator, 'OR');
  assert.equal(result.ast.left.operator, '=');
  assert.equal(result.ast.left.left.operator, '+');
  assert.equal(result.ast.left.left.right.operator, '*');
  assert.equal(result.ast.right.type, 'UnaryExpression');
  assert.equal(result.ast.right.operator, 'NOT');
  assert.doesNotThrow(() => JSON.stringify(result.ast));
});

test('rechaza identificadores y caracteres fuera del lenguaje cerrado', () => {
  const identifier = analyzeFormula('SALARIO + R[1]');
  assert.equal(identifier.ok, false);
  assert.equal(identifier.diagnostics[0].code, 'IDENTIFIER_NOT_ALLOWED');

  const character = analyzeFormula('R[1]; N[2]');
  assert.equal(character.ok, false);
  assert.equal(character.diagnostics[0].code, 'CHARACTER_NOT_ALLOWED');

  const unclosed = analyzeFormula('(R[1] + N[2]');
  assert.equal(unclosed.ok, false);
  assert.equal(unclosed.diagnostics[0].code, 'PARENTHESIS_UNCLOSED');
});

test('advierte referencias repetidas y constantes sin metadato', () => {
  const result = analyzeFormula('R[10] + R[10] > 1');

  assert.equal(result.ok, true);
  assert.equal(result.dependencies[0].occurrences, 2);
  assert.ok(result.diagnostics.some(({ code }) => code === 'DUPLICATE_REFERENCE'));
  assert.ok(result.diagnostics.some(({ code }) => code === 'CONSTANT_METADATA_MISSING'));
});

test('acepta metadato explícito de constante y nunca lo convierte en cálculo', () => {
  const result = analyzeFormula('R[10] * 0.25', {
    constantMetadata: {
      '0.25': { concept: 'coeficiente sintético', unit: 'ratio', validFrom: '2026-01' },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.constants[0].metadata, {
    concept: 'coeficiente sintético', unit: 'ratio', validFrom: '2026-01',
  });
  assert.ok(!result.diagnostics.some(({ code }) => code === 'CONSTANT_METADATA_MISSING'));
  assert.ok(!Object.hasOwn(result, 'value'));
});

test('bloquea división por cero literal aun con signo o paréntesis', () => {
  for (const formula of ['R[1] / 0', 'R[1] / -0', 'R[1] / (0)']) {
    const result = analyzeFormula(formula, { constantMetadata: { 0: { unit: 'number' } } });
    assert.equal(result.ok, false, formula);
    assert.ok(result.diagnostics.some(({ code }) => code === 'LITERAL_DIVISION_BY_ZERO'), formula);
  }
  assert.equal(analyzeFormula('R[1] / N[0]').ok, true);
});

test('aplica límites de longitud, tokens, profundidad y referencias', () => {
  const tooLong = analyzeFormula('R[1234]', { limits: { maxLength: 4 } });
  assert.equal(tooLong.diagnostics[0].code, 'FORMULA_TOO_LONG');

  const tooManyTokens = analyzeFormula('R[1] + R[2] + R[3]', { limits: { maxTokens: 3 } });
  assert.equal(tooManyTokens.diagnostics[0].code, 'TOKEN_LIMIT_EXCEEDED');

  const tooDeep = analyzeFormula('((((R[1]))))', { limits: { maxDepth: 3 } });
  assert.equal(tooDeep.diagnostics[0].code, 'DEPTH_LIMIT_EXCEEDED');

  const tooManyReferences = analyzeFormula('R[1] + R[2]', { limits: { maxReferences: 1 } });
  assert.equal(tooManyReferences.ok, false);
  assert.ok(tooManyReferences.diagnostics.some(({ code }) => code === 'REFERENCE_LIMIT_EXCEEDED'));

  const cannotRaiseHardLimit = analyzeFormula('R[1]', { limits: { maxLength: 999999 } });
  assert.equal(cannotRaiseHardLimit.limits.maxLength, DEFAULT_FORMULA_LIMITS.maxLength);
});

test('detecta ciclos estructurales al recibir un catálogo sintético', () => {
  const result = analyzeFormulaCatalog({
    'R[100]': 'N[200] + I[300]',
    'N[200]': 'U[900]',
    'U[900]': 'R[100]',
    'I[300]': 'A[010]',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.cycles, [['R[100]', 'N[200]', 'U[900]', 'R[100]']]);
  assert.ok(result.diagnostics.some(({ code }) => code === 'CATALOG_CYCLE'));
});

test('valida claves, fórmulas y tamaño del catálogo sin abandonar el proceso', () => {
  const invalid = analyzeFormulaCatalog([
    { id: 'X[1]', formula: 'R[1]' },
    { id: 'R[1]', formula: 'DESCONOCIDO' },
  ]);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.diagnostics.some(({ code }) => code === 'CATALOG_REFERENCE_INVALID'));
  assert.ok(invalid.diagnostics.some(({ code }) => code === 'IDENTIFIER_NOT_ALLOWED'));

  const limited = analyzeFormulaCatalog({ 'R[1]': 'N[1]', 'N[1]': 'R[1]' }, {
    limits: { maxCatalogEntries: 1 },
  });
  assert.equal(limited.ok, false);
  assert.equal(limited.diagnostics[0].code, 'CATALOG_LIMIT_EXCEEDED');
});

test('rechaza dependencias ausentes dentro de un catálogo revisado', () => {
  const result = analyzeFormulaCatalog({
    'R[1]': 'N[999] + 1',
  });

  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(({ code, reference }) => (
    code === 'UNRESOLVED_REFERENCE' && reference === 'N[999]'
  )));
});

test('rechaza constantes numéricas que no sean finitas', () => {
  const result = analyzeFormula(`R[1] + ${'9'.repeat(400)}`);

  assert.equal(result.ok, false);
  assert.equal(result.ast, null);
  assert.equal(result.diagnostics[0].code, 'NUMBER_OUT_OF_RANGE');
});

test('la implementación es propia, determinista y no contiene evaluadores dinámicos', () => {
  const source = fs.readFileSync(new URL('../assets/payroll-formula-linter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/);
  assert.equal(DEFAULT_FORMULA_LIMITS.maxLength, 4096);
  assert.equal(DEFAULT_FORMULA_LIMITS.maxTokens, 512);
  assert.equal(DEFAULT_FORMULA_LIMITS.maxDepth, 32);
});
