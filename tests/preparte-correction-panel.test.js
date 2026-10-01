// Executes the actual preparte panel, real model/export and atomic sheet adapter
// against a small DOM/API double. This is not browser or municipal acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../assets/attendance-preparte-model.js';
import {preparteXlsx} from '../assets/attendance-preparte-export.js';
import {appendPreparteRows} from '../assets/payroll-novelty-sheet-model.js';
import {correctionPreparte} from './fixtures/preparte-correction-synthetic.js';

async function panel(count=60){
  const sourceData=await correctionPreparte(count),requests=[],transfers=[],downloads=[],confirms=[],listeners=new Map();
  const state={allowed:true,period:'2026-09',payrollType:'monthly',hold:null,deny:false,sheet:[],confirm:true,changed:false};
  let focused=null;
  const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.events={};this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];this.textContent='';}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(type,fn){this.events[type]=fn;}
    emit(type){return this.events[type]?.();}
    click(){if(this.tagName==='a'){downloads.push(this);return;}if(!this.disabled)return this.emit('click');}
    focus(){focused=this;}
    scrollIntoView(){}
    remove(){}
    matches(selector){
      if(selector.startsWith('[')){const match=/^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);return match&&Object.hasOwn(this.dataset,camel(match[1]))&&(match[2]===undefined||String(this.dataset[camel(match[1])])===match[2]);}
      return this.tagName===selector;
    }
    querySelectorAll(selector){const selectors=selector.split(','),found=[];const visit=node=>{for(const child of node.children){if(selectors.some(s=>child.matches(s)))found.push(child);visit(child);}};visit(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    set innerHTML(html){
      this.children=[];
      for(const tag of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)){
        const match=/\bdata-(ap-[\w-]+)(?:="([^"]*)")?/.exec(tag[2]);if(!match)continue;
        const node=new Element(tag[1]);node.dataset[camel(match[1])]=match[2]??'';node.hidden=/\bhidden\b/.test(tag[2]);
        if(match[1]==='ap-site')node.value='pm-10';if(match[1]==='ap-filter')node.value='all';this.append(node);
      }
    }
  }
  const host=new Element('details'),q=attr=>{const node=host.querySelector('[data-ap-'+attr+']');assert.ok(node,'actual panel includes '+attr);return node;};
  const document={hidden:false,body:new Element('body'),createElement:tag=>new Element(tag),addEventListener:(type,fn)=>listeners.set(type,fn)};
  const fetch=async(url,options)=>{
    assert.ok(url.startsWith('/api/internal-attendance?'),'only the existing read endpoint');assert.equal(options.method,undefined,'no POST');
    requests.push({url,options});if(state.hold)await state.hold;
    if(state.deny)return new Response(JSON.stringify({error:'Acceso retirado'}),{status:403});
    const result=structuredClone(sourceData);if(state.changed)result.evidenceHash='f'.repeat(64);
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  };
  const source=fs.readFileSync('assets/attendance-preparte-panel.js','utf8');
  const context={...model,preparteXlsx,document,fetch,Map,Set,URLSearchParams,AbortSignal,Blob,setTimeout,
    URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},window:{confirm:message=>{confirms.push(message);return state.confirm;}}};
  vm.createContext(context);vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function mountAttendancePreparte','function mountAttendancePreparte'),context);
  const controller=context.mountAttendancePreparte(host,{canUse:()=>state.allowed,period:()=>state.period,payrollType:()=>state.payrollType,
    onUse:async value=>{state.sheet=appendPreparteRows(state.sheet,value.rows);transfers.push(value);},onDenied(){}});
  const rows=()=>q('rows').children.filter(row=>row.dataset.apKey);
  const field=(key,name)=>host.querySelector(`[data-ap-key="${key}"]`)?.querySelector(`[data-ap-field="${name}"]`);
  const edit=(key,name,value)=>{const input=field(key,name);assert.ok(input,'rendered field '+name);input.value=value;input.emit('input');};
  async function selectAll(){
    await q('load').click();
    for(let page=0;page<Math.ceil(count/25);page++){
      for(const row of rows()){const key=row.dataset.apKey;edit(key,'cap','3');const input=field(key,'selected');input.checked=true;input.emit('change');}
      if(page+1<Math.ceil(count/25))q('next').click();
    }
    q('reference').value='Listado sintético de Personal, versión 1';q('reference').emit('input');q('reviewed').checked=true;q('reviewed').emit('change');
  }
  return{host,q,state,document,controller,requests,transfers,downloads,confirms,sourceData,selectAll,field,edit,
    focused:()=>focused,visibility:()=>listeners.get('visibilitychange')?.(),
    hold:()=>{let release;state.hold=new Promise(resolve=>{release=resolve;});return()=>{state.hold=null;release();};}};
}

test('all corrections across pages and filters are shown, and a link focuses the exact earlier field',async()=>{
  const h=await panel();await h.selectAll();
  h.edit(h.sourceData.rows[59].key,'hours','05:00');h.q('prev').click();h.q('prev').click();
  h.edit(h.sourceData.rows[0].key,'cap','0');h.q('reviewed').checked=true;h.q('reviewed').emit('change');
  h.q('search').value='Persona QA 60';h.q('search').emit('input');const before=h.requests.length;
  await h.q('use').click();assert.equal(h.transfers.length,0);assert.equal(h.requests.length,before);assert.equal(h.confirms.length,0);
  assert.match(h.q('correction-count').textContent,/2 correcciones pendientes en 60 filas/);
  const link=h.host.querySelector(`[data-ap-correction-key="${h.sourceData.rows[0].key}"]`);link.click();
  assert.equal(h.q('search').value,'');assert.equal(h.q('filter').value,'all');
  assert.equal(h.focused(),h.field(h.sourceData.rows[0].key,'percent'));assert.match(h.q('count').textContent,/Página 1/);
  assert.equal(h.field(h.sourceData.rows[0].key,'cap').value,'0','navigation preserves entered work');
});

