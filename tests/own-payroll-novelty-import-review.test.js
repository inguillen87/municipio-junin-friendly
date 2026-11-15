import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ownNoveltyImportPage,ownNoveltyImportResolution,OWN_NOVELTY_IMPORT_PAGE_SIZE} from '../assets/own-payroll-novelty-import-review.js';
import {OWN_NOVELTY_MAX_ROWS,ownNoveltyCommand} from '../assets/own-payroll-novelties-model.js';
import {readEntityTxt,resolveEntityRows,lowestLegajoChoices,entityFormat,entityFormatsForLength} from '../assets/grh-entity-formats.js';

test('every row through 10,000 remains reachable in source order, including row 201 and the last row',()=>{
 const rows=Object.freeze(Array.from({length:OWN_NOVELTY_MAX_ROWS},(_,i)=>Object.freeze({key:String(20000001+i),sourceLines:Object.freeze([i+1])}))),seen=[];
 for(let page=1;page<=OWN_NOVELTY_MAX_ROWS/OWN_NOVELTY_IMPORT_PAGE_SIZE;page++){
  const view=ownNoveltyImportPage(rows,{page});seen.push(...view.rows);
  assert.equal(view.from,(page-1)*OWN_NOVELTY_IMPORT_PAGE_SIZE+1);assert.equal(view.to,page*OWN_NOVELTY_IMPORT_PAGE_SIZE);
 }
 assert.deepEqual(seen,rows);assert.equal(new Set(seen).size,10000);
 assert.equal(ownNoveltyImportPage(rows,{page:5}).rows[0],rows[200]);
 assert.equal(ownNoveltyImportPage(rows,{page:200}).rows.at(-1),rows[9999]);
 assert.equal(ownNoveltyImportPage(rows,{page:999}).page,200);
});

test('filtering matches identity, source line, name, concept and candidate without changing the input',()=>{
 const rows=Object.freeze([
  Object.freeze({key:'20000001',name:'Sintética Álvarez',concept:'638',sourceLines:Object.freeze([201]),candidates:Object.freeze([Object.freeze({legajo:'9876',detail:'Taller'})])}),
  Object.freeze({key:'20000002',name:'Otra persona',concept:'639',sourceLines:Object.freeze([10000]),candidates:Object.freeze([])})
 ]);
 for(const search of ['20000001','201','SINTETICA ALVAREZ','638','9876 Taller']){
  const view=ownNoveltyImportPage(rows,{search,page:200});assert.equal(view.page,1);assert.deepEqual(view.rows,[rows[0]]);assert.equal(view.total,2);
 }
 const empty=ownNoveltyImportPage(rows,{search:'ausente',page:20});
 assert.deepEqual([empty.rows,empty.filtered,empty.from,empty.to,empty.page,empty.pages],[[],0,0,0,1,1]);
 assert.deepEqual(ownNoveltyImportPage(rows).rows,rows);
 assert.deepEqual(ownNoveltyImportPage([]).rows,[]);
 for(const options of [{page:0},{page:-1},{page:1.5},{search:null}])assert.throws(()=>ownNoveltyImportPage(rows,options),/página/);
 assert.throws(()=>ownNoveltyImportPage(Array(10001).fill(rows[0])),/página/);
});

test('only the complete resolution can be added; an unresolved off-page row still blocks the whole file',()=>{
 const rows=Array.from({length:201},(_,i)=>({key:String(i+1)})),read={rows};
 assert.equal(ownNoveltyImportResolution(read,{resolved:rows,missing:[],ambiguous:[]}).ready,true);
 for(const kind of ['missing','ambiguous']){
  const linked={resolved:rows.slice(0,200),missing:[],ambiguous:[]};linked[kind]=rows.slice(200);
  assert.equal(ownNoveltyImportPage(linked.resolved).rows.length,50);
  assert.equal(ownNoveltyImportResolution(read,linked).ready,false);
 }
 assert.equal(ownNoveltyImportResolution({rows:[]},{resolved:[],missing:[],ambiguous:[]}).ready,false);
 assert.throws(()=>ownNoveltyImportResolution(read,{resolved:rows.slice(0,200),missing:[],ambiguous:[]}),/todas las filas/);
 assert.throws(()=>ownNoveltyImportResolution(read,{resolved:rows,missing:[],ambiguous:[rows[0]]}),/todas las filas/);
});

