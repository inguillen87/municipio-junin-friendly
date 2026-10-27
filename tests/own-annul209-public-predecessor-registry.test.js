import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {composeOwnAnnul209PublicPredecessorRegistry,derivePublishedNativeContext067Source,assertOwnAnnul209PublicPredecessorRegistry,ownAnnul209PublicPredecessor,bookendOwnAnnul209PublicPredecessorRegistry,OWN_ANNUL209_PUBLIC_REGISTRY_VERSION,OWN_ANNUL209_PUBLIC_PHASE} from '../scripts/lib/own-annul209-public-predecessor-registry.mjs';
import {buildMunicipalOwnerAdoptionAuthorityInstallation} from '../scripts/lib/municipal-owner-adoption-authority-installation.mjs';
const overrides=new Map(),rawRead=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),read=file=>overrides.has(file)?overrides.get(file):rawRead(file),sourceCommit='a'.repeat(40),operationalPairBaseline='published107';
const sha=value=>createHash('sha256').update(value).digest('hex'),lf=value=>value.replace(/\r\n?/g,'\n');
const body=definition=>/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition)[2];
let attempted=false,cached,failure;
function registry(){if(!attempted){attempted=true;try{cached=composeOwnAnnul209PublicPredecessorRegistry({read,sourceCommit,operationalPairBaseline});}catch(error){failure=error;}}if(failure)throw failure;return cached;}

test('public sources select the complete50-function walk including string trigger references, eleven exact private ACLs and Date092',()=>{
 const r=registry();assert.equal(r.version,OWN_ANNUL209_PUBLIC_REGISTRY_VERSION);assert.equal(r.phase,OWN_ANNUL209_PUBLIC_PHASE);assert.equal(r.schema,'public');assert.equal(r.sourceCommit,sourceCommit);assert.equal(r.operationalPairBaseline,'published107');
 assert.equal(r.entries.length,50);assert.equal(new Set(r.entries.map(e=>e.pin.signature)).size,50);assert.deepEqual(r.closure.memberNames,r.entries.map(e=>e.pin.name).sort());assert.equal(r.closure.memberCount,50);assert.deepEqual(r.closure.unresolvedMetadata,[]);assert.equal(r.observedMetadataUsed,false);assert.equal(r.qaSeedCopied,false);assert.equal(r.qaGraphUsed,false);assert.equal(r.normalizerAccepted,false);assert.equal(r.executionAdmitted,false);
 for(const e of r.entries){assert.equal(e.key,e.pin.signature+'|'+e.pin.sha256);assert.equal(e.sourceDefinitionSha256,sha(e.definition));assert.equal(e.sourceBodySha256,sha(body(e.definition)));assert.equal(e.sourceBodySha256,e.pin.sha256);assert.equal(typeof e.pin.runtime,'boolean');assert.ok(e.origins.length>0);assert.ok(!e.definition.includes('mc_qa_fixed_092_'));}
 const privateNames=['own_run_immutable_v1','own_liquidation_immutable_v1','own_close_immutable_v1','own_annul_immutable_v1','native_salary_context_v1','payroll_fixed_registry_subject_by_contract_v1','payroll_fixed_registry_subject_v1','native_employment_change_lock_v1','native_employment_change_subject_v1','native_employment_catalog_lock_v1','grh_curated_source_read_lock_v1'];
 assert.deepEqual(r.privateScalarSignatures.map(s=>s.slice(7,s.indexOf('('))).sort(),privateNames.sort());
 for(const signature of r.privateScalarSignatures){const e=ownAnnul209PublicPredecessor(r,signature);assert.equal(e.pin.runtime,false);const proof=e.origins.find(o=>o.kind==='private-source-rule');assert.ok(proof);const text=lf(read(proof.definitionSource));assert.ok(text.includes(proof.acl.revokeStatement));assert.deepEqual([...text.matchAll(/\bGRANT EXECUTE ON FUNCTION [\s\S]*?;/g)].map(m=>m[0]),proof.acl.grantStatements);assert.ok(proof.acl.grantStatements.every(s=>!s.includes(signature)));}
 for(const name of['own_run_immutable_v1','own_liquidation_immutable_v1','own_close_immutable_v1','own_annul_immutable_v1'])assert.ok(r.closure.roots.includes(name));
 assert.ok(r.closure.edges.some(e=>e.from==='native_employment_lifecycle_intervals_v1'&&e.to==='payroll_fixed_registry_date_v1'));
 const date=ownAnnul209PublicPredecessor(r,'public.payroll_fixed_registry_date_v1(text,boolean)');assert.equal(date.pin.defaults,'true');assert.equal(date.pin.sha256,'dd36fdd1ed32b385a7d269c461759943db267997449075c19d843beeff3443f9');assert.equal(date.pin.runtime,false);assert.match(date.definition,/required boolean DEFAULT true/);assert.ok(!date.definition.includes('DEFAULT false'));
 const table=ownAnnul209PublicPredecessor(r,'public.tenant_iam_effective_capabilities(uuid)');assert.equal(table.pin.kind,'table');assert.deepEqual(table.pin.argNames,['p_membership_id','capability_key']);assert.deepEqual(table.pin.argModes,['i','t']);assert.deepEqual(table.pin.allArgTypes,['uuid','varchar']);assert.deepEqual(table.pin.declaredOutputColumns,[{name:'capability_key',declaredType:'varchar(96)',catalogType:'varchar'}]);assert.equal(table.pin.runtime,false);assert.equal(table.pin.returnsSet,true);
 assert.equal(r.triggerSources.length,10);assert.equal(new Set(r.triggerSources.map(t=>t.table)).size,5);assert.match(r.guards.ledgerTriggers,/count\(\*\) FROM pg_trigger[\s\S]*<>2/);assert.match(r.guards.predecessorAcl,/is_grantable/);assert.match(r.guards.predecessorAcl,/grantor<>p.proowner/);
});

