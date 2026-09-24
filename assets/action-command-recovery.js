// Confirmation of native action commands. No permissions, requests, payroll calculations or storage here.
(function (root) {
  'use strict';
  const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const types = ['leave_request', 'overtime_entry'];
  const commands = ['create', 'update_draft', 'submit', 'approve', 'reject', 'cancel'];
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  function receiptError() {
    const error = new Error('No se recibió un comprobante válido. La operación puede haberse registrado; recuperá el resultado antes de intentar otra.');
    error.code = 'ACTION_RECEIPT_UNVERIFIED'; error.status = 502; error.outcomeUnknown = true; return error;
  }
  function verifyReceipt(result, method, request) {
    const bad = () => { throw receiptError(); };
    if (!request || !types.includes(request.caseType) || !commands.includes(request.command) || method !== (request.command === 'update_draft' ? 'PATCH' : 'POST')) bad();
    if (!exact(result, ['ok', 'caseType', 'replayed', 'data']) || result.ok !== true || result.caseType !== request.caseType || typeof result.replayed !== 'boolean') bad();
    const receipt = result.data, overtime = request.caseType === 'overtime_entry';
    if (!exact(receipt, ['id', 'caseNumber', 'caseType', 'status', 'version', ...(overtime ? ['payrollImpact'] : [])]) || !UUID.test(receipt.id || '') || receipt.caseType !== request.caseType || typeof receipt.caseNumber !== 'string' || !/^[1-9]\d{0,19}$/.test(receipt.caseNumber) || !Number.isSafeInteger(receipt.version) || receipt.version < 1) bad();
    const statuses = overtime ? ['draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'] : ['draft', 'submitted', 'approved', 'rejected', 'cancelled'];
    if (!statuses.includes(receipt.status)) bad();
    if (request.command !== 'create' && (!UUID.test(request.caseId || '') || receipt.id.toLowerCase() !== request.caseId.toLowerCase() || !Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 1 || receipt.version <= request.expectedVersion)) bad();
    { // Fresh and replayed receipts both identify the exact original event.
      const expected = { create: 'draft', update_draft: 'draft', submit: 'submitted', approve: overtime ? 'pending_time_rules' : 'approved', reject: 'rejected', cancel: 'cancelled' }[request.command];
      if (receipt.status !== expected || receipt.version !== (request.command === 'create' ? 1 : request.expectedVersion + 1)) bad();
    }
    if (overtime && (!exact(receipt.payrollImpact, ['amount', 'rate', 'calculated', 'posted', 'attendanceReconciled']) || receipt.payrollImpact.amount !== null || receipt.payrollImpact.rate !== null || receipt.payrollImpact.calculated !== false || receipt.payrollImpact.posted !== false || receipt.payrollImpact.attendanceReconciled !== false)) bad();
    return result;
  }
  async function readReceiptPayload(response) {
    if (![200, 201].includes(response.status) || !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '') || !response.body?.getReader) throw receiptError();
    const reader = response.body.getReader(), chunks = []; let size = 0, complete = false;
    try {
      for (;;) { const { value, done } = await reader.read(); if (done) { complete = true; break; } size += value.byteLength; if (size > 16384) throw receiptError(); chunks.push(value); }
      const buffer = new Uint8Array(size); let at = 0; for (const chunk of chunks) { buffer.set(chunk, at); at += chunk.length; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    } catch (_) { throw receiptError(); }
    finally { if (!complete) await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  function needsRecovery(error) {
    const status = Number(error?.status);
    return error?.outcomeUnknown === true || !Number.isFinite(status) || status === 0 || status === 408 || status >= 500;
  }
  function copyCommand(method, body) {
    if (!body || !types.includes(body.caseType) || !commands.includes(body.command) || method !== (body.command === 'update_draft' ? 'PATCH' : 'POST')) throw receiptError();
    const value = JSON.parse(JSON.stringify(body));
    const freeze = object => { if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); } return object; };
    return freeze(value);
  }
  const labels = Object.freeze({ create: 'Crear borrador', update_draft: 'Guardar cambios del borrador', submit: 'Enviar a revisión', approve: 'Registrar aprobación', reject: 'Registrar rechazo', cancel: 'Registrar cancelación' });
  root.MuniControlCommandRecovery = Object.freeze({ verifyReceipt, readReceiptPayload, receiptError, needsRecovery, copyCommand, commandLabel: command => labels[command] || 'Operación' });
})(globalThis);
