// Pure/source and loopback HTTP contracts only. No SQL, browser, provider or fixture installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOwnPayrollLoginRawSourceToParent} from './fixtures/own-payroll-login-source-projection.js';
import fs from 'node:fs';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {imputationOperation} from '../lib/internal-own-payroll-imputation.js';
import {journalOperation} from '../lib/internal-own-payroll-journal.js';
import {ownFullCapacity190Rpc} from '../scripts/lib/own-payroll-full-capacity-190-rpc.mjs';
import {OWN_RUN_NATURES} from '../assets/own-payroll-run-workspace-model.js';
import {ACCOUNTING_FULL190_BROWSER_SOURCE_INVERSES,projectAccountingFull190BrowserRawSourceToParent} from './fixtures/accounting-full-current190-browser-source-projection.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const source=read('scripts/lib/own-accounting-full-current190-browser.mjs');
const pure=source.slice(source.indexOf('export const ACCOUNTING190_READ_STATEMENTS='),source.indexOf('function readAccounting190State(')).replaceAll('export ','');
const {ACCOUNTING190_READ_STATEMENTS,accounting190ReadSql,accounting190ReadHandler,assertAccounting190Csv,assertAccounting190ImputationCards,assertAccounting190JournalRows}=new Function('assert','sha','OWN_RUN_NATURES',pure+'\nreturn {ACCOUNTING190_READ_STATEMENTS,accounting190ReadSql,accounting190ReadHandler,assertAccounting190Csv,assertAccounting190ImputationCards,assertAccounting190JournalRows};')(assert,hash,OWN_RUN_NATURES);
const schema='mc_qa_fixed_092_'+'a'.repeat(32),uid='11111111-2222-4333-8444-555555555555';
const email="qa.o'brien+public.$1;$4\\ñ@example.test";
const principal={authorized:true,user:{email},tenant:{source:'membership',id:uid,membershipId:uid}},session={id:uid,email,version:7,releaseSha:'b'.repeat(40)};
const emission=async(fn,op,input)=>{const calls=[];try{await fn({query:async(...args)=>{calls.push(args);throw Error('CAPTURED_BEFORE_ANY_SQL');}},principal,session,op,input,{fullJson:true});}catch{}assert.equal(calls.length,1);assert.equal(calls[0].length,2);return calls[0];};
// Scan SQL literals independently; opaque context cannot escape a single literal.
const parts=sql=>{let outer='',values=[];for(let i=0;i<sql.length;){if(sql[i]!=="'"){outer+=sql[i++];continue;}i++;let value='',closed=false;while(i<sql.length){if(sql[i]!=="'"){value+=sql[i++];continue;}if(sql[i+1]==="'"){value+="'";i+=2;continue;}i++;closed=true;break;}assert.equal(closed,true);outer+='?';values.push(value);}return{outer,values};};
test('four exact REAL service read emissions delegate unchanged and retain canonical RC/RW ownership',async()=>{
 const emitted=await Promise.all([[imputationOperation,'bootstrap',{period:'2026-10',liquidationType:'M'}],[imputationOperation,'detail',{id:uid}],[journalOperation,'bootstrap',{period:'2026-10',liquidationType:'M'}],[journalOperation,'detail',{id:uid}]].map(([fn,op,input])=>emission(fn,op,input)));
 assert.deepEqual(emitted.map(([sql])=>sql),Object.keys(ACCOUNTING190_READ_STATEMENTS));
 const calls=[],trace=[],marker=Object.freeze({real:'db-response'}),db={async query(...args){assert.strictEqual(this,db);calls.push(args);return marker;}},rpc=accounting190ReadSql(db,trace);
 for(const [sql,values]of emitted){assert.strictEqual(await rpc.query(sql,values),marker);assert.strictEqual(calls.at(-1)[1],values);assert.equal(calls.at(-1).length,2);const rendered=ownFullCapacity190Rpc(sql,values,schema),p=parts(rendered);assert.deepEqual(p.values,values);assert.equal(p.outer,sql.replace('public.',schema+'.').replace(/\$\d+/g,'?'));assert.equal(JSON.parse(p.values[0]).actorEmail,email);}
 assert.equal(trace.length,4);assert.ok(trace.every(row=>Reflect.ownKeys(row).sort().join(',')==='arity,text'));assert.ok(Object.isFrozen(ACCOUNTING190_READ_STATEMENTS));
});
test('read adapter rejects approximate text, non-string coercion, foreign schema, all writes and arity drift before delegate',async()=>{
 let called=0,coerced=0;const trace=[],rpc=accounting190ReadSql({query(){called++;}},trace),text=Object.keys(ACCOUNTING190_READ_STATEMENTS)[0],values=['{}','2026-10','M'];
 for(const sql of [text+' ',text.toLowerCase(),text.replace('public.','evil.'),text.replace('public.',schema+'.'),text.replace('AS result',''),text+';SELECT 1',text.replace('bootstrap_v1','command_full_v1'),{toString(){coerced++;return text;}},new String(text),null,undefined,Symbol('text')])await assert.rejects(()=>rpc.query(sql,values),/ACCOUNTING190_BROWSER_EXACT_READ_REQUIRED/);
 const sparse=['{}',,'M'],extra=[...values];extra.extra=true;const symbol=[...values];symbol[Symbol('x')]=true;
 for(const args of [[],values.slice(0,2),[...values,'x'],sparse,extra,symbol,{0:'{}',1:'2026-10',2:'M',length:3},['{}',null,'M'],['{}',2,'M']])await assert.rejects(()=>rpc.query(text,args),/ACCOUNTING190_BROWSER_READ_ARGUMENTS/);
 assert.equal(called,0);assert.equal(coerced,0);assert.deepEqual(trace,[]);
 const frozen=Object.freeze([...values]);await rpc.query(text,frozen);assert.equal(called,1);
});
test('GET-only gate is enforced through real HTTP before any handler SQL and keeps GET response status/headers/body',async()=>{
 let called=0;const gate=accounting190ReadHandler((req,res)=>{called++;assert.equal(req.method,'GET');res.setHeader('Content-Type','application/vnd.municontrol.payroll-full.v1+json');res.statusCode=200;res.end('{"ok":true,"data":{"exact":"0.010"}}');});
 const server=http.createServer((req,res)=>{res.status=value=>{res.statusCode=value;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};gate(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const request=method=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/internal-own-payroll-imputation',method},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.setTimeout(2500,()=>req.destroy(Error('TEST_LOOPBACK_RESPONSE_TIMEOUT:'+method)));req.end();});
 try{for(const method of ['POST','PUT','PATCH','DELETE']){const response=await request(method);assert.equal(response.status,405);assert.equal(response.headers.allow,'GET');assert.deepEqual(JSON.parse(response.body),{ok:false,code:'QA_ACCOUNTING190_READ_ONLY'});assert.equal(called,0);}const response=await request('GET');assert.equal(called,1);assert.equal(response.status,200);assert.equal(response.headers['content-type'],'application/vnd.municontrol.payroll-full.v1+json');assert.equal(response.body.toString(),'{"ok":true,"data":{"exact":"0.010"}}');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('download comparison proves all17100 exact CSV rows despite visible page25 and rejects crop or monetary drift',()=>{
 const expected=Buffer.from('\uFEFF"Legajo";"Importe"\r\n'+Array.from({length:17100},(_,i)=>'"'+i+'";"0.010"\r\n').join(''));
 const proof=assertAccounting190Csv(Buffer.from(expected),expected,17100);assert.equal(proof.rows,17100);assert.equal(proof.sha256,hash(expected));
 assert.throws(()=>assertAccounting190Csv(Buffer.from(expected.toString().split('\r\n').slice(0,26).join('\r\n')+'\r\n'),expected,17100),/CSV_BYTES/);
 assert.throws(()=>assertAccounting190Csv(Buffer.from(expected.toString().replace('0.010','0.011')),expected,17100),/CSV_BYTES/);
 assert.throws(()=>assertAccounting190Csv(expected,expected,17099),/CSV_COMPLETE/);const noBom=expected.subarray(3);assert.throws(()=>assertAccounting190Csv(noBom,noBom,17100),/CSV_BOM/);const bad=Buffer.from([239,187,191,255,13,10]);assert.throws(()=>assertAccounting190Csv(bad,bad,0),TypeError);
});
test('card and38-row journal assertions preserve exact decimal text, null evidence and every original ordinal',()=>{
 const row={employeeNumber:'QA001',conceptCode:'993',nature:'remuneration',amount:'0.010',unit:'pesos',liquidationDate:null,jurisdictionCode:null};const card={heading:'Legajo QA001 · concepto 993',amount:OWN_RUN_NATURES.remuneration+' · importe/valor conservado 0.010 · pesos',date:'Fecha: no declarada · jurisdicción: no conservada'};
 assertAccounting190ImputationCards([card],[row]);assert.throws(()=>assertAccounting190ImputationCards([{...card,amount:card.amount.replace('0.010','0.01')}],[row]),/VISIBLE_AMOUNT/);assert.throws(()=>assertAccounting190ImputationCards([],[row]),/VISIBLE_COUNT/);
 const entries=Array.from({length:38},(_,i)=>({ordinal:i+1,accountReference:'QA'+i,debit:i%2?'0':'0.010',credit:i%2?'0.010':'0',documentReference:'QA doc '+i})),rows=entries.map(e=>[String(e.ordinal),e.accountReference,e.debit,e.credit,e.documentReference]);assertAccounting190JournalRows(rows,entries);assert.throws(()=>assertAccounting190JournalRows(rows.slice(0,37),entries),/JOURNAL_ROWS/);const changed=structuredClone(rows);changed[37][3]='0.01';assert.throws(()=>assertAccounting190JournalRows(changed,entries),/JOURNAL_ROWS/);
});
test('finite source succession restores all eight entire parents, including old tests with unchanged assertions',()=>{
 assert.equal(Object.keys(ACCOUNTING_FULL190_BROWSER_SOURCE_INVERSES).length,8);
 for(const[file,pin]of Object.entries(ACCOUNTING_FULL190_BROWSER_SOURCE_INVERSES)){const raw=projectOwnPayrollLoginRawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url))),before=projectAccountingFull190BrowserRawSourceToParent(file,raw);assert.equal(raw.length,pin.afterBytes);assert.equal(hash(raw),pin.afterSha256);assert.equal(before.length,pin.beforeBytes);assert.equal(hash(before),pin.beforeSha256);assert.strictEqual(projectAccountingFull190BrowserRawSourceToParent(file,before),before);assert.throws(()=>projectAccountingFull190BrowserRawSourceToParent(file,Buffer.concat([raw,Buffer.from('unreviewed')])),/SOURCE_AFTER_LENGTH/);const altered=Buffer.from(raw);altered[0]^=1;assert.throws(()=>projectAccountingFull190BrowserRawSourceToParent(file,altered),/SOURCE_AFTER_SHA/);}
 const other=Buffer.from('unrelated bytes');assert.strictEqual(projectAccountingFull190BrowserRawSourceToParent('unrelated',other),other);assert.throws(()=>projectAccountingFull190BrowserRawSourceToParent('unrelated','not raw'),/SOURCE_RAW_REQUIRED/);
});
test('append occurs after real203/206 SQL tails and before original214 without removing old flow or broadening capability claim',()=>{
 const continuation=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs'),start=continuation.indexOf('const accountingImputationTail=await'),journal=continuation.indexOf('const journalTail=await'),browser=continuation.indexOf('const accountingFullBrowser=await'),reopen=continuation.indexOf('reopenBody={',browser);assert.ok(start>0&&journal>start&&browser>journal&&reopen>browser);assert.ok(continuation.includes('actualSql:true,actualHttp:false,fullCapacityBrowserProven:false'));
 assert.ok(source.includes('assert.deepEqual(readAccounting190State(h,readSnapshot),before'));for(const name of ['own_payroll_close_event','own_payroll_accounting_event','own_payroll_imputation_event','own_payroll_journal_event'])assert.ok(source.includes(name));for(const label of ["'functions'","'tables'","'roles'","'memberships'","'defaults'"])assert.ok(source.includes(label));
 assert.ok(source.includes('boot.journals.filter'));assert.ok(source.includes("row.basis==='imputation'&&row.sourceId===approved.proposal.id&&row.status==='posted'"));assert.ok(!source.includes('page.request.post'));assert.ok(!source.includes('response.json('));assert.ok(!source.includes('waitForTimeout'));assert.ok(source.includes('requests.every(request=>request.method()===\'GET\')'));
 const runtime=Object.keys(ACCOUNTING_FULL190_BROWSER_SOURCE_INVERSES).filter(file=>file.startsWith('scripts/'));for(const file of runtime)assert.ok(!read(file).includes('projectAccountingFull190BrowserRawSourceToParent'),'no runtime RAW projection:'+file);
 const wrapper=read('scripts/verify-own-payroll-full-capacity.mjs');for(const file of ['scripts/lib/own-accounting-full-current190-browser.mjs','tests/own-accounting-full-current190-browser.test.js','tests/fixtures/accounting-full-current190-browser-source-projection.js'])assert.equal(wrapper.split("'"+file+"'").length,2);
});
test('four custody modules pin actual successor RAW and preserve every prior through exact inverse',()=>{
 const continuation='scripts/lib/own-payroll-full-capacity-190-continuation.mjs',support='scripts/lib/own-payroll-receipt126-same190-support.mjs',actors='scripts/lib/own-payroll-receipt126-same190-actors.mjs',circuit='scripts/lib/own-payroll-receipt126-same190-circuit.mjs',installation='scripts/lib/own-payroll-receipt126-same190-installation.mjs';
 for(const[parent,children]of [[support,[continuation]],[actors,[continuation]],[circuit,[continuation,support,actors]],[installation,[support]]])for(const child of children){const raw=fs.readFileSync(new URL('../'+child,import.meta.url)),text=read(parent);assert.equal(text.split(hash(raw)).length,2,parent+' actual successor SHA for '+child);assert.ok(text.includes(String(raw.length)));}
 const old=projectAccountingFull190BrowserRawSourceToParent(continuation,fs.readFileSync(new URL('../'+continuation,import.meta.url)));assert.equal(old.length,47063);assert.equal(hash(old),'99ce92a626b1e35d58b206162bf279dab757a451307245a29f602f9902a07a01');
});
