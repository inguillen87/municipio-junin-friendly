// Synthetic transport only. This module is imported by tests/harness, never by the panel.
import fs from 'node:fs/promises';
import {OWN_CLOSE_NOMINAL} from '../../assets/own-payroll-close-model.js';
const FULL='application/vnd.municontrol.payroll-full.v1+json';
const data=JSON.parse(await fs.readFile(new URL('./own-cajas-native-bundles.json',import.meta.url),'utf8'));
export const fixtureInput=choice=>structuredClone(data[choice]);
export const fixtureScope=(codes=['100','110','120','210','310'],jurisdiction='55')=>({
 period:'2026-08',types:['monthly'],jurisdiction,unit:'money',nature:'all',
 population:'complete_closed_participations',conceptCodes:codes,
});
export function syntheticApi(choice='55'){
 const input=fixtureInput(choice),state={calls:[],bytes:0,authReads:0,groupReads:0,detailReads:0,
  denied:0,accountChanged:false,mutate:null,prefix:'',prefixFor:null,delay:null,cancelled:0,
  announcedJsonBytes:undefined,multibyteAuth:false,keepOpenFor:null,responses:[],
  // large({params}) → true: ese cierre no entra en JSON común (422 OWN_CLOSE_LIMIT) y sólo se entrega en modo completo.
  large:null,fullContentType:FULL,accepts:[]};
 function auth(){return {ok:true,authenticated:true,sessionVersion:2,
  user:{id:state.accountChanged?'synthetic-other':state.multibyteAuth?'synthetic-ñ':'synthetic-user',email:'qa@example.invalid'},
  access:{context:'tenant',tenant:{id:'00000000-0000-4000-8000-000000000001',roleKey:'synthetic-reviewer'},
   tenantCapabilities:[...OWN_CLOSE_NOMINAL]},expiresAt:new Date(Date.now()+3600000).toISOString()};}
 async function fetchImpl(url,options={}){
  if(options.method!=='GET'||options.credentials!=='same-origin'||options.cache!=='no-store')
   throw Error('SYNTHETIC_ONLY_GET');
  const parsed=new URL(url,'http://127.0.0.1'),params=Object.fromEntries(parsed.searchParams);
  const close=parsed.pathname==='/api/internal-own-payroll-close',large=close&&state.large?.({params,state})===true;
  const full=options.headers?.Accept===FULL;
  // El modo completo sólo se admite para un cierre que este servidor sintético declaró grande.
  if(options.headers?.Accept!=='application/json'&&!(full&&large))throw Error('SYNTHETIC_NO_FULL_NEGOTIATION');
  state.accepts.push(full?'full':'common');
  state.calls.push({path:parsed.pathname,resource:params.resource??'auth'});
  if(state.delay)await state.delay({path:parsed.pathname,params,signal:options.signal});
  let payload,status=200;
  if(state.denied){status=state.denied;payload={ok:false,code:'SYNTHETIC_DENIED',error:'synthetic'};}
  else if(parsed.pathname==='/api/internal-auth'){state.authReads++;payload=auth();}
  else if(parsed.pathname==='/api/internal-own-payroll-close'&&params.resource==='detail'){
   state.detailReads++;const detail=input.details.find(item=>item.period===params.period&&item.liquidationType===params.liquidationType);
   if(!detail)throw Error('SYNTHETIC_UNKNOWN_DETAIL');payload={ok:true,data:structuredClone(detail)};
  }else if(parsed.pathname==='/api/internal-own-payroll-close'&&params.resource==='group'){
   state.groupReads++;const receipt=input.receipts.find(item=>item.groupId===params.id);
   if(!receipt)throw Error('SYNTHETIC_UNKNOWN_GROUP');payload={ok:true,data:structuredClone(receipt)};
  }else throw Error('SYNTHETIC_UNEXPECTED_ENDPOINT');
  if(state.mutate){const changed=await state.mutate({payload,status,path:parsed.pathname,params,state});
   if(changed){payload=changed.payload??payload;status=changed.status??status;}}
  if(large&&!full&&status===200){status=422;payload={ok:false,code:'OWN_CLOSE_LIMIT',error:'El conjunto completo supera la capacidad de recuperación de esta API.'};}
  const json=JSON.stringify(payload),payloadBytes=new TextEncoder().encode(json).byteLength;
  const prefix=state.prefixFor?state.prefixFor({path:parsed.pathname,params,payloadBytes}):state.prefix;
  const text=prefix+json,bytes=new TextEncoder().encode(text);state.bytes+=bytes.length;
  const metrics={path:parsed.pathname,params,wireBytes:bytes.byteLength,textCodeUnits:text.length,totalBytesAfter:state.bytes};
  const announced=state.announcedJsonBytes===null?null:typeof state.announcedJsonBytes==='function'
   ?state.announcedJsonBytes(metrics):String(bytes.byteLength);
  state.responses.push({...metrics,announced});
  const keepOpen=state.keepOpenFor?.(metrics)===true;
  const stream=new ReadableStream({
   start(controller){controller.enqueue(bytes);if(!keepOpen)controller.close();},
   cancel(){state.cancelled++;},
  });
  const headers={'Content-Type':large&&full&&status===200?state.fullContentType:'application/json'};
  if(announced!==null&&announced!==undefined)headers['x-municontrol-json-bytes']=String(announced);
  return new Response(stream,{status,headers});
 }
 return {input,state,fetchImpl};
}
