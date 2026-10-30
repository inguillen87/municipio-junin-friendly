// Source contracts supplement, never replace, four real PostgreSQL matrix cells.
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('all four native cells explicitly execute mixed196 composition and preserve SHA-bound failure artifacts',()=>{
 const w=read('.github/workflows/own-monthly-day-engine-source.yml'),r=read('scripts/verify-own-monthly-day-engine-source.mjs'),h=read('scripts/lib/own-monthly-day-technical-epochs.mjs');
 for(const x of['pg: [17, 18]','operational_pair_baseline: [pre107, published107]','fail-fast: false','cancel-in-progress: false','--fixed-composition=196','--source-commit=${{ github.sha }}','if: always()','if-no-files-found: error','tests/own-monthly-day-fixed-composition*.test.js'])assert.ok(w.includes(x),x);
 assert.equal(w.includes('continue-on-error'),false);
 for(const x of['buildMonthlyDayFixedCompositionQa','assertMonthlyDayFixedCompositionDurability','verifyMonthlyDayFixedCompositionCircuit','finalReviewAdmissionQaCleanup','assertOwnerAuthorityQaSourceBookend'])assert.ok(r.includes(x),x);
 for(const x of["'196-days-composition-installation'",'qa.localFixed.rollback','qa.localFixed.installation','qa.fixedComposition.beforeCheck'])assert.ok(h.includes(x),x);
 assert.ok(h.indexOf("setPhase('194-installation')")<h.indexOf("setPhase('196-days-composition-installation')"));
 for(const x of['const technicalEpochs=verifyOwnMonthlyDayTechnicalEpochs({qa,json:','expectRollback:expect,readFullSnapshot:outer,check,setPhase:','sql196Days:assertMonthlyDayFixedCompositionDurability','fixedComposition,noveltySuccession,proofs','assert.equal(technicalEpochs.passed,true)'])assert.ok(r.includes(x),x);
 assert.ok(r.indexOf("phase='canonical190-seed'")<r.indexOf('const technicalEpochs=verifyOwnMonthlyDayTechnicalEpochs('));
 assert.ok(r.indexOf('const technicalEpochs=verifyOwnMonthlyDayTechnicalEpochs(')<r.indexOf("phase='joint-native-full-circuit'"));
});

test('native scenario requires real193 full30 completion without157 and two independent partial fixed guards',()=>{const s=read('scripts/lib/own-monthly-day-fixed-composition-circuit-qa.mjs');for(const x of['payroll_fixed_registry_propose_v1','payroll_fixed_registry_review_v1',"Object.hasOwn(full.run.payload,'periodParticipation'),false",'full.run.saved.input.employees[0].fixedForcedAmounts[0]','sourceRowSha256',"await calculate('supplementary')",'nonMonthlyCompletedWith157:true',"await approve('16',false)",'PRORATION_REQUIRED','public.own_fixed_forced_capture_v1(c,','assert.equal(state().results,before.results)','recovered.saved,full.run.saved'])assert.ok(s.includes(x),x);assert.ok(s.includes("assert.equal(h.synthetic,true)"));assert.ok(s.includes("assert.equal(h.transport,'ci')"));assert.equal(/spawn|execFile|pg_ctl|psql/.test(s),false);});
