import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { continuousWorkdayFixture, workdayQuery } from './fixtures/continuous-workdays-synthetic.js';
import { preparteMonth, summarizePreparte } from '../lib/attendance-preparte.js';
import { getAttendancePreparte } from '../lib/internal-attendance-workdays.js';
import { verifyPreparte, preparteNoveltyRows, referencePercentage, reviewedSeconds, MONTHLY_DEDICATION_REFERENCE } from '../assets/attendance-preparte-model.js';
import { appendPreparteRows, emptySheetRow } from '../assets/payroll-novelty-sheet-model.js';
import { preparteXlsx } from '../assets/attendance-preparte-export.js';
const principal={user:{email:'qa@example.test'},tenant:{source:'membership',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membershipId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',certifiedReleaseSha:'a'.repeat(40)}};
const session={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',email:'qa@example.test',version:1,releaseSha:'a'.repeat(40)};
const options={period:'2026-09',site:'pm-10'};
async function rawFixture(settings={}){return continuousWorkdayFixture(workdayQuery({from:'2026-09-01',to:'2026-09-30'}),{...settings,rawOnly:true});}
async function dataFixture(settings={}){const raw=await rawFixture(settings);let calls=0;const sql={query:async()=>{calls++;return[{result:raw}];}};
 const data=await getAttendancePreparte(sql,principal,options,session);return{raw,data:{ok:true,...data},calls};}
const reviewed={documentReference:'Listado QA de Personal versión 1',confirmed:true};
function decisionFor(data,patch={}){const row=data.rows.find(row=>row.legajo==='9001');return new Map([[row.key,{selected:true,hours:'02:00',cap:'5',percent:'3',...patch}]]);}
test('month bounds validate leap years and never convert minutes or blank values into a date',()=>{
 assert.deepEqual(preparteMonth('2024-02'),{from:'2024-02-01',to:'2024-02-29'});
 for(const value of ['','2026-13','2026-9','1900-01',null])assert.throws(()=>preparteMonth(value));
});
test('one SQL snapshot covers all 107 people, not only the 25 visible workdays',async()=>{
 const {data,calls}=await dataFixture();assert.equal(calls,1);assert.equal(data.rows.length,107);verifyPreparte(data,'2026-09','pm-10');
 const row=data.rows.find(r=>r.legajo==='9001');assert.equal(row.extraSeconds,7200);assert.equal(row.canPropose,true);assert.equal(row.ordinarySeconds,20700);
 assert.equal(data.rows.find(r=>r.legajo==='9107').canPropose,false);assert.equal(data.coverageCertified,false);assert.equal(data.payrollCalculated,false);
 assert.ok(data.rows.every(row=>!('events' in row)&&!('personKey' in row)));
});
test('new receipt metadata without changed marks does not destroy an administrative review',async()=>{
 const {raw,data}=await dataFixture();raw.revision='dddddddd-dddd-5ddd-8ddd-ddddddddddde';raw.generatedAt='2026-09-16T10:00:00Z';
 const next=await getAttendancePreparte({query:async()=>[{result:raw}]},principal,{...options,evidence:data.evidenceHash},session);
 assert.equal(next.evidenceHash,data.evidenceHash);assert.notEqual(next.snapshotId,data.snapshotId);assert.deepEqual(next.rows,data.rows);
});
test('changed marks with unchanged elapsed totals still invalidate the evidence',async()=>{
 const {raw,data}=await dataFixture();for(const e of raw.events.filter(e=>[4,5].includes(e.code))){e.localTimestamp=e.localTimestamp.replace('15:','16:').replace('17:','18:');e.occurredAt=e.occurredAt.replace('15:','16:').replace('17:','18:');}
 await assert.rejects(getAttendancePreparte({query:async()=>[{result:raw}]},principal,{...options,evidence:data.evidenceHash},session),{code:'ATTENDANCE_PREPARTE_CHANGED'});
});
test('read-only source requires nominal permission and reuses live session verification',async()=>{
 const raw=await rawFixture({nominal:false});await assert.rejects(getAttendancePreparte({query:async()=>[{result:raw}]},principal,options,session),{status:403});
 let called=false;await assert.rejects(getAttendancePreparte({query:async()=>{called=true;}},principal,options,{...session,email:'other@example.test'}),{status:401});assert.equal(called,false);
});
test('unknown timestamp observations cannot silently turn into payable time',async()=>{
 const {data}=await dataFixture({unplaced:true});assert.equal(data.observations,1);assert.equal(data.rows.filter(r=>r.canPropose).length,0);
});
test('no paired overtime means unknown, not an approved zero',async()=>{
 const {data}=await dataFixture();const row=data.rows.find(r=>r.legajo==='9002');assert.equal(row.extraSeconds,null);assert.equal(row.canPropose,false);
});
for(const [hours,percent]of MONTHLY_DEDICATION_REFERENCE)test('exact monthly reference '+hours+'h => '+percent+'%',()=>assert.equal(referencePercentage(hours*3600),percent));
test('no interpolation, weekly conversion, decimal comma or fractional-second loss',()=>{
 assert.equal(reviewedSeconds('13:30'),48600);assert.equal(referencePercentage(48600),null);assert.equal(referencePercentage(4*3600+1),null);
 for(const value of ['13,3','13.30','13:60','-1:00','1e2','1:2','00:00:10'])assert.throws(()=>reviewedSeconds(value));
});
test('review creates percentage units, distinct concept and no manual salary amount',async()=>{
 const {data}=await dataFixture();const rows=preparteNoveltyRows(data,decisionFor(data),reviewed);
 assert.equal(rows[0][1],'44');assert.equal(rows[0][4],'3');assert.equal(rows[0][5],'');assert.equal(rows[0][9],'NO');
 assert.match(rows[0][8],new RegExp(data.rows.find(row=>row.legajo==='9001').evidenceHash));assert.ok(rows[0][8].length<=500);
});
for(const patch of [{cap:'2'},{cap:''},{percent:'97'},{percent:'101'},{hours:'02:01'},{hours:'00:00'},{hours:'2,00'}])test('reject invalid or excessive reviewed decision '+JSON.stringify(patch),async()=>{
 const {data}=await dataFixture();assert.throws(()=>preparteNoveltyRows(data,decisionFor(data,patch),reviewed));
});
test('acknowledgment and a source document are mandatory; blocked rows cannot be selected',async()=>{
 const {data}=await dataFixture();assert.throws(()=>preparteNoveltyRows(data,decisionFor(data),{...reviewed,confirmed:false}));
 assert.throws(()=>preparteNoveltyRows(data,decisionFor(data),{...reviewed,documentReference:''}));
 const blocked=data.rows.find(row=>!row.canPropose);assert.throws(()=>preparteNoveltyRows(data,new Map([[blocked.key,{selected:true,hours:'01:00',cap:'3',percent:'3'}]]),reviewed));
});
test('Full Time and mayor dedicacion remain distinct; individual ceiling is never exceeded',async()=>{
 const {data}=await dataFixture();const source=data.rows.find(r=>r.legajo==='9001');source.extraSeconds=120*3600;
 assert.equal(preparteNoveltyRows(data,decisionFor(data,{hours:'120:00',cap:'100',percent:'100'}),reviewed)[0][1],'95');
 assert.throws(()=>preparteNoveltyRows(data,decisionFor(data,{hours:'120:00',cap:'95',percent:'100'}),reviewed));
 assert.equal(preparteNoveltyRows(data,decisionFor(data,{hours:'120:00',cap:'95',percent:'95'}),reviewed)[0][1],'44');
 source.extraSeconds=4*3600;assert.throws(()=>preparteNoveltyRows(data,decisionFor(data,{hours:'04:00',cap:'100',percent:'5'}),reviewed));
});
test('append is atomic, preserves earlier work and disallows simultaneous 44/95 for the same legajo',async()=>{
 const {data}=await dataFixture(),incoming=preparteNoveltyRows(data,decisionFor(data),reviewed),existing=[emptySheetRow('999','1','30')],before=JSON.stringify(existing);
 const combined=appendPreparteRows(existing,incoming);assert.equal(combined.length,2);assert.equal(JSON.stringify(existing),before);
 assert.throws(()=>appendPreparteRows([emptySheetRow('9001','95','100')],incoming));assert.throws(()=>appendPreparteRows(existing,[...incoming,...incoming]));assert.throws(()=>appendPreparteRows(existing,incoming,1));
 incoming[0][5]='999';assert.throws(()=>appendPreparteRows(existing,incoming));
});
test('Excel contains the complete source, three sheets, cached time formulas and no injected formulas',async()=>{
 const {data}=await dataFixture();data.rows[0].name='=HYPERLINK("https://example.invalid")';
 const archive=unzipSync(preparteXlsx(data,decisionFor(data),reviewed.documentReference)),sheet=strFromU8(archive['xl/worksheets/sheet1.xml']),book=strFromU8(archive['xl/workbook.xml']);
 assert.match(book,/name="Preparte"/);assert.match(book,/name="Control"/);assert.match(book,/name="Referencia"/);
 assert.match(sheet,/t="inlineStr"[^>]*><is><t[^>]*>=HYPERLINK/);assert.ok((sheet.match(/<row r=/g)||[]).length===data.rows.length+1);
 assert.ok([...sheet.matchAll(/<f>(.*?)<\/f>/g)].every(m=>/^D\d+\/86400$/.test(m[1])));assert.match(sheet,/state="frozen"/);
 assert.match(strFromU8(archive['xl/worksheets/sheet2.xml']),/no se guardan automáticamente/);
});

for(const field of ['people','readyForReview','withIncidents'])test('preparte rejects inconsistent metric '+field,async()=>{
 const {data}=await dataFixture();data.summary[field]++;assert.throws(()=>verifyPreparte(data,options.period,options.site));
});
test('preparte rejects malformed source metadata before export or transfer',async()=>{
 const {data}=await dataFixture();
 for(const value of [{generatedAt:'not-a-date'},{site:{...data.site,label:{secret:true}}},{lastReceiptAt:'invalid'},{rulesVersion:null}]){
  assert.throws(()=>verifyPreparte({...data,...value},options.period,options.site));
 }
});
test('refresh counts only deliberate review decisions, not rows displayed with defaults',()=>{
 const source=readFileSync(new URL('../assets/attendance-preparte-panel.js',import.meta.url),'utf8');
 assert.match(source,/prior\.edited\|\|prior\.selected/);
 assert.match(source,/value\[key\]=input\.value;value\.edited=true/);
});

test('Full Time cannot bypass the monthly reference through a non-table duration',async()=>{
  const {data}=await dataFixture();
  const row=data.rows.find(r=>r.legajo==='9001'); row.extraSeconds=121*3600;
  for(const hours of ['01:00','02:00','119:59','120:01','121:00']) {
    assert.throws(()=>preparteNoveltyRows(data,decisionFor(data,{hours,cap:'100',percent:'100'}),reviewed),/120 horas/);
  }
  const result=preparteNoveltyRows(data,decisionFor(data,{hours:'120:00',cap:'100',percent:'100'}),reviewed);
  assert.equal(result[0][1],'95');assert.equal(result[0][4],'100');
  assert.equal(result[0][5],'');assert.equal(result[0][9],'NO');
});
test('existing leading-zero aliases cannot duplicate the same dedication assignment',async()=>{
  const {data}=await dataFixture(),incoming=preparteNoveltyRows(data,decisionFor(data),reviewed);
  for(const concept of ['044','0095',' 44 ']){
    const rows=[emptySheetRow(' 0009001 ',concept,'3')],before=JSON.stringify(rows);
    assert.throws(()=>appendPreparteRows(rows,incoming),/ya tiene mayor dedicación/);
    assert.equal(JSON.stringify(rows),before);
  }
});
