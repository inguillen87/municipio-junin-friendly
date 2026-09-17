import test from 'node:test';import assert from 'node:assert/strict';
import {attendancePointCode,attendancePointLabel} from '../assets/attendance-point-label.js';
import {canonicalFleetPointNames} from '../lib/attendance-point-naming.js';
import {prepareClockNames} from '../scripts/name-junin-clock-points.mjs';
import inventory from '../data/junin-attendance-inventory.v1.json' with {type:'json'};
const principal={tenant:{slug:'junin-mendoza'}};
test('all 13 canonical names come from the municipal workbook, exact point keys only',()=>{
 const source={devices:inventory.sites.map(s=>({siteKey:s.code.toLowerCase(),label:'Old alias',deviceId:s.code}))};
 const result=canonicalFleetPointNames(source,principal);
 assert.deepEqual(result.devices.map(d=>d.label),inventory.sites.map(s=>s.name));
 assert.equal(source.devices[0].label,'Old alias');assert.equal(result.devices[0].deviceId,'PM-01');
 assert.equal(attendancePointLabel('pm-02',result.devices[1].label),'PM-02 · Compras y Suministros');
});
test('a vendor number, unknown key or another tenant cannot obtain a Junin point assignment',()=>{
 const source={devices:[{siteKey:'12',label:'Compras'},{siteKey:'edificio-nuevo',label:'Edificio Nuevo'}]};
 assert.deepEqual(canonicalFleetPointNames(source,principal),source);
 assert.equal(canonicalFleetPointNames(source,{tenant:{slug:'another'}}),source);
 assert.equal(attendancePointCode('12'),'12');assert.equal(attendancePointLabel('pm-10','PM-10 · Edificio Viejo'),'PM-10 · Edificio Viejo');
 for(const bad of ['pm 2','../pm-2',null,'<img>'])assert.throws(()=>attendancePointCode(bad));
});
test('local names preserve clock IDs, serials, paths, keys and settings; new building stays unassigned',()=>{
 const ids=['la-colonia','galpon','polideportivo-la-colonia','edificio-nuevo','compras'];
 const source={schema:'municontrol-clock-fleet.v1',stateDir:'private-state',clocks:ids.map((clockId,i)=>({clockId,label:'Old',serial:'SERIAL-'+i,credentialFile:'private-'+i,pollSeconds:900}))};
 const plan=prepareClockNames(source);assert.deepEqual(plan.changes.map(x=>x.pointCode),['PM-05','PM-03','PM-06',null,'PM-02']);
 for(let i=0;i<ids.length;i++){const {label,...a}=plan.config.clocks[i],{label:old,...b}=source.clocks[i];assert.deepEqual(a,b);assert.equal(old,'Old');}
 assert.equal(plan.config.clocks[3].label,'PM pendiente · Edificio Nuevo');assert.equal(prepareClockNames(plan.config).changes.length,0);
 assert.throws(()=>prepareClockNames({...source,clocks:[{clockId:'unknown'}]}));assert.throws(()=>prepareClockNames({...source,clocks:[source.clocks[0],source.clocks[0]]}));
});
