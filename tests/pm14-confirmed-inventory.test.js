import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import original from '../data/junin-attendance-inventory.v1.json' with {type:'json'};
import addition from '../data/junin-attendance-additions.v1.json' with {type:'json'};
import {getReportedAttendanceInventory} from '../lib/internal-attendance-reported-inventory.js';
import {appendReportedAdditions} from '../lib/attendance-inventory-additions.js';
import {canonicalFleetPointNames,canonicalClockOperationPointNames} from '../lib/attendance-point-naming.js';
const principal={tenant:{slug:'junin-mendoza'}},merged=()=>getReportedAttendanceInventory(principal);
const base=()=>({...merged(),source:{kind:'municipal_workbook',status:'reported_inventory',recordCount:13,mappingVersion:original.source.mappingVersion},data:merged().data.slice(0,13)});
test('PM-14 is an addition, never a fabricated fourteenth Excel row',()=>{
 const x=merged();assert.equal(original.sites.length,13);assert.equal(original.source.recordCount,13);assert.equal(x.data.length,14);assert.equal(x.source.workbookRecordCount,13);assert.equal(x.source.additionalRecordCount,1);
 for(let i=0;i<13;i++){assert.equal(x.data[i].code,original.sites[i].code);assert.equal(x.data[i].latitude,original.sites[i].latitude);assert.equal(x.data[i].longitude,original.sites[i].longitude);assert.equal(x.data[i].name,original.sites[i].name);}
});
test('the new point uses the public building reference, separately from connection and physical verification',()=>{
 const p=merged().data.at(-1);assert.equal(p.code,'PM-14');assert.equal(p.name,'Edificio Nuevo');assert.equal(p.latitude,-33.1422201);assert.equal(p.longitude,-68.4845214);assert.equal(p.locationBasis,'public_map_building_reference');assert.equal(p.physicalLocationVerified,false);assert.equal(p.model,'No verificado');assert.equal(merged().physicalConnectionConfirmed,false);
 assert.ok(!original.sites.some(s=>s.latitude===p.latitude&&s.longitude===p.longitude));assert.equal(p.address,'Román Cano e Hipólito Yrigoyen, Junín, Mendoza');
});
test('point metadata contains no network endpoint, credential, serial or biometric data',()=>{
 const encoded=JSON.stringify(merged());assert.doesNotMatch(encoded,/172\.100|ip_address|token|password|serial|biometric/i);assert.doesNotMatch(JSON.stringify(addition),/172\.100/);assert.ok(Object.isFrozen(merged().data.at(-1)));
 assert.equal(getReportedAttendanceInventory({tenant:{slug:'another'}}),null);
});
test('explicit point keys align both fleet and detail names, but vendor numbers do not',()=>{
 const x=canonicalFleetPointNames({devices:[{siteKey:'pm-14',label:'Old',deviceId:'unchanged'},{siteKey:'5',label:'Vendor 5'}]},principal);
 assert.equal(x.devices[0].label,'Edificio Nuevo');assert.equal(x.devices[0].deviceId,'unchanged');assert.equal(x.devices[1].label,'Vendor 5');
 const r=canonicalClockOperationPointNames({site:{key:'pm-14',label:'Unknown'},sites:[{key:'pm-14',label:'Unknown'}]},principal);assert.equal(r.site.label,'Edificio Nuevo');assert.equal(r.sites[0].label,'Edificio Nuevo');
});
for(const [name,change] of [['tenant',a=>a.tenantSlug='other'],['workbook',a=>a.baseInventorySha256='0'.repeat(64)],['claim of survey',a=>a.source.physicalLocationVerified=true],['duplicate code',a=>a.sites[0].code='PM-10'],['copied coordinate',a=>Object.assign(a.sites[0],{latitude:original.sites[9].latitude,longitude:original.sites[9].longitude})],['unknown latitude',a=>a.sites[0].latitude=null],['invented hardware',a=>a.sites[0].model='K20'],['private endpoint',a=>a.sites[0].ip='secret']])test('rejects addition drift: '+name,()=>{const a=structuredClone(addition);change(a);assert.throws(()=>appendReportedAdditions(base(),a,original.source.sha256));});
