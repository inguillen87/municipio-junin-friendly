// El cierre de un conjunto que no entra en 4 MiB: la lectura y el envío compartidos (JSON común mientras entra, modo
// completo cuando el servidor dice que no entra, nunca una parte y siempre el mismo intento) y la selección en el servidor
// de las fachadas de capacidad ampliada para detalle, intento, decisión y grupo. Datos exclusivamente sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fetchOwnClose,sendOwnCloseCommand,ownCloseUrl,OWN_CLOSE_ENDPOINT,OWN_CLOSE_LIMIT} from '../assets/own-payroll-close-read.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {ownCloseOperation} from '../lib/internal-own-payroll-close.js';
import {OWN_CLOSE_NOMINAL,OWN_CLOSE_WRITE} from '../assets/own-payroll-close-model.js';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

const KEY=uid(8101),bytesOf=v=>new TextEncoder().encode(JSON.stringify(v));
const common=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const complete=(payload,{status=200,announced,type=OWN_RUN_FULL_JSON+'; charset=utf-8',cut=0}={})=>{const bytes=bytesOf(payload),headers={'content-type':type};if(announced!==null)headers['x-municontrol-json-bytes']=String(announced??bytes.length);return new Response(bytes.subarray(0,bytes.length-cut),{status,headers});};
const limit=()=>common(422,{ok:false,code:OWN_CLOSE_LIMIT,error:'El conjunto completo supera la capacidad. No se omitieron ni dividieron filas.'});
// Un servidor de mentira: responde en orden y anota qué se le pidió.
function server(...responses){const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,method:init.method??'GET',accept:init.headers.Accept,key:init.headers['Idempotency-Key'],type:init.headers['Content-Type'],body:init.body,credentials:init.credentials,cache:init.cache});const next=responses.shift();if(!next)throw Error('Pedido inesperado');return typeof next==='function'?next():next;}};}
const detailParams={resource:'detail',period:'2026-10',liquidationType:'monthly'};

test('un cierre que entra en el JSON común se lee con un solo pedido, igual que antes',async()=>{
 const payload={ok:true,data:{period:'2026-10',texto:'Legajo sintético áéñ'}},s=server(common(200,payload));
 const read=await fetchOwnClose(detailParams,{fetch:s.fetch});
 assert.deepEqual(read,{status:200,ok:true,payload,bytes:bytesOf(payload).length,full:false});
 assert.deepEqual(s.calls.map(c=>[c.url,c.method,c.accept,c.credentials,c.cache]),[['/api/internal-own-payroll-close?resource=detail&period=2026-10&liquidationType=monthly','GET','application/json','same-origin','no-store']]);
 assert.equal(ownCloseUrl({resource:'group',id:'a b&c'}),OWN_CLOSE_ENDPOINT+'?resource=group&id=a+b%26c');
 assert.equal(ownCloseUrl({resource:'attempt',key:KEY}),OWN_CLOSE_ENDPOINT+'?resource=attempt&key='+KEY);
});

test('si el servidor dice que no entra, repite el mismo pedido en modo completo y entrega el sobre entero',async()=>{
 const payload={ok:true,data:{period:'2026-10',relleno:'x'.repeat(5000)}},s=server(limit(),complete(payload));
 const read=await fetchOwnClose(detailParams,{fetch:s.fetch}),rejected=bytesOf({ok:false,code:OWN_CLOSE_LIMIT,error:'El conjunto completo supera la capacidad. No se omitieron ni dividieron filas.'}).length;
 assert.equal(read.ok,true);assert.equal(read.full,true);assert.deepEqual(read.payload,payload);assert.equal(read.bytes,rejected+bytesOf(payload).length,'cuenta también la respuesta común rechazada');
 assert.deepEqual(s.calls.map(c=>[c.url,c.accept]),[[ownCloseUrl(detailParams),'application/json'],[ownCloseUrl(detailParams),OWN_RUN_FULL_JSON]]);
});

test('quien ya sabe que no entra lo pide completo de entrada, con un solo pedido',async()=>{
 const payload={ok:true,data:{groupId:uid(1)}},s=server(complete(payload));
 const read=await fetchOwnClose({resource:'group',id:uid(1)},{fetch:s.fetch,full:true});
 assert.equal(read.full,true);assert.deepEqual(read.payload,payload);assert.deepEqual(s.calls.map(c=>c.accept),[OWN_RUN_FULL_JSON]);
});

