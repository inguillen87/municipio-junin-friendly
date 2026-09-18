import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {captureHelp,fleetCounts} from '../../clock-fleet/operator-help.mjs';
import {fleetOverview} from '../../clock-fleet/overview.mjs';
test('operator guidance separates reconnect, bad key, wrong serial and captured data',()=>{
 assert.match(captureHelp({status:'retry_wait',connectionFailureCount:8,blocked:false}),/sin cambiar la clave/);
 assert.match(captureHelp({blocked:true,lastError:'AUTH_NOT_ACCEPTED'}),/no prueba otras claves/);
 assert.match(captureHelp({blocked:true,lastError:'SERIAL_MISMATCH'}),/no se reasignan registros/);
 assert.match(captureHelp({status:'captured_locally'}),/paso separado/);
 assert.match(captureHelp({status:'network_wait'}),/salida normal a Internet/);
});
test('overview counters are about configured additional clocks, not live network availability',()=>{
 const cfg={clocks:[{clockId:'a',label:'PM-14 · Edificio Nuevo',enabled:true},{clockId:'b',label:'PM-02 · Equipo QA',enabled:true}]};
 const summary={updatedAt:'2026-09-18T10:00:00Z',clocks:[{clockId:'a',lastCaptureAt:'2026-09-17T10:00:00Z',status:'retry_wait',connectionFailureCount:8},{clockId:'b',blocked:true,status:'blocked',lastError:'AUTH_NOT_ACCEPTED'},{clockId:'outsider',blocked:true}]};
 assert.deepEqual(fleetCounts(cfg,summary),{configured:2,withCapture:1,needsReview:1});
 const html=fleetOverview(cfg,summary);assert.match(html,/no a una prueba de conexión en vivo/);assert.match(html,/PM-14 · Edificio Nuevo/);assert.match(html,/Recepción en Neon: no configurada/);assert.doesNotMatch(html,/fetch\(|<script|credentials|172\.100\./);
});
test('installer operates only on the four capture UI modules, with pinned baselines and no config/state editing',()=>{
 const code=fs.readFileSync('scripts/install-fleet-capture-release.mjs','utf8');assert.match(code,/FLEET_UPDATE_INSTALLED_DRIFT/);assert.match(code,/FLEET_UPDATE_SOURCE_MISMATCH/);assert.match(code,/FLEET_UPDATE_CONCURRENT_CHANGE/);assert.match(code,/FLEET_UPDATE_BACKUP_CONFLICT/);
 assert.match(code,/\['capture-policy.mjs','operator-help.mjs','runner.mjs','overview.mjs'\]/);assert.doesNotMatch(code,/\.key['"]|config\\|readCredential|Start-ScheduledTask|Stop-ScheduledTask/);
});
