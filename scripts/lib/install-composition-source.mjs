// Pure, deterministic composer for non-installable SQL sources. Never connects to a database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Topological order: history depends only on pre-existing guards; expected-devices depends on authority + history.
export const COMPOSITION_ORDER=Object.freeze([
 'attendance-area-authority',
 'attendance-area-history',
 'attendance-expected-devices',
 'attendance-area-workdays',
 'employment-job-title-writers',
]);
export const COMPOSITION_ROOT='scripts/candidates/';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const esc=s=>"'"+s.replaceAll("'","''")+"'";
const hex=/^[a-f0-9]{64}$/;
const SIG_RE=/^public\.[a-z_][a-z0-9_]*\([a-z0-9_.\[\] ,]*\)$/;
const LANG_RE=/^[a-z_][a-z0-9_]{0,62}$/;
const BIN_RE=/^(?:\$libdir\/[a-z0-9_./-]{1,120})?$/;
const SAFE_TEXT=/^[^\x00-\x1f\x7f$]{0,2048}$/;
const isPlainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const canonical=m=>m.sourceSha256??m.candidate?.sha256??m.output?.sha256;
const sourcePath=name=>COMPOSITION_ROOT+name+'-v1.source.sql.txt';
const sourceManifestPath=name=>COMPOSITION_ROOT+name+'-v1.source.manifest.json';
const outputPath=name=>COMPOSITION_ROOT+name+'-v1.derived.sql.txt';
const outputManifestPath=name=>COMPOSITION_ROOT+name+'-v1.derived.manifest.json';

function stripLineComments(src){return src.replace(/--[^\n]*/g,'');}
function stripCommentsAndStrings(src){
 return src.replace(/--[^\n]*|'(?:''|[^'])*'/g,m=>m.replace(/[^\n]/g,' '));
}

