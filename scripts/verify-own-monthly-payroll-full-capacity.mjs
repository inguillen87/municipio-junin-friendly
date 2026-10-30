// One source-pinned canonical190 host; no second seed, transport or financial owner.
// This entry's constructors and native execution are reserved for reviewed CI.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyMunicipalOwnerProgram} from './verify-municipal-owner-program.mjs';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {OWN_FULL_CAPACITY_190_QA_ENTRIES} from './verify-own-payroll-full-capacity.mjs';
import {runOwnFullCapacity190Continuation} from './lib/own-payroll-full-capacity-190-continuation.mjs';
import {buildMonthlyDayFixedCompositionQa} from './lib/own-monthly-day-fixed-composition-qa.mjs';
import {buildOwnNoveltySuccessionQa} from './lib/own-novelty-succession-qa.mjs';
import {assertMonthlyDayInstallationDurability} from './lib/own-monthly-day-policy-qa.mjs';
import {assertOwnMonthlyDayDeclarationDurability} from './lib/own-monthly-day-declaration-installation.mjs';
import {assertOwnMonthlyDayEngineSourceDurability} from './lib/own-monthly-day-engine-source-installation.mjs';
import {assertMonthlyDayFixedCompositionDurability} from './lib/own-monthly-day-fixed-composition-installation.mjs';
import {assertOwnNoveltySuccessionDurability} from './lib/own-novelty-succession-installation.mjs';
import {verifyOwnMonthlyDayTechnicalEpochs} from './lib/own-monthly-day-technical-epochs.mjs';
import {ownInstallationFunctionPin} from './lib/own-payroll-installation.mjs';
import {MONTHLY193_PREREQUISITES} from './lib/own-monthly-day-declaration-installation.mjs';
import {monthlyQaRuntimeAcl} from './lib/own-monthly-participation-qa.mjs';
import {assertOwnMonthlyDaySharedPrerequisites} from './lib/own-monthly-day-shared-prerequisites.mjs';
import {ownerDecisionQaLiteral as q} from './lib/municipal-owner-adoption-decision-qa.mjs';
import {buildOwnMonetaryProgramQaProjection} from './lib/own-monetary-program-qa-projection.mjs';
import {verifyOwnMonetaryProgramTechnicalEpoch} from './lib/own-monetary-program-technical-epoch.mjs';
import {composeMonthlyFullLegacySupportPlan,installMonthlyFullLegacySupport} from './lib/monthly-full-legacy-support-qa.mjs';
import {composeOwnLiquidationBootstrap213Plan,installOwnLiquidationBootstrap213,OWN_LIQUIDATION_BOOTSTRAP213_ENTRIES} from './lib/own-liquidation-bootstrap213-installation.mjs';
import {prepareNovelty217Joint,installNovelty217Joint} from './lib/novelty-administrative217-joint.mjs';

const entries = [
  ...OWN_FULL_CAPACITY_190_QA_ENTRIES,
  'scripts/verify-own-monthly-payroll-full-capacity.mjs',
  'scripts/lib/owner-program-qa-continuation-preparation.mjs',
  'scripts/lib/own-monthly-day-qa-foundation.mjs',
  'scripts/lib/own-monthly-day-technical-epochs.mjs',
  'scripts/lib/own-monthly-day-shared-prerequisites.mjs',
  'tests/owner-program-qa-continuation-preparation.test.js',
  'tests/own-monthly-day-qa-foundation.test.js',
  'tests/own-monthly-day-technical-epochs.test.js',
  'tests/own-monthly-day-shared-prerequisites.test.js',
  'scripts/lib/own-monetary-program-qa-projection.mjs',
  'scripts/lib/own-monetary-program-guarded-installation.mjs',
  'scripts/lib/own-monetary-program-technical-epoch.mjs',
  'tests/novelty217-post199-source-epoch.test.js',
  ...OWN_LIQUIDATION_BOOTSTRAP213_ENTRIES
];

