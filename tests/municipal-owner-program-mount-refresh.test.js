import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
class Element{constructor(){this.children=[];this.fields=new Map();this.events=new Map();this.hidden=false;this.disabled=false;this.checked=false;this.value='';}querySelector(s){if(!this.fields.has(s))this.fields.set(s,new Element());return this.fields.get(s);}replaceChildren(...values){this.children=values;}append(...values){this.children.push(...values);}addEventListener(k,fn){this.events.set(k,fn);}removeEventListener(){}}
test('owner widget recomputes availability after its parent synchronously changes the enable gate',async()=>{
 const entry=fileURLToPath(new URL('../assets/municipal-owner-program-workspace.js',import.meta.url));
 const code=await build({entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'browser',logLevel:'silent'});
 const document={createElement:()=>new Element(),createTextNode:v=>v,addEventListener(){},removeEventListener(){},getElementById:()=>null};
 const context={module:{exports:{}},exports:{},document,window:{addEventListener(){},removeEventListener(){}},fetch(){throw Error('UNEXPECTED_FETCH');},AbortController,AbortSignal,crypto:{randomUUID(){throw Error('UNEXPECTED_KEY');}}};
 vm.runInNewContext(code.outputFiles[0].text,context);const host=new Element();let widget,enableDuringLock=false;
 widget=context.module.exports.mountMunicipalOwnerProgram(host,{isLive:()=>true,onLock:()=>{if(enableDuringLock)widget.setEnabled(true);}});
 widget.setEnabled(false);assert.equal(host.querySelector('[data-op-load]').disabled,true);
 enableDuringLock=true;widget.update('00000000-0000-4000-8000-000000000070');
 assert.equal(host.querySelector('[data-op-load]').disabled,false,'a stale outer render must not overwrite the freshly enabled nested render');
 enableDuringLock=false;widget.setEnabled(false);widget.suspend();assert.equal(host.querySelector('[data-op-load]').disabled,true);
 widget.destroy();
});
