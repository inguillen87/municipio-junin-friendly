import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {composeOwnFullCapacity190PublicInstallation,assertOwnFullCapacity190PublicDurability,assertOwnFullCapacity190PublicProof,ownFullCapacity190Conservation,OWN_FULL_CAPACITY_190_SQL,OWN_FULL_CAPACITY_190_SQL_SHA256,OWN_FULL_CAPACITY_190_PUBLIC_VERSION,OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE,OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE_SHA256} from '../scripts/lib/own-full-capacity-190-public-installation.mjs';
import {buildOwnReportCensusInstallation,OWN_REPORT_CENSUS_MIGRATION} from '../scripts/lib/own-payroll-report-census-installation.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'b'.repeat(32);
const sha=v=>createHash('sha256').update(v).digest('hex');
const body=d=>/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?$/.exec(d)[2];

test('the complete existing QA installer remains exactly the pinned source',()=>{
 assert.equal(sha(read(OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE).replace(/\r\n?/g,'\n')),OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE_SHA256);
});
test('the finite conservation copy reverses to the complete original function and emits the same namespace contract',()=>{
 const original=read(OWN_FULL_CAPACITY_190_CONSERVATION_SOURCE).replace(/\r\n?/g,'\n');
 const oldStart=original.indexOf('function conservation(h,{legacyNames,newNames}){'),oldEnd=original.indexOf('export function composeOwnFullCapacity190Installation(h){',oldStart);assert.ok(oldStart>=0&&oldEnd>oldStart);
 const candidate=read('scripts/lib/own-full-capacity-190-public-installation.mjs'),newStart=candidate.indexOf('export function ownFullCapacity190Conservation('),newEnd=candidate.indexOf('export const OWN_FULL_CAPACITY_190_PUBLIC_VERSION=',newStart);assert.ok(newStart>=0&&newEnd>newStart);
 const header="export function ownFullCapacity190Conservation({schema,sourceCommit},{legacyNames,newNames}){\n assert.match(schema,/^(?:public|mc_qa_fixed_092_[a-f0-9]{32})$/,'M7_190_CONSERVATION_NAMESPACE');assert.match(sourceCommit,/^[a-f0-9]{40}$/,'M7_190_CONSERVATION_COMMIT');";
 const restored=candidate.slice(newStart,newEnd).trimEnd().replace(header,'function conservation(h,{legacyNames,newNames}){').replace('const s=schema,','const s=h.qa.schema,').replace('${q(sourceCommit)}','${q(h.sourceCommit)}');
 assert.equal(restored,original.slice(oldStart,oldEnd).trimEnd(),'M7_PUBLIC201_CONSERVATION_COPY_CHANGED');
 const sql=read(OWN_FULL_CAPACITY_190_SQL),open=sql.indexOf('DO $capacity_postflight$'),tail=sql.slice(open),literal=/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(tail);assert.ok(literal);
 const post=JSON.parse(literal[1].replaceAll("''","'")),names={legacyNames:post.filter(p=>p.kind==='legacy'||p.kind==='known_census_successor').map(p=>p.name),newNames:post.filter(p=>p.kind==='core'||p.kind==='full').map(p=>p.name)};
 const qaKeep=ownFullCapacity190Conservation({schema,sourceCommit},names),publicKeep=ownFullCapacity190Conservation({schema:'public',sourceCommit},names);
 for(const key of['before','after','compare','proof'])assert.equal(qaKeep[key].replaceAll(schema,'public'),publicKeep[key]);
 assert.ok(qaKeep.before.includes("'"+schema+"'::regnamespace")&&!qaKeep.before.includes("'public'::regnamespace"));
 assert.throws(()=>ownFullCapacity190Conservation({schema:'other',sourceCommit},names),/M7_190_CONSERVATION_NAMESPACE/);
});
test('the public plan is the pinned SQL201 between public conservation bookends, with the exact source200 predecessor',()=>{
 const plan=composeOwnFullCapacity190PublicInstallation({read,sourceCommit}),census=buildOwnReportCensusInstallation({read,sourceCommit});
 assert.equal(plan.version,OWN_FULL_CAPACITY_190_PUBLIC_VERSION);assert.equal(plan.schema,'public');assert.equal(plan.sourceSha256,OWN_FULL_CAPACITY_190_SQL_SHA256);
 assert.equal(plan.pre.length,11);assert.equal(plan.post.length,27);assert.equal(plan.legacyNames.length,9);assert.equal(plan.newNames.length,16);
 assert.equal(plan.pre.find(p=>p.name==='own_close_report_census_v1').bodySha256,sha(body(census.migration[0].replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim())));
 assert.deepEqual(plan.censusStatements,census.statements);assert.deepEqual(plan.censusVerification,census.verification);
 const keep=ownFullCapacity190Conservation({schema:'public',sourceCommit},{legacyNames:[...plan.legacyNames],newNames:[...plan.newNames]});
 assert.equal(plan.statements[0],keep.before);assert.equal(plan.statements.at(-3),keep.after);assert.equal(plan.statements.at(-2),keep.compare);assert.equal(plan.statements.at(-1),keep.proof+' AS proof');
 const migration=plan.statements.slice(1,-3);assert.ok(migration.length>=3);assert.match(migration[0],/^\s*(?:--[^\n]*\n)*DO \$capacity_preflight\$/);assert.match(migration.at(-1),/DO \$capacity_postflight\$[\s\S]*END \$capacity_postflight\$;?\s*$/);
 assert.equal(migration.map(s=>s.trim()).join('\n').includes('$capacity_census_successor$'),true);
 for(const s of [...plan.statements,...plan.verification,...plan.preflight])assert.ok(!s.includes('mc_qa_fixed_092_'),'public plan must not mention a QA namespace');
 assert.equal(plan.preflight.length,2);assert.equal(plan.preflight[1],census.ownCheck);assert.match(plan.preflight[0],/^DO \$capacity_preflight\$[\s\S]*END \$capacity_preflight\$;$/);
 assert.equal(plan.verification[0].startsWith('DO $capacity_postflight$'),true);
 assert.equal(plan.connects,false);assert.equal(plan.executesSql,false);assert.equal(plan.qaPoolUsed,false);assert.equal(plan.relocated,false);
});
test('public metadata arrays are the source arrays: every post item body hashes from the SQL201 definitions',()=>{
 const plan=composeOwnFullCapacity190PublicInstallation({read,sourceCommit}),source=read(OWN_FULL_CAPACITY_190_SQL).replace(/\r\n?/g,'\n');
 for(const item of plan.post){
  if(item.kind==='protected_dependency'){
   const inherited=plan.protectedPredecessorPins.find(p=>p.name===item.name);assert.ok(inherited,item.name);assert.equal(inherited.sha256,item.bodySha256);assert.equal(inherited.signature,item.signature);assert.equal(item.runtime,false);
  }else{const m=new RegExp('CREATE(?: OR REPLACE)? FUNCTION public\\.'+item.name+'\\([\\s\\S]*?\\bAS\\s+(\\$\\w*\\$)([\\s\\S]*?)\\1').exec(source);assert.ok(m,item.name);assert.equal(sha(m[2]),item.bodySha256);}
  assert.ok(item.signature.startsWith('public.'));
 }
 assert.deepEqual(plan.protectedPredecessorPins.map(p=>p.name).sort(),['own_annul_selected_v1','own_close_snapshot_v1']);
 for(const item of plan.pre)assert.ok(item.signature.startsWith('public.')&&item.config.includes('search_path=pg_catalog, public, pg_temp'));
});
test('an altered SQL201 or an altered200 predecessor is refused before any plan',()=>{
 const tampered=file=>file===OWN_FULL_CAPACITY_190_SQL?read(file).replace('OWN_DECISION_CAPACITY_PREREQUISITE','OWN_DECISION_CAPACITY_PREREQUISITE '):read(file);
 assert.throws(()=>composeOwnFullCapacity190PublicInstallation({read:tampered,sourceCommit}),/M7_190_UNREVIEWED_SQL201/);
 const census=file=>file===OWN_REPORT_CENSUS_MIGRATION?read(file).replace('own-report-close-census.v1','own-report-close-census.v1 '):read(file);
 assert.throws(()=>composeOwnFullCapacity190PublicInstallation({read:census,sourceCommit}),/REPORT_CENSUS_UNREVIEWED_SQL200/);
 assert.throws(()=>composeOwnFullCapacity190PublicInstallation({read,sourceCommit:'zz'}),/M7_PUBLIC201_COMMIT_REQUIRED/);
});
test('public durability demands identical installed/durable proofs with the fixed counters',()=>{
 const batch=composeOwnFullCapacity190PublicInstallation({read,sourceCommit});
 const proof={version:'own-full-capacity-canonical190-installation.v1',sourceCommit,sourceSqlSha256:OWN_FULL_CAPACITY_190_SQL_SHA256,priorStateSha256:'c'.repeat(64),priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3};
 assert.equal(assertOwnFullCapacity190PublicDurability({installed:proof,durable:{...proof},batch}).passed,true);
 assert.throws(()=>assertOwnFullCapacity190PublicDurability({installed:proof,durable:{...proof,priorStateSha256:'d'.repeat(64)},batch}),/M7_PUBLIC201_NOT_DURABLE/);
 assert.throws(()=>assertOwnFullCapacity190PublicDurability({installed:{...proof,businessWrites:1},durable:{...proof,businessWrites:1},batch}),/M7_PUBLIC201_PROOF_CHANGED:businessWrites/);
 assert.throws(()=>assertOwnFullCapacity190PublicDurability({installed:proof,durable:proof,batch:{...batch,version:'x'}}),/M7_PUBLIC201_BATCH_VERSION/);
});

