import test from 'node:test';import assert from 'node:assert/strict';
import {parseBudgetStructure,structureView,verifyBudgetStructure} from '../assets/budget-structure-model.js';
import {budgetStructurePdf} from '../assets/budget-structure-pdf.js';
import {syntheticStructurePages} from '../scripts/budget-structure-synthetic.mjs';
const read=pages=>parseBudgetStructure(pages??syntheticStructurePages(),{sha256:'a'.repeat(64)});
test('continuation across pages keeps the full cargo and original leading zeros',()=>{const s=read();assert.equal(s.groups.length,7);assert.equal(s.groups[0].members.length,30);assert.equal(s.groups[0].members[18].sourcePage,2);assert.equal(s.groups[0].members[0].number,'0001');assert.equal(s.groups[0].values[2],'00')});
test('zero quantity occupied row and absence of detail are preserved, not made vacant',()=>{const s=read();assert.equal(s.groups[1].values[8],'0');assert.equal(s.groups[1].values[10],'Ocupado');assert.equal(s.groups[1].members.length,0);const v=structureView(s);assert.equal(v.mismatchedGroups,1);assert.equal(v.zeroQuantityGroups,2)});
test('name equality does not deduplicate different legajos or structures',()=>{const v=structureView(read(),{query:'nombre qa repetido'});assert.equal(v.groups.length,2);assert.equal(v.assignments,2);assert.equal(v.distinctNumbers,2)});
test('a member match selects its complete structure without altering population',()=>{const v=structureView(read(),{query:'qa 029'});assert.equal(v.groups.length,1);assert.equal(v.assignments,30);assert.equal(v.reportedQuantity,30)});
test('accent-insensitive search and ordering do not mutate source',()=>{const s=read(),before=JSON.stringify(s);assert.equal(structureView(s,{query:'area',order:'name'}).visibleGroups,1);structureView(s,{order:'number',mode:'simple'});assert.equal(JSON.stringify(s),before)});
const mutations={
 pageOrder:p=>p[1].number=3,dimension:p=>p[0].width=NaN,header:p=>p[0].items[0].text='OTHER REPORT',
 date:p=>p[1].items[2].text='31/02/2026 12:20 PM',mixedDates:p=>p[1].items[2].text='24/09/2026 12:20 PM',
 columns:p=>p[0].items.find(t=>t.text==='Cant').text='Presupuesto',coordinate:p=>p[0].items[0].x=Infinity,
 duplicateGroup:p=>p[1].items.find(t=>t.text==='2'&&t.x===49).text='1',
 duplicateMember:p=>p[1].items.find(t=>t.text==='0019').text='0001',unknownRow:p=>p[1].items.push({text:'NOT A VALID DETAIL',x:400,y:540}),
 controlText:p=>p[0].items[0].text+='\u202e',negativeQuantity:p=>p[0].items.find(t=>t.x===650&&t.y===140).text='-1'
};for(const [name,mutate]of Object.entries(mutations))test('reject '+name+' without returning partial records',()=>{const p=syntheticStructurePages();mutate(p);assert.throws(()=>read(p))});
test('untrusted hash, data shape, and unsupported filters are rejected',()=>{assert.throws(()=>parseBudgetStructure(syntheticStructurePages(),{sha256:'unknown'}));const s=read();assert.throws(()=>verifyBudgetStructure({...s,groups:[]}));assert.throws(()=>structureView(s,{order:'person-id'}));assert.throws(()=>structureView(s,{query:'x'.repeat(121)}))});
test('PDF marks documentary scope, carries source hash and has a complete page tree',()=>{for(const mode of ['simple','detailed']){const pdf=Buffer.from(budgetStructurePdf(read(),{mode})).toString();assert.ok(pdf.startsWith('%PDF-1.4'));assert.ok(pdf.endsWith('%%EOF\n'));assert.match(pdf,/\/Type \/Pages/);assert.ok(pdf.includes(Buffer.from('Sin firma ni homologación presupuestaria','latin1').toString('hex')))}});
test('export cannot silently replace a glyph it cannot encode',()=>{const s=read();s.groups[0].members[0].name='PERSONA QA \u4e2d';assert.throws(()=>budgetStructurePdf(s),/no puede representar/)});