// Called only by the future reviewed CI preparation, before native execution.
// Expected metadata comes from source; a live catalogue is never its own oracle.
function sharedPrerequisitePins(definitions, aclSource, schema) {
  assert.ok(Array.isArray(definitions));
  assert.equal(typeof aclSource, 'string');
  const runtime = monthlyQaRuntimeAcl(aclSource, schema), byName = new Map();
  for (const definition of definitions) {
    if (!MONTHLY193_PREREQUISITES.some(name => new RegExp('CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?' + name + '\\(').test(definition))) continue;
    const original = ownInstallationFunctionPin(definition);
    const pin = {...original, runtime: runtime.has(original.signature.replace('public.', schema + '.'))};
    const previous = byName.get(pin.name);
    if (previous) assert.deepEqual(previous, pin, 'MONTHLY_SHARED_AMBIGUOUS_PREREQUISITE:' + pin.name);
    else byName.set(pin.name, pin);
  }
  assert.deepEqual([...byName.keys()].sort(), [...MONTHLY193_PREREQUISITES].sort(), 'MONTHLY_SHARED_REQUIRED_SOURCE_MISSING');
  return [...byName.values()];
}

function prepareMonthly(h) {
  assert.equal(h.qa.operationalPairBaseline, 'published107');
  const base = buildMonthlyDayFixedCompositionQa({
    major: h.major, sourceCommit: h.sourceCommit, read: h.read,
    schema: h.qa.schema, operationalPairBaseline: 'published107', foundation: h.qa
  });
  const monthly = buildOwnNoveltySuccessionQa({qa: base, read: h.read, sourceCommit: h.sourceCommit});
  assert.strictEqual(monthly.qa192.qa, h.qa, 'MONTHLY_FULL_FOUNDATION_REBUILT');
  assert.strictEqual(monthly.actor, h.qa.actor, 'MONTHLY_FULL_ACTOR_REBUILT');
  assert.strictEqual(monthly.checker, h.qa.checker, 'MONTHLY_FULL_CHECKER_REBUILT');
  assert.equal(monthly.schema, h.qa.schema, 'MONTHLY_FULL_SCHEMA_CHANGED');
  assert.equal(monthly.declarationFixtureActorsInstalled, false);
  const canonicalSource = [h.qa.seed, h.qa.predecessorInstallation.join(';\n'), h.qa.local.installation.join(';\n')].join(';\n');
  const sharedPrerequisites = assertOwnMonthlyDaySharedPrerequisites({
    canonicalHost: sharedPrerequisitePins(h.qa.foundation.foundation.foundation.owner.definitions, canonicalSource, h.qa.schema),
    documentary: sharedPrerequisitePins(monthly.qa193.foundation.base.definitions, monthly.qa193.foundation.seed, h.qa.schema),
    expected: monthly.batch.declaration.prerequisitePins, requiredNames: MONTHLY193_PREREQUISITES
  });
  const monetary = buildOwnMonetaryProgramQaProjection({
    foundation: h.qa, major: h.major, sourceCommit: h.sourceCommit, read: h.read,
    schema: h.qa.schema, operationalPairBaseline: 'published107', noveltySuccession: true
  });
  assert.equal(monetary.version, 'own-monetary-program-qa-projection.v2');
  assert.equal(monetary.monetaryFoundationMode, 'existing');
  assert.strictEqual(monetary.qa192.qa, h.qa, 'MONTHLY_FULL_MONETARY_FOUNDATION_REBUILT');
  assert.strictEqual(monetary.actor, h.qa.actor, 'MONTHLY_FULL_MONETARY_ACTOR_REBUILT');
  assert.strictEqual(monetary.checker, h.qa.checker, 'MONTHLY_FULL_MONETARY_CHECKER_REBUILT');
  assert.deepEqual(monetary.fixedComposition.afterPins, monthly.fixedComposition.afterPins, 'MONTHLY_FULL_MONETARY_FIXED_SOURCE_CHANGED');
  assert.deepEqual(monetary.novelty197.afterPins, monthly.novelty197.afterPins, 'MONTHLY_FULL_MONETARY_NOVELTY_SOURCE_CHANGED');
  for (const key of ['local', 'local193', 'localFixed', 'local197']) assert.deepEqual(monetary[key], monthly[key], 'MONTHLY_FULL_MONETARY_PRIOR_PHASE_CHANGED:' + key);
  const legacySupport=composeMonthlyFullLegacySupportPlan({monthly,foundation:h.qa,major:h.major,sourceCommit:h.sourceCommit,read:h.read});
  const liquidationBootstrap213=composeOwnLiquidationBootstrap213Plan({foundation:h.qa,major:h.major,sourceCommit:h.sourceCommit,read:h.read});
  const administrative217=prepareNovelty217Joint(h,monthly,monetary,liquidationBootstrap213);
  return {foundation: h.qa, context: {monthly, monetary, sharedPrerequisites, legacySupport, liquidationBootstrap213, administrative217}, sourceEntries: [...new Set([...Object.keys(monthly.sourceHashes), ...Object.keys(monetary.sourceHashes), ...legacySupport.sourceEntries, ...liquidationBootstrap213.sourceEntries, ...Object.keys(administrative217.sourceHashes)])]};
}

