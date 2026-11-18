import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMPOSITION_ORDER,compositionPaths,deriveSource} from '../scripts/lib/install-composition-source.mjs';
import {attestationQuery,mergeAttestation,observationTargets,ATTESTATION_OBSERVATION_VERSION} from '../scripts/lib/install-composition-attestation.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const derived=Object.fromEntries(COMPOSITION_ORDER.map(n=>[n,JSON.parse(read(compositionPaths(n).outputManifest))]));
const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
const attestation=JSON.parse(read('scripts/candidates/install-composition-attestation-v1.json'));
const obsFn=(prosrcSha256,over={})=>({owner:'qa_owner',acl:'<NULL>',prosrcSha256,secdef:true,config:['search_path=pg_catalog, public, pg_temp'],lang:'plpgsql',bin:'',...over});

test('la consulta es de sólo lectura, termina en ROLLBACK y pide todas las funciones y disparadores fijados',()=>{
 const sql=attestationQuery(Object.values(derived));
 assert.match(sql,/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;$/m);
 assert.ok(sql.trimEnd().endsWith('ROLLBACK;'));
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|COMMIT|TRUNCATE)\b/i);
 const {names,triggers}=observationTargets(Object.values(derived));
 for(const name of names)assert.ok(sql.includes("'"+name+"'"),name);
 for(const missed of ['native_employee_context_v1','is_valid_cuil','native_employee_receipt_v1','native_employee_next_number_v1'])
  assert.ok(names.includes(missed),'observationTargets incluye '+missed);
 for(const t of triggers)assert.ok(sql.includes("('"+t.relation+"','"+t.name+"')"),t.name);
 assert.equal(triggers.length,7);
 // Mismas expresiones (calificadas con pg_catalog.) que el bloque de preimágenes de los derivados.
 const derivedSql=read(compositionPaths('attendance-area-history').output);
 for(const expression of ['pg_catalog.sha256(pg_catalog.convert_to(','pg_catalog.pg_get_userbyid(',"'<NULL>'",'prosecdef','proconfig','probin'])
  assert.ok(sql.includes(expression)&&derivedSql.includes(expression),expression);
});

test('el volcado resuelve dependencias por nombre, nunca marca revisado y una atestación revisada habilita authority',()=>{
 const deps=derived['attendance-area-authority'].preimages.functions;
 const observation={version:ATTESTATION_OBSERVATION_VERSION,observedAt:'2026-11-18T21:00:00Z',database:'qa',triggers:{},
  functions:Object.fromEntries(deps.map((p,i)=>['public.'+p.function+'(jsonb)',obsFn(String(i%10).repeat(64))]))};
 const {attestation:merged,unresolved}=mergeAttestation(attestation,observation,{'attendance-area-authority':derived['attendance-area-authority']});
 assert.deepEqual(unresolved,[]);
 const source=merged.sources['attendance-area-authority'];
 assert.equal(source.reviewed,false,'el volcado nunca aprueba');
 assert.equal(Object.keys(source.functions).length,8);
 assert.equal(deriveSource({...inputs('attendance-area-authority'),attestation:source}).manifest.installable,false);
 assert.equal(deriveSource({...inputs('attendance-area-authority'),attestation:{...source,reviewed:true}}).manifest.installable,true);
});

test('el volcado informa sobrecargas ambiguas, faltantes, disparadores cambiados o deshabilitados y preserva fuentes ya revisadas',()=>{
 const history=derived['attendance-area-history'],guards=history.preimages.functions;
 const functions=Object.fromEntries(guards.map(p=>[p.signature,obsFn(p.prosrcSha256)]));
 const triggers=Object.fromEntries(history.preimages.triggers.map(t=>[t.relation+':'+t.name,{enabled:'O',type:t.type,function:t.function,conditional:false,arguments:0}]));
 const [first,second]=history.preimages.triggers,changedKey=first.relation+':'+first.name,disabledKey=second.relation+':'+second.name;
 // Un disparador cambiado o deshabilitado (D) queda sin volcar (fail-closed) y bloquea installable.
 const observation={version:ATTESTATION_OBSERVATION_VERSION,functions,triggers:{
  ...triggers,
  [changedKey]:{...triggers[changedKey],type:first.type+1},
  [disabledKey]:{...triggers[disabledKey],enabled:'D'},
 }};
 const {attestation:merged,unresolved}=mergeAttestation(attestation,observation,{'attendance-area-history':history});
 assert.deepEqual(unresolved.map(u=>u.reason).sort(),['changed','disabled']);
 assert.equal(merged.sources['attendance-area-history'].triggers[changedKey],undefined);
 assert.equal(merged.sources['attendance-area-history'].triggers[disabledKey],undefined);
 assert.equal(deriveSource({...inputs('attendance-area-history'),attestation:{...merged.sources['attendance-area-history'],reviewed:true}}).manifest.installable,false);
 const drifted={...functions,[guards[0].signature]:obsFn('f'.repeat(64))};
 const {attestation:bad}=mergeAttestation(attestation,{version:ATTESTATION_OBSERVATION_VERSION,functions:drifted,triggers},{'attendance-area-history':history});
 assert.throws(()=>deriveSource({...inputs('attendance-area-history'),attestation:{...bad.sources['attendance-area-history'],reviewed:true}}),/ATTESTATION_BODY_MISMATCH/);
 const authority=derived['attendance-area-authority'],name=authority.preimages.functions[0].function;
 const two={version:ATTESTATION_OBSERVATION_VERSION,triggers:{},functions:{['public.'+name+'(jsonb)']:obsFn('1'.repeat(64)),['public.'+name+'(text)']:obsFn('2'.repeat(64))}};
 const result=mergeAttestation(attestation,two,{'attendance-area-authority':authority});
 assert.ok(result.unresolved.some(u=>u.function===name&&u.reason==='ambiguous'));
 assert.ok(result.unresolved.some(u=>u.reason==='missing'));
 // Preservar fuentes ya revisadas (Fase 2 incremental) y permitir --source puntual.
 const reviewedAuthority={...attestation,sources:{...attestation.sources,'attendance-area-authority':{functions:{'public.digest(text,text)':obsFn('1'.repeat(64))},triggers:{},reviewed:true}}};
 const incremental=mergeAttestation(reviewedAuthority,{version:ATTESTATION_OBSERVATION_VERSION,functions,triggers},derived);
 assert.equal(incremental.attestation.sources['attendance-area-authority'].reviewed,true);
 assert.ok(incremental.attestation.sources['attendance-area-authority'].functions['public.digest(text,text)']);
 const scoped=mergeAttestation(reviewedAuthority,{version:ATTESTATION_OBSERVATION_VERSION,functions,triggers},derived,{onlySources:['attendance-area-history']});
 assert.deepEqual(scoped.unresolved,[]);
 assert.equal(scoped.attestation.sources['attendance-area-authority'].reviewed,true);
 assert.equal(scoped.attestation.sources['attendance-area-history'].reviewed,false);
});
