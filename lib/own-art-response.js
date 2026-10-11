// Verify the whole source before streaming any bytes. Never stream row subsets.
import {OWN_ART_MAX_BYTES} from '../assets/own-art-report-model.js';
function drain(res){return new Promise((resolve,reject)=>{
 const cleanup=()=>{res.off('drain',ready);res.off('close',closed);res.off('error',failed);};
 const ready=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(Error('OWN_ART_STREAM_CLOSED'));},failed=()=>{cleanup();reject(Error('OWN_ART_STREAM_CLOSED'));};
 res.once('drain',ready);res.once('close',closed);res.once('error',failed);
});}
export async function sendOwnArtSource(res,data){
 const bytes=Buffer.from(JSON.stringify({ok:true,data}),'utf8');
 if(bytes.length>OWN_ART_MAX_BYTES)throw Error('OWN_ART_LIMIT');
 // In-memory response doubles used by actual-handler/browser QA have no socket.
 if(typeof res.write!=='function'||typeof res.end!=='function')return res.status(200).json({ok:true,data});
 res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');
 for(let offset=0;offset<bytes.length;offset+=65536){
  if(res.destroyed)throw Error('OWN_ART_STREAM_CLOSED');
  if(!res.write(bytes.subarray(offset,offset+65536)))await drain(res);
 }
 res.end();
}
