import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { friendlySourceProfile, renderedNumberPattern } from '../scripts/lib/friendly-browser-source-profile.mjs';

for(const [name,path]of [['september-2026','../friendly-data.json'],['august-2026','./fixtures/friendly-data.august-approved.json']])test(`Friendly ${name}: independent approved profile matches aggregate`,()=>{
 const expected=friendlySourceProfile(name),aggregate=JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
 assert.equal(aggregate.source.sha256.toLowerCase(),expected.sha256);
 assert.equal(aggregate.source.snapshotAt.slice(0,10),expected.cutoff);
 assert.equal(aggregate.workforce.historicalRecords,expected.historicalRecords);
 assert.equal(aggregate.workforce.active,expected.activeProxy);
 assert.equal(aggregate.absence.totalEvents,expected.absenceEvents);
 assert.notEqual(expected.activeProxy,expected.payrollSnapshot);
 assert.equal((Date.parse(expected.previousComparableTo)-Date.parse('2019-12-10'))/86400000+1,expected.elapsedDays);
});

test('Friendly defaults to approved S11 and rejects unknown source profiles',()=>{
 assert.equal(friendlySourceProfile().cutoff,'2026-09-10');
 assert.equal(friendlySourceProfile().payrollSnapshot,847);
 assert.equal(friendlySourceProfile().lastClosedMonth,'2026-08-01');
 assert.equal(friendlySourceProfile().currentOpenMonth,'2026-09-01');
 assert.throws(()=>friendlySourceProfile('latest'),/Unknown/);
});

test('rendered number comparisons preserve quantities across grouping and decimal formats',()=>{
 const count=renderedNumberPattern(2452);
 for(const value of ['2.452','2 452','2452'])assert.match(value,count);
 for(const value of ['24520','12452','2.450'])assert.doesNotMatch(value,count);
 assert.match('3,47',renderedNumberPattern(3.47));
 assert.match('3.47',renderedNumberPattern(3.47));
 assert.throws(()=>renderedNumberPattern('not-number'),/finite/);
});
