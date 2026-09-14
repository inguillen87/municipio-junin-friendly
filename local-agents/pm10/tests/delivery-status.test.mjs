// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {deliveryStatusProjection,loadDeliveryStatus} from '../delivery-status.mjs';
import {initialState,loadState,statusHtml,writeStatus} from '../service.mjs';

const updatedAt='2026-09-14T04:00:00.000Z',lastReceiptAt='2026-09-13T12:00:00.000Z';
const summary={version:'pm10-sender-status.v1',state:'queue_confirmed',physicalClockVerified:false,
 updatedAt,confirmedRecords:1001,remainingParts:0,sent:0,lastReceiptAt,captureFilesRemoved:false};
async function fixture(fn){
 const root=await mkdtemp(path.join(os.tmpdir(),'pm10-panel-'));
 try{const dir=path.join(root,'delivery');await mkdir(dir,{mode:0o700});await fn(root,path.join(dir,'status.json'));}
 finally{await rm(root,{recursive:true,force:true});}
}
test('panel displays saved acknowledgements without changing the capture-only state',()=>fixture(async(root,file)=>{
 await writeFile(file,JSON.stringify({...summary,employeeName:'SYNTHETIC_PRIVATE_NAME',token:'SYNTHETIC_PRIVATE_TOKEN'}));
 const capture={...initialState(),uniqueLocalRecords:1001,pendingLocalBatches:2};
 await writeStatus(root,capture);
 const html=await readFile(path.join(root,'estado.html'),'utf8');
 assert.match(html,/REGISTROS CON ACUSE CONSERVADO/);assert.match(html,/1001/);
 assert.match(html,/LOTES CONSERVADOS LOCALMENTE/);assert.match(html,/Último acuse conservado/);
 assert.match(html,/no confirma una conexión actual/);assert.match(html,/pueden estar desactualizados/);
 assert.match(html,/Partes pendientes al revisar<\/dt><dd>0/);
 assert.doesNotMatch(html,/SYNTHETIC_PRIVATE|Receptor continuo no conectado|Subida a Neon pendiente/);
 assert.deepEqual(await loadState(root),capture);
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'status.json'),'utf8')),capture);
 assert.equal(JSON.parse(await readFile(file,'utf8')).employeeName,'SYNTHETIC_PRIVATE_NAME');
}));
test('retry state exposes its recorded error and schedule without inventing zero acknowledgements',()=>fixture(async(root,file)=>{
 const retry={version:summary.version,state:'retry_wait',physicalClockVerified:false,updatedAt,
  code:'DELIVERY_NETWORK_RETRY',failures:1,nextAttemptAt:'2026-09-14T04:02:00.000Z'};
 await writeFile(file,JSON.stringify(retry));const display=await loadDeliveryStatus(root),html=statusHtml(initialState(),display);
 assert.equal(display.confirmedRecords,null);assert.equal(display.remainingParts,null);
 assert.match(html,/Sin dato/);assert.match(html,/No se completó el envío/);assert.match(html,/Próximo reintento informado/);
 assert.match(html,/El último envío falló/);assert.doesNotMatch(html,/Receptor continuo no conectado/);
}));
test('absent sender status is distinguished from corrupt sender status',()=>fixture(async(root,file)=>{
 assert.deepEqual(await loadDeliveryStatus(root),{availability:'missing'});
 assert.match(statusHtml(initialState(),await loadDeliveryStatus(root)),/Subida a Neon pendiente/);
 await writeFile(file,'{invalid');await writeStatus(root,initialState());
 assert.deepEqual(await loadDeliveryStatus(root),{availability:'invalid'});
 assert.match(await readFile(path.join(root,'estado.html'),'utf8'),/No se pudo leer el estado del envío/);
 assert.equal((await loadState(root)).mode,'capture_only');assert.equal((await loadState(root)).cloudConfirmedRecords,0);
}));
for(const patch of [{updatedAt:'bad date'},{physicalClockVerified:true},{confirmedRecords:-1},{remainingParts:1},
 {lastReceiptAt:null},{captureFilesRemoved:true},{code:'<script>private</script>'},{confirmedRecords:Number.MAX_SAFE_INTEGER+1}]){
 test('invalid delivery projection is unavailable: '+Object.keys(patch).join(','),()=>fixture(async(root,file)=>{
  await writeFile(file,JSON.stringify({...summary,...patch}));assert.deepEqual(await loadDeliveryStatus(root),{availability:'invalid'});
 }));
}
test('oversized delivery status is not rendered',()=>fixture(async(root,file)=>{
 await writeFile(file,' '.repeat(8193));assert.deepEqual(await loadDeliveryStatus(root),{availability:'invalid'});
}));
test('delivery status cannot be read through a symlink',{skip:process.platform==='win32'},()=>fixture(async(root,file)=>{
 const target=path.join(root,'private-file');await writeFile(target,JSON.stringify(summary));await symlink(target,file);
 assert.deepEqual(await loadDeliveryStatus(root),{availability:'invalid'});
}));
test('unknown error codes use a neutral label rather than echoing persisted text',()=>{
 const display=deliveryStatusProjection({version:summary.version,state:'blocked',physicalClockVerified:false,updatedAt,code:'SYNTHETIC_PRIVATE_VALUE'});
 const html=statusHtml(initialState(),display);assert.match(html,/requiere revisión/);assert.doesNotMatch(html,/SYNTHETIC_PRIVATE_VALUE/);
});
test('capture installers include the read-only delivery panel module',async()=>{
 for(const name of ['install-linux.sh','install-windows.ps1']){
  assert.match(await readFile(new URL('../install/'+name,import.meta.url),'utf8'),/delivery-status\.mjs/);
 }
});
