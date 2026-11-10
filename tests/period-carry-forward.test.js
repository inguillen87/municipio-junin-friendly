// «Traer lo aprobado el mes anterior»: Marcelo pidió que la carga de datos del período no sea desde cero cada mes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {previousPeriod, periodName, carryForward, carrySummary} from '../assets/period-carry-forward.js';

test('el mes anterior cruza el año y un período inválido no se adivina', () => {
 assert.equal(previousPeriod('2026-11'), '2026-10'); assert.equal(previousPeriod('2027-01'), '2026-12'); assert.equal(previousPeriod('2026-10'), '2026-09');
 assert.equal(periodName('2026-09'), 'septiembre de 2026'); assert.equal(periodName('2027-01'), 'enero de 2027');
 for (const bad of ['2026-13', '2026-1', '', null, undefined, '2026-00']) { assert.throws(() => previousPeriod(bad), /PERIOD_INVALID/); assert.throws(() => periodName(bad), /PERIOD_INVALID/); }
});

const keys = {id: 'contractId', token: 'identityToken'};
const row = (id, token, value) => ({contractId: id, identityToken: token, definition: {children: value, tariffSelection: {region: value}}});
test('sólo se trae la declaración del mismo sujeto con la misma identidad; lo demás queda como estaba', () => {
 const draft = [row('a', 't1', null), row('b', 't2', null), row('c', 't3', null), row('d', 't4', '9')];
 const approved = [row('a', 't1', '2'), row('b', 'OTRA', '3'), row('d', 't4', null), row('z', 't9', '7')];
 const result = carryForward(draft, approved, keys);
 assert.deepEqual([result.copied, result.absent, result.changed, result.gone], [2, 1, 1, 1]);
 assert.equal(result.draft[0].definition.children, '2');
 assert.equal(result.draft[1].definition.children, null, 'cambió la identidad: no se trae');
 assert.equal(result.draft[2].definition.children, null, 'no figura el mes anterior: no se trae ni se inventa');
 assert.equal(result.draft[3].definition.children, null, 'sin informar el mes anterior se trae como sin informar, no como cero');
 assert.equal(result.draft.length, draft.length); assert.ok(!result.draft.some(r => r.contractId === 'z'), 'quien ya no está en el período no vuelve');
 // Copia profunda y sin tocar las entradas.
 result.draft[0].definition.tariffSelection.region = 'cambiado';
 assert.equal(approved[0].definition.tariffSelection.region, '2'); assert.equal(draft[0].definition.children, null);
 assert.equal(result.draft[1], draft[1]);
});
test('entradas inválidas o repetidas se rechazan en vez de traer a medias', () => {
 assert.throws(() => carryForward(null, [], keys), /CARRY_FORWARD_INVALID/); assert.throws(() => carryForward([], [], {}), /CARRY_FORWARD_INVALID/);
 assert.throws(() => carryForward([row('a', 't', null)], [row('a', 't', '1'), row('a', 't', '2')], keys), /CARRY_FORWARD_DUPLICATE/);
 assert.deepEqual(carryForward([], [], keys), {draft: [], copied: 0, absent: 0, changed: 0, gone: 0});
});
test('el aviso dice cuántas filas vinieron, cuáles no, y que nada se registró', () => {
 assert.equal(carrySummary({copied: 14, absent: 0, changed: 0}, 14, '2026-09'), 'Se trajeron 14 de 14 filas de lo aprobado en septiembre de 2026, con su fecha y su constancia. Revisá, corregí lo que cambió y compará. Todavía no se registró nada.');
 assert.match(carrySummary({copied: 59, absent: 1, changed: 0}, 60, '2026-09'), / 1 queda como estaba porque no figura en ese mes o cambió su identidad\./);
 assert.match(carrySummary({copied: 57, absent: 2, changed: 1}, 60, '2026-09'), / 3 quedan como estaban porque no figuran en ese mes o cambió su identidad\./);
});

const PANELS = [['own-agreement-working-time-panel', 'agreement-time', 'agreementWorkingTimeBootstrap', "{id:'agreementCode',token:'agreementToken'}"], ['own-contract-salary-conditions-panel', 'conditions', 'salaryConditionsBootstrap', "{id:'contractId',token:'identityToken'}"], ['own-contract-family-payroll-facts-panel', 'family-facts', 'familyPayrollFactsBootstrap', "{id:'contractId',token:'identityToken'}"]];
for (const [file, prefix, bootstrap, keysText] of PANELS) test(file + ': traer lo aprobado es una lectura validada que sólo llena el borrador', () => {
 const js = fs.readFileSync('assets/' + file + '.js', 'utf8');
 assert.match(js, new RegExp(`<div class="${prefix}-carry"><p data-${prefix}-current></p><button type="button" data-${prefix}-carry title="[^"]+No registra nada\\." hidden>Traer lo aprobado el mes anterior</button></div>`), 'va al lado del estado del período, sin alargar la pantalla');
 assert.ok(js.includes("$('carry').disabled=$('fields').disabled=busy||!!attempt||!boot?.permissions.canPropose||!can(capsFor('propose'));"), 'se habilita exactamente como la preparación');
 const handler = js.split('\n').find(l => l.startsWith(" $('carry').addEventListener('click',()=>perform(async valid=>{"));
 assert.ok(handler && handler.includes(`value=${bootstrap}((await request(endpoint+'?'+new URLSearchParams({resource:'bootstrap',period:from}))).data);`), 'la respuesta del mes anterior pasa por el mismo validador que cualquier consulta');
 assert.ok(handler.includes("if(value.period!==from)throw Error('La respuesta corresponde a otro período.');") && handler.includes("if(!value.configuration.revision){status('No hay nada aprobado en '+periodName(from)+'. No se trajo ninguna fila.','warning');return;}"));
 assert.ok(handler.includes(`carryForward(draft,value.configuration.items,${keysText});draft=result.draft;page=1;invalidate();rows();status(carrySummary(result,draft.length,from));`));
 assert.ok(!/method:'POST'|prepared=|\$\('confirm'\)|\$\('send'\)/.test(handler), 'no envía, no prepara y no confirma');
 assert.ok(handler.startsWith(" $('carry').addEventListener('click',()=>perform(async valid=>{await session(capsFor('propose'));"), 'sólo para quien puede preparar');
 assert.ok(js.includes("$('carry').hidden=value.configuration.revision>0;"), 'si el período ya tiene una revisión aprobada, el borrador parte de ella');
});
test('el armado publica el ayudante', () => { assert.ok(fs.readFileSync('scripts/build-friendly.mjs', 'utf8').includes("'assets/period-carry-forward.js'")); });
