import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {verifyWorkdayResponse,sameWorkdayCut} from '../assets/workday-panel-model.js';
import {workdayCsv,workdayXlsx} from '../assets/workday-export.js';
import {continuousWorkdayFixture,historicalWorkdayFixture,workdayQuery,WORKDAY_CUT} from './fixtures/continuous-workdays-synthetic.js';

test('UI accepts the actual v2 DTO with UUID revision and stable event references',async()=>{
 const q=workdayQuery(),d=await continuousWorkdayFixture(q);
 assert.equal(verifyWorkdayResponse(d,q),d);assert.equal(d.snapshotId,WORKDAY_CUT);
 const later=workdayQuery({page:'2',snapshot:d.snapshotId}),next=await continuousWorkdayFixture(later);
 assert.equal(verifyWorkdayResponse(next,later),next);assert.equal(sameWorkdayCut(d,next),true);
});
test('historical v1 retains its source ordinals and original CSV wording',()=>{
 const q=workdayQuery({resource:'clock-workdays'});q.delete('source');const d=historicalWorkdayFixture(q);
 assert.equal(verifyWorkdayResponse(d,q),d);assert.match(workdayCsv(d.rows,d),/No aprobado para liquidar/);
 assert.ok('startOrdinal' in d.rows[0].intervals[0]);
});
for(const [name,change] of [
 ['unknown event reference',d=>d.rows[0].intervals[0].endEventRef='f'.repeat(64)],
 ['missing source ordinal',d=>delete d.rows[0].events[0].source.ordinal],
 ['unapproved payable hours',d=>d.rows[0].payableSeconds=1],
 ['incomplete source',d=>d.collection.sourceComplete=false],
 ['false homologation',d=>d.homologationStatus='verified'],
 ['inflated ordinary time',d=>d.rows[0].ordinarySeconds++],
 ['false observation total',d=>d.observationSummary.unplaced++],
])test('UI rejects '+name,async()=>{const q=workdayQuery(),d=await continuousWorkdayFixture(q);change(d);assert.throws(()=>verifyWorkdayResponse(d,q))});
test('anonymous mode cannot receive nominal rows or a later permission increase',async()=>{
 const q=workdayQuery(),d=await continuousWorkdayFixture(q,{nominal:false});
 assert.equal(verifyWorkdayResponse(d,q,{nominalReadAllowed:false}),d);
 d.rows[0].personLabel='Unapproved name';assert.throws(()=>verifyWorkdayResponse(d,q,{nominalReadAllowed:false}));
 const named=await continuousWorkdayFixture(q);assert.throws(()=>verifyWorkdayResponse(named,q,{nominalReadAllowed:false}));
});
for(const [name,change] of [
 ['nominal permission changes',d=>d.nominalReadAllowed=false],
 ['context changes',d=>d.context.from='2026-09-08'],
 ['period summary changes',d=>d.periodSummary.days++],
 ['source changes',d=>d.sourceMode='historical'],
])test('export rejects '+name+' even if a broken server reuses its revision',async()=>{
 const first=await continuousWorkdayFixture(workdayQuery()),next=structuredClone(first);change(next);
 assert.equal(sameWorkdayCut(first,next),false);
});
test('v2 CSV contains complete metadata and stable event references without formula execution',async()=>{
 const q=workdayQuery({pageSize:'100'}),d=await continuousWorkdayFixture(q);d.rows[0].personLabel='=1+1';
 const csv=workdayCsv(d.rows,d);assert.match(csv,/"'=1\+1"/);assert.ok(csv.includes(d.snapshotId));
 assert.ok(csv.includes(d.rows[0].intervals[0].startEventRef));assert.match(csv,/Referencia no homologada/);
 assert.match(csv,/sin aprobación salarial/);assert.match(csv,/Histórico y recepciones completas/);assert.doesNotMatch(csv,/undefined/);
});
test('v2 XLSX traces pauses, extra, original source and unplaceable observations in five sheets',async()=>{
 const q=workdayQuery({pageSize:'100'}),d=await continuousWorkdayFixture(q,{unplaced:true});
 const zipped=unzipSync(workdayXlsx(d,d.rows)),text=Object.values(zipped).map(value=>strFromU8(value)).join('\n');
 for(const name of ['Jornadas','Tramos','Control','Eventos','Observaciones'])assert.ok(text.includes('name="'+name+'"'));
 assert.ok(text.includes(d.snapshotId));assert.ok(text.includes(d.rows[0].intervals[0].pauseEventRefs[0]));
 assert.ok(text.includes(d.observations[0].eventRef));assert.match(text,/no es una captura histórica congelada/);
 assert.match(text,/No calculadas: requiere turno y aprobación/);assert.doesNotMatch(text,/<f>/);assert.doesNotMatch(text,/undefined/);
});
