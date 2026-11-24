// «Aprobar todo»: lista unificada del mes y aprobación una por una con el control independiente del servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {participationPending, PARTICIPATION_PENDING_VERSION} from '../assets/own-period-participation-model.js';

const pending = (proposals, period = '2026-10') => ({version: PARTICIPATION_PENDING_VERSION, period, complete: true, proposals});
const item = (o = {}) => ({proposalId: '11111111-1111-4111-8111-111111111111', contractId: '22222222-2222-4222-8222-222222222222', legajo: '219', createdAt: '2026-11-24T21:00:00Z', authorLabel: 'Marcelo', canReview: true, ...o});

test('la lista de pendientes de participación se verifica completa', () => {
  assert.equal(participationPending(pending([item()]), '2026-10').proposals.length, 1);
  assert.throws(() => participationPending(pending([item()]), '2026-11'), /lista completa/);
  assert.throws(() => participationPending({...pending([]), complete: false}, '2026-10'));
  assert.throws(() => participationPending(pending([item(), item()]), '2026-10'), /formato/);
  assert.throws(() => participationPending(pending([item({canReview: 'si'})]), '2026-10'));
  assert.throws(() => participationPending(pending([item({extra: 1})]), '2026-10'));
});

test('el panel aprueba sólo lo que esta cuenta puede decidir y usa los mismos comandos de cada circuito', () => {
  const ui = readFileSync('assets/approvals-quick.js', 'utf8');
  assert.match(ui, /x\.canApprove&&x\.state!=='ok'/);
  assert.match(ui, /command:'approve',batchId:item\.id,expectedRevision:item\.revision,reasonReference:null,reviewConfirmed:true/);
  assert.match(ui, /decideParticipation\(boot,detail,'approve'/);
  assert.match(ui, /resource=pending&period=/);
  assert.doesNotMatch(ui, /command:'reject'|command:'cancel'/);
  assert.match(ui, /salaryCommand\(\{command:'approve'/);
  assert.match(ui, /ownProgramCommand\(\{command:'approve'/);
  assert.match(ui, /const order=\{novelty:0,participation:1,salary:2,program:3\}/);
});

test('la API admite la consulta de pendientes por período y la base la expone sólo al rol de la aplicación', () => {
  const api = readFileSync('api/internal-own-period-participation.js', 'utf8');
  assert.match(api, /q\.resource === 'pending' && Object\.keys\(q\)\.sort\(\)\.join\('\|'\) === 'period\|resource'/);
  const lib = readFileSync('lib/internal-own-period-participation.js', 'utf8');
  assert.match(lib, /own_participation_pending_v1\(\$1::jsonb,\$2::text\)/);
  const sql = readFileSync('scripts/migrations/250-own-participation-pending.sql', 'utf8');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.own_participation_pending_v1\(jsonb,text\) FROM PUBLIC;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.own_participation_pending_v1\(jsonb,text\) TO municontrol_actions_runtime_app;/);
  assert.match(sql, /own_participation_summary_v1\(ctx,e\)->'canReview'/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  assert.match(readFileSync('.vercelignore', 'utf8'), /^!scripts\/migrations\/250-own-participation-pending\.sql$/m);
});

test('la lectura de pendientes de participación se recupera como las demás lecturas del período', async () => {
  const {recoverOwnPeriodRead} = await import('../lib/own-period-read-recovery.js');
  assert.equal(await recoverOwnPeriodRead({method: 'GET', operation: 'pending', busyCode: 'PARTICIPATION_BUSY', read: async () => 'ok', reauthorize: async () => true}), 'ok');
});