// Run the actual presentation closure with synthetic nodes and already supplied synthetic roster data.
// No browser, network, database, writer or server is started.
const panelSource=fs.readFileSync(new URL('../assets/own-payroll-novelties-panel.js',import.meta.url),'utf8');
const presentSource=panelSource.slice(panelSource.indexOf('const entityPresent=async'),panelSource.indexOf('const entityFail='));
class Element{
 constructor(tag,text=''){this.tag=tag;this.children=[];this.dataset={};this.events=new Map();this.attributes={};this.value='';this.open=false;this.disabled=false;this.textContent=text;}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
 append(...children){this.children.push(...children.map(child=>typeof child==='string'?new Element('text',child):child));}
 replaceChildren(...children){this.text='';this.children=[];this.append(...children);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 addEventListener(type,callback){const callbacks=this.events.get(type)??[];callbacks.push(callback);this.events.set(type,callbacks);}
 fire(type){for(const callback of this.events.get(type)??[])callback({currentTarget:this});}
 focus(){this.focused=true;}
 querySelectorAll(selector){
  const match=/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/.exec(selector);assert.ok(match,'supported synthetic selector: '+selector);
  const key=match[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),result=[];
  const visit=element=>{for(const child of element.children){if(Object.hasOwn(child.dataset,key)&&(match[2]===undefined||child.dataset[key]===match[2]))result.push(child);visit(child);}};
  visit(this);return result;
 }
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}
const contract=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function syntheticFile(count,{missing=false}={}){
 const subjects=[],roster=[],lines=[];
 for(let i=1;i<=count;i++){
  const dni=String(20000000+i);lines.push(('00000'+dni).padEnd(44,' ')+'00000100.00');
  if(!missing)for(let choice=0;choice<2;choice++){
   const subject={contractId:contract(i*2+choice),legajo:String(i*2+choice),identityToken:'a'.repeat(64)};
   subjects.push(subject);roster.push({...subject,dni,status:'active',name:'Sintética '+i,organization:choice?'Taller':'Gobierno'});
  }
 }
 return{read:readEntityTxt(new TextEncoder().encode(lines.join('\n')),{formatId:1}),roster,subjects};
}
async function setup(data){
 const out=new Element('section'),messages=[],calls=[];let current=true;
 const context={Map,structuredClone,entityRoster:data.roster,boot:{subjects:data.subjects},entityChoices:new Map(),entityRead:null,
  resolveEntityRows,lowestLegajoChoices,ownNoveltyImportPage,ownNoveltyImportResolution,entityFormatsForLength,ownNoveltyCommand,
  node:(tag,text='')=>new Element(tag,text),document:{createElement:tag=>new Element(tag)},Option:function(text,value){const option=new Element('option',text);option.value=value;return option;},
  $:id=>{assert.equal(id,'import-result');return out;},countWords:(count,one,many)=>count+' '+(count===1?one:many),pesos:value=>value,
  rows:[],busy:false,external:false,bodyValue:rows=>({command:'prepare',periodMonth:'2026-10-01',payrollType:'monthly',rows,reviewConfirmed:true}),
  invalidateEntity:()=>{calls.push('invalidate-entity');current=false;},invalidate:()=>calls.push('invalidate'),renderRows:()=>calls.push('render'),status:text=>messages.push(text),
  fetch:()=>{throw Error('Unexpected network request');}};
 vm.createContext(context);vm.runInContext(presentSource+'\nglobalThis.present=entityPresent;',context);
 await context.present({read:data.read,concept:'638',f:entityFormat(1),title:'sintetico.txt',observation:'Archivo sintetico.txt',from:'del archivo sintético',current:()=>current});
 const find=(field,value='')=>out.querySelector(`[data-n-import-${field}="${value}"]`),fire=(field,value='',event='click')=>{const element=find(field,value);assert.ok(element,field+' '+value);element.fire(event);return element;};
 const search=(key,value)=>{const input=find('search',key);input.value=value;input.fire('input');};
 return{context,out,messages,calls,find,fire,search,stop:()=>{current=false;}};
}

test('the real preview exposes row 201 and preserves its choice across pages and filters, then adds all 201 rows',async()=>{
 const data=syntheticFile(201),f=await setup(data),lastKey='20000201';
 assert.equal(f.find('add').disabled,true);assert.equal(f.out.querySelectorAll('[data-n-import-legajo]').length,50);
 for(let i=0;i<4;i++)f.fire('next','choices');
 assert.match(f.find('page','choices').textContent,/201–201.*página 5 de 5/);
 let select=f.find('legajo',lastKey);assert.ok(select);select.value=contract(403);select.fire('change');
 assert.equal(f.find('legajo',lastKey).value,contract(403));assert.equal(f.context.entityChoices.get(lastKey),contract(403));
 assert.match(f.find('page','choices').textContent,/página 5 de 5/);
 f.search('choices','20000001');assert.match(f.find('page','choices').textContent,/página 1 de 1/);
 select=f.find('legajo','20000001');select.value=contract(3);select.fire('change');
 assert.equal(f.find('search','choices').value,'20000001');assert.equal(f.find('legajo','20000001').value,contract(3));
 f.search('choices','');for(let i=0;i<4;i++)f.fire('next','choices');
 assert.equal(f.find('legajo',lastKey).value,contract(403));
 f.fire('lowest');assert.equal(f.find('add').disabled,false);assert.equal(f.context.entityChoices.size,201);
 assert.equal(f.find('legajo',lastKey).value,contract(403),'the bulk proposal never replaces an existing choice');
 select=f.find('legajo',lastKey);select.value='';select.fire('change');assert.equal(f.find('add').disabled,true);
 f.search('choices','20000001');f.fire('add');assert.equal(f.context.rows.length,0,'a hidden unresolved row blocks even a direct handler call');
 f.search('choices',lastKey);select=f.find('legajo',lastKey);select.value=contract(402);select.fire('change');
 assert.equal(f.find('add').disabled,false);assert.equal(f.find('search','choices').value,lastKey);f.fire('add');
 assert.equal(f.context.rows.length,201,'the search never trims the file added to the draft');
 assert.equal(f.context.rows[0].contractId,contract(3));assert.equal(f.context.rows[200].contractId,contract(402));
 assert.ok(f.context.rows.every(row=>row.amountCents==='10000'&&row.conceptSourceId==='638'));
 assert.deepEqual(f.calls,['invalidate-entity','invalidate','render']);assert.equal(f.messages.length,1);assert.match(f.messages[0],/Se agregaron 201 filas/);
});

test('all missing rows remain searchable and reachable, including row 201, without enabling a partial batch',async()=>{
 const f=await setup(syntheticFile(201,{missing:true}));
 for(let i=0;i<4;i++)f.fire('next','missing');
 assert.match(f.find('review','missing').textContent,/DNI 20000201.*renglón 201/);assert.match(f.find('page','missing').textContent,/página 5 de 5/);
 f.search('missing','20000001');assert.match(f.find('page','missing').textContent,/1–1 de 1.*página 1 de 1/);
 f.search('missing','no existe');assert.match(f.find('page','missing').textContent,/0–0 de 0.*página 1 de 1/);
 assert.equal(f.find('add').disabled,true);f.fire('add');assert.equal(f.context.rows.length,0);assert.deepEqual(f.calls,[]);
 f.search('missing','');assert.match(f.find('page','missing').textContent,/1–50 de 201/);
});

test('an invalidated import cannot change choices or add its former complete resolution',async()=>{
 const f=await setup(syntheticFile(1));f.fire('lowest');assert.equal(f.find('add').disabled,false);
 const before=[...f.context.entityChoices],select=f.find('legajo','20000001');f.stop();select.value=contract(3);select.fire('change');f.fire('add');
 assert.deepEqual([...f.context.entityChoices],before);assert.deepEqual(f.context.rows,[]);assert.deepEqual(f.calls,[]);
});

test('the new pure helper is included in the static build asset inventory',()=>{
 assert.match(fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8'),/'assets\/own-payroll-novelty-import-review\.js'/);
});
