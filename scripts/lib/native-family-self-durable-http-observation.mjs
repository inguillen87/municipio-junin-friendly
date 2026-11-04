// Pure, bounded classifications only. No app/SQL imports, sockets, retries,
// timeouts or mutation of the original error. No message, stack, URL, request,
// headers, body, identity, arguments or raw socket field is serialized.
const names=new Set(['Error','TypeError','RangeError','SyntaxError','AggregateError','AbortError','TimeoutError','SocketError','ConnectTimeoutError','HeadersTimeoutError','BodyTimeoutError','RequestAbortedError','RequestContentLengthMismatchError','ResponseContentLengthMismatchError','HTTPParserError','ClientDestroyedError','ClientClosedError','NotSupportedError']);
const codes=new Set(['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_ABORTED','UND_ERR_DESTROYED','UND_ERR_CLOSED','UND_ERR_REQ_CONTENT_LENGTH_MISMATCH','UND_ERR_RES_CONTENT_LENGTH_MISMATCH','UND_ERR_RESPONSE_STATUS_CODE','UND_ERR_RESPONSE_EXCEEDED_MAX_SIZE','UND_ERR_NOT_SUPPORTED','ECONNREFUSED','ECONNRESET','ECONNABORTED','ETIMEDOUT','EPIPE','ENOTFOUND','EAI_AGAIN','EHOSTUNREACH','ENETUNREACH','ABORT_ERR','ERR_STREAM_PREMATURE_CLOSE','ERR_HTTP_REQUEST_TIMEOUT']);
const objectLike=value=>value!==null&&(typeof value==='object'||typeof value==='function');
function data(value,key,{inherited=false}={}){if(!objectLike(value))return undefined;try{for(let depth=0;depth<(inherited?4:1)&&value;depth++,value=Object.getPrototypeOf(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor)return Object.hasOwn(descriptor,'value')?descriptor.value:undefined;}}catch{}return undefined;}
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const boolean=value=>typeof value==='boolean'?value:null;
export function nativeFamilyDurableErrorObservation(error){
 const causes=[],seen=new Set();let next=error;
 while(objectLike(next)&&causes.length<4&&!seen.has(next)){seen.add(next);const name=data(next,'name',{inherited:true}),code=data(next,'code',{inherited:true});causes.push(Object.freeze({name:names.has(name)?name:null,code:codes.has(code)?code:null}));next=data(next,'cause');}
 return Object.freeze({causes:Object.freeze(causes),causeTruncated:objectLike(next)});
}
export function nativeFamilyDurableHttpFailureObservation(error,context={}){
 const method=data(context,'method'),resource=data(context,'resource'),stage=data(context,'stage');let state=data(context,'serverState');
 const read=data(context,'readServerState');if(typeof read==='function'){try{state=read();}catch{state=null;}}
 const port=data(state,'port');
 return Object.freeze({version:'native-family-http-failure-observation.v1',method:method==='GET'||method==='POST'?method:null,resource:['bootstrap','attempt','detail','document','queue'].includes(resource)?resource:null,stage:['fetch','body','status'].includes(stage)?stage:null,requestCount:count(data(context,'requestCount')),server:Object.freeze({listening:boolean(data(state,'listening')),addressLoopback:boolean(data(state,'addressLoopback')),port:Number.isInteger(port)&&port>0&&port<=65535?port:null,requestCount:count(data(state,'requestCount')),errorCount:count(data(state,'errorCount')),closeObserved:boolean(data(state,'closeObserved'))}),error:nativeFamilyDurableErrorObservation(error)});
}
export function recordNativeFamilyDurableHttpFailure(error,context,record){
 // Diagnostic failures must never replace, wrap, mutate or retry the rejection.
 try{record(nativeFamilyDurableHttpFailureObservation(error,context));}catch{}
 return error;
}
