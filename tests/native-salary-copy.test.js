import test from 'node:test';import assert from 'node:assert/strict';
import {salaryCopyPlan} from '../assets/native-salary-copy-model.js';
import {salaryItems,salaryRowKey} from '../assets/native-salary-catalog-model.js';
import {row} from './fixtures/native-salary-synthetic.js';
const classification=()=>['1','4','6'].flatMap(code=>[{kind:'agreements',code,label:'Convenio sintético '+code},{kind:'categories',code:'6',agreementCode:code,label:'Clase sintética revisada'}]);
const selections=rows=>rows.map(before=>({key:salaryRowKey(before),before:structuredClone(before)}));
const copy=(rows,targets=['4','6'],selected=rows.filter(row=>row.kind==='concept'),catalog=classification())=>salaryCopyPlan(rows,selections(selected),targets,catalog);
const scale=agreementCode=>row({kind:'scale',nature:null,unit:'money',categoryCode:'6',code:'1',value:'1000.00',agreementCode});

test('native concepts prepare two agreements with exact values, units, dates, labels and documentary reference; source is unchanged',()=>{
 const rows=[row({code:'606',precision:8,value:'999999999999999999.00000001',unit:'percent'}),row({code:'607',nature:'auxiliary',value:'0.00',unit:'hours'}),row({code:'612',value:null}),row({code:'550',validUntil:'2026-12'})],before=JSON.stringify(rows),p=copy(rows);
 assert.equal(p.items.length,12);assert.equal(p.changes.length,8);assert.equal(p.newDefinitionsCount,8);assert.equal(p.selectedCount,4);assert.equal(p.dependencyCount,0);assert.equal(p.reusedCount,0);assert.equal(JSON.stringify(rows),before);
 for(const source of rows)for(const agreementCode of ['4','6'])assert.deepEqual(p.items.find(row=>row.code===source.code&&row.agreementCode===agreementCode),{...source,agreementCode});
});
test('transitive concept dependencies are copied completely and existing target scales reused only with exact reviewed definitions',()=>{
 const base=scale('1'),aux=row({code:'88',nature:'auxiliary',dependencies:[salaryRowKey(base)]}),root=row({dependencies:[salaryRowKey(aux)]}),rows=[base,aux,root,scale('4'),scale('6')],p=copy(rows,['4','6'],[root]);
 assert.equal(p.items.length,9);assert.equal(p.changes.length,4);assert.equal(p.dependencyCount,2);assert.equal(p.reusedCount,2);assert.equal(p.comparisons.length,6);
 for(const target of ['4','6']){assert.deepEqual(p.items.find(row=>row.code==='95'&&row.agreementCode===target).dependencies,['concept:'+target+'::88:2026-10']);assert.deepEqual(p.items.find(row=>row.code==='88'&&row.agreementCode===target).dependencies,['scale:'+target+':6:1:2026-10']);}
});
test('matching concepts cause an explicit zero-change review, without invented additions',()=>{
 const source=row(),existing={...source,agreementCode:'4'},p=copy([source,existing],['4'],[source]);assert.equal(p.newDefinitionsCount,0);assert.equal(p.changes.length,0);assert.equal(p.reusedCount,1);assert.deepEqual(p.items,salaryItems([source,existing]));
});
test('different target definition refuses the entire set, shows every target and does not overwrite its data',()=>{
 const source=row({value:'0.00'}),existing=row({agreementCode:'4',value:'1.00'}),rows=[source,existing],before=JSON.stringify(rows);
 assert.throws(()=>copy(rows,['4','6'],[source]),error=>{assert.equal(error.code,'COPY_CONFLICT');assert.equal(error.conflicts.length,1);assert.equal(error.comparisons.length,2);assert.equal(error.conflicts[0].existing.value,'1.00');assert.equal(error.conflicts[0].target.value,'0.00');assert.equal(error.comparisons.find(row=>row.target.agreementCode==='6').disposition,'new');return true;});assert.equal(JSON.stringify(rows),before);
});
test('an absent target scale blocks preparation rather than creating an assumed class/value',()=>{
 const base=scale('1'),source=row({dependencies:[salaryRowKey(base)]});assert.throws(()=>copy([base,source],['4'],[source]),error=>error.conflicts[0].disposition==='missing_scale'&&error.comparisons.length===2);
});
test('a different target scale never becomes a copied value or silently changes a concept dependency',()=>{
 const base=scale('1'),source=row({dependencies:[salaryRowKey(base)]}),different=scale('4');different.value='2000.00';assert.throws(()=>copy([base,source,different],['4'],[source]),error=>error.conflicts[0].disposition==='different'&&error.conflicts[0].existing.value==='2000.00');
});
test('missing or ambiguous target category is a conflict even if its numeric scale key and values match',()=>{
 const base=scale('1'),source=row({dependencies:[salaryRowKey(base)]}),rows=[base,source,scale('4')],catalog=classification().filter(row=>!(row.kind==='categories'&&row.agreementCode==='4'));
 assert.throws(()=>copy(rows,['4'],[source],catalog),error=>error.conflicts[0].disposition==='missing_class');catalog.push(...classification().filter(row=>row.kind==='categories'&&row.agreementCode==='4'),...classification().filter(row=>row.kind==='categories'&&row.agreementCode==='4'));assert.throws(()=>copy(rows,['4'],[source],catalog),error=>error.conflicts[0].disposition==='missing_class');
});
test('future and past active interval overlaps are compared and refuse the complete preparation',()=>{
 const source=row(),future=row({agreementCode:'4',validFrom:'2026-11'});assert.throws(()=>copy([source,future],['4'],[source]),error=>error.conflicts[0].disposition==='overlap'&&error.conflicts[0].overlapping[0].validFrom==='2026-11');
 const bounded=row({validFrom:'2026-12',validUntil:'2027-01'}),past=row({agreementCode:'4',validFrom:'2026-01',validUntil:'2026-12'});assert.throws(()=>copy([bounded,past],['4'],[bounded]),error=>error.conflicts[0].disposition==='overlap');
});
test('nonoverlapping historical and deactivated definitions are retained without reopening them',()=>{
 const source=row(),history=row({agreementCode:'4',validFrom:'2026-01',validUntil:'2026-09',value:'1.00'}),inactive=row({agreementCode:'4',validFrom:'2025-01',active:false,value:'2.00'}),p=copy([source,history,inactive],['4'],[source]);assert.equal(p.items.length,4);assert.deepEqual(p.items.find(row=>row.validFrom==='2025-01'),inactive);assert.deepEqual(p.items.find(row=>row.validFrom==='2026-01'),history);
 const sameKey={...source,agreementCode:'4',active:false};assert.throws(()=>copy([source,sameKey],['4'],[source]),error=>error.conflicts[0].disposition==='different');
});
test('dependency diamonds copy each definition once; reversed selections and targets yield the same complete plan',()=>{
 const aux=row({code:'88'}),a=row({code:'95',dependencies:[salaryRowKey(aux)]}),b=row({code:'44',dependencies:[salaryRowKey(aux)]}),rows=[aux,a,b];const p=copy(rows,['6','4'],[a,b]);assert.equal(p.newDefinitionsCount,6);assert.equal(p.dependencyCount,1);assert.deepEqual(p,copy([...rows].reverse(),['4','6'],[b,a]));
});
test('up to 1000 total definitions succeeds; an excess fails globally without truncation or source mutation',()=>{
 const selected=Array.from({length:90},(_,i)=>row({code:String(1000+i)})),p=copy(selected);assert.equal(p.items.length,270);assert.equal(p.changes.length,180);
 const rows=Array.from({length:500},(_,i)=>row({code:String(1000+i)}));assert.equal(copy(rows,['4']).items.length,1000);const before=JSON.stringify(rows);assert.throws(()=>copy(rows),/excede 1.000/);assert.equal(JSON.stringify(rows),before);
});
test('empty, duplicated, edited, inactive, scale and mixed-source selections fail closed',()=>{
 const current=[row(),row({code:'88',active:false}),scale('1'),row({agreementCode:'4'})];
 for(const selected of [[],selections([current[0],current[0]]),[{key:salaryRowKey(current[0]),before:{...current[0],value:'0.00'}}],selections([current[1]]),selections([current[2]]),selections([current[0],current[3]]),[null],[{key:'invalid',before:current[0]}]])assert.throws(()=>salaryCopyPlan(current,selected,['6'],classification()));
});
test('unknown, source, repeated, malformed and ambiguous agreements cannot be destinations',()=>{
 for(const targets of [[],['1'],['4','4'],['99'],['4;DROP'],[4]])assert.throws(()=>copy([row()],targets));const catalog=classification();catalog.push(catalog[2]);assert.throws(()=>copy([row()],['4'],[row()],catalog));
 assert.throws(()=>copy([row()],['4'],[row()],classification().filter(row=>!(row.kind==='agreements'&&row.code==='1'))));
});
test('numeric agreement spelling is preserved and not converted to another agreement identity',()=>{
 const p=copy([row()],['04'],[row()],[...classification(),{kind:'agreements',code:'04',label:'Convenio declarado sintético'}]);assert.equal(p.items.find(row=>row.agreementCode!=='1').agreementCode,'04');assert.equal(p.targets[0],'04');
});
test('malformed complete catalogs, omitted dependencies and cycles never become a partial copy',()=>{
 const source=row({dependencies:['concept:1::88:2026-10']});assert.throws(()=>copy([source]));const aux=row({code:'88',dependencies:['concept:1::95:2026-10']});assert.throws(()=>copy([source,aux]));assert.throws(()=>copy([{...row(),unexpected:true}]));
});
