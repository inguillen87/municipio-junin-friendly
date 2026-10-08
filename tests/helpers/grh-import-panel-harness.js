import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../../assets/payroll-grh-import-model.js';
import {reviewGrhImport,prepareGrhImport} from '../../lib/internal-grh-import.js';
import {GRH_GUARDED_PREPARE_SQL} from '../../lib/grh-import-prepare-sql.js';
import {fixture,caps,id,principal,session} from '../fixtures/grh-import-synthetic.js';

export async function panel(t,count=12,setup={}){
 const f=fixture(count),downloads=[],urls=new Map(),requests=[],listeners=new Map(),windowListeners=new Map();
 const state={deny:false,bootstrapCaps:[...caps],binding:id(4),hold:null,badReceipt:false,tenantId:id(1),membershipId:id(2),writeFailure:0,afterWrite:null,bootstrapFailure:false,...setup.state};
 let urlId=0;
 class Element{
  constructor(tag='div'){this.tagName=tag;this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.children=[];this.dataset={};this.attributes={};this.focused=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];if(key==='href')delete this.href;}
  focus(){this.focused=!this.disabled;}
  remove(){}
  click(){if(this.tagName==='a')downloads.push({name:this.download,blob:urls.get(this.href)});else return this.onclick?.();}
 }
 const html=fs.readFileSync('importar-novedades-grh.html','utf8'),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const q=id=>{assert.ok(elements.has(id),'panel element '+id+' exists in actual HTML');return elements.get(id);};
 const document={hidden:false,body:new Element(),getElementById:q,createElement:tag=>new Element(tag),addEventListener:(type,fn)=>listeners.set(type,fn)};
 const window={MuniControlCapabilityGate:{ready:setup.gate??Promise.resolve({tenantCapabilities:[...caps]})},addEventListener:(type,fn)=>windowListeners.set(type,fn)};
 const saved=new Map(),query=f.runtime.query;
 f.runtime.query=async(sql,args)=>{if(sql!==GRH_GUARDED_PREPARE_SQL)return query(sql,args);if(saved.has(args[5])){const replay=structuredClone(saved.get(args[5]));replay[0].result.receipt.replayed=true;return replay;}const result=await query(sql,args);saved.set(args[5],structuredClone(result));return result;};
 const fetch=async(url,options)=>{
  assert.ok(url.startsWith('/api/internal-payroll-novelties'),'no other API');
  requests.push({url,method:options.method??'GET',body:options.body,headers:options.headers});
  let data,status=200;
  if(!options.body){
   setup.onBootstrap?.();
   if(state.hold)await state.hold;
   if(options.signal?.aborted)throw Object.assign(Error('aborted'),{name:'AbortError'});
   if(state.bootstrapFailure)throw Error('synthetic network failure');
   if(state.bootstrapStatus){status=state.bootstrapStatus;data={ok:false};}
   else if(state.deny){status=403;data={ok:false};}
   else data={ok:true,principal:{tenantId:state.tenantId,membershipId:state.membershipId,certifiedBindingId:state.binding,capabilities:state.bootstrapCaps}};
  }else{
   const body=JSON.parse(options.body);
   if(body.command==='grhPreview')data={ok:true,replayed:false,...await reviewGrhImport(f.readSql,f.runtime,principal(),session(),body.payload)};
   else{
    assert.equal(body.command,'grhPrepare');if(state.writeFailure)return new Response(JSON.stringify({ok:false}),{status:state.writeFailure,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});data={ok:true,replayed:false,...await prepareGrhImport(f.readSql,f.runtime,principal(),session(),body.payload,options.headers['Idempotency-Key'])};
    if(state.afterWrite)await state.afterWrite();
    if(state.badReceipt){state.badReceipt=false;data.data.savedRows=0;}
   }
  }
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 };
 const source=fs.readFileSync('assets/payroll-grh-import-panel.js','utf8');
 assert.match(source,/^import \{[^\n]+\} from '\.\/payroll-grh-import-model\.js';/);
 const executable=source.replace(/^import (\{[^\n]+\}) from '\.\/payroll-grh-import-model\.js';/,'const $1 = model;');
 const mounted=vm.runInNewContext('(async()=>{'+executable+'\n})()',{model,document,window,fetch,Uint8Array,Map,Set,AbortController,AbortSignal,TextDecoder,Blob,crypto,structuredClone,setTimeout,clearTimeout,URL:{createObjectURL:blob=>{const url='blob:test-'+(++urlId);urls.set(url,blob);return url;},revokeObjectURL:url=>urls.delete(url)},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}}});
 if(!setup.deferredMount)await mounted;
 q('concept').value='614';q('period').value='2026-08';
 const bytes=Uint8Array.from(Buffer.from(f.payload.contentBase64,'base64'));
 q('file').files=[{name:'synthetic.txt',size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer}];
 const event=(type,detail)=>listeners.get(type)?.({detail});
 const dispose=()=>windowListeners.get('pagehide')?.();t.after(dispose);
 return {mounted,f,q,state,requests,downloads,urls,document,event,dispose,recheck:()=>q('recheckAccess').onclick(),hide:()=>{document.hidden=true;event('visibilitychange');},show:()=>{document.hidden=false;event('visibilitychange');},review:()=>q('importForm').onsubmit({preventDefault(){}}),download:()=>q('downloadIncidents').onclick(),hold:()=>{let release;state.hold=new Promise(resolve=>{release=resolve;});return()=>{state.hold=null;release();};}};
}
