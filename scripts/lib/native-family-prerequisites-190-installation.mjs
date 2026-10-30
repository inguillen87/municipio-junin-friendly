// scripts/lib/native-family-prerequisites-190-installation.mjs
// Pure source construction of the 057/064/091/102 family closure for an EXISTING
// QA190 schema. No connection, execution, seed, actor, role, capability or SQL195
// installation. school_certificate_native_family_v5 is never emitted: the
// destination keeps its 110 lifecycle body and must prove it before and after.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';

export const FAMILY_PREREQUISITES_VERSION='native-family-prerequisites-190.v1';
// 110:554-577 body (SQL195_SOURCE_PIN_CHECK_20261026, fila #10). The 102:295-318
// body must never be installed, pinned or restored here.
export const NATIVE_FAMILY_V5_LIFECYCLE_BODY_SHA='4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c';
export const NATIVE_FAMILY_V5_SUPERSEDED_BODY_SHA='9204d4fd4350ce9f66f5544422a01453421286e7b278a349d344a22f9338e042';
// LF-normalized file digests. 007/057/091/102/110/113 come from the private
// source check (raw == LF for this repository, cf. own-art-full-installation.mjs:14-15).
// Marks that are not 64 hex chars make the builder refuse to run: root computes them.
export const FAMILY_SOURCE_SHA=Object.freeze({
 'scripts/migrations/007-action-center-read-facades.sql':'d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e',
 'scripts/migrations/057-family-schooling-certificates.sql':'22ac3e3f444a64736303f9c0aa58368dbae20c1a6e58aa669c8570a9604c5b11',
 'scripts/migrations/064-employee-family-members.sql':'229e06ccb04f362d82bcf9cd4927bf60b90c3245dd43911d52695127479aca6b',
 'scripts/migrations/091-schooling-administrative-records.sql':'cd43efd5bdde8a576b916f8410e541f75e52b56a5981bd38c5e9bee61a6cb58f',
 'scripts/migrations/093-native-fixed-novelties.sql':'b77d0d467ae1acac3e0641494ba1c7af316d725a1a58a5f541f3912482b1ad6a',
 'scripts/migrations/099-grh-curated-consumers.sql':'208ae997983d506d2761c6db6eaf272f367dec1483a9b4cd4d2140d972d1a95d',
 'scripts/migrations/102-native-family-schooling.sql':'cd0665bbe24e8285f9b9a22bc11b898f7dec1506d7ac6430bfb62bda447824be',
 'scripts/migrations/110-native-employment-lifecycle.sql':'e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219',
 'scripts/migrations/113-native-employee-self-access.sql':'9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7',
});
const prefix='municontrol_family195.',RUNTIME='municontrol_actions_runtime_app';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const clean=v=>v.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'FAMILY195_BODY_REQUIRED');return m[2];};
const once=(source,from,to,code='FAMILY195_SOURCE_ANCHOR')=>{assert.equal(source.split(from).length,2,code+':'+from.slice(0,60));return source.replace(from,()=>to);};
const file=n=>'scripts/migrations/'+n;

// Creation order = REFERENCES closure over the relations the QA190 seed already has.
const TABLES=Object.freeze([
 ['057-family-schooling-certificates.sql','school_certificate_blob'],
 ['057-family-schooling-certificates.sql','school_certificate'],
 ['057-family-schooling-certificates.sql','school_certificate_event'],
 ['057-family-schooling-certificates.sql','school_certificate_storage_policy'],
 ['064-employee-family-members.sql','employee_family_member'],
 ['064-employee-family-members.sql','employee_family_member_event'],
 ['091-schooling-administrative-records.sql','school_certificate_record'],
 ['091-schooling-administrative-records.sql','school_certificate_record_event'],
]);
const TABLE_NAMES=TABLES.map(([,n])=>n);
const PRIOR_RELATIONS=Object.freeze(['platform_tenant','employment_contract','person_identity','source_import_batch','tenant_identity_session','platform_tenant_source_binding','tenant_membership','native_employee_registration']);
// Needed at runtime by employee_family_declare_v2 (102:425) and, in closure 'full',
// at CREATE time by the LANGUAGE sql readers 057:186 and 064:192.
const RUNTIME_RELATIONS=Object.freeze(['grh_family','grh_catalog_rows']),FULL_RELATIONS=Object.freeze(['employment_status_snapshot']);
const KNOWN_RELATIONS=new Set([...TABLE_NAMES,...PRIOR_RELATIONS]);
// Explicit, source-backed runtime facades (102:591; 091:292-295 kept by 102:492).
const RUNTIME_FACADES=new Set(['employee_family_declare_v2','school_certificate_register_v3']);
const GRH_BRANCH=new Set(['school_certificate_assert_mapping_v1','school_certificate_assert_contract_v1','school_certificate_current_family_v1','school_certificate_current_family_v2']);
// Order respects LANGUAGE sql validation at CREATE time (identity_matches→name_key,
// current_family_v2→current_family_v1, records_v3→tables, receipt_v2→member type).
const FUNCTIONS=Object.freeze([
 ['057','school_certificate_reject_change_v1'],['091','school_certificate_record_immutable_v3'],['102','employee_family_native_link_v2'],
 ['064','employee_family_name_key_v1'],['064','employee_family_identity_matches_v1'],
 ['057','school_certificate_assert_mapping_v1'],['057','school_certificate_assert_contract_v1'],['057','school_certificate_current_family_v1'],
 ['064','employee_family_subject_v1'],['064','school_certificate_current_family_v2'],
 ['057','school_certificate_storage_capacity_v1'],['057','school_certificate_storage_reserve_v1'],['057','school_certificate_context_v1'],
 ['091','school_certificate_date_v3'],['091','school_certificate_records_v3'],
 ['102','employee_family_subject_v2'],['102','employee_family_write_context_v2'],['102','employee_family_receipt_v2'],
 ['102','school_certificate_family_v3'],['102','school_certificate_register_v3'],['102','employee_family_declare_v2'],
]);
const FILE_OF={'057':'057-family-schooling-certificates.sql','064':'064-employee-family-members.sql','091':'091-schooling-administrative-records.sql','102':'102-native-family-schooling.sql'};
// [table, name, tgtype, timing, level, function]. 057/064 rows are rendered from
// the format() templates of their DO blocks; all rows are cross-checked against
// the declarations in 102:96-101 and 102:110-111 (tgtype 27/34/58/7).
const TRIGGERS=Object.freeze([
 ...['school_certificate_blob','school_certificate','school_certificate_event','employee_family_member','employee_family_member_event'].flatMap(t=>[
  [t,t+'_immutable',27,'BEFORE UPDATE OR DELETE','ROW','school_certificate_reject_change_v1'],
  [t,t+'_no_truncate',34,'BEFORE TRUNCATE','STATEMENT','school_certificate_reject_change_v1']]),
 ['school_certificate_record','school_certificate_record_immutable',58,'BEFORE UPDATE OR DELETE OR TRUNCATE','STATEMENT','school_certificate_record_immutable_v3'],
 ['school_certificate_record_event','school_certificate_record_event_immutable',58,'BEFORE UPDATE OR DELETE OR TRUNCATE','STATEMENT','school_certificate_record_immutable_v3'],
 ['employee_family_member','employee_family_member_native_link_v2',7,'BEFORE INSERT','ROW','employee_family_native_link_v2'],
 ['school_certificate_record','school_certificate_record_native_link_v2',7,'BEFORE INSERT','ROW','employee_family_native_link_v2'],
]);
const NAMED_INDEXES=Object.freeze({ // name → [table, unique, partial]
 school_certificate_identity_idx:['school_certificate',false,false],
 employee_family_member_document_uk:['employee_family_member',true,true],
 employee_family_member_subject_idx:['employee_family_member',false,false],
 school_certificate_own_identity_idx:['school_certificate',false,true],
 school_certificate_record_identity_idx:['school_certificate_record',false,false],
});
const ADDED_CONSTRAINTS=Object.freeze(['school_certificate_destination_ck','school_certificate_own_family_fk','employee_family_native_pair_ck','employee_family_native_registration_fk','school_certificate_native_pair_ck','school_certificate_native_registration_fk']);
// Source tallies (see delivery §2). Recomputed from DDL text; a mismatch is a build error.
const EXPECTED_SHAPE=Object.freeze({
 school_certificate_blob:{columns:5,checks:5,foreign:1,indexes:1,triggers:2,rls:false,rows:0},
 school_certificate:{columns:23,checks:9,foreign:9,indexes:5,triggers:2,rls:false,rows:0},
 school_certificate_event:{columns:9,checks:2,foreign:5,indexes:1,triggers:2,rls:false,rows:0},
 school_certificate_storage_policy:{columns:5,checks:5,foreign:0,indexes:1,triggers:0,rls:false,rows:1},
 employee_family_member:{columns:22,checks:15,foreign:8,indexes:5,triggers:3,rls:true,rows:0},
 employee_family_member_event:{columns:8,checks:1,foreign:5,indexes:1,triggers:2,rls:true,rows:0},
 school_certificate_record:{columns:34,checks:21,foreign:9,indexes:4,triggers:2,rls:true,rows:0},
 school_certificate_record_event:{columns:9,checks:2,foreign:5,indexes:1,triggers:1,rls:true,rows:0},
});

