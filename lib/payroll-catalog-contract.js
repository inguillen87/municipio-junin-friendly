import { PARAMETER_RULES, PARAMETER_SOURCE_SHA } from './payroll-parameter-contract.js';
export const CATALOG_CONTRACT = 'payroll-auxiliary-catalog.v1';
export const catalogPeriod = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
export const catalogRevision = v => Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const cents = v => typeof v === 'string' && /^[1-9][0-9]{0,10}$/.test(v);
const reference = v => typeof v === 'string' && v.length > 0 && v.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(v);
function assert(check) { if (!check) throw new Error('La respuesta del catálogo no superó la verificación.'); }
function checkValue(row) {
  assert(row && cents(row.newValueCents));
  const rule = PARAMETER_RULES.find(r => r.auxiliary === row.auxiliaryId && r.baseClass === row.baseClass && r.agreements.includes(row.agreementId));
  assert(rule && row.referenceConceptId === rule.concept);
  return rule;
}
export function verifyCatalogResponse(value) {
  assert(value?.contractVersion === CATALOG_CONTRACT && value.payrollCalculated === false && value.payrollPosted === false);
  const c = value.catalog;
  if (c) {
    assert(catalogPeriod(c.period) && catalogRevision(c.revision) && Array.isArray(c.rows) && c.rows.length <= 9);
    const keys = new Set();
    for (const row of c.rows) {
      const rule = checkValue(row), key = row.agreementId + ':' + row.auxiliaryId;
      assert(!keys.has(key)); keys.add(key);
      assert(row.ruleId === rule.id && row.sourceSha256 === PARAMETER_SOURCE_SHA && reference(row.sourceReference));
      assert(uuid(row.activationId) && uuid(row.proposalId) && catalogRevision(row.activationRevision) && row.activationRevision > 0 && row.activationRevision <= c.revision);
      assert(Number.isInteger(row.proposalVersion) && row.proposalVersion > 0 && catalogPeriod(row.validFrom) && row.validFrom <= c.period);
      assert(typeof row.activatedAt === 'string' && Number.isFinite(Date.parse(row.activatedAt)));
    }
    if (value.currentRevision !== undefined) assert(catalogRevision(value.currentRevision) && c.revision <= value.currentRevision);
  }
  if (value.preview) {
    const p = value.preview;
    assert(uuid(p.proposalId) && Number.isInteger(p.proposalVersion) && p.proposalVersion > 0 && catalogRevision(p.catalogRevision));
    assert(catalogPeriod(p.validFrom) && reference(p.sourceReference) && typeof p.canActivate === 'boolean');
    assert(Array.isArray(p.changes) && p.changes.length > 0 && p.changes.length <= 3);
    const ids = new Set();
    for (const row of p.changes) {
      checkValue(row); assert(!ids.has(row.agreementId)); ids.add(row.agreementId);
      assert(row.previousValueCents === null || cents(row.previousValueCents));
      assert(row.previousValueCents === null ? row.previousActivationRevision === null && row.previousValidFrom === null
        : catalogRevision(row.previousActivationRevision) && row.previousActivationRevision > 0 && row.previousActivationRevision <= p.catalogRevision && catalogPeriod(row.previousValidFrom) && row.previousValidFrom <= p.validFrom);
    }
    assert(p.blockedReason === null || Object.hasOwn(CATALOG_BLOCK_REASONS, p.blockedReason));
    assert(p.canActivate === (p.blockedReason === null));
  }
  if (value.activation) {
    const a = value.activation;
    assert(c && uuid(a.id) && uuid(a.proposalId) && Number.isInteger(a.proposalVersion) && a.proposalVersion > 0);
    assert(a.revision === c.revision && a.validFrom === c.period && catalogPeriod(a.validFrom));
    assert(typeof value.replayed === 'boolean' && typeof a.activatedAt === 'string' && Number.isFinite(Date.parse(a.activatedAt)));
    assert(c.rows.some(r => r.activationId === a.id && r.activationRevision === a.revision && r.proposalId === a.proposalId && r.proposalVersion === a.proposalVersion));
  }
  assert(Boolean(c || value.preview)); return value;
}
export const CATALOG_BLOCK_REASONS = Object.freeze({
  already_activated: 'Esta propuesta ya fue activada. Consultá sus valores en el catálogo.',
  reviewer_required: 'La activación corresponde al perfil revisor de parámetros.',
  employment_required: 'La cuenta revisora necesita un vínculo laboral verificado.',
  independent_reviewer_required: 'La persona que preparó la propuesta no puede activarla.',
  past_period: 'Esta etapa no admite activar vigencias de meses anteriores. Prepará el cambio para el período correspondiente.',
});
export function catalogMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Mendoza', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
}
