import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../assets/payroll-grh-import-model.js';
import {GrhTxtInputError} from '../assets/payroll-grh-input.js';

// Browser-safe client only. No legacy server harness, resolver or SQL fixture.
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const line=(dni='00012345',amount='1234.56',padding=31)=>'00001'+dni+' '.repeat(padding)+amount.padStart(11,' ');
const bytes=rows=>new TextEncoder().encode(rows.join('\r\n')+'\r\n');
async function localPanel(t,{prepareBarrier}={}){
 class Element{
  constructor(tag='div'){this.tagName=tag;this.value='';this.textContent='';this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.attributes={};this.open=false;}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];delete this[k];}focus(){}remove(){}
 }
 const html=fs.readFileSync(new URL('../importar-novedades-grh.html',import.meta.url),'utf8'),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element()]));
 const find=id=>elements.get(id),q=id=>{assert.ok(find(id),'element exists in actual HTML: '+id);return find(id);},requests=[],listeners=new Map(),windowListeners=new Map();
 const document={hidden:false,body:new Element(),getElementById:q,createElement:tag=>new Element(tag),addEventListener:(type,fn)=>listeners.set(type,fn)};
 const caps=[...model.GRH_IMPORT_CAPABILITIES],window={MuniControlCapabilityGate:{ready:Promise.resolve({tenantCapabilities:caps})},addEventListener:(type,fn)=>windowListeners.set(type,fn)};
 const fetch=async(url,options={})=>{requests.push({url,method:options.method??'GET',body:options.body});if(options.body){assert.equal(JSON.parse(options.body).command,'grhPreview','no prepare/write is allowed');return new Response(JSON.stringify({ok:false,code:'PAYROLL_NOVELTY_GRH_INPUT_INVALID',details:{issues:[{line:1,message:'PERSONAL_DATA_NOT_FOR_DISPLAY'}]}}),{status:422,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});}assert.equal(url,'/api/internal-payroll-novelties?resource=bootstrap');return new Response(JSON.stringify({ok:true,principal:{tenantId:uid(1),membershipId:uid(2),certifiedBindingId:uid(3),capabilities:caps}}),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});};
 const source=fs.readFileSync(new URL('../assets/payroll-grh-import-panel.js',import.meta.url),'utf8'),executable=source.replace(/^import (\{[^\n]+\}) from '\.\/payroll-grh-import-model\.js';/,'const $1 = model;');assert.notEqual(source,executable);let retainedBytes=()=>null;
 const panelModel=prepareBarrier?{...model,grhFileRequest:async(...args)=>{const prepared=await model.grhFileRequest(...args);await prepareBarrier();return prepared;}}:model;
 await vm.runInNewContext('(async()=>{'+executable+'\ncaptureBytes(()=>bytes);})()',{model:panelModel,document,window,fetch,captureBytes:read=>{retainedBytes=read;},Uint8Array,Map,Set,AbortController,AbortSignal,TextDecoder,Blob,crypto:globalThis.crypto,structuredClone,setTimeout,clearTimeout,URL,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}}});
 q('concept').value='614';q('period').value='2026-10';
 const event=(type,detail)=>listeners.get(type)?.({detail}),dispose=()=>windowListeners.get('pagehide')?.();t.after(dispose);
 const text=element=>!element?'':element.textContent+' '+element.children.map(text).join(' ');
 return {q,find,requests,document,event,dispose,text,retainedBytes:()=>retainedBytes(),setFile(input,name='private-employee-file.txt'){q('file').files=[{name,size:input.length,arrayBuffer:async()=>input.slice().buffer}];},review:()=>q('importForm').onsubmit({preventDefault(){}})};
}

