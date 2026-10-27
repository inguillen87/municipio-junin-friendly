/* TEXT CANDIDATE. Intended destination: tests/native-family-self-service-195-same190-qa.test.js.
 * Not imported or executed. These are pure construction/host-adapter tests, not
 * PostgreSQL, HTTP or browser evidence. Adopt the complete195 source package first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {
 composeNativeFamily195Same190,installNativeFamily195Same190,
 FAMILY195_QA_ENTRIES,FAMILY195_ROOT_ENTRIES
} from '../scripts/lib/native-family-self-service-195-same190-qa.mjs';
import {SQL195_SHA,assertNativeFamilySelfService195Durability} from '../scripts/lib/native-family-self-service-195-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'c'.repeat(32);
const sha=s=>createHash('sha256').update(s).digest('hex');
let cachedQa,cachedFamily;
function foundation(){
 if(!cachedQa)cachedQa=buildOwnerProgramQa({major:17,sourceCommit,schema,read,operationalPairBaseline:'published107'});
 return cachedQa;
}
function family(){
 if(!cachedFamily)cachedFamily=composeNativeFamily195Same190({qa:foundation(),read,major:17,sourceCommit});
 return cachedFamily;
}
const body=s=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m);return m[2];};
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const name=s=>{const m=/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)\s*\(/.exec(clean(s));assert.ok(m);return m[1];};

test('composition relocates every admitted body while retaining the exact existing190 foundation',()=>{
 const qa=foundation(),hashes=qa.hashes,prior=structuredClone(qa.hashes);
 const retained={actor:qa.actor,checker:qa.checker,normalized:qa.normalized,foundation:qa.foundation};
 const f=family();
 assert.strictEqual(f.foundation,qa);assert.equal(f.schema,schema);assert.equal(f.sourceCommit,sourceCommit);
 assert.strictEqual(qa.hashes,hashes);assert.deepEqual(qa.hashes,prior);
 for(const [key,value]of Object.entries(retained))assert.strictEqual(qa[key],value,key);
 assert.equal(f.prerequisites.closure,'native');
 assert.equal(f.createsAnotherFoundation,false);assert.equal(f.createsActors,false);assert.equal(f.createsRoleAssignments,false);
 assert.equal(f.connects,false);assert.equal(f.executesSql,false);
 const all=[...f.prerequisites.definitions,...f.prerequisites.prerequisiteDefinitions,
  ...f.self.definitions,...f.self.prerequisiteDefinitions,...f.self.extraDefinitions];
 for(const definition of all){
  const local=f.normalized(definition);
  assert.equal(sha(body(local)),sha(body(qa.normalized(definition))),name(definition));
  const qualified=/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(clean(definition));
  const expectedName=(qualified?schema+'.':'')+name(definition);
  assert.equal(/^CREATE(?: OR REPLACE)? FUNCTION ([\w.]+)\s*\(/.exec(clean(local))?.[1],expectedName,
   name(definition)+' retains its source qualification');
 }
 for(const [raw,local]of Object.entries(prior))assert.equal(f.normalized("SELECT '"+raw+"'"),qa.normalized("SELECT '"+raw+"'"),'prior digest semantics retained: '+local);
 assert.deepEqual(f.sourceEntries,[...new Set([...FAMILY195_QA_ENTRIES,
  ...Object.keys(f.prerequisites.sourceHashes),...Object.keys(f.self.sourceHashes)])]);
 assert.equal(new Set(f.sourceEntries).size,f.sourceEntries.length);
 assert.deepEqual(FAMILY195_ROOT_ENTRIES,['centro-acciones.html','api/internal-native-family-requests.js']);
 for(const required of ['scripts/lib/native-family195-same190-actors.mjs','scripts/lib/native-family-195-native-browser.mjs',
  'scripts/lib/friendly-shell-page.mjs','assets/app-routes.js','assets/pwa/icon-maskable-512.png',
  'tests/native-family-prerequisites-190-installation.test.js','tests/native-family-self-service-195-same190-qa.test.js',
  'tests/native-family195-same190-actors.test.js','tests/friendly-shell-page.test.js'])assert.ok(f.sourceEntries.includes(required),required);
});

test('self195 emits exactly its source23 functions and10 public facades without reinstalling110 v5',()=>{
 const f=family(),b=f.self,file='scripts/migrations/195-native-family-self-service.sql';
 assert.equal(SQL195_SHA,'3b2cec1ddb2104c890546dca6e9ccb464da2d1d92e067df5e7cc80569406879e');
 assert.equal(sha(read(file).replace(/\r\n?/g,'\n')),SQL195_SHA);
 const source=splitPostgresStatements(read(file)).map(clean);
 const definitions=source.filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\.native_family_/.test(s));
 assert.equal(definitions.length,23);assert.deepEqual(b.definitions,definitions);
 assert.equal(b.ownPins.length,23);assert.equal(b.prerequisitePins.length,13);
 assert.deepEqual(b.ownPins.filter(p=>p.runtime).map(p=>p.name).sort(),[
  'native_family_self_bootstrap_v1','native_family_review_bootstrap_v1',
  'native_family_self_detail_v1','native_family_review_detail_v1',
  'native_family_self_attempt_v1','native_family_review_attempt_v1',
  'native_family_self_document_v1','native_family_review_document_v1',
  'native_family_self_command_v1','native_family_review_command_v1'
 ].sort());
 const v5=b.prerequisitePins.filter(p=>p.name==='school_certificate_native_family_v5');
 assert.equal(v5.length,1);assert.equal(v5[0].sha256,'4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c');
 assert.ok(!b.definitions.some(d=>name(d)==='school_certificate_native_family_v5'));
 assert.equal(b.fixed.newTables,3);assert.equal(b.fixed.newFunctions,23);assert.equal(b.fixed.runtimeFacades,10);
 assert.equal(b.fixed.capabilityDefinitionsAdded,3);assert.equal(b.fixed.roleAssignmentsAdded,0);assert.equal(b.fixed.businessOperations,0);
 const anchor="school_certificate_native_family_v5(jsonb,uuid)','4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c'";
 const raw=read(file);assert.equal(raw.split(anchor).length-1,1);
 const old=raw.replace(anchor,anchor.replace('4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c','9204d4fd4350ce9f66f5544422a01453421286e7b278a349d344a22f9338e042'));
 assert.throws(()=>composeNativeFamily195Same190({qa:foundation(),major:17,sourceCommit,read:p=>p===file?old:read(p)}),/FAMILY_SELF195_UNREVIEWED_SQL/);
});

function proofs(batch){
 const common={version:batch.version,sourceCommit:batch.sourceCommit,sourceHashes:{...batch.sourceHashes},...batch.fixed,
  priorFingerprint:'1'.repeat(64),objectFingerprint:'2'.repeat(64),prerequisiteFingerprint:'3'.repeat(64)};
 if(batch.closure){common.closure=batch.closure;common.priorTableCount=100;}
 else common.sql195Sha256=batch.sql195Sha256;
 const installed={...common,beforeFingerprint:common.priorFingerprint};
 return {installed,durable:{...common}};
}

// This records the real coordinator's calls. Returned values are explicitly
// synthetic adapter proofs; no business model, native SQL or browser is stubbed.
function host({corruptPrerequisiteDurable=false}={}){
 const f=family(),trace=[],p=proofs(f.prerequisites),s=proofs(f.self);
 let phase='',epoch=0,prerequisiteDurable=false;
 const h={qa:foundation(),major:17,sourceCommit,prepared:{family195:f},sourceCustody:{sourceCommit},
  setPhase(value){phase=value;trace.push({type:'phase',phase});},
  readFullSnapshot(){trace.push({type:'snapshot',phase});return {epoch,owner:'same synthetic190'};},
  json(sql,options){
   trace.push({type:'json',phase,sql,options});
   const pre=phase.startsWith('family195-prerequisites-'),local=pre?f.localPrerequisites:f.localSelf,proof=pre?p:s;
   if(!pre)assert.equal(prerequisiteDurable,true,'no self195 DDL before independently accepted prerequisite durability');
   if(phase.endsWith('-rehearsal')){assert.deepEqual(sql,local.rehearsal);assert.deepEqual(options,{end:'ROLLBACK',fullJson:true});return structuredClone(proof.installed);}
   if(phase.endsWith('-installation')){assert.deepEqual(sql,local.installation);assert.deepEqual(options,{fullJson:true});epoch++;return structuredClone(proof.installed);}
   assert.ok(phase.endsWith('-durable-readonly'));assert.deepEqual(sql,local.durable);assert.deepEqual(options,{readOnly:true,fullJson:true});
   if(pre){prerequisiteDurable=true;if(corruptPrerequisiteDurable)return {...proof.durable,nativeFamilyV5Preserved:false};}
   return structuredClone(proof.durable);
  },
  expectRollback(sql,code){
   trace.push({type:'negative',phase,sql,code});
   const pre=phase.startsWith('family195-prerequisites-'),local=pre?f.localPrerequisites:f.localSelf;
   if(phase.endsWith('-late-negative')){assert.deepEqual(sql,local.late);assert.equal(code,pre?'FAMILY195_REHEARSAL_LATE_FAILURE':'FAMILY_SELF195_REHEARSAL_LATE_FAILURE');}
   else {assert.ok(phase.endsWith('-repeat-negative'));assert.deepEqual(sql,local.installation);assert.equal(code,pre?'FAMILY195_OBJECT_CONFLICT':'NATIVE_FAMILY_ALREADY_INSTALLED');}
  },
  check(message){trace.push({type:'check',message});}
 };
 return {h,trace};
}

test('same-host coordinator rehearses/rolls back and independently verifies prerequisites before any195 DDL',()=>{
 const {h,trace}=host(),result=installNativeFamily195Same190(h);
 assert.deepEqual(trace.filter(x=>x.type==='json').map(x=>x.phase),[
  'family195-prerequisites-rehearsal','family195-prerequisites-installation','family195-prerequisites-durable-readonly',
  'family195-self195-rehearsal','family195-self195-installation','family195-self195-durable-readonly']);
 assert.equal(trace.filter(x=>x.type==='negative').length,4);assert.equal(trace.filter(x=>x.type==='check').length,1);
 assert.deepEqual(result.self195,{newTables:3,newFunctions:23,runtimeFacades:10,capabilityDefinitionsAdded:3});
 assert.equal(result.newTables,11);assert.equal(result.newFunctions,40);assert.equal(result.runtimeFacades,12);
 assert.equal(result.actorsCreated,0);assert.equal(result.roleAssignmentsAdded,0);assert.equal(result.businessOperations,0);
 for(const local of [family().localPrerequisites,family().localSelf]){
  assert.ok(local.durable.length>0);assert.ok(local.durable.every(sql=>!/^SET TRANSACTION\b/.test(sql)));
  assert.ok(local.durable.every(sql=>!/^BEGIN\b|^COMMIT\b|^ROLLBACK\b/.test(sql)));
 }
});

test('a failed prerequisite durable proof prevents195 and never reaches the success check',()=>{
 const {h,trace}=host({corruptPrerequisiteDurable:true});
 assert.throws(()=>installNativeFamily195Same190(h));
 assert.ok(!trace.some(x=>x.phase?.startsWith('family195-self195-')));
 assert.ok(!trace.some(x=>x.type==='check'));
 const valid=host();valid.h.sourceCustody={sourceCommit:'b'.repeat(40)};
 assert.throws(()=>installNativeFamily195Same190(valid.h));assert.equal(valid.trace.length,0);
});

test('self195 durability rejects a changed source, prior state, v5 epoch or unexpected authority field',()=>{
 const b=family().self,{installed,durable}=proofs(b);
 assert.equal(assertNativeFamilySelfService195Durability({batch:b,installed,durable}).passed,true);
 for(const patch of [{nativeFamilyV5Preserved:false},{roleAssignmentsAdded:1},{businessOperations:1},
  {sourceCommit:'b'.repeat(40)},{priorFingerprint:'4'.repeat(64)},{objectFingerprint:'5'.repeat(64)},
  {prerequisiteFingerprint:'6'.repeat(64)},{unexpectedAuthority:true}])
  assert.throws(()=>assertNativeFamilySelfService195Durability({batch:b,installed,durable:{...durable,...patch}}),JSON.stringify(patch));
 assert.throws(()=>assertNativeFamilySelfService195Durability({batch:b,installed:{...installed,beforeFingerprint:'7'.repeat(64)},durable}),/FAMILY_SELF195_PRIOR_CHANGED/);
});

// Native185 regression: the three approved capability additions are omitted from
// row data only for the exact IAM relation, including after QA schema relocation.
test('self195 prior snapshots relocate the exact capability relation without relaxing prior metadata or state guards',()=>{
 const f=family(),b=f.self;
 const sourceTarget="CASE WHEN c.oid='public.iam_capability'::regclass THEN ";
 const qaTarget="CASE WHEN c.oid='"+schema+".iam_capability'::regclass THEN ";
 const keys="'WHERE r.capability_key NOT IN(''employee.family.self.read'',''employee.family.self.submit'',''employee.family.review'')'";
 for(const slot of ['before','after']){
  const raw=b[slot],local=f.normalized(raw);
  assert.equal(raw.split(sourceTarget).length-1,1,slot+' has one exact source relation gate');
  assert.equal(local.split(qaTarget).length-1,1,slot+' gate points at the actual QA relation');
  assert.ok(raw.includes(sourceTarget+keys+" ELSE '' END) INTO n,h;"));
  assert.ok(local.includes(qaTarget+keys+" ELSE '' END) INTO n,h;"));
  assert.doesNotMatch(local,/CASE WHEN c\.nspname='public' AND c\.relname='iam_capability'/);
  assert.doesNotMatch(raw,/c\.relname='iam_capability'/,'no same-name relation outside this exact OID gets an exclusion');
  for(const rows of [f.localSelf.rehearsal,f.localSelf.installation])assert.equal(rows.filter(sql=>sql===local).length,1,slot+' is the actual emitted snapshot');
  if(slot==='after')assert.equal(f.localSelf.durable.filter(sql=>sql===local).length,1);
  // Metadata and security of iam_capability remain part of the ordinary table
  // snapshot; only the explicit three source-pinned rows can be excluded.
  assert.ok(raw.includes("'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid))"));
  assert.ok(raw.includes("'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid)"));
  assert.ok(raw.includes("'acl',c.relacl"));
 }
 assert.ok(b.priorAudit.includes("IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'FAMILY_SELF195_PRIOR_STATE_CHANGED';END IF;"));
 assert.ok(b.priorAudit.includes("IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'FAMILY_SELF195_PRIOR_TRIGGER_CHANGED';END IF;"));
 assert.ok(b.objectsCheck.includes("FAMILY_SELF195_CAPABILITIES"));
 assert.ok(b.objectsCheck.includes("FAMILY_SELF195_UNEXPECTED_ASSIGNMENT"));
 assert.equal(b.fixed.capabilityDefinitionsAdded,3);assert.equal(b.fixed.roleAssignmentsAdded,0);
});
