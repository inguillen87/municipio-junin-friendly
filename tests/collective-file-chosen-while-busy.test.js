// Jornada y Antigüedad por lote: el archivo elegido mientras la pantalla está consultando otra cosa no se pierde.
// La pantalla revisa la sesión sola cada 20 segundos y lee la lista de conjuntos al abrirse; si la persona elegía el archivo
// justo en ese momento, el panel lo descartaba sin aviso: el selector mostraba el archivo, el panel decía «Sin archivo.» y
// «Revisar conjunto completo» quedaba apagado hasta elegirlo otra vez.
import test from 'node:test';
import assert from 'node:assert/strict';

function stub(){
 const listeners={},children=new Map();
 const el={disabled:false,hidden:false,value:'',textContent:'',checked:false,readOnly:false,dataset:{},files:null,open:true,isConnected:true,className:'',
  addEventListener(type,fn){(listeners[type]??=[]).push(fn);},fire(type){for(const fn of listeners[type]??[])fn({type,target:el});},
  setAttribute(){},getAttribute(){return null;},replaceChildren(){},append(){},remove(){},
  querySelector(selector){if(!children.has(selector))children.set(selector,stub());return children.get(selector);},querySelectorAll(){return[];}};
 return el;
}
async function mounted({otherBlocked=()=>false,fetchImpl}={}){
 let host=null;
 globalThis.document={hidden:false,createElement(){const el=stub();host??=el;return el;}};
 globalThis.Option=class{constructor(text,value){this.textContent=text;this.value=value;}};
 globalThis.fetch=fetchImpl??(async()=>{throw Error('Sin red en esta prueba.');});
 // The panel stops its own timer when the page goes away: each test ends by sending that event.
 let pagehide=()=>{};globalThis.window={addEventListener(type,fn){if(type==='pagehide')pagehide=fn;}};
 const {mountCollectiveJobs}=await import('../assets/own-collective-jobs-panel.js');
 const changes=[],api=mountCollectiveJobs(stub(),{isVisible:()=>true,otherBlocked,changed:()=>changes.push(1)},
  {family:'working_time',prefix:'time',className:'own-working-time-collective',title:'Jornada',maxBytes:4*1024*1024,fields:[],validateFile:value=>({...value,total:value.rows.length})});
 const $=key=>host.querySelector(`[data-collective-time-${key}]`);
 return {api,host,$,close:()=>pagehide()};
}
const file={size:64,text:async()=>JSON.stringify({period:'2026-10',rows:[{},{}]})};
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};

test('con la pantalla libre, el archivo elegido se lee enseguida y habilita la revisión',async()=>{
 const {$,close}=await mounted();
 try{
  $('file').files=[file];$('file').fire('change');await settle();
  assert.equal($('file-label').textContent,'2 contratos · período 2026-10 · archivo listo para revisar.');
  assert.equal($('prepare').disabled,false);
 }finally{close();}
});

test('elegido durante la revisión de sesión de la pantalla, se lee cuando esa revisión termina',async()=>{
 let parentBusy=true;const {api,$,close}=await mounted({otherBlocked:()=>parentBusy});
 try{
  $('file').files=[file];$('file').fire('change');await settle();
  assert.equal($('file-label').textContent,'El archivo se lee apenas termine la consulta en curso.');
  parentBusy=false;api.update();await settle();
  assert.equal($('file-label').textContent,'2 contratos · período 2026-10 · archivo listo para revisar.');
  assert.equal($('prepare').disabled,false,'«Revisar conjunto completo» queda disponible sin volver a elegir el archivo');
 }finally{close();}
});

test('elegido mientras se lee la lista de conjuntos, se lee cuando esa lectura termina, aunque haya fallado',async()=>{
 let fail;const pending=new Promise((_,reject)=>{fail=reject;});
 const {host,$,close}=await mounted({fetchImpl:()=>pending});
 try{
  host.fire('toggle');await settle();
  assert.equal($('prepare').disabled,true,'la lista de conjuntos está en curso');
  $('file').files=[file];$('file').fire('change');await settle();
  assert.equal($('file-label').textContent,'El archivo se lee apenas termine la consulta en curso.');
  fail(Error('La lista no respondió.'));await settle();
  assert.equal($('file-label').textContent,'2 contratos · período 2026-10 · archivo listo para revisar.');
  assert.equal($('prepare').disabled,false);
 }finally{close();}
});

test('si la persona quita el archivo antes de que termine la consulta, no se lee nada',async()=>{
 let parentBusy=true;const {api,$,close}=await mounted({otherBlocked:()=>parentBusy});
 try{
  $('file').files=[file];$('file').fire('change');$('file').files=[];$('file').fire('change');
  parentBusy=false;api.update();await settle();
  assert.equal($('prepare').disabled,true);
  assert.notEqual($('file-label').textContent,'2 contratos · período 2026-10 · archivo listo para revisar.');
 }finally{close();}
});

test('cerrar la vista descarta el archivo pendiente junto con el resto de los datos',async()=>{
 let parentBusy=true;const {api,$,close}=await mounted({otherBlocked:()=>parentBusy});
 try{
  $('file').files=[file];$('file').fire('change');
  api.suspend();parentBusy=false;api.update();await settle();
  assert.equal($('file-label').textContent,'Sin archivo.');
  assert.equal($('prepare').disabled,true);
 }finally{close();}
});
