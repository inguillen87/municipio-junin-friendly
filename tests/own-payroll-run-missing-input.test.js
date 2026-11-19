// Cuando una fórmula pide un dato sin valor, el motor dice qué clave pidió, el servidor dice de qué fuente sale y a
// cuántas de las personas elegidas les falta, y el panel arma el texto con su propio vocabulario.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluatePayrollExpression} from '../assets/own-payroll-expression.js';
import {OwnPayrollError} from '../assets/own-payroll-exact.js';
import {ownRunMissing, ownRunMissingMessage, OWN_RUN_MISSING_SOURCES, OWN_RUN_MISSING_FIELDS} from '../assets/own-payroll-run-model.js';
import {ownRunMissingInput, OwnRunError, runError} from '../lib/internal-own-payroll-run.js';

const missing = {key: 'familia_spouse', sourceKind: 'family_fact', sourceField: 'spouse', without: 79, people: 81};
const person = (id, inputs) => ({contractId: id, agreementCode: '1', inputs});
const definition = {bindings: [{key: 'familia_spouse', agreementCode: '1', sourceKind: 'family_fact', sourceField: 'spouse'}, {key: 'escala_x', agreementCode: '1', sourceKind: 'scale'}]};
const engineError = key => Object.assign(new OwnPayrollError('INPUT_MISSING', 'Falta una entrada necesaria; no se supone cero.'), {inputKey: key});

