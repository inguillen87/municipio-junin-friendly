// Pure, deterministic composer for non-installable SQL sources. Never connects to a database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const COMPOSITION_ORDER=Object.freeze([
 'attendance-area-authority',
 'attendance-expected-devices',
 'attendance-area-history',
 'attendance-area-workdays',
 'employment-job-title-writers',
]);
export const COMPOSITION_ROOT='scripts/candidates/';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const esc=s=>"'"+s.replaceAll("'","''")+"'";
const hex=/^[a-f0-9]{64}$/;
const canonical=m=>m.sourceSha256??m.candidate?.sha256??m.output?.sha256;
const sourcePath=name=>COMPOSITION_ROOT+name+'-v1.source.sql.txt';
const sourceManifestPath=name=>COMPOSITION_ROOT+name+'-v1.source.manifest.json';
const outputPath=name=>COMPOSITION_ROOT+name+'-v1.derived.sql.txt';
const outputManifestPath=name=>COMPOSITION_ROOT+name+'-v1.derived.manifest.json';

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
function bodyPins(manifest,source){
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
 return pins;
}
function triggerPins(source){
 // Literal trigger preimages in the original history guard, not observations of the live DB.
 return [...source.matchAll(/\('((?:public\.)[a-z_]+)',\s*'([a-z_]+)',\s*'(public\.[a-z_]+\([^']*\))',\s*(\d+)\)/g)]
  .map(m=>({relation:m[1],name:m[2],function:m[3],type:Number(m[4])}));
}
function preimageSql({name,existing,newFunctions,triggers,metadataSha}){
 const pins=esc(JSON.stringify(existing)),other=esc(JSON.stringify(newFunctions)),trg=esc(JSON.stringify(triggers));
 return `-- REVIEWED PREIMAGE SLOT: source manifests pin function bodies but not observed installed owner/ACL/trigger-enable state.
-- Unattested metadata MUST abort before any source DDL. Do not fill missing values by inference.
DO $composition_preimage$
DECLARE p jsonb; actual record; t record;
BEGIN
 IF current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION 'COMPOSITION_REPLICATION_ROLE_UNSAFE'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(${pins}::jsonb) LOOP
  IF p->>'prosrcSha256' IS NULL OR p->>'owner' IS NULL OR p->>'acl' IS NULL
    THEN RAISE EXCEPTION 'COMPOSITION_PREIMAGE_NOT_ATTESTED: %',p->>'signature'; END IF;
  SELECT x.oid,encode(sha256(convert_to(x.prosrc,'UTF8')),'hex') AS body_hash,
    pg_get_userbyid(x.proowner) AS owner_name,COALESCE(x.proacl::text,'<NULL>') AS acl_text
    INTO actual FROM pg_proc x WHERE x.oid=to_regprocedure(p->>'signature');
  IF NOT FOUND OR actual.body_hash IS DISTINCT FROM p->>'prosrcSha256'
    OR actual.owner_name IS DISTINCT FROM p->>'owner' OR actual.acl_text IS DISTINCT FROM p->>'acl'
    THEN RAISE EXCEPTION 'COMPOSITION_FUNCTION_PREIMAGE_CHANGED: %',p->>'signature'; END IF;
 END LOOP;
 FOR p IN SELECT value FROM jsonb_array_elements(${trg}::jsonb) LOOP
  IF p->>'enabled' IS NULL THEN RAISE EXCEPTION 'COMPOSITION_TRIGGER_PREIMAGE_NOT_ATTESTED: %',p->>'name';END IF;
  SELECT x.tgenabled::text AS enabled, x.tgtype::integer AS trigger_type,x.tgfoid AS function_oid,
   x.tgqual AS condition_value,x.tgnargs AS argument_count INTO t
   FROM pg_trigger x WHERE x.tgrelid=to_regclass(p->>'relation') AND x.tgname=p->>'name';
  IF NOT FOUND OR t.enabled IS DISTINCT FROM p->>'enabled' OR t.trigger_type IS DISTINCT FROM (p->>'type')::integer
    OR t.function_oid IS DISTINCT FROM to_regprocedure(p->>'function') OR t.condition_value IS NOT NULL OR t.argument_count<>0
    THEN RAISE EXCEPTION 'COMPOSITION_TRIGGER_PREIMAGE_CHANGED: %',p->>'name';END IF;
 END LOOP;
 FOR p IN SELECT value FROM jsonb_array_elements(${other}::jsonb) LOOP
  IF EXISTS (SELECT 1 FROM pg_proc x JOIN pg_namespace n ON n.oid=x.pronamespace
    WHERE n.nspname='public' AND x.proname=p->>'name')
    THEN RAISE EXCEPTION 'COMPOSITION_NEW_FUNCTION_COLLISION: %',p->>'name';END IF;
 END LOOP;
END $composition_preimage$;
-- Attestation input SHA-256: ${metadataSha}. Missing owner/ACL/trigger-enable pins fail closed.
`;
}
export function deriveSource({name,source,manifest,manifestText,attestation={}}){
 assert.ok(COMPOSITION_ORDER.includes(name),'COMPOSITION_UNKNOWN_SOURCE');
 assert.equal(sha(source),canonical(manifest),'COMPOSITION_SOURCE_SHA_CHANGED: '+name);
 assert.equal(typeof manifestText,'string');assert.deepEqual(JSON.parse(manifestText),manifest);
 assert.equal(typeof attestation,'object');assert.ok(attestation&&!Array.isArray(attestation));
 const barriers=[...source.matchAll(/^DO \$(source_only|not_an_installer)\$ BEGIN[\s\S]*?END \$\1\$;\n/gm)];
 assert.equal(barriers.length,1,'COMPOSITION_BARRIER_COUNT: '+name);
 const b=barriers[0],prefix=source.slice(0,b.index),tail=source.slice(b.index+b[0].length);
 assert.match(prefix,/(?:^|\n)BEGIN;\n$/,'COMPOSITION_TRANSACTION_START');
 assert.ok(tail.endsWith('ROLLBACK;\n'),'COMPOSITION_FINAL_ROLLBACK');
 assert.equal((tail.match(/^ROLLBACK;$/gm)??[]).length,1,'COMPOSITION_ROLLBACK_COUNT');
 assert.ok(!/^COMMIT;$/m.test(source),'COMPOSITION_UNEXPECTED_COMMIT');
 const body=tail.slice(0,-'ROLLBACK;\n'.length);
 const declarations=functionsIn(source),redefined=declarations.filter(f=>f.redefined),
  manifestExisting=bodyPins(manifest,source);
 assert.equal(new Set(declarations.map(f=>f.name)).size,declarations.length,'COMPOSITION_DUPLICATE_DEFINITION');
 assert.deepEqual(redefined.map(f=>f.signature).sort(),manifestExisting.filter(f=>f.kind==='redefined').map(f=>f.signature).sort(),'COMPOSITION_REDEFINITION_NOT_PINNED');
 const newFunctions=declarations.filter(f=>!f.redefined);
 const observed=attestation.functions??{},observedTriggers=attestation.triggers??{};
 const existing=manifestExisting.map(p=>({...p,owner:observed[p.signature]?.owner??null,acl:observed[p.signature]?.acl??null}));
 const triggers=triggerPins(source).map(t=>({...t,enabled:observedTriggers[t.relation+':'+t.name]?.enabled??null}));
 assert.deepEqual(Object.keys(observed).sort(),existing.map(p=>p.signature).filter(k=>Object.hasOwn(observed,k)).sort(),'COMPOSITION_UNKNOWN_ATTESTATION');
 const metadataSha=sha(JSON.stringify(attestation));
 const preimage=preimageSql({name,existing,newFunctions,triggers,metadataSha});
 const header=`-- DERIVED REVIEW ARTIFACT ${name}. Never install a source-only file.
-- The source SQL below is byte-preserved except its one initial exception barrier and final ROLLBACK.
-- DRY RUN BY DEFAULT. Codex must separately attest preimages; COMMIT requires a reviewed Codex marker.
`;
 const ending=`-- CODEX INSTALLATION RULE: replace the final ROLLBACK only after adding an explicit
-- CODEX_REVIEWED_COMMIT marker bound to the reviewed derived SQL SHA-256 and recorded preimages.
ROLLBACK;
`;
 const sql=header+prefix+preimage+body+ending;
 assert.ok(!sql.includes('$source_only$')&&!sql.includes('$not_an_installer$'),'COMPOSITION_BARRIER_REMAINED');
 assert.ok(sql.endsWith('ROLLBACK;\n')&&!/^COMMIT;$/m.test(sql),'COMPOSITION_UNSAFE_TERMINATOR');
 const attested=existing.every(p=>hex.test(p.prosrcSha256??'')&&typeof p.owner==='string'&&p.owner.length>0&&typeof p.acl==='string')
  &&triggers.every(p=>['O','A'].includes(p.enabled));
 return {sql,manifest:{
   version:'municontrol-install-composition-derived.v1',name,installable:attested,
   dryRun:true,committed:false,requiresCodexReviewedCommit:true,
   source:{path:sourcePath(name),bytes:Buffer.byteLength(source,'utf8'),sha256:sha(source)},
   sourceManifest:{path:sourceManifestPath(name),sha256:sha(manifestText)},
   attestation:{path:COMPOSITION_ROOT+'install-composition-attestation-v1.json',sha256:metadataSha,complete:attested},
   removed:{barrierSha256:sha(b[0]),rollbackSha256:sha('ROLLBACK;\n')},
   preserved:{prefixSha256:sha(prefix),bodySha256:sha(body),originalStatementsBytePreserved:true},
   preimages:{functions:existing,triggers,newFunctions},
   output:{path:outputPath(name),bytes:Buffer.byteLength(sql,'utf8'),sha256:sha(sql)},
 }};
}
export function compositionPaths(name){assert.ok(COMPOSITION_ORDER.includes(name));return {source:sourcePath(name),manifest:sourceManifestPath(name),output:outputPath(name),outputManifest:outputManifestPath(name)};}
