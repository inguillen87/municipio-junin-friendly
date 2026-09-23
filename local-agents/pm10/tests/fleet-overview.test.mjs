import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetOverview,renderGatewayOverview,overviewCounts} from '../../clock-fleet/overview.mjs';

const at='2026-09-23T12:00:00.000Z',before='2026-09-23T11:45:00.000Z';
const row=(i,scope='source_only')=>({clockId:i===0?null:'clock-'+i,label:i===0?'PM-10 · Edificio Viejo':'Punto '+i,enabled:true,evidenceState:'verified',
 capture:{state:'captured_locally',checkedAt:at,lastAttemptAt:at,lastCaptureAt:at,nextPollAt:null,records:20+i,blocked:false,lastError:null,evidenceState:'verified'},
 delivery:{state:scope==='canonical'?'queue_confirmed':'source_stored',enabled:true,scope,checkedAt:at,lastReceiptAt:before,confirmedRecords:20+i,pendingParts:0,nextAttemptAt:null,evidenceState:'verified'}});
const snapshot=()=>({schema:'municipal-clock-overview.v1',updatedAt:at,desiredState:'running',clocks:Array.from({length:6},(_,i)=>row(i,i===0?'canonical':'source_only')),networkTested:false,realWrites:0});
const metric=(html,key)=>Number(new RegExp('data-metric="'+key+'"><strong>(\\d+)').exec(html)?.[1]);

test('six clocks share cards and all device counters, including PM10',()=>{
 const data=snapshot(),html=renderGatewayOverview(data);
 assert.equal((html.match(/<article class="clock-card">/g)||[]).length,6);
 assert.deepEqual(overviewCounts(data.clocks),{configured:6,captured:6,needsReview:0,withReceipt:6});
 for(const name of ['configured','captured','withReceipt'])assert.equal(metric(html,name),6);
 assert.match(html,/<h2>PM-10 · Edificio Viejo<\/h2>/);
 assert.doesNotMatch(html,/adicional|separad|especial|class="existing"|14 conectados/i);
 assert.match(html,/recepción de marcaciones/);assert.match(html,/archivo de relojes/);
});

test('compatibility renderer includes PM10 in configured/capture/receipt totals',()=>{
 const config={clocks:Array.from({length:5},(_,i)=>({clockId:'c'+i,label:'Punto '+i,enabled:true}))};
 const summary={updatedAt:at,clocks:config.clocks.map(c=>({...c,status:'captured_locally',lastCaptureAt:at,uniqueLocalRecords:9}))};
 const html=fleetOverview(config,summary,{pm10:{lastCaptureAt:before,lastReceiptAt:before,confirmedRecords:11}});
 assert.equal(metric(html,'configured'),6);assert.equal(metric(html,'captured'),6);assert.equal(metric(html,'withReceipt'),1);
 assert.equal((html.match(/Recepción no consultada/g)||[]).length,5);
 assert.doesNotMatch(html,/Recepción en Neon: no configurada|adicional|separad|especial/i);
});

test('no delivery evidence is unknown, never zero or unconfigured',()=>{
 const data=snapshot();data.clocks=[{...row(1),delivery:{evidenceState:'missing'},evidenceState:'missing'}];
 const html=renderGatewayOverview(data);
 assert.match(html,/Recepción no consultada/);assert.match(html,/Partes pendientes<\/dt><dd>Sin dato/);
 assert.equal(metric(html,'withReceipt'),0);assert.equal(metric(html,'captured'),1);
 assert.doesNotMatch(html,/Recepción en Neon: no configurada|Partes pendientes<\/dt><dd>0/);
});

test('invalid receipt removes its figures without erasing verified capture',()=>{
 const data=snapshot();data.clocks=[row(1)];data.clocks[0].delivery.evidenceState='invalid';data.clocks[0].delivery.confirmedRecords=987654321;
 const html=renderGatewayOverview(data);
 assert.match(html,/Recepción por revisar/);assert.doesNotMatch(html,/987654321/);
 assert.equal(metric(html,'captured'),1);assert.equal(metric(html,'withReceipt'),0);assert.equal(metric(html,'needsReview'),1);
});

