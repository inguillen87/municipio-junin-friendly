// Actual shared panel against a DOM double. This does not certify browser layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as review from '../assets/payroll-novelty-review.js';
import {savedNoveltyBatch} from '../assets/payroll-native-monthly-model.js';
import {batch} from './fixtures/novelty-saved-review-synthetic.js';

function panels(){
  const created=[];
  class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.disabled=false;this._value=undefined;this._text='';this.id='';this.className='';created.push(this);}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(value){this._text=String(value);this.children=[];}
    get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
    set value(value){this._value=String(value);}
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
    replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    setAttribute(key,value){this.attributes[key]=value;}
    before(...nodes){const at=this.parent.children.indexOf(this);nodes.forEach(n=>n.parent=this.parent);this.parent.children.splice(at,0,...nodes);}
    after(...nodes){const at=this.parent.children.indexOf(this);nodes.forEach(n=>n.parent=this.parent);this.parent.children.splice(at+1,0,...nodes);}
    addEventListener(type,fn){this.listeners[type]=fn;}
    emit(type){return this.listeners[type]?.();}
    focus(){this.focused=true;}
    querySelector(selector){
      const [first,...rest]=selector.split(' ');
      const matches=n=>first.startsWith('#')?n.id===first.slice(1):first.startsWith('.')?n.className.split(' ').includes(first.slice(1)):n.tagName===first;
      const walk=node=>{for(const child of node.children){if(matches(child)){const found=rest.length?child.querySelector(rest.join(' ')):child;if(found)return found;}const found=walk(child);if(found)return found;}return null;};
      return walk(this);
    }
  }
  const root=new Element('div');
  const makeHost=(saved)=>{
    const host=new Element('section'),caption=new Element('p');caption.id=saved?'savedReviewCaption':'previewCaption';
    const wrap=new Element('div');wrap.className='table-wrap';const table=new Element('table'),head=new Element('thead'),tr=new Element('tr'),body=new Element('tbody');
    body.id=saved?'detailRows':'previewRows';head.append(tr);table.append(head,body);wrap.append(table);host.append(caption,wrap);root.append(host);return host;
  };
  const source=fs.readFileSync('assets/payroll-novelty-review-panel.js','utf8');
  const context={...review,savedNoveltyBatch,document:{createElement:tag=>new Element(tag)},
    URL:{createObjectURL(){throw Error('No saved review download is authorized here');}},setTimeout};
  vm.createContext(context);vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace(/export function /g,'function '),context);
  const savedHost=makeHost(true),draftHost=makeHost(false);
  const saved=context.mountNoveltyReviewPanel(savedHost,{saved:true,issueLabel:issue=>issue.code});
  const draft=context.mountNoveltyReviewPanel(draftHost);
  return{saved,draft,savedHost,draftHost,root,created,q:id=>root.querySelector('#'+id)};
}

test('draft and saved reviews coexist with unique controls and truthful scope',()=>{
  const h=panels(),b=batch();h.saved.setBatch(b);h.draft.setRows(b.rows);
  const ids=[];const collect=node=>{if(node.id)ids.push(node.id);node.children.forEach(collect);};collect(h.root);
  assert.equal(ids.length,new Set(ids).size);
  assert.match(h.q('savedReviewCaption').textContent,/60 filas guardadas/);
  assert.match(h.q('previewCaption').textContent,/Todavía sin guardar/);
  assert.match(h.q('savedReviewScope').textContent,/60 filas del lote completo/);
  assert.equal(h.savedHost.querySelector('#reviewControlDownload'),null);
  assert.ok(h.draftHost.querySelector('#reviewControlDownload'));
});

test('saved panel visits all pages, shows full fields and preserves full totals under a search',()=>{
  const h=panels(),b=batch();b.rows[59].observation='Fundamento sintético final';b.rows[59].costCenterSourceId='42';
  h.saved.setBatch(b);assert.equal(h.q('detailRows').children.length,25);
  const before=h.q('savedReviewValuation').textContent;
  assert.match(before,/7\.407,00/);
  h.q('savedReviewNext').emit('click');h.q('savedReviewNext').emit('click');
  assert.match(h.q('savedReviewRange').textContent,/51–60 de 60/);assert.equal(h.q('savedReviewNext').disabled,true);
  assert.match(h.q('detailRows').textContent,/Fundamento sintético final/);
  h.q('savedReviewSearch').value='1060';h.q('savedReviewSearch').emit('input');
  assert.equal(h.q('detailRows').children.length,1);assert.match(h.q('savedReviewRange').textContent,/1–1 de 1/);
  assert.equal(h.q('savedReviewValuation').textContent,before);
  assert.match(h.q('savedReviewScope').textContent,/60 filas del lote completo/);
  h.q('savedReviewReset').emit('click');assert.equal(h.q('detailRows').children.length,25);
});

test('row issues are visible and searchable by severity without treating empty results as an empty batch',()=>{
  const h=panels(),b=batch();b.rows[40].issues=[{code:'duplicate_business_key',blocking:true,severity:'error'}];h.saved.setBatch(b);
  h.q('savedReviewIssueKind').value='blocking';h.q('savedReviewIssueKind').emit('change');
  assert.equal(h.q('detailRows').children.length,1);assert.match(h.q('detailRows').textContent,/Bloqueante: duplicate_business_key/);
  h.q('savedReviewSearch').value='notfound';h.q('savedReviewSearch').emit('input');
  assert.match(h.q('savedReviewRange').textContent,/Sin coincidencias. El lote sigue completo/);
  assert.match(h.q('savedReviewValuation').textContent,/60 filas/);
});

test('clear retires saved rows, summaries, search and concepts; no later filter restores them',()=>{
  const h=panels(),b=batch();h.saved.setBatch(b);h.q('savedReviewSearch').value='1060';h.saved.clear();
  assert.equal(h.savedHost.hidden,true);assert.equal(h.q('savedReviewSearch').value,'');
  assert.equal(h.q('savedReviewValuation').textContent,'');assert.equal(h.q('savedReviewConceptRows').children.length,0);
  assert.equal(h.q('savedReviewConcept').children.length,0);assert.equal(h.q('detailRows').children.length,0);
  h.q('savedReviewReset').emit('click');assert.equal(h.q('detailRows').children.length,0);
});

test('saved panel requires a verified whole batch and renders text without HTML execution',()=>{
  const h=panels(),b=batch();assert.throws(()=>h.saved.setRows(b.rows));
  b.rows[0].observation='<img src=x onerror=alert(1)>';h.saved.setBatch(b);
  assert.match(h.q('detailRows').textContent,/<img src=x onerror=alert\(1\)>/);
  assert.equal(h.created.some(n=>n.tagName==='img'),false);
  const malformed=batch();malformed.rows.pop();assert.throws(()=>h.saved.setBatch(malformed));
});

test('saved review has an accessible named table region and mobile styles in existing published assets',()=>{
  const html=fs.readFileSync('novedades-nomina.html','utf8'),css=fs.readFileSync('assets/payroll-novelty-review.css','utf8');
  assert.match(html,/id="savedReviewPanel" aria-label="Revisión completa del lote guardado" hidden/);
  assert.match(html,/role="region" aria-label="Filas del lote guardado" tabindex="0"/);
  assert.match(css,/#savedReviewPanel \.button \{ min-height:44px/);
  assert.match(css,/#savedReviewPanel :is\(summary,\.table-wrap\):focus-visible/);
});
