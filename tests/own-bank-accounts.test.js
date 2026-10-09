import test from 'node:test';
import assert from 'node:assert/strict';
import { bankAccountCbu, bankAccountsDefinition, bankAccountsHistory, bankAccountsLinkedDefinition, bankAccountsChanges, bankAccountsDetail, verifiedBankAccountsReceipt, bankAccountsAttempt, bankAccountsBootstrap } from '../assets/own-bank-accounts-model.js';
import { syntheticCbu, syntheticBankAccountsDefinition as definition, syntheticBankAccountsSources as sources, syntheticBankAccountsDetail as detail, syntheticBankAccountsReceipt as receipt, syntheticBankAccountsBootstrap as bootstrap, bankAccountsIds as ids } from './fixtures/own-bank-accounts-synthetic.js';
const uid = n => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('CBU verifica ambos bloques; conserva todos los ceros y nunca certifica titularidad', () => {
 const v = syntheticCbu(); assert.equal(v.length, 22); assert.equal(bankAccountCbu(v), true);
 for (const value of [null, Number(v), v + ' ', '0'.repeat(22), v.slice(1), v.slice(0,7) + ((Number(v[7])+1)%10) + v.slice(8), v.slice(0,21) + ((Number(v[21])+1)%10)]) assert.equal(bankAccountCbu(value), false);
 assert.equal(bankAccountsDefinition(definition()).accounts[0].cbu, v);
});
test('tipo no informado, ceros del número, moneda y constancia se mantienen separados', () => {
 const d = definition(), result = bankAccountsDefinition(d); assert.deepEqual(result, d); assert.equal(result.accounts[0].accountType, null); assert.equal(result.accounts[0].accountNumber,'00001/02');
 for (const [field, value] of [['accountType',''],['currency',null],['currency','PESOS'],['accountNumber',0],['cbu',Number(d.accounts[0].cbu)],['documentReference',''],['bankLabel','<b>bank</b>'],['validFrom','2026-02-30'],['validUntil','2026-09-30'],['status','deleted']]) { const copy=structuredClone(d);copy.accounts[0][field]=value;assert.throws(()=>bankAccountsDefinition(copy)); }
 const extra=definition();extra.accounts[0].dni='1';assert.throws(()=>bankAccountsDefinition(extra));
});
test('vigencias inclusivas no se superponen; mismo CBU en otro contrato no inventa una restricción', () => {
 const d=definition(), next={...d.accounts[0],id:uid(1),validFrom:'2026-11-01'};d.accounts.push(next);assert.throws(()=>bankAccountsDefinition(d),/superponen/);
 d.accounts[0].validUntil='2026-10-31';assert.equal(bankAccountsDefinition(d).accounts.length,2);d.accounts[0].validUntil='2026-11-01';assert.throws(()=>bankAccountsDefinition(d),/superponen/);
 next.contractId=uid(2);assert.equal(bankAccountsDefinition(d).accounts.length,2);next.contractId=ids.contract;next.status='withdrawn';assert.equal(bankAccountsDefinition(d).accounts.length,2);
});
test('corrección y retiro versionados conservan referencia y contrato; no borran el historial', () => {
 const old=definition(), next=definition();next.accounts[0].cbu=syntheticCbu('9990001','0000000000002');next.accounts[0].documentReference='Constancia sintética corregida';bankAccountsHistory(old,next);assert.equal(bankAccountsChanges(old,next).length,1);assert.equal(old.accounts[0].cbu,syntheticCbu());
 next.accounts[0].contractId=uid(2);assert.throws(()=>bankAccountsHistory(old,next),/Conservá/);next.accounts[0].contractId=ids.contract;next.accounts[0].id=uid(3);assert.throws(()=>bankAccountsHistory(old,next),/Conservá/);
});
test('fuente propia completa; una identidad archivada sólo conserva o retira una cuenta intacta', () => {
 const old=definition(), archived={...sources(),contracts:[]};assert.deepEqual(bankAccountsLinkedDefinition(old,sources()),old);assert.throws(()=>bankAccountsLinkedDefinition(old,archived),/padrón propio/);
 assert.deepEqual(bankAccountsLinkedDefinition(old,archived,old),old);const withdrawn=definition();withdrawn.accounts[0].status='withdrawn';bankAccountsLinkedDefinition(withdrawn,archived,old);
 withdrawn.accounts[0].bankLabel='Corrección sin fuente';assert.throws(()=>bankAccountsLinkedDefinition(withdrawn,archived,old),/padrón propio/);
});
test('consulta y propuesta completas con más de una página, sin reducir por filtros', async () => {
 const d=await detail();d.body.definition.accounts=[];d.sources.contracts=[];
 for(let i=1;i<=60;i++){const row={...definition().accounts[0],id:uid(i),contractId:uid(i+100)};d.body.definition.accounts.push(row);d.sources.contracts.push({...sources().contracts[0],contractId:row.contractId,registrationId:uid(i+200),employeeNumber:'SYN-'+i});}
 const {bankAccountsHash}=await import('../assets/own-bank-accounts-model.js');d.proposal.accountCount=60;d.proposal.requestSha256=await bankAccountsHash(d.body);await bankAccountsDetail(d);assert.equal(d.body.definition.accounts.length,60);
 const partial=structuredClone(d);partial.body.definition.accounts.pop();await assert.rejects(bankAccountsDetail(partial));const b=bootstrap();b.complete=false;assert.throws(()=>bankAccountsBootstrap(b));
});
test('límites de cuenta y fuente fallan completos; ningún truncado se admite', () => { const d=definition();d.accounts=Array.from({length:10001},(_,i)=>({...d.accounts[0],id:uid(i)}));assert.throws(()=>bankAccountsDefinition(d),/capacidad/); });
test('comprobante y tentativa congelados conservan contenido original y nunca informan transferencia',async()=>{const r=await receipt(),a=bankAccountsAttempt(ids.key,r.body,'scope');await verifiedBankAccountsReceipt(r,a);assert.equal(Object.isFrozen(a.body.definition.accounts[0]),true);for(const patch of [{transferGenerated:true},{paymentExecuted:true},{requestSha256:'f'.repeat(64)},{requestKey:uid(1)}])await assert.rejects(verifiedBankAccountsReceipt({...r,...patch},a));});