test('con memoria (`known`), lo que una vez necesitó el modo completo se pide directo así la vez siguiente',async()=>{
 const payload={ok:true,data:{grande:true}},known=new Set(),s=server(limit(),complete(payload),complete(payload),common(200,{ok:true,data:{chico:true}}));
 const first=await fetchOwnClose(detailParams,{fetch:s.fetch,known});
 assert.equal(first.full,true);assert.deepEqual([...known],[ownCloseUrl(detailParams)]);
 const second=await fetchOwnClose(detailParams,{fetch:s.fetch,known});
 assert.deepEqual(second,{status:200,ok:true,payload,bytes:bytesOf(payload).length,full:true});
 // Otra consulta no hereda la marca, y la que entra en JSON común no se anota.
 const other=await fetchOwnClose({resource:'group',id:KEY},{fetch:s.fetch,known});
 assert.equal(other.full,false);assert.equal(known.size,1);
 assert.deepEqual(s.calls.map(c=>c.accept),['application/json',OWN_RUN_FULL_JSON,OWN_RUN_FULL_JSON,'application/json']);
 // Un rechazo en modo completo no deja marca.
 const fresh=new Set(),r=server(limit(),limit());const rejected=await fetchOwnClose(detailParams,{fetch:r.fetch,known:fresh});
 assert.equal(rejected.ok,false);assert.equal(fresh.size,0);
});

test('cualquier otro rechazo se devuelve tal cual, sin un segundo pedido; un 413 con el código del tope tampoco se repite',async()=>{
 for(const [status,code]of [[404,'OWN_CLOSE_NOT_FOUND'],[409,'OWN_CLOSE_STATE_CHANGED'],[503,'OWN_CLOSE_CONTRACT_INVALID'],[413,OWN_CLOSE_LIMIT],[422,'OWN_CLOSE_INPUT_INVALID']]){
  const payload={ok:false,code,error:'Rechazo sintético'},s=server(common(status,payload)),read=await fetchOwnClose({resource:'attempt',key:KEY},{fetch:s.fetch});
  assert.deepEqual(read,{status,ok:false,payload,bytes:bytesOf(payload).length,full:false},code);assert.equal(s.calls.length,1,code);
 }
});

test('si el modo completo también se rechaza, devuelve ese rechazo',async()=>{
 const refused={ok:false,code:OWN_CLOSE_LIMIT,error:'Tampoco entra en la capacidad ampliada'},s=server(limit(),common(422,refused));
 const read=await fetchOwnClose(detailParams,{fetch:s.fetch});
 assert.equal(read.ok,false);assert.equal(read.full,true);assert.equal(read.status,422);assert.deepEqual(read.payload,refused);assert.equal(s.calls.length,2);
 const off={ok:false,code:'OWN_CLOSE_UNAVAILABLE',error:'La lectura completa del histórico no está habilitada en esta versión.'},t=server(limit(),common(503,off));
 assert.deepEqual((await fetchOwnClose(detailParams,{fetch:t.fetch})).payload,off);
});

test('una respuesta completa sin sus bytes anunciados, de otro tipo o incompleta no se acepta',async()=>{
 const payload={ok:true,data:{period:'2026-10'}};
 for(const [label,response]of [['sin bytes anunciados',()=>complete(payload,{announced:null})],['bytes anunciados no numéricos',()=>complete(payload,{announced:'1e3'})],['otro tipo de contenido',()=>complete(payload,{type:'application/json'})],['bytes de menos',()=>complete(payload,{cut:3,announced:bytesOf(payload).length})]]){
  const s=server(limit(),response);await assert.rejects(fetchOwnClose(detailParams,{fetch:s.fetch}),/No se pudo verificar la respuesta completa|incompleta|JSON/,label);
 }
 const broken=server(new Response('<html>',{status:502,headers:{'content-type':'text/html'}}));
 await assert.rejects(fetchOwnClose(detailParams,{fetch:broken.fetch}),/No se pudo verificar la respuesta completa/);
});

test('respeta el presupuesto de bytes de quien llama',async()=>{
 const payload={ok:true,data:{relleno:'x'.repeat(4000)}};
 await assert.rejects(fetchOwnClose(detailParams,{fetch:server(common(200,payload)).fetch,remaining:100}),/supera su capacidad/);
 await assert.rejects(fetchOwnClose(detailParams,{fetch:server(limit(),complete(payload)).fetch,remaining:1000}),/supera su capacidad/);
 assert.equal((await fetchOwnClose(detailParams,{fetch:server(common(200,payload)).fetch,remaining:bytesOf(payload).length})).ok,true);
 for(const remaining of [-1,1.5,'10']){const s=server();await assert.rejects(fetchOwnClose(detailParams,{fetch:s.fetch,remaining}),/Presupuesto de lectura inválido/,String(remaining));assert.equal(s.calls.length,0,'no llega a pedir nada');}
});

