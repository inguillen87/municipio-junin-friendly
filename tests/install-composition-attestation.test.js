import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMPOSITION_ORDER,compositionPaths,deriveSource,DECLARED_DEPENDENCY_SIGNATURES} from '../scripts/lib/install-composition-source.mjs';
import {attestationQuery,mergeAttestation,observationTargets,ATTESTATION_OBSERVATION_VERSION} from '../scripts/lib/install-composition-attestation.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const derived=Object.fromEntries(COMPOSITION_ORDER.map(n=>[n,JSON.parse(read(compositionPaths(n).outputManifest))]));
const inputs=name=>{const paths=compositionPaths(name),manifestText=read(paths.manifest);return {name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText};};
const attestation=JSON.parse(read('scripts/candidates/install-composition-attestation-v1.json'));
const obsFn=(prosrcSha256,over={})=>({owner:'qa_owner',acl:'<NULL>',prosrcSha256,secdef:true,config:['search_path=pg_catalog, public, pg_temp'],lang:'plpgsql',bin:'',volatile:'v',strict:false,parallel:'u',leakproof:false,...over});

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
 for(const expression of ['pg_catalog.sha256(pg_catalog.convert_to(','pg_catalog.pg_get_userbyid(',"'<NULL>'",'prosecdef','proconfig','probin','provolatile','proisstrict','proparallel','proleakproof'])
  assert.ok(sql.includes(expression)&&derivedSql.includes(expression),expression);
});

test('el volcado resuelve dependencias por nombre, nunca marca revisado y una atestación revisada habilita authority',()=>{
 const deps=derived['attendance-area-authority'].preimages.functions;
 const observation={version:ATTESTATION_OBSERVATION_VERSION,observedAt:'2026-11-18T21:00:00Z',database:'qa',triggers:{},
  functions:Object.fromEntries(deps.map((p,i)=>[p.signature??('public.'+p.function+'(jsonb)'),obsFn(String(i%10).repeat(64))]))};
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

// Codex (PR 270, 6996579811): en el destino digest tiene dos sobrecargas, (bytea,text) y (text,text), y authority quedó
// «ambiguous». Cada fuente fija las firmas de sus llamadas reales; una dependencia que siga sólo por nombre con varias
// sobrecargas sigue siendo ambigua (prueba anterior).
const digestCalls=source=>{
 const out=[];
 for(const m of source.matchAll(/(?<![a-z_.])(?:public\.)?digest\(/g)){
  let depth=1,j=m.index+m[0].length,first='',done=false;
  for(;j<source.length&&depth;j++){const c=source[j];if(c==='(')depth++;else if(c===')')depth--;if(depth===1&&c===','&&!done){done=true;continue;}if(!done&&depth>0)first+=c;}
  out.push(first.replace(/\s+/g,' ').trim());
 }
 return out;
};
// Tipo del primer argumento. Una llamada nueva que no encaje en ninguna regla hace fallar la prueba: hay que revisarla a mano.
const digestType=arg=>{
 if(/^convert_to\(/.test(arg)||/^decode\(/.test(arg)||/^string_agg\([a-z_.]+,decode\(/.test(arg)||/^substring\(q\.records_payload FROM /.test(arg))return 'bytea';
 if(/::text$/.test(arg)||/^'[^']*'\|\|/.test(arg)||/^concat_ws\(/.test(arg)||/::text\|\|/.test(arg))return 'text';
 return null;
};
test('Codex (6996579811): cada fuente fija las sobrecargas de digest que usan sus llamadas reales',()=>{
 for(const name of COMPOSITION_ORDER){
  const calls=digestCalls(inputs(name).source),types=calls.map(digestType);
  assert.ok(types.every(Boolean),name+': llamada a digest sin clasificar '+JSON.stringify(calls.filter((c,i)=>!types[i])));
  const used=[...new Set(types)].sort().map(t=>'public.digest('+t+',text)');
  assert.deepEqual([...(DECLARED_DEPENDENCY_SIGNATURES[name]?.digest??[])].sort(),used,name);
  const pins=derived[name].preimages.functions.filter(p=>p.function==='digest');
  assert.deepEqual(pins.map(p=>p.signature).sort(),used,name+': el manifiesto derivado fija esas firmas y ninguna por nombre');
 }
 assert.deepEqual(DECLARED_DEPENDENCY_SIGNATURES['attendance-area-authority'].digest,['public.digest(text,text)']);
});
test('Codex (6996579811): con las dos sobrecargas de digest en el destino, authority se resuelve sin ambigüedad y sólo atesta (text,text)',()=>{
 const authority=derived['attendance-area-authority'],workdays=derived['attendance-area-workdays'];
 const functions={};
 for(const p of authority.preimages.functions)functions[p.signature??('public.'+p.function+'(jsonb)')]=obsFn('1'.repeat(64));
 functions['public.digest(bytea,text)']=obsFn('2'.repeat(64),{lang:'c',bin:'$libdir/pgcrypto',secdef:false,config:[],volatile:'i',strict:true,parallel:'s'});
 functions['public.digest(text,text)']=obsFn('3'.repeat(64),{lang:'c',bin:'$libdir/pgcrypto',secdef:false,config:[],volatile:'i',strict:true,parallel:'s'});
 const {attestation:merged,unresolved}=mergeAttestation(attestation,{version:ATTESTATION_OBSERVATION_VERSION,functions,triggers:{}},{'attendance-area-authority':authority},{onlySources:['attendance-area-authority']});
 assert.deepEqual(unresolved,[]);
 const source=merged.sources['attendance-area-authority'];
 assert.ok(Object.hasOwn(source.functions,'public.digest(text,text)'));
 assert.ok(!Object.hasOwn(source.functions,'public.digest(bytea,text)'),'la sobrecarga que authority no usa no se atesta');
 assert.equal(deriveSource({...inputs('attendance-area-authority'),attestation:{...source,reviewed:true}}).manifest.installable,true);
 const wd=mergeAttestation(attestation,{version:ATTESTATION_OBSERVATION_VERSION,functions,triggers:{}},{'attendance-area-workdays':workdays},{onlySources:['attendance-area-workdays']});
 for(const signature of ['public.digest(bytea,text)','public.digest(text,text)'])
  assert.ok(Object.hasOwn(wd.attestation.sources['attendance-area-workdays'].functions,signature),'workdays atesta '+signature);
});
