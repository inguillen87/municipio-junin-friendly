// QA route-response collector only. No socket, SQL or browser is opened here.
// Preserve the real Writable/FULL contract and exact delivered bytes for the
// existing route.fulfill browser drill; application handlers stay unchanged.
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {OWN_RUN_FULL_MAX_BYTES} from '../../assets/own-payroll-response.js';

export async function captureOwnReceiptRecoveryResponse(handler,req,{maxBytes=OWN_RUN_FULL_MAX_BYTES}={}){
 assert.equal(typeof handler,'function');assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=OWN_RUN_FULL_MAX_BYTES);
 const headers={},parts=[];let bytes=0,finished=false;
 class Response extends Writable{
  constructor(){super();this.statusCode=200;this.headersSent=false;}
  status(code){assert.ok(!this.headersSent);assert.ok(Number.isInteger(code)&&code>=100&&code<=599);this.statusCode=code;return this;}
  setHeader(name,value){assert.ok(!this.headersSent,'RECEIPT_RECOVERY_HEADERS_ALREADY_SENT');headers[String(name).toLowerCase()]=String(value);return this;}
  json(value){this.setHeader('Content-Type','application/json; charset=utf-8');this.end(JSON.stringify(value));return this;}
  _write(chunk,encoding,done){this.headersSent=true;const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,encoding);bytes+=value.length;if(bytes>maxBytes)return done(Error('RECEIPT_RECOVERY_FULL_LIMIT'));parts.push(Buffer.from(value));done();}
 }
 const res=new Response(),completion=new Promise((resolve,reject)=>{res.once('finish',()=>{finished=true;resolve();});res.once('error',reject);res.once('close',()=>{if(!finished)reject(Error('RECEIPT_RECOVERY_RESPONSE_CLOSED'));});});completion.catch(()=>{});
 try{
  await handler(req,res);if(res.errored)throw res.errored;assert.ok(res.writableEnded,'RECEIPT_RECOVERY_RESPONSE_UNFINISHED');await completion;
  const body=Buffer.concat(parts,bytes);
  for(const name of ['x-municontrol-json-bytes','content-length'])if(Object.hasOwn(headers,name)){assert.match(headers[name],/^(0|[1-9][0-9]*)$/,'RECEIPT_RECOVERY_BYTE_COUNT_INVALID');assert.equal(Number(headers[name]),body.length,'RECEIPT_RECOVERY_BYTE_COUNT_MISMATCH');}
  const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
  return{status:res.statusCode,headers,body,payload};
 }catch(error){res.destroy(error);await completion.catch(()=>{});throw error;}
 finally{parts.length=0;}
}