// ---- metadata pins -------------------------------------------------------------
const typeList=signature=>{const inner=signature.slice(signature.indexOf('(')+1,-1);return inner?inner.split(','):[];};
export function familyFunctionPin(definition,{runtime}){
 assert.equal(typeof runtime,'boolean','FAMILY195_RUNTIME_EXPLICIT');
 const header=definition.slice(0,/\bAS\s+\$\w*\$/.exec(definition).index);
 assert.ok(!/\b(COST|ROWS|PARALLEL|LEAKPROOF|STRICT|SUPPORT)\b/i.test(header),'FAMILY195_HEADER_OPTION_UNSUPPORTED');
 const table=/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?\w+\s*\(([\s\S]*?)\)\s*RETURNS\s+TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE\s+\w+/i.exec(definition);
 if(!table){const pin=ownInstallationFunctionPin(definition),types=typeList(pin.signature);return {...pin,allArgTypes:types,argModes:types.map(()=>'i'),runtime};}
 // RETURNS TABLE(...) columns are OUT ('t') arguments in pg_proc (102:133,137,143,146).
 const columns=table[2].split(',').map(s=>{const c=/^\s*(\w+)\s+([\w.]+)\s*$/.exec(s);assert.ok(c,'FAMILY195_TABLE_COLUMN');return {name:c[1],type:c[2]};});
 const base=ownInstallationFunctionPin(definition.replace(/RETURNS\s+TABLE\s*\([\s\S]*?\)\s*LANGUAGE/i,'RETURNS record LANGUAGE')),params=typeList(base.signature);
 assert.equal(base.sha256,hash(body(definition)));
 return {...base,resultType:'record',returnsSet:true,argNames:[...base.argNames,...columns.map(c=>c.name)],allArgTypes:[...params,...columns.map(c=>c.type)],argModes:[...params.map(()=>'i'),...columns.map(()=>'t')],runtime};
}
// Same contract as native-leave pinsCheck, plus 102:157-162 argument-mode semantics
// (needed for RETURNS TABLE). acl:false drops the runtime/ACL clauses for prerequisites:
// their existing EXECUTE ACLs are preserved exactly by the whole prior-state snapshot
// (own-payroll-installation.mjs prerequisiteCheck) instead of being normalized.
export function familyPinsCheck(pins,code,{acl=true}={}){
 assert.ok(Array.isArray(pins)&&pins.length>0);
 for(const p of pins)for(const k of ['signature','sha256','argNames','allArgTypes','argModes','defaults','resultType','language','returnsSet','strict','definer','volatility','config','runtime'])assert.ok(Object.hasOwn(p,k),'FAMILY195_PIN_FIELD:'+k);
 const aclClause=acl?`
   OR has_function_privilege(${q(RUNTIME)},p.oid,'EXECUTE') IS DISTINCT FROM (x->>'runtime')::boolean
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee=${q(RUNTIME)}::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))`:'';
 return `DO $metadata$ DECLARE x jsonb;p pg_proc; BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.provariadic<>0 OR p.prosecdef IS DISTINCT FROM (x->>'definer')::boolean OR p.proisstrict IS DISTINCT FROM (x->>'strict')::boolean OR p.proretset IS DISTINCT FROM (x->>'returnsSet')::boolean
   OR p.prorettype<>(x->>'resultType')::regtype OR p.provolatile<>x->>'volatility' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>(CASE WHEN p.proretset THEN 1000 ELSE 0 END)
   OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'argNames'
   OR coalesce(p.proargmodes,array_fill('i'::"char",ARRAY[p.pronargs]))::text[] IS DISTINCT FROM ARRAY(SELECT value#>>'{}' FROM jsonb_array_elements(x->'argModes') value)
   OR ARRAY(SELECT unnest(coalesce(p.proallargtypes,p.proargtypes::oid[]))) IS DISTINCT FROM ARRAY(SELECT (value#>>'{}')::regtype::oid FROM jsonb_array_elements(x->'allArgTypes') value)
   OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'
   OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM x->'config' OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
   OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>x->>'sha256'${aclClause}
  THEN RAISE EXCEPTION '${code}' USING DETAIL=x->>'signature'; END IF;
 END LOOP; END $metadata$`;
}

