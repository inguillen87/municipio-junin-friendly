import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareOwnImputationInstallation} from '../scripts/prepare-own-imputation-installation.mjs';
import {executeOwnImputationInstallation} from '../scripts/install-own-imputation.mjs';
import {assertOwnImputationDurability,SQL148_SHA256} from '../scripts/lib/own-imputation-installation.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const batch=()=>prepareOwnImputationInstallation({read,sourceCommit});
const proof=()=>({version:'own-imputation-installation.v1',sourceCommit,migrationSha256:SQL148_SHA256,newTables:1,newFunctions:11,runtimeFacades:5,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,preservationSha256:'b'.repeat(64),beforeFingerprint:'b'.repeat(64)});
const durable=()=>{const {beforeFingerprint,...v}=proof();return v;};
test('lote fija SQL148, metadatos privados y las dos bases existentes sin conectar ni ejecutar comandos municipales',()=>{
 const b=batch();assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.ownPins.length,11);assert.equal(b.prerequisitePins.length,12);assert.equal(b.ownPins.filter(p=>p.runtime).length,5);assert.equal(b.sourceHashes['scripts/migrations/148-own-payroll-imputation.sql'],SQL148_SHA256);
 assert.deepEqual(b.targets.map(t=>t.major),[17,18]);for(const t of b.targets){assert.match(t.preflight.join('\n'),/neon.endpoint_id/);assert.match(t.preflight.join('\n'),/IMPUTATION_OBJECT_CONFLICT/);assert.match(t.installation.join('\n'),/IMPUTATION_PRIOR_STATE_CHANGED/);assert.match(t.durableVerification.join('\n'),/IMPUTATION_TABLE_SECURITY/);assert.match(t.durableVerification.join('\n'),/IMPUTATION_IMMUTABLE_GUARD/);}
 assert.throws(()=>prepareOwnImputationInstallation({read:f=>read(f)+(f.endsWith('148-own-payroll-imputation.sql')?'\n-- drift':''),sourceCommit}),/REVIEWED_SOURCE_CHANGED/);
});
test('durabilidad rechaza cambios anteriores, filas de negocio, permisos nuevos y huellas distintas',()=>{
 assert.equal(assertOwnImputationDurability({installed:proof(),durable:durable(),sourceCommit}).priorStatePreserved,true);
 for(const [k,v]of[['businessWrites',1],['eventRows',1],['roleAssignmentsAdded',1],['migrationSha256','c'.repeat(64)],['preservationSha256','c'.repeat(64)]])assert.throws(()=>assertOwnImputationDurability({installed:proof(),durable:{...durable(),[k]:v},sourceCommit}));
 assert.throws(()=>assertOwnImputationDurability({installed:{...proof(),beforeFingerprint:'c'.repeat(64)},durable:durable(),sourceCommit}));
});
function fixture({failInstall=false,drift=false,failDurable=false}={}){
 const b=batch(),calls=[],records=[],sql={query:s=>s,transaction:async(s,options)=>{calls.push({s,options});if(s.at(-1)==='ROLLBACK')return [...s.slice(0,-2).map(()=>[]),[{proof:proof()}],[]];if(s.at(-1)===b.proof){if(failInstall)throw Error('UNKNOWN_COMMIT');return [...s.slice(0,-1).map(()=>[]),[{proof:proof()}]];}if(s.at(-1)===b.durableProof){if(failDurable)throw Error('DURABILITY_NOT_VERIFIED');return [...s.slice(0,-1).map(()=>[]),[{proof:durable()}]];}return s.map(()=>[]);}};
 return{b,calls,records,client:async()=>({sql,target:{...b.targets[0],host:drift?'foreign.invalid':b.targets[0].host}})};
}
test('instalación ensaya rollback, comprueba ausencia, instala y verifica durabilidad en otra transacción',async()=>{
 const f=fixture(),r=await executeOwnImputationInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(structuredClone(v))});assert.equal(r.durabilityVerified,true);assert.equal(f.calls.length,5);assert.equal(f.calls[1].s.at(-1),'ROLLBACK');assert.equal(f.calls[2].options.readOnly,true);assert.equal(f.calls[4].options.readOnly,true);assert.equal(f.records[0].durabilityVerified,false);assert.equal(f.records[1].durabilityVerified,true);
});
test('COMMIT incierto no se repite ni se declara instalado',async()=>{
 const f=fixture({failInstall:true});await assert.rejects(executeOwnImputationInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(v)}),/UNKNOWN_COMMIT/);assert.equal(f.calls.length,4);assert.equal(f.records.length,0);
});
test('destino ajeno falla antes de ejecutar cualquier consulta',async()=>{
 const f=fixture({drift:true});await assert.rejects(executeOwnImputationInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(v)}),/DESTINATION_DRIFT/);assert.equal(f.calls.length,0);
});
test('instalado sin verificación durable conserva evidencia y no reintenta la instalación',async()=>{
 const f=fixture({failDurable:true});await assert.rejects(executeOwnImputationInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(structuredClone(v))}),/DURABILITY_NOT_VERIFIED/);assert.equal(f.calls.length,5);assert.equal(f.records.length,1);assert.equal(f.records[0].installed,true);assert.equal(f.records[0].durabilityVerified,false);
});
