import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareOwnBankAccountsInstallation} from '../scripts/prepare-own-bank-accounts-installation.mjs';
import {executeOwnBankAccountsInstallation} from '../scripts/install-own-bank-accounts-installation.mjs';
import {assertOwnBankAccountsDurability,SQL149_SHA256} from '../scripts/lib/own-bank-accounts-installation.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const batch=()=>prepareOwnBankAccountsInstallation({read,sourceCommit});
const proof=()=>({version:'own-bank-accounts-installation.v1',sourceCommit,migrationSha256:SQL149_SHA256,newTables:1,newFunctions:14,runtimeFacades:4,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,preservationSha256:'b'.repeat(64),beforeFingerprint:'b'.repeat(64)});
const durable=()=>{const {beforeFingerprint,...v}=proof();return v;};
test('lote fija fuente, metadatos, destino exacto y conserva funciones/datos sin comandos municipales',()=>{
 const b=batch();assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.ownPins.length,14);assert.equal(b.prerequisitePins.length,7);assert.equal(b.ownPins.filter(p=>p.runtime).length,4);
 assert.deepEqual(b.targets.map(t=>t.major),[17,18]);for(const t of b.targets){assert.match(t.preflight.join('\n'),/neon.endpoint_id/);assert.match(t.preflight.join('\n'),/BANK_ACCOUNTS_OBJECT_CONFLICT/);assert.match(t.installation.join('\n'),/BANK_ACCOUNTS_PRIOR_STATE_CHANGED/);assert.match(t.durableVerification.join('\n'),/BANK_ACCOUNTS_TABLE_SECURITY/);}
 assert.throws(()=>prepareOwnBankAccountsInstallation({read:f=>read(f)+(f.endsWith('149-own-bank-accounts.sql')?'\n-- drift':''),sourceCommit}),/REVIEWED_SOURCE_CHANGED/);
});
test('prueba de durabilidad rechaza datos anteriores diferentes, filas reales y prueba alterada',()=>{
 assert.equal(assertOwnBankAccountsDurability({installed:proof(),durable:durable(),sourceCommit}).priorStatePreserved,true);
 for(const [k,v]of[['businessWrites',1],['eventRows',1],['roleAssignmentsAdded',1],['migrationSha256','c'.repeat(64)],['preservationSha256','c'.repeat(64)]])assert.throws(()=>assertOwnBankAccountsDurability({installed:proof(),durable:{...durable(),[k]:v},sourceCommit}));
 assert.throws(()=>assertOwnBankAccountsDurability({installed:{...proof(),beforeFingerprint:'c'.repeat(64)},durable:durable(),sourceCommit}),/PRIOR_STATE_CHANGED/);
});
function fixture({failInstall=false,drift=false}={}){
 const b=batch(),calls=[],records=[],sql={query:s=>s,transaction:async(s,options)=>{calls.push({s,options});if(s.at(-1)==='ROLLBACK')return [...s.slice(0,-2).map(()=>[]),[{proof:proof()}],[]];if(s.at(-1)===b.proof){if(failInstall)throw Error('UNKNOWN_COMMIT');return [...s.slice(0,-1).map(()=>[]),[{proof:proof()}]];}if(s.at(-1)===b.durableProof)return [...s.slice(0,-1).map(()=>[]),[{proof:durable()}]];return s.map(()=>[]);}};
 return {b,calls,records,client:async()=>({sql,target:{...b.targets[0],host:drift?'foreign.invalid':b.targets[0].host}})};
}
test('instalación ensaya rollback, verifica ausencia, guarda y verifica en otra transacción',async()=>{
 const f=fixture();const r=await executeOwnBankAccountsInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(structuredClone(v))});assert.equal(r.durabilityVerified,true);assert.equal(f.calls.length,5);assert.equal(f.calls[1].s.at(-1),'ROLLBACK');assert.equal(f.calls[2].options.readOnly,true);assert.equal(f.calls[4].options.readOnly,true);assert.equal(f.records[0].durabilityVerified,false);assert.equal(f.records[1].durabilityVerified,true);
});
test('COMMIT incierto no se repite ni se declara instalado',async()=>{
 const f=fixture({failInstall:true});await assert.rejects(executeOwnBankAccountsInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(v)}),/UNKNOWN_COMMIT/);assert.equal(f.calls.length,4);assert.equal(f.records.length,0);
});
test('destino ajeno falla antes de ejecutar cualquier consulta',async()=>{
 const f=fixture({drift:true});await assert.rejects(executeOwnBankAccountsInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(v)}),/DESTINATION_DRIFT/);assert.equal(f.calls.length,0);
});
