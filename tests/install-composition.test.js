import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {COMPOSITION_ORDER,compositionPaths,deriveSource} from '../scripts/lib/install-composition-source.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const evidence=JSON.parse(read('scripts/candidates/install-composition-attestation-v1.json'));
const meta=(over={})=>({owner:'qa_owner',acl:'<NULL>',secdef:true,config:['search_path=pg_catalog, public, pg_temp'],lang:'plpgsql',bin:'',volatile:'v',strict:false,parallel:'u',leakproof:false,...over});
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
  assert.equal(sql.split('$composition_preimage$').length,3,name+' exact dollar-quote tags');
  assert.ok(sql.endsWith('ROLLBACK;\n'));assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),/\bCOMMIT\b/i);
  assert.equal(manifest.preserved.originalStatementsBytePreserved,true);
  assert.equal(manifest.installable,false,'missing installed metadata must block COMMIT');
 }
});
test('all three existing PR295 replacements have pinned prosrc and mandatory owner/ACL/metadata checks',()=>{
 const {sql,manifest}=example('employment-job-title-writers');
 const replace=(sql.match(/CREATE OR REPLACE FUNCTION public\./g)??[]).length;
 const pins=manifest.preimages.functions.filter(x=>x.kind==='redefined');
 assert.equal(replace,3);assert.equal(pins.length,3);
 assert.ok(pins.every(x=>/^[a-f0-9]{64}$/.test(x.prosrcSha256)&&x.owner===null&&x.acl===null));
 for(const p of pins)assert.ok(sql.includes(p.signature));
 assert.match(sql,/actual\.owner_name IS DISTINCT FROM/);
 assert.match(sql,/actual\.acl_text IS DISTINCT FROM/);
 assert.match(sql,/actual\.secdef IS DISTINCT FROM/);
 assert.match(sql,/actual\.config IS DISTINCT FROM/);
 assert.match(sql,/actual\.lang IS DISTINCT FROM/);
 assert.match(sql,/actual\.bin IS DISTINCT FROM/);
});
test('history guards pin original function bodies and enabled triggers, and fail closed where ACL or tgenabled absent',()=>{
 const {manifest,sql}=example('attendance-area-history');
 assert.equal(manifest.preimages.functions.filter(x=>x.kind==='guard').length,6);
 assert.equal(manifest.preimages.triggers.length,7);
 assert.ok(manifest.preimages.triggers.every(x=>x.enabled===null));
 assert.match(sql,/COMPOSITION_TRIGGER_PREIMAGE_NOT_ATTESTED/);
 assert.match(sql,/COMPOSITION_PREIMAGE_NOT_ATTESTED/);
 assert.match(sql,/t\.enabled NOT IN \('O','A'\)/);
});
test('topological order puts history before expected devices; all installed source files preserve their REVOKE statements, never add GRANT',()=>{
 assert.deepEqual(COMPOSITION_ORDER.slice(0,4),['attendance-area-authority','attendance-area-history','attendance-expected-devices','attendance-area-workdays']);
 // Ninguna fuente puede depender de una función creada por una fuente posterior en COMPOSITION_ORDER.
 const createdBefore=new Set(),createdBy=new Map();
 for(const name of COMPOSITION_ORDER){
  for(const nf of example(name).manifest.preimages.newFunctions)createdBy.set(nf.name,name);
 }
 for(const name of COMPOSITION_ORDER){
  const {source,sql,manifest}=example(name);
  for(const dep of manifest.preimages.functions){
   if(createdBy.has(dep.function))assert.ok(createdBefore.has(dep.function),`${name} depende de ${dep.function} (${createdBy.get(dep.function)}) antes de instalarla`);
  }
  for(const nf of manifest.preimages.newFunctions)createdBefore.add(nf.name);
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

test('CLI --check passes unchanged sources and rejects byte edits to generated SQL and its manifest',()=>{
 const root=mkdtempSync(join(tmpdir(),'municontrol-composition-test-'));
 const files=[
  'scripts/build-install-composition.mjs','scripts/lib/install-composition-source.mjs',
  'scripts/candidates/install-composition-attestation-v1.json',
  ...COMPOSITION_ORDER.flatMap(n=>Object.values(compositionPaths(n)))
 ];
 try{
  for(const file of files){const dest=join(root,file);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,read(file),'utf8');}
  const run=()=>spawnSync(process.execPath,[join(root,'scripts/build-install-composition.mjs'),'--check'],{cwd:root,encoding:'utf8',timeout:10000});
  const first=run();assert.equal(first.status,0,first.stderr);
  const target=join(root,compositionPaths(COMPOSITION_ORDER[0]).output);
  writeFileSync(target,readFileSync(target,'utf8')+'-- tamper\n','utf8');
  const bad=run();assert.notEqual(bad.status,0);assert.match(bad.stderr,/COMPOSITION_DERIVED_SQL_CHANGED/);
  writeFileSync(target,read(compositionPaths(COMPOSITION_ORDER[0]).output),'utf8');
  const manifest=join(root,compositionPaths(COMPOSITION_ORDER[1]).outputManifest);
  writeFileSync(manifest,readFileSync(manifest,'utf8')+' ','utf8');
  const wrong=run();assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/COMPOSITION_DERIVED_MANIFEST_CHANGED/);
 }finally{rmSync(root,{recursive:true,force:true});}
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
 // Marcada como revisada pero sin atestar esas dependencias, sigue sin poder instalarse y la barrera SQL queda cerrada.
 const paths=compositionPaths('attendance-area-authority'),manifestText=read(paths.manifest),source=read(paths.source);
 const reviewedEmpty=deriveSource({name:'attendance-area-authority',source,manifest:JSON.parse(manifestText),manifestText,attestation:{functions:{},triggers:{},reviewed:true}});
 assert.equal(reviewedEmpty.manifest.installable,false);
 assert.match(reviewedEmpty.sql,/IF FALSE IS DISTINCT FROM TRUE/);
 assert.match(reviewedEmpty.sql,/coalesce\(p->>'signature',p->>'function'\)/);
});
test('Claude: una atestación completa habilita la composición; un cuerpo fijado no se puede reemplazar; una dependencia toma firma y cuerpo atestados',()=>{
 const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
 const history=inputs('attendance-area-history'),base=deriveSource({...history,attestation:{}}).manifest.preimages;
 const functions=Object.fromEntries(base.functions.map(p=>[p.signature,meta()]));
 const triggers=Object.fromEntries(base.triggers.map(t=>[t.relation+':'+t.name,{enabled:'O'}]));
 assert.equal(deriveSource({...history,attestation:{functions,triggers,reviewed:true}}).manifest.installable,true);
 const [first]=base.functions;
 assert.throws(()=>deriveSource({...history,attestation:{functions:{...functions,[first.signature]:meta({prosrcSha256:'0'.repeat(64)})},triggers,reviewed:true}}),/ATTESTATION_BODY_MISMATCH/);
 assert.throws(()=>deriveSource({...history,attestation:{functions,triggers:{...triggers,'public.x:y':{enabled:'O'}},reviewed:true}}),/UNKNOWN_TRIGGER_ATTESTATION/);
 const authority=inputs('attendance-area-authority'),deps=deriveSource({...authority,attestation:{}}).manifest.preimages.functions;
 const attested=Object.fromEntries(deps.map((p,i)=>['public.'+p.function+'(jsonb)',meta({prosrcSha256:String(i%10).repeat(64)})]));
 const done=deriveSource({...authority,attestation:{functions:attested,triggers:{},reviewed:true}}).manifest;
 assert.equal(done.installable,true);
 assert.ok(done.preimages.functions.every(p=>p.signature==='public.'+p.function+'(jsonb)'&&/^[0-9a-f]{64}$/.test(p.prosrcSha256)));
});

// Revisión adversarial de Gemini: inyección dollar-quote, barrera con trigger deshabilitado, llamadas sin calificar, sobrecargas y SHA unificado.
test('Gemini: rechaza inyección por cierre de dollar-quote ($composition_preimage$) en owner, acl, firma o config',()=>{
 const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
 const auth=inputs('attendance-area-authority'),deps=deriveSource({...auth,attestation:{}}).manifest.preimages.functions;
 const valid=Object.fromEntries(deps.map((p,i)=>['public.'+p.function+'(jsonb)',meta({prosrcSha256:String(i%10).repeat(64)})]));
 const sig='public.'+deps[0].function+'(jsonb)';
 for(const bad of [
  {...valid,[sig]:meta({owner:'$composition_preimage$; ROLLBACK; CREATE ROLE pwn; --',prosrcSha256:'a'.repeat(64)})},
  {...valid,[sig]:meta({acl:'$composition_preimage$; COMMIT;',prosrcSha256:'a'.repeat(64)})},
  {...valid,[sig]:meta({config:['$composition_preimage$'],prosrcSha256:'a'.repeat(64)})},
  {...valid,['public.'+deps[0].function+'($composition_preimage$; ROLLBACK;)']:meta({prosrcSha256:'a'.repeat(64)})},
 ]){
  assert.throws(()=>deriveSource({...auth,attestation:{functions:bad,triggers:{},reviewed:false}}),/COMPOSITION_ATTESTATION_INVALID/);
 }
});
test('Gemini: un disparador deshabilitado (D) o atestación incompleta nunca abre la barrera DO en el SQL derivado',()=>{
 const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
 const history=inputs('attendance-area-history'),base=deriveSource({...history,attestation:{}}).manifest.preimages;
 const functions=Object.fromEntries(base.functions.map(p=>[p.signature,meta()]));
 const triggers=Object.fromEntries(base.triggers.map(t=>[t.relation+':'+t.name,{enabled:'D'}]));
 const out=deriveSource({...history,attestation:{functions,triggers,reviewed:true}});
 assert.equal(out.manifest.installable,false);
 assert.match(out.sql,/IF FALSE IS DISTINCT FROM TRUE/);
 assert.doesNotMatch(out.sql,/IF TRUE IS DISTINCT FROM TRUE/);
});
test('Gemini: las llamadas no calificadas (job-title-writers y workdays) quedan fijadas y se pueden atestar ambas sobrecargas de digest',()=>{
 const jtwDeps=example('employment-job-title-writers').manifest.preimages.functions.map(p=>p.function);
 for(const missed of ['native_employee_context_v1','is_valid_cuil','native_employee_receipt_v1','native_employee_next_number_v1'])
  assert.ok(jtwDeps.includes(missed),'falta dependencia no calificada: '+missed);
 const wdDeps=example('attendance-area-workdays').manifest.preimages.functions.map(p=>p.function);
 assert.ok(wdDeps.includes('digest'),'falta digest no calificado en workdays');
 // Ambas sobrecargas de digest (bytea,text) y (text,text) pueden atestarse juntas en employment-job-title-writers.
 const paths=compositionPaths('employment-job-title-writers'),manifestText=read(paths.manifest),source=read(paths.source);
 const base=deriveSource({name:'employment-job-title-writers',source,manifest:JSON.parse(manifestText),manifestText,attestation:{}}).manifest.preimages.functions;
 const fns={};
 for(const p of base){
  if(p.function==='digest'){
   fns['public.digest(bytea,text)']=meta({prosrcSha256:'1'.repeat(64),secdef:false,config:[],lang:'c',bin:'$libdir/pgcrypto'});
   fns['public.digest(text,text)']=meta({prosrcSha256:'2'.repeat(64),secdef:false,config:[],lang:'c',bin:'$libdir/pgcrypto'});
  }else{
   fns[p.signature??('public.'+p.function+'(jsonb)')]=meta({prosrcSha256:p.prosrcSha256??'3'.repeat(64)});
  }
 }
 const done=deriveSource({name:'employment-job-title-writers',source,manifest:JSON.parse(manifestText),manifestText,attestation:{functions:fns,triggers:{},reviewed:true}});
 assert.equal(done.manifest.installable,true);
 assert.ok(done.manifest.preimages.functions.some(p=>p.signature==='public.digest(bytea,text)'));
 assert.ok(done.manifest.preimages.functions.some(p=>p.signature==='public.digest(text,text)'));
});
test('Gemini: el comentario Attestation input SHA-256 del SQL coincide con attestation.sha256 del manifiesto derivado',()=>{
 for(const name of COMPOSITION_ORDER){
  const sql=read(compositionPaths(name).output),dm=JSON.parse(read(compositionPaths(name).outputManifest));
  const match=sql.match(/-- Attestation input SHA-256: ([a-f0-9]{64})\./);
  assert.ok(match,name);
  assert.equal(match[1],dm.attestation.sha256,name);
 }
});

test('ChatGPT (6994996082): la guarda fija volatilidad, STRICT, paralelo y leakproof; sin ellos no es instalable',()=>{
 const paths=compositionPaths('attendance-area-authority'),manifestText=read(paths.manifest),source=read(paths.source);
 const base={name:'attendance-area-authority',source,manifest:JSON.parse(manifestText),manifestText};
 const deps=deriveSource({...base,attestation:{}}).manifest.preimages.functions;
 const full=Object.fromEntries(deps.map((p,i)=>['public.'+p.function+'(jsonb)',meta({prosrcSha256:String(i%10).repeat(64)})]));
 const ok=deriveSource({...base,attestation:{functions:full,triggers:{},reviewed:true}});
 assert.equal(ok.manifest.installable,true);
 for(const field of ['provolatile','proisstrict','proparallel','proleakproof'])assert.ok(ok.sql.includes('x.'+field),field);
 // Alias sin palabras clave de PL/pgSQL: con «AS strict» el registro quedaba sin ese campo en PostgreSQL 16.
 for(const alias of ['volatility','is_strict','parallel_safety','is_leakproof'])assert.match(ok.sql,new RegExp('actual\\.'+alias+' IS DISTINCT FROM'),alias);
 assert.doesNotMatch(ok.sql,/AS strict\b/);
 const missing=Object.fromEntries(Object.entries(full).map(([k,v])=>{const {volatile,...rest}=v;return [k,rest];}));
 assert.equal(deriveSource({...base,attestation:{functions:missing,triggers:{},reviewed:true}}).manifest.installable,false);
 const [first]=Object.keys(full);
 assert.throws(()=>deriveSource({...base,attestation:{functions:{...full,[first]:{...full[first],volatile:'x'}},triggers:{},reviewed:true}}),/ATTESTATION_INVALID/);
});