function functionsIn(source){
 const expression=/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(public\.[a-z][a-z0-9_]*)\s*\(([\s\S]*?)\)\s+RETURNS\b/gi;
 return [...source.matchAll(expression)].map(m=>{
  const args=m[3].trim(),signature=m[2]+'('+(args?args.split(',').map(p=>{
   const part=p.trim().replace(/\s+DEFAULT\s+[\s\S]*$/i,'').replace(/^IN\s+/i,'');
   const tokens=part.split(/\s+/);assert.ok(tokens.length>=2,'COMPOSITION_SIGNATURE_UNPARSEABLE');
   return tokens.slice(1).join(' ').replace(/\s+/g,'');
  }).join(','):'')+')';
  return {name:m[2].split('.')[1],signature,redefined:Boolean(m[1])};
 });
}
// Funciones existentes que la fuente invoca (calificadas con public. o sin calificar) y no crea.
// El manifiesto de origen no siempre las enumera (authority llama a ocho, job-title-writers llama a cuatro
// sin calificar, workdays llama a digest sin calificar): sin esto la composición no las verificaría.
const RELATION_CONTEXT=/\b(?:REFERENCES|INTO|TABLE|UPDATE|ONLY|ON\s+CONFLICT)\s*$/i;
const PG_BUILTINS=new Set([
 'if','elsif','while','for','in','not','and','or','when','then','else','case','exists','select','from','where',
 'join','on','as','returns','return','values','array','any','all','some','distinct','unique','primary','foreign',
 'check','references','constraint','conflict','lateral','materialized','by','over','partition','using','null',
 'true','false','between','is','like','ilike','similar','into','set','default','having','group','order','limit',
 'offset','union','intersect','except','with','recursive','filter','within','row','rows','range','groups','only',
 'varchar','char','character','numeric','decimal','bit','varbit','time','timestamp','interval','bigint','integer',
 'smallint','text','boolean','uuid','date','jsonb','json','bytea','oid','regclass','regprocedure','regrole',
 'coalesce','nullif','greatest','least','count','min','max','sum','avg','bool_or','bool_and','string_agg','array_agg',
 'jsonb_build_object','jsonb_build_array','jsonb_array_elements','jsonb_array_elements_text','jsonb_object_keys',
 'jsonb_each','jsonb_each_text','jsonb_typeof','jsonb_array_length','jsonb_set','jsonb_agg','jsonb_strip_nulls',
 'to_jsonb','to_char','to_regprocedure','to_regclass','to_regrole','encode','decode','sha256','convert_to',
 'substring','substr','length','char_length','octet_length','btrim','ltrim','rtrim','trim','lower','upper',
 'lpad','rpad','repeat','replace','split_part','concat','concat_ws','unnest','cardinality','generate_series',
 'ascii','normalize','current_setting','set_config','statement_timestamp','clock_timestamp','transaction_timestamp',
 'now','gen_random_uuid','pg_input_is_valid','pg_try_advisory_xact_lock','pg_advisory_xact_lock','hashtextextended',
 'pg_current_xact_id','pg_current_xact_id_if_assigned','pg_current_snapshot','pg_get_userbyid','pg_get_functiondef',
 'lag','lead','row_number','rank','dense_rank','first_value','last_value','extract','position','left','right',
 'abs','ceil','floor','round','trunc','mod','power','sqrt','regexp_replace','regexp_match','regexp_matches',
]);
const fnName=signature=>signature.split('(')[0].split('.').pop();
// Cuerpo (prosrc) de cada función que crea una fuente: el texto exacto entre sus comillas de dólar.
export function createdFunctionBodies(source){
 const bodies=new Map();
 for(const f of functionsIn(source)){
  const at=source.search(new RegExp('\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.'+f.name+'\\s*\\(','i'));
  const open=/\bAS\s+(\$[A-Za-z_0-9]*\$)/.exec(source.slice(at));assert.ok(at>=0&&open,'COMPOSITION_FUNCTION_BODY_UNPARSEABLE: '+f.signature);
  const start=at+open.index+open[0].length,end=source.indexOf(open[1],start);assert.ok(end>start,'COMPOSITION_FUNCTION_BODY_UNPARSEABLE: '+f.signature);
  bodies.set(f.signature,sha(source.slice(start,end)));
 }
 return bodies;
}
const pinName=p=>p.function??fnName(p.signature);
export function calledFunctions(source){
 const cleaned=stripCommentsAndStrings(source);
 const created=new Set([...cleaned.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TABLE(?:\s+IF\s+NOT\s+EXISTS)?|VIEW|SEQUENCE|TYPE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map(m=>m[1].toLowerCase()));
 const names=new Set();
 for(const m of cleaned.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\s*\(/gi)){
  const name=m[1].toLowerCase(),before=cleaned.slice(Math.max(0,m.index-60),m.index);
  if(RELATION_CONTEXT.test(before)||created.has(name))continue;
  if(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TABLE(?:\s+IF\s+NOT\s+EXISTS)?|VIEW|SEQUENCE|TYPE)\s+$/i.test(before))continue;
  if(/\bINDEX\s+[a-z_][a-z0-9_]*\s+ON\s+$/i.test(before))continue;
  const stmtStart=cleaned.lastIndexOf(';',m.index)+1;
  if(/^\s*(?:REVOKE|GRANT)\b/i.test(cleaned.slice(stmtStart,m.index)))continue;
  names.add(name);
 }
 for(const m of cleaned.matchAll(/(?<![a-z0-9_.])([a-z_][a-z0-9_]*)\s*\(/gi)){
  const name=m[1].toLowerCase();
  if(PG_BUILTINS.has(name)||created.has(name))continue;
  const before=cleaned.slice(Math.max(0,m.index-60),m.index);
  if(RELATION_CONTEXT.test(before))continue;
  if(/\bAS\s+$/i.test(before)||/\)\s+$/i.test(before))continue;
  if(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TABLE(?:\s+IF\s+NOT\s+EXISTS)?|VIEW|SEQUENCE|TYPE)\s+$/i.test(before))continue;
  if(/\bINDEX\s+[a-z_][a-z0-9_]*\s+ON\s+$/i.test(before))continue;
  const stmtStart=cleaned.lastIndexOf(';',m.index)+1,stmtPrefix=cleaned.slice(stmtStart,m.index);
  if(/^\s*(?:REVOKE|GRANT)\b/i.test(stmtPrefix))continue;
  if(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|UNIQUE\s+INDEX|INDEX|VIEW|SEQUENCE|TYPE)\b/i.test(stmtPrefix))continue;
  if(/^\s*CREATE\s+TRIGGER\b/i.test(stmtPrefix)&&!/\bEXECUTE\s+(?:FUNCTION|PROCEDURE)\s+$/i.test(before))continue;
  if(/\(\s*$/.test(before)&&/\)\.\*/.test(cleaned.slice(m.index,m.index+name.length+5)))continue;
  names.add(name);
 }
 return [...names].sort();
}
// pgcrypto está en public con dos sobrecargas de digest: (bytea,text) y (text,text). Una dependencia declarada sólo por
// nombre con varias sobrecargas observadas queda ambigua en la atestación (Codex, PR 270 6996579811), y está bien que así
// sea. Cada fuente fija acá las firmas que usan sus llamadas reales; tests/install-composition-attestation.test.js clasifica cada
// llamada a digest de cada fuente y exige que coincida exactamente con esta tabla.
export const DECLARED_DEPENDENCY_SIGNATURES=Object.freeze({
 'attendance-area-authority':Object.freeze({digest:Object.freeze(['public.digest(text,text)'])}),
 'attendance-area-workdays':Object.freeze({digest:Object.freeze(['public.digest(bytea,text)','public.digest(text,text)'])}),
 'employment-job-title-writers':Object.freeze({digest:Object.freeze(['public.digest(bytea,text)','public.digest(text,text)'])}),
});
// Fachadas que la aplicación llama directamente: lib/internal-attendance-expected-devices.js (read y command) y
// lib/internal-attendance-area.js (workdays). Las fuentes revocan todo «y dejan el GRANT a la composición revisada»;
// sin esto, instaladas, esas rutas fallarían por permiso (Codex, PR 270 6996579811). Sólo estas tres, SECURITY DEFINER
// y con su propia autoridad (attendance_area_context_v1); los ayudantes y las tablas quedan revocados. Esto no da
// capacidades ni alcances de área a ninguna cuenta.
export const COMPOSITION_RUNTIME_ROLE='municontrol_actions_runtime_app';
export const COMPOSITION_RUNTIME_GRANTS=Object.freeze({
 'attendance-expected-devices':Object.freeze(['public.attendance_expected_devices_read_v1(jsonb,jsonb)','public.attendance_expected_devices_command_v1(jsonb,jsonb,uuid)']),
 'attendance-area-workdays':Object.freeze(['public.attendance_area_workdays_read_v1(jsonb,jsonb)']),
});
function runtimeGrantSql(name,source,newFunctions){
 const grants=COMPOSITION_RUNTIME_GRANTS[name]??[];
 for(const signature of grants){
  assert.ok(newFunctions.some(f=>f.signature===signature),'COMPOSITION_GRANT_NOT_CREATED_HERE: '+signature);
  const fn=signature.split('(')[0].replace('.','\\.'),at=source.search(new RegExp('CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+'+fn+'\\s*\\('));
  const rest=source.slice(Math.max(at,0)),bodyStart=rest.search(/\bAS\s*\$[a-z_]*\$/i),header=bodyStart>0?rest.slice(0,bodyStart):'';
  assert.ok(at>=0&&/\bSECURITY\s+DEFINER\b/i.test(header)&&/\bSET\s+search_path\b/i.test(header),'COMPOSITION_GRANT_NOT_DEFINER: '+signature);
 }
 return {grants:[...grants],sql:grants.length?'-- Reviewed composition grant (PR 270): only the facades the application calls; helpers and tables stay revoked.\n'
  +grants.map(g=>'GRANT EXECUTE ON FUNCTION '+g+' TO '+COMPOSITION_RUNTIME_ROLE+';\n').join(''):''};
}
function bodyPins(manifest,source,name){
 const pins=[];
 for(const f of manifest.functions??[])if(f.beforeBodySha256) pins.push({signature:f.signature,prosrcSha256:f.beforeBodySha256,kind:'redefined'});
 for(const p of manifest.originalBodyPins??[]){
  const matches=[...source.matchAll(/\('([^']+)',\s*'([a-f0-9]{64})'\)/g)];
  const match=matches.find(m=>m[1].split('(')[0].split('.').pop()===p.function&&m[2]===p.prosrcSha256);
  assert.ok(match,'COMPOSITION_ORIGINAL_BODY_PIN_NOT_IN_SOURCE '+p.function);
  pins.push({signature:match[1],prosrcSha256:p.prosrcSha256,kind:'guard'});
 }
 for(const signature of manifest.externalFunctions??[])if(!pins.some(x=>x.signature===signature))
  pins.push({signature,prosrcSha256:null,kind:'dependency'});
 if(manifest.authority&&!pins.some(x=>x.signature===manifest.authority))
  pins.push({signature:manifest.authority,prosrcSha256:null,kind:'dependency'});
 for(const signature of manifest.requiredPrivateStableHelpers??[])if(!pins.some(x=>x.signature===signature))
  pins.push({signature,prosrcSha256:null,kind:'dependency'});
 // Dependencias sin firma declarada: firma(s), cuerpo, dueño, ACL y metadatos los aporta la atestación de Codex.
 const declared=DECLARED_DEPENDENCY_SIGNATURES[name]??{},called=calledFunctions(source);
 for(const fn of Object.keys(declared))assert.ok(called.includes(fn),'COMPOSITION_DECLARED_DEPENDENCY_NOT_CALLED: '+name+' '+fn);
 for(const fn of called)if(!pins.some(x=>pinName(x)===fn)){
  if(Object.hasOwn(declared,fn))for(const signature of declared[fn])pins.push({signature,prosrcSha256:null,kind:'dependency'});
  else pins.push({signature:null,function:fn,prosrcSha256:null,kind:'dependency'});
 }
 return pins.map(p=>({...p,function:pinName(p)}));
}
function triggerPins(source){
 // Literal trigger preimages in the original history guard, not observations of the live DB.
 return [...source.matchAll(/\('(public\.[a-z_][a-z0-9_]*)',\s*'([a-z_][a-z0-9_]*)',\s*'(public\.[a-z_][a-z0-9_]*\([^']*\))',\s*(\d+)\)/g)]
  .map(m=>({relation:m[1],name:m[2],function:m[3],type:Number(m[4])}));
}
function validateFunctionAttestation(signature,seen){
 assert.ok(typeof signature==='string'&&signature.length<=512&&SIG_RE.test(signature),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 assert.ok(isPlainObject(seen),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 const allowed=new Set(['owner','acl','prosrcSha256','secdef','config','lang','bin','volatile','strict','parallel','leakproof']);
 assert.ok(Object.keys(seen).every(k=>allowed.has(k)),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.owner!==undefined&&seen.owner!==null)
  assert.ok(typeof seen.owner==='string'&&SAFE_TEXT.test(seen.owner),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.acl!==undefined&&seen.acl!==null)
  assert.ok(typeof seen.acl==='string'&&SAFE_TEXT.test(seen.acl),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.prosrcSha256!==undefined&&seen.prosrcSha256!==null)
  assert.ok(typeof seen.prosrcSha256==='string'&&hex.test(seen.prosrcSha256),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.secdef!==undefined&&seen.secdef!==null)
  assert.ok(typeof seen.secdef==='boolean','COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.config!==undefined&&seen.config!==null)
  assert.ok(Array.isArray(seen.config)&&seen.config.length<=32&&seen.config.every(c=>typeof c==='string'&&SAFE_TEXT.test(c)),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.lang!==undefined&&seen.lang!==null)
  assert.ok(typeof seen.lang==='string'&&LANG_RE.test(seen.lang),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.bin!==undefined&&seen.bin!==null)
  assert.ok(typeof seen.bin==='string'&&BIN_RE.test(seen.bin),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 // Volatilidad, STRICT, seguridad paralela y leakproof (segunda revisión de ChatGPT, 6994996082): un ALTER FUNCTION
 // … IMMUTABLE/STRICT cambia el comportamiento sin cambiar el cuerpo, el dueño ni la ACL.
 if(seen.volatile!==undefined&&seen.volatile!==null)
  assert.ok(['i','s','v'].includes(seen.volatile),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.strict!==undefined&&seen.strict!==null)
  assert.ok(typeof seen.strict==='boolean','COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.parallel!==undefined&&seen.parallel!==null)
  assert.ok(['s','r','u'].includes(seen.parallel),'COMPOSITION_ATTESTATION_INVALID: '+signature);
 if(seen.leakproof!==undefined&&seen.leakproof!==null)
  assert.ok(typeof seen.leakproof==='boolean','COMPOSITION_ATTESTATION_INVALID: '+signature);
}
function validateTriggerAttestation(key,seen){
 assert.ok(isPlainObject(seen),'COMPOSITION_TRIGGER_ATTESTATION_INVALID: '+key);
 assert.ok(Object.keys(seen).every(k=>k==='enabled'),'COMPOSITION_TRIGGER_ATTESTATION_INVALID: '+key);
 if(seen.enabled!==undefined&&seen.enabled!==null)
  assert.ok(typeof seen.enabled==='string'&&['O','A','D','R'].includes(seen.enabled),'COMPOSITION_TRIGGER_ATTESTATION_INVALID: '+key);
}
function preimageSql({existing,newFunctions,triggers,metadataSha,attested}){
 assert.match(metadataSha,hex,'COMPOSITION_METADATA_SHA_INVALID');
 const pins=esc(JSON.stringify(existing)),other=esc(JSON.stringify(newFunctions)),trg=esc(JSON.stringify(triggers));
 const body=`DECLARE p jsonb; actual record; t record;
BEGIN
 IF ${attested?'TRUE':'FALSE'} IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'COMPOSITION_REVIEWED_PREIMAGES_REQUIRED'; END IF;
 IF pg_catalog.current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION 'COMPOSITION_REPLICATION_ROLE_UNSAFE'; END IF;
 FOR p IN SELECT value FROM pg_catalog.jsonb_array_elements(${pins}::jsonb) LOOP
  IF p->>'prosrcSha256' IS NULL OR p->>'owner' IS NULL OR p->>'acl' IS NULL
    OR p->>'signature' IS NULL OR pg_catalog.jsonb_typeof(p->'secdef') <> 'boolean'
    OR pg_catalog.jsonb_typeof(p->'config') <> 'array' OR p->>'lang' IS NULL OR p->>'bin' IS NULL
    OR p->>'volatile' IS NULL OR pg_catalog.jsonb_typeof(p->'strict') <> 'boolean'
    OR p->>'parallel' IS NULL OR pg_catalog.jsonb_typeof(p->'leakproof') <> 'boolean'
    THEN RAISE EXCEPTION 'COMPOSITION_PREIMAGE_NOT_ATTESTED: %',coalesce(p->>'signature',p->>'function'); END IF;
  SELECT x.oid,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(x.prosrc,'UTF8')),'hex') AS body_hash,
    pg_catalog.pg_get_userbyid(x.proowner) AS owner_name,COALESCE(x.proacl::text,'<NULL>') AS acl_text,
    x.prosecdef AS secdef,COALESCE(pg_catalog.to_jsonb(x.proconfig),'[]'::jsonb) AS config,
    (SELECT l.lanname FROM pg_catalog.pg_language l WHERE l.oid=x.prolang) AS lang,
    COALESCE(x.probin,'') AS bin,x.provolatile::text AS volatility,x.proisstrict AS is_strict,
    x.proparallel::text AS parallel_safety,x.proleakproof AS is_leakproof
    INTO actual FROM pg_catalog.pg_proc x WHERE x.oid=pg_catalog.to_regprocedure(p->>'signature');
  IF NOT FOUND OR actual.body_hash IS DISTINCT FROM p->>'prosrcSha256'
    OR actual.owner_name IS DISTINCT FROM p->>'owner' OR actual.acl_text IS DISTINCT FROM p->>'acl'
    OR actual.secdef IS DISTINCT FROM (p->>'secdef')::boolean OR actual.config IS DISTINCT FROM (p->'config')
    OR actual.lang IS DISTINCT FROM p->>'lang' OR actual.bin IS DISTINCT FROM p->>'bin'
    OR actual.volatility IS DISTINCT FROM p->>'volatile' OR actual.is_strict IS DISTINCT FROM (p->>'strict')::boolean
    OR actual.parallel_safety IS DISTINCT FROM p->>'parallel' OR actual.is_leakproof IS DISTINCT FROM (p->>'leakproof')::boolean
    THEN RAISE EXCEPTION 'COMPOSITION_FUNCTION_PREIMAGE_CHANGED: %',p->>'signature'; END IF;
 END LOOP;
 FOR p IN SELECT value FROM pg_catalog.jsonb_array_elements(${trg}::jsonb) LOOP
  IF p->>'enabled' IS NULL OR p->>'enabled' NOT IN ('O','A') THEN RAISE EXCEPTION 'COMPOSITION_TRIGGER_PREIMAGE_NOT_ATTESTED: %',p->>'name';END IF;
  SELECT x.tgenabled::text AS enabled, x.tgtype::integer AS trigger_type,x.tgfoid AS function_oid,
   x.tgqual AS condition_value,x.tgnargs AS argument_count INTO t
   FROM pg_catalog.pg_trigger x WHERE x.tgrelid=pg_catalog.to_regclass(p->>'relation') AND x.tgname=p->>'name';
  IF NOT FOUND OR t.enabled NOT IN ('O','A') OR t.enabled IS DISTINCT FROM p->>'enabled' OR t.trigger_type IS DISTINCT FROM (p->>'type')::integer
    OR t.function_oid IS DISTINCT FROM pg_catalog.to_regprocedure(p->>'function') OR t.condition_value IS NOT NULL OR t.argument_count<>0
    THEN RAISE EXCEPTION 'COMPOSITION_TRIGGER_PREIMAGE_CHANGED: %',p->>'name';END IF;
 END LOOP;
 FOR p IN SELECT value FROM pg_catalog.jsonb_array_elements(${other}::jsonb) LOOP
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc x JOIN pg_catalog.pg_namespace n ON n.oid=x.pronamespace
    WHERE n.nspname='public' AND x.proname=p->>'name')
    THEN RAISE EXCEPTION 'COMPOSITION_NEW_FUNCTION_COLLISION: %',p->>'name';END IF;
 END LOOP;
END`;
 assert.ok(!body.includes('$composition_preimage$'),'COMPOSITION_DOLLAR_QUOTE_INJECTION');
 return `-- REVIEWED PREIMAGE SLOT: source manifests pin function bodies but not observed installed owner/ACL/metadata/trigger-enable state.
-- Unattested metadata MUST abort before any source DDL. Do not fill missing values by inference.
DO $composition_preimage$
${body} $composition_preimage$;
-- Attestation input SHA-256: ${metadataSha}. Missing owner/ACL/metadata/trigger-enable pins fail closed.
`;
}
export function deriveSource({name,source,manifest,manifestText,attestation={},attestationFileSha=null,earlierSources=null}){
 assert.ok(COMPOSITION_ORDER.includes(name),'COMPOSITION_UNKNOWN_SOURCE');
 assert.equal(sha(source),canonical(manifest),'COMPOSITION_SOURCE_SHA_CHANGED: '+name);
 assert.equal(typeof manifestText,'string');assert.deepEqual(JSON.parse(manifestText),manifest);
 assert.ok(isPlainObject(attestation),'COMPOSITION_ATTESTATION_INVALID');
 const barriers=[...source.matchAll(/^DO \$(source_only|not_an_installer)\$ BEGIN[\s\S]*?END \$\1\$;\n/gm)];
 assert.equal(barriers.length,1,'COMPOSITION_BARRIER_COUNT: '+name);
 const b=barriers[0],prefix=source.slice(0,b.index),tail=source.slice(b.index+b[0].length);
 assert.match(prefix,/(?:^|\n)BEGIN;\n$/,'COMPOSITION_TRANSACTION_START');
 assert.ok(tail.endsWith('ROLLBACK;\n'),'COMPOSITION_FINAL_ROLLBACK');
 assert.equal((tail.match(/^ROLLBACK;$/gm)??[]).length,1,'COMPOSITION_ROLLBACK_COUNT');
 assert.ok(!/\bCOMMIT\b/i.test(stripLineComments(source)),'COMPOSITION_UNEXPECTED_COMMIT');
 const body=tail.slice(0,-'ROLLBACK;\n'.length);
 const declarations=functionsIn(source),redefined=declarations.filter(f=>f.redefined),
  manifestExisting=bodyPins(manifest,source,name);
 assert.equal(new Set(declarations.map(f=>f.name)).size,declarations.length,'COMPOSITION_DUPLICATE_DEFINITION');
 assert.deepEqual(redefined.map(f=>f.signature).sort(),manifestExisting.filter(f=>f.kind==='redefined').map(f=>f.signature).sort(),'COMPOSITION_REDEFINITION_NOT_PINNED');
 const newFunctions=declarations.filter(f=>!f.redefined);
 const observed=attestation.functions??{},observedTriggers=attestation.triggers??{};
 assert.ok(isPlainObject(observed),'COMPOSITION_ATTESTATION_INVALID');
 assert.ok(isPlainObject(observedTriggers),'COMPOSITION_TRIGGER_ATTESTATION_INVALID');
 for(const [sig,seen] of Object.entries(observed))validateFunctionAttestation(sig,seen);
 for(const [key,seen] of Object.entries(observedTriggers))validateTriggerAttestation(key,seen);
 // Una dependencia creada por una fuente anterior de la composición no se fija sólo por lo observado: su cuerpo
 // atestado tiene que ser el de esa fuente revisada (revisión independiente del 18/11, P2). Así una rama o base con
 // un cuerpo viejo o alterado de, por ejemplo, attendance_area_context_v1 no puede convertirse en el pin.
 const reviewedBodies=new Map();
 if(earlierSources!==null){
  assert.ok(isPlainObject(earlierSources),'COMPOSITION_EARLIER_SOURCES_INVALID');
  assert.deepEqual(Object.keys(earlierSources).sort(),COMPOSITION_ORDER.slice(0,COMPOSITION_ORDER.indexOf(name)).sort(),'COMPOSITION_EARLIER_SOURCES_INCOMPLETE: '+name);
  for(const text of Object.values(earlierSources))for(const [signature,body] of createdFunctionBodies(text))reviewedBodies.set(signature,body);
 }
 const buildPin=(p,signature)=>{
  const seen=signature===null?undefined:observed[signature];
  if(p.kind==='dependency'&&signature!==null&&reviewedBodies.has(signature)&&seen?.prosrcSha256!==undefined&&seen?.prosrcSha256!==null)
   assert.equal(seen.prosrcSha256,reviewedBodies.get(signature),'COMPOSITION_DEPENDENCY_BODY_MISMATCH: '+signature);
  // Un cuerpo fijado por el manifiesto (reemplazo o guarda) no se puede cambiar por atestación.
  if(p.kind!=='dependency'&&seen?.prosrcSha256!==undefined&&seen?.prosrcSha256!==null)
   assert.equal(seen.prosrcSha256,p.prosrcSha256,'COMPOSITION_ATTESTATION_BODY_MISMATCH: '+signature);
  return {
   ...p,signature,
   prosrcSha256:p.prosrcSha256??seen?.prosrcSha256??null,
   owner:seen?.owner??null,
   acl:seen?.acl??null,
   secdef:seen?.secdef??null,
   config:seen?.config??null,
   lang:seen?.lang??null,
   bin:seen?.bin??null,
   volatile:seen?.volatile??null,
   strict:seen?.strict??null,
   parallel:seen?.parallel??null,
   leakproof:seen?.leakproof??null,
  };
 };
 const existing=manifestExisting.flatMap(p=>{
  if(p.signature!==null)return [buildPin(p,p.signature)];
  // Dependencia por nombre: admite 1..N sobrecargas atestadas explícitamente (ej. digest(bytea,text) y digest(text,text)).
  const candidates=Object.keys(observed).filter(k=>fnName(k)===p.function).sort();
  if(candidates.length===0)return [buildPin(p,null)];
  return candidates.map(signature=>buildPin(p,signature));
 });
 const triggers=triggerPins(source).map(t=>({...t,enabled:observedTriggers[t.relation+':'+t.name]?.enabled??null}));
 assert.deepEqual(Object.keys(observed).sort(),existing.map(p=>p.signature).filter(k=>k!==null&&Object.hasOwn(observed,k)).sort(),'COMPOSITION_UNKNOWN_ATTESTATION');
 const triggerKeys=new Set(triggers.map(t=>t.relation+':'+t.name));
 assert.ok(Object.keys(observedTriggers).every(k=>triggerKeys.has(k)),'COMPOSITION_UNKNOWN_TRIGGER_ATTESTATION');
 const attested=attestation.reviewed===true
  &&existing.every(p=>typeof p.signature==='string'&&SIG_RE.test(p.signature)&&hex.test(p.prosrcSha256??'')
   &&typeof p.owner==='string'&&p.owner.length>0&&typeof p.acl==='string'&&p.acl.length>0
   &&typeof p.secdef==='boolean'&&Array.isArray(p.config)&&typeof p.lang==='string'&&LANG_RE.test(p.lang)
   &&typeof p.bin==='string'&&BIN_RE.test(p.bin)
   &&['i','s','v'].includes(p.volatile)&&typeof p.strict==='boolean'&&['s','r','u'].includes(p.parallel)&&typeof p.leakproof==='boolean')
  &&triggers.every(p=>['O','A'].includes(p.enabled));
 const metadataSha=attestationFileSha??sha(JSON.stringify(attestation));
 const preimage=preimageSql({existing,newFunctions,triggers,metadataSha,attested});
 const header=`-- DERIVED REVIEW ARTIFACT ${name}. Never install a source-only file.
-- The source SQL below is byte-preserved except its one initial exception barrier and final ROLLBACK;
-- the reviewed composition appends only the declared facade GRANTs listed in the manifest (runtimeGrants).
-- DRY RUN BY DEFAULT. Codex must separately attest preimages; COMMIT requires a reviewed Codex marker.
`;
 const ending=`-- CODEX INSTALLATION RULE: replace the final ROLLBACK only after adding an explicit
-- CODEX_REVIEWED_COMMIT marker bound to the reviewed derived SQL SHA-256 and recorded preimages.
ROLLBACK;
`;
 const runtime=runtimeGrantSql(name,source,newFunctions);
 const sql=header+prefix+preimage+body+runtime.sql+ending;
 assert.ok(!sql.includes('$source_only$')&&!sql.includes('$not_an_installer$'),'COMPOSITION_BARRIER_REMAINED');
 assert.equal(sql.split('$composition_preimage$').length,3,'COMPOSITION_DOLLAR_QUOTE_INJECTION');
 assert.ok(sql.endsWith('ROLLBACK;\n')&&!/\bCOMMIT\b/i.test(stripLineComments(sql)),'COMPOSITION_UNSAFE_TERMINATOR');
 return {sql,manifest:{
   version:'municontrol-install-composition-derived.v1',name,installable:attested,
   dryRun:true,committed:false,requiresCodexReviewedCommit:true,
   source:{path:sourcePath(name),bytes:Buffer.byteLength(source,'utf8'),sha256:sha(source)},
   sourceManifest:{path:sourceManifestPath(name),sha256:sha(manifestText)},
   attestation:{path:COMPOSITION_ROOT+'install-composition-attestation-v1.json',sha256:metadataSha,complete:attested},
   removed:{barrierSha256:sha(b[0]),rollbackSha256:sha('ROLLBACK;\n')},
   preserved:{prefixSha256:sha(prefix),bodySha256:sha(body),originalStatementsBytePreserved:true},
   preimages:{functions:existing,triggers,newFunctions},
   runtimeGrants:runtime.grants,
   output:{path:outputPath(name),bytes:Buffer.byteLength(sql,'utf8'),sha256:sha(sql)},
 }};
}
export function compositionPaths(name){assert.ok(COMPOSITION_ORDER.includes(name));return {source:sourcePath(name),manifest:sourceManifestPath(name),output:outputPath(name),outputManifest:outputManifestPath(name)};}
