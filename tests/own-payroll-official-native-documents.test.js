// Los documentos que devuelven las funciones nativas con total oficial (PostgreSQL 18.6, candidato V5 de Root) pasan por
// cada lector del producto: los manejadores del servidor de liquidación, cierre y recibos, y los lectores de pantalla de
// Calcular y de Confirmar/Anular. Un contrato sintético por versión; ninguna consulta escribe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeOfficial, NATIVE_OFFICIAL_VERSIONS } from './fixtures/own-payroll-native-official-pg18.js';
import { uid } from './fixtures/own-payroll-program-synthetic.js';
import { RUN_CALCULATE, ownRunOperation, ownRunHash } from '../lib/internal-own-payroll-run.js';
import { ownLiquidationOperation } from '../lib/internal-own-payroll-liquidation.js';
import { ownCloseOperation } from '../lib/internal-own-payroll-close.js';
import { ownReceiptOperation } from '../lib/internal-own-payroll-receipts.js';
import { OWN_LIQ_REVIEW, verifiedOwnLiquidationDetail, ownLiquidationReview, ownLiquidationIndividual } from '../assets/own-payroll-liquidation-model.js';
import { verifiedRunCapture, ownRunResult, ownRunRows, ownRunCsv, ownRunOfficialSummary, ownRunOfficialText } from '../assets/own-payroll-run-reader.js';

const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id: uid(1), membershipId: uid(2), effectiveCapabilities: [...RUN_CALCULATE, ...OWN_LIQ_REVIEW] } }, session = { email: 'qa@example.invalid', id: uid(3), version: 1, releaseSha: 'd'.repeat(40) };
const database = document => { const calls = []; return { calls, query: async (q, v) => { calls.push({ q, v }); return [{ result: document }]; } }; };
const all = { kind: 'all', values: [] };

