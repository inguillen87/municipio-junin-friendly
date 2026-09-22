import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {buildFriendlySourceAggregate,generateFriendlySourceAggregate,parseFriendlyAggregateArgs} from '../scripts/generate-friendly-source-aggregate.mjs';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {createRrhhReportSnapshot,createRrhhReportPack} from '../assets/rrhh-report-pack.js';
import {analysisModel,analysisDocument} from '../assets/report-analysis.js';

const profile=getGrhSourceProfile('grh-junin-2026-09-10');
function fixture(){
 const d=Object.fromEntries(Object.entries(profile.curated.expectedOutputCounts).map(([key,count])=>[key,Array.from({length:count},()=>({}))]));
 d.employees=d.employees.map((_,i)=>({sourceKey:{companyCode:'1',employeeNumber:String(i)},identity:{sexCode:i%2?'F':'M',fullName:'PRIVATE NAME',email:'private@example.invalid'},employment:{hireDate:'2020-01-01',exitDate:i<100?null:'2024-01-01',activeProxy:i<100,sectorName:i<50?'OBRERO':i<80?'ADMINISTRATIVO':'Private small-sector label'},personId:String(i)}));
 d.absences=d.absences.map((_,i)=>({sourceKey:{companyCode:'1',employeeNumber:String(i%100),absenceDate:'2026-09-10'},absenceDate:'2026-09-10',sourceFields:{comment:'PRIVATE DIAGNOSIS'}}));
 d.leaves=d.leaves.map(()=>({startDate:'2009-01-01',endDate:'2009-05-15'}));
 return {profileId:profile.id,manifest:{profile:profile.curated.profileId,source:{sha256:profile.source.sha256,dumpCompletedAt:profile.source.cutoff,database:profile.source.database},validation:{strictSnapshot:true,sourceCounts:{persona:{actual:2351,expected:2351,distinctPrimaryKeys:2351,duplicatePrimaryKeyRows:0}},joins:{absenceEmployee:{orphanRows:0}}}},datasets:d};
}

test('aggregate is deterministic, explicitly proxy, and never copies nominal rows or free-form labels',()=>{
 const source=fixture(),before=JSON.stringify(source),aggregate=buildFriendlySourceAggregate(source);
 assert.equal(JSON.stringify(source),before);assert.deepEqual(buildFriendlySourceAggregate(source),aggregate);
 const text=JSON.stringify(aggregate);assert.doesNotMatch(text,/PRIVATE|private@example|Private small-sector|personId|sourceKey|sourceFields|employeeNumber/);
 assert.match(aggregate.source.limitations.join(' '),/proxy/);assert.match(aggregate.source.limitations.join(' '),/no personas únicas/);
 assert.equal(aggregate.workforce.active,100);assert.equal(aggregate.workforce.inactive,2352);assert.equal(aggregate.workforce.historicalRecords,2452);
 assert.equal(aggregate.workforce.activeSectors.find(r=>r.label==='Otros sectores').value,20);
 assert.equal(aggregate.management.previous.from,'2019-12-10');assert.equal(aggregate.management.yearly[0].year,2019);assert.equal(aggregate.management.yearly[0].partial,true);
 const snapshot=createRrhhReportSnapshot(aggregate,{generatedAt:'2026-09-22T00:00:00.000Z'});
 const pack=createRrhhReportPack(aggregate,{generatedAt:snapshot.generatedAt});assert.ok(pack.pdf.bytes.length>1000);assert.ok(pack.xlsx.bytes.length>1000);
 for(const kind of ['sectores','movimientos','ausencias']){const model=analysisModel(aggregate,{kind});assert.ok(model.rows.length);assert.equal(analysisDocument(model).rows.length,model.rows.length);}
});

