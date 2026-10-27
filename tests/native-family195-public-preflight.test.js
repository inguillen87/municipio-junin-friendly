import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareNativeFamily195PublicMaterialPreflight as prepare,classifyNativeFamily195PublicMaterialPreflight as classify,nativeFamily195PublicSourcePlan} from '../scripts/lib/native-family195-public-preflight.mjs';
import {verifyNativeFamily195PublicLayoutOn190} from '../scripts/lib/native-family195-public-layout-qa.mjs';
const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8'),sourceCommit='a'.repeat(40);
const contractFile='scripts/contracts/native-family195-prerequisite-layout-pg17.json';
const queryFile='scripts/contracts/native-family195-prerequisite-layout-query.sql';
const hash=v=>createHash('sha256').update(v).digest('hex');
let cached;const plan=()=>cached??=prepare({read,sourceCommit,major:17});
// These DTOs exercise the classifier only. They are not native execution proofs.
function observation(){const p=plan();return {version:p.version,sourceCommit:p.sourceCommit,sourceHashes:structuredClone(p.sourceHashes),serverMajor:17,database:'qa_test',currentUser:'owner',sessionUser:'owner',readOnly:'on',isolation:'repeatable read',prerequisiteFunctionCount:13,prerequisiteFunctionsSourceGuardPassed:true,
 relations:p.requiredRelations.map(name=>({name,present:true,catalog:{class:{relname:name},columns:[],constraints:[],indexes:[],triggers:[],policies:[]}})),
 newObjects:{relations:[],types:[],functions:[],triggers:[]},capabilityDefinitions:[],assignmentCounts:{roles:0,overrides:0,exclusive:0}};}
const layout=()=>({version:'native-family195-prerequisite-table-layout.v1',contractSha256:plan().layout.contractSha256,searchPath:'pg_catalog, public, pg_temp',serverVersionNum:170011,relations:8,mismatches:[]});

