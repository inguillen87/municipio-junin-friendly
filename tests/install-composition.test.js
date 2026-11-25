import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {COMPOSITION_ORDER,compositionPaths,deriveSource,COMPOSITION_RUNTIME_GRANTS,COMPOSITION_RUNTIME_ROLE,createdFunctionBodies} from '../scripts/lib/install-composition-source.mjs';
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
test('topological order puts history before expected devices; all installed source files preserve their REVOKE statements and add only the declared facade GRANTs',()=>{
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
  // La composición sólo agrega los GRANT declarados de las fachadas (Codex 6996579811); ninguno más.
  assert.equal(count(sql),count(source)+(COMPOSITION_RUNTIME_GRANTS[name]?.length??0),name);
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
 const attested=Object.fromEntries(deps.map((p,i)=>[p.signature??('public.'+p.function+'(jsonb)'),meta({prosrcSha256:String(i%10).repeat(64)})]));
 const done=deriveSource({...authority,attestation:{functions:attested,triggers:{},reviewed:true}}).manifest;
 assert.equal(done.installable,true);
 assert.ok(done.preimages.functions.every(p=>Object.hasOwn(attested,p.signature)&&/^[0-9a-f]{64}$/.test(p.prosrcSha256)));
});

// Revisión adversarial de Gemini: inyección dollar-quote, barrera con trigger deshabilitado, llamadas sin calificar, sobrecargas y SHA unificado.
test('Gemini: rechaza inyección por cierre de dollar-quote ($composition_preimage$) en owner, acl, firma o config',()=>{
 const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
 const auth=inputs('attendance-area-authority'),deps=deriveSource({...auth,attestation:{}}).manifest.preimages.functions;
 const valid=Object.fromEntries(deps.map((p,i)=>[p.signature??('public.'+p.function+'(jsonb)'),meta({prosrcSha256:String(i%10).repeat(64)})]));
 const sig=deps[0].signature??('public.'+deps[0].function+'(jsonb)');
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
 const full=Object.fromEntries(deps.map((p,i)=>[p.signature??('public.'+p.function+'(jsonb)'),meta({prosrcSha256:String(i%10).repeat(64)})]));
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

// Codex (PR 270, 6996579811): las fuentes revocan EXECUTE incluso en las fachadas que la aplicación llama directamente y
// dejan el GRANT a la composición revisada. Sin él, instaladas, esas rutas fallarían por permiso.
test('Codex (6996579811): la composición concede EXECUTE sólo a las fachadas que llama la aplicación, después de la guarda',()=>{
 const appCalls=file=>[...readFileSync(file,'utf8').matchAll(/SELECT public\.([a-z_0-9]+)\(/g)].map(m=>m[1]);
 const called=new Set([...appCalls('lib/internal-attendance-expected-devices.js'),...appCalls('lib/internal-attendance-area.js')]);
 const granted=Object.values(COMPOSITION_RUNTIME_GRANTS).flat();
 assert.deepEqual([...called].sort(),granted.map(g=>g.split('(')[0].split('.')[1]).sort(),'cada llamada directa de la app tiene su GRANT y ningún GRANT sobra');
 for(const name of COMPOSITION_ORDER){
  const {sql,manifest}=example(name),declared=COMPOSITION_RUNTIME_GRANTS[name]??[];
  assert.deepEqual(manifest.runtimeGrants,[...declared],name);
  const statements=[...sql.matchAll(/^GRANT EXECUTE ON FUNCTION (public\.[a-z_0-9]+\([a-z0-9_,.]*\)) TO ([a-z_]+);$/gm)];
  assert.deepEqual(statements.map(m=>m[1]),[...declared],name);
  for(const m of statements){
   assert.equal(m[2],COMPOSITION_RUNTIME_ROLE);
   assert.ok(m.index>sql.lastIndexOf('$composition_preimage$'),'el GRANT va después de la guarda de preimágenes');
   assert.ok(m.index>sql.lastIndexOf('REVOKE ALL ON FUNCTION'),'el GRANT va después de las revocaciones de la fuente');
   assert.ok(m.index<sql.lastIndexOf('ROLLBACK;'),'dentro de la misma transacción');
  }
  for(const helper of manifest.preimages.newFunctions.filter(f=>!declared.includes(f.signature)))
   assert.ok(!new RegExp('^\\s*GRANT\\b[^;]*\\b'+helper.name+'\\(','m').test(sql),name+': '+helper.name+' sigue revocada');
 }
});

// Ensayo en PostgreSQL 17 (rama de ensayo, 18/11): dentro de la condición de un IF de PL/pgSQL, un CASE sin paréntesis
// corta la condición en su primer THEN y la función no se crea («syntax error at end of input»). Ninguna fuente,
// ni la 240/241/242/243, puede tener un CASE a profundidad 0 entre IF/ELSIF y su THEN.
test('ensayo PG17: ningún IF de PL/pgSQL tiene un CASE sin paréntesis en su condición',()=>{
 const blank=src=>src.replace(/--[^\n]*|'(?:''|[^'])*'/g,m=>m.replace(/[^\n]/g,' '));
 const offenders=file=>{
  const src=readFileSync(file,'utf8'),tokens=[...blank(src).matchAll(/[A-Za-z_][A-Za-z_0-9]*|\(|\)|;/g)].map(m=>({text:m[0],upper:m[0].toUpperCase(),index:m.index})),found=[];
  tokens.forEach((token,i)=>{
   if(!['IF','ELSIF'].includes(token.upper)||tokens[i-1]?.upper==='END'||tokens[i+1]?.upper==='EXISTS'||(tokens[i+1]?.upper==='NOT'&&tokens[i+2]?.upper==='EXISTS'))return;
   let depth=0,sawCase=false;
   for(let j=i+1;j<tokens.length;j++){const t=tokens[j];
    if(t.text==='(')depth++;else if(t.text===')')depth--;else if(t.text===';')break;
    else if(depth===0&&t.upper==='CASE')sawCase=true;
    else if(depth===0&&t.upper==='THEN'){if(sawCase)found.push(file+':'+(src.slice(0,token.index).split('\n').length));break;}
   }
  });
  return found;
 };
 const files=[...COMPOSITION_ORDER.map(name=>compositionPaths(name).source),'scripts/migrations/240-attendance-daily-source.sql','scripts/migrations/241-attendance-daily-scopes.sql','scripts/migrations/242-own-grh-statement-lines.sql','scripts/migrations/243-attendance-area-scope-administration.sql','scripts/migrations/244-attendance-area-effectivity-declaration.sql','scripts/migrations/245-own-run-actor-person-identifier-format.sql','scripts/migrations/246-own-run-capture-size.sql','scripts/migrations/248-fixed-novelty-native-lookup-and-capacity.sql','scripts/migrations/249-own-novelty-cancel-before-confirm.sql','scripts/migrations/250-own-participation-pending.sql','scripts/migrations/251-native-salary-pending.sql','scripts/migrations/252-own-seniority-pending.sql'];
 assert.deepEqual(files.flatMap(offenders),[]);
 // La regla detecta el caso real que falló en el ensayo.
 const probe=join(mkdtempSync(join(tmpdir(),'mc-if-case-')),'probe.sql');
 writeFileSync(probe,"BEGIN\n IF a IS DISTINCT FROM CASE WHEN b IS NULL THEN NULL ELSE c END\n THEN RETURN 1;END IF;\n IF a IS DISTINCT FROM (CASE WHEN b IS NULL THEN NULL ELSE c END) THEN RETURN 2;END IF;\nEND");
 assert.deepEqual(offenders(probe),[probe+':2']);rmSync(dirname(probe),{recursive:true,force:true});
});

// Ensayo en PostgreSQL 17 con plpgsql_check (18/11): «operator is not unique: unknown - unknown». Los operadores JSON
// (-> ->> #> #>>) tienen MENOS precedencia que + y -, así que a->'x'-'y' se evalúa como a->('x'-'y'). La creación de la
// función no lo detecta: falla recién al ejecutar esa rama. Toda resta o suma después de un operador JSON va con paréntesis.
test('ensayo PG17: ningún operador JSON queda sin paréntesis delante de + o -',()=>{
 const risky=/(?:->>?|#>>?)\s*(?:'[^']*'|[a-z_.]+)\s*[-+]\s*(?:'|[a-z0-9_(])/g;
 const files=[...COMPOSITION_ORDER.map(name=>compositionPaths(name).source),'scripts/migrations/240-attendance-daily-source.sql','scripts/migrations/241-attendance-daily-scopes.sql','scripts/migrations/242-own-grh-statement-lines.sql','scripts/migrations/243-attendance-area-scope-administration.sql','scripts/migrations/244-attendance-area-effectivity-declaration.sql','scripts/migrations/245-own-run-actor-person-identifier-format.sql','scripts/migrations/246-own-run-capture-size.sql','scripts/migrations/248-fixed-novelty-native-lookup-and-capacity.sql','scripts/migrations/249-own-novelty-cancel-before-confirm.sql','scripts/migrations/250-own-participation-pending.sql','scripts/migrations/251-native-salary-pending.sql','scripts/migrations/252-own-seniority-pending.sql'];
 for(const file of files)assert.deepEqual(readFileSync(file,'utf8').replace(/--[^\n]*/g,'').match(risky)??[],[],file);
 assert.equal("x->'source_payload'-'employment'".match(risky)?.length,1,'la regla detecta el caso real');
 assert.equal("(x->'source_payload')-'employment'".match(risky),null);
});

// Revisión independiente (18/11, P2): una dependencia creada por una fuente anterior se fijaba sólo por lo observado.
test('una dependencia creada por una fuente anterior sólo se atesta con el cuerpo de esa fuente revisada',()=>{
 const input=name=>{const paths=compositionPaths(name),manifestText=readFileSync(paths.manifest,'utf8');return {name,source:readFileSync(paths.source,'utf8'),manifest:JSON.parse(manifestText),manifestText};};
 const earlier=name=>Object.fromEntries(COMPOSITION_ORDER.slice(0,COMPOSITION_ORDER.indexOf(name)).map(n=>[n,readFileSync(compositionPaths(n).source,'utf8')]));
 const name='attendance-area-workdays',base={...input(name),earlierSources:earlier(name)};
 const reviewed=new Map(Object.values(base.earlierSources).flatMap(text=>[...createdFunctionBodies(text)]));
 const context='public.attendance_area_context_v1(jsonb,text)';
 assert.match(reviewed.get(context),/^[a-f0-9]{64}$/);
 // prosrc es el texto exacto entre las comillas de dólar: mismo hash que observó PostgreSQL 17 en el ensayo.
 assert.equal(reviewed.get(context).slice(0,12),'c9e0f6707509');
 assert.equal(reviewed.get('public.attendance_area_assert_scope_v1(jsonb,jsonb)').slice(0,12),'f4e8e5ea28a3');
 const pins=deriveSource({...base,attestation:{}}).manifest.preimages.functions;
 const functions=Object.fromEntries(pins.map((p,i)=>{const signature=p.signature??('public.'+p.function+'(jsonb)');return [signature,meta({prosrcSha256:reviewed.get(signature)??p.prosrcSha256??String(i%10).repeat(64)})];}));
 assert.equal(deriveSource({...base,attestation:{functions,triggers:{},reviewed:true}}).manifest.installable,true);
 assert.throws(()=>deriveSource({...base,attestation:{functions:{...functions,[context]:meta({prosrcSha256:'a'.repeat(64)})},triggers:{},reviewed:true}}),/COMPOSITION_DEPENDENCY_BODY_MISMATCH: public\.attendance_area_context_v1/);
 // Sin las fuentes anteriores completas no se acepta la comprobación a medias.
 assert.throws(()=>deriveSource({...base,earlierSources:{}}),/COMPOSITION_EARLIER_SOURCES_INCOMPLETE/);
});
