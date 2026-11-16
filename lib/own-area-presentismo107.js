// Pure proposal for the area's monthly parte. It neither authenticates source
// declarations nor authorizes, posts or calculates a payroll amount.
export const OWN_AREA_PRESENTISMO107_RULE_VERSION = 'own-area-presentismo107-rule.v1';
export const OWN_AREA_PRESENTISMO107_INPUT_VERSION = 'own-area-presentismo107-input.v1';
export const OWN_AREA_PRESENTISMO107_RESULT_VERSION = 'own-area-presentismo107-proposal.v1';
const DECISION = 'https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6923480164';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const NIL = '00000000-0000-0000-0000-000000000000';
const COUNT = /^(0|[1-9][0-9]{0,17})$/;
const MONTH = /^20(?:0[8-9]|[1-9][0-9])-(0[1-9]|1[0-2])-01$/;
const INCIDENCE_ORIGIN = 'additional_declared_107_excluding_101';
const ABSENCE_ORIGIN = 'declared_whole_unjustified_days_101';
const LOSS_PERCENT = Object.freeze({0:0, 1:33, 2:50, 3:100});
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const fail = () => { throw Object.assign(new Error('El parte requiere el contrato completo, sus cantidades enteras explícitas y referencias de origen válidas.'), {code:'OWN_AREA_PRESENTISMO107_INPUT_INVALID'}); };
const need = ok => { if (!ok) fail(); };
// JavaScript `$` may match before a trailing line break; require the whole value.
const canonical = (pattern,value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const uuid = value => canonical(UUID,value) && value !== NIL;
const hash = value => canonical(HASH,value);
const sourceId = value => canonical(SOURCE_ID,value);
const data = (value,key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value,key);
  return descriptor && Object.hasOwn(descriptor,'value') && descriptor.enumerable;
};
const exact = (value,keys) => {
  need(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype,null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => data(value,key)));
};
const dense = (value,max) => {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= max &&
    Reflect.ownKeys(value).length === value.length + 1);
  for (let i=0; i<value.length; i++) need(data(value,String(i)));
};
const day = value => canonical(/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,value) &&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
const count = value => value === null || canonical(COUNT,value);
const area = value => { exact(value,['organizationUnitSourceId','sectorSourceId']); need(Object.values(value).every(sourceId)); };
const sameArea = (a,b) => a.organizationUnitSourceId === b.organizationUnitSourceId && a.sectorSourceId === b.sectorSourceId;
const references = refs => {
  dense(refs,10000);
  const ids = new Set();
  for (const ref of refs) {
    exact(ref,['id','sha256']); need(uuid(ref.id) && hash(ref.sha256) && !ids.has(ref.id)); ids.add(ref.id);
  }
};

function validate(input) {
  exact(input,['version','periodMonth','subject','policy','cut','incidences107','absence101Days','tardiness']);
  need(input.version === OWN_AREA_PRESENTISMO107_INPUT_VERSION && canonical(MONTH,input.periodMonth));
  const subject = input.subject;
  exact(subject,['tenantId','sourceBindingId','contractId','identityToken','agreementCode','area']);
  need([subject.tenantId,subject.sourceBindingId,subject.contractId].every(uuid) && hash(subject.identityToken) && sourceId(subject.agreementCode));
  area(subject.area);
  if (input.policy !== null) {
    const policy = input.policy;
    exact(policy,['id','revision','sha256','ruleVersion','status','approvalId','scope','validFrom','validUntil']);
    need(uuid(policy.id) && hash(policy.sha256) && Number.isSafeInteger(policy.revision) && policy.revision > 0 &&
      typeof policy.ruleVersion === 'string' && policy.ruleVersion.length > 0 && policy.ruleVersion.length <= 100 &&
      ['draft','approved','revoked'].includes(policy.status) && (policy.approvalId === null || uuid(policy.approvalId)) &&
      (policy.validFrom === null || day(policy.validFrom)) && (policy.validUntil === null || day(policy.validUntil)) &&
      !(policy.validFrom !== null && policy.validUntil !== null && policy.validUntil < policy.validFrom));
    exact(policy.scope,['tenantId','sourceBindingId','area','agreementCodes']);
    need(uuid(policy.scope.tenantId) && uuid(policy.scope.sourceBindingId)); area(policy.scope.area);
    dense(policy.scope.agreementCodes,100);
    need(policy.scope.agreementCodes.every(sourceId) && new Set(policy.scope.agreementCodes).size === policy.scope.agreementCodes.length);
  }
  const cut = input.cut;
  exact(cut,['id','sha256','from','to','complete']);
  need(uuid(cut.id) && hash(cut.sha256) && day(cut.from) && day(cut.to) && cut.from <= cut.to && typeof cut.complete === 'boolean');
  for (const [component,origin] of [[input.incidences107,INCIDENCE_ORIGIN],[input.absence101Days,ABSENCE_ORIGIN]]) {
    exact(component,['quantity','origin','evidenceRefs']);
    need(count(component.quantity) && [origin,'unresolved'].includes(component.origin)); references(component.evidenceRefs);
  }
  exact(input.tardiness,['unconvertedCount','evidenceRefs']);
  need(count(input.tardiness.unconvertedCount)); references(input.tardiness.evidenceRefs);
  need(input.incidences107.evidenceRefs.length + input.absence101Days.evidenceRefs.length + input.tardiness.evidenceRefs.length <= 10000);
}

/**
 * Counts are declarations, not values inferred from missing clock marks. The
 * two arithmetic components must explicitly exclude each other; unresolved
 * composition or repeated evidence blocks the entire proposal without deduping.
 * Policy/source references are supplied evidence, not authentication performed
 * by this pure function. A future scoped server facade must establish them.
 */