test('source plan includes exact PG17 render authority and unchanged thirteen-function guard',()=>{
 const p=plan(),batch=nativeFamily195PublicSourcePlan(p).batch;
 assert.equal(p.connects,false);assert.equal(p.executesSql,false);assert.equal(p.installationIncluded,false);assert.equal(p.assignsCapabilities,false);
 assert.deepEqual(p.transaction,{isolation:'repeatable read',readOnly:true,end:'COMMIT'});assert.match(p.sql,/COMMIT;\n$/);
 assert.equal(p.statements[1],batch.prerequisiteCheck);assert.equal(batch.prerequisitePins.length,13);assert.equal(p.statements.length,4);
 assert.equal(batch.prerequisitePins.find(x=>x.name==='school_certificate_native_family_v5').sha256,'4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c');
 assert.match(p.statements[1],/NATIVE_FAMILY_PREREQUISITE_DRIFT/);
 assert.doesNotMatch(p.sql,/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|pg_advisory|pg_try_advisory)\b/i);
 assert.equal(hash(read(contractFile)),p.sourceHashes[contractFile]);assert.equal(hash(read(queryFile)),p.sourceHashes[queryFile]);
 const tables=JSON.parse(read(contractFile));assert.equal(tables.length,8);assert.equal(tables.flatMap(t=>t.checks).length,60);
 assert.ok(tables.flatMap(t=>t.checks).every(c=>typeof c.definition==='string'&&c.definition.length>0));
 const identities=tables.flatMap(t=>t.checks.map(c=>t.name+'|'+JSON.stringify(c.columns)));assert.equal(new Set(identities).size,60);
 const embedded=[...p.statements[3].matchAll(/jsonb_array_elements\(('(?:''|[^'])*')::jsonb\)/g)];
 assert.equal(embedded.length,1,'the complete layout travels as one SQL JSON literal');
 const contractText=embedded[0][1].slice(1,-1).replaceAll("''", "'");
 assert.equal(contractText,read(contractFile),'quoted identifiers and JSON escapes preserve every source byte');
 assert.deepEqual(JSON.parse(contractText),tables);
 assert.ok(read('.vercelignore').split(/\r?\n/).includes('!'+queryFile),'only the exact public query is included by the build');
 assert.ok(read('.gitignore').split(/\r?\n/).includes('!'+queryFile),'the exact metadata query is versioned as source');
});
test('complete native layout DTO closes only table review, never live binding or installation admission',()=>{
 const result=classify(plan(),observation(),layout());assert.equal(result.status,'INITIAL_INSTALL_CANDIDATE');assert.equal(result.initialWindowOpen,true);
 assert.equal(result.layoutPending,0);assert.deepEqual(result.layoutMismatches,[]);assert.equal(result.prerequisiteTableLayoutReviewRequired,false);
 for(const key of ['canExecuteInstallation','productionBindingProved','productionAdmission'])assert.equal(result[key],false);
});
test('constraint mismatch remains actionable; classifier does not relabel weakened or duplicate checks as admitted',()=>{
 for(const detail of ['CHECK ((byte_length >= 0))','duplicate-column-set','missing-check','changed-cast','changed-operator','changed-value']){
  const dto=layout();dto.mismatches=[{relation:'school_certificate_blob',area:'check',detail}];
  const result=classify(plan(),observation(),dto);assert.equal(result.prerequisiteTableLayoutReviewRequired,true);assert.deepEqual(result.layoutMismatches,dto.mismatches);assert.equal(result.canExecuteInstallation,false);
 }
});
test('old school/family history and nonzero generation are not fresh-install emptiness predicates',()=>{
 const dto=observation();for(const relation of dto.relations){relation.catalog.class.reltuples=12345;relation.catalog.class.relpages=987;}
 // Catalogue statistics are intentionally not row/content authority. Native
 // generation/history preservation is tested by the separate owned-QA cases.
 const result=classify(plan(),dto,layout());assert.equal(result.prerequisiteTableLayoutReviewRequired,false);assert.equal(result.status,'INITIAL_INSTALL_CANDIDATE');
});
test('existing195 traces or any capability assignment close the initial window',()=>{
 for(const key of ['functions','types','relations','triggers']){const dto=observation();dto.newObjects[key].push({observed:'synthetic-metadata'});assert.equal(classify(plan(),dto,layout()).status,'PARTIAL_OR_EXISTING_INSTALLATION');}
 const caps=observation();caps.capabilityDefinitions.push({key:'employee.family.review'});assert.equal(classify(plan(),caps,layout()).initialWindowOpen,false);
 for(const key of ['roles','overrides','exclusive']){const dto=observation();dto.assignmentCounts[key]=1;assert.equal(classify(plan(),dto,layout()).status,'PARTIAL_OR_EXISTING_INSTALLATION');}
});
test('missing parent relation is reported without source recreation or data reset',()=>{
 const dto=observation(),name=dto.relations[0].name;dto.relations[0]={name,present:false,catalog:null};
 const missing=layout();missing.mismatches=[{relation:name,area:'relation',detail:null}];
 const result=classify(plan(),dto,missing);assert.equal(result.status,'PREREQUISITE_RELATIONS_MISSING');assert.deepEqual(result.missingRelations,[name]);assert.equal(result.canExecuteInstallation,false);
});
test('wrong major/namespace/source, prior pending contract and cloned plans reject',()=>{
 assert.throws(()=>classify({...plan()},observation(),layout()),/SOURCE_PLAN_REQUIRED/);
 for(const mutate of [d=>d.serverMajor=18,d=>d.readOnly='off',d=>d.isolation='read committed',d=>d.prerequisiteFunctionsSourceGuardPassed=false,d=>d.sourceHashes['scripts/migrations/195-native-family-self-service.sql']='0'.repeat(64),d=>d.extra=true,d=>d.assignmentCounts.roles=-1,d=>d.relations.push(d.relations[0])]){const dto=observation();mutate(dto);assert.throws(()=>classify(plan(),dto,layout()));}
 for(const mutate of [d=>d.serverVersionNum=180011,d=>d.searchPath='other, public',d=>d.contractSha256='0'.repeat(64),d=>d.relations=7,d=>d.layoutPending=58]){const dto=layout();mutate(dto);assert.throws(()=>classify(plan(),observation(),dto));}
 for(const file of [contractFile,queryFile,'scripts/lib/native-family-self-service-195-installation.mjs'])assert.throws(()=>prepare({read:f=>f===file?read(f)+'\n':read(f),sourceCommit,major:17}));
 assert.throws(()=>prepare({read,sourceCommit,major:18}),/LAYOUT_MAJOR_NOT_CLOSED/);
});


test('the full metadata statement collates extracted JSON text in both NOT NULL inventories',()=>{
 // The PG18 branch is still parsed and typed by PG17 before its condition can
 // exclude it. This source regression is not a native SQL execution proof.
 for(const sql of [read(queryFile),plan().statements.at(-1)]){
  assert.match(sql,/current_setting\('server_version_num'\)::integer>=180000/);
  assert.match(sql,/jsonb_agg\(con\.keys->>0 ORDER BY \(con\.keys->>0\) COLLATE "C"\)/);
  assert.match(sql,/jsonb_agg\(x->>0 ORDER BY \(x->>0\) COLLATE "C"\)/);
  assert.doesNotMatch(sql,/->>\s*\d+\s+COLLATE\s+"C"/);
  assert.equal([...sql.matchAll(/COLLATE "C"/g)].length,3,'all three metadata orderings remain explicit');
  assert.match(sql,/jsonb_agg\(a\.attname ORDER BY a\.attname COLLATE "C"\)/,'the direct name ordering is unchanged');
 }
 assert.equal(plan().sourceHashes[contractFile],'ab0ebf2eae47181ee71dc253202beb03d49f844e45a34cd3f1bde3ec3c3eeef2');
 assert.equal(JSON.parse(read(contractFile)).flatMap(table=>table.checks).length,60);
});


test('canonical layout path is three identifiers and the quoted single-name response stays rejected',()=>{
 assert.match(plan().sql,/SET LOCAL search_path=pg_catalog, public, pg_temp;/);
 assert.doesNotMatch(plan().sql,/SET LOCAL search_path='pg_catalog, public, pg_temp'/);
 const observed=layout();observed.searchPath='"pg_catalog, public, pg_temp"';
 assert.throws(()=>classify(plan(),observation(),observed));
});

test('the real same190 hook emits the identifier list before its first native layout observation',()=>{
 // Only capture the real helper's first inspection request. No SQL is run and
 // no layout/business proof is fabricated: stop before returning that request.
 const schema='mc_qa_fixed_092_'+ '1'.repeat(32),stop=Error('LAYOUT_REQUEST_CAPTURED');let calls=0,captured;
 const h={major:17,sourceCommit,sourceCustody:{sourceCommit},read,check:()=>assert.fail('inspection must not complete'),
  qa:{major:17,sourceCommit,schema,normalized:sql=>sql.replaceAll('public.',schema+'.')},
  json:(statements,options)=>{calls++;if(calls===1)return {absent:true};assert.equal(calls,2);captured={statements,options};throw stop;}};
 assert.throws(()=>verifyNativeFamily195PublicLayoutOn190(h),error=>error===stop);assert.equal(calls,2);
 assert.equal(captured.statements[0],'SET LOCAL search_path=pg_catalog, public, pg_temp');
 assert.deepEqual(captured.options,{end:'ROLLBACK',readOnly:true,fullJson:true});
 assert.equal(captured.statements.length,2);assert.ok(captured.statements[1].includes(schema+'.'));
});