test('affected count deduplicates by company and employee number, never by absence date or personal identity',()=>{
 const source=fixture();source.datasets.employees[99].sourceKey={companyCode:'2',employeeNumber:'0'};
 for(let i=0;i<source.datasets.absences.length;i++){const a=source.datasets.absences[i];if(i%100===99){a.sourceKey.companyCode='2';a.sourceKey.employeeNumber='0';}a.absenceDate=i%2?'2026-09-09':'2026-09-10';}
 const a=buildFriendlySourceAggregate(source);assert.equal(a.absence.yearly.at(-1).employeesAffected,100);assert.equal(a.absence.yearly.at(-1).events,31702);
});

test('small named sectors are pooled without leaking their count, while pooled and unknown groups must pass threshold',()=>{
 const source=fixture();source.datasets.employees.slice(0,45).forEach(e=>{e.employment.sectorName='PRIVATE SECTOR';});
 const a=buildFriendlySourceAggregate(source);assert.equal(a.workforce.activeSectors.some(r=>r.label==='Obrero'),false);assert.equal(a.workforce.activeSectors.find(r=>r.label==='Otros sectores').value,70);
 assert.ok(a.workforce.activeSectors.every(r=>r.value===0||r.value>=10));
 source.datasets.employees[0].employment.sectorName=null;assert.throws(()=>buildFriendlySourceAggregate(source),{code:'FRIENDLY_AGGREGATE_SMALL_GROUP'});
});

test('temporal aggregate preserves historical small totals without adding a nominal breakdown',()=>{
 const source=fixture();source.datasets.employees.slice(0,4).forEach(e=>{e.employment.hireDate='2019-12-11';});
 const a=buildFriendlySourceAggregate(source);assert.equal(a.management.yearly[0].hires,4);assert.equal(a.management.previous.hires,2452);
 assert.match(a.source.limitations.join(' '),/mínimo de 10 se aplica a género, sectores y legajos afectados/);
});
for(const [name,mutate,code]of[
 ['source fingerprint',s=>s.manifest.source.sha256='0'.repeat(64),'FRIENDLY_SOURCE_PROFILE_MISMATCH'],
 ['source count',s=>s.datasets.employees.pop(),'FRIENDLY_SOURCE_COUNT_MISMATCH'],
 ['duplicate employee key',s=>s.datasets.employees[1].sourceKey=s.datasets.employees[0].sourceKey,'FRIENDLY_SOURCE_DUPLICATE_EMPLOYEE'],
 ['proxy mismatch',s=>s.datasets.employees[0].employment.activeProxy=false,'FRIENDLY_SOURCE_ACTIVE_PROXY_MISMATCH'],
 ['unknown sex',s=>s.datasets.employees[0].identity.sexCode='X','FRIENDLY_SOURCE_GENDER_UNCLASSIFIED'],
 ['small gender',s=>s.datasets.employees.slice(0,100).forEach((e,i)=>e.identity.sexCode=i<9?'F':'M'),'FRIENDLY_AGGREGATE_SMALL_GROUP'],
 ['impossible date',s=>s.datasets.employees[0].employment.hireDate='2026-02-30','FRIENDLY_SOURCE_DATE_INVALID'],
 ['orphan mismatch',s=>s.datasets.absences[0].sourceKey.employeeNumber='missing','FRIENDLY_SOURCE_QUALITY_MISMATCH'],
 ['unknown latest event',s=>s.datasets.absences.forEach(a=>a.absenceDate='2026-09-09'),'FRIENDLY_SOURCE_ABSENCE_COVERAGE_MISMATCH'],
 ['small affected cohort',s=>s.datasets.absences.forEach(a=>a.sourceKey.employeeNumber='0'),'FRIENDLY_AGGREGATE_SMALL_GROUP'],
 ['license freshness drift',s=>s.datasets.leaves[0].endDate='2026-09-01','FRIENDLY_SOURCE_LEAVE_COVERAGE_CHANGED'],
])test('fail closed on '+name,()=>{const source=fixture();mutate(source);assert.throws(()=>buildFriendlySourceAggregate(source),{code});});