test('el motor informa la clave pedida y sigue sin suponer cero', () => {
  const source = readFileSync('assets/own-payroll-expression.js', 'utf8');
  assert.equal(source.split("requireInput(input, n.key,").length - 1, 2, 'las dos lecturas de entrada (valor y condición) informan la clave');
  assert.doesNotMatch(source, /require\(input && input\.value !== null, 'INPUT_MISSING'/);
  const expression = {op: 'input', key: 'antiguedad', unit: 'years'};
  for (const inputs of [new Map(), new Map([['antiguedad', {value: null, unit: 'years'}]])])
    assert.throws(() => evaluatePayrollExpression(expression, {consume() {}, inputs}), e => e instanceof OwnPayrollError && e.code === 'INPUT_MISSING' && e.inputKey === 'antiguedad');
});

test('el aviso sólo acepta la forma exacta, el vocabulario conocido y conteos coherentes', () => {
  assert.deepEqual(ownRunMissing(missing), missing);
  assert.deepEqual(ownRunMissing({...missing, sourceKind: null, sourceField: null}), {...missing, sourceKind: null, sourceField: null});
  for (const bad of [null, [], 'x', {}, {...missing, extra: 1}, {...missing, key: '<b>'}, {...missing, key: 'con espacio'}, {...missing, key: ''}, {...missing, key: 'a'.repeat(81)},
    {...missing, sourceKind: 'otra'}, {...missing, sourceKind: 'toString'}, {...missing, sourceField: 'constructor'}, {...missing, sourceField: 'desconocido'},
    {...missing, without: 0}, {...missing, without: 82}, {...missing, without: '79'}, {...missing, people: 0}, {...missing, people: 10001}, {...missing, people: 81.5},
    (({key, ...rest}) => rest)(missing)]) { assert.equal(ownRunMissing(bad), null, JSON.stringify(bad)); assert.equal(ownRunMissingMessage(bad), null); }
  for (const text of [...Object.values(OWN_RUN_MISSING_SOURCES), ...Object.values(OWN_RUN_MISSING_FIELDS)]) assert.match(text, /^[\p{L}0-9 ]+$/u);
});

test('el texto nombra la fuente, el dato, los conteos y la clave de las reglas', () => {
  assert.equal(ownRunMissingMessage(missing), 'Falta cargar los datos familiares del período (cónyuge): sin valor en 79 de 81 personas elegidas. No se supuso cero. Completá ese dato, aprobalo y volvé a calcular. Clave en las reglas: familia_spouse.');
  assert.equal(ownRunMissingMessage({key: 'c1Guard', sourceKind: null, sourceField: null, without: 1, people: 1}), 'Falta cargar un dato que usa la fórmula: sin valor en 1 de 1 persona elegida. No se supuso cero. Completá ese dato, aprobalo y volvé a calcular. Clave en las reglas: c1Guard.');
});

test('el servidor cuenta a quiénes les falta y toma la fuente del vínculo de las reglas', () => {
  const input = {employees: [person('contrato-uno', [{key: 'familia_spouse', value: null, unit: 'count'}]), person('contrato-dos', [{key: 'familia_spouse', value: '1', unit: 'count'}]), person('contrato-tres', [])]};
  const error = ownRunMissingInput(engineError('familia_spouse'), input, definition);
  assert.ok(error instanceof OwnRunError); assert.equal(error.code, 'OWN_RUN_INPUT_MISSING'); assert.equal(error.status, 422);
  assert.deepEqual(error.missing, {key: 'familia_spouse', sourceKind: 'family_fact', sourceField: 'spouse', without: 2, people: 3});
  assert.equal(error.message, ownRunMissingMessage(error.missing));
  assert.equal(runError(error), error, 'el aviso llega intacto a la respuesta');
  assert.doesNotMatch(JSON.stringify(error.missing) + error.message, /contractId|contrato-/, 'sin identificadores de personas');
  // Una fuente fuera del vocabulario, o una clave sin vínculo, se informa sin fuente.
  assert.deepEqual(ownRunMissingInput(engineError('escala_x'), {employees: [person('a', [])]}, definition).missing, {key: 'escala_x', sourceKind: null, sourceField: null, without: 1, people: 1});
  assert.deepEqual(ownRunMissingInput(engineError('sin_vinculo'), {employees: [person('a', [])]}, definition).missing.sourceKind, null);
});

test('lo que no es una entrada faltante con clave válida se deja como estaba', () => {
  const input = {employees: [person('a', [])]};
  const other = new OwnPayrollError('UNIT_MISMATCH', 'x'); assert.equal(ownRunMissingInput(other, input, definition), other);
  const noKey = new OwnPayrollError('INPUT_MISSING', 'x'); assert.equal(ownRunMissingInput(noKey, input, definition), noKey);
  const plain = new Error('x'); assert.equal(ownRunMissingInput(plain, input, definition), plain);
  const strange = engineError('<script>'); assert.equal(ownRunMissingInput(strange, input, definition), strange);
  // Si a nadie le falta (incoherente con el error), no se inventa un conteo.
  const everyone = engineError('familia_spouse'); assert.equal(ownRunMissingInput(everyone, {employees: [person('a', [{key: 'familia_spouse', value: '0', unit: 'count'}])]}, definition), everyone);
  assert.equal(runError(noKey).code, 'OWN_RUN_INPUT_MISSING'); assert.equal(runError(noKey).missing, undefined);
});

test('la interfaz del servidor y el panel usan el aviso validado, nunca texto libre', () => {
  const api = readFileSync('api/internal-own-payroll-run.js', 'utf8'), panel = readFileSync('assets/own-payroll-run-panel.js', 'utf8'), lib = readFileSync('lib/internal-own-payroll-run.js', 'utf8');
  assert.match(api, /const missing = safe\.code === 'OWN_RUN_INPUT_MISSING' \? ownRunMissing\(safe\.missing\) : null;\n\s+return res\.status\(safe\.status\)\.json\(\{ ok: false, code: safe\.code, error: safe\.message, \.\.\.\(missing \? \{ missing \} : \{\}\) \}\);/);
  assert.match(panel, /Error\(\(payload\?\.code==='OWN_RUN_INPUT_MISSING'\?ownRunMissingMessage\(payload\.missing\):null\)\?\?errors\[payload\?\.code\]\?\?\(/);
  assert.doesNotMatch(panel, /payload\??\.error\b/, 'el panel no muestra el texto del servidor');
  assert.match(lib, /catch \(e\) \{ throw ownRunMissingInput\(e, input, payload\.programState\.program\.definition\); \}/);
});