test('una decisión que entra se envía una vez; la que no entra se reenvía con la misma clave y el mismo contenido',async()=>{
 const body={period:'2026-10',liquidationType:'monthly',command:'close',reason:'Cierre sintético áéñ'},receipt={ok:true,data:{key:KEY,replayed:false}};
 const small=server(common(201,receipt)),one=await sendOwnCloseCommand(KEY,body,{fetch:small.fetch});
 assert.deepEqual(one,{status:201,ok:true,payload:receipt,bytes:bytesOf(receipt).length,full:false});
 assert.deepEqual(small.calls.map(c=>[c.url,c.method,c.accept,c.key,c.type,c.credentials,c.cache]),[[OWN_CLOSE_ENDPOINT,'POST','application/json',KEY,'application/json','same-origin','no-store']]);
 assert.deepEqual(JSON.parse(small.calls[0].body),{operation:'command',payload:body});
 const big=server(limit(),complete(receipt,{status:201})),two=await sendOwnCloseCommand(KEY,body,{fetch:big.fetch});
 assert.equal(two.status,201);assert.equal(two.full,true);assert.deepEqual(two.payload,receipt);
 assert.deepEqual(big.calls.map(c=>[c.method,c.accept,c.key]),[['POST','application/json',KEY],['POST',OWN_RUN_FULL_JSON,KEY]]);
 assert.equal(big.calls[0].body,big.calls[1].body,'los mismos bytes en los dos envíos');
 const known=server(complete(receipt,{status:201}));await sendOwnCloseCommand(KEY,body,{fetch:known.fetch,full:true});assert.deepEqual(known.calls.map(c=>c.accept),[OWN_RUN_FULL_JSON]);
 // Un formulario demasiado grande (413) o cualquier otro rechazo no se reenvía.
 for(const [status,code]of [[413,OWN_CLOSE_LIMIT],[409,'OWN_CLOSE_STATE_CHANGED'],[409,'OWN_CLOSE_IDEMPOTENCY_REUSE']]){const s=server(common(status,{ok:false,code,error:'Rechazo sintético'}));assert.equal((await sendOwnCloseCommand(KEY,body,{fetch:s.fetch})).ok,false);assert.equal(s.calls.length,1,code);}
});

