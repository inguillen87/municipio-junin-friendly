import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {junin638FileReview,junin638Readiness} from '../assets/payroll-junin-638-review.js';
import {junin638Txt} from '../assets/payroll-junin-638.js';
import {fixedFixture,fixedApprovedRecord,fixedEffects,fixedUuid} from './fixtures/payroll-fixed-novelties-synthetic.js';
function fixture(amounts=['250000','12500']){
 const f=fixedFixture(),period='2026-09-01';f.state.records=amounts.map((amount,i)=>fixedApprovedRecord(i+1,{conceptSourceId:'638',quantityDecimal:null,amountCents:amount,validFrom:period,validTo:null}));
 const list=f.list(period),snapshot={version:'payroll-fixed-junin638.v1',periodMonth:period,snapshotToken:list.snapshotToken,concept:'638',receiver:'AMARU',sourceFormat:{id:1,name:'Formato Junin',filename:'amaru.txt',dniStart:5,dniLength:8,amountStart:44,amountLength:11},format:{recordBytes:55,lineEnding:'CRLF',trailingLineEnding:false},rows:f.state.records.map((r,i)=>({recordId:r.id,version:r.version,proposalId:r.approved.id,contractId:r.subject.contractId,dni:String(12345000+i),amountCents:amounts[i]})),total:amounts.length,effects:fixedEffects};return{list,snapshot};
}
const ready=(list,extra={})=>junin638Readiness({list,canExport:true,readAllowed:true,...extra});
test('summary matches the exact downloadable TXT, including sum, byte size and SHA',async()=>{
 const {snapshot}=fixture(),bytes=junin638Txt(snapshot),r=await junin638FileReview(snapshot,bytes);
 assert.equal(r.records,2);assert.equal(r.totalCents,'262500');assert.equal(r.byteLength,112);assert.equal(r.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(r.filename,'amaru.txt');assert.equal(r.receiverAcceptance,'not_verified');assert.ok(Object.isFrozen(r));
 assert.deepEqual(Object.keys(r).sort(),['version','filename','periodMonth','records','totalCents','byteLength','sha256','recordBytes','lineEnding','trailingLineEnding','receiverAcceptance'].sort());
 assert.doesNotMatch(JSON.stringify(r),/12345000|dni|recordId|proposalId|contractId|snapshotToken|employeeName/);
});
for(const amounts of [['0'],['1'],['9999999999'],Array(500).fill('9999999999')])test('summary uses integer cents without rounding for '+amounts.length+' records',async()=>{
 const {snapshot}=fixture(amounts),bytes=junin638Txt(snapshot),r=await junin638FileReview(snapshot,bytes);
 assert.equal(r.totalCents,String(amounts.reduce((sum,n)=>sum+BigInt(n),0n)));assert.equal(r.byteLength,amounts.length*55+(amounts.length-1)*2);
});
for(const mutate of [b=>{b[5]=57;return b;},b=>b.slice(0,-1),b=>new Uint8Array([...b,13,10]),b=>new Uint8Array([239,187,191,...b]),b=>{b[55]=10;return b;}])test('summary refuses altered fields, missing bytes or changed line conventions',async()=>{
 const {snapshot}=fixture();await assert.rejects(junin638FileReview(snapshot,mutate(junin638Txt(snapshot))),{code:'PAYROLL_FIXED_CONTRACT_DRIFT'});
});
for(const value of [null,'text',new ArrayBuffer(112),new Uint8Array()])test('invalid bytes cannot create a successful summary',async()=>{
 const {snapshot}=fixture();await assert.rejects(junin638FileReview(snapshot,value));
});
for(const count of [0,501])test('empty or excessive export cannot create summary '+count,async()=>{const {snapshot}=fixture(Array(count).fill('1'));await assert.rejects(junin638FileReview(snapshot,junin638Txt(snapshot)));});
for(const periodMonth of ['2026-13-01','2026-02-30','2026-09-02'])test('invalid period is not displayed as a verified file '+periodMonth,async()=>{
 const {snapshot}=fixture(),bytes=junin638Txt(snapshot);snapshot.periodMonth=periodMonth;await assert.rejects(junin638FileReview(snapshot,bytes));
});
test('review snapshots the bytes and aggregate before asynchronous hashing',async()=>{
 const {snapshot}=fixture(),bytes=junin638Txt(snapshot),expected=createHash('sha256').update(bytes).digest('hex'),pending=junin638FileReview(snapshot,bytes);
 bytes.fill(32);snapshot.rows[0].amountCents='0';const r=await pending;assert.equal(r.totalCents,'262500');assert.equal(r.sha256,expected);
});
for(const [extra,code,pattern]of [
 [{readAllowed:false},'access',/permisos/],[{canExport:false},'permission',/falta el permiso de exportación/],
 [{editing:true},'draft',/propuesta local/],[{busy:true},'busy',/operación en curso/],
])test('disabled export explains its cause: '+code,()=>{const r=ready(fixture().list,extra);assert.equal(r.ready,false);assert.equal(r.code,code);assert.match(r.message,pattern);});
test('registry not consulted is distinct from a registry without period',()=>{
 assert.equal(ready(null).code,'query');const {list}=fixture();list.periodMonth=null;assert.equal(ready(list).code,'period');
});
test('approved 638 population ignores visual filters, and never promises valid DNI',()=>{
 const {list}=fixture();const r=ready(list);assert.equal(r.ready,true);assert.match(r.message,/2 novedades 638/);assert.match(r.message,/aunque la búsqueda/);assert.match(r.message,/verifican al descargar/);
});
test('non-638, expired, future and pending entries are not eligible',()=>{
 const {list}=fixture();list.rows[0].approved.values.conceptSourceId='80';list.rows[1].approved.values.validFrom='2026-10-01';assert.equal(ready(list).code,'empty');
 list.rows[1].approved.values.validFrom='2025-01-01';list.rows[1].approved.values.validTo='2026-08-31';assert.equal(ready(list).code,'empty');list.rows[0].approved=null;assert.equal(ready(list).code,'empty');
});
test('one unverified identity cannot silently disappear from a complete TXT',()=>{
 const {list}=fixture();list.rows[0].identityCurrent=false;const r=ready(list);assert.equal(r.ready,false);assert.equal(r.code,'identity');assert.match(r.message,/no se omitirán/);
});
test('partial period coverage remains eligible without prorating its amount',()=>{
 const {list}=fixture();list.rows[0].approved.values.validFrom='2026-09-15';list.rows[0].approved.values.validTo='2026-09-20';assert.equal(ready(list).ready,true);
});