test('correction updates all errors live and valid transfer includes the whole selection despite a filter',async()=>{
  const h=await panel();await h.selectAll();h.edit(h.sourceData.rows[59].key,'hours','05:00');
  h.q('reviewed').checked=true;await h.q('use').click();assert.equal(h.transfers.length,0);
  h.edit(h.sourceData.rows[59].key,'hours','04:00');assert.equal(h.q('reviewed').checked,false);
  assert.match(h.q('correction-count').textContent,/1 corrección pendiente/);
  h.q('reviewed').checked=true;h.q('reviewed').emit('change');assert.match(h.q('correction-count').textContent,/60 filas seleccionadas revisadas sin correcciones/);
  h.q('search').value='Persona QA 60';h.q('search').emit('input');await h.q('use').click();
  assert.equal(h.transfers.length,1);assert.equal(h.transfers[0].rows.length,60);assert.equal(h.state.sheet.length,60);
  assert.equal(h.confirms.length,1);assert.match(h.confirms[0],/60 filas/);assert.equal(h.q('corrections').hidden,true);
  assert.equal(h.requests.length,2);assert.ok(h.requests[1].url.includes('evidence='));
});

test('global documentation correction navigates directly to its field',async()=>{
  const h=await panel();await h.selectAll();h.q('reference').value='';h.q('check').click();
  assert.match(h.q('correction-count').textContent,/1 corrección pendiente/);
  h.host.querySelector('[data-ap-correction-field="reference"]').click();assert.equal(h.focused(),h.q('reference'));
});

for(const change of [h=>h.edit(h.sourceData.rows[59].key,'cap','0'),h=>h.state.allowed=false,
  h=>{h.q('reference').value='Otra versión documental';h.q('reference').emit('input');},
  h=>{h.q('reviewed').checked=false;h.q('reviewed').emit('change');},
  h=>h.controller.setDisabled(true),h=>{h.state.payrollType='first-fortnight';},
  h=>{h.document.hidden=true;h.visibility();},h=>{h.state.period='2026-10';h.controller.periodChanged();},
  h=>h.controller.clear()])test('late verification cannot transfer a changed selection, revoked or retired context: '+change,async()=>{
  const h=await panel();await h.selectAll();const release=h.hold(),pending=h.q('use').click();change(h);release();await pending;
  assert.equal(h.transfers.length,0);assert.equal(h.state.sheet.length,0);assert.equal(h.downloads.length,0);
});

test('changed evidence or server denial never append part of the selection',async()=>{
  for(const type of ['changed','deny']){
    const h=await panel();await h.selectAll();h.state[type]=true;await h.q('use').click();
    assert.equal(h.transfers.length,0);assert.equal(h.state.sheet.length,0);
    if(type==='deny'){assert.equal(h.q('result').hidden,true);assert.equal(h.q('correction-list').children.length,0);}
  }
});

test('double click only verifies once and the atomic sheet adapter blocks duplicate dedicated concepts',async()=>{
  const h=await panel();await h.selectAll();const release=h.hold(),pending=h.q('use').click();await h.q('use').click();
  assert.equal(h.requests.length,2);release();await pending;assert.equal(h.transfers.length,1);
  assert.ok(h.state.sheet.every(row=>row[5]===''));
});

test('a dedicated concept already on the sheet rejects the whole reviewed transfer',async()=>{
  const h=await panel();await h.selectAll();
  const existing=[h.sourceData.rows[0].legajo,'95','','','100','','','Referencia sintética','', 'NO'];
  h.state.sheet=[existing];await h.q('use').click();
  assert.deepEqual(h.state.sheet,[existing]);assert.equal(h.transfers.length,0);
  assert.match(h.q('status').textContent,/ya tiene mayor dedicación/);
  h.q('prev').click();h.q('prev').click();assert.equal(h.field(h.sourceData.rows[0].key,'selected').checked,true);
});

test('discard and page hiding retire correction text and row fields',async()=>{
  const h=await panel();await h.selectAll();h.edit(h.sourceData.rows[59].key,'cap','0');h.q('check').click();
  assert.equal(h.q('corrections').hidden,false);h.document.hidden=true;h.visibility();
  assert.equal(h.q('corrections').hidden,true);assert.equal(h.q('correction-list').children.length,0);
  assert.equal(h.q('rows').children.length,0);assert.equal(h.q('reference').value,'');
});

test('initial read cannot repopulate nominal fields after local access withdrawal',async()=>{
  const h=await panel(),release=h.hold(),pending=h.q('load').click();
  h.state.allowed=false;h.controller.refreshAccess();release();await pending;
  assert.equal(h.q('result').hidden,true);assert.equal(h.q('rows').children.length,0);
  assert.equal(h.q('corrections').hidden,true);assert.equal(h.q('correction-list').children.length,0);
  assert.equal(h.q('use').disabled,true);assert.equal(h.q('export').disabled,true);
  assert.equal(h.transfers.length,0);assert.equal(h.downloads.length,0);
});