test('the missing published067 body derives from public067/095 by finite whitespace-only inverses, without losing a literal or metadata field',()=>{
 const d=derivePublishedNativeContext067Source({read}),source=lf(read('scripts/migrations/067-native-employee-registration.sql'));
 const original=/\bCREATE OR REPLACE FUNCTION native_employee_context_v1\([\s\S]*?\bAS\s+(\$\w*\$)[\s\S]*?\1/.exec(source)[0];assert.equal(d.original,original);
 assert.equal(d.beforePin.sha256,'30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed');assert.equal(d.pin.sha256,'0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c');assert.deepEqual({...d.beforePin,sha256:null},{...d.pin,sha256:null});
 assert.equal(d.operators.length,14);let restored=d.definition;for(const[a,b]of[...d.operators].reverse()){assert.equal(a.replace(/\s/g,''),b.replace(/\s/g,''));assert.equal(restored.split(b).length,2);restored=restored.replace(b,()=>a);}assert.equal(restored,original);assert.equal(body(d.definition).replace(/\s/g,''),body(original).replace(/\s/g,''));assert.deepEqual(body(d.definition).match(/'(?:[^']|'')*'/g),body(original).match(/'(?:[^']|'')*'/g));assert.equal(d.wholeInverse,true);assert.equal(d.sqlLiteralsUnchanged,true);assert.equal(d.observedMetadataUsed,false);
 assert.equal(ownAnnul209PublicPredecessor(registry(),d.pin.signature).definition,d.definition);
});

test('the authority184 guard is unchanged and the ENTIRE27-record201 guard projects only its snapshot body to215',()=>{
 const r=registry(),authority=buildMunicipalOwnerAdoptionAuthorityInstallation({read,sourceCommit,operationalPairBaseline});assert.equal(r.guards.authority184,authority.afterCheck);assert.equal(r.authority184.prerequisitePins.length,6);assert.equal(r.authority184.supportPins.length,2);assert.deepEqual(r.authority184.prerequisitePins,authority.prerequisitePins);assert.deepEqual(r.authority184.supportPins,authority.supportPins);
 const source=lf(read('scripts/migrations/201-own-full-payroll-decision-capacity.sql')),a=source.indexOf('DO $capacity_postflight$'),z=source.indexOf('END $capacity_postflight$;',a)+'END $capacity_postflight$;'.length,original=source.slice(a,z),c=r.capacityEpoch;
 assert.equal(c.originalPostflight,original);assert.equal(c.originalPost.length,27);assert.equal(c.post215.length,27);assert.equal(c.unchangedOtherRecords,26);assert.equal(c.changedSignature,'public.own_close_snapshot_v1(jsonb,jsonb)');assert.equal(c.wholeGuardInverse,true);
 const old=c.originalPost.find(p=>p.signature===c.changedSignature),next=c.post215.find(p=>p.signature===c.changedSignature);assert.equal(old.bodySha256,'11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0');assert.equal(next.bodySha256,'ab02d41cd331b76a1217ce04b605d1fe099891cf5d897aee3c716affe2e2cea2');assert.deepEqual({...old,bodySha256:null},{...next,bodySha256:null});
 assert.equal(c.postflight215.split(next.bodySha256).length,2);assert.equal(c.postflight215.replace(next.bodySha256,old.bodySha256),original);assert.deepEqual(c.originalPost.filter(p=>p.signature!==c.changedSignature),c.post215.filter(p=>p.signature!==c.changedSignature));assert.equal(r.guards.capacity215,c.postflight215);
});

test('registry identity, exact phase/options and immutable source descriptors cannot be forged by a cloned object or caller QA graph',()=>{
 const r=registry();assert.equal(assertOwnAnnul209PublicPredecessorRegistry(r,{sourceCommit}),r);assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.entries));assert.ok(Object.isFrozen(r.entries[0].pin));
 assert.throws(()=>assertOwnAnnul209PublicPredecessorRegistry({...r},{sourceCommit}),/MINTED_REGISTRY_REQUIRED/);assert.throws(()=>bookendOwnAnnul209PublicPredecessorRegistry({...r}),/MINTED_REGISTRY_REQUIRED/);assert.throws(()=>ownAnnul209PublicPredecessor({...r},r.entries[0].pin.signature),/MINTED_REGISTRY_REQUIRED/);assert.throws(()=>assertOwnAnnul209PublicPredecessorRegistry(r,{sourceCommit:'b'.repeat(40)}),/COMMIT_CHANGED/);
 assert.throws(()=>ownAnnul209PublicPredecessor(r,'public.other_function()'),/SELECTED_SIGNATURE_REQUIRED/);assert.throws(()=>{r.entries[0].pin.runtime=!r.entries[0].pin.runtime;},TypeError);
 let reads=0;for(const extra of[{qa:{}},{graph:new Map()},{normalized:s=>s},{schema:'public'},{phase:'post201'}])assert.throws(()=>composeOwnAnnul209PublicPredecessorRegistry({read:()=>{reads++;throw Error('I/O forbidden');},sourceCommit,operationalPairBaseline,...extra}),/OPTIONS_EXACT/);assert.equal(reads,0);
 assert.throws(()=>composeOwnAnnul209PublicPredecessorRegistry({read,sourceCommit,operationalPairBaseline:'pre107'}),/PUBLISHED107_REQUIRED/);
});

