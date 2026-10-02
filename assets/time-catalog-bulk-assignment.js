import {timeCatalogPayload, timeCatalogRecord, timeCatalogReferenceKey, timeCatalogUuid, timeCatalogKey, timeCatalogExact, timeCatalogCommand} from './time-catalog-contract.js';

export const ASSIGNMENT_BULK_LIMIT = 100;
const requireValue = (ok, message) => { if (!ok) throw Error(message); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export async function assignmentBulkPlan(base, targets, dependencies) {
  timeCatalogPayload('assignment', base);
  requireValue(!Object.hasOwn(base, 'sourceContractId') && base.reference?.code?.length <= 47, 'Usá un código de hasta 47 caracteres para las nuevas asignaciones.');
  requireValue(Array.isArray(targets) && targets.length > 0 && targets.length <= ASSIGNMENT_BULK_LIMIT, 'Elegí entre 1 y 100 contratos. El conjunto no se recorta.');
  const ids = new Set();
  for (const target of targets) {
    requireValue(timeCatalogExact(target, ['contractId', 'legajo', 'name']) && timeCatalogUuid(target.contractId)
      && typeof target.legajo === 'string' && /^(?:0|[1-9]\d{0,19})$/.test(target.legajo)
      && (target.name === null || typeof target.name === 'string' && target.name.length <= 240 && !/[\u0000-\u001f\u007f]/.test(target.name))
      && !ids.has(target.contractId.toLowerCase()), 'Hay un contrato repetido o un destinatario inválido. Revisá toda la selección.');
    ids.add(target.contractId.toLowerCase());
  }
  requireValue(timeCatalogExact(dependencies, ['shift', 'calendar', 'ruleProfile']), 'Elegí las tres configuraciones aprobadas.');
  for (const [key, kind] of [['shift', 'shift'], ['calendar', 'calendar'], ['ruleProfile', 'rule_profile']]) {
    const record = timeCatalogRecord(dependencies[key]);
    requireValue(record.kind === kind && record.status === 'approved' && record.id === base.spec[key + 'EntryId']
      && record.timezone === base.timezone && record.effectiveFrom <= base.effectiveFrom
      && (record.effectiveTo === undefined || base.effectiveTo !== undefined && record.effectiveTo >= base.effectiveTo),
    'Las tres configuraciones deben estar aprobadas y cubrir toda la vigencia declarada.');
  }
  const entries = [];
  for (const target of targets) {
    const suffix = await timeCatalogReferenceKey('assignment', 'target.' + target.contractId.toLowerCase() + '.' + base.effectiveFrom);
    const code = base.reference.code + '.' + suffix.slice(0, 16);
    const payload = timeCatalogPayload('assignment', {...structuredClone(base), logicalKeyHash: await timeCatalogReferenceKey('assignment', code),
      reference: {...base.reference, code}, spec: {...base.spec, employmentContractId: target.contractId}});
    entries.push({target: structuredClone(target), payload});
  }
  requireValue(new Set(entries.map(row => row.payload.logicalKeyHash)).size === entries.length, 'Los códigos de asignación no son únicos. No se creó ningún borrador.');
  return freeze({entries, dependencies: structuredClone(dependencies), total: entries.length});
}

// Only the one already sent create-draft attempt survives withdrawn views.
// A new verified session must have exactly the original scope and capabilities.
export function restoreBulkAssignmentAttempt(session, attempt) {
  requireValue(session.scope && session.permissions.canPropose && session.permissions.canReadAssignments && !session.pending
    && timeCatalogExact(attempt, ['key', 'scope', 'body', 'generation']) && timeCatalogKey(attempt.key)
    && attempt.scope === session.scope && typeof attempt.body === 'string' && attempt.body.length <= 262144,
  'Verificá el acceso original antes de recuperar esta asignación. No se inicia otro envío.');
  let body;
  try { body = JSON.parse(attempt.body); } catch { throw Error('El intento original no pudo verificarse.'); }
  requireValue(timeCatalogExact(body, ['operation', 'payload']) && body.operation === 'command', 'El intento original no pudo verificarse.');
  const command = timeCatalogCommand(body.payload);
  requireValue(command.command === 'create_draft' && command.kind === 'assignment' && command.id === null
    && command.expectedVersion === 0 && command.scopeVersion === attempt.scope && command.manualValidationConfirmed === false,
  'La recuperación conserva sólo el borrador original de asignación.');
  session.pending = Object.freeze({...attempt, generation: session.generation});
  return session.attempt();
}
