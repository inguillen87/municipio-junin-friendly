// Closed, non-nominal phase events. No request, URL, principal, SQL, payload,
// cookie or Error object is accepted. Timing/logging cannot change the result.
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
const ROUTES=new Set(['internal-data:employees','internal-data:employee','internal-family-certificates:family','internal-family-certificates:report','internal-auth']);
const PHASES=new Set(['access','source-client','runtime-client','source-before','source-after','native-before','native-after','directory','employee-detail','family-read']);
export function createInternalReadTiming({route,emit=event=>console.info('[internal-read-timing]',event),clock=()=>performance.now()}={}){
 if(!ROUTES.has(route)||typeof emit!=='function'||typeof clock!=='function')throw TypeError('READ_TIMING_CLOSED_INPUT');
 const requestId=randomUUID();let sequence=0,finished=false;
 const readClock=()=>{try{const n=clock();return Number.isFinite(n)?n:null;}catch{return null;}};
 const started=readClock(),elapsed=from=>{const n=readClock();return from===null||n===null||n<from?null:Math.round((n-from)*1000)/1000;};
 const report=(event,phase,seq,elapsedMs)=>{try{Promise.resolve(emit(Object.freeze({version:'internal-read-phase-timing.v1',requestId,route,event,phase,sequence:seq,elapsedMs}))).catch(()=>{});}catch{/* Telemetry never authorizes, retries or fails the application request. */}};
 report('request-start','request',0,null);
 return Object.freeze({
  async measure(phase,work){
   if(!PHASES.has(phase)||typeof work!=='function'||finished)throw TypeError('READ_TIMING_CLOSED_PHASE');
   const seq=++sequence,start=readClock();report('phase-start',phase,seq,null);
   try{const result=await work();report('phase-end',phase,seq,elapsed(start));return result;}
   catch(error){report('phase-error',phase,seq,elapsed(start));throw error;}
  },
  finish(){if(!finished){finished=true;report('request-end','request',sequence,elapsed(started));}}
 });
}
