import test from 'node:test';
import assert from 'node:assert/strict';
import {PayrollPanelElement} from './fixtures/payroll-panel-dom.js';
import {detail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {mountOwnPayrollIndividual} from '../assets/own-payroll-individual-panel.js';
import {ownLiquidationIndividual} from '../assets/own-payroll-liquidation-model.js';
import {namespaceCapture,seal} from './fixtures/own-payroll-screen-labels-synthetic.js';

// Executes the real individual renderer on the existing minimal DOM substrate.
// It cannot establish browser layout, CSS, focus geometry or script execution.
test('real individual renderer shows captured names and numeric units as text, preserving totals and revocation',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
 const doc={head:new PayrollPanelElement('head'),querySelectorAll:()=>[],createElement:tag=>new PayrollPanelElement(tag)};
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:doc});
 try{
  const d=detail();d.capture=namespaceCapture();const id=d.employees[0].contractId;
  const payload='<img src=x onerror=alert(1)> & texto conservado';
  d.capture.payload.programState.salaryCatalog.items.find(r=>r.kind==='concept').label=payload;seal(d.capture);
  const value=ownLiquidationIndividual(d,id),host=new PayrollPanelElement(),before=structuredClone(value);let allowed=true;
  const panel=mountOwnPayrollIndividual(host,{id:'qaOnly',canUse:()=>allowed});panel.show(value,null,false);
  assert.equal(host.hidden,false);assert.equal(host.querySelector('ol').children.length,2);
  const headings=host.querySelectorAll('h5').map(n=>n.textContent);
  assert.ok(headings.includes('Concepto 100 · '+payload));assert.ok(headings.includes('Concepto 100 · Días sintéticos conservados'));
  const amounts=host.querySelector('ol').querySelectorAll('p').map(n=>n.textContent);
  assert.ok(amounts.includes('30 · Días'));assert.ok(amounts.includes('$ 1,00'));
  assert.equal(host.querySelectorAll('img').length,0);assert.equal(host.querySelectorAll('script').length,0);
  assert.deepEqual(value,before);
  const without=structuredClone(value);without.labels[0]=null;panel.show(without,null,false);
  assert.equal(host.querySelectorAll('h5')[0].textContent,'Concepto 100 · Descripción no conservada en la captura');
  allowed=false;panel.show(value,null,false);assert.equal(host.hidden,true);assert.equal(host.children.length,0);assert.equal(panel.selected,null);
 }finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
});
