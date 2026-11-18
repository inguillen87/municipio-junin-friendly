import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMPOSITION_ORDER,compositionPaths,deriveSource} from '../scripts/lib/install-composition-source.mjs';
import {attestationQuery,mergeAttestation,observationTargets,ATTESTATION_OBSERVATION_VERSION} from '../scripts/lib/install-composition-attestation.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const derived=Object.fromEntries(COMPOSITION_ORDER.map(n=>[n,JSON.parse(read(compositionPaths(n).outputManifest))]));
const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
const attestation=JSON.parse(read('scripts/candidates/install-composition-attestation-v1.json'));

test('la consulta es de sólo lectura, termina en ROLLBACK y pide todas las funciones y disparadores fijados',()=>{
 const sql=attestationQuery(Object.values(derived));
 assert.match(sql,/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;$/m);
 assert.ok(sql.trimEnd().endsWith('ROLLBACK;'));
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMIT|TRUNCATE)\b/);
 const {names,triggers}=observationTargets(Object.values(derived));
 for(const name of names)assert.ok(sql.includes("'"+name+"'"),name);
 for(const t of triggers)assert.ok(sql.includes("('"+t.relation+"','"+t.name+"')"),t.name);
 assert.equal(triggers.length,7);
 // Mismas expresiones que el bloque de preimágenes de los derivados.
 const derivedSql=read(compositionPaths('attendance-area-history').output);
 for(const expression of ['sha256(convert_to(','pg_get_userbyid(',"'<NULL>'"])assert.ok(sql.includes(expression)&&derivedSql.includes(expression),expression);
});

test('el volcado resuelve dependencias por nombre, nunca marca revisado y una atestación revisada habilita authority',()=>{
 const deps=derived['attendance-area-authority'].preimages.functions;
 const observation={version:ATTESTATION_OBSERVATION_VERSION,observedAt:'2026-11-18T21:00:00Z',database:'qa',triggers:{},
  functions:Object.fromEntries(deps.map((p,i)=>['public.'+p.function+'(jsonb)',{owner:'qa_owner',acl:'<NULL>',prosrcSha256:String(i%10).repeat(64)}]))};
 const {attestation:merged,unresolved}=mergeAttestation(attestation,observation,{'attendance-area-authority':derived['attendance-area-authority']});
 assert.deepEqual(unresolved,[]);
 const source=merged.sources['attendance-area-authority'];
 assert.equal(source.reviewed,false,'el volcado nunca aprueba');
 assert.equal(Object.keys(source.functions).length,8);
 assert.equal(deriveSource({...inputs('attendance-area-authority'),attestation:source}).manifest.installable,false);
 assert.equal(deriveSource({...inputs('attendance-area-authority'),attestation:{...source,reviewed:true}}).manifest.installable,true);
});

test('el volcado informa sobrecargas ambiguas, faltantes y disparadores cambiados; un cuerpo fijado distinto se rechaza al derivar',()=>{
 const history=derived['attendance-area-history'],guards=history.preimages.functions;
 const functions=Object.fromEntries(guards.map(p=>[p.signature,{owner:'qa_owner',acl:'<NULL>',prosrcSha256:p.prosrcSha256}]));
 const triggers=Object.fromEntries(history.preimages.triggers.map(t=>[t.relation+':'+t.name,{enabled:'O',type:t.type,function:t.function,conditional:false,arguments:0}]));
 const [first]=history.preimages.triggers,changedKey=first.relation+':'+first.name;
 const observation={version:ATTESTATION_OBSERVATION_VERSION,functions,triggers:{...triggers,[changedKey]:{...triggers[changedKey],type:first.type+1}}};
 const {attestation:merged,unresolved}=mergeAttestation(attestation,observation,{'attendance-area-history':history});
 assert.deepEqual(unresolved.map(u=>u.reason),['changed']);
 assert.equal(deriveSource({...inputs('attendance-area-history'),attestation:{...merged.sources['attendance-area-history'],reviewed:true}}).manifest.installable,true);
 const drifted={...functions,[guards[0].signature]:{...functions[guards[0].signature],prosrcSha256:'f'.repeat(64)}};
 const {attestation:bad}=mergeAttestation(attestation,{version:ATTESTATION_OBSERVATION_VERSION,functions:drifted,triggers},{'attendance-area-history':history});
 assert.throws(()=>deriveSource({...inputs('attendance-area-history'),attestation:{...bad.sources['attendance-area-history'],reviewed:true}}),/ATTESTATION_BODY_MISMATCH/);
 const authority=derived['attendance-area-authority'],name=authority.preimages.functions[0].function;
 const two={version:ATTESTATION_OBSERVATION_VERSION,triggers:{},functions:{['public.'+name+'(jsonb)']:{owner:'o',acl:'<NULL>',prosrcSha256:'1'.repeat(64)},['public.'+name+'(text)']:{owner:'o',acl:'<NULL>',prosrcSha256:'2'.repeat(64)}}};
 const result=mergeAttestation(attestation,two,{'attendance-area-authority':authority});
 assert.ok(result.unresolved.some(u=>u.function===name&&u.reason==='ambiguous'));
 assert.ok(result.unresolved.some(u=>u.reason==='missing'));
});
