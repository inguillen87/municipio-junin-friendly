// Filesystem/source contracts only. No QA, SQL or installation module imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ownAccountingImputation190SourceProjection as p} from './fixtures/own-accounting-imputation-190-source-projection.js';
import {projectOwnCloseBrowserSourceToParent} from './fixtures/own-payroll-annulment-preparation-source-projection.js';
import {OWN_NATIVE645_CAUSAL_SOURCE_PINS,projectOwnNative645RawSourceToParent} from './fixtures/native645-causal-source-projection.js';
const raw=file=>projectOwnNative645RawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url))),read=file=>raw(file).toString('utf8'),hash=v=>createHash('sha256').update(v).digest('hex');

test('accounting/imputation190 private overlay pins whole sources and reverses each complete parent target',()=>{
 for(const target of p.targets){
  let source=Buffer.from(projectOwnCloseBrowserSourceToParent(target.path,raw(target.path).toString('utf8')),'utf8');
  if(target.path==='scripts/verify-own-payroll-full-capacity.mjs'){
   const alias='export {entries as OWN_FULL_CAPACITY_190_QA_ENTRIES};\n',text=source.toString('utf8');
   assert.equal(text.split(alias).length,2,'only the shared entry export may extend the complete original wrapper');
   source=Buffer.from(text.replace(alias,''));
  }
  assert.equal(hash(source),target.afterSha256,target.path);
  for(const op of [...target.inverse].reverse()){
   const after=Buffer.from(op.afterBase64,'base64'),before=Buffer.from(op.beforeBase64,'base64');
   assert.deepEqual(source.subarray(op.afterOffset,op.afterOffset+after.length),after,target.path);
   source=Buffer.concat([source.subarray(0,op.afterOffset),before,source.subarray(op.afterOffset+after.length)]);
  }
  assert.equal(hash(source),target.beforeSha256,'complete parent projection '+target.path);
 }
 for(const [file,digest]of Object.entries(p.dependencies))assert.equal(hash(raw(file)),digest,file);
});

test('tail derives19 monetary destinations and855 assignments from the same verified captured group',()=>{
 const source=read('scripts/lib/own-accounting-imputation-190-continuation.mjs');
 for(const token of ['await verifiedOwnCloseReceipt(closed)','ownClosedJurisdiction(e,s.version).code','ACCOUNTING190_CAPTURED_JURISDICTION','destinations.size,19','money,16245','auxiliary,855','second.saved.inputSha256','second.saved.resultSha256','second.bodySha256','second.body.liquidationDate','creditorReference:null','bankAccountReference:null','bankReference:null',"validFrom:s.period+'-01',validUntil:s.period+'-31'",'prepareAccounting(boot,definition','mappingBody.reviewConfirmed,false','decideAccounting(reviewBoot,mappingDetail','mappingDecision.reviewConfirmed,true'])assert.ok(source.includes(token),token);
 for(const table of ['own_payroll_accounting_event','own_payroll_imputation_event','own_payroll_journal_event'])assert.ok(source.includes(table),table);
 assert.ok(source.includes('await sameStateReject(action,predicate,label)'));assert.ok(source.includes('assert.deepEqual(await ledgerState(),before'));
 for(const token of ['QA_M7_IMPUTATION190_LATE_FAULT','qa_imputation190_late_fault AFTER INSERT ON own_payroll_imputation_event',"'SELECT own_imputation_command_full_v1('+sqlJson(employeeContext(maker.principal,maker.session))",'sqlJson(imputationBody)',"sqlLiteral(imputationKey)+'::uuid)'",'finally{await db.run(\'DROP TRIGGER qa_imputation190_late_fault'])assert.ok(source.includes(token),token);
 assert.ok(!/ALTER\s+|CREATE SCHEMA|CREATE DATABASE|GRANT\s+|capability_override|ownerAdoptionQaTransport\(|child_process|spawn\(|execFile\(/.test(source));
});

test('same190 continuation owns one canonical reopen and both historical tails',()=>{
 const main=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs'),tail=read('scripts/lib/own-accounting-imputation-190-continuation.mjs'),wrapper=read('scripts/verify-own-payroll-full-capacity.mjs');
 assert.equal(main.split(p.canonicalReopenLine).length,2,'the original canonical reopen remains byte exact once');
 const before=main.indexOf('const accountingImputationTail=await'),journal=main.indexOf('const journalTail=await'),reopen=main.indexOf(p.canonicalReopenLine),after=main.indexOf('const accountingImputation=await accountingImputationTail.afterReopen(reopened)');
 assert.ok(before>=0&&before<journal&&journal<reopen&&reopen<after);assert.ok(main.includes('approvedImputation:accountingImputationTail.approvedImputation'));assert.ok(main.includes('journal=await journalTail.afterReopen(reopened)'));
 for(const token of ['fullJson=true','imputationOperation(db,who.principal,who.session,op,input,{fullJson})','IMPUTATION_LIMIT','IMPUTATION_REOPENED','historical.sourceCurrent,false','historical.body,approvedImputation.body','historical.source,approvedImputation.source','historical.allocation,approvedImputation.allocation','IMPUTATION_EXPORT_UNAVAILABLE','original imputation attempt recovery and exact replay stay read-only'])assert.ok(tail.includes(token),token);
 const bookend=main.indexOf('const accountingImputationSourceBookend=assertOwnAccountingImputation190SourceBookend(h,accountingImputation.installation)');assert.ok(bookend>after);assert.ok(main.includes('journal,accountingImputationSourceBookend,actualSql:true'));
 assert.ok(wrapper.includes('...OWN_ACCOUNTING_IMPUTATION_190_SOURCE_ENTRIES'));assert.ok(!wrapper.slice(wrapper.indexOf('const entries='),wrapper.indexOf('export async')).includes('.github/'));
});

test('RPC extension is a finite set and leaves opaque captured JSON outside namespace rewriting',()=>{
 const source=read('scripts/lib/own-payroll-full-capacity-190-rpc.mjs');
 for(const [name,types]of Object.entries(p.addedRpc))assert.ok(source.includes(name+':'+JSON.stringify(types).replaceAll('"',"'")),name);
 assert.equal(Object.keys(p.addedRpc).length,20);assert.ok(source.includes("const entry=statements.get(text);assert.ok(entry,'M7_190_RPC_NOT_ALLOWED')"));
 assert.ok(source.includes("text.replace('public.'+entry.name,schema+'.'+entry.name).replace(/\\$(\\d+)/g"));
 assert.ok(!source.includes('replaceAll(\'public.\''));assert.ok(!source.includes('_capacity_core_'));assert.ok(!source.includes('source_value_v1'));
});
