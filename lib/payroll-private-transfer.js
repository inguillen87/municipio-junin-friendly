/** Fetch only an owner-preauthorized private object; no caller-supplied URL or keys. */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
export const MAX_CIPHER_BYTES = 1048576;
export const TRANSFER_HOSTS = Object.freeze(['sdmntprbrazilsouth.oaiusercontent.com']);
export function authorizedCipherUrl(value) {
 if(typeof value!=='string'||value.length>4096)throw new Error('DELIVERY_DENIED');
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!TRANSFER_HOSTS.includes(u.hostname)||!/^\/files\/[a-f0-9-]+\/raw$/.test(u.pathname))throw new Error('DELIVERY_DENIED');
 return u.href;
}
export function publicDeliveryReceipt(x) {
 if(!x||!Number.isInteger(x.statements)||x.statements<1||!Number.isInteger(x.lines)||x.lines<x.statements||x.lines>30000||typeof x.replayed!=='boolean'||x.payrollModified!==false||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x.datasetId))throw new Error('DELIVERY_DENIED');
 return {ok:true,datasetId:x.datasetId,statements:x.statements,lines:x.lines,replayed:x.replayed,payrollModified:false};
}
export async function fetchAuthorizedCipher(descriptor,fetchImpl=fetch) {
 if(descriptor?.state!=='authorized'||!Number.isSafeInteger(descriptor.cipherBytes)||descriptor.cipherBytes<32||descriptor.cipherBytes>MAX_CIPHER_BYTES||! /^[a-f0-9]{64}$/.test(descriptor.cipherSha256))throw new Error('DELIVERY_DENIED');
 const url=authorizedCipherUrl(descriptor.sourceUrl);
 const response=await fetchImpl(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.body||response.redirected)throw new Error('DELIVERY_DENIED');
 const advertised=response.headers.get('content-length');
 if(advertised!==null&&(!/^\d+$/.test(advertised)||Number(advertised)!==descriptor.cipherBytes)) {await response.body.cancel();throw new Error('DELIVERY_DENIED')}
 let bytes=0;const chunks=[];const reader=response.body.getReader();
 try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>descriptor.cipherBytes||bytes>MAX_CIPHER_BYTES){await reader.cancel();throw new Error('DELIVERY_DENIED')}chunks.push(Buffer.from(value))}} finally{reader.releaseLock()}
 const cipher=Buffer.concat(chunks);
 if(bytes!==descriptor.cipherBytes||createHash('sha256').update(cipher).digest('hex')!==descriptor.cipherSha256)throw new Error('DELIVERY_DENIED');
 return cipher;
}

/** Keyless private HTTPS delivery. At most the owner-declared plaintext bytes. */
export function unpackAuthorizedPayload(descriptor,packed){
 if(descriptor?.transport!=='https_gzip'||!Number.isSafeInteger(descriptor.payloadBytes)||descriptor.payloadBytes<1||descriptor.payloadBytes>6000000||! /^[a-f0-9]{64}$/.test(descriptor.payloadSha256))throw Error('DELIVERY_DENIED');
 const plain=gunzipSync(packed,{maxOutputLength:descriptor.payloadBytes});
 if(plain.length!==descriptor.payloadBytes||createHash('sha256').update(plain).digest('hex')!==descriptor.payloadSha256)throw Error('DELIVERY_DENIED');
 return plain;
}
