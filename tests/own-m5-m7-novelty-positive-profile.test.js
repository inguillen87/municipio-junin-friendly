import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const blocked=()=>{throw Error('UNIT_IO_FORBIDDEN');};
for(const[m,keys]of[[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dns,['lookup','resolve']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const k of keys)m[k]=blocked;
globalThis.fetch=blocked;syncBuiltinESMExports();
const profile=await import('../scripts/lib/own-m5-m7-novelty-positive-profile.mjs');
const {composeOwnM5M7ConnectedTransportSource}=await import('../scripts/lib/own-m5-m7-connected-transport-source.mjs');
const {prepareOwnReleaseAnnulmentAtomicTestTarget}=await import('../scripts/lib/own-payroll-release-annulment-atomic-pg.mjs');
const {ownM5M7PositiveOracle,runOwnM5M7NoveltyPositiveBusiness}=await import('../scripts/lib/own-m5-m7-novelty-positive-business.mjs');
const {createHash}=await import('node:crypto'),sha=x=>createHash('sha256').update(x).digest('hex'),root=new URL('../',import.meta.url),readRaw=f=>fs.readFileSync(new URL(f,root));
const commit='a'.repeat(40),runId='m5-m7-unit-profile-r1';
// Offline target-shape fixture only. It cannot create a native observation.
const raw=Buffer.from(JSON.stringify({branch:{id:'br-orange-rain-ac6uvvxu',project_id:'noisy-poetry-54471701',parent_id:'br-plain-dust-acpjgebb',primary:false,default:false},computes:[{id:'ep-aged-firefly-acoaqlsh',project_id:'noisy-poetry-54471701',branch_id:'br-orange-rain-ac6uvvxu',type:'read_write',disabled:false,pooler_enabled:false,host:'ep-aged-firefly-acoaqlsh.sa-east-1.aws.neon.tech'}]}));
const target=()=>prepareOwnReleaseAnnulmentAtomicTestTarget({major:17,branchCreationRaw:raw,branchCreationSha256:sha(raw)});
const build=reader=>profile.buildOwnM5M7NoveltyPositiveProfile({readRaw:reader??readRaw,sourceCommit:commit,testTargetAdmission:target(),runId});
test('new profile preserves original programme and adds only copied120; seed has48 rows and two real operator identities',()=>{
 const p=build();assert.equal(profile.assertOwnM5M7NoveltyPositiveProfile(p),p);assert.equal(p.expected.operators,2);assert.equal(p.expected.personsAfterApiCreate,3);assert.deepEqual(Object.keys(p.actors),['maker','checker']);assert.equal(p.bootstrapOwner.statements.length,48);assert.equal(p.baselineExpectedCounts.roleCapabilities,27);
 assert.equal(p.canonical.program.rules.length,3);assert.deepEqual(p.canonical.program.rules.filter(r=>r.code!=='120'),p.programmeSources.baseDefinition.rules);assert.deepEqual(p.canonical.program.bindings.filter(b=>b.key!=='addition'),p.programmeSources.baseDefinition.bindings);
 assert.equal(p.actors.maker.capabilities.includes('payroll.novelty.prepare'),true);assert.equal(p.actors.maker.capabilities.includes('payroll.calculation.approve'),false);assert.equal(p.actors.checker.capabilities.includes('payroll.novelty.approve'),true);
 assert.equal(p.seedEnd,'COMMIT');assert.equal(p.businessEnd,'ROLLBACK');assert.equal(p.executionAdmitted,false);assert.equal(p.template.parentRollbackRetentionClaimed,false);
});
test('extra capability INSERTs occur before their fresh membership and session, never as changes to existing roles',()=>{
 const p=build();for(const[name,cap]of[['maker','payroll.novelty.prepare'],['checker','payroll.novelty.approve']]){const role=p.actors[name].roleKey,rows=p.bootstrapOwner.statements,n=rows.findIndex(x=>x.text.startsWith('INSERT INTO public.iam_role_capability(')&&x.values[0]===role&&x.values[1]===cap);assert.ok(n>0);assert.ok(rows[n+1].text.startsWith('INSERT INTO public.tenant_membership('));assert.equal(rows[n+1].values[3],role);}
 assert.equal(p.bootstrapOwner.expectedCommands.filter(x=>x==='UPDATE').length,1);assert.equal(p.existingRolesUpdated,0);assert.equal(p.databaseGrantsAdded,0);
});
test('new mint rejects clones, observed flags and RAW drift',()=>{
 const p=build();assert.throws(()=>profile.assertOwnM5M7NoveltyPositiveProfile({...p}),/MINTED/);assert.throws(()=>profile.buildOwnM5M7NoveltyPositiveProfile({readRaw,sourceCommit:commit,testTargetAdmission:target(),runId,passed:true}),/OPTIONS/);
 let changed=false;const guarded=build(f=>changed&&f==='lib/internal-own-payroll-novelties.js'?Buffer.concat([readRaw(f),Buffer.from('\n')]):readRaw(f));changed=true;assert.throws(()=>profile.assertOwnM5M7NoveltyPositiveProfile(guarded),/BOOKEND/);
});
test('exact four RPC texts are still emitted by the real service; no arbitrary query is admitted',()=>{
 assert.equal(profile.assertOwnM5M7NoveltyRpcSource(readRaw('lib/internal-own-payroll-novelties.js').toString('utf8')),true);assert.equal(Object.keys(profile.OWN_M5_M7_NOVELTY_RPC).length,4);assert.equal(Object.hasOwn(profile.OWN_M5_M7_NOVELTY_RPC,'SELECT 1'),false);
 assert.throws(()=>profile.assertOwnM5M7NoveltyRpcSource(readRaw('lib/internal-own-payroll-novelties.js').toString('utf8').replace('own_novelty_command_v1($1::jsonb','own_novelty_command_v2($1::jsonb')),/CHANGED/);
});
test('transport projection has a complete finite inverse and a fresh factory/WeakMap guard',()=>{
 const p=composeOwnM5M7ConnectedTransportSource({readRaw});assert.equal(p.wholeInverseVerified,true);assert.equal(p.executes,false);assert.match(p.source,/createOwnM5M7NativeTestConnectedSessions/);assert.match(p.source,/assertOwnM5M7NativeTestConnectedBusiness/);assert.doesNotMatch(p.source,/export async function createOwnM7NativeTestConnectedSessions/);assert.ok(p.source.includes('const failures=new WeakMap(),connectedAdmissions=new WeakMap()'));assert.equal(p.sourceBookend(),true);
});
test('independent arithmetic oracle refuses amount/programme drift; no native execution is asserted',async()=>{
 const p=build(),o=ownM5M7PositiveOracle(p.canonical.program,'2026-10');assert.equal(o.totals.net,'120.10');assert.equal(o.rows.find(r=>r.conceptCode==='120').amount,'20.00');assert.equal(o.rows.find(r=>r.conceptCode==='101').amount,'10');assert.equal(o.municipalFormula,false);assert.throws(()=>ownM5M7PositiveOracle(p.canonical.program,'2026-10','2500'));
 const changed=JSON.parse(JSON.stringify(p.canonical.program));changed.rules[0].ruleReference+=' drift';assert.throws(()=>ownM5M7PositiveOracle(changed,'2026-10'));
 await assert.rejects(()=>runOwnM5M7NoveltyPositiveBusiness({plan:p,connected:{passed:true}}),/UNMINTED_SESSION/);
});
