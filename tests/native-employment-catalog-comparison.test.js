import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogItems,catalogDeclareRegistration,catalogDiff,catalogChangeSummary} from '../assets/native-employment-catalog-model.js';
const item=(kind,code,label,agreementCode=null)=>({kind,code,label,agreementCode,key:kind+':'+(agreementCode??'')+':'+code});
const base=()=>catalogItems([item('agreements','1','Convenio'),item('categories','3','Clase','1'),item('organizations','2','Sector'),item('sectors','4','Repartición'),item('sectors','5','Repartición retirable')]);

test('declaraciones iniciales permanecen en todas las diferencias y tienen conteo propio',()=>{
 const previous=base(),next=catalogDeclareRegistration(previous);
 assert.deepEqual(catalogChangeSummary(previous,next),{added:0,changed:0,removed:0,declarations:5,total:5});
 assert.equal(catalogDiff(previous,next).length,5);assert.ok(catalogDiff(previous,next).every(d=>d.after.registrationAllowed===true&&!Object.hasOwn(d.before,'registrationAllowed')));
});
test('conserva una incorporación, un cambio de contenido y un retiro además de las tres declaraciones iguales',()=>{
 const previous=base(),next=catalogDeclareRegistration(previous).filter(r=>!(r.kind==='sectors'&&r.code==='5'));next.find(r=>r.kind==='agreements').label='Convenio actualizado';next.push({...item('sectors','6','Nueva repartición'),registrationAllowed:false});
 assert.deepEqual(catalogChangeSummary(previous,next),{added:1,changed:1,removed:1,declarations:3,total:6});assert.equal(catalogDiff(previous,next).length,6);
});
test('cerrar o abrir nuevas altas se cuenta como cambio efectivo aunque no cambie la descripción',()=>{
 const previous=catalogDeclareRegistration(base()),next=structuredClone(previous);next.find(r=>r.kind==='sectors'&&r.code==='4').registrationAllowed=false;
 assert.deepEqual(catalogChangeSummary(previous,next),{added:0,changed:1,removed:0,declarations:0,total:1});assert.equal(catalogDiff(previous,next)[0].after.registrationAllowed,false);
});
test('un cambio de clave de origen conserva los conteos y no fabrica diferencias',()=>{
 const previous=base(),next=structuredClone(previous);next[0].key='Otra clave de origen';
 assert.deepEqual(catalogChangeSummary(previous,next),{added:0,changed:0,removed:0,declarations:0,total:0});
});