test('protected predecessor source and conservation source cannot drift or become a catalogue oracle',()=>{
 for(const file of['scripts/lib/own-payroll-full-capacity-190-installation.mjs','scripts/lib/salary-auxiliary-namespace-installation.mjs','scripts/migrations/146-own-consolidated-annulment.sql']){
  assert.throws(()=>composeOwnFullCapacity190PublicInstallation({read:p=>read(p)+(p===file?'\n// unreviewed source':''),sourceCommit}),/M7_PUBLIC201_(?:CONSERVATION|NAMESPACE|ANNUL)_SOURCE_CHANGED/);
 }
});
test('one real proof must validate independently before any later SQL is admitted',()=>{
 const batch=composeOwnFullCapacity190PublicInstallation({read,sourceCommit});
 const proof={version:'own-full-capacity-canonical190-installation.v1',sourceCommit,sourceSqlSha256:OWN_FULL_CAPACITY_190_SQL_SHA256,priorStateSha256:'c'.repeat(64),priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3};
 assert.equal(assertOwnFullCapacity190PublicProof({proof,batch}).passed,true);
 assert.throws(()=>assertOwnFullCapacity190PublicProof({proof:{...proof,unreviewedPayload:[]},batch}),/M7_PUBLIC201_PROOF_SHAPE/);
 assert.throws(()=>assertOwnFullCapacity190PublicProof({proof:{...proof,newFunctions:17},batch}),/M7_PUBLIC201_PROOF_CHANGED:newFunctions/);
});
