import test from 'node:test';
import assert from 'node:assert/strict';
import {SALARY_FILE_HEADER,SALARY_FILE_MAX_BYTES,salaryFileExport,salaryFilePlan} from '../assets/native-salary-file-model.js';
import {salaryItems,salaryRowKey} from '../assets/native-salary-catalog-model.js';
import {row,bootstrap} from './fixtures/native-salary-synthetic.js';
const classification=bootstrap().classification.items;
const plan=(items,text)=>salaryFilePlan(items,text,classification);
const all=()=>salaryItems(Array.from({length:75},(_,n)=>row({code:String(n+1),label:'Definición QA '+(n+1)})));
test('complete 75-row CSV and exact draft comparison survive a display-only filter',()=>{const before=all(),after=before.map(r=>({...r,value:'0.00'})),text=salaryFileExport(after),result=plan(before,text);assert.equal(before.filter(r=>r.code==='7').length,1);assert.equal(result.total,75);assert.equal(result.changedCount,75);assert.deepEqual(result.items,after);assert.deepEqual(before,all());});
test('empty, explicit zero, negative and 18-digit8-decimal values retain their exact strings',()=>{const items=salaryItems([[null,2],['0.00',2],['-12.500',3],['999999999999999999.12345678',8]].map(([value,precision],n)=>row({code:String(n+1),value,precision})));assert.deepEqual(plan([],salaryFileExport(items)).items,items);});
test('all natures, units, inactive antecedents and exact dependency keys round trip',()=>{const items=salaryItems(['remuneration','non_remuneration','deduction','employer_contribution','auxiliary'].map((nature,n)=>row({code:String(n+1),nature,unit:['money','hours','minutes','percent','coefficient'][n],active:n!==3})));items[0].dependencies=[salaryRowKey(items[4])];const scale=row({kind:'scale',code:'10',categoryCode:'6',nature:null,unit:'money',value:'12.00'});assert.deepEqual(plan([],salaryFileExport([...items,scale])).items,salaryItems([...items,scale]));});
test('literal text protects formula prefixes, apostrophes and delimiters without evaluating',()=>{for(const label of ['=1+1','+SUM(1)','-1+1','@QA',"'literal",'Texto; "comillas"']){const text=salaryFileExport([row({label})]);assert.ok(text.includes('"\''));assert.equal(plan([],text).items[0].label,label);}assert.throws(()=>salaryFileExport([row({label:'  =QA'})]),/descripción/);});
test('template has only the documented fourteen definition fields and no invented example',()=>{const template=salaryFileExport();assert.ok(template.startsWith('\ufeff'));assert.equal(template.trim().split('\n').length,1);assert.equal(SALARY_FILE_HEADER.length,14);assert.ok(!/dni|nombre|legajo|uuid|empleado|formula|importe/i.test(template));assert.throws(()=>plan([],template),/no contiene definiciones/);});
test('identical revision reports no changes instead of inventing an error',()=>{const items=all(),result=plan(items,salaryFileExport(items));assert.equal(result.changes.length,0);assert.equal(result.unchangedCount,75);});
test('header-only, LF and CRLF, BOM and explicitly unmarked manual cells are supported',()=>{const original=salaryFileExport([row()]),plain=original.replace(/^\ufeff/,'').replaceAll('\r\n','\n').replaceAll('"\'','"');assert.deepEqual(plan([],plain).items,salaryItems([row()]));});
for(const [label,mutate]of [
 ['extra nominal header',s=>s.replace('"activo"','"activo";"dni"')],
 ['missing header',s=>s.replace('"descripcion";','')],
 ['reordered header',s=>s.replace('"tipo";"convenio"','"convenio";"tipo"')],
 ['extra nominal row cell',s=>s.trimEnd()+';"99000000"\n'],
 ['unclosed quote',s=>s.trimEnd()+'"'],
 ['after quote bytes',s=>s.replace('"\'concepto";','"\'concepto"oops;')],
 ['formula amount',s=>s.replace('"\'12.00"','"=12+0"')],
 ['comma amount',s=>s.replace('"\'12.00"','"12,00"')],
 ['exponent amount',s=>s.replace('"\'12.00"','"1.2e1"')],
 ['missing precision',s=>s.replace('"\'2";"\'12.00"','"";"\'12.00"')],
 ['inexact scale',s=>s.replace('"\'12.00"','"12.0"')],
 ['unknown unit',s=>s.replace('"\'unidades"','"dias"')],
 ['unknown nature',s=>s.replace('"\'remunerativo"','"sueldo"')],
 ['blank state',s=>s.replace('"\'si"','""')],
 ['blank line',s=>s+'\n'],
 ['control text',s=>s.replace('Concepto sintético sin regla municipal','QA\u0000privado')]
 ])test('rejects '+label+' without modifying the complete draft',()=>{const before=all(),snapshot=structuredClone(before);assert.throws(()=>plan(before,mutate(salaryFileExport([row({value:'12.00'})]))));assert.deepEqual(before,snapshot);});
test('unknown and ambiguous agreement/class cannot be inferred from code or file name',()=>{const text=salaryFileExport([row()]);for(const catalogue of [[],[...classification,classification[0]]])assert.throws(()=>salaryFilePlan([],text,catalogue),/convenio/);const scale=row({kind:'scale',categoryCode:'6',nature:null,unit:'money',value:'0.00'});assert.throws(()=>salaryFilePlan([],salaryFileExport([scale]),classification.filter(c=>c.kind!=='categories')),/clase/);});
test('complete history cannot be removed by a file containing only the searched row',()=>{const items=all();assert.throws(()=>plan(items,salaryFileExport([items[0]])),/antecedentes/);});
test('duplicate, overlap and dependency-cycle errors reject the whole file',()=>{const first=row(),second=row({code:'88'}),good=salaryFileExport([first,second]);const data=good.split('\r\n');assert.throws(()=>plan([],data.slice(0,2).concat(data[1],'').join('\r\n')),/repetida/);assert.throws(()=>plan([],good.replace('"\'88"','"\'95"')),/repetida/);first.dependencies=[salaryRowKey(second)];second.dependencies=[salaryRowKey(first)];const file=salaryFileExport([row(),row({code:'88'})]).replace('"";"\'si"','"\'concept:1::88:2026-10";"\'si"').replaceAll('"";"\'si"','"\'concept:1::95:2026-10";"\'si"');assert.throws(()=>plan([],file),/ciclo/);});
test('1,000 exact definitions pass; 1,001 rows and 2 MiB overflow are global failures',()=>{const items=salaryItems(Array.from({length:1000},(_,n)=>row({code:String(n+1)}))),text=salaryFileExport(items);assert.equal(plan([],text).total,1000);const data=text.split('\r\n');assert.throws(()=>plan([],data.slice(0,-1).concat(data[1],'').join('\r\n')),/1.000/);assert.throws(()=>plan([],text+'x'.repeat(SALARY_FILE_MAX_BYTES)),/2 MiB/);});