test('invalid capture does not hide a checked receipt or manufacture capture count',()=>{
 const data=snapshot();data.clocks=[row(0,'canonical')];data.clocks[0].capture.evidenceState='invalid';data.clocks[0].capture.records=987654321;
 const html=renderGatewayOverview(data);
 assert.equal(metric(html,'captured'),0);assert.equal(metric(html,'withReceipt'),1);assert.equal(metric(html,'needsReview'),1);
 assert.doesNotMatch(html,/987654321/);assert.match(html,/Acuse guardado/);
});

test('newer capture does not imply missing delivery when recorded pending count is zero',()=>{
 const data=snapshot(),html=renderGatewayOverview(data);
 assert.ok(Date.parse(data.clocks[0].capture.lastCaptureAt)>Date.parse(data.clocks[0].delivery.lastReceiptAt));
 assert.equal((html.match(/class="receipt-state">Acuse guardado/g)||[]).length,6);
 assert.doesNotMatch(html,/class="receipt-state">Envíos pendientes|Recepción reciente|conectado ahora/);
 assert.match(html,/Panel preparado:/);assert.match(html,/Estado de envío guardado/);assert.match(html,/Último acuse guardado/);
});

test('actual pending parts, retry and blocked state are shown for either receipt contract',()=>{
 for(const scope of ['canonical','source_only']){
  const data=snapshot();data.clocks=[row(0,scope)];data.clocks[0].delivery.pendingParts=2;
  assert.match(renderGatewayOverview(data),/class="receipt-state">Envíos pendientes/);
  data.clocks[0].delivery.state='retry_wait';assert.match(renderGatewayOverview(data),/Reintento de envío programado/);
  data.clocks[0].delivery.state='blocked';const html=renderGatewayOverview(data);
  assert.match(html,/Envío detenido para revisión/);assert.equal(metric(html,'needsReview'),1);assert.equal(metric(html,'withReceipt'),1);
 }
});

test('all physical source details, raw errors and supervisor messages stay out of HTML',()=>{
 const data=snapshot();data.serial='PRIVATE-SERIAL';data.host='192.0.2.99';data.token='PRIVATE-TOKEN';data.observation='PRIVATE-OBSERVATION';
 Object.assign(data.clocks[0],{serial:'PRIVATE-SERIAL',host:'192.0.2.99',username:'PRIVATE-USER',records:['PRIVATE-NOMINAL']});
 data.clocks[0].capture.lastError='PRIVATE-COMMAND';data.clocks[0].delivery.lastError='PRIVATE-DELIVERY';
 const html=renderGatewayOverview(data);assert.doesNotMatch(html,/PRIVATE-|192\.0\.2/);assert.match(html,/observación del supervisor/);
});

test('labels are escaped and long labels can wrap without scripts or links',()=>{
 const data=snapshot();data.clocks=[row(0)];data.clocks[0].label='Lugar <img src=x onerror=alert(1)> & "sede"';
 const html=renderGatewayOverview(data);assert.match(html,/&lt;img/);assert.match(html,/&amp;/);assert.match(html,/&quot;sede&quot;/);
 assert.doesNotMatch(html,/<(?:img|script|iframe|link|object)\b|fetch\(|<a\s/i); // escaped label may contain src text, never an element
});

test('empty inventory does not assert registered or connected clocks',()=>{
 const data=snapshot();data.clocks=[];const html=renderGatewayOverview(data);
 assert.equal(metric(html,'configured'),0);assert.match(html,/No hay equipos configurados en este corte/);assert.doesNotMatch(html,/14 conectados/);
});

test('a future fourteen-device configuration remains the same fleet, not fourteen live connections',()=>{
 const data=snapshot();data.clocks=Array.from({length:14},(_,i)=>({...row(i),capture:{evidenceState:'missing'},delivery:{evidenceState:'missing'},evidenceState:'missing'}));
 const html=renderGatewayOverview(data);assert.equal(metric(html,'configured'),14);assert.equal(metric(html,'captured'),0);assert.equal(metric(html,'withReceipt'),0);
 assert.match(html,/no a una prueba de conexión en vivo/);assert.equal((html.match(/Recepción no consultada/g)||[]).length,14);
});

test('rendering refuses an incompatible snapshot or a live/network mutation claim',()=>{
 for(const mutate of [x=>x.schema='other.v1',x=>x.networkTested=true,x=>x.realWrites=1,x=>x.clocks=null,x=>x.clocks=Array(201).fill(row(1))]){
  const data=snapshot();mutate(data);assert.throws(()=>renderGatewayOverview(data),/GATEWAY_OVERVIEW_INVALID/);
 }
});
