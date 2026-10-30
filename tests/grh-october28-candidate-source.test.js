// Proposed aggregate-only source regressions. Not native/SQL admission.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{throw Error('OCTOBER28_SOURCE_TEST_IO_FORBIDDEN');};
for(const [module,keys] of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const key of keys)module[key]=denied;
globalThis.fetch=denied;syncBuiltinESMExports();
const {getGrhSourceProfile,defaultGrhSourceProfile}=await import('../scripts/lib/grh-source-profile.mjs');
const {successorCandidateProfile}=await import('../scripts/lib/grh-successor-package.mjs');
const {parseMultirunCandidateArgs}=await import('../scripts/verify-grh-multirun-candidate.mjs');
const {projectOctober28RegistryParent,OCTOBER28_REGISTRY_PARENT_SHA256,OCTOBER28_REGISTRY_CANDIDATE_SHA256}=await import('../scripts/lib/grh-october28-candidate-registry-source.mjs');
const ID='grh-junin-2026-10-28',CORE='grh-core-junin-2026-10-28-multirun';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const registry=()=>read('scripts/lib/grh-source-profiles.json');
const profile=()=>getGrhSourceProfile(ID,{allowCandidateRead:true});

test('the whole RAW inverse preserves every earlier profile and default',()=>{
 const bytes=registry(),chain=projectOctober28RegistryParent(bytes),parent=JSON.parse(chain.parentRegistryRaw),next=JSON.parse(bytes);
 assert.equal(hash(bytes),OCTOBER28_REGISTRY_CANDIDATE_SHA256);
 assert.equal(hash(chain.parentRegistryRaw),OCTOBER28_REGISTRY_PARENT_SHA256);
 assert.deepEqual(next.profiles.slice(0,-1),parent.profiles);
 assert.deepEqual(next.profiles.map(p=>p.id),[...parent.profiles.map(p=>p.id),ID]);
 assert.equal(next.defaultProfileId,parent.defaultProfileId);assert.equal(defaultGrhSourceProfile().id,'grh-junin-2026-08-06');
 assert.equal(chain.wholeInverseVerified,true);assert.equal(chain.sourceOnly,true);assert.equal(chain.sqlValidityGranted,false);
 assert.equal(chain.registryApplied,false);assert.equal(chain.legacy183SourcesModified,false);
});

test('the registry succession rejects altered RAW, added profiles or a changed prior value',()=>{
 const raw=registry();for(const changed of [Buffer.concat([raw,Buffer.from('\n')]),Buffer.from(raw.toString('utf8').replace('grh-junin-2026-08-06','grh-junin-2026-08-07')),Buffer.from(raw.toString('utf8').replace('"expectedContracts": 1','"expectedContracts": 2'))])assert.throws(()=>projectOctober28RegistryParent(changed),/REGISTRY_CANDIDATE_RAW_CHANGED/);
 assert.throws(()=>projectOctober28RegistryParent(JSON.stringify({...JSON.parse(raw),passed:true})),/REGISTRY_CANDIDATE_RAW_CHANGED/);
 assert.throws(()=>projectOctober28RegistryParent({passed:true}),/REGISTRY_RAW_REQUIRED/);
});

