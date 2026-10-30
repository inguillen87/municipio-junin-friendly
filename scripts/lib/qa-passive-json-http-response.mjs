// QA only: observe the bytes passed to the original ServerResponse, never replay
// or replace them. finish proves server transmission, not client receipt. The
// browser correlation and subsequent product DOM/recovery checks are separate.
import assert from 'node:assert/strict';
import {IncomingMessage,ServerResponse} from 'node:http';
const maximum=32*1024*1024;
const noop=()=>{};
export function qaPassiveJsonHttpResponse(req,res,{maxBytes=maximum,timeoutMs=30000}={}){
 assert.ok(req instanceof IncomingMessage&&res instanceof ServerResponse,'QA_PASSIVE_REAL_HTTP_REQUIRED');
 assert.ok(!res.headersSent&&!res.writableEnded,'QA_PASSIVE_UNSTARTED_RESPONSE_REQUIRED');
 assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=maximum,'QA_PASSIVE_BOUND_REQUIRED');
 assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000,'QA_PASSIVE_FINISH_DEADLINE_REQUIRED');
 const method=req.method,pathname=new URL(req.url,'http://qa.invalid').pathname,key=req.headers['idempotency-key']??null;
 const originalWrite=res.write,originalEnd=res.end,originalWriteHead=res.writeHead,chunks=[];
 let bytes=0,done=false,transmission=null,timer,resolve,reject;
 const result=new Promise((yes,no)=>{resolve=yes;reject=no;});result.catch(noop);
 const restore=()=>{if(res.write===write)res.write=originalWrite;if(res.end===end)res.end=originalEnd;if(res.writeHead===writeHead)res.writeHead=originalWriteHead;};
 const cleanup=()=>{clearTimeout(timer);restore();res.off('finish',finished);res.off('close',closed);res.off('error',errored);chunks.length=0;};
 const fail=error=>{if(done)return;done=true;cleanup();reject(error);};
 const retain=(chunk,encoding)=>{
  if(done||chunk===undefined||chunk===null||typeof chunk==='function')return;
  // Native write/end validates unsupported types; do not coerce or replace them.
  if(typeof chunk!=='string'&&!ArrayBuffer.isView(chunk))return;
  const selectedEncoding=typeof encoding==='string'?encoding:undefined;
  bytes+=typeof chunk==='string'?Buffer.byteLength(chunk,selectedEncoding):chunk.byteLength;
  if(bytes>maxBytes){fail(Error('QA_PASSIVE_RESPONSE_LIMIT'));return;}
  const value=typeof chunk==='string'?Buffer.from(chunk,selectedEncoding):Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength);
  chunks.push(Buffer.from(value));
 };
 function write(...args){
  // Copy before the caller can reuse its buffer, pass identical arguments to the
  // native transport and preserve its return value, callbacks and drain events.
  retain(args[0],args[1]);
  try{return Reflect.apply(originalWrite,this,args);}catch(error){fail(error);throw error;}
 }
 function end(...args){
  retain(args[0],args[1]);
  try{return Reflect.apply(originalEnd,this,args);}catch(error){fail(error);throw error;}
 }
 function writeHead(...args){
  try{
   const returned=Reflect.apply(originalWriteHead,this,args);
   // write/end also call this native emission point implicitly. Snapshot now:
   // statusCode and header-array objects can be mutated after HTTP was emitted.
   if(!transmission)transmission={status:this.statusCode,headers:Object.fromEntries(Object.entries(this.getHeaders()).map(([name,value])=>[name,Array.isArray(value)?[...value]:value]))};
   return returned;
  }catch(error){fail(error);throw error;}
 }
 function finished(){
  if(done)return;
  try{
   assert.ok(transmission,'QA_PASSIVE_TRANSMISSION_HEADERS_REQUIRED');
   const buffer=Buffer.concat(chunks,bytes),{headers,status}=transmission;
   for(const name of ['content-length','x-municontrol-json-bytes'])if(headers[name]!==undefined){const value=String(headers[name]);assert.match(value,/^(0|[1-9][0-9]*)$/,'QA_PASSIVE_BYTE_HEADER_INVALID');assert.equal(Number(value),bytes,'QA_PASSIVE_BYTE_HEADER_MISMATCH');}
   const bodyText=new TextDecoder('utf-8',{fatal:true}).decode(buffer),body=JSON.parse(bodyText);
   const receipt={method,pathname,key,status,headers,bytes,buffer,bodyText,body,serverFinished:true,clientReceiptProven:false};
   done=true;cleanup();resolve(receipt);
  }catch(error){fail(error);}
 }
 function closed(){if(!res.writableFinished)fail(Error('QA_PASSIVE_RESPONSE_PREMATURE_CLOSE'));}
 function errored(error){fail(error);}
 res.on('finish',finished);res.on('close',closed);res.on('error',errored);res.write=write;res.end=end;res.writeHead=writeHead;
 // Independent of browser/CDP/client/UI timeouts. Expiry rejects only this
 // observation: native HTTP remains open and can finish later unchanged.
 timer=setTimeout(()=>fail(Object.assign(Error('QA_PASSIVE_RESPONSE_FINISH_TIMEOUT'),{code:'QA_PASSIVE_RESPONSE_FINISH_TIMEOUT'})),timeoutMs);
 return Object.freeze({method,pathname,key,result});
}

