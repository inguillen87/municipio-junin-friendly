import {TIME_CATALOG_VERSION, TIME_CATALOG_KINDS, TIME_CATALOG_STATUSES, TIME_CATALOG_REASONS,
  timeCatalogExact, timeCatalogInteger, timeCatalogScope, timeCatalogSha, timeCatalogKey,
  timeCatalogRecord, timeCatalogCommand, timeCatalogMatches, timeCatalogEditPayload, timeCatalogAssignment} from './time-catalog-contract.js';

export const CATALOG_KIND_LABELS = Object.freeze({calendar: 'Calendario', shift: 'Turno', rule_profile: 'Reglas', assignment: 'Asignación'});
export const CATALOG_STATUS_LABELS = Object.freeze({draft: 'Borrador', submitted: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', retired: 'Retirado'});
export const CATALOG_COMMAND_LABELS = Object.freeze({submit: 'Enviar a revisión', approve: 'Aprobar configuración', reject: 'Rechazar', retire: 'Retirar vigencia'});
export const CATALOG_REASON_LABELS = Object.freeze({ready_for_review: 'Preparación completa', configuration_verified: 'Configuración contrastada',
  configuration_invalid: 'Configuración incorrecta', evidence_insufficient: 'Falta documentación', source_not_authoritative: 'Fuente no autorizada',
  superseded: 'Reemplazada por otra revisión', catalog_retired: 'Finalizó su uso', binding_changed: 'Cambió el ámbito autorizado'});
const flags = ['catalogReady', 'attendanceEvaluationReady', 'punchesLoaded', 'minutesCalculated', 'payrollPosted', 'grhMutation'];
const check = (value, message = 'La respuesta no pudo verificarse. Actualizá la consulta antes de decidir.') => { if (!value) throw new Error(message); };
const baseFields = ['version', 'scopeVersion', 'permissions'];
const permissions = value => timeCatalogExact(value, ['canPropose', 'canApprove', 'canAudit', 'canReadAssignments'])
  && Object.values(value).every(v => typeof v === 'boolean');
const timestamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function catalogCivilDate(value) {
  return value ? value.split('-').reverse().join('/') : 'Sin fecha de fin';
}
export function catalogPageLabel(page, count) {
  if (!page.total) return '0 configuraciones';
  if (!count) return `0 en esta página · ${page.total} configuraciones en el filtro. Usá Anterior para volver.`;
  return `${page.offset + 1}–${page.offset + count} de ${page.total} configuraciones`;
}

// Only verified read results and one frozen in-memory attempt. No persistence,
// automatic retries or calculation belong to this model.
export class TimeCatalogReviewSession {
  constructor() { this.generation = 0; this.invalidate(); }
  invalidate() {
    this.generation++; this.scope = null; this.permissions = {canPropose: false, canApprove: false, canAudit: false, canReadAssignments: false};
    this.summary = null; this.records = []; this.page = null; this.selected = null; this.timeline = []; this.auditAvailable = false;
    this.timelineMayBeIncomplete = false; this.pending = null; this.editPayload = null; this.assignment = null; this.allowedCommands = [];
  }
  base(data) {
    check(data?.version === TIME_CATALOG_VERSION && timeCatalogScope(data.scopeVersion) && permissions(data.permissions));
    if (this.scope && (this.scope !== data.scopeVersion || Object.keys(this.permissions).some(k => this.permissions[k] !== data.permissions[k]))) {
      this.invalidate(); throw new Error('Cambió el acceso o el vínculo autorizado. Volvé a verificar la sesión.');
    }
  }
  bootstrap(data) {
    check(timeCatalogExact(data, [...baseFields, 'summary', ...flags]) && flags.every(f => data[f] === false));
    this.base(data);
    check(timeCatalogExact(data.summary, ['calendar', 'shift', 'ruleProfile', 'assignment', 'submitted'])
      && Object.values(data.summary).every(v => timeCatalogInteger(v, 0, 2147483647)));
    this.scope = data.scopeVersion; this.permissions = structuredClone(data.permissions); this.summary = structuredClone(data.summary);
  }
  list(data, input) {
    check(this.scope && timeCatalogExact(data, [...baseFields, 'records', 'page'])); this.base(data);
    const p = data.page;
    check(timeCatalogExact(p, ['limit', 'offset', 'total', 'hasMore']) && p.limit === input.limit && p.offset === input.offset
      && timeCatalogInteger(p.total, 0, 2147483647) && p.hasMore === (p.offset + p.limit < p.total)
      && Array.isArray(data.records) && data.records.length === Math.max(0, Math.min(p.limit, p.total - p.offset)));
    data.records.forEach(r => {
      timeCatalogRecord(r); check((!input.kind || r.kind === input.kind) && (!input.status || r.status === input.status));
    });
    check(new Set(data.records.map(r => r.id.toLowerCase())).size === data.records.length);
    this.records = structuredClone(data.records); this.page = structuredClone(p);
  }
  detail(data, id) {
    check(this.scope && timeCatalogExact(data, [...baseFields, 'record', 'timeline', 'auditAvailable', 'timelineLimit', 'timelineMayBeIncomplete', 'editPayload', 'assignment', 'allowedCommands']));
    this.base(data); timeCatalogRecord(data.record);
    check(data.record.id.toLowerCase() === id.toLowerCase() && data.auditAvailable === this.permissions.canAudit && data.timelineLimit === 100
      && Array.isArray(data.timeline) && data.timeline.length <= 100 && (data.auditAvailable || data.timeline.length === 0)
      && data.timelineMayBeIncomplete === (data.auditAvailable && data.timeline.length === 100));
    check(Array.isArray(data.allowedCommands) && new Set(data.allowedCommands).size === data.allowedCommands.length
      && data.allowedCommands.every(c => (['update_draft','submit'].includes(c) && data.record.status === 'draft' && this.permissions.canPropose)
        || (['approve','reject'].includes(c) && data.record.status === 'submitted' && this.permissions.canApprove)
        || (c === 'retire' && data.record.status === 'approved' && this.permissions.canApprove)));
    check((data.editPayload !== null) === data.allowedCommands.includes('update_draft'));
    if (data.editPayload !== null) timeCatalogEditPayload(data.record, data.editPayload);
    if (data.assignment !== null) { check(this.permissions.canReadAssignments); timeCatalogAssignment(data.assignment, data.record); }
    if (data.record.kind === 'assignment') {
      check(this.permissions.canReadAssignments || (data.assignment === null && !data.allowedCommands.length));
      if (data.editPayload !== null) check(data.assignment !== null
        && data.editPayload.spec.employmentContractId === data.assignment.target.contractId
        && data.editPayload.spec.shiftEntryId === data.assignment.shift.id
        && data.editPayload.spec.calendarEntryId === data.assignment.calendar.id
        && data.editPayload.spec.ruleProfileEntryId === data.assignment.ruleProfile.id);
    }
    data.timeline.forEach(e => check(timeCatalogExact(e, ['command', 'expectedVersion', 'resultingVersion', 'reasonCode', 'occurredAt'])
      && Object.hasOwn(TIME_CATALOG_REASONS, e.command) && TIME_CATALOG_REASONS[e.command].includes(e.reasonCode)
      && timeCatalogInteger(e.expectedVersion, 0, 2147483646) && e.resultingVersion === e.expectedVersion + 1
      && e.resultingVersion <= data.record.version && timestamp(e.occurredAt)));
    this.selected = structuredClone(data.record); this.timeline = structuredClone(data.timeline);
    this.auditAvailable = data.auditAvailable; this.timelineMayBeIncomplete = data.timelineMayBeIncomplete;
    this.editPayload = structuredClone(data.editPayload); this.assignment = structuredClone(data.assignment); this.allowedCommands = [...data.allowedCommands];
  }
  commands(record = this.selected) {
    if (!this.scope || !record || record.id !== this.selected?.id || this.pending || (record.kind === 'assignment' && !this.assignment)) return [];
    return this.allowedCommands.filter(c => c !== 'update_draft');
  }
  prepareDraft(kind, payload, reasonCode, reason, key, editing = false) {
    check(this.scope && this.permissions.canPropose && !this.pending && timeCatalogKey(key)
      && (!editing || this.editPayload !== null) && (kind !== 'assignment' || this.permissions.canReadAssignments), 'La preparación no está habilitada en esta sesión.');
    check(!editing || kind === this.selected.kind, 'La corrección debe conservar el tipo de configuración.');
    const body = timeCatalogCommand({command: editing ? 'update_draft' : 'create_draft', kind,
      id: editing ? this.selected.id : null, expectedVersion: editing ? this.selected.version : 0,
      payload, reasonCode, reason, manualValidationConfirmed: false, scopeVersion: this.scope});
    this.pending = Object.freeze({key, scope: this.scope, body: JSON.stringify({operation: 'command', payload: body}), generation: this.generation});
    return this.pending;
  }
  prepare(command, reasonCode, reason, manualValidationConfirmed, key) {
    check(this.commands().includes(command) && timeCatalogKey(key), 'Esta decisión no está habilitada para la configuración consultada.');
    const body = timeCatalogCommand({command, kind: null, id: this.selected.id, expectedVersion: this.selected.version, payload: null,
      reasonCode, reason, manualValidationConfirmed, scopeVersion: this.scope});
    this.pending = Object.freeze({key, scope: this.scope, body: JSON.stringify({operation: 'command', payload: body}), generation: this.generation});
    return this.pending;
  }
  attempt() {
    check(this.pending && this.pending.scope === this.scope && this.pending.generation === this.generation, 'El envío ya no está habilitado en esta sesión.');
    return this.pending;
  }
  confirm(data) {
    const pending = this.attempt(), body = JSON.parse(pending.body).payload;
    check(timeCatalogExact(data, ['version', 'scopeVersion', 'data', 'replayed', 'requestSha256', 'attemptKey', ...flags], ['historical'])
      && data.version === TIME_CATALOG_VERSION && data.scopeVersion === pending.scope && data.attemptKey === pending.key
      && timeCatalogSha(data.requestSha256) && typeof data.replayed === 'boolean' && flags.every(f => data[f] === false)
      && (Object.hasOwn(data, 'historical') ? data.replayed && typeof data.historical === 'boolean' : !data.replayed),
      'La confirmación no corresponde al envío. Conservá el mismo intento.');
    timeCatalogMatches(data.data, body);
    this.selected = structuredClone(data.data); this.pending = null; this.allowedCommands = []; this.editPayload = null; this.assignment = null;
    return {replayed: data.replayed, historical: data.historical === true};
  }
}
export {TIME_CATALOG_KINDS, TIME_CATALOG_STATUSES};
