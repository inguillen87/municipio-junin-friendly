import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {bankAccountsDefinition,bankAccountChannel,bankAccountsHash,BANK_PAYMENT_CHANNEL_VERSION} from '../assets/own-bank-accounts-model.js';
import {syntheticBankAccountsDefinition,syntheticCbu,syntheticBankAccountsCommand} from './fixtures/own-bank-accounts-synthetic.js';
import {bankOutputFixture} from './fixtures/own-bank-output-synthetic.js';
import {prepareBankControl,prepareBankOutput,createBankOutputTxt,createBankOutputCsv,bankOutputPage,sameBankOutput} from '../assets/own-bank-output-model.js';
import {prepareCredicoopOutput,createCredicoopTxt} from '../assets/own-bank-output-credicoop.js';
import {bankControlTables,createBankControlXlsx,createBankControlCsv} from '../assets/own-bank-output-export.js';
const extend=(account,paymentChannel)=>Object.assign(account,{paymentChannelVersion:BANK_PAYMENT_CHANNEL_VERSION,paymentChannel});
const control=f=>prepareBankControl(f.batch,f.accounts,{currency:'ARS',creditDate:f.profile.creditDate},f.closes);
const credicoop=f=>prepareCredicoopOutput(f.batch,f.accounts,{jurisdictionCode:'42',accountType:'all',currency:'ARS',creditDate:f.profile.creditDate,profileConfirmed:true,allowRepeatedDestinations:false},f.closes);
test('older accounts, pending command hashes and absent channel remain unchanged without defaults',async()=>{
 const body=syntheticBankAccountsCommand(),before=JSON.stringify(body),hash=await bankAccountsHash(body);
 assert.deepEqual(bankAccountsDefinition(body.definition),body.definition);assert.deepEqual(bankAccountChannel(body.definition.accounts[0]),{});
 assert.equal(JSON.stringify(body),before);assert.equal(await bankAccountsHash(body),hash);
});
test('declared route is separate from receiving bank, account number and CBU institution',()=>{
 const d=syntheticBankAccountsDefinition(),r=d.accounts[0];r.accountType='CA';extend(r,'credicoop_transfers');
 for(const prefix of ['9990001','0110001','1910001','0170001']){r.cbu=syntheticCbu(prefix);r.bankLabel='Entidad declarada independiente';assert.deepEqual(bankAccountsDefinition(d),d);}
 assert.equal(bankAccountChannel(r).paymentChannel,'credicoop_transfers');
});
test('partial extension, unknown version, coerced keys and inferred savings type fail',()=>{
 for(const change of [{paymentChannel:'bank_payroll'},{paymentChannelVersion:BANK_PAYMENT_CHANNEL_VERSION},{paymentChannelVersion:'wrong',paymentChannel:null},{paymentChannelVersion:BANK_PAYMENT_CHANNEL_VERSION,paymentChannel:['bank_payroll']},{paymentChannelVersion:BANK_PAYMENT_CHANNEL_VERSION,paymentChannel:1},{paymentChannelVersion:BANK_PAYMENT_CHANNEL_VERSION,paymentChannel:'credicoop_transfers'}]){
  const d=syntheticBankAccountsDefinition();Object.assign(d.accounts[0],change);assert.throws(()=>bankAccountsDefinition(d));
 }
 const d=syntheticBankAccountsDefinition();extend(d.accounts[0],null);assert.equal(bankAccountsDefinition(d).accounts[0].paymentChannel,null);
});
test('complete control keeps declared channels on every page; Excel and CSV remain literal and exact',async()=>{
 const f=bankOutputFixture(35);for(const [i,a]of f.accounts.configuration.definition.accounts.entries()){a.accountType='CA';extend(a,i===34?'credicoop_transfers':'bank_payroll');}
 const r=await control(f),table=bankControlTables(r);assert.equal(r.recordCount,35);assert.equal(bankOutputPage(r,'sintético 34').filtered,1);
 assert.equal(table.detail.length,36);assert.equal(table.detail[0].at(-1),'Canal de acreditación declarado');assert.match(table.detail.at(-1).at(-1),/Transferencias varias/);
 const files=unzipSync(createBankControlXlsx(r).bytes),xml=strFromU8(files['xl/worksheets/sheet1.xml']);assert.equal((xml.match(/<row /g)||[]).length,36);assert.match(xml,/Transferencias varias/);assert.doesNotMatch(xml,/<f[ >]/);
 const csv=new TextDecoder().decode(createBankControlCsv(r).bytes);assert.equal(csv.trimEnd().split('\r\n').length,36);assert.match(csv,/Transferencias varias/);assert.equal(table.totalCents,r.totalCents);
});
test('a declared Transferencias varias destination is never silently included in a BNA file',async()=>{
 const f=bankOutputFixture(2),a=f.accounts.configuration.definition.accounts[1];a.accountType='CA';extend(a,'credicoop_transfers');
 const r=await prepareBankOutput(f.batch,f.accounts,f.profile,f.closes);assert.equal(r.recordCount,2);assert.equal(r.selectedCount,1);assert.equal(r.rows[1].selected,false);assert.match(r.rows[1].selectionReason,/Otro canal declarado/);
 assert.equal(createBankOutputTxt(r).recordCount,1);assert.equal(bankControlTables(await control(f)).detail.length,3);
 const csv=new TextDecoder().decode(createBankOutputCsv(r).bytes);assert.match(csv,/Canal de acreditación declarado/);assert.match(csv,/Transferencias varias/);assert.equal(csv.trimEnd().split('\r\n').length,3);
});
test('new explicit pending channel blocks the full TXT even if its row is outside the bank or jurisdiction',async()=>{
 const f=bankOutputFixture(35);extend(f.accounts.configuration.definition.accounts[34],null);
 const r=await prepareBankOutput(f.batch,f.accounts,f.profile,f.closes);assert.equal(bankOutputPage(r,'no existe').filtered,0);assert.ok(r.issues.includes('PAYMENT_CHANNEL_UNKNOWN'));assert.equal(r.ready,false);assert.throws(()=>createBankOutputTxt(r));
 assert.equal(r.rows[34].selected,false);assert.match(r.rows[34].selectionReason,/Canal de acreditación pendiente/);
 const c=await credicoop(f);assert.ok(c.issues.includes('PAYMENT_CHANNEL_UNKNOWN'));assert.throws(()=>createCredicoopTxt(c));
 assert.equal(bankControlTables(await control(f)).detail.length,36);
});
test('Credicoop direct-account output respects the separately declared channel and keeps exclusion reasons',async()=>{
 const f=bankOutputFixture(2);for(const [i,a]of f.accounts.configuration.definition.accounts.entries()){a.cbu=syntheticCbu('1910001',String(i+1).padStart(13,'0'));a.accountType='CA';a.accountNumber='001-00000'+(i+1)+'-0';extend(a,i?'credicoop_transfers':'bank_payroll');}
 const r=await credicoop(f);assert.equal(r.selectedCount,1);assert.equal(r.otherChannelCount,1);assert.equal(r.otherAccountTypeCount,0);assert.equal(r.rows[1].selected,false);assert.match(r.rows[1].selectionReason,/Otro canal declarado/);assert.equal(createCredicoopTxt(r).recordCount,1);
});
test('an independently changed channel changes the complete review fingerprint and cannot reuse prepared bytes',async()=>{
 const f=bankOutputFixture(2);for(const a of f.accounts.configuration.definition.accounts){a.accountType='CA';extend(a,'bank_payroll');}
 const old=await prepareBankOutput(f.batch,f.accounts,f.profile,f.closes);extend(f.accounts.configuration.definition.accounts[1],'credicoop_transfers');
 const next=await prepareBankOutput(f.batch,f.accounts,f.profile,f.closes);assert.equal(sameBankOutput(old,next),false);assert.notEqual(old.fingerprint,next.fingerprint);assert.equal(next.selectedCount,1);
});
