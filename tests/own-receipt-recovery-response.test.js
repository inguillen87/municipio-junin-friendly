import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {captureOwnReceiptRecoveryResponse} from '../scripts/lib/own-receipt-recovery-response-qa.mjs';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
import {sendOwnPayrollStream,supportsOwnPayrollStream} from '../lib/own-payroll-response.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {OWN_RECEIPT_PREPARE,ownReceiptIssuer} from '../assets/own-payroll-receipt-model.js';
import {receiptCommand,receiptPreview} from './fixtures/own-payroll-receipt-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
const endpoint='/api/internal-own-payroll-receipts',origin='http://127.0.0.1:4380';
const principal={user:{email:'receipt-recovery-stream@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_RECEIPT_PREPARE}},session={email:principal.user.email,id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const issuer={id:'qa-municipal-issuer',revision:1,issuer:{name:'MUNICIPIO INVENTADO QA',taxId:'30000000007',address:'CALLE INVENTADA 1, LOCALIDAD QA'},source:{kind:'municipal_official_backup',label:'Respaldo institucional inventado QA',cutoff:'2026-10-01T15:17:29',validityDeclared:false}};
function receiptApi(query=async()=>{throw Error('Unexpected query');}){let authorizations=0,connections=0;const calls=[],handler=createOwnReceiptHandler({env:{INTERNAL_APP_ORIGIN:origin},issuerProfiles:{[principal.tenant.id]:issuer},requireAccess:async()=>{authorizations++;return{mode:'managed',principal};},sessionFor:()=>session,getSql:async()=>{connections++;return{query:async(text,values)=>{calls.push({text,values});return query(text,values);}};}});return{handler,calls,counts:()=>({authorizations,connections})};}
const request=(query={resource:'issuer'},body)=>({method:body?'POST':'GET',url:endpoint+(body?'':'?'+new URLSearchParams(query)),query:body?{}:query,headers:{accept:OWN_RUN_FULL_JSON,...(body?{origin,'content-type':'application/json','idempotency-key':uid(9)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const wire=value=>Buffer.from(JSON.stringify(value),'utf8'),sha=value=>createHash('sha256').update(value).digest('hex');

test('RED cause: the original JSON-only route receiver makes the actual issuer fail FULL before authorization',async()=>{
 const a=receiptApi();let status=200,payload;const res={setHeader(){},status(value){status=value;return this;},json(value){payload=value;return this;}};
 assert.equal(supportsOwnPayrollStream(res),false);await a.handler(request(),res);
 assert.equal(status,503);assert.equal(payload.code,'OWN_RECEIPT_UNAVAILABLE');assert.equal(payload.error,'No está disponible la lectura completa. Consultá el mismo intento.');assert.deepEqual(a.counts(),{authorizations:0,connections:0});
});
test('GREEN cause: the same actual issuer completes FULL with original scope and exact bytes, with zero SQL',async()=>{
 const a=receiptApi(),packet=await captureOwnReceiptRecoveryResponse(a.handler,request());
 assert.equal(packet.status,200);assert.equal(packet.headers['content-type'],OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(packet.headers['x-municontrol-json-bytes'],String(packet.body.length));assert.equal(Object.hasOwn(packet.headers,'content-length'),false);
 assert.equal(packet.payload.ok,true);assert.deepEqual(ownReceiptIssuer(packet.payload.data,{tenantId:principal.tenant.id}).profile.issuer,issuer.issuer);assert.deepEqual(packet.body,wire(packet.payload));assert.deepEqual(a.counts(),{authorizations:1,connections:0});
});
test('actual 409 refusal retains exact command, key and JSON error after the transport fix',async()=>{
 const a=receiptApi(async()=>{throw Error('OWN_RECEIPT_STATE_CHANGED');}),body=receiptCommand(),packet=await captureOwnReceiptRecoveryResponse(a.handler,request({}, {operation:'command',payload:body}));
 assert.equal(packet.status,409);assert.equal(packet.payload.code,'OWN_RECEIPT_STATE_CHANGED');assert.equal(packet.headers['content-type'],'application/json; charset=utf-8');assert.equal(Object.hasOwn(packet.headers,'x-municontrol-json-bytes'),false);assert.equal(a.calls.length,1);assert.deepEqual(JSON.parse(a.calls[0].values[1]),body);assert.equal(a.calls[0].values[2],uid(9));assert.deepEqual(packet.body,wire(packet.payload));
});
test('actual complete preview preserves every record and original payload without rewriting FULL bytes',async()=>{
 const expected=receiptPreview(),a=receiptApi(async()=>[{result:structuredClone(expected)}]),packet=await captureOwnReceiptRecoveryResponse(a.handler,request({}, {operation:'preview',params:expected.snapshot.params}));
 assert.equal(packet.status,200);assert.deepEqual(packet.payload,{ok:true,data:expected});assert.equal(packet.payload.data.snapshot.records.length,35);assert.equal(a.calls.length,1);assert.deepEqual(JSON.parse(a.calls[0].values[1]),expected.snapshot.params);assert.deepEqual(packet.body,wire({ok:true,data:expected}));assert.equal(packet.headers['x-municontrol-json-bytes'],String(packet.body.length));
});
test('native Writable collector preserves multiple chunks, Unicode, nulls, decimal scale, status and body hash',async()=>{
 const data={label:"Área O'Hara public. $1 😀",amount:'500.2200',quantity:null,rows:Array.from({length:6000},(_,index)=>({index,label:'sintético😀'}))},expected=wire({ok:true,data});let chunks=0;
 const packet=await captureOwnReceiptRecoveryResponse(async(req,res)=>{assert.equal(req.headers.accept,OWN_RUN_FULL_JSON);assert.equal(supportsOwnPayrollStream(res),true);const write=res.write;res.write=function(...args){chunks++;return write.apply(this,args);};await sendOwnPayrollStream(res,201,data);},request());
 assert.ok(expected.length>65536);assert.ok(chunks>1);assert.equal(packet.status,201);assert.deepEqual(packet.body,expected);assert.equal(sha(packet.body),sha(expected));assert.equal(packet.headers['x-municontrol-json-bytes'],String(expected.length));
});
test('real authorization refusal stays JSON403 without SQL or fabricated issuer',async()=>{
 let connections=0;const handler=createOwnReceiptHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:async(_req,res)=>{res.status(403).json({ok:false,code:'SYNTHETIC_DENIED'});return null;},getSql:()=>{connections++;throw Error('No SQL');}}),packet=await captureOwnReceiptRecoveryResponse(handler,request());
 assert.equal(packet.status,403);assert.deepEqual(packet.payload,{ok:false,code:'SYNTHETIC_DENIED'});assert.equal(connections,0);assert.equal(Object.hasOwn(packet.headers,'x-municontrol-json-bytes'),false);
});
test('unfinished, interrupted and thrown responses reject; advertised byte mismatches never become accepted packets',async()=>{
 const original=Error('SYNTHETIC_ORIGINAL_FAILURE');await assert.rejects(captureOwnReceiptRecoveryResponse(async()=>{throw original;},request()),error=>error===original);
 await assert.rejects(captureOwnReceiptRecoveryResponse(async()=>{},request()),/RESPONSE_UNFINISHED/);
 await assert.rejects(captureOwnReceiptRecoveryResponse(async(_req,res)=>{res.destroy();},request()),/RESPONSE_UNFINISHED|RESPONSE_CLOSED/);
 await assert.rejects(captureOwnReceiptRecoveryResponse(async(_req,res)=>{res.setHeader('X-MuniControl-JSON-Bytes','999');res.end('{"ok":true}');},request()),/BYTE_COUNT_MISMATCH/);
 await assert.rejects(captureOwnReceiptRecoveryResponse(async(_req,res)=>{res.end('{"ok":true}');},request(),{maxBytes:5}),/FULL_LIMIT/);
 await assert.rejects(captureOwnReceiptRecoveryResponse(async()=>{},request(),{maxBytes:OWN_RUN_FULL_MAX_BYTES+1}));
});
