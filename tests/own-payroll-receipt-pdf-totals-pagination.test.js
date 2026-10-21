import test from 'node:test';
import assert from 'node:assert/strict';
import {ownReceiptPresentation} from '../assets/own-payroll-receipt-model.js';
import {ownReceiptTotalsPaginationFixture} from './fixtures/own-payroll-receipt-totals-pagination-synthetic.js';
import {ownReceiptPages} from '../assets/own-payroll-receipt-pdf.js';

function texts(pages){
 const pattern=/^BT \/(F[12]) ([0-9.]+) Tf [0-9. ]+ rg 1 0 0 1 (-?[0-9.]+) (-?[0-9.]+) Tm <([a-f0-9]*)> Tj ET$/;
 return pages.flatMap((operations,page)=>operations.map(operation=>{const match=pattern.exec(operation);return match?{page,font:match[1],size:Number(match[2]),x:Number(match[3]),y:Number(match[4]),text:Buffer.from(match[5],'hex').toString('latin1')}:null;}).filter(Boolean));
}

test('the totals heading, six exact totals and net explanation stay together for the eight-concept receipt',()=>{
 const f=ownReceiptTotalsPaginationFixture(),before=JSON.stringify(f),presentation=ownReceiptPresentation(f.record);
 assert.equal(f.record.concepts.length,8);assert.equal(f.record.precision,8);
 assert.deepEqual(presentation.groups.map(group=>group.nature),['remuneration','non_remuneration','deduction','employer_contribution','auxiliary']);
 assert.equal(presentation.totals.length,6);
 const draws=texts(ownReceiptPages(f.record,f.params,f.source));
 const headings=draws.filter(draw=>draw.text==='Totales exactos de la liquidación cerrada');
 assert.equal(headings.length,1,'one complete totals section');const heading=headings[0];
 const totalDraws=presentation.totals.map(total=>{
  const exact=total.label+': '+total.displayAmount,found=draws.filter(draw=>draw.text===exact);
  assert.equal(found.length,1,'each exact total occurs once: '+total.key);
  assert.equal(found[0].page,heading.page,'totals section must not split: '+total.key);
  assert.ok(found[0].y<heading.y&&found[0].y>=78,'total remains below its heading in the printable body');
  return found[0];
 });
 const net=totalDraws.at(-1),netIndex=draws.indexOf(net),originIndex=draws.findIndex(draw=>draw.text==='Origen y estado del documento');
 assert.ok(originIndex>netIndex,'the following section stays after all totals');
 const explanation=draws.slice(netIndex+1,originIndex).filter(draw=>draw.page===heading.page&&draw.y>=78);
 assert.equal(explanation.map(draw=>draw.text).join(' '),presentation.netExplanation,'the full net explanation stays on the totals page');
 assert.ok(explanation.length>0);
 for(const concept of f.record.concepts)assert.equal(draws.filter(draw=>draw.text===concept.code).length,1,'every source concept remains present');
 assert.equal(JSON.stringify(f),before,'pagination never mutates values, labels, identity or declared parameters');
});
