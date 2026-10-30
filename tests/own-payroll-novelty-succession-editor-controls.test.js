import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {batch} from './fixtures/own-payroll-novelty-cancellation-synthetic.js';

const panel=fs.readFileSync(new URL('../assets/own-payroll-novelties-panel.js',import.meta.url),'utf8');
function fragment(start,end){const a=panel.indexOf(start);assert.ok(a>=0,start);assert.equal(panel.indexOf(start,a+start.length),-1,'unique source start');const b=panel.indexOf(end,a+start.length);assert.ok(b>a,end);return panel.slice(a,b);}
function node(tag,text){let disabled=false;return {tag,text,textContent:text??'',value:'',hidden:false,isConnected:true,dataset:{},children:[],disabledHistory:[],get disabled(){return disabled;},set disabled(value){disabled=value;this.disabledHistory.push(value);},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},addEventListener(){},querySelectorAll(selector){const tags=selector.split(','),found=[];const walk=n=>{for(const child of n.children){if(tags.includes(child.tag))found.push(child);walk(child);}};walk(this);return found;}};}
function actualEditor(parent){
 const nodes=new Map(),$=key=>{if(!nodes.has(key))nodes.set(key,node(key));return nodes.get(key);},inputWrites=[];
 const controls=fragment(' function controls(){',' function invalidate(){'),invalidate=fragment(' function invalidate(){',' function withdraw('),work=fragment(' async function work(',' function renderPeople('),table=fragment(' function table(',' const bodyValue='),renderRows=fragment(' function renderRows(){',' async function bootstrap('),beginCorrection=fragment(' async function beginCorrection(',' async function presentDetail(');
 const factory=new Function('d',`const {$,node,context,inputWrites}=d;const container={isConnected:true,setAttribute(){}},document={hidden:false},access={caps:new Set()},lock=()=>{},status=()=>{},renderPeople=()=>{},OWN_RUN_TYPES={monthly:'Mensual'},money=value=>String(value),verifiedSuccession=async()=>context;let cancellation=null,busy=false,external=false,attempt=null,receipt=null,notFound=false,prepared=null,detail=null,correction=null,correctionPrevious=null,approvalReview=null,rows=[],selected=new Set(),rowPage=0,sequence=1,controller=null,prepareAllowed=true,readAllowed=true;const boot={permissions:{canPrepare:true}},can=command=>readAllowed&&(command!=='prepare'||prepareAllowed),live=()=>true,withdraw=message=>{throw Error(message);};${controls}${invalidate}${work}${table}${renderRows}${beginCorrection};return {begin:()=>work(()=>beginCorrection(context.batch.id)),inputs:()=>$('rows').querySelectorAll('input'),buttons:()=>$('rows').querySelectorAll('button'),rows:()=>rows,fields:()=>$('fields'),set(values){if('busy'in values)busy=values.busy;if('external'in values)external=values.external;if('attempt'in values)attempt=values.attempt;if('prepareAllowed'in values)prepareAllowed=values.prepareAllowed;if('readAllowed'in values)readAllowed=values.readAllowed;if('bootPrepare'in values)boot.permissions.canPrepare=values.bootPrepare;controls();},renderLegacy(){correction=null;renderRows();}};`);
 return {...factory({$,node,context:{batch:parent,effective:true,canPrepare:true,identitiesCurrent:true,pendingSuccessor:null,approvedSuccessor:null},inputWrites}),inputWrites};
}

test('real async beginCorrection restores editable amounts after busy render and preserves all61 original destinations',async()=>{
 const parent=batch(61),before=JSON.stringify(parent),editor=actualEditor(parent);await editor.begin();
 assert.equal(editor.rows().length,61);assert.deepEqual(editor.rows(),parent.rows.map(row=>row.values));assert.equal(JSON.stringify(parent),before);
 assert.equal(editor.fields().disabled,true,'period/type/destination fieldset stays disabled during correction');
 const inputs=editor.inputs();assert.equal(inputs.length,25*4,'first editor page contains quantity/amount/legal/observation only');
 assert.ok(inputs.every(input=>input.disabledHistory.includes(true)),'actual table rendered while async work was busy');
 assert.ok(inputs.every(input=>input.disabled===false),'actual finally controls must enable every row editor after busy becomes false');
 assert.equal(editor.inputWrites.length,0,'no edit or persistence callback was forced to unlock inputs');
});

test('real controls relock row editors and legacy remove buttons for busy, external, pending attempt and revoked preparation',async()=>{
 const editor=actualEditor(batch(2));await editor.begin();
 const frozenAttempt=Object.freeze({key:'synthetic-original-key',body:Object.freeze({command:'prepare'})}),before=JSON.stringify(frozenAttempt);
 for(const [locked,unlocked]of [[{busy:true},{busy:false}],[{external:true},{external:false}],[{attempt:frozenAttempt},{attempt:null}],[{prepareAllowed:false},{prepareAllowed:true}],[{bootPrepare:false},{bootPrepare:true}],[{readAllowed:false},{readAllowed:true}]]){
  editor.set(locked);assert.ok(editor.inputs().every(input=>input.disabled===true));editor.set(unlocked);assert.ok(editor.inputs().every(input=>input.disabled===false));assert.equal(editor.fields().disabled,true);
 }
 assert.equal(JSON.stringify(frozenAttempt),before,'controls never change a pending key or body');
 editor.renderLegacy();assert.equal(editor.buttons().length,2,'actual legacy table keeps one removal action per row');editor.set({external:true});assert.ok([...editor.inputs(),...editor.buttons()].every(input=>input.disabled===true));editor.set({external:false});assert.ok([...editor.inputs(),...editor.buttons()].every(input=>input.disabled===false));
});
