// Shared, browser-safe checks for the additive monthly contract. No persistence.
const fail = () => { throw Error('La respuesta de novedades no cumple el contrato seguro. Volvé a consultar.'); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const code = value => typeof value === 'string' && /^(?:0|[1-9]\d{0,19})$/.test(value);
const month = value => typeof value === 'string' && /^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])-01$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === value.slice(0,10);
};
const inputText = (value,max) => typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const quantity = value => value === null || typeof value === 'string' && /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value) && !/^-0(?:\.0+)?$/.test(value);
const cents = value => value === null || typeof value === 'string' && /^-?(?:0|[1-9]\d{0,17})$/.test(value) && value !== '-0';
const states = new Set(['draft','submitted','approved','rejected','cancelled']);
const commands = new Set(['submit','approve','reject','cancel']);
const types = ['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
const subjectKeys = ['contractId','legajo','employeeName','identityToken','sourceCutoff'];
const nativeKeys = [...subjectKeys,'origin','registrationId','registeredAt'];
const inputKeys = ['rowOrdinal','legajo','conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced'];
const sameSet = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length && actual.every(value => expected.includes(value));
const effects = value => value.grhMutation === false && value.payrollCalculated === false && value.payrollPosted === false;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function assertNativeMonthlySubject(subject) {
  if (!exact(subject, nativeKeys) || subject.origin !== 'MUNICONTROL' || subject.sourceCutoff !== null
      || !uuid(subject.contractId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(subject.registrationId || '') || !hash(subject.identityToken)
      || !code(subject.legajo) || subject.employeeName !== null && !text(subject.employeeName,300)
      || !instant(subject.registeredAt)) fail();
  return subject;
}

export function verifyMonthlyEmployee(payload, contractId) {
  if (!(exact(payload,['version','subject']) || exact(payload,['ok','version','subject']) && payload.ok === true) || payload.version !== 'payroll-novelty-employee.v2' || !uuid(contractId)) fail();
  const subject = payload.subject;
  if (subject?.origin === 'MUNICONTROL') assertNativeMonthlySubject(subject);
  else if (!exact(subject, subjectKeys) || !uuid(subject.contractId) || !hash(subject.identityToken)
      || !code(subject.legajo) || subject.employeeName !== null && !text(subject.employeeName,300) || !instant(subject.sourceCutoff)) fail();
  if (subject.contractId.toLowerCase() !== contractId.toLowerCase()) fail();
  return subject;
}

function inputRow(row, periodMonth) {
  if (row.rowOrdinal !== 1 || !code(row.legajo) || !code(row.conceptSourceId)
      || row.costCenterSourceId !== null && !code(row.costCenterSourceId)
      || row.adjustmentMonth !== null && (!month(row.adjustmentMonth) || row.adjustmentMonth > periodMonth)
      || !quantity(row.quantityDecimal) || !cents(row.amountCents) || row.quantityDecimal === null && row.amountCents === null
      || row.movementType !== null && (typeof row.movementType !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(row.movementType))
      || row.legalInstrument !== null && !inputText(row.legalInstrument,160)
      || row.observation !== null && !inputText(row.observation,500)
      || typeof row.forced !== 'boolean' || row.forced && (row.amountCents === null || (row.observation?.length ?? 0) < 10)) fail();
}

export function buildNativeMonthlyDraft(draft, subject) {
  assertNativeMonthlySubject(subject);
  if (!exact(draft,['sourceMode','periodMonth','payrollType','rows']) || draft.sourceMode !== 'individual'
      || draft.payrollType !== 'monthly' || !month(draft.periodMonth) || !Array.isArray(draft.rows) || draft.rows.length !== 1
      || !exact(draft.rows[0],inputKeys) || draft.rows[0].legajo !== subject.legajo) fail();
  inputRow(draft.rows[0],draft.periodMonth);
  return freeze({...draft, rows:[{...draft.rows[0], contractId:subject.contractId, identityToken:subject.identityToken}]});
}

export function verifyMonthlyBatch(batch, {mode = 'detail'} = {}) {
  if (!['bootstrap','detail','receipt','export'].includes(mode)) fail();
  if (!object(batch) || !uuid(batch.id) || !['payroll-novelty-batch.v1','payroll-novelty-batch.v2'].includes(batch.contractVersion)
      || !states.has(batch.status) || !['individual','bulk'].includes(batch.sourceMode) || !types.includes(batch.payrollType)
      || !month(batch.periodMonth) || !Number.isSafeInteger(batch.version) || batch.version < 1
      || !Number.isSafeInteger(batch.rowCount) || batch.rowCount < 1 || batch.rowCount > 500
      || typeof batch.exportable !== 'boolean' || !effects(batch)) fail();
  if (['bootstrap','detail'].includes(mode) && (!Array.isArray(batch.allowedCommands)
      || new Set(batch.allowedCommands).size !== batch.allowedCommands.length || batch.allowedCommands.some(command => !commands.has(command))
      || typeof batch.canExport !== 'boolean' || batch.canExport && (batch.status !== 'approved' || !batch.exportable))) fail();
  if (mode === 'export' && (batch.status !== 'approved' || !batch.exportable)) fail();
  // Bootstrap may intentionally omit nominal rows. Every supplied native row is
  // still checked; missing authority is never treated as current identity.
  if (!Array.isArray(batch.rows)) fail();
  if (mode !== 'bootstrap' && batch.rows.length !== batch.rowCount && !(mode === 'receipt' && batch.contractVersion === 'payroll-novelty-batch.v1' && batch.rows.length === 0)) fail();
  if (batch.contractVersion === 'payroll-novelty-batch.v2') {
    if (batch.rowCount !== 1 || batch.sourceMode !== 'individual' || batch.payrollType !== 'monthly') fail();
    if (Array.isArray(batch.rows) && batch.rows.length !== 0 && batch.rows.length !== 1) fail();
    if (mode === 'bootstrap' && batch.rows.length === 0 && (batch.allowedCommands.length !== 0 || batch.canExport !== false)) fail();
    for (const row of batch.rows || []) {
      if (!exact(row,[...inputKeys,'employmentContractId','issues','subject',...(mode==='receipt'?[]:['identityCurrent'])]) || !Array.isArray(row.issues)) fail();
      assertNativeMonthlySubject(row.subject);
      if (row.employmentContractId !== row.subject.contractId || row.legajo !== row.subject.legajo) fail();
      inputRow(row,batch.periodMonth);
      if (mode === 'receipt') { if (Object.hasOwn(row,'identityCurrent')) fail(); }
      else if (typeof row.identityCurrent !== 'boolean' || mode === 'export' && row.identityCurrent !== true) fail();
      if (row.identityCurrent === false && (batch.canExport === true || batch.allowedCommands?.some(command => ['submit','approve'].includes(command)))) fail();
    }
  }
  return batch;
}

export function verifyMonthlyBootstrap(payload) {
  const limits = payload?.limits, feature = payload?.feature, principal = payload?.principal;
  if (!object(payload) || !object(limits) || !object(feature) || !object(principal)
      || limits.contractVersion !== 'payroll-novelty-batch.v2' || feature.contractVersion !== 'payroll-novelty-batch.v2'
      || limits.approvalEffect !== 'export_only' || feature.approvalEffect !== 'export_only' || !effects(limits)
      || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1 || limits.maxRows > 500 || !sameSet(limits.sourceModes,['individual','bulk']) || !sameSet(limits.payrollTypes,types)
      || !exact(limits.native,['maxRows','sourceModes','payrollTypes']) || limits.native.maxRows !== 1
      || !sameSet(limits.native.sourceModes,['individual']) || !sameSet(limits.native.payrollTypes,['monthly'])
      || !['tenantId','membershipId','certifiedBindingId'].every(key => uuid(principal[key]))
      || !Array.isArray(principal.capabilities) || principal.capabilities.some(cap => !text(cap,100))
      || new Set(principal.capabilities).size !== principal.capabilities.length || !Array.isArray(payload.batches)) fail();
  payload.batches.forEach(batch => verifyMonthlyBatch(batch,{mode:'bootstrap'}));
  return payload;
}

// The stored body, rather than mutable form state, is the only retry input.
export function monthlyWriteAttempt({url,command,payload,key,scopeKey}) {
  if (!['prepare',...commands].includes(command) || !uuid(key) || !text(scopeKey,500)
      || !['/api/internal-payroll-novelties','/api/internal-payroll-novelties?version=2'].includes(url) || !object(payload)) fail();
  return Object.freeze({url,command,key,scopeKey,body:JSON.stringify({command,payload})});
}
