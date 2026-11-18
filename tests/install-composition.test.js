import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {COMPOSITION_ORDER,compositionPaths,deriveSource} from '../scripts/lib/install-composition-source.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const evidence=JSON.parse(read('scripts/candidates/install-composition-attestation-v1.json'));
const example=name=>{
 const paths=compositionPaths(name),source=read(paths.source),manifestText=read(paths.manifest);
 return {source,...deriveSource({name,source,manifest:JSON.parse(manifestText),manifestText,attestation:evidence.sources[name]})};
};

test('exact source bytes remain untouched aside from barrier, preimage prefix and final rollback',()=>{
 for(const name of COMPOSITION_ORDER){
  const {source,sql,manifest}=example(name);
  const barrier=source.match(/^DO \$(source_only|not_an_installer)\$ BEGIN[\s\S]*?END \$\1\$;\n/m);
  assert.ok(barrier,name);assert.ok(!sql.includes(barrier[0]),name);
  assert.ok(!sql.includes('$source_only$')&&!sql.includes('$not_an_installer$'),name);
  const rest=source.slice(barrier.index+barrier[0].length,-'ROLLBACK;\n'.length);
  assert.ok(sql.includes(rest),name+' exact body');
  assert.match(sql,/^DO \$composition_preimage\$/m);
  assert.ok(sql.endsWith('ROLLBACK;\n'));assert.doesNotMatch(sql,/^COMMIT;$/m);
  assert.equal(manifest.preserved.originalStatementsBytePreserved,true);
  assert.equal(manifest.installable,false,'missing installed metadata must block COMMIT');
 }
});
test('all three existing PR295 replacements have pinned prosrc and mandatory owner/ACL checks',()=>{
 const {sql,manifest}=example('employment-job-title-writers');
 const replace=(sql.match(/CREATE OR REPLACE FUNCTION public\./g)??[]).length;
 const pins=manifest.preimages.functions.filter(x=>x.kind==='redefined');
 assert.equal(replace,3);assert.equal(pins.length,3);
 assert.ok(pins.every(x=>/^[a-f0-9]{64}$/.test(x.prosrcSha256)&&x.owner===null&&x.acl===null));
 for(const p of pins)assert.ok(sql.includes(p.signature));
 assert.match(sql,/actual\.owner_name IS DISTINCT FROM/);
 assert.match(sql,/actual\.acl_text IS DISTINCT FROM/);
});
test('history guards pin original function bodies and enabled triggers, and fail closed where ACL or tgenabled absent',()=>{
 const {manifest,sql}=example('attendance-area-history');
 assert.equal(manifest.preimages.functions.filter(x=>x.kind==='guard').length,6);
 assert.equal(manifest.preimages.triggers.length,7);
 assert.ok(manifest.preimages.triggers.every(x=>x.enabled===null));
 assert.match(sql,/COMPOSITION_TRIGGER_PREIMAGE_NOT_ATTESTED/);
 assert.match(sql,/COMPOSITION_PREIMAGE_NOT_ATTESTED/);
});
test('expected devices must precede history; all installed source files preserve their REVOKE statements, never add GRANT',()=>{
 assert.deepEqual(COMPOSITION_ORDER.slice(0,4),['attendance-area-authority','attendance-expected-devices','attendance-area-history','attendance-area-workdays']);
 for(const name of COMPOSITION_ORDER){
  const {source,sql}=example(name);
  const count=s=>(s.match(/\bGRANT\s+(?:(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE)\s+)?ON\b/gi)??[]).length;
  assert.equal(count(sql),count(source),name);
  const revoked=source.match(/REVOKE ALL ON[\s\S]*?FROM PUBLIC,municontrol_actions_runtime_app;/g)??[];
  for(const statement of revoked)assert.ok(sql.includes(statement),name);
 }
});
test('--check rejects changed bytes and generation itself has no SQL, network or subprocess client',()=>{
 const source=read('scripts/build-install-composition.mjs');
 assert.doesNotMatch(source,/execFile|spawn|fetch\(|http\.|https\.|pg\.|postgres|neon/);
 assert.match(source,/assert\.equal\(raw\(paths\.output\),result\.sql/);
 assert.match(source,/assert\.equal\(raw\(paths\.outputManifest\),generatedManifest/);
 assert.throws(()=>deriveSource({...exampleInputs('attendance-area-history'),source:'tampered'}),/SOURCE_SHA_CHANGED/);
 function exampleInputs(name){const paths=compositionPaths(name),manifestText=read(paths.manifest);return{name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText,attestation:evidence.sources[name]};}
});

// Revisión de Claude sobre 2da8da9e/c3d8d669 (PR 270): defectos que dejaban guardas sin verificar.
test('Claude: los disparadores cuyas funciones tienen dígitos (…_v1) también quedan fijados; antes se perdían 5 de 7',()=>{
 const {manifest}=example('attendance-area-history');
 const functions=manifest.preimages.triggers.map(t=>t.function);
 assert.ok(functions.includes('public.native_employee_contract_guard_v1()'));
 assert.ok(functions.includes('public.native_employment_lifecycle_immutable_v1()'));
 assert.equal(new Set(manifest.preimages.triggers.map(t=>t.relation+':'+t.name)).size,7);
});
test('Claude: las funciones existentes que una fuente invoca son dependencias aunque su manifiesto no las liste',()=>{
 const {manifest}=example('attendance-area-authority');
 const deps=manifest.preimages.functions.filter(p=>p.kind==='dependency').map(p=>p.function).sort();
 assert.deepEqual(deps,['attendance_gateway_assert_session_v1','digest','grh_curated_source_read_lock_v1','native_employee_catalog_v1',
  'tenant_iam_assert_no_sod_conflict','tenant_iam_effective_capabilities','tenant_iam_reject_change','time_catalog_native_actor_v2']);
 // Tablas (REFERENCES, INSERT INTO) y lo que la fuente crea no son dependencias de función.
 assert.ok(!deps.includes('tenant_membership')&&!deps.includes('attendance_area_scope_event'));
 // Marcada como revisada pero sin atestar esas dependencias, sigue sin poder instalarse.
 const paths=compositionPaths('attendance-area-authority'),manifestText=read(paths.manifest),source=read(paths.source);
 const reviewedEmpty=deriveSource({name:'attendance-area-authority',source,manifest:JSON.parse(manifestText),manifestText,attestation:{functions:{},triggers:{},reviewed:true}});
 assert.equal(reviewedEmpty.manifest.installable,false);
 assert.match(reviewedEmpty.sql,/coalesce\(p->>'signature',p->>'function'\)/);
});
test('Claude: una atestación completa habilita la composición; un cuerpo fijado no se puede reemplazar; una dependencia toma firma y cuerpo atestados',()=>{
 const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
 const history=inputs('attendance-area-history'),base=deriveSource({...history,attestation:{}}).manifest.preimages;
 const functions=Object.fromEntries(base.functions.map(p=>[p.signature,{owner:'qa_owner',acl:'<NULL>'}]));
 const triggers=Object.fromEntries(base.triggers.map(t=>[t.relation+':'+t.name,{enabled:'O'}]));
 assert.equal(deriveSource({...history,attestation:{functions,triggers,reviewed:true}}).manifest.installable,true);
 const [first]=base.functions;
 assert.throws(()=>deriveSource({...history,attestation:{functions:{...functions,[first.signature]:{owner:'qa_owner',acl:'<NULL>',prosrcSha256:'0'.repeat(64)}},triggers,reviewed:true}}),/ATTESTATION_BODY_MISMATCH/);
 assert.throws(()=>deriveSource({...history,attestation:{functions,triggers:{...triggers,'public.x:y':{enabled:'O'}},reviewed:true}}),/UNKNOWN_TRIGGER_ATTESTATION/);
 const authority=inputs('attendance-area-authority'),deps=deriveSource({...authority,attestation:{}}).manifest.preimages.functions;
 const attested=Object.fromEntries(deps.map((p,i)=>['public.'+p.function+'(jsonb)',{owner:'qa_owner',acl:'<NULL>',prosrcSha256:String(i%10).repeat(64)}]));
 const done=deriveSource({...authority,attestation:{functions:attested,triggers:{},reviewed:true}}).manifest;
 assert.equal(done.installable,true);
 assert.ok(done.preimages.functions.every(p=>p.signature==='public.'+p.function+'(jsonb)'&&/^[0-9a-f]{64}$/.test(p.prosrcSha256)));
});