// ---- servidor
const principal=caps=>({user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:caps}}),session={email:'qa@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const envelope=v=>Buffer.byteLength(JSON.stringify({ok:true,data:v}));
const sqlOf=doc=>{const texts=[];return {texts,query:async(q,values)=>{texts.push({q,values});return [{result:structuredClone(typeof doc==='function'?doc(q):doc)}];}};};

test('el servidor elige la fachada de capacidad ampliada para detalle, intento, decisión y grupo sólo en modo completo',async()=>{
 const f=reportFixture(2),detail=f.details[0],receipt=f.receipts[0],input={detail:{period:detail.period,liquidationType:detail.liquidationType},attempt:{key:receipt.key},command:{key:receipt.key,body:receipt.body},group:{id:receipt.groupId}};
 const expected={detail:'($1::jsonb,$2::text,$3::text)',attempt:'($1::jsonb,$2::uuid)',command:'($1::jsonb,$2::jsonb,$3::uuid)',group:'($1::jsonb,$2::uuid)'};
 for(const operation of Object.keys(expected)){
  const sql=sqlOf(operation==='detail'?detail:receipt),caps=operation==='command'?OWN_CLOSE_WRITE:OWN_CLOSE_NOMINAL;
  const plain=await ownCloseOperation(sql,principal(caps),session,operation,input[operation]),full=await ownCloseOperation(sql,principal(caps),session,operation,input[operation],{fullJson:true});
  assert.deepEqual(sql.texts.map(t=>t.q),['SELECT public.own_close_'+operation+'_v1'+expected[operation]+' AS result','SELECT public.own_close_'+operation+'_full_v1'+expected[operation]+' AS result'],operation);
  assert.deepEqual(sql.texts[0].values,sql.texts[1].values,operation+': mismo contexto, clave y contenido en las dos fachadas');assert.deepEqual(full,plain,operation);
 }
 const command=sqlOf(receipt);await ownCloseOperation(command,principal(OWN_CLOSE_WRITE),session,'command',input.command,{fullJson:true});
 assert.equal(command.texts[0].values[1],JSON.stringify(receipt.body));assert.equal(command.texts[0].values[2],receipt.key);
 // El censo no tiene fachada de capacidad ampliada.
 const source=fs.readFileSync(new URL('../lib/internal-own-payroll-close.js',import.meta.url),'utf8');assert.doesNotMatch(source,/own_close_report_census_full_v1|capacity_core/);
 assert.match(source,/for\(const c of value\.captures\)verifyOwnRunReceipt\(c,\{fullJson\}\);/,'las capturas del detalle se comprueban con la capacidad del modo pedido');
});

test('un cierre de más de 4 MiB: el modo común lo rechaza con 422 y el modo completo lo entrega entero',async()=>{
 const f=reportFixture(2600),detail=f.details[0],receipt=f.receipts[0];
 for(const [label,value]of [['detalle',detail],['comprobante',receipt]])assert.ok(envelope(value)>OWN_RUN_MAX_RESPONSE&&envelope(value)<=OWN_RUN_FULL_MAX_BYTES,label+' sintético entre 4 y 32 MiB: '+envelope(value));
 const cases=[['detail',detail,{period:detail.period,liquidationType:detail.liquidationType},OWN_CLOSE_NOMINAL,v=>v.rows.length],['attempt',receipt,{key:receipt.key},OWN_CLOSE_NOMINAL,v=>v.snapshot.employeeCount],['command',receipt,{key:receipt.key,body:receipt.body},OWN_CLOSE_WRITE,v=>v.snapshot.employeeCount],['group',receipt,{id:receipt.groupId},OWN_CLOSE_NOMINAL,v=>v.snapshot.employeeCount]];
 for(const [operation,doc,input,caps,count]of cases){
  await assert.rejects(ownCloseOperation(sqlOf(doc),principal(caps),session,operation,input),e=>e.code===OWN_CLOSE_LIMIT&&e.status===422,operation+' común');
  assert.equal(count(await ownCloseOperation(sqlOf(doc),principal(caps),session,operation,input,{fullJson:true})),2600,operation+' completo');
 }
});

test('las pantallas que leen o registran cierres usan la lectura compartida',()=>{
 const read=name=>fs.readFileSync(new URL('../assets/'+name,import.meta.url),'utf8');
 const close=read('own-payroll-close-panel.js');
 assert.match(close,/import \{fetchOwnClose,sendOwnCloseCommand\} from '\.\/own-payroll-close-read\.js';/);assert.doesNotMatch(close,/fetch\('\/api\/internal-own-payroll-close|Accept:'application\/json'/);
 assert.match(close,/sendOwnCloseCommand\(attempt\.key,attempt\.body,\{signal:controller\?\.signal,full:isLarge\(attempt\.body\.period,attempt\.body\.liquidationType\)\}\)/,'la decisión de un detalle grande va directo en modo completo, con la clave y el contenido del intento');
 assert.match(close,/request\(\{resource:'attempt',key:attempt\.key\},isLarge\(attempt\.body\.period,attempt\.body\.liquidationType\)\)/);
 assert.match(close,/if\(current&&!isLarge\(current\.period,current\.liquidationType\)\)\{const v=await verifiedOwnCloseDetail\(/,'un detalle grande no se vuelve a pedir entero cada minuto');
 assert.ok(read('../scripts/build-friendly.mjs').includes("'assets/own-payroll-close-read.js'"),'el módulo se publica');
 // Informes, Planilla y Salida bancaria leen cierres por la misma lectura: ninguna pide sólo JSON común.
 const report=read('own-payroll-report-panel.js');
 assert.match(report,/import \{fetchOwnClose\} from '\.\/own-payroll-close-read\.js';/);assert.match(report,/fetchOwnClose\(params,\{signal:controller\?\.signal,remaining,known:largeCloses\}\)/,'Informes conserva su presupuesto de bytes');
 assert.doesNotMatch(report,/internal-own-payroll-close/);
 for(const name of ['own-payroll-receipt-planilla-panel.js','own-bank-output-panel.js']){
  const panel=read(name);
  assert.match(panel,/import \{fetchOwnClose\} from '\.\/own-payroll-close-read\.js';/,name);
  assert.match(panel,/fetchOwnClose\(\{resource:'group',id\},\{signal:current\?\.signal,known:largeCloses\}\)/,name);
  assert.doesNotMatch(panel,/internal-own-payroll-close|OWN_CLOSE_MAX_BYTES/,name);
 }
 // Cajas conserva su propio lector (presupuesto, retiro y códigos propios) y negocia el modo completo sólo ante el tope.
 const cajas=read('own-cajas-api-client.js');
 assert.match(cajas,/if\(target===CLOSE&&status===422&&payload\?\.code===CLOSE_LIMIT\)\{/);assert.match(cajas,/Accept:full\?OWN_RUN_FULL_JSON:'application\/json'/);
});