// ---- builder -------------------------------------------------------------------
export function buildNativeFamilyPrerequisites190Installation({read,sourceCommit,closure}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok(['full','native'].includes(closure),'FAMILY195_CLOSURE_REQUIRED');
 const texts={},parts={},sourceHashes={};
 for(const [path,sha] of Object.entries(FAMILY_SOURCE_SHA)){
  assert.match(sha,/^[a-f0-9]{64}$/,'FAMILY195_SOURCE_SHA_REQUIRED: '+path);
  const text=lf(read(path));assert.equal(hash(text),sha,'FAMILY195_SOURCE_CHANGED: '+path);texts[path]=text;sourceHashes[path]=sha;parts[path]=splitPostgresStatements(text).map(clean);
 }
 const sourcePath=n=>file(n.endsWith('.sql')?n:FILE_OF[n]);
 const statement=(n,re)=>{const found=parts[sourcePath(n)].filter(s=>re.test(s));assert.equal(found.length,1,'FAMILY195_UNIQUE_STATEMENT:'+n+':'+re);return found[0];};
 // Every emitted statement that comes from a source statement is recorded with the
 // bytes actually emitted (result/resultSha256) and an inverse that recovers the
 // full source statement; 'unfold' entries tie DO-block fragments to their source.
 const derivation=[];const derive=(label,source,edits)=>{let value=source;const inverse=[];for(const [from,to] of edits){assert.ok(from&&to,'FAMILY195_EDIT_NOT_INVERTIBLE:'+label);value=once(value,from,to);inverse.unshift([to,from]);}derivation.push({label,kind:'edit',sourceSha256:hash(source),resultSha256:hash(value),result:value,edits:edits.map(e=>[...e]),inverse});return value;};
 // Schema qualification as explicit, invertible once() edits: one per distinct
 // unqualified REFERENCES target. A relation referenced twice in one statement
 // would be ambiguous for once() and is rejected instead of qualified by regex.
 const referenceEdits=text=>{const seen=new Map();for(const m of text.matchAll(/\bREFERENCES\s+(?!public\.)(\w+)\s*\(/g)){assert.ok(KNOWN_RELATIONS.has(m[1]),'FAMILY195_UNKNOWN_REFERENCE:'+m[1]);assert.ok(!seen.has(m[0]),'FAMILY195_REFERENCE_AMBIGUOUS:'+m[1]);seen.set(m[0],m[0].replace(/^REFERENCES\s+/,s=>s+'public.'));}return [...seen];};
 // Unfold a guarded DO block into its inner ALTER statements as exact byte slices.
 // The wrapper left after removing the fragments must equal the declared guard
 // template (whitespace folded), so nothing else can travel inside the block.
 const unfoldDo=(label,doStatement,expectedTemplate)=>{
  const fragments=[...doStatement.matchAll(/ALTER TABLE (?:public\.)?\w+ ADD CONSTRAINT [\s\S]*?(?=;)/g)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0]}));
  assert.ok(fragments.length>0,'FAMILY195_DO_FRAGMENTS:'+label);
  let template=doStatement;for(let i=fragments.length-1;i>=0;i--)template=template.slice(0,fragments[i].start)+'§'+(i+1)+'§'+template.slice(fragments[i].end);
  assert.equal(template.replace(/\s+/g,' ').trim(),expectedTemplate,'FAMILY195_DO_TEMPLATE:'+label);
  let rebuilt=template;fragments.forEach((f,i)=>{rebuilt=once(rebuilt,'§'+(i+1)+'§',f.text);});assert.equal(rebuilt,doStatement,'FAMILY195_DO_REBUILD:'+label);
  derivation.push({label,kind:'unfold',sourceSha256:hash(doStatement),template,fragmentSha256:fragments.map(f=>hash(f.text))});
  return fragments.map(f=>f.text);
 };

 // 1. tables (057/064/091): CREATE TABLE IF NOT EXISTS x → CREATE TABLE public.x and
 //    every REFERENCES target qualified, all as recorded once() edits.
 const tableSource={},tables=TABLES.map(([n,name])=>{
  const src=statement(n,new RegExp('^CREATE TABLE IF NOT EXISTS '+name+'\\s*\\('));tableSource[name]=src;
  return derive('table:'+name,src,[['CREATE TABLE IF NOT EXISTS '+name,'CREATE TABLE public.'+name],...referenceEdits(src)]);
 });
 for(const t of tables)assert.ok(!/\bREFERENCES\s+(?!public\.)/.test(t)&&!/IF NOT EXISTS/.test(t),'FAMILY195_TABLE_QUALIFICATION');
 // 2. singleton row (057:63) without ON CONFLICT: the table is new and must be empty.
 const singleton=derive('singleton',statement('057',/^INSERT INTO school_certificate_storage_policy\(singleton\) VALUES\(true\) ON CONFLICT DO NOTHING$/),[['INSERT INTO school_certificate_storage_policy','INSERT INTO public.school_certificate_storage_policy'],['VALUES(true) ON CONFLICT DO NOTHING','VALUES(true)']]);
 // 3. named indexes (057:41, 064:30, 064:32, 064:67, 091:35): no IF NOT EXISTS, qualified.
 const indexes=Object.entries(NAMED_INDEXES).map(([name,[table]])=>{
  const src=statement(table==='school_certificate_record'?'091':table==='school_certificate'&&name==='school_certificate_identity_idx'?'057':'064',new RegExp('^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS '+name+'\\b'));
  const m=/^CREATE (UNIQUE )?INDEX IF NOT EXISTS (\w+)\s+ON (\w+)\s*\(/.exec(src);assert.ok(m&&m[3]===table,'FAMILY195_INDEX_TABLE:'+name);
  return derive('index:'+name,src,[[m[0],'CREATE '+(m[1]||'')+'INDEX '+name+' ON public.'+table+'(']]);
 });
 // 4. ALTER/constraints. 064:56-66 and 102:167-188; DO blocks are unfolded into plain
 //    statements (no IF NOT EXISTS guards: a collision must fail, not be skipped).
 // Guard templates of the two DO blocks (064:58-66, 102:175-188), whitespace folded.
 const DO_064_TEMPLATE=`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='school_certificate'::regclass AND conname='school_certificate_destination_ck') THEN §1§; §2§; END IF; END $$`;
 const DO_102_TEMPLATE=`DO $constraints$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.employee_family_member'::regclass AND conname='employee_family_native_pair_ck') THEN §1§; §2§; END IF; IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.school_certificate_record'::regclass AND conname='school_certificate_native_pair_ck') THEN §3§; §4§; END IF; END $constraints$`;
 const alters=[
  derive('alter:own_family_id',statement('064',/^ALTER TABLE school_certificate ADD COLUMN IF NOT EXISTS own_family_id uuid$/),[['ALTER TABLE school_certificate ADD COLUMN IF NOT EXISTS','ALTER TABLE public.school_certificate ADD COLUMN']]),
  derive('alter:family_id_nullable',statement('064',/^ALTER TABLE school_certificate ALTER COLUMN family_id DROP NOT NULL$/),[['ALTER TABLE school_certificate','ALTER TABLE public.school_certificate']]),
  ...unfoldDo('do:064-destination',statement('064',/^DO \$\$ BEGIN\n IF NOT EXISTS\(SELECT 1 FROM pg_constraint WHERE conrelid='school_certificate'::regclass AND conname='school_certificate_destination_ck'\)/),DO_064_TEMPLATE)
   .map((fragment,i)=>derive('alter:064-constraint:'+(i+1),fragment,[['ALTER TABLE school_certificate','ALTER TABLE public.school_certificate'],...referenceEdits(fragment)])),
  derive('alter:member_native_registration_id',statement('102',/^ALTER TABLE public\.employee_family_member ADD COLUMN IF NOT EXISTS native_registration_id uuid$/),[['ADD COLUMN IF NOT EXISTS native_registration_id','ADD COLUMN native_registration_id']]),
  derive('alter:member_source_batch_nullable',statement('102',/^ALTER TABLE public\.employee_family_member ALTER COLUMN source_batch_id DROP NOT NULL$/),[]),
  derive('alter:record_native_registration_id',statement('102',/^ALTER TABLE public\.school_certificate_record ADD COLUMN IF NOT EXISTS native_registration_id uuid$/),[['ADD COLUMN IF NOT EXISTS native_registration_id','ADD COLUMN native_registration_id']]),
  derive('alter:record_source_batch_nullable',statement('102',/^ALTER TABLE public\.school_certificate_record ALTER COLUMN source_batch_id DROP NOT NULL$/),[]),
  derive('alter:record_source_database_nullable',statement('102',/^ALTER TABLE public\.school_certificate_record ALTER COLUMN source_database DROP NOT NULL$/),[]),
  derive('alter:record_source_cutoff_nullable',statement('102',/^ALTER TABLE public\.school_certificate_record ALTER COLUMN source_cutoff DROP NOT NULL$/),[]),
  ...unfoldDo('do:102-constraints',statement('102',/^DO \$constraints\$/),DO_102_TEMPLATE).map((fragment,i)=>derive('alter:102-constraint:'+(i+1),fragment,[])),
 ];
 const rls=[
  derive('rls:record',statement('091',/^ALTER TABLE school_certificate_record ENABLE ROW LEVEL SECURITY$/),[['ALTER TABLE school_certificate_record','ALTER TABLE public.school_certificate_record']]),
  derive('rls:record_event',statement('091',/^ALTER TABLE school_certificate_record_event ENABLE ROW LEVEL SECURITY$/),[['ALTER TABLE school_certificate_record_event','ALTER TABLE public.school_certificate_record_event']]),
  derive('rls:member',statement('102',/^ALTER TABLE public\.employee_family_member ENABLE ROW LEVEL SECURITY$/),[]),
  derive('rls:member_event',statement('102',/^ALTER TABLE public\.employee_family_member_event ENABLE ROW LEVEL SECURITY$/),[]),
 ];
 // 5. functions: unique definition per file, CREATE FUNCTION public.x (never OR REPLACE).
 const selected=FUNCTIONS.filter(([,name])=>closure==='full'||!GRH_BRANCH.has(name));
 const definitions=[],pins=[];
 for(const [n,name] of selected){
  const src=statement(n,new RegExp('^CREATE OR REPLACE FUNCTION (?:public\\.)?'+name+'\\s*\\('));
  assert.ok(!/SET search_path TO/i.test(src),'FAMILY195_SEARCH_PATH_FORM:'+name);
  const d=derive('function:'+name,src,[[/^CREATE OR REPLACE FUNCTION (?:public\.)?/.exec(src)[0],'CREATE FUNCTION public.']]);
  definitions.push(d);pins.push(familyFunctionPin(d,{runtime:RUNTIME_FACADES.has(name)}));
 }
 assert.ok(!definitions.some(d=>/school_certificate_native_family_v5\s*\(/.test(d.split('AS $')[0])),'FAMILY195_NATIVE_FAMILY_V5_NOT_EMITTED');
 assert.equal(new Set(pins.map(p=>p.signature)).size,pins.length);assert.equal(pins.filter(p=>p.runtime).length,2);
 for(const p of pins)assert.equal(p.runtime,RUNTIME_FACADES.has(p.name));
 // 6. prerequisites (existing, exact, from SOURCE; never from pg_proc).
 const {pins:prerequisites,definitions:prerequisiteDefinitions}=prerequisitePins(parts,texts);
 assertSourceAcl(parts,pins);assertMetadataAgainst102(parts,[...pins,...prerequisites]);
 // 7. triggers rendered from the 057/064 format() templates and 091/102 statements.
 const triggers=renderTriggers(parts);
 // 8. ACL: tables and functions revoked; EXECUTE only to the two runtime facades.
 const acl=[
  'REVOKE ALL ON '+TABLE_NAMES.map(t=>'public.'+t).join(',')+' FROM PUBLIC,'+RUNTIME,
  ...pins.map(p=>'REVOKE ALL ON FUNCTION '+p.signature+' FROM PUBLIC,'+RUNTIME),
  ...pins.filter(p=>p.runtime).map(p=>'GRANT EXECUTE ON FUNCTION '+p.signature+' TO '+RUNTIME),
 ];
 const migration=[...tables,singleton,...alters,...indexes,...rls,...definitions,...triggers,...acl];
 for(const s of migration){
  assert.ok(/^(CREATE TABLE public\.|CREATE (UNIQUE )?INDEX \w+ ON public\.|INSERT INTO public\.school_certificate_storage_policy|ALTER TABLE public\.|CREATE FUNCTION public\.|CREATE TRIGGER \w+ BEFORE |REVOKE ALL ON |GRANT EXECUTE ON FUNCTION public\.)/.test(s),'FAMILY195_STATEMENT_VERB:'+s.slice(0,60));
  // Verbs are whitelisted above (so UPDATE/DELETE/TRUNCATE/BEGIN cannot start a
  // statement); here only silent-skip or destructive clauses are forbidden.
  // Trigger timings ("BEFORE UPDATE OR DELETE", "BEFORE TRUNCATE") and
  // "DROP NOT NULL" are legitimate and stay allowed.
  assert.ok(!/\b(OR REPLACE|IF NOT EXISTS|IF EXISTS|ON CONFLICT|DROP (TABLE|FUNCTION|TRIGGER|INDEX|CONSTRAINT|COLUMN)|SET ROLE)\b/i.test(s.replace(/\$\w*\$[\s\S]*\$\w*\$/,'')),'FAMILY195_FORBIDDEN_TOKEN:'+s.slice(0,60));
 }
 // Every emitted table/singleton/index/ALTER/RLS/function statement is exactly the
 // `result` of one 'edit' derivation entry; triggers and ACL are rendered from
 // TRIGGERS/pins (not source statements) and are documented separately.
 const derivedResults=new Map(derivation.filter(d=>d.kind==='edit').map(d=>[d.result,d]));
 for(const s of [...tables,singleton,...indexes,...alters,...rls,...definitions]){const d=derivedResults.get(s);assert.ok(d&&d.resultSha256===hash(s),'FAMILY195_DERIVATION_MISSING:'+s.slice(0,60));}
 assert.ok(![...tables,...alters].some(s=>/\bREFERENCES\s+(?!public\.)/.test(s)),'FAMILY195_UNQUALIFIED_REFERENCE');
 // Source definitions vs distinct body digests: 057:127 and 091:50 are byte-identical
 // bodies, so one digest key serves both trigger functions. Any other collision is
 // unexpected and stops the build instead of being absorbed.
 const groups=new Map();for(const p of [...pins,...prerequisites]){if(!groups.has(p.sha256))groups.set(p.sha256,[]);groups.get(p.sha256).push(p.name);}
 const sharedBodies=[...groups.values()].filter(g=>g.length>1).map(g=>[...g].sort());
 assert.deepEqual(sharedBodies,[['school_certificate_record_immutable_v3','school_certificate_reject_change_v1']],'FAMILY195_SHARED_BODY_UNEXPECTED');
 const counts=Object.freeze({definitions:definitions.length,prerequisiteDefinitions:prerequisiteDefinitions.length,uniqueBodyDigests:groups.size,sharedBodies});
 assert.equal(counts.uniqueBodyDigests,counts.definitions+counts.prerequisiteDefinitions-1,'FAMILY195_UNIQUE_DIGEST_COUNT');
 const shape=shapeExpectations(tableSource,alters,closure);
 const relations=`(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN(${TABLE_NAMES.map(q).join(',')}))`;
 const ownCondition=`s.nspname='public' AND p.proname IN(${pins.map(p=>q(p.name)).join(',')})`;
 const foreignConstraints=`(SELECT oid FROM pg_constraint WHERE conrelid IN${relations} AND contype='f')`;
 const isolation="DO $isolation$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'FAMILY195_ISOLATION_REQUIRED';END IF;END $isolation$";
 const absenceCheck=`DO $absence$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN${relations})
  OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition})
  OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relkind='i' AND c.relname IN(${Object.keys(NAMED_INDEXES).map(q).join(',')}))
  OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND t.tgname IN(${TRIGGERS.map(t=>q(t[1])).join(',')}))
  OR EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_namespace s ON s.oid=k.connamespace WHERE s.nspname='public' AND k.conname IN(${ADDED_CONSTRAINTS.map(q).join(',')}))
 THEN RAISE EXCEPTION 'FAMILY195_OBJECT_CONFLICT';END IF;END $absence$`;
 const requiredRelations=[...PRIOR_RELATIONS,...RUNTIME_RELATIONS,...(closure==='full'?FULL_RELATIONS:[])];
 const installationGuard=`DO $guard$ BEGIN
 PERFORM pg_advisory_xact_lock(57);PERFORM pg_advisory_xact_lock(64);PERFORM pg_advisory_xact_lock(91);PERFORM pg_advisory_xact_lock(102);
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${q(RUNTIME)} AND NOT rolsuper AND NOT rolbypassrls) OR to_regprocedure('public.digest(bytea,text)') IS NULL THEN RAISE EXCEPTION 'FAMILY195_DESTINATION_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[${requiredRelations.map(q).join(',')}]) r WHERE to_regclass('public.'||r) IS NULL) THEN RAISE EXCEPTION 'FAMILY195_PRIOR_RELATION_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.platform_tenant_source_binding'::regclass AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(i.indkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num)=ARRAY['tenant_id','id'])
  OR NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.tenant_membership'::regclass AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(i.indkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num)=ARRAY['id','tenant_id'])
 THEN RAISE EXCEPTION 'FAMILY195_PRIOR_UNIQUE_KEY_REQUIRED';END IF;
 END $guard$`;
 const prerequisiteCheck=familyPinsCheck(prerequisites,'FAMILY195_PREREQUISITE_CHANGED',{acl:false}),ownCheck=familyPinsCheck(pins,'FAMILY195_NEW_FUNCTION_METADATA');
 const objectsCheck=objectsCheckSql(shape,ownCondition,pins.length);
 const snapshot=slot=>{
  let sql=preservationSnapshot(slot);const exclusion="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
  assert.equal(sql.split(exclusion).length-1,2);sql=sql.replaceAll(exclusion,'p.oid NOT IN'+relations);
  sql=once(sql,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'NOT('+ownCondition+')').replaceAll('municontrol_sql111.',prefix);
  assert.ok(!sql.includes('native_leave_'));return sql;
 };
 const before=snapshot('before'),after=snapshot('after');
 const priorAudit=`DO $prior$ DECLARE old jsonb:=current_setting('${prefix}before')::jsonb;new jsonb:=current_setting('${prefix}after')::jsonb;x jsonb;y jsonb;BEGIN
 IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'FAMILY195_PRIOR_STATE_CHANGED';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(old->'triggers') LOOP SELECT value INTO y FROM jsonb_array_elements(new->'triggers') WHERE value->'oid'=x->'oid';IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'FAMILY195_PRIOR_TRIGGER_CHANGED';END IF;END LOOP;
 FOR y IN SELECT n.value FROM jsonb_array_elements(new->'triggers') n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old->'triggers') o WHERE o.value->'oid'=n.value->'oid') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=(y->>'oid')::oid AND t.tgisinternal AND t.tgenabled='O' AND t.tgconstraint IN${foreignConstraints}) THEN RAISE EXCEPTION 'FAMILY195_UNEXPECTED_TRIGGER';END IF;END LOOP;END $prior$`;
 const preservedAfter=`jsonb_set(current_setting('${prefix}after')::jsonb,'{triggers}',coalesce((SELECT jsonb_agg(x.value ORDER BY (x.value->>'oid')::oid) FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'triggers') x WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=(x.value->>'oid')::oid AND t.tgisinternal AND t.tgconstraint IN${foreignConstraints})),'null'::jsonb))`;
 const objectFingerprint=`(SELECT encode(public.digest(jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_object('class',jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident),'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid=c.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'indexes',(SELECT jsonb_agg(jsonb_build_object('index',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN${relations}),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid IN${relations} OR t.tgconstraint IN${foreignConstraints}),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition}),'storagePolicy',(SELECT jsonb_agg(to_jsonb(r)) FROM public.school_certificate_storage_policy r))::text,'sha256'),'hex'))`;
 const prerequisiteFingerprint=`(SELECT encode(public.digest(coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.proname) FROM pg_proc p WHERE p.oid IN(${prerequisites.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')})),'[]'::jsonb)::text,'sha256'),'hex'))`;
 const fixed=Object.freeze({allChecksPassed:true,newTables:8,newFunctions:pins.length,runtimeFacades:2,newNamedIndexes:5,newTriggers:14,alterConstraints:6,storagePolicyRows:1,familyRows:0,nativeFamilyV5Emitted:false,nativeFamilyV5Preserved:true,lifecycleRangePreserved:true,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0});
 const proof=withBefore=>`SELECT jsonb_build_object('version',${q(FAMILY_PREREQUISITES_VERSION)},'closure',${q(closure)},'sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,${Object.entries(fixed).map(([k,v])=>q(k)+','+String(v)).join(',')},'priorTableCount',jsonb_array_length(current_setting('${prefix}after')::jsonb->'tables'),${withBefore?`'beforeFingerprint',encode(public.digest(current_setting('${prefix}before'),'sha256'),'hex'),`:''}'priorFingerprint',encode(public.digest((${preservedAfter})::text,'sha256'),'hex'),'objectFingerprint',${objectFingerprint},'prerequisiteFingerprint',${prerequisiteFingerprint}) AS proof`;
 const afterCheck=[prerequisiteCheck,objectsCheck,ownCheck];
 const lateFailure="DO $late$ BEGIN RAISE EXCEPTION 'FAMILY195_REHEARSAL_LATE_FAILURE';END $late$";
 const installation=[isolation,installationGuard,absenceCheck,prerequisiteCheck,before,...migration,...afterCheck,after,priorAudit,proof(true)];
 return {version:FAMILY_PREREQUISITES_VERSION,sourceCommit,sourceHashes,closure,connects:false,executesSql:false,
  tables,singleton,indexes,alters,rls,definitions,triggers,acl,pins,prerequisitePins:prerequisites,prerequisiteDefinitions,derivation,counts,shape,fixed,
  isolation,installationGuard,absenceCheck,prerequisiteCheck,ownCheck,objectsCheck,before,after,priorAudit,proof:proof(true),durableProof:proof(false),
  installation,rehearsal:installation,rehearsalLateFailure:[...installation,lateFailure],
  durableVerification:['SET TRANSACTION READ ONLY',isolation,...afterCheck,after,proof(false)]};
}

// ---- helpers used above ------------------------------------------------------------
// Signatures compared without schema prefixes anywhere: 102:581 writes
// employee_family_receipt_v2(employee_family_member,boolean) while its header
// (102:222) types the argument as public.employee_family_member.
const bare=sig=>sig.replace(/\s+/g,'').replaceAll('public.','');
function functionSignatures(list){return [...list.matchAll(/\b(?:public\.)?[a-z0-9_]+\([^)]*\)/g)].map(m=>bare(m[0]));}
// Final runtime ACL per function, folded in migration order 057→064→091→102 from the
// real REVOKE/GRANT statements (program-qa ownerProgramQaPublishedGrant technique).
function assertSourceAcl(parts,pins){
 const state=new Map();
 for(const n of ['057','064','091','102'])for(const s of parts[file(FILE_OF[n])]){
  const m=/^(REVOKE ALL|GRANT EXECUTE) ON FUNCTION ([\s\S]+?) (FROM|TO) ([\w,]+)$/.exec(s);if(!m)continue;
  const grant=m[1]==='GRANT EXECUTE';if(grant)assert.equal(m[4],RUNTIME);else assert.ok(m[4].split(',').includes('PUBLIC'));
  for(const sig of functionSignatures(m[2]))state.set(sig,grant);
 }
 for(const p of pins){const sig=bare(p.signature);assert.ok(state.has(sig),'FAMILY195_ACL_SOURCE_MISSING:'+sig);assert.equal(state.get(sig),p.runtime,'FAMILY195_RUNTIME_FACADE_SET:'+sig);}
}
// 102:126-153 declares arg names/types/modes/defaults/return/volatility for 16 of the
// closure functions and for native_family_v5. Two independent source readings must agree.
function assertMetadataAgainst102(parts,pins){
 const block=parts[file(FILE_OF['102'])].find(s=>/^DO \$prerequisite\$/.test(s));assert.ok(block);
 const rows=[...block.matchAll(/\('(\w+\([^)]*\))',ARRAY\[([^\]]*)\]::text\[\],ARRAY\[([^\]]*)\]::text\[\],ARRAY\[([^\]]*)\]::text\[\],(NULL::text|'[^']*'),'(\w+)','([vsi])',(true|false),(true|false)\)/g)];
 assert.equal(rows.length,27,'FAMILY195_102_METADATA_ROWS');const list=v=>v?v.split(',').map(x=>x.trim().replace(/^'|'$/g,'')):[];
 let matched=0;
 for(const r of rows){const pin=pins.find(p=>bare(p.signature)===bare(r[1]));if(!pin)continue;matched++;
  assert.deepEqual([pin.argNames,pin.allArgTypes.map(t=>t.replace(/^public\./,'')),pin.argModes,pin.defaults,pin.resultType,pin.volatility,pin.returnsSet],[list(r[2]),list(r[3]).map(t=>t.replace(/^public\./,'')),list(r[4]),r[5]==='NULL::text'?'':r[5].slice(1,-1),r[6],r[7],r[8]==='true'],'FAMILY195_102_METADATA:'+pin.name);}
 // closure 'full': 16 emitted functions + 2 prerequisite pins declared by 102
 // (native_family_v5 102:133 and payroll_fixed_registry_subject_by_contract_v1 102:153) = 18;
 // closure 'native' drops current_family_v1/v2 (102:137,143) = 16.
 assert.ok([18,16].includes(matched),'FAMILY195_102_METADATA_COVERAGE:'+matched);
}
function renderTriggers(parts){
 const rendered=[];
 for(const [n,list] of [['057',['school_certificate_blob','school_certificate','school_certificate_event']],['064',['employee_family_member','employee_family_member_event']]]){
  const block=parts[file(FILE_OF[n])].find(s=>/^DO \$\$ DECLARE item text; BEGIN/.test(s)&&s.includes("_immutable"));assert.ok(block,'FAMILY195_TRIGGER_DO:'+n);
  assert.ok(block.includes("ARRAY["+list.map(q).join(',')+"]"),'FAMILY195_TRIGGER_TABLES:'+n);
  const row=/format\('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION school_certificate_reject_change_v1\(\)',item\|\|'_immutable',item\)/.test(block),stmt=/format\('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_reject_change_v1\(\)',item\|\|'_no_truncate',item\)/.test(block);
  assert.ok(row&&stmt,'FAMILY195_TRIGGER_TEMPLATE:'+n);
 }
 for(const [table,name,,timing,level,fn] of TRIGGERS)rendered.push(`CREATE TRIGGER ${name} ${timing} ON public.${table} FOR EACH ${level} EXECUTE FUNCTION public.${fn}()`);
 // 091:52,54 and 102:575,577 exist as plain statements: assert the rendered text matches them modulo qualification.
 for(const [n,re] of [['091',/^CREATE TRIGGER school_certificate_record_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON school_certificate_record FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_record_immutable_v3\(\)$/],['091',/^CREATE TRIGGER school_certificate_record_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON school_certificate_record_event FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_record_immutable_v3\(\)$/],['102',/^CREATE TRIGGER employee_family_member_native_link_v2 BEFORE INSERT ON public\.employee_family_member FOR EACH ROW EXECUTE FUNCTION public\.employee_family_native_link_v2\(\)$/],['102',/^CREATE TRIGGER school_certificate_record_native_link_v2 BEFORE INSERT ON public\.school_certificate_record FOR EACH ROW EXECUTE FUNCTION public\.employee_family_native_link_v2\(\)$/]])assert.equal(parts[file(FILE_OF[n])].filter(s=>re.test(s)).length,1,'FAMILY195_TRIGGER_SOURCE:'+re);
 // 102:96-101 and 102:110-111 declare tgname/function/tgtype: cross-check every rendered row.
 const block=parts[file(FILE_OF['102'])].find(s=>/^DO \$prerequisite\$/.test(s));
 for(const [table,name,tgtype,,,fn] of TRIGGERS){
  const declared=block.includes(`('${table}','${name}','${fn}()',${tgtype})`)||(tgtype===7&&block.includes("t.tgname=x||'_native_link_v2'")&&block.includes("'public.employee_family_native_link_v2()'::regprocedure AND t.tgtype=7"));
  const sourceTable=['school_certificate_blob','school_certificate','school_certificate_event'].includes(table)&&tgtype!==7; // 057 tables are not declared by 102; their shape comes from the 057 templates asserted above
  assert.ok(declared||sourceTable,'FAMILY195_TRIGGER_DECLARATION:'+name);
 }
 assert.equal(rendered.length,14);return rendered;
}
function commaParts(source){const result=[];let start=0,depth=0,quoted=false;for(let at=0;at<source.length;at++){const c=source[at];if(quoted){if(c==="'"&&source[at+1]==="'")at++;else if(c==="'")quoted=false;continue;}if(c==="'")quoted=true;else if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){result.push(source.slice(start,at));start=at+1;}}result.push(source.slice(start));return result;}
// Expected physical shape derived from the DDL text itself, then compared with the
// reviewed tallies (EXPECTED_SHAPE). Both must agree or the build fails.
function shapeExpectations(tableSource,alters,closure){
 const result={};
 for(const name of TABLE_NAMES){
  const ddl=tableSource[name],inner=ddl.slice(ddl.indexOf('(')+1,ddl.lastIndexOf(')')),masked=inner.replace(/'(?:[^']|'')*'/g,"''");
  const columns=[];for(const part of commaParts(masked)){const col=/^\s*(\w+)\s+/.exec(part)?.[1];if(col&&!['CONSTRAINT','PRIMARY','FOREIGN','CHECK','UNIQUE','EXCLUDE'].includes(col.toUpperCase()))columns.push(col);}
  const added=alters.filter(a=>a.startsWith('ALTER TABLE public.'+name+' ADD COLUMN ')).map(a=>/ADD COLUMN (\w+)/.exec(a)[1]);
  const addedChecks=alters.filter(a=>a.startsWith('ALTER TABLE public.'+name+' ADD CONSTRAINT ')&&/\bCHECK\s*\(/.test(a)).length,addedFks=alters.filter(a=>a.startsWith('ALTER TABLE public.'+name+' ADD CONSTRAINT ')&&/\bFOREIGN KEY\b/.test(a)).length;
  const named=Object.entries(NAMED_INDEXES).filter(([,[t]])=>t===name);
  const shape={name,columns:[...columns,...added],checks:(masked.match(/\bCHECK\s*\(/g)||[]).length+addedChecks,foreign:(masked.match(/\bREFERENCES\b/g)||[]).length+addedFks,
   indexCount:(masked.match(/\bPRIMARY KEY\b/g)||[]).length+(masked.match(/\bUNIQUE\s*\(/g)||[]).length+named.length,namedIndexes:named.map(([i,[,unique,partial]])=>[i,unique,partial]),
   triggers:TRIGGERS.filter(t=>t[0]===name).map(([,tgname,tgtype,,,fn])=>[tgname,tgtype,'public.'+fn+'()']),rls:['school_certificate_record','school_certificate_record_event','employee_family_member','employee_family_member_event'].includes(name),rows:name==='school_certificate_storage_policy'?1:0};
  const expected=EXPECTED_SHAPE[name];
  assert.deepEqual({columns:shape.columns.length,checks:shape.checks,foreign:shape.foreign,indexes:shape.indexCount,triggers:shape.triggers.length,rls:shape.rls,rows:shape.rows},expected,'FAMILY195_SHAPE_TALLY:'+name);
  result[name]=shape;
 }
 return result;
}
function objectsCheckSql(shape,ownCondition,functionCount){
 return `DO $objects$ DECLARE item jsonb;r oid;n bigint;x text;c record; BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(Object.values(shape)))}::jsonb) LOOP r:=to_regclass('public.'||(item->>'name'));
  IF r IS NULL OR (SELECT count(*) FROM pg_class k WHERE k.oid=r AND k.relowner=current_user::regrole AND k.relrowsecurity=(item->>'rls')::boolean AND NOT k.relforcerowsecurity AND k.relkind='r' AND k.relpersistence='p')<>1
   OR EXISTS(SELECT 1 FROM pg_class k CROSS JOIN LATERAL aclexplode(coalesce(k.relacl,acldefault('r',k.relowner))) a WHERE k.oid=r AND a.grantee<>k.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=r AND a.attnum>0 AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL)) OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r)
   OR (SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=r AND a.attnum>0) IS DISTINCT FROM item->'columns'
  THEN RAISE EXCEPTION 'FAMILY195_TABLE_SHAPE_SECURITY' USING DETAIL=item->>'name';END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='c')<>(item->>'checks')::int OR (SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='f')<>(item->>'foreign')::int
   OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=r AND(contype NOT IN('p','u','f','c','n') OR NOT convalidated OR condeferrable OR condeferred OR contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')))
   OR (SELECT count(*) FROM pg_index WHERE indrelid=r)<>(item->>'indexCount')::int
   OR EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=r AND(NOT i.indisvalid OR NOT i.indisready OR NOT i.indimmediate OR i.indexprs IS NOT NULL OR i.indnatts<>i.indnkeyatts))
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=r AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid AND k.contype IN('p','u'))
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'namedIndexes') e WHERE e->>0=ic.relname AND (e->>1)::boolean=i.indisunique AND (e->>2)::boolean=(i.indpred IS NOT NULL)))
   OR (SELECT count(*) FROM jsonb_array_elements(item->'namedIndexes') e WHERE EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=r AND ic.relname=e->>0))<>jsonb_array_length(item->'namedIndexes')
  THEN RAISE EXCEPTION 'FAMILY195_TABLE_CONSTRAINTS' USING DETAIL=item->>'name';END IF;
  IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=r AND NOT t.tgisinternal)<>jsonb_array_length(item->'triggers')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'triggers') e WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=r AND t.tgname=e->>0 AND t.tgtype=(e->>1)::int AND t.tgfoid=to_regprocedure(e->>2) AND t.tgenabled='O' AND NOT t.tgisinternal AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND t.tgqual IS NULL))
  THEN RAISE EXCEPTION 'FAMILY195_TRIGGERS' USING DETAIL=item->>'name';END IF;
  EXECUTE format('SELECT count(*) FROM %s',r::regclass) INTO n;IF n<>(item->>'rows')::int THEN RAISE EXCEPTION 'FAMILY195_ROWS' USING DETAIL=item->>'name';END IF;
 END LOOP;
 -- 102:70-93 with installed>0: nullable provenance columns and the two native FKs.
 FOR c IN SELECT * FROM (VALUES ('employee_family_member','source_batch_id','uuid'),('school_certificate_record','source_batch_id','uuid'),('school_certificate_record','source_database','text'),('school_certificate_record','source_cutoff','timestamp with time zone')) v(tab,col,typ) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||c.tab) AND a.attname=c.col AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=c.typ AND NOT a.attnotnull AND NOT EXISTS(SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum)) THEN RAISE EXCEPTION 'FAMILY195_NATIVE_SHAPE' USING DETAIL=c.tab||'.'||c.col;END IF;
 END LOOP;
 FOREACH x IN ARRAY ARRAY['employee_family_member','school_certificate_record'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||x) AND a.attname='native_registration_id' AND NOT a.attisdropped AND a.atttypid='uuid'::regtype AND NOT a.attnotnull AND NOT EXISTS(SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum))
   OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=to_regclass('public.'||x) AND k.conname=CASE x WHEN 'employee_family_member' THEN 'employee_family_native_registration_fk' ELSE 'school_certificate_native_registration_fk' END
    AND k.contype='f' AND k.convalidated AND NOT k.condeferrable AND k.confupdtype='a' AND k.confdeltype='a' AND k.confmatchtype='s' AND k.confrelid='public.native_employee_registration'::regclass
    AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='native_registration_id')]::smallint[] AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname='id')]::smallint[])
  THEN RAISE EXCEPTION 'FAMILY195_NATIVE_SHAPE' USING DETAIL=x;END IF;
 END LOOP;
 -- 102:115-122 constraint definitions, verbatim.
 FOR c IN SELECT * FROM (VALUES
  ('employee_family_member','employee_family_native_pair_ck','CHECK ((((native_registration_id IS NULL) AND (source_batch_id IS NOT NULL)) OR ((native_registration_id IS NOT NULL) AND (source_batch_id IS NULL))))'),
  ('school_certificate_record','school_certificate_native_pair_ck','CHECK ((((native_registration_id IS NULL) AND (source_batch_id IS NOT NULL) AND (source_database IS NOT NULL) AND (source_cutoff IS NOT NULL)) OR ((native_registration_id IS NOT NULL) AND (source_batch_id IS NULL) AND (source_database IS NULL) AND (source_cutoff IS NULL) AND (family_kind = ''own''::text))))')
 ) v(tab,name,definition) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=to_regclass('public.'||c.tab) AND k.conname=c.name AND k.contype='c' AND k.convalidated AND pg_get_constraintdef(k.oid)=c.definition) THEN RAISE EXCEPTION 'FAMILY195_NATIVE_CONSTRAINT' USING DETAIL=c.name;END IF;
 END LOOP;
 -- 057:56-63 singleton with declared defaults and generation 0.
 IF (SELECT jsonb_agg(to_jsonb(p)) FROM public.school_certificate_storage_policy p) IS DISTINCT FROM '[{"singleton":true,"pdf_quota_bytes":8388608,"cluster_limit_bytes":536870912,"cluster_reserve_bytes":16777216,"generation":0}]'::jsonb THEN RAISE EXCEPTION 'FAMILY195_STORAGE_POLICY';END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition})<>${functionCount} OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_family_%') THEN RAISE EXCEPTION 'FAMILY195_FUNCTION_COUNT';END IF;
 END $objects$`;
}
// Existing functions the closure calls or must not alter. Every digest comes from a
// source definition: 110 (native_family_v5 + lifecycle_range_v1), 093, 099, 007 and the
// 113 textual patch of 007 (same derivation as own-payroll-installation installedFixedExportHash).
function prerequisitePins(parts,texts){
 const get=(path,name)=>{const found=parts[path].filter(s=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\s*\\(').test(s));assert.equal(found.length,1,'FAMILY195_PREREQUISITE_SOURCE:'+name);return found[0];};
 const v5=get(file('110-native-employment-lifecycle.sql'),'school_certificate_native_family_v5'),v5pin=familyFunctionPin(v5,{runtime:false});
 assert.equal(v5pin.sha256,NATIVE_FAMILY_V5_LIFECYCLE_BODY_SHA,'FAMILY195_NATIVE_FAMILY_V5_BODY');
 const superseded=familyFunctionPin(get(file('102-native-family-schooling.sql'),'school_certificate_native_family_v5'),{runtime:false});
 assert.equal(superseded.sha256,NATIVE_FAMILY_V5_SUPERSEDED_BODY_SHA);assert.notEqual(superseded.sha256,v5pin.sha256);
 assert.ok(texts[file('110-native-employment-lifecycle.sql')].includes(NATIVE_FAMILY_V5_SUPERSEDED_BODY_SHA),'110:226 must still demand the 102 body as predecessor');
 const range=get(file('110-native-employment-lifecycle.sql'),'native_employment_lifecycle_range_v1');
 const subject=get(file('093-native-fixed-novelties.sql'),'payroll_fixed_registry_subject_by_contract_v1'),lock=get(file('099-grh-curated-consumers.sql'),'grh_curated_source_read_lock_v1');
 const capability=get(file('007-action-center-read-facades.sql'),'action_center_context_has_capability');
 // 007:5 patched by 113:50-61 (single anchor occurrence, before-digest verified).
 const session=get(file('007-action-center-read-facades.sql'),'action_center_assert_tenant_read_session_v2');
 const patch=/\('public\.action_center_assert_tenant_read_session_v2\(text,uuid,integer,text,uuid,uuid\)','([a-f0-9]{64})',\n \$old\$([\s\S]*?)\$old\$,\n \$new\$([\s\S]*?)\$new\$\)/.exec(texts[file('113-native-employee-self-access.sql')]);assert.ok(patch,'FAMILY195_113_PATCH');
 const sessionPin=familyFunctionPin(session,{runtime:false});assert.equal(sessionPin.sha256,patch[1],'FAMILY195_113_BEFORE_BODY');
 const patched=once(session,patch[2],patch[3],'FAMILY195_113_ANCHOR');
 // Pins carry no definition text: they are embedded into SQL DO blocks. The
 // definitions travel separately for hash relocation (familyRelocationHashes).
 const definitions=[v5,range,subject,lock,capability,patched];
 const pins=[v5pin,...definitions.slice(1).map(d=>familyFunctionPin(d,{runtime:false}))];
 assert.equal(new Set(pins.map(p=>p.signature)).size,6);return {pins,definitions};
}

// ---- relocation for the SAME QA190 schema -----------------------------------------
// Returns a NEW map of public body digest → relocated body digest for every definition
// the batch emits or pins. The foundation maps are read, never mutated; an existing
// entry must agree with the fresh derivation.
export function familyRelocationHashes(batch,foundation){
 assert.equal(typeof foundation?.normalized,'function');assert.ok(foundation.hashes&&typeof foundation.hashes==='object');
 const frozen=JSON.stringify(foundation.hashes),extra={};
 for(const d of [...batch.definitions,...batch.prerequisiteDefinitions]){
  const from=hash(body(d)),to=hash(body(foundation.normalized(d)));
  if(Object.hasOwn(foundation.hashes,from)){assert.equal(foundation.hashes[from],to,'FAMILY195_FOUNDATION_HASH_DISAGREES:'+from);continue;}
  if(Object.hasOwn(extra,from)){assert.equal(extra[from],to,'FAMILY195_SHARED_BODY_DISAGREES:'+from);continue;}
  extra[from]=to;
 }
 assert.equal(JSON.stringify(foundation.hashes),frozen,'FAMILY195_FOUNDATION_MUTATED');
 // Keys are distinct body digests, not definitions: with an empty foundation the map
 // has batch.counts.uniqueBodyDigests entries (26 in closure 'full', 22 in 'native').
 const keys=new Set([...batch.definitions,...batch.prerequisiteDefinitions].map(d=>hash(body(d))));
 assert.equal(keys.size,batch.counts.uniqueBodyDigests,'FAMILY195_UNIQUE_DIGEST_COUNT');
 assert.equal(Object.keys(extra).length,[...keys].filter(k=>!Object.hasOwn(foundation.hashes,k)).length,'FAMILY195_HASH_KEY_COUNT');
 for(const p of [...batch.pins,...batch.prerequisitePins]){const mapped=Object.hasOwn(extra,p.sha256)?extra[p.sha256]:foundation.hashes[p.sha256];assert.ok(mapped,'FAMILY195_PIN_UNMAPPED:'+p.signature);}
 return Object.freeze(extra);
}
export function familyNormalizer(foundation,extra){return sql=>{let v=foundation.normalized(sql);for(const [a,b] of Object.entries(extra))v=v.replaceAll(a,b);return v;};}

export function assertNativeFamilyPrerequisitesDurability({installed,durable,batch}){
 for(const p of [installed,durable]){
  assert.equal(p.version,FAMILY_PREREQUISITES_VERSION);assert.equal(p.closure,batch.closure);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const [k,v] of Object.entries(batch.fixed))assert.equal(p[k],v,k);assert.ok(Number.isSafeInteger(p.priorTableCount)&&p.priorTableCount>0);
  for(const k of ['priorFingerprint','objectFingerprint','prerequisiteFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);
 }
 assert.match(installed.beforeFingerprint,/^[a-f0-9]{64}$/);assert.equal(installed.beforeFingerprint,installed.priorFingerprint,'FAMILY195_PRIOR_DATA_CHANGED');
 const {beforeFingerprint,...rest}=installed;assert.deepEqual(rest,durable,'FAMILY195_NOT_DURABLE');
 return {passed:true,closure:batch.closure,priorStatePreserved:true,newObjectsPreserved:true,nativeFamilyV5Preserved:true,lifecycleRangePreserved:true,businessOperations:0,nominalRowsReturned:0};
}