test('the audited October28 profile is explicit, candidate_only, multirun and count-exact',()=>{
 const p=profile();assert.equal(p.profileVersion,'3.0.0');assert.equal(p.publicationMode,'candidate_only');assert.equal(p.core.profileId,CORE);assert.equal(p.core.schemaVersion,2);
 assert.throws(()=>getGrhSourceProfile(ID),{code:'GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ'});
 assert.equal(getGrhSourceProfile(CORE,{allowCandidateRead:true}),p);
 assert.equal(p.source.sha256,'FEF5AADA3142E475D0519F7647377465D95EE55B4038AFF035FF7D41D5748CC1');
 assert.equal(p.source.gzipSha256,'9DAF87941A3D7C92A2EBD680B390C2455C8E9889A7A9C51696587D7E8884F110');
 assert.equal(p.source.logicalBytes,786820775);assert.equal(p.source.gzipBytes,45332016);assert.equal(p.source.cutoff,'2026-10-28T15:16:35');
 assert.deepEqual(p.curated.expectedCounts,{ausencia:31866,cargo:5,catego:156,convenio:14,familia:3656,gremio:6,legagremio:845,legajo:2458,licencia:3448,motause:27,motibaja:19,organiza:83,persona:2357,revista:3,sectores:36,vinculo:9});
 assert.deepEqual(p.core.expectedCounts,{calculo:4453281,concepto:294,histocal:635,histolegajo:845,legajo:2458,legamov:500446});
 assert.deepEqual(p.core.expectedReconciliation,{administrativeActive:871,liquidatedCurrent:845,activeAndLiquidated:844,activeNotLiquidated:27,liquidatedNotActive:1});
 assert.deepEqual(p.core.historicalInactiveSnapshotEvidence,{version:'grh-core-closed-inactive-snapshot-evidence.v1',expectedContracts:1,expectedAssignments:1});
 assert.equal(Object.hasOwn(p,'adoption'),false);assert.equal(Object.hasOwn(p,'targetBinding'),false);
});

test('all source cohorts and closures remain explicit without changing the administrative cohort',()=>{
 const p=profile();assert.equal(p.source.currentPayrollDate,'2026-10-31');assert.equal(p.source.currentPayrollClosureStatus,'closed');
 assert.equal(p.source.latestClosedMonthlyPayrollDate,'2026-10-31');assert.equal(p.source.latestClosedPayrollDate,'2026-10-31');
 assert.deepEqual(p.core.currentRunTypes,['F','M','O','V']);assert.deepEqual(p.core.expectedClosureStatusCounts,{closed:528,open:0,unknown:101});
 assert.deepEqual(p.core.currentRuns.map(r=>[r.companyCode,r.payrollDate,r.period,r.month,r.payrollType,r.closureStatus]),['F','M','O','V'].map(type=>['101','2026-10-31',2026,10,type,'closed']));
 assert.deepEqual(p.core.snapshotCohorts,[{period:2026,month:10,payrollType:'F',payrollDate:'2026-10-31',rows:1},{period:2026,month:10,payrollType:'M',payrollDate:'2026-10-31',rows:844}]);
 assert.throws(()=>{p.core.expectedReconciliation.administrativeActive=845;},TypeError);
});

test('only the new explicit offline selectors expand; unknown aliases and old CLI boundaries remain closed',()=>{
 assert.equal(successorCandidateProfile(ID),profile());
 assert.deepEqual(parseMultirunCandidateArgs(['/synthetic/private','--profile',ID]),{dataDir:'/synthetic/private',profileId:ID});
 for(const name of ['latest','grh-junin-2026-10-29','grh-junin-2026-08-06'])assert.throws(()=>successorCandidateProfile(name),{code:'SUCCESSOR_CANDIDATE_PROFILE_INVALID'});
 assert.throws(()=>parseMultirunCandidateArgs(['/synthetic/private','--profile','grh-junin-2026-10-14']),{code:'V2_USAGE'});
});

test('F remains unclassified while registry183 keeps parent authority and current RAW custody separately',()=>{
 const contract=JSON.parse(read('contracts/grh-payroll-type-map.v1.json'));
 assert.deepEqual(contract.verifiedMappings.map(r=>[r.sourceCode,r.canonicalType]),[['M','monthly']]);assert.ok(contract.unclassifiedSourceCodes.includes('F'));
 const legacy=read('scripts/lib/final-grh-source-review-admission-installation.mjs').toString('utf8');
 assert.ok(legacy.includes(OCTOBER28_REGISTRY_PARENT_SHA256));
 assert.ok(legacy.includes(OCTOBER28_REGISTRY_CANDIDATE_SHA256));
 assert.ok(legacy.includes('grh-october28-candidate-registry-source'));
 assert.ok(!legacy.includes('grh-junin-2026-10-28'));
});
