import test from 'node:test';
import assert from 'node:assert/strict';
import { ownRunDepartmentsForAll } from '../assets/own-run-departments.js';
test('department shortcut remains usable when all verified own contract UUIDs are canonical non RFC', () => {
  const ids=['11111111-2222-f333-0444-555555555555','66666666-7777-0888-c999-aaaaaaaaaaaa'];
  const plan=ownRunDepartmentsForAll([
    {contractId:ids[0],legajo:'1',name:'Sintetico A',sector:'ADMINISTRACION',status:'active'},
    {contractId:ids[1],legajo:'2',name:'Sintetico B',sector:'OBRAS',status:'active'},
    {contractId:'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',legajo:'3',sector:null,status:'active'}
  ],[{kind:'sectors',code:'20',label:'ADMINISTRACION'},{kind:'sectors',code:'21',label:'OBRAS'}]);
  assert.equal(plan.usable,true);
  assert.deepEqual(plan.codes,['20','21']);
  assert.equal(plan.covered,2);
  assert.deepEqual(plan.unsectored,['3']);
  assert.deepEqual(plan.contracts.map(c=>c.contractId),ids);
});
