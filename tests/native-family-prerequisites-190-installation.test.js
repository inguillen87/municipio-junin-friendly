/*
 * SOURCE PROPOSAL ONLY. Not imported, parsed, constructed, tested or executed.
 * Intended public destination: tests/native-family-prerequisites-190-installation.test.js
 * Subject: scripts/lib/native-family-prerequisites-190-installation.mjs
 * Reviewed candidate: 55,247 RAW bytes; SHA-256
 * fb2bc907e45ece067a4d35b3e3eafed9a27b09ce48230b8046f20148fe2c8380.
 * Root must review/adopt the builder and this text before running any test.
 * All read callbacks below use public repository sources. No municipal fixtures,
 * connections, credentials, native processes, SQL execution or new QA database.
 * The existing buildOwnerProgramQa supplies its actual pure normalizer. Its seed
 * string is never run, augmented, persisted or used as a replacement foundation.
 * Source mutations must fail at SHA admission: these tests do not rewrite pins
 * or load a rewritten builder to bypass that gate. Private helper error branches
 * behind the source SHA gate are not claimed as independently covered.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {
 FAMILY_PREREQUISITES_VERSION,FAMILY_SOURCE_SHA,
 NATIVE_FAMILY_V5_LIFECYCLE_BODY_SHA,NATIVE_FAMILY_V5_SUPERSEDED_BODY_SHA,
 buildNativeFamilyPrerequisites190Installation,familyFunctionPin,familyPinsCheck,
 familyRelocationHashes,familyNormalizer,assertNativeFamilyPrerequisitesDurability,
} from '../scripts/lib/native-family-prerequisites-190-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';

const sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'d'.repeat(32);
const migration=n=>'scripts/migrations/'+n;
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const lf=s=>s.replace(/\r\n?/g,'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const cleanStatement=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const statements=file=>splitPostgresStatements(lf(read(file))).map(cleanStatement);
const functionName=d=>{
 const m=/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?([a-z0-9_]+)\s*\(/.exec(d);
 assert.ok(m,'source function header required');return m[1];
};
const functionBody=d=>{
 const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);
 assert.ok(m,'complete dollar-quoted body required');return m[2];
};
function unique(values,predicate,label){
 const selected=values.filter(predicate);assert.equal(selected.length,1,label);return selected[0];
}
function sourceFunction(file,name){
 return unique(statements(file),d=>/^CREATE(?: OR REPLACE)? FUNCTION /.test(d)&&functionName(d)===name,file+':'+name);
}
function replaceOnce(source,from,to){
 assert.ok(from.length>0);assert.equal(source.split(from).length-1,1,'one exact source anchor: '+from.slice(0,80));
 return source.replace(from,()=>to);
}
const cache=new Map();
function batch(closure){
 if(!cache.has(closure))cache.set(closure,buildNativeFamilyPrerequisites190Installation({read,sourceCommit,closure}));
 return cache.get(closure);
}
let qa;
function existingFoundation(){
 if(!qa)qa=buildOwnerProgramQa({major:17,sourceCommit,read,schema,operationalPairBaseline:'published107'});
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);return qa;
}
function metadataJson(sql){
 const at=sql.indexOf('jsonb_array_elements(');assert.ok(at>=0);
 const literal=/^'((?:''|[^'])*)'::jsonb/.exec(sql.slice(at+'jsonb_array_elements('.length));assert.ok(literal);
 return JSON.parse(literal[1].replaceAll("''","'"));
}
const nativeNames=[
 'school_certificate_reject_change_v1','school_certificate_record_immutable_v3','employee_family_native_link_v2',
 'employee_family_name_key_v1','employee_family_identity_matches_v1','employee_family_subject_v1',
 'school_certificate_storage_capacity_v1','school_certificate_storage_reserve_v1','school_certificate_context_v1',
 'school_certificate_date_v3','school_certificate_records_v3','employee_family_subject_v2',
 'employee_family_write_context_v2','employee_family_receipt_v2','school_certificate_family_v3',
 'school_certificate_register_v3','employee_family_declare_v2',
];
const fullOnly=['school_certificate_assert_mapping_v1','school_certificate_assert_contract_v1',
 'school_certificate_current_family_v1','school_certificate_current_family_v2'];
const runtimeNames=['employee_family_declare_v2','school_certificate_register_v3'];
const sharedNames=['school_certificate_record_immutable_v3','school_certificate_reject_change_v1'];

for(const closure of ['native','full'])test(closure+': exact runtime closure preserves110 instead of reinstalling102 v5',()=>{
 const b=batch(closure),expectedNames=[...nativeNames,...(closure==='full'?fullOnly:[])].sort();
 assert.equal(b.version,FAMILY_PREREQUISITES_VERSION);assert.equal(b.sourceCommit,sourceCommit);
 assert.equal(b.closure,closure);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.deepEqual(b.definitions.map(functionName).sort(),expectedNames);
 assert.equal(b.definitions.length,closure==='native'?17:21);
 assert.deepEqual(b.pins.map(p=>p.name).sort(),expectedNames);
 // Every emitted body must originate in an admitted public source statement.
 const definitionsByBody=new Set(Object.keys(FAMILY_SOURCE_SHA).flatMap(file=>statements(file))
  .filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION /.test(s)).map(functionBody));
 for(const d of b.definitions)assert.ok(definitionsByBody.has(functionBody(d)),functionName(d));
 const lifecycle=sourceFunction(migration('110-native-employment-lifecycle.sql'),'school_certificate_native_family_v5');
 const superseded=sourceFunction(migration('102-native-family-schooling.sql'),'school_certificate_native_family_v5');
 assert.equal(hash(functionBody(lifecycle)),NATIVE_FAMILY_V5_LIFECYCLE_BODY_SHA);
 assert.equal(hash(functionBody(superseded)),NATIVE_FAMILY_V5_SUPERSEDED_BODY_SHA);
 assert.notEqual(functionBody(lifecycle),functionBody(superseded));
 const pinned=unique(b.prerequisitePins,p=>p.name==='school_certificate_native_family_v5','one existing v5');
 assert.equal(pinned.sha256,hash(functionBody(lifecycle)));
 assert.equal(unique(b.prerequisiteDefinitions,d=>functionName(d)==='school_certificate_native_family_v5','110 v5 definition'),lifecycle);
 assert.deepEqual(b.prerequisiteDefinitions.map(functionName).sort(),[
  'school_certificate_native_family_v5','native_employment_lifecycle_range_v1',
  'payroll_fixed_registry_subject_by_contract_v1','grh_curated_source_read_lock_v1',
  'action_center_context_has_capability','action_center_assert_tenant_read_session_v2',
 ].sort());
 assert.equal(b.prerequisiteDefinitions.length,6);
 // Neither path can create/replace v5; metadata checks may mention its signature.
 for(const s of b.installation)assert.doesNotMatch(s,/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?school_certificate_native_family_v5\s*\(/);
 assert.ok(!b.definitions.some(d=>functionName(d)==='native_employment_lifecycle_range_v1'));
 assert.match(b.prerequisiteCheck,new RegExp(NATIVE_FAMILY_V5_LIFECYCLE_BODY_SHA));
 assert.doesNotMatch(b.prerequisiteCheck,new RegExp(NATIVE_FAMILY_V5_SUPERSEDED_BODY_SHA));
 assert.match(b.installationGuard,/grh_family/);assert.match(b.installationGuard,/grh_catalog_rows/);
 assert.equal(b.installationGuard.includes('employment_status_snapshot'),closure==='full');
 assert.equal(b.fixed.nativeFamilyV5Emitted,false);assert.equal(b.fixed.nativeFamilyV5Preserved,true);
 assert.equal(b.fixed.capabilityDefinitionsAdded,0);assert.equal(b.fixed.roleAssignmentsAdded,0);
 assert.equal(b.fixed.businessOperations,0);assert.equal(b.fixed.nominalRowsReturned,0);
 assert.ok(!b.installation.some(s=>/^CREATE SCHEMA|^CREATE DATABASE|^CREATE ROLE|^SET ROLE|^BEGIN\b|^COMMIT\b/i.test(s)));
});

test('the existing session prerequisite is the complete007 definition plus the unique113 patch and inverse',()=>{
 const before=sourceFunction(migration('007-action-center-read-facades.sql'),'action_center_assert_tenant_read_session_v2');
 const source=lf(read(migration('113-native-employee-self-access.sql')));
 const row="('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)','";
 assert.equal(source.split(row).length-1,1);
 const at=source.indexOf(row)+row.length,declaredBefore=source.slice(at,at+64);
 assert.equal(hash(functionBody(before)),declaredBefore);
 const oldStart=source.indexOf('$old$',at)+5,oldEnd=source.indexOf('$old$',oldStart);
 const newStart=source.indexOf('$new$',oldEnd)+5,newEnd=source.indexOf('$new$',newStart);
 assert.ok(oldStart>at&&oldEnd>oldStart&&newStart>oldEnd&&newEnd>newStart);
 const oldText=source.slice(oldStart,oldEnd),newText=source.slice(newStart,newEnd);
 const expected=replaceOnce(before,oldText,newText);
 for(const closure of ['native','full']){
  const b=batch(closure),actual=unique(b.prerequisiteDefinitions,d=>functionName(d)==='action_center_assert_tenant_read_session_v2','patched session');
  assert.equal(actual,expected);
  assert.equal(replaceOnce(actual,newText,oldText),before,'recover entire007 statement, not only prosrc');
  const pin=unique(b.prerequisitePins,p=>p.name==='action_center_assert_tenant_read_session_v2','patched session pin');
  assert.equal(pin.sha256,hash(functionBody(expected)));
  assert.notEqual(pin.sha256,declaredBefore);
  assert.equal(pin.runtime,false,'existing session is checked without granting a new facade');
 }
});

test('invalid closure and unbound revision fail before reading any source',()=>{
 for(const closure of [undefined,null,'legacy','NATIVE','']){
  let reads=0;
  assert.throws(()=>buildNativeFamilyPrerequisites190Installation({read:()=>{reads++;throw Error('unexpected read');},sourceCommit,closure}),/FAMILY195_CLOSURE_REQUIRED/);
  assert.equal(reads,0);
 }
 let reads=0;
 assert.throws(()=>buildNativeFamilyPrerequisites190Installation({read:()=>{reads++;return '';},sourceCommit:'HEAD',closure:'native'}));
 assert.equal(reads,0);
});

test('all nine public source hashes are admission gates, including the last source',()=>{
 const files=Object.keys(FAMILY_SOURCE_SHA);assert.equal(files.length,9);
 for(const [index,changed] of files.entries()){
  const calls=[];
  assert.throws(()=>buildNativeFamilyPrerequisites190Installation({sourceCommit,closure:'native',read:file=>{
   calls.push(file);const source=read(file);return file===changed?source+'\n-- synthetic inadmissible alteration\n':source;
  }}),error=>error.message.includes('FAMILY195_SOURCE_CHANGED: '+changed));
  assert.deepEqual(calls,files.slice(0,index+1),'do not read past the first rejected source');
 }
 const b=batch('native');
 for(const file of files)assert.equal(b.sourceHashes[file],hash(lf(read(file))));
});

test('CRLF transport normalization preserves each admitted source and the same derived batch',()=>{
 const canonical=batch('native'),crlf=buildNativeFamilyPrerequisites190Installation({sourceCommit,closure:'native',read:file=>lf(read(file)).replaceAll('\n','\r\n')});
 assert.deepEqual(crlf.sourceHashes,canonical.sourceHashes);
 assert.deepEqual(crlf.installation,canonical.installation);
 assert.deepEqual(crlf.derivation,canonical.derivation);
});

test('metadata, DO anchors and trigger templates altered in read fail at source SHA admission',()=>{
 const cases=[
  [migration('091-schooling-administrative-records.sql'),
   'RETURNS TABLE(recorded_at timestamptz,id uuid,certificate jsonb)',
   'RETURNS TABLE(recorded_at timestamptz,id uuid,certificate text)'],
  [migration('064-employee-family-members.sql'),
   'ALTER TABLE school_certificate ADD COLUMN IF NOT EXISTS own_family_id uuid;',
   'ALTER TABLE school_certificate ADD COLUMN IF NOT EXISTS own_family_id text;'],
  [migration('057-family-schooling-certificates.sql'),
   'BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_reject_change_v1()',
   'AFTER TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_reject_change_v1()'],
 ];
 for(const [changed,from,to] of cases){
  const mutated=replaceOnce(read(changed),from,to);
  assert.throws(()=>buildNativeFamilyPrerequisites190Installation({sourceCommit,closure:'full',read:file=>file===changed?mutated:read(file)}),error=>error.message.includes('FAMILY195_SOURCE_CHANGED: '+changed));
 }
});

test('RETURNS TABLE retains all input/output names, modes, defaults and body hashes from real definitions',()=>{
 const rows=[
  [migration('091-schooling-administrative-records.sql'),'school_certificate_records_v3',
   ['ctx','f'],['jsonb','jsonb'],['recorded_at','id','certificate'],['timestamptz','uuid','jsonb'],''],
  [migration('057-family-schooling-certificates.sql'),'school_certificate_current_family_v1',
   ['p_ctx','p_contract_id'],['jsonb','uuid'],
   ['contract_id','person_id','source_batch_id','legajo','employee_name','family_id','family_name','birth_date','family_end_date','identity_token','identity_snapshot','source_cutoff','administrative_active'],
   ['uuid','uuid','uuid','text','text','text','text','date','date','text','jsonb','timestamptz','boolean'],'NULL::uuid'],
  [migration('064-employee-family-members.sql'),'school_certificate_current_family_v2',
   ['ctx','target'],['jsonb','uuid'],
   ['contract_id','person_id','source_batch_id','legajo','employee_name','family_id','family_name','birth_date','family_end_date','identity_token','identity_snapshot','source_cutoff','administrative_active','family_kind','valid_from','recorded_at','identity_review_required'],
   ['uuid','uuid','uuid','text','text','text','text','date','date','text','jsonb','timestamptz','boolean','text','date','timestamptz','boolean'],'NULL::uuid'],
 ];
 for(const [file,name,inputNames,inputTypes,outputNames,outputTypes,defaults] of rows){
  const d=sourceFunction(file,name),p=familyFunctionPin(d,{runtime:false});
  assert.equal(p.signature,'public.'+name+'('+inputTypes.join(',')+')');
  assert.deepEqual(p.argNames,[...inputNames,...outputNames]);
  assert.deepEqual(p.allArgTypes,[...inputTypes,...outputTypes]);
  assert.deepEqual(p.argModes,[...inputTypes.map(()=>'i'),...outputTypes.map(()=>'t')]);
  assert.equal(p.resultType,'record');assert.equal(p.returnsSet,true);assert.equal(p.defaults,defaults);
  assert.equal(p.language,'sql');assert.equal(p.volatility,'s');assert.equal(p.strict,false);assert.equal(p.definer,true);
  assert.deepEqual(p.config,['search_path=public, pg_temp']);assert.equal(p.runtime,false);
  assert.equal(p.sha256,hash(functionBody(d)));
  assert.deepEqual(unique(batch('full').pins,pin=>pin.name===name,name),p);
 }
 const source=sourceFunction(migration('091-schooling-administrative-records.sql'),'school_certificate_records_v3');
 assert.throws(()=>familyFunctionPin(source,{}),/FAMILY195_RUNTIME_EXPLICIT/);
 assert.throws(()=>familyFunctionPin(replaceOnce(source,'certificate jsonb)','certificate jsonb[])'),{runtime:false}),/FAMILY195_TABLE_COLUMN/);
 assert.throws(()=>familyFunctionPin(replaceOnce(source,'AS $$','COST 1 AS $$'),{runtime:false}),/FAMILY195_HEADER_OPTION_UNSUPPORTED/);
 const missing={...batch('native').pins[0]};delete missing.argModes;
 assert.throws(()=>familyPinsCheck([missing],'SYNTHETIC_METADATA_REJECTION'),/FAMILY195_PIN_FIELD:argModes/);
 assert.deepEqual(metadataJson(batch('full').ownCheck),batch('full').pins);
 assert.deepEqual(metadataJson(batch('full').prerequisiteCheck),batch('full').prerequisitePins);
});

function sourceRuntimeState(){
 const state=new Map();
 for(const file of ['057-family-schooling-certificates.sql','064-employee-family-members.sql','091-schooling-administrative-records.sql','102-native-family-schooling.sql']){
  for(const s of statements(migration(file))){
   const m=/^(REVOKE ALL|GRANT EXECUTE) ON FUNCTION ([\s\S]+) (?:FROM|TO) ([\w,]+)$/.exec(s);if(!m)continue;
   for(const signature of m[2].matchAll(/(?:public\.)?([a-z0-9_]+)\([^)]*\)/g)){
    const allowed=m[1]==='GRANT EXECUTE';
    if(allowed)assert.equal(m[3],'municontrol_actions_runtime_app');
    else assert.ok(m[3].split(',').includes('PUBLIC'));
    state.set(signature[1],allowed);
   }
  }
 }
 return state;
}
test('exact two facade grants agree with the final published source ACL, all helpers stay private',()=>{
 const effective=sourceRuntimeState();
 for(const closure of ['native','full']){
  const b=batch(closure),grants=b.acl.filter(s=>s.startsWith('GRANT '));
  assert.deepEqual(b.pins.filter(p=>p.runtime).map(p=>p.name).sort(),runtimeNames);
  assert.deepEqual(grants.map(s=>/^GRANT EXECUTE ON FUNCTION public\.(\w+)\(/.exec(s)?.[1]).sort(),runtimeNames);
  assert.equal(b.acl.length,1+b.pins.length+runtimeNames.length);
  assert.match(b.acl[0],/^REVOKE ALL ON public\.school_certificate_blob,/);
  assert.match(b.acl[0],/ FROM PUBLIC,municontrol_actions_runtime_app$/);
  for(const p of b.pins){
   assert.ok(effective.has(p.name),p.name+' must be declared in source ACL');
   assert.equal(p.runtime,effective.get(p.name),p.name);
   const revoke='REVOKE ALL ON FUNCTION '+p.signature+' FROM PUBLIC,municontrol_actions_runtime_app';
   const ri=b.acl.indexOf(revoke);assert.ok(ri>=1,p.name);
   const grant='GRANT EXECUTE ON FUNCTION '+p.signature+' TO municontrol_actions_runtime_app';
   assert.equal(b.acl.includes(grant),p.runtime,p.name);
   if(p.runtime)assert.ok(b.acl.indexOf(grant)>ri);
  }
  assert.match(b.ownCheck,/has_function_privilege/);assert.match(b.ownCheck,/aclexplode/);
  assert.doesNotMatch(b.prerequisiteCheck,/has_function_privilege|aclexplode/);
 }
});

const fragmentAnchors={
 'do:064-destination':[
  migration('064-employee-family-members.sql'),
  'ALTER TABLE school_certificate ADD CONSTRAINT school_certificate_destination_ck',
  'ALTER TABLE school_certificate ADD CONSTRAINT school_certificate_own_family_fk',
 ],
 'do:102-constraints':[
  migration('102-native-family-schooling.sql'),
  'ALTER TABLE public.employee_family_member ADD CONSTRAINT employee_family_native_pair_ck',
  'ALTER TABLE public.employee_family_member ADD CONSTRAINT employee_family_native_registration_fk',
  'ALTER TABLE public.school_certificate_record ADD CONSTRAINT school_certificate_native_pair_ck',
  'ALTER TABLE public.school_certificate_record ADD CONSTRAINT school_certificate_native_registration_fk',
 ],
};
function originalConstraintFragments(){
 const result=new Map();
 for(const [label,[file,...anchors]] of Object.entries(fragmentAnchors)){
  const source=lf(read(file));
  const fragments=anchors.map(anchor=>{
   assert.equal(source.split(anchor).length-1,1,anchor);const from=source.indexOf(anchor),to=source.indexOf(';',from);
   assert.ok(to>from);return source.slice(from,to);
  });
  result.set(label,fragments);
 }
 return result;
}
for(const closure of ['native','full'])test(closure+': every derivation reverses to the entire public statement, not just a digest',()=>{
 const b=batch(closure),sources=Object.keys(FAMILY_SOURCE_SHA).flatMap(statements),fragments=originalConstraintFragments();
 const originals=new Set([...sources,...[...fragments.values()].flat()]);
 const expected=[...b.tables,b.singleton,...b.indexes,...b.alters,...b.rls,...b.definitions];
 const edits=b.derivation.filter(d=>d.kind==='edit');
 assert.equal(edits.length,expected.length);assert.deepEqual(edits.map(d=>d.result).sort(),[...expected].sort());
 for(const d of edits){
  assert.equal(hash(d.result),d.resultSha256,d.label);assert.equal(d.inverse.length,d.edits.length,d.label);
  let original=d.result;
  for(const [from,to] of d.inverse)original=replaceOnce(original,from,to);
  assert.equal(hash(original),d.sourceSha256,d.label);assert.ok(originals.has(original),d.label+' must recover full admitted statement');
  let replay=original;for(const [from,to] of d.edits)replay=replaceOnce(replay,from,to);
  assert.equal(replay,d.result,d.label);
  if(d.label.startsWith('function:'))assert.equal(functionBody(original),functionBody(d.result));
 }
 for(const s of [...b.tables,...b.alters])assert.doesNotMatch(s,/\bREFERENCES\s+(?!public\.)/);
});

test('both DO blocks rebuild byte-for-byte using exactly their two/four source fragments',()=>{
 const b=batch('native'),unfold=b.derivation.filter(d=>d.kind==='unfold'),fragments=originalConstraintFragments();
 assert.deepEqual(unfold.map(d=>d.label).sort(),Object.keys(fragmentAnchors).sort());
 for(const d of unfold){
  const expectedFragments=fragments.get(d.label);assert.equal(expectedFragments.length,d.label==='do:064-destination'?2:4);
  assert.deepEqual(d.fragmentSha256,expectedFragments.map(hash),d.label);
  let rebuilt=d.template;for(const [index,fragment] of expectedFragments.entries())rebuilt=replaceOnce(rebuilt,'\u00a7'+(index+1)+'\u00a7',fragment);
  assert.equal(hash(rebuilt),d.sourceSha256,d.label);
  const file=fragmentAnchors[d.label][0],original=unique(statements(file),s=>hash(s)===d.sourceSha256,d.label+' full original DO');
  assert.equal(rebuilt,original,d.label);assert.doesNotMatch(rebuilt,/\u00a7\d+\u00a7/);
  // Plain emitted ALTER statements preserve the constraint bytes; no DO/skip wrapper is emitted.
  const emitted=b.alters.filter(s=>s.includes('ADD CONSTRAINT '));assert.equal(emitted.length,6);
  assert.ok(!b.alters.some(s=>/^DO\b/.test(s)||s.includes('IF NOT EXISTS')));
 }
});

test('all14 triggers preserve row/statement timing, target and guard function with no extra trigger',()=>{
 const expected=[];
 for(const table of ['school_certificate_blob','school_certificate','school_certificate_event','employee_family_member','employee_family_member_event']){
  expected.push([table,table+'_immutable','BEFORE UPDATE OR DELETE','ROW','school_certificate_reject_change_v1',27]);
  expected.push([table,table+'_no_truncate','BEFORE TRUNCATE','STATEMENT','school_certificate_reject_change_v1',34]);
 }
 expected.push(
  ['school_certificate_record','school_certificate_record_immutable','BEFORE UPDATE OR DELETE OR TRUNCATE','STATEMENT','school_certificate_record_immutable_v3',58],
  ['school_certificate_record_event','school_certificate_record_event_immutable','BEFORE UPDATE OR DELETE OR TRUNCATE','STATEMENT','school_certificate_record_immutable_v3',58],
  ['employee_family_member','employee_family_member_native_link_v2','BEFORE INSERT','ROW','employee_family_native_link_v2',7],
  ['school_certificate_record','school_certificate_record_native_link_v2','BEFORE INSERT','ROW','employee_family_native_link_v2',7],
 );
 const b=batch('native');assert.equal(expected.length,14);assert.equal(b.triggers.length,14);
 assert.equal(new Set(b.triggers).size,14);
 for(const [table,name,timing,level,fn,type] of expected){
  const ddl='CREATE TRIGGER '+name+' '+timing+' ON public.'+table+' FOR EACH '+level+' EXECUTE FUNCTION public.'+fn+'()';
  assert.ok(b.triggers.includes(ddl),name);
  assert.deepEqual(unique(b.shape[table].triggers,row=>row[0]===name,name),[name,type,'public.'+fn+'()']);
 }
 assert.deepEqual(batch('full').triggers,b.triggers);
});

test('eight table shapes retain native/legacy provenance, exact FK boundaries, RLS and singleton defaults',()=>{
 const b=batch('native'),shape=b.shape;
 assert.equal(Object.keys(shape).length,8);
 const expectedCounts={school_certificate_blob:[5,5,1,1,2,false,0],school_certificate:[23,9,9,5,2,false,0],
  school_certificate_event:[9,2,5,1,2,false,0],school_certificate_storage_policy:[5,5,0,1,0,false,1],
  employee_family_member:[22,15,8,5,3,true,0],employee_family_member_event:[8,1,5,1,2,true,0],
  school_certificate_record:[34,21,9,4,2,true,0],school_certificate_record_event:[9,2,5,1,1,true,0]};
 for(const [name,row] of Object.entries(expectedCounts)){
  const s=shape[name];assert.deepEqual([s.columns.length,s.checks,s.foreign,s.indexCount,s.triggers.length,s.rls,s.rows],row,name);
  assert.equal(new Set(s.columns).size,s.columns.length,name+' has no duplicate column');
  assert.equal(b.tables.filter(d=>d.startsWith('CREATE TABLE public.'+name+'(')||d.startsWith('CREATE TABLE public.'+name+' (')).length,1,name);
 }
 for(const name of ['employee_family_member','school_certificate_record']){
  assert.ok(shape[name].columns.includes('native_registration_id'));
  assert.ok(b.alters.includes('ALTER TABLE public.'+name+' ALTER COLUMN source_batch_id DROP NOT NULL'));
  assert.ok(b.alters.some(s=>s.startsWith('ALTER TABLE public.'+name+' ADD CONSTRAINT ')
   &&s.includes('FOREIGN KEY(native_registration_id) REFERENCES public.native_employee_registration(id)')));
 }
 assert.ok(b.alters.includes('ALTER TABLE public.school_certificate_record ALTER COLUMN source_database DROP NOT NULL'));
 assert.ok(b.alters.includes('ALTER TABLE public.school_certificate_record ALTER COLUMN source_cutoff DROP NOT NULL'));
 assert.equal(b.alters.filter(s=>s.includes(' ADD CONSTRAINT ')).length,6);
 assert.deepEqual(b.rls.slice().sort(),['employee_family_member','employee_family_member_event','school_certificate_record','school_certificate_record_event']
  .map(name=>'ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY').sort());
 assert.equal(b.singleton,'INSERT INTO public.school_certificate_storage_policy(singleton) VALUES(true)');
 assert.match(b.objectsCheck,/"pdf_quota_bytes":8388608,"cluster_limit_bytes":536870912,"cluster_reserve_bytes":16777216,"generation":0/);
 assert.match(b.objectsCheck,/FAMILY195_NATIVE_CONSTRAINT/);assert.match(b.objectsCheck,/FAMILY195_TABLE_SHAPE_SECURITY/);
 assert.deepEqual(batch('full').shape,shape);
});

for(const closure of ['native','full'])test(closure+': body relocation has22/26 unique keys, one deliberate shared pair and no foundation mutation',()=>{
 const b=batch(closure),foundation=existingFoundation();
 const beforeHashes={...foundation.hashes},beforeDescriptors=Object.getOwnPropertyDescriptors(foundation),seed=foundation.seed;
 // Empty digest view reuses the real normalizer; it does not build another seed or DB.
 const emptyView={normalized:foundation.normalized,hashes:Object.freeze({})};
 const extra=familyRelocationHashes(b,emptyView),definitions=[...b.definitions,...b.prerequisiteDefinitions];
 const grouped=new Map();
 for(const d of definitions){const h=hash(functionBody(d));if(!grouped.has(h))grouped.set(h,[]);grouped.get(h).push(functionName(d));}
 const duplicates=[...grouped.values()].filter(names=>names.length>1).map(names=>names.sort());
 assert.deepEqual(duplicates,[sharedNames]);
 assert.equal(grouped.size,closure==='native'?22:26);
 assert.equal(Object.keys(extra).length,grouped.size);assert.equal(Object.isFrozen(extra),true);
 assert.deepEqual(Object.keys(extra).sort(),[...grouped.keys()].sort());
 for(const d of definitions)assert.equal(extra[hash(functionBody(d))],hash(functionBody(foundation.normalized(d))),functionName(d));
 const shared=b.pins.filter(p=>sharedNames.includes(p.name));assert.equal(shared.length,2);assert.equal(shared[0].sha256,shared[1].sha256);
 // Real foundation entries must agree, and only missing keys travel in the returned overlay.
 const overlay=familyRelocationHashes(b,foundation);
 assert.deepEqual(Object.keys(overlay).sort(),[...grouped.keys()].filter(k=>!Object.hasOwn(beforeHashes,k)).sort());
 for(const [from,to] of Object.entries(overlay))assert.equal(to,extra[from]);
 assert.deepEqual(foundation.hashes,beforeHashes);assert.deepEqual(Object.getOwnPropertyDescriptors(foundation),beforeDescriptors);
 assert.equal(foundation.seed,seed);assert.equal(emptyView.hashes && Object.keys(emptyView.hashes).length,0);
 const one=[...grouped.keys()][0],good=extra[one],bad=(good[0]==='0'?'1':'0')+good.slice(1);
 const disagreement={normalized:foundation.normalized,hashes:Object.freeze({...beforeHashes,[one]:bad})};
 assert.throws(()=>familyRelocationHashes(b,disagreement),/FAMILY195_FOUNDATION_HASH_DISAGREES/);
 assert.deepEqual(foundation.hashes,beforeHashes);
 const normalize=familyNormalizer(foundation,overlay),relocatedPins=metadataJson(normalize(b.ownCheck));
 for(const p of [...b.pins,...b.prerequisitePins]){
  const d=unique(definitions,def=>functionName(def)===p.name,p.name);
  assert.equal(overlay[p.sha256]??foundation.hashes[p.sha256],hash(functionBody(foundation.normalized(d))),p.name);
 }
 for(const p of relocatedPins){assert.ok(p.signature.startsWith(schema+'.'));assert.equal(p.sha256,extra[unique(b.pins,x=>x.name===p.name,p.name).sha256]);}
 assert.doesNotMatch(normalize(b.before),/native_leave_/);
 assert.equal(foundation.seed,seed);assert.deepEqual(foundation.hashes,beforeHashes);
});

test('rehearsal/install/durable arrays preserve phase order and cannot smuggle business or commits',()=>{
 const b=batch('native');
 assert.deepEqual(b.rehearsal,b.installation);assert.deepEqual(b.rehearsalLateFailure.slice(0,-1),b.installation);
 assert.match(b.rehearsalLateFailure.at(-1),/FAMILY195_REHEARSAL_LATE_FAILURE/);
 assert.equal(b.installation[0],b.isolation);assert.match(b.isolation,/repeatable read/);
 for(const phase of [b.rehearsal,b.installation,b.durableVerification])assert.ok(!phase.some(s=>/^BEGIN\b|^COMMIT\b|^ROLLBACK\b|^SET ROLE\b|^CREATE DATABASE\b|^CREATE SCHEMA\b/i.test(s)));
 assert.ok(b.installation.indexOf(b.prerequisiteCheck)<b.installation.indexOf(b.before));
 assert.ok(b.installation.indexOf(b.before)<b.installation.indexOf(b.tables[0]));
 assert.ok(b.installation.indexOf(b.after)>b.installation.indexOf(b.ownCheck));
 assert.ok(b.installation.indexOf(b.priorAudit)>b.installation.indexOf(b.after));
 assert.equal(b.installation.at(-1),b.proof);
 assert.deepEqual(b.durableVerification,['SET TRANSACTION READ ONLY',b.isolation,b.prerequisiteCheck,b.objectsCheck,b.ownCheck,b.after,b.durableProof]);
 assert.match(b.priorAudit,/FAMILY195_PRIOR_STATE_CHANGED/);assert.match(b.priorAudit,/FAMILY195_PRIOR_TRIGGER_CHANGED/);
 assert.match(b.priorAudit,/t\.tgisinternal/);assert.match(b.priorAudit,/t\.tgconstraint IN/);
 // New-object exclusion does not remove the existing lifecycle, IAM or role families.
 for(const sql of [b.before,b.after]){
  assert.doesNotMatch(sql,/LIKE 'native_employment_%'|LIKE 'iam_%'|LIKE 'tenant_%'/);
  assert.doesNotMatch(sql,/capability_key NOT IN|DELETE FROM|TRUNCATE public\./);
 }
});

// O1/O2/O3/O4: complete reviewed additions; still unexecuted.
for(const closure of ['native','full'])test(closure+': durable prerequisites remain a pre-195 proof with coherent snapshot GUCs',()=>{
 const b=batch(closure),prefix='municontrol_family195.';
 const nativeFamilyConflict="OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_family_%') THEN RAISE EXCEPTION 'FAMILY195_FUNCTION_COUNT'";
 assert.ok(b.objectsCheck.includes(nativeFamilyConflict),'durable prerequisites may not silently accept the later195 family');
 assert.equal(b.installation.filter(s=>s===b.objectsCheck).length,1);
 assert.equal(b.durableVerification.filter(s=>s===b.objectsCheck).length,1);
 for(const slot of ['before','after']){
  const writers=[...b[slot].matchAll(/PERFORM set_config\('([^']+)',result::text,true\)/g)].map(m=>m[1]);
  assert.deepEqual(writers,[prefix+slot],slot+' has exactly the expected LOCAL snapshot writer');
 }
 const readerKeys=sql=>[...new Set([...sql.matchAll(/current_setting\('([^']+)'/g)].map(m=>m[1]))].sort();
 assert.deepEqual(readerKeys(b.priorAudit),[prefix+'after',prefix+'before']);
 assert.deepEqual(readerKeys(b.proof),[prefix+'after',prefix+'before']);
 assert.deepEqual(readerKeys(b.durableProof),[prefix+'after']);
 assert.match(b.priorAudit,/old jsonb:=current_setting\('municontrol_family195\.before'\)::jsonb;new jsonb:=current_setting\('municontrol_family195\.after'\)::jsonb/);
 assert.match(b.proof,/'beforeFingerprint',encode\(public\.digest\(current_setting\('municontrol_family195\.before'\),'sha256'\),'hex'\)/);
 assert.doesNotMatch(b.durableProof,/beforeFingerprint|municontrol_family195\.before/);
 for(const sql of [b.before,b.after,b.priorAudit,b.proof,b.durableProof])assert.doesNotMatch(sql,/municontrol_sql111\.|native_leave_/);
 assert.equal(b.installation.includes('SET TRANSACTION READ ONLY'),false);
 assert.equal(b.durableVerification[0],'SET TRANSACTION READ ONLY');
});

for(const closure of ['native','full'])test(closure+': DDL segments preserve SQL creation dependencies and metadata verification follows ACL',()=>{
 const b=batch(closure),segments=[b.tables,[b.singleton],b.indexes,b.alters,b.rls,b.definitions,b.triggers,b.acl];
 const at=s=>{
  const positions=[];for(let i=0;i<b.installation.length;i++)if(b.installation[i]===s)positions.push(i);
  assert.equal(positions.length,1,'one emitted DDL statement: '+s.slice(0,70));return positions[0];
 };
 for(const segment of segments)assert.ok(segment.length>0,'each dependency segment is nonempty');
 for(let index=1;index<segments.length;index++){
  const earlier=segments[index-1].map(at),later=segments[index].map(at);
  assert.ok(Math.max(...earlier)<Math.min(...later),'DDL segment '+index+' follows segment '+(index-1));
 }
 const migration=segments.flat(),firstTable=at(b.tables[0]);
 assert.deepEqual(b.installation.slice(firstTable,firstTable+migration.length),migration,'the dependency sequence is the actual contiguous emitted migration');
 // prerequisiteCheck occurs before the first snapshot and again after migration.
 // Do not use its first index as the post-migration metadata anchor.
 const lastAcl=at(b.acl.at(-1));
 assert.equal(b.installation[lastAcl+1],b.prerequisiteCheck);
 assert.equal(b.installation[lastAcl+2],b.objectsCheck);
 assert.equal(b.installation[lastAcl+3],b.ownCheck);
 assert.equal(b.installation[lastAcl+4],b.after);
 const names=b.definitions.map(functionName),ordered=(prerequisite,dependent)=>{
  const first=names.indexOf(prerequisite),second=names.indexOf(dependent);
  assert.ok(first>=0&&second>=0&&first<second,prerequisite+' must exist before '+dependent);
 };
 ordered('employee_family_name_key_v1','employee_family_identity_matches_v1');
 if(closure==='full')ordered('school_certificate_current_family_v1','school_certificate_current_family_v2');
});

for(const closure of ['native','full'])test(closure+': absence guard covers every emitted object in its own catalog predicate',()=>{
 const b=batch(closure),namedIndexes=b.indexes.map(s=>{
  const m=/^CREATE (?:UNIQUE )?INDEX (\w+) ON /.exec(s);assert.ok(m);return m[1];
 }),namedTriggers=b.triggers.map(s=>{
  const m=/^CREATE TRIGGER (\w+) /.exec(s);assert.ok(m);return m[1];
 }),namedConstraints=b.alters.filter(s=>s.includes(' ADD CONSTRAINT ')).map(s=>{
  const m=/ ADD CONSTRAINT (\w+)/.exec(s);assert.ok(m);return m[1];
 });
 const categories=[
  ['tables',/WHERE relnamespace='public'::regnamespace AND relname IN\(([^)]*)\)/,Object.keys(b.shape),8],
  ['functions',/s\.nspname='public' AND p\.proname IN\(([^)]*)\)/,b.pins.map(p=>p.name),closure==='native'?17:21],
  ['indexes',/c\.relkind='i' AND c\.relname IN\(([^)]*)\)/,namedIndexes,5],
  ['triggers',/t\.tgname IN\(([^)]*)\)/,namedTriggers,14],
  ['constraints',/k\.conname IN\(([^)]*)\)/,namedConstraints,6],
 ];
 const all=[];
 for(const[label,pattern,expected,count]of categories){
  assert.equal(expected.length,count,label+' emitted object count');
  const match=pattern.exec(b.absenceCheck);assert.ok(match,label+' has its own absence predicate');
  const actual=match[1].split(',').map(token=>{
   const quoted=/^'([a-z0-9_]+)'$/.exec(token.trim());assert.ok(quoted,label+' contains only complete literal names');return quoted[1];
  });
  assert.equal(new Set(actual).size,actual.length,label+' guard list has no duplicates');
  assert.deepEqual([...actual].sort(),[...expected].sort(),label+' guarded names equal the emitted names');
  all.push(...expected);
 }
 assert.equal(new Set(all).size,all.length,'object categories do not accidentally share a name in this finite batch');
 assert.match(b.absenceCheck,/FAMILY195_OBJECT_CONFLICT/);
 assert.equal(b.installation.indexOf(b.absenceCheck),2,'absence must be checked before any DDL');
});

for(const closure of ['native','full'])test(closure+': fixed proof counters and body counts match the complete planned batch',()=>{
 const b=batch(closure),groups=new Map();
 for(const definition of [...b.definitions,...b.prerequisiteDefinitions]){
  const digest=hash(functionBody(definition));if(!groups.has(digest))groups.set(digest,[]);
  groups.get(digest).push(functionName(definition));
 }
 const sharedBodies=[...groups.values()].filter(names=>names.length>1).map(names=>[...names].sort());
 assert.deepEqual(sharedBodies,[sharedNames]);
 assert.equal(groups.size,closure==='native'?22:26);
 assert.deepEqual(b.counts,{
  definitions:b.definitions.length,prerequisiteDefinitions:6,
  uniqueBodyDigests:groups.size,sharedBodies,
 });
 assert.deepEqual(b.fixed,{
  allChecksPassed:true,newTables:8,newFunctions:b.pins.length,runtimeFacades:2,
  newNamedIndexes:b.indexes.length,newTriggers:b.triggers.length,
  alterConstraints:b.alters.filter(s=>s.includes(' ADD CONSTRAINT ')).length,
  storagePolicyRows:1,familyRows:0,nativeFamilyV5Emitted:false,nativeFamilyV5Preserved:true,
  lifecycleRangePreserved:true,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,
  existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,
 });
});

function syntheticProof(b){
 return {version:b.version,closure:b.closure,sourceCommit:b.sourceCommit,sourceHashes:{...b.sourceHashes},...b.fixed,
  priorTableCount:100,beforeFingerprint:'a'.repeat(64),priorFingerprint:'a'.repeat(64),
  objectFingerprint:'b'.repeat(64),prerequisiteFingerprint:'c'.repeat(64)};
}
test('durability checks reject changed source, prior state, object, authority or business evidence',()=>{
 const b=batch('native'),installed=syntheticProof(b),{beforeFingerprint,...durable}=installed;
 assert.deepEqual(assertNativeFamilyPrerequisitesDurability({batch:b,installed,durable}),{
  passed:true,closure:'native',priorStatePreserved:true,newObjectsPreserved:true,nativeFamilyV5Preserved:true,
  lifecycleRangePreserved:true,businessOperations:0,nominalRowsReturned:0,
 });
 const cases=[{version:'other'},{closure:'full'},{sourceCommit:'b'.repeat(40)},
  {sourceHashes:{...durable.sourceHashes,[Object.keys(durable.sourceHashes)[0]]:'d'.repeat(64)}},
  {allChecksPassed:false},{nativeFamilyV5Emitted:true},{nativeFamilyV5Preserved:false},{lifecycleRangePreserved:false},
  {runtimeFacades:3},{newTables:9},{newFunctions:18},{newTriggers:15},{familyRows:1},
  {capabilityDefinitionsAdded:1},{roleAssignmentsAdded:1},{existingAclChanges:1},{businessOperations:1},{nominalRowsReturned:1},
  {priorTableCount:99},{priorFingerprint:'d'.repeat(64)},{objectFingerprint:'d'.repeat(64)},{prerequisiteFingerprint:'d'.repeat(64)}];
 for(const patch of cases)assert.throws(()=>assertNativeFamilyPrerequisitesDurability({batch:b,installed,durable:{...durable,...patch}}),JSON.stringify(patch));
 assert.throws(()=>assertNativeFamilyPrerequisitesDurability({batch:b,installed:{...installed,beforeFingerprint:'e'.repeat(64)},durable}),/FAMILY195_PRIOR_DATA_CHANGED/);
 assert.throws(()=>assertNativeFamilyPrerequisitesDurability({batch:b,installed:{...installed,priorTableCount:0},durable}));
 assert.throws(()=>assertNativeFamilyPrerequisitesDurability({batch:b,installed,durable:{...durable,objectFingerprint:undefined}}));
});

/* Remaining validation after adoption (not claimed by these tests):
 * - Pure construction acceptance of this exact proposal and any root adjustment.
 * - Real PostgreSQL17/18 parsing/catalogue metadata, ACL effects, trigger semantics,
 *   constraints and whole-before/after conservation on the existing QA190 host.
 * - Rehearsal ROLLBACK, expected exact native errors, install COMMIT and separate
 *   durable READ ONLY verification, through root's reviewed native runner/latch.
 * - SQL195 itself,10facades/23functions/3tables/3capabilities, actors and browser
 *   are separate follow-up work; these tests cover only the prerequisite builder.
 * - Source admission mutations do not demonstrate private inner-template branches:
 *   those are unreachable through an altered read without first rejecting the SHA.
 */