for (const version of NATIVE_OFFICIAL_VERSIONS) {
  const label = version.toUpperCase();

  test(label + ': el servidor entrega el detalle de la liquidación, su confirmación y el intento consultado', async () => {
    const d = nativeOfficial(version);
    for (const deps of [{}, { fullJson: true }]) {
      const sql = database(d.liquidationDetail), detail = await ownLiquidationOperation(sql, principal, session, 'detail', { id: d.liquidationDetail.id }, deps);
      assert.equal(detail.capture.saved.input.version, 'own-payroll-input.' + version);
      assert.match(sql.calls[0].q, deps.fullJson ? /own_liquidation_detail_full_v1/ : /own_liquidation_detail_v1/);
    }
    assert.equal((await ownLiquidationOperation(database(d.confirmation), principal, session, 'attempt', { key: d.confirmation.key })).resultSha256, d.saved.resultSha256, 'la confirmación queda ligada al resultado original');
    // Sin la capacidad de revisión el detalle no se entrega, igual que con un resultado histórico.
    const reader = { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: RUN_CALCULATE } };
    await assert.rejects(ownLiquidationOperation(database(d.liquidationDetail), reader, session, 'detail', { id: d.liquidationDetail.id }), e => e.status === 403);
  });

  test(label + ': el servidor rechaza un detalle cuyo resultado oficial no conserva sus huellas o no sale de sus fuentes', async () => {
    for (const [name, change] of Object.entries({
      'neto alterado': c => { c.saved.result.employeeTotals[0].net = '1.00'; },
      'entrada alterada con huella rehecha': c => { const observed = c.saved.input.employees[0].inputs.find(i => typeof i.value === 'string'); observed.value += '1'; c.saved.inputSha256 = ownRunHash(c.saved.input); },
      'fuentes congeladas alteradas': c => { c.payload.monthly.extra = true; },
    })) {
      const d = nativeOfficial(version); change(d.liquidationDetail.capture);
      await assert.rejects(ownLiquidationOperation(database(d.liquidationDetail), principal, session, 'detail', { id: d.liquidationDetail.id }), e => e.status === 503, name);
    }
  });

  test(label + ': el servidor entrega el detalle de cierre, el cierre registrado y el grupo cerrado', async () => {
    const d = nativeOfficial(version), scope = { period: d.closeDetail.period, liquidationType: d.closeDetail.liquidationType };
    const detail = await ownCloseOperation(database(d.closeDetail), principal, session, 'detail', scope);
    assert.equal(detail.captures.length, 1); assert.equal(detail.captures[0].saved.resultSha256, d.saved.resultSha256);
    assert.equal((await ownCloseOperation(database(d.closeReceipt), principal, session, 'attempt', { key: d.closeReceipt.key })).snapshotSha256, d.closeReceipt.snapshotSha256);
    for (const deps of [{}, { fullJson: true }]) assert.equal((await ownCloseOperation(database(d.closeReceipt), principal, session, 'group', { id: d.closeReceipt.groupId }, deps)).groupId, d.closeReceipt.groupId);
    const changed = nativeOfficial(version); changed.closeDetail.captures[0].saved.result.employeeTotals[0].net = '1.00';
    await assert.rejects(ownCloseOperation(database(changed.closeDetail), principal, session, 'detail', scope), e => e.status === 503);
    const snapshot = nativeOfficial(version); snapshot.closeReceipt.snapshot.totals.net = '1.00';
    await assert.rejects(ownCloseOperation(database(snapshot.closeReceipt), principal, session, 'group', { id: snapshot.closeReceipt.groupId }), e => e.status === 503);
  });

  test(label + ': el servidor entrega la previa, la emisión preparada, la aprobada y el recibo propio', async () => {
    const d = nativeOfficial(version);
    assert.equal((await ownReceiptOperation(database(d.receiptPreview), principal, session, 'preview', { params: d.receiptPreview.snapshot.params })).snapshotSha256, d.receiptPreview.snapshotSha256);
    for (const batch of [d.receiptBatchPrepared, d.receiptBatchApproved]) assert.equal((await ownReceiptOperation(database(batch), principal, session, 'batch', { id: batch.id })).state, batch.state);
    assert.equal((await ownReceiptOperation(database(d.receiptSelf), principal, session, 'self', {})).items.length, 1);
    const changed = nativeOfficial(version); changed.receiptBatchApproved.snapshot.period = '2026-09';
    await assert.rejects(ownReceiptOperation(database(changed.receiptBatchApproved), principal, session, 'batch', { id: changed.receiptBatchApproved.id }), e => e.status === 503 || e.status === 422);
  });

  test(label + ': Confirmar y Anular leen el detalle nativo y muestran el neto oficial', async () => {
    const d = nativeOfficial(version), verified = await verifiedOwnLiquidationDetail(d.liquidationDetail), result = d.saved.result;
    assert.notEqual(verified, d.liquidationDetail); assert.deepEqual(verified, d.liquidationDetail);
    const review = ownLiquidationReview(verified, all, 'confirm');
    assert.equal(review.count, 1); assert.equal(review.totals.net, result.employeeTotals[0].net);
    assert.notEqual(result.employeeTotals[0].net, result.lineEmployeeTotals[0].net, 'el caso nativo tiene un centavo de diferencia entre el neto oficial y la suma de renglones');
    assert.equal(ownLiquidationIndividual(verified, result.employeeTotals[0].contractId).totals.net, result.employeeTotals[0].net);
  });

  test(label + ': Calcular lee la captura nativa, lista sus totales oficiales y explica la diferencia con los renglones', async () => {
    const d = nativeOfficial(version), stored = { ...d.capture, saved: d.saved, replayed: true };
    const capture = await verifiedRunCapture(stored, { key: d.capture.key, body: d.capture.body }), result = ownRunResult(capture).result;
    assert.equal(result.employeeCount, 1);
    const page = ownRunRows(capture, '', 1, 50), saved = d.saved.result;
    assert.equal(page.total, saved.rowCount); assert.equal(page.rows.length, saved.rowCount, 'todos los renglones económicos, se impriman o no');
    assert.deepEqual(page.rows.map(r => r.amount), saved.rows.map(r => r.amount));
    assert.equal(ownRunRows(capture, '900001', 1, 5).filtered, saved.rowCount); assert.equal(ownRunRows(capture, 'no existe', 1, 5).filtered, 0);
    assert.equal(ownRunCsv(capture).trim().split('\n').length, saved.rowCount + 1, 'una fila por renglón más el encabezado');
    const summary = ownRunOfficialSummary(capture);
    assert.equal(summary.reconciled, 1); assert.equal(summary.employees, 1); assert.equal(summary.omitted, 0, 'en el caso con derecho e importe positivo no se omite ningún renglón');
    assert.match(ownRunOfficialText(summary), /neto oficial/i);
    // Lo mismo que entrega el servidor al consultar el intento.
    const served = await ownRunOperation(database(stored), principal, session, 'attempt', { key: d.capture.key });
    assert.deepEqual(served, stored);
  });
}