// Correlate one server transmission with one actual Playwright Request/Response.
// Does not call response.json/body/text, clone fetch, or issue another request.
export async function qaCorrelatedPostJsonResponse({response,requests,observations,origin,pathname,capture}){
 assert.ok(Array.isArray(requests)&&requests.length===1,'QA_PASSIVE_ONE_BROWSER_POST_REQUIRED');
 assert.ok(Array.isArray(observations)&&observations.length===1,'QA_PASSIVE_ONE_SERVER_POST_REQUIRED');
 const request=requests[0],url=new URL(request.url());
 assert.strictEqual(response.request(),request,'QA_PASSIVE_RESPONSE_REQUEST_MISMATCH');
 assert.equal(url.origin,origin,'QA_PASSIVE_ORIGIN_MISMATCH');assert.equal(url.pathname,pathname,'QA_PASSIVE_PATH_MISMATCH');assert.equal(url.search,'','QA_PASSIVE_QUERY_FORBIDDEN');
 assert.equal(request.method(),'POST','QA_PASSIVE_POST_REQUIRED');
 const requestHeaders=await request.allHeaders();assert.equal(requestHeaders['idempotency-key'],capture.key,'QA_PASSIVE_REQUEST_KEY_MISMATCH');
 assert.deepEqual(request.postDataJSON(),{operation:'calculate',payload:capture.body},'QA_PASSIVE_CAPTURE_PAYLOAD_MISMATCH');
 const observation=observations[0];assert.equal(observation.key,capture.key,'QA_PASSIVE_SERVER_KEY_MISMATCH');assert.equal(observation.method,'POST');assert.equal(observation.pathname,pathname);
 const packet=await observation.result;
 assert.equal(packet.serverFinished,true);assert.equal(packet.key,capture.key);assert.equal(packet.method,'POST');assert.equal(packet.pathname,pathname);
 assert.equal(response.status(),packet.status,'QA_PASSIVE_STATUS_MISMATCH');
 const headers=await response.allHeaders();
 for(const name of ['content-type','cache-control','x-content-type-options','x-municontrol-json-bytes','content-length']){
  if(packet.headers[name]!==undefined)assert.equal(headers[name],String(packet.headers[name]),'QA_PASSIVE_HEADER_MISMATCH:'+name);
 }
 for(const name of ['content-length','x-municontrol-json-bytes'])if(headers[name]!==undefined){assert.match(headers[name],/^(0|[1-9][0-9]*)$/,'QA_PASSIVE_BROWSER_BYTE_HEADER_INVALID');assert.equal(Number(headers[name]),packet.bytes,'QA_PASSIVE_BROWSER_BYTE_HEADER_MISMATCH');}
 assert.match(headers['content-type']??'',/^(?:application\/json|application\/vnd\.municontrol\.payroll-full\.v1\+json)(?:;|$)/i,'QA_PASSIVE_JSON_CONTENT_TYPE_REQUIRED');
 assert.match(headers['cache-control']??'',/(?:^|[,\s])no-store(?:$|[,\s])/i,'QA_PASSIVE_NO_STORE_REQUIRED');
 return packet;
}
