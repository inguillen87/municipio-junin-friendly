import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogItems,catalogDeclareRegistration,catalogDiff,catalogRegistrationAllowed} from '../assets/native-employment-catalog-model.js';
import {employeeRegistrationOptions,employeeCreationBootstrap} from '../assets/native-employee-confirmation-model.js';
import {catalog,ID,TENANT} from './fixtures/native-employee-synthetic.js';
const legacy=()=>catalog.items.map((r,i)=>({...r,key:'qa-'+i,agreementCode:r.agreementCode??null}));
const complete=()=>catalogDeclareRegistration(legacy());
const existing=()=>[...complete(),{kind:'agreements',key:'qa-existing',code:'9',label:'Encuadre existente QA',agreementCode:null,registrationAllowed:false},{kind:'categories',key:'qa-category-existing',code:'6',label:'Clase existente QA',agreementCode:'9',registrationAllowed:false}];
test('a complete explicit catalog preserves existing-contract encuadres without offering them for a new hire',()=>{
 const rows=catalogItems(existing());assert.equal(rows.find(r=>r.kind==='agreements'&&r.code==='9').registrationAllowed,false);
 assert.equal(employeeRegistrationOptions(rows,'agreements').some(r=>r.code==='9'),false);
 assert.equal(employeeRegistrationOptions(rows,'categories').some(r=>r.agreementCode==='9'),false);
 assert.equal(rows.length,legacy().length+2);assert.equal(catalogRegistrationAllowed(rows.find(r=>r.code==='9')),false);
});
test('a new declared municipal catalog controls registration by an explicit decision rather than a legacy numeric code',()=>{
 const rows=existing();for(const r of rows)if(r.code==='9'||r.agreementCode==='9')r.registrationAllowed=true;
 assert.equal(employeeRegistrationOptions(catalogItems(rows),'agreements').some(r=>r.code==='9'),true);
 assert.equal(employeeRegistrationOptions(catalogItems(rows),'categories').some(r=>r.agreementCode==='9'),true);
});
test('the original five-field catalogs and excluded-code rules remain unchanged',()=>{
 const rows=legacy();assert.deepEqual(catalogItems(rows).map(r=>Object.hasOwn(r,'registrationAllowed')),rows.map(()=>false));
 for(const code of['9','10','09','00010'])assert.throws(()=>catalogItems([...rows,{kind:'agreements',key:'old',code,label:'QA',agreementCode:null}]));
 assert.deepEqual(employeeRegistrationOptions(rows,'agreements'),rows.filter(r=>r.kind==='agreements'));
});
test('new flags must be complete booleans and may not authorize a category whose parent is restricted',()=>{
 for(const value of[null,'true',1,undefined]){const rows=existing();rows[0].registrationAllowed=value;assert.throws(()=>catalogItems(rows));}
 const mixed=existing();delete mixed[0].registrationAllowed;assert.throws(()=>catalogItems(mixed));
 const orphan=existing();orphan.at(-1).registrationAllowed=true;assert.throws(()=>catalogItems(orphan));
 assert.equal(employeeRegistrationOptions(orphan,'categories').some(r=>r.agreementCode==='9'),false);
});
test('a flag-only change and the first explicit declaration are visible in the complete independent comparison',()=>{
 const base=catalogItems(legacy()),next=catalogDeclareRegistration(base);assert.equal(catalogDiff(base,next).length,base.length);
 const changed=structuredClone(next);changed.find(r=>r.kind==='organizations').registrationAllowed=false;
 const diff=catalogDiff(next,changed);assert.equal(diff.length,1);assert.equal(diff[0].change,'changed');assert.equal(diff[0].after.registrationAllowed,false);
 const keysOnly=structuredClone(changed);keysOnly[0].key='another source';assert.deepEqual(catalogDiff(changed,keysOnly),[]);
});
test('registration bootstrap rejects ambiguous or malformed flags before exposing options',()=>{
 const value={version:'native-employee.v1',canCreate:true,today:'2026-10-13',suggestedLegajo:'400',scope:{tenantId:TENANT,membershipId:ID},catalog:{version:'a'.repeat(64),items:existing()}};
 assert.equal(employeeCreationBootstrap(value).catalog.items.length,value.catalog.items.length);
 for(const flag of['false',null,0]){const bad=structuredClone(value);bad.catalog.items[0].registrationAllowed=flag;assert.throws(()=>employeeCreationBootstrap(bad));}
 const partial=structuredClone(value);delete partial.catalog.items[0].registrationAllowed;assert.throws(()=>employeeCreationBootstrap(partial));
});