export function evaluateAreaPresentismo107(input) {
  validate(input);
  const [year,month] = input.periodMonth.slice(0,7).split('-').map(Number);
  const periodEnd = new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const {subject,policy,cut,incidences107,absence101Days,tardiness} = input;
  const blockers = [];
  const block = code => { if (!blockers.includes(code)) blockers.push(code); };
  if (policy === null) block('POLICY_REQUIRED');
  else {
    if (policy.ruleVersion !== OWN_AREA_PRESENTISMO107_RULE_VERSION) block('POLICY_RULE_VERSION_MISMATCH');
    if (policy.status !== 'approved' || policy.approvalId === null) block('POLICY_APPROVAL_REQUIRED');
    const scope = policy.scope;
    if (scope.tenantId !== subject.tenantId || scope.sourceBindingId !== subject.sourceBindingId ||
        !sameArea(scope.area,subject.area) || !scope.agreementCodes.includes(subject.agreementCode)) block('POLICY_SCOPE_MISMATCH');
    if (policy.validFrom === null) block('POLICY_VALIDITY_REQUIRED');
    else if (policy.validFrom > input.periodMonth || policy.validUntil !== null && policy.validUntil < periodEnd) block('POLICY_PERIOD_NOT_COVERED');
  }
  const monthlyCut = cut.from === input.periodMonth && cut.to === periodEnd;
  const cutWithinMonth = cut.from >= input.periodMonth && cut.to <= periodEnd;
  if (!monthlyCut) block('MONTHLY_CUT_REQUIRED');
  if (!cut.complete) block('SOURCE_CUT_INCOMPLETE');

  let provenanceUsable = true;
  if (incidences107.origin !== INCIDENCE_ORIGIN || absence101Days.origin !== ABSENCE_ORIGIN) {
    block('COMPONENT_COMPOSITION_UNRESOLVED'); provenanceUsable = false;
  }
  // A whole civil absence day for one contract cannot occur twice in its cut.
  // This is consistency of the declared unit, not a working-calendar deduction.
  if (absence101Days.quantity !== null && BigInt(absence101Days.quantity) > BigInt(periodEnd.slice(8,10))) {
    block('ABSENCE101_EXCEEDS_MONTH_DAYS'); provenanceUsable = false;
  } else if (absence101Days.quantity !== null && cutWithinMonth) {
    const cutCivilDays = (Date.parse(cut.to+'T00:00:00Z') - Date.parse(cut.from+'T00:00:00Z')) / 86400000 + 1;
    if (BigInt(absence101Days.quantity) > BigInt(cutCivilDays)) {
      block('ABSENCE101_EXCEEDS_CUT_DAYS'); provenanceUsable = false;
    }
  }
  const seen = new Set();
  for (const component of [incidences107,absence101Days,tardiness]) for (const ref of component.evidenceRefs) {
    if (seen.has(ref.id)) { block('COMPONENT_EVIDENCE_OVERLAP'); provenanceUsable = false; }
    seen.add(ref.id);
  }
  for (const [name,component,key] of [['INCIDENCES107',incidences107,'quantity'],['ABSENCE101',absence101Days,'quantity'],['TARDINESS',tardiness,'unconvertedCount']]) {
    if (component[key] === null) block(name+'_COUNT_REQUIRED');
    else if (BigInt(component[key]) > 0n && component.evidenceRefs.length === 0) {
      block(name+'_EVIDENCE_REQUIRED'); provenanceUsable = false;
    }
  }
  // No tardiness-to-unit conversion is authorized by this rule. Even an already
  // saturated lower bound does not make an unresolved monthly input complete.
  if (tardiness.unconvertedCount !== null && BigInt(tardiness.unconvertedCount) > 0n) block('TARDINESS_CONVERSION_REQUIRED');

  let uncappedQuantity = null, knownQuantity107 = null;
  if (provenanceUsable && cutWithinMonth && incidences107.quantity !== null && absence101Days.quantity !== null) {
    const total = BigInt(incidences107.quantity) + BigInt(absence101Days.quantity);
    uncappedQuantity = total.toString();
    // A positive count can be a known lower bound of an incomplete month. A
    // zero is never asserted from a partial/incomplete cut or unknown tardiness.
    if (total > 0n || monthlyCut && cut.complete && tardiness.unconvertedCount === '0') knownQuantity107 = (total > 3n ? 3n : total).toString();
  }
  const proposedQuantity = blockers.length === 0 ? knownQuantity107 : null;
  return freeze({
    version:OWN_AREA_PRESENTISMO107_RESULT_VERSION,ruleVersion:OWN_AREA_PRESENTISMO107_RULE_VERSION,decisionEvidence:DECISION,
    periodMonth:input.periodMonth,subject:structuredClone(subject),policy:structuredClone(policy),cut:structuredClone(cut),
    components:{incidences107:structuredClone(incidences107),absence101Days:structuredClone(absence101Days),tardiness:structuredClone(tardiness)},
    status:blockers.length ? 'blocked' : 'proposed',blockers,uncappedQuantity,knownQuantity107,appliedCap:'3',
    proposedQuantity,authorizedQuantity:null,presentismoLossPercent:proposedQuantity === null ? null : LOSS_PERCENT[proposedQuantity],
    sourceAuthenticityVerified:false,policyAuthorizationVerified:false,coverageCertified:false,
    payrollEligible:false,payrollCalculated:false,payrollPosted:false,grhMutation:false,baseSalaryDiscount:null,
  });
}
