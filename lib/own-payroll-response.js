import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';

const drain=res=>new Promise((resolve,reject)=>{
 const clear=()=>{res.removeListener('drain',ready);res.removeListener('error',failed);res.removeListener('close',closed);};
 const ready=()=>{clear();resolve();},failed=e=>{clear();reject(e);},closed=()=>failed(Error('OWN_RUN_UNAVAILABLE'));
 res.once('drain',ready);res.once('error',failed);res.once('close',closed);if(res.destroyed)closed();
});

export function supportsOwnPayrollStream(res){return typeof res.write==='function'&&typeof res.end==='function'&&typeof res.once==='function';}
export async function sendOwnPayrollStream(res,status,data){
 const bytes=Buffer.from(JSON.stringify({ok:true,data}),'utf8');
 if(bytes.length>OWN_RUN_FULL_MAX_BYTES)throw Error('OWN_RUN_LIMIT');
 if(!supportsOwnPayrollStream(res))throw Error('OWN_RUN_UNAVAILABLE');
 res.status(status);res.setHeader('Content-Type',OWN_RUN_FULL_JSON+'; charset=utf-8');
 res.setHeader('X-MuniControl-JSON-Bytes',String(bytes.length));
 // No Content-Length: use the Node streaming response supported by Vercel.
 for(let offset=0;offset<bytes.length;offset+=64*1024){
  if(res.destroyed)throw Error('OWN_RUN_UNAVAILABLE');
  if(!res.write(bytes.subarray(offset,offset+64*1024)))await drain(res);
 }
 res.end();
}