test('local reader issues retain source line and reason before any preview POST',async t=>{
 const h=await localPanel(t);h.setFile(bytes([line(),line('00054321','1234.56',30),line('00012345','10.00')]));await h.review();assert.match(h.q('progress').textContent,/2 filas por revisar/);
 assert.equal(h.find('readIssues')?.children.length,2);assert.match(h.text(h.find('readIssues')),/Fila 2:.*55 posiciones.*54/);assert.match(h.text(h.find('readIssues')),/Fila 3:.*filas 1 y 3/);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.equal(h.q('saveButton').disabled,true);assert.equal(h.q('downloadIncidents').disabled,true);
});
test('all61 local errors remain accessible, including the last page worth of rows',async t=>{
 const h=await localPanel(t);h.setFile(bytes(Array.from({length:61},()=>line('00012345','1234.56',30))));await h.review();assert.equal(h.find('readIssues')?.children.length,61);assert.match(h.text(h.find('readIssues')),/Fila 61:/);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('all2000 rejected source rows remain available without a preview or partial preparation',async t=>{
 const h=await localPanel(t);h.setFile(bytes(Array.from({length:2000},()=>line('00012345','1234.56',30))));await h.review();assert.equal(h.q('readIssues').children.length,2000);assert.match(h.text(h.q('readIssues').children.at(-1)),/^Fila 2000:/);assert.equal(h.q('readIssuePanel').open,true);assert.equal(h.q('readIssuePanel').hidden,false);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('reader reasons contain neither source identifiers, amounts, raw records nor the private filename',async t=>{
 const h=await localPanel(t);h.setFile(bytes([line('00054321','98765.43'),line('00012345','NOMBRE_X'),line('00054321','10.00')]),'PERSONAL_FILE_99000001.txt');await h.review();const text=h.text(h.q('readIssues'));assert.match(text,/Fila 2:.*punto y dos decimales/);assert.match(text,/Fila 3:.*filas 1 y 3/);assert.match(text,/esta importación no agrupa registros/);assert.doesNotMatch(text,/54321|12345|98765|10\.00|NOMBRE_X|PERSONAL_FILE|99000001|elegí explícitamente agrupar/);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('only dense bounded local error records are rendered; unknown text gets a fixed safe explanation',()=>{
 const issue={line:1,code:'GRH_ROW_INVALID',message:'DNI ausente o inválido. No se interpreta como legajo.'},error=rows=>new GrhTxtInputError('GRH_FILE_INVALID','Invalid synthetic source',rows);
 const valid=model.grhReadIssues(error([issue]));assert.ok(Object.isFrozen(valid));assert.ok(Object.isFrozen(valid[0]));assert.equal(valid.length,1);
 assert.equal(model.grhReadIssues(Object.assign(Error('not local'),{name:'GrhTxtInputError',code:'GRH_FILE_INVALID',issues:[issue]})).length,0);
 for(const value of [[{...issue,line:0}],[{...issue,line:2001}],[{...issue,line:'1'}],[issue,issue],[{...issue,line:2},issue],[{...issue,raw:'PRIVATE'}],[{...issue,code:'UNRECOGNIZED'}],Array(2),Array.from({length:2001},(_,i)=>({...issue,line:i+1}))])assert.equal(model.grhReadIssues(error(value)).length,0);
 const unknown=model.grhReadIssues(error([{...issue,message:'PERSONA 99000001 importe98765.43 <img onerror=alert(1)>'}]));assert.equal(unknown.length,1);assert.doesNotMatch(unknown[0].message,/PERSONA|99000001|98765|<|>/);assert.match(unknown[0].message,/Revisá esta fila/);
});
test('file/selection changes, clear, pagehide, hiding and capability withdrawal retire every local issue',async t=>{
 for(const cause of ['file','concept','period','profile','payrollType','clear','pagehide','hidden','revoked']){
  const h=await localPanel(t);h.setFile(bytes([line('00012345','1234.56',30)]));await h.review();assert.equal(h.q('readIssuePanel').hidden,false);
  if(cause==='file')h.q('file').onchange();else if(['concept','period','profile','payrollType'].includes(cause))h.q(cause).oninput();else if(cause==='clear')h.q('clearButton').onclick();else if(cause==='pagehide')h.dispose();else if(cause==='hidden'){h.document.hidden=true;h.event('visibilitychange');}else h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
  assert.equal(h.q('readIssuePanel').hidden,true,cause);assert.equal(h.q('readIssuePanel').open,false,cause);assert.equal(h.q('readIssues').children.length,0,cause);assert.equal(h.requests.filter(r=>r.method==='POST').length,0,cause);
 }
});
test('valid replacement removes old local issues and reaches only a preview request, never a preparation',async t=>{
 const h=await localPanel(t);h.setFile(bytes([line('00012345','1234.56',30)]));await h.review();h.setFile(bytes([line()]));h.q('file').onchange();await h.review();const posts=h.requests.filter(r=>r.method==='POST');assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].body).command,'grhPreview');assert.equal(h.q('readIssuePanel').hidden,true);assert.equal(h.q('readIssues').children.length,0);assert.doesNotMatch(h.text(h.q('readIssues'))+h.q('progress').textContent,/PERSONAL_DATA_NOT_FOR_DISPLAY/);assert.equal(h.q('saveButton').disabled,true);
});
test('global record-limit or encoding failures do not invent a row-level report',async t=>{
 for(const input of [bytes(Array.from({length:2001},()=>line())),new Uint8Array([0])]){const h=await localPanel(t);h.setFile(input);await h.review();assert.equal(h.q('readIssuePanel').hidden,true);assert.equal(h.q('readIssues').children.length,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);}
});
test('starting a new review clears the old errors before reading and cancellation drops a late buffer',async t=>{
 const h=await localPanel(t),input=bytes([line('00012345','1234.56',30)]);h.setFile(input);await h.review();let release;h.q('file').files[0].arrayBuffer=()=>new Promise(resolve=>{release=resolve;});const reviewing=h.review();while(!release)await new Promise(resolve=>setImmediate(resolve));assert.equal(h.q('readIssuePanel').hidden,true);assert.equal(h.q('readIssues').children.length,0);h.q('cancelReview').onclick();release(input.slice().buffer);await reviewing;assert.equal(h.q('readIssuePanel').hidden,true);assert.equal(h.q('readIssues').children.length,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('hiding or revoking access during a file read prevents late local issues from returning',async t=>{
 for(const cause of ['hidden','revoked']){const h=await localPanel(t),input=bytes([line('00012345','1234.56',30)]);h.setFile(input);let release;h.q('file').files[0].arrayBuffer=()=>new Promise(resolve=>{release=resolve;});const reviewing=h.review();while(!release)await new Promise(resolve=>setImmediate(resolve));if(cause==='hidden'){h.document.hidden=true;h.event('visibilitychange');}else h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});release(input.slice().buffer);await reviewing;assert.equal(h.q('readIssues').children.length,0);assert.equal(h.q('readIssuePanel').hidden,true);assert.equal(h.q('entryFields').disabled,true);assert.equal(h.q('accessRecovery').hidden,false);if(cause==='revoked')assert.equal(h.q('intake').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);}
});
test('late file buffers are wiped instead of retained after cancellation, hiding or revocation',async t=>{
 for(const cause of ['cancel','hidden','revoked']){
  const h=await localPanel(t),input=bytes([line()]),late=input.slice().buffer;h.setFile(input);let release;h.q('file').files[0].arrayBuffer=()=>new Promise(resolve=>{release=resolve;});const reviewing=h.review();while(!release)await new Promise(resolve=>setImmediate(resolve));
  if(cause==='cancel')h.q('cancelReview').onclick();else if(cause==='hidden'){h.document.hidden=true;h.event('visibilitychange');}else h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
  release(late);await reviewing;assert.equal(h.retainedBytes(),null,cause+' does not adopt a stale TXT');assert.ok(new Uint8Array(late).every(value=>value===0),cause+' wipes the discarded buffer');assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 }
});
test('cancelled local preparation does not invoke a preview request after its asynchronous work finishes',async t=>{
 for(const cause of ['cancel','hidden','revoked']){
  let release;const h=await localPanel(t,{prepareBarrier:()=>new Promise(resolve=>{release=resolve;})});h.setFile(bytes([line()]));const reviewing=h.review();while(!release)await new Promise(resolve=>setImmediate(resolve));
  if(cause==='cancel')h.q('cancelReview').onclick();else if(cause==='hidden'){h.document.hidden=true;h.event('visibilitychange');}else h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
  release();await reviewing;assert.equal(h.requests.filter(r=>r.method==='POST').length,0,cause+' fences the client continuation before calling fetch');assert.equal(h.retainedBytes(),null);assert.equal(h.q('readIssuePanel').hidden,true);
 }
});
test('new component tests have a four-asset client closure, without legacy intake or SQL constructors',()=>{
 const seen=new Set(),walk=url=>{if(seen.has(url.href))return;seen.add(url.href);for(const match of fs.readFileSync(url,'utf8').matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))walk(new URL(match[1],url));};walk(new URL('../assets/payroll-grh-import-model.js',import.meta.url));assert.equal(seen.size,4);assert.ok([...seen].every(value=>/\/assets\//.test(value)&&!/(?:engine|\/lib\/|migration|fixture)/.test(value)));
 const html=fs.readFileSync(new URL('../importar-novedades-grh.html',import.meta.url),'utf8');assert.match(html,/id="readIssues"[^>]*tabindex="0"[^>]*aria-label=/);assert.match(html,/Se muestran todas las incidencias, sin datos personales/);
});
