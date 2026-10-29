// Synthetic receipt UI HTTP transport only. Never changes the production handler,
// the IncomingMessage, negotiated request headers, business payload or SQL.
// Both res.json() and the actual full JSON stream end at this bounded observer.
import assert from 'node:assert/strict';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Writable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {OWN_RUN_FULL_MAX_BYTES} from '../../assets/own-payroll-response.js';

const endpoint='/api/internal-own-payroll-receipts';
const lostAcknowledgement={ok:false,error:'No se confirmó la respuesta del envío sintético.'};
const noop=()=>{};

export async function forwardReceiptUiQaHttp(req,res,handler,{
 onPreview=noop,onWrite=noop,wrongIssuerScope=()=>false,
 loseAcknowledgement=()=>false,maxBytes=OWN_RUN_FULL_MAX_BYTES
}={}){
 assert.ok(req instanceof IncomingMessage&&res instanceof ServerResponse,'RECEIPT_UI_REAL_HTTP_REQUIRED');
 assert.equal(new URL(req.url,'http://local.invalid').pathname,endpoint,'RECEIPT_UI_EXACT_ENDPOINT_REQUIRED');
 assert.ok(typeof handler==='function'&&[onPreview,onWrite,wrongIssuerScope,loseAcknowledgement].every(value=>typeof value==='function'),'RECEIPT_UI_HOOK_REQUIRED');
 assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=OWN_RUN_FULL_MAX_BYTES,'RECEIPT_UI_RESPONSE_BOUND_REQUIRED');
 assert.ok(!res.headersSent&&!res.writableEnded,'RECEIPT_UI_UNSTARTED_RESPONSE_REQUIRED');
 const original={write:res.write,end:res.end,status:res.status,json:res.json};
 const write=original.write.bind(res),end=original.end.bind(res),chunks=[];
 let retainedBytes=0,ending=false,firstFailure=null,deliveredBytes=0,observedPackets=0;
 let resolveCompletion,rejectCompletion;
 const completion=new Promise((resolve,reject)=>{resolveCompletion=resolve;rejectCompletion=reject;});
 // A handler can fail before completion is awaited. Keep that rejection observed.
 completion.catch(noop);
 const reject=error=>{if(firstFailure===null)firstFailure=error;rejectCompletion(firstFailure);};
 const responseError=error=>reject(error);
 const responseClosed=()=>{if(!res.writableFinished)reject(Error('RECEIPT_UI_RESPONSE_CLOSED'));};
 res.on('error',responseError);res.on('close',responseClosed);
 async function drain(){
  if(res.destroyed)throw Error('RECEIPT_UI_RESPONSE_CLOSED');
  await new Promise((resolve,rejectDrain)=>{
   const clear=()=>{res.removeListener('drain',ready);res.removeListener('error',failed);res.removeListener('close',closed);};
   const ready=()=>{clear();resolve();},failed=error=>{clear();rejectDrain(error);},closed=()=>failed(Error('RECEIPT_UI_RESPONSE_CLOSED'));
   res.once('drain',ready);res.once('error',failed);res.once('close',closed);
   if(res.destroyed)closed();
  });
 }
 async function deliver(){
  assert.ok(!res.headersSent,'RECEIPT_UI_HEADERS_SENT_BEFORE_OBSERVATION');
  const bytes=Buffer.concat(chunks,retainedBytes);
  const announced=res.getHeader('X-MuniControl-JSON-Bytes'),length=res.getHeader('Content-Length');
  for(const expected of [announced,length])if(expected!==undefined){assert.match(String(expected),/^(0|[1-9][0-9]*)$/,'RECEIPT_UI_BYTE_COUNT_INVALID');assert.equal(Number(expected),bytes.length,'RECEIPT_UI_BYTE_COUNT_MISMATCH');}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  observedPackets++;
  let replacement=null;
  if(value?.ok===true&&value.data?.version==='own-receipt-preview.v1')onPreview(value.data.snapshot);
  if(req.method==='POST'&&value?.ok===true&&value.data?.version==='own-receipt-event.v1'){
   onWrite({key:req.headers['idempotency-key'],body:value.data.body,replayed:value.data.replayed});
   if(loseAcknowledgement()){
    res.statusCode=503;res.setHeader('Content-Type','application/json');
    for(const name of ['X-MuniControl-JSON-Bytes','Content-Length','Idempotency-Replayed'])res.removeHeader(name);
    replacement=Buffer.from(JSON.stringify(lostAcknowledgement),'utf8');
   }
  }
  if(value?.ok===true&&value.data?.version==='own-receipt-issuer.v1'&&wrongIssuerScope()){
   replacement=Buffer.from(JSON.stringify({...value,data:{...value.data,scope:{tenantId:randomUUID()}}}),'utf8');
   if(announced!==undefined)res.setHeader('X-MuniControl-JSON-Bytes',String(replacement.length));
   if(length!==undefined)res.setHeader('Content-Length',String(replacement.length));
  }
  const outgoing=replacement?[replacement]:chunks;
  deliveredBytes=outgoing.reduce((count,chunk)=>count+chunk.length,0);
  assert.ok(deliveredBytes<=maxBytes,'RECEIPT_UI_RESPONSE_TOO_LARGE');
  for(const chunk of outgoing){if(res.destroyed)throw Error('RECEIPT_UI_RESPONSE_CLOSED');if(!write(chunk))await drain();}
  await new Promise((resolve,rejectEnd)=>{
   const clear=()=>{res.removeListener('error',failed);res.removeListener('close',closed);};
   const failed=error=>{clear();rejectEnd(error);},closed=()=>{if(!res.writableFinished)failed(Error('RECEIPT_UI_RESPONSE_CLOSED'));};
   res.once('error',failed);res.once('close',closed);
   end(()=>{clear();resolve();});
  });
 }
 const sink=new Writable({
  // Preserve the Writable write/callback/drain contract while retaining the
  // bounded synthetic packet. The real ServerResponse is drained during delivery.
  highWaterMark:res.writableHighWaterMark,
  write(chunk,_encoding,callback){
   retainedBytes+=chunk.length;
   if(retainedBytes>maxBytes){const error=Error('RECEIPT_UI_RESPONSE_TOO_LARGE');reject(error);queueMicrotask(()=>callback(error));return;}
   chunks.push(Buffer.from(chunk));queueMicrotask(callback);
  },
  final(callback){deliver().then(()=>callback(),callback);}
 });
 sink.on('drain',()=>res.emit('drain'));
 sink.on('error',error=>{reject(error);res.destroy(error);});
 sink.on('finish',resolveCompletion);
 res.status=code=>{res.statusCode=code;return res;};
 res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
 res.write=(...args)=>sink.write(...args);
 res.end=(...args)=>{ending=true;sink.end(...args);return res;};
 try{
  await handler(req,res);
  if(firstFailure!==null)throw firstFailure;
  assert.ok(ending,'RECEIPT_UI_HANDLER_RESPONSE_UNFINISHED');
  await completion;
  return {retainedBytes,deliveredBytes,observedPackets,statusCode:res.statusCode};
 }catch(error){
  reject(error);sink.destroy(error);res.destroy(error);throw error;
 }finally{
  res.write=original.write;res.end=original.end;
  for(const name of ['status','json'])if(original[name]===undefined)delete res[name];else res[name]=original[name];
  chunks.length=0;
  // A destroyed HTTP response can emit its error on the next tick. Keep the
  // one owned listener until close instead of producing an unhandled error.
  if(res.destroyed&&!res.closed)res.once('close',()=>{res.removeListener('error',responseError);res.removeListener('close',responseClosed);});
  else{res.removeListener('error',responseError);res.removeListener('close',responseClosed);}
 }
}