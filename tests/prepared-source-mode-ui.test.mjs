// Synthetic DOM/event test for the real mount function. No browser, network, database or approval call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourcePath=process.env.MC_OWNER_WORKSPACE_SOURCE??fileURLToPath(new URL('../assets/municipal-owner-adoption-workspace.js',import.meta.url));
const modes=[
 ['mixed-bootstrap','Activos conocidos; conservar los pendientes aparte'],
 ['operational-bootstrap','Personal activo con fecha de ingreso'],
 ['registry-bootstrap','Personal activo con datos originales'],
 ['final-active-bootstrap','Personal activo completo'],
 ['final-bootstrap','Fuente histórica completa'],
];
class Element {
 constructor(key=''){this.key=key;this.hidden=key==='panel';this.disabled=false;this.value='';this.checked=false;this.children=[];this.dataset={};this.listeners=new Map();this.isConnected=true;this.attributes=new Map();this.textContent='';}
 addEventListener(name,fn){const a=this.listeners.get(name)??[];a.push(fn);this.listeners.set(name,a);}
 async emit(name,event={}){for(const fn of this.listeners.get(name)??[])await fn(event);}
 append(...elements){this.children.push(...elements);}
 replaceChildren(...elements){this.children=[...elements];}
 querySelectorAll(){return [];}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 focus(){this.focused=true;}
 closest(){return null;}
}
async function harness(){
 const elements=new Map(),host=new Element('host');
 host.querySelector=selector=>{const key=/^\[data-moa-([a-z-]+)\]$/.exec(selector)?.[1];assert.ok(key,'selector from actual UI');if(!elements.has(key))elements.set(key,new Element(key));return elements.get(key);};
 const events=new Map(),document={hidden:false,createElement:tag=>new Element(tag),getElementById:()=>null,addEventListener:(name,fn)=>{const a=events.get(name)??[];a.push(fn);events.set(name,a);}};
 const window={addEventListener:()=>{}};
 let state={busy:false,context:null,history:null,sources:null,proposal:null,review:null,preview:null,pending:null,retryReady:false,receipt:null,message:''};
 let notify,failNext=false;
 const calls=[];
 const patch=value=>{state={...state,...value};notify(state);};
 const machine={
  getState:()=>state,
  resetPreview(){calls.push({operation:'resetPreview'});patch({review:null,preview:null});},
  async loadSources(mode){calls.push({operation:'loadSources',mode});patch({busy:true});if(failNext){failNext=false;patch({busy:false,message:'synthetic unavailable'});throw Error('synthetic unavailable');}patch({busy:false,sources:{version:mode==='prepared'?'employment-adoption-prepared-sources.v1':mode==='mixed'?'employment-adoption-final-sources.v2':'employment-adoption-final-sources.v1',rows:[{revisionId:'10000000-1000-4000-8000-000000000001',packageSha256:'a'.repeat(64),cutoff:'2026-10-28T15:16:35'}]}});},
  invalidate(){patch({context:null,history:null,sources:null,proposal:null,review:null,preview:null});},
  send(){throw Error('No decision is allowed in this source-selection test');},
  chooseSource(){throw Error('No source may be auto-selected');},
  useReview(){throw Error('No proposal preview is requested in this test');},
 };
 const context=vm.createContext({document,window});
 const dependencyMap={
  './municipal-owner-adoption-workspace-model.js':{OWNER_SOURCE_MODES:modes,createOwnerAdoptionWorkspace:options=>{notify=options.onChange;return machine;}},
  './employment-adoption-changes-ui.js':{appendAdoptionChanges:()=>{}},
  './employment-adoption-mixed-cohort.js':{MIXED_ADOPTION_COHORT:'active-known-with-entry.v1'},
 };
 const module=new vm.SourceTextModule(await fs.readFile(sourcePath,'utf8'),{context,identifier:sourcePath});
 await module.link(async specifier=>{const exports=dependencyMap[specifier];assert.ok(exports,'known dependency only');return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:specifier});});
 await module.evaluate();
 module.namespace.mountMunicipalOwnerAdoption(host,{isLive:()=>true,onApplied:()=>{throw Error('No adoption may occur');}});
 for(const fn of events.get('municontrol:capabilities-ready')??[])fn({detail:{tenantCapabilities:['workforce.employee.read','employee.record.propose']}});
 await elements.get('open').emit('click');
 patch({context:{synthetic:true},proposal:{proposalId:'10000000-1000-4000-8000-000000000002',total:1}});
 const choose=async value=>{elements.get('mode').value=value;await elements.get('mode').emit('change');};
 return{choose,calls,elements,state:()=>state,failOnce:()=>{failNext=true;},loads:()=>calls.filter(c=>c.operation==='loadSources').map(c=>c.mode)};
}
for(const mode of modes.filter(([mode])=>mode!=='mixed-bootstrap').map(([mode])=>mode)){
 test('first explicit '+mode+' loads prepared catalog without auto-selecting a cut',async()=>{
  const h=await harness();assert.equal(h.state().sources,null);await h.choose(mode);
  assert.deepEqual(h.loads(),['prepared']);
  assert.equal(h.elements.get('source').children.length,2);
  assert.equal(h.elements.get('source').value,'');
  assert.equal(h.state().preview,null);
  assert.equal(h.elements.get('preview').disabled,true);
 });
}
test('first explicit mixed scope loads prepared catalog and preserves empty choice',async()=>{
 const h=await harness();await h.choose('mixed-bootstrap');
 assert.deepEqual(h.loads(),['prepared']);assert.equal(h.state().sources.version,'employment-adoption-prepared-sources.v1');
 assert.equal(h.elements.get('source').value,'');assert.equal(h.state().preview,null);
});
test('all explicit source modes reuse the prepared catalog while resetting the preview',async()=>{
 const h=await harness();
 for(const mode of ['final-active-bootstrap','registry-bootstrap','operational-bootstrap','final-bootstrap','mixed-bootstrap','final-active-bootstrap'])await h.choose(mode);
 assert.deepEqual(h.loads(),['prepared']);
 assert.equal(h.calls.filter(c=>c.operation==='resetPreview').length,6);
 assert.equal(h.state().sources.version,'employment-adoption-prepared-sources.v1');
 assert.equal(h.elements.get('source').value,'');assert.equal(h.state().preview,null);
});
test('failed initial catalog load can retry the same explicit family while sources remains null',async()=>{
 const h=await harness();h.failOnce();await h.choose('final-active-bootstrap');
 assert.equal(h.state().sources,null);assert.equal(h.state().preview,null);assert.equal(h.state().busy,false);
 await h.choose('final-active-bootstrap');
 assert.deepEqual(h.loads(),['prepared','prepared']);assert.equal(h.state().sources.version,'employment-adoption-prepared-sources.v1');
 assert.equal(h.elements.get('source').value,'');assert.equal(h.state().preview,null);
});