test('invalid dates are excluded from visible event window but retained in source and quality totals',()=>{
 const s=fixture();s.datasets.absences[0].absenceDate='1899-01-01';s.datasets.absences[1].absenceDate='2026-09-11';
 const a=buildFriendlySourceAggregate(s);assert.equal(a.absence.totalEvents,31702);assert.equal(a.absence.yearly.at(-1).events,31700);assert.equal(a.quality.absenceDatesBefore1900,1);assert.equal(a.quality.absenceDatesAfterSnapshot,1);
});

test('CLI never writes published artifact and rejects unknown profiles before file reads',async()=>{
 const dir=path.resolve('verification/synthetic-source');
 const parsed=parseFriendlyAggregateArgs(['--data-dir='+dir,'--output=verification/candidate.json']);assert.equal(parsed.profileId,'grh-junin-2026-08-06');
 for(const output of ['friendly-data.json','public/friendly-data.json','verification/../friendly-data.json'])assert.throws(()=>parseFriendlyAggregateArgs(['--data-dir='+dir,'--output='+output]),{code:'FRIENDLY_AGGREGATE_CANDIDATE_ONLY'});
 assert.throws(()=>parseFriendlyAggregateArgs(['--data-dir='+dir,'--output=verification/a.json','--output=verification/b.json']));
 await assert.rejects(generateFriendlySourceAggregate({dataDir:pathToFileURL(dir+'/'),profileId:'unknown-profile'}));
 await assert.rejects(generateFriendlySourceAggregate({dataDir:new URL('https://example.invalid/'),profileId:profile.id}),{code:'FRIENDLY_SOURCE_DIRECTORY_INVALID'});
});

const augustDir=process.env.FRIENDLY_AGGREGATE_AUGUST_DIR,s11Dir=process.env.FRIENDLY_AGGREGATE_S11_DIR;
test('verified August artifacts reproduce every published number, label and historical window',{skip:!augustDir},async()=>{
 const generated=await generateFriendlySourceAggregate({dataDir:pathToFileURL(path.resolve(augustDir)+path.sep)}),published=JSON.parse(await readFile(new URL('./fixtures/friendly-data.august-approved.json',import.meta.url),'utf8'));
 for(const field of ['jurisdiction','privacy','workforce','management','absence','quality','availability'])assert.deepEqual(generated.aggregate[field],published[field],field);
 assert.equal(generated.aggregate.source.sha256,published.source.sha256);assert.equal(generated.aggregate.source.snapshotAt,published.source.snapshotAt);assert.equal(generated.report.conventions.annualWindowChange,false);
});
test('verified S11 produces identical candidate twice and real updated totals with preserved past series',{skip:!s11Dir||!augustDir},async()=>{
 const args={dataDir:pathToFileURL(path.resolve(s11Dir)+path.sep),profileId:profile.id},a=await generateFriendlySourceAggregate(args),b=await generateFriendlySourceAggregate(args);
 assert.equal(a.text,b.text);assert.deepEqual(a.report,b.report);assert.equal(a.report.published,false);
 assert.equal(await readFile(new URL('../friendly-data.json',import.meta.url),'utf8'),a.text);
 assert.deepEqual(a.report.totals,{historical:2452,activeProxy:875,inactive:1577,absenceEvents:31702});
 assert.deepEqual(a.aggregate.absence.yearly.at(-1),{year:2026,events:1688,employeesAffected:596,partial:true});
 const previous=await generateFriendlySourceAggregate({dataDir:pathToFileURL(path.resolve(augustDir)+path.sep)});
 assert.deepEqual(a.aggregate.management.yearly.slice(0,-1),previous.aggregate.management.yearly.slice(0,-1));assert.deepEqual(a.aggregate.absence.yearly.slice(0,-1),previous.aggregate.absence.yearly.slice(0,-1));
});