test('whole-source changes reject before planning and a RAW-only newline drift poisons the later bookend even with the same LF digest',()=>{
 for(const file of['scripts/migrations/006-tenant-action-authority.sql','scripts/migrations/067-native-employee-registration.sql','scripts/migrations/092-payroll-fixed-novelties.sql','scripts/migrations/095-native-employee-jurisdiction.sql','scripts/migrations/197-own-novelty-succession.sql','scripts/migrations/208-own-annulment-review-index.sql'])assert.throws(()=>composeOwnAnnul209PublicPredecessorRegistry({read:p=>p===file?rawRead(p)+'\n-- foreign drift':rawRead(p),sourceCommit,operationalPairBaseline}),/PUBLIC209_SOURCE_CHANGED/);
 const r=registry(),file=r.sourceInputs.find(p=>p.path==='scripts/migrations/006-tenant-action-authority.sql').path,original=rawRead(file),drift=original.includes('\r\n')?original.replace('\r\n','\n'):original.replace('\n','\r\n');assert.notEqual(drift,original);assert.equal(sha(lf(drift)),sha(lf(original)));
 try{overrides.set(file,drift);assert.throws(()=>bookendOwnAnnul209PublicPredecessorRegistry(r),/RAW_SOURCE_BOOKEND_CHANGED/);assert.throws(()=>assertOwnAnnul209PublicPredecessorRegistry(r,{sourceCommit}),/RAW_SOURCE_BOOKEND_CHANGED/);}finally{overrides.delete(file);}
 assert.equal(bookendOwnAnnul209PublicPredecessorRegistry(r).sourceVerified,true);
});

test('seven208 definitions and exact source ACL remain REQUIRED data; source planning never fabricates a native receipt or209 admission',()=>{
 const r=registry(),required=r.required208,source=lf(read('scripts/migrations/208-own-annulment-review-index.sql')),definitions=[...source.matchAll(/EXECUTE \$definition_208\$(CREATE FUNCTION public\.[\s\S]*?)\$definition_208\$;/g)].map(m=>m[1]);
 assert.deepEqual(required.definitions,definitions);assert.equal(required.functions,7);assert.equal(required.pins.length,7);assert.equal(required.pins.filter(p=>p.runtime).length,4);assert.equal(required.pins.filter(p=>!p.runtime).length,3);for(let i=0;i<7;i++)assert.equal(required.pins[i].sha256,sha(body(definitions[i])));
 assert.equal(required.realValidatedReceiptRequired,true);assert.equal(required.epoch208FingerprintBefore209Required,true);assert.equal(required.receiptIssued,false);assert.equal(required.publicInstalledProofVersion,'own-annulment-review208-installation-proof.v1');assert.equal(required.sourceSqlSha256,sha(source));assert.equal(required.sourceFunctionGuard,r.guards.required208Functions);
 for(const p of required.pins){assert.ok(required.sourceFunctionGuard.includes(p.signature));assert.ok(required.sourceFunctionGuard.includes(p.sha256));}assert.equal(r.executionAdmitted,false);assert.equal(r.connects,false);assert.equal(r.executesSql,false);assert.equal(r.roleAssignmentsAdded,0);assert.equal(r.installation,undefined);assert.equal(r.passed,undefined);
});
