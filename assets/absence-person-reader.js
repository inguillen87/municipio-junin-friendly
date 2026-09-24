// Same-origin read-only API transport. The server must authorize every request.
import {verifyAbsencePersonResponse} from './absence-person-model.js';
export async function readAbsencePerson(query, signal) {
 const params = new URLSearchParams();
 for (const [key,value] of Object.entries(query)) {
  if (value !== null && value !== undefined) params.set(key,String(value));
 }
 const response = await fetch('/api/internal-data?' + params, {
  method:'GET', credentials:'same-origin', cache:'no-store',
  headers:{Accept:'application/json'},
  signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])
 });
 if (!response.ok) {
  await response.body?.cancel();
  throw Object.assign(Error('ABSENCE_PERSON_READ_FAILED'),{status:response.status});
 }
 if (!response.headers.get('content-type')?.includes('application/json') ||
     !response.headers.get('cache-control')?.includes('no-store')) {
  await response.body?.cancel();
  throw Error('ABSENCE_PERSON_RESPONSE_INVALID');
 }
 const reader = response.body.getReader(), parts = [];
 let size = 0;
 try {
  for (;;) {
   const part = await reader.read();
   if (part.done) break;
   size += part.value.byteLength;
   if (size > 256*1024) throw Error('ABSENCE_PERSON_RESPONSE_LIMIT');
   parts.push(part.value);
  }
 } finally {
  await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
 const bytes = new Uint8Array(size);
 let position = 0;
 for (const part of parts) { bytes.set(part,position); position += part.length; }
 const payload = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if (payload.ok !== true) throw Error('ABSENCE_PERSON_RESPONSE_INVALID');
 return verifyAbsencePersonResponse(payload.data,query);
}