async function monthlyThenFull(h, settings = {}) {
  assert.ok(settings && typeof settings === 'object' && !Array.isArray(settings) && (Object.getPrototypeOf(settings) === Object.prototype || Object.getPrototypeOf(settings) === null));
  assert.ok(Reflect.ownKeys(settings).every(key => key === 'annulmentV2Browser' || key === 'annulmentPreparation' || key === 'positions210' || key === 'family195Business'));
  const annulmentV2Browser = Object.hasOwn(settings, 'annulmentV2Browser') ? settings.annulmentV2Browser : false;
  const annulmentPreparation = Object.hasOwn(settings, 'annulmentPreparation') ? settings.annulmentPreparation : false;
  assert.equal(typeof annulmentV2Browser, 'boolean');
  assert.equal(typeof annulmentPreparation, 'boolean');
  assert.ok(!annulmentPreparation || annulmentV2Browser, 'MONTHLY_209_REQUIRES_COMPLETE208');
  const positions210=Object.hasOwn(settings,'positions210')?settings.positions210:false;assert.equal(typeof positions210,'boolean');
  assert.ok(!positions210||(annulmentV2Browser&&annulmentPreparation),'POSITIONS210_REQUIRES_COMPLETE208_209');
  const family195Business = Object.hasOwn(settings, 'family195Business') ? settings.family195Business : false;
  assert.equal(typeof family195Business, 'boolean');
  assert.ok(!family195Business || (annulmentV2Browser && annulmentPreparation), 'MONTHLY_FAMILY195_REQUIRES_COMPLETE208_209');
  const {monthly: qa, monetary, sharedPrerequisites} = h.prepared ?? {};
  assert.ok(qa && qa.version === 'own-novelty-succession-qa.v1');
  assert.equal(sharedPrerequisites?.passed, true);
  assert.equal(sharedPrerequisites?.sourceMetadataOnly, true);
  assert.equal(sharedPrerequisites?.nativeExecutionProven, false);
  assert.strictEqual(qa.qa192.qa, h.qa);
  assert.strictEqual(qa.actor, h.qa.actor);
  assert.strictEqual(qa.checker, h.qa.checker);
  assert.equal(qa.schema, h.qa.schema);
  assert.equal(monetary?.version, 'own-monetary-program-qa-projection.v2');
  assert.equal(monetary.monetaryFoundationMode, 'existing');
  assert.strictEqual(monetary.qa192.qa, h.qa);
  assert.strictEqual(monetary.actor, h.qa.actor);
  assert.strictEqual(monetary.checker, h.qa.checker);
  assert.ok(h.sourceCustody && h.sourceCustody.sourceCommit === h.sourceCommit, 'MONTHLY_FULL_SOURCE_CUSTODY_REQUIRED');
  const legacySupport=installMonthlyFullLegacySupport(h);
  assert.equal(legacySupport.passed,true);
  const proofs = {};
  const technical = verifyOwnMonthlyDayTechnicalEpochs({
    qa, proofs, fixedComposition: true, noveltySuccession: true,
    json: (statements, {expectJson = true, ...options} = {}) => {
      assert.equal(typeof expectJson, 'boolean');
      const value = h.json(statements, options);
      if (expectJson) assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'MONTHLY_FULL_NATIVE_OBJECT_REQUIRED');
      return value;
    },
    expectRollback: h.expectRollback,
    readFullSnapshot: h.readFullSnapshot,
    setPhase: h.setPhase,
    check: (value, label) => {assert.ok(value, label); h.check(label);},
    durability: {
      sql192: assertMonthlyDayInstallationDurability,
      sql193: assertOwnMonthlyDayDeclarationDurability,
      sql194: assertOwnMonthlyDayEngineSourceDurability,
      sql196Days: assertMonthlyDayFixedCompositionDurability,
      sql197: assertOwnNoveltySuccessionDurability
    },
    privateHelperAclStatements: [`SELECT jsonb_build_object('days',(SELECT bool_or(has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.pronamespace=${q(qa.schema)}::regnamespace AND p.proname IN('own_monthly_days_capture_v1','own_monthly_days_source_v1','own_monthly_day_source_v2','own_monthly_day_capture_v2')),'ledger',has_table_privilege('municontrol_actions_runtime_app',${q(qa.schema+'.own_monthly_days_event')},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))`]
  });
  assert.equal(technical.passed, true);
  const monetaryTechnical = verifyOwnMonetaryProgramTechnicalEpoch({
    qa: monetary, foundation: h.qa, technicalEpochs: technical,
    json: h.json, expectRollback: h.expectRollback, readFullSnapshot: h.readFullSnapshot,
    setPhase: h.setPhase, check: (value, label) => {assert.ok(value, label); h.check(label);},
    sourceCustody: h.sourceCustody
  });
  assert.equal(monetaryTechnical.passed, true);
  const liquidationBootstrap213=installOwnLiquidationBootstrap213(h);
  assert.equal(liquidationBootstrap213.passed,true);
  const novelty217=installNovelty217Joint(h,{monetaryTechnical,liquidationBootstrap213});assert.equal(novelty217.durability.passed,true);
  h.setPhase('monthly-full-capacity-business');
  // All original855 guards,20 rules,17100 rows and accounting epochs remain inside
  // this unchanged continuation. Never seed/reset a population to make them pass.
  const capacity = annulmentV2Browser
    ? await runOwnFullCapacity190Continuation(h, {annulmentV2Browser: true, annulmentPreparation, family195Business,...(positions210?{positions210:true}:{})})
    : await runOwnFullCapacity190Continuation(h);
  assert.equal(capacity.passed, true);
  assert.equal(capacity.population, 855);
  assert.equal(capacity.conceptRows, 17100);
  h.check('same canonical190 foundation and live actors verify technical192/193/194/196/197 before unchanged full855 and one financial epoch owner');
  return {version: 'own-monthly-full-capacity-canonical190-native-qa.v1', passed: true,
    sourceCommit: h.sourceCommit, major: h.major, operationalPairBaseline: 'published107',
    sharedFoundation: true, sharedPrerequisites, legacySupport, liquidationBootstrap213, monthlyTechnical: technical, monetaryTechnical, novelty217, capacity,
    monthlyBusinessCovered: false, monetaryBusinessCovered: false, synthetic: true, productionWrites: 0,
    municipalAcceptance: false};
}

