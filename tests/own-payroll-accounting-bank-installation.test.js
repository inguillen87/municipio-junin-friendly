import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {buildOwnAccountingBankInstallation} from '../scripts/lib/own-accounting-bank-installation.mjs';
import {assertOwnAccountingBankDurability,SQL150_SHA256} from '../scripts/lib/own-accounting-bank-installation.mjs';
import {prepareOwnAccountingBankInstallation} from '../scripts/prepare-own-accounting-bank-installation.mjs';
import {executeOwnAccountingBankInstallation} from '../scripts/install-own-accounting-bank.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);

test('el paquete Vercel incluye las fuentes del upgrade y mantiene fuera respaldos, datos privados y handoff',()=>{
 const rules=read('.vercelignore').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=f=>{let keep=true;for(const rule of rules){const allow=rule.startsWith('!'),p=allow?rule.slice(1):rule;if(p.endsWith('/')?f.startsWith(p):path.matchesGlob(f,p)||!p.includes('/')&&path.matchesGlob(path.basename(f),p))keep=allow;}return keep;};
 const b=prepareOwnAccountingBankInstallation({read:f=>{assert.ok(included(f),'Fuente excluida del build: '+f);return read(f);},sourceCommit});assert.equal(b.sourceHashes['scripts/migrations/150-own-accounting-bank-destinations.sql'],SQL150_SHA256);
 for(const f of ['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/result.json','source.sql.gz','source.sql','nominal.txt','transcripts_audios.json'])assert.equal(included(f),false,'Fuente privada incluida: '+f);
});
test('SQL150 revisable reemplaza exactamente un validador y conserva todos los otros objetos, filas y permisos',()=>{
 const b=buildOwnAccountingBankInstallation({read,sourceCommit});assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.migration.length,2);
 assert.deepEqual({...b.oldPin,sha256:null},{...b.newPin,sha256:null});assert.notEqual(b.oldPin.sha256,b.newPin.sha256);assert.equal(b.currentPins.length,13);
 assert.match(b.installation.join('\n'),/ACCOUNTING_BANK_PRIOR_STATE_CHANGED/);assert.match(b.durableProof,/'newTables',0,'newFunctions',0,'replacedFunctions',1/);
 assert.match(b.before,/own_accounting_bank_no_excluded_table/);assert.ok(!b.before.includes("p.proname LIKE 'own_accounting_%'"));assert.ok(!b.migration.join('\n').match(/\b(?:INSERT|UPDATE|DELETE|GRANT|CREATE TABLE)\b/i));
});
const batch=()=>prepareOwnAccountingBankInstallation({read,sourceCommit});
function proof(){return {version:'own-accounting-bank-installation.v1',sourceCommit,migrationSha256:SQL150_SHA256,validatorSha256:batch().newPin.sha256,newTables:0,newFunctions:0,replacedFunctions:1,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,eventRows:12,preservationSha256:'b'.repeat(64),beforeFingerprint:'b'.repeat(64)};}
function durable(){const {beforeFingerprint,...v}=proof();return v;}
test('la verificación durable exige el mismo historial existente y cero operaciones municipales',()=>{
 const args={sourceCommit,validatorSha256:batch().newPin.sha256};assert.equal(assertOwnAccountingBankDurability({...args,installed:proof(),durable:durable()}).priorStatePreserved,true);
 for(const [k,v]of [['eventRows',13],['businessWrites',1],['replacedFunctions',2],['validatorSha256','c'.repeat(64)],['preservationSha256','c'.repeat(64)]])assert.throws(()=>assertOwnAccountingBankDurability({...args,installed:proof(),durable:{...durable(),[k]:v}}));
 assert.throws(()=>assertOwnAccountingBankDurability({...args,installed:{...proof(),beforeFingerprint:'c'.repeat(64)},durable:durable()}),/PRIOR_STATE_CHANGED/);
});
function clientFixture({uncertain=false,drift=false}={}){
 const b=batch(),calls=[],records=[],sql={query:s=>s,transaction:async(s,options)=>{calls.push({s,options});if(s.at(-1)==='ROLLBACK')return [...s.slice(0,-2).map(()=>[]),[{proof:proof()}],[]];if(s.at(-1)===b.proof){if(uncertain)throw Error('UNKNOWN_COMMIT');return [...s.slice(0,-1).map(()=>[]),[{proof:proof()}]];}if(s.at(-1)===b.durableProof)return [...s.slice(0,-1).map(()=>[]),[{proof:durable()}]];return s.map(()=>[]);}};
 return {b,calls,records,client:async()=>({sql,target:{...b.targets[0],host:drift?'foreign.invalid':b.targets[0].host}})};
}
test('el upgrade ensaya rollback, comprueba el validador anterior y verifica durabilidad en otra transacción',async()=>{
 const f=clientFixture();const r=await executeOwnAccountingBankInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(structuredClone(v))});assert.equal(r.durabilityVerified,true);assert.equal(f.calls.length,5);assert.equal(f.calls[1].s.at(-1),'ROLLBACK');assert.equal(f.calls[2].options.readOnly,true);assert.equal(f.calls[4].options.readOnly,true);assert.equal(f.records[0].durabilityVerified,false);assert.equal(f.records[1].durabilityVerified,true);
});
test('un COMMIT incierto no se repite y un destino ajeno no recibe SQL',async()=>{
 const f=clientFixture({uncertain:true});await assert.rejects(executeOwnAccountingBankInstallation({batch:f.b,major:17,client:f.client,record:v=>f.records.push(v)}),/UNKNOWN_COMMIT/);assert.equal(f.calls.length,4);assert.equal(f.records.length,0);
 const foreign=clientFixture({drift:true});await assert.rejects(executeOwnAccountingBankInstallation({batch:foreign.b,major:17,client:foreign.client,record:v=>foreign.records.push(v)}),/DESTINATION_DRIFT/);assert.equal(foreign.calls.length,0);
});
test('un lote alterado, firma diferente o código fuente sin revisar falla antes de producir SQL ejecutable',()=>{
 assert.throws(()=>buildOwnAccountingBankInstallation({read:f=>read(f)+(f.endsWith('150-own-accounting-bank-destinations.sql')?'\n-- drift':''),sourceCommit}),/REVIEWED_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnAccountingBankInstallation({read,sourceCommit:'invalid'}));
});
