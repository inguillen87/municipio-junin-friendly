import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {captureHelp,fleetCounts} from '../../clock-fleet/operator-help.mjs';
import {fleetOverview} from '../../clock-fleet/overview.mjs';
const installerSource=()=>fs.readFileSync('scripts/install-fleet-capture-release.mjs','utf8');
function transferNames(){
 const match=installerSource().match(/\bconst names=(\[[^\]\r\n]*\]);/);
 assert.ok(match,'the transfer list must remain a literal array');
 return JSON.parse(match[1].replaceAll("'",'"'));
}
function assertDependenciesBeforeConsumers(names){
 assert.equal(new Set(names).size,names.length,'transfer entries must be unique');
 for(const consumer of ['runner.mjs','overview.mjs'])assert.ok(names.includes(consumer),`missing consumer: ${consumer}`);
 // Inspect literal local ESM imports; never import or invoke the installer or runner.
 for(const consumer of names){
  const source=fs.readFileSync(new URL('../../clock-fleet/'+consumer,import.meta.url),'utf8');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.\/[^'"]+\.mjs)\1/g)){
   const dependency=match[2].slice(2);
   assert.ok(names.includes(dependency),`${consumer}: missing dependency ${dependency}`);
   assert.ok(names.indexOf(dependency)<names.indexOf(consumer),`${consumer}: dependency must be transferred first: ${dependency}`);
  }
 }
}
test('operator guidance separates reconnect, bad key, wrong serial and captured data',()=>{
 assert.match(captureHelp({status:'retry_wait',connectionFailureCount:8,blocked:false}),/sin cambiar la clave/);
 assert.match(captureHelp({blocked:true,lastError:'AUTH_NOT_ACCEPTED'}),/no prueba otras claves/);
 assert.match(captureHelp({blocked:true,lastError:'SERIAL_MISMATCH'}),/no se reasignan registros/);
 assert.match(captureHelp({status:'captured_locally'}),/paso separado/);
 assert.match(captureHelp({status:'network_wait'}),/salida normal a Internet/);
});
test('overview counters are about configured clocks, not live network availability',()=>{
 const cfg={clocks:[{clockId:'a',label:'PM-14 · Edificio Nuevo',enabled:true},{clockId:'b',label:'PM-02 · Equipo QA',enabled:true}]};
 const summary={updatedAt:'2026-09-18T10:00:00Z',clocks:[{clockId:'a',lastCaptureAt:'2026-09-17T10:00:00Z',status:'retry_wait',connectionFailureCount:8},{clockId:'b',blocked:true,status:'blocked',lastError:'AUTH_NOT_ACCEPTED'},{clockId:'outsider',blocked:true}]};
 assert.deepEqual(fleetCounts(cfg,summary),{configured:2,withCapture:1,needsReview:1});
 const html=fleetOverview(cfg,summary);assert.match(html,/no a una prueba de conexión en vivo/);assert.match(html,/PM-14 · Edificio Nuevo/);assert.match(html,/Recepción no consultada/);assert.doesNotMatch(html,/fetch\(|<script|credentials|172\.100\./);
});
test('installer operates only on the five capture UI modules, with pinned baselines and no config/state editing',()=>{
 const code=installerSource();assert.match(code,/FLEET_UPDATE_INSTALLED_DRIFT/);assert.match(code,/FLEET_UPDATE_SOURCE_MISMATCH/);assert.match(code,/FLEET_UPDATE_CONCURRENT_CHANGE/);assert.match(code,/FLEET_UPDATE_BACKUP_CONFLICT/);
 assert.deepEqual(new Set(transferNames()),new Set(['capture-policy.mjs','operator-help.mjs','capture-recovery.mjs','runner.mjs','overview.mjs']));assert.doesNotMatch(code,/\.key['"]|config\\|readCredential|Start-ScheduledTask|Stop-ScheduledTask/);
});
test('capture transfer includes pinned local dependencies before runner and overview',()=>{
 const names=transferNames();assertDependenciesBeforeConsumers(names);
 const manifest=JSON.parse(fs.readFileSync(new URL('../../clock-fleet/SHA256SUMS.json',import.meta.url),'utf8'));
 for(const name of names){
  const bytes=fs.readFileSync(new URL('../../clock-fleet/'+name,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest[name],`source pin: ${name}`);
 }
});
test('dependency check rejects omitted recovery and recovery transferred after its consumer',()=>{
 const names=transferNames(),withoutRecovery=names.filter(name=>name!=='capture-recovery.mjs');
 assert.throws(()=>assertDependenciesBeforeConsumers(withoutRecovery),/runner\.mjs: missing dependency capture-recovery\.mjs/);
 assert.throws(()=>assertDependenciesBeforeConsumers([...withoutRecovery,'capture-recovery.mjs']),/runner\.mjs: dependency must be transferred first: capture-recovery\.mjs/);
});