// Fixed callbacks reused by the one reviewed native208 entry; no caller SQL or callback injection.
export {entries as OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES, prepareMonthly as prepareOwnMonthlyFullCapacity, monthlyThenFull as continueOwnMonthlyFullCapacity};

export async function verifyOwnMonthlyPayrollFullCapacity(options) {
  assert.ok(options.operationalPairBaseline === undefined || options.operationalPairBaseline === 'published107', 'MONTHLY_FULL_PUBLISHED107_REQUIRED');
  const report = await verifyMunicipalOwnerProgram({...options, operationalPairBaseline: 'published107'}, {
    prepareContinuation: prepareMonthly, continuation: monthlyThenFull, continuationEntries: entries
  });
  assert.equal(report.passed, true); assert.equal(report.continuation?.passed, true);
  assert.equal(report.continuation?.monthlyTechnical?.passed, true);
  assert.equal(report.continuation?.monetaryTechnical?.passed, true);
  assert.equal(report.continuation?.capacity?.passed, true);
  assert.equal(report.priorDatabasePreserved, true); assert.equal(report.syntheticSchemaRemoved, true);
  assert.equal(report.sourceAfter?.passed, true);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyOwnMonthlyPayrollFullCapacity(ownerAuthorityQaOptions(process.argv.slice(2)))
    .then(report => console.log(JSON.stringify({passed: report.passed, sourceCommit: report.sourceCommit,
      major: report.major, monthlyTechnical: report.continuation.monthlyTechnical.passed,
      monetaryTechnical: report.continuation.monetaryTechnical.passed,
      fullCapacity: report.continuation.capacity.passed, monthlyBusiness: false, municipalAcceptance: false})))
    .catch(error => {console.error(error.stack); for (const cause of error.errors ?? []) console.error(cause.stack); process.exitCode = 1;});
}
