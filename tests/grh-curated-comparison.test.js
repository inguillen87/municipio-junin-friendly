import test from 'node:test';import assert from 'node:assert/strict';
import {compareCuratedArtifact,stableCuratedValue} from '../scripts/lib/grh-curated-comparison.mjs';
import {canonicalCuratedNumber,reviveCuratedNumber} from '../scripts/lib/grh-curated-numbers.mjs';
import {parseCuratedJson} from '../scripts/lib/grh-curated-source-reader.mjs';
const record=(id,name='Synthetic')=>({sourceKey:{companyCode:'101',id},name});
const parse=text=>JSON.parse(text,reviveCuratedNumber);
test('complete source-key comparison separates added, removed and changed rows',()=>{
 const r=compareCuratedArtifact('sectors',[record('1'),record('2'),record('3')],[record('1'),record('3','Updated'),record('4')]);
 assert.deepEqual([r.before,r.after,r.added,r.removed,r.changed,r.unchanged],[3,3,1,1,1,1]);assert.deepEqual(r.changedFields,{name:1});
});
test('fingerprints are independent of record and property ordering',()=>{
 const a=record('1'),b=record('2');const reversed={name:a.name,sourceKey:{id:'1',companyCode:'101'}};
 assert.equal(compareCuratedArtifact('sectors',[a,b],[b,reversed]).baselineProjectionSha256,compareCuratedArtifact('sectors',[b,a],[reversed,b]).candidateProjectionSha256);
});
test('source companies and literal string keys never merge',()=>{
 const a=record('01'),b=record('1'),c=structuredClone(a);c.sourceKey.companyCode='102';
 const r=compareCuratedArtifact('sectors',[a],[b,c]);assert.equal(r.added,2);assert.equal(r.removed,1);
});
test('one employee with related changes is not counted as multiple employees',()=>{
 const before={sourceKey:{companyCode:'101',employeeNumber:'1'},identity:{name:'PRIVATE_PERSON'},employment:{active:true},relatedRecordCounts:{absences:1},unionMemberships:[]};
 const after=structuredClone(before);after.relatedRecordCounts.absences=2;after.unionMemberships.push({id:'new'});
 const r=compareCuratedArtifact('employees',[before],[after]);assert.equal(r.changed,1);assert.deepEqual(r.changedFields,{relatedRecordCounts:1,unionMemberships:1});assert.doesNotMatch(JSON.stringify(r),/PRIVATE_PERSON|active|new/);
});
test('missing fields, null, zero and strings are distinct',()=>{
 const a={sourceKey:{id:'1'}},b={...a,baseSalary:null},c={...a,baseSalary:0},d={...a,baseSalary:'0'};
 for(const [before,after]of [[a,b],[b,c],[c,d]])assert.equal(compareCuratedArtifact('categories',[before],[after]).changed,1);
});
test('decimal lexemes retain differences beyond IEEE-754 precision',()=>{
 const a=parse('{"sourceKey":{"id":"1"},"baseSalary":9007199254740994.3400}');
 const b=parse('{"sourceKey":{"id":"1"},"baseSalary":9007199254740994.35}');
 const same=parse('{"sourceKey":{"id":"1"},"baseSalary":900719925474099434e-2}');
 assert.equal(compareCuratedArtifact('categories',[a],[b]).changed,1);assert.equal(compareCuratedArtifact('categories',[a],[same]).changed,0);
 assert.doesNotMatch(JSON.stringify(compareCuratedArtifact('categories',[a],[b])),/900719925/);
});
for(const [a,b]of [['0','-0.000'],['12.500','1.25e1'],['1000','1e3'],['0.00001','1e-5'],['-120.000','-12e1']])test('normalizes exact decimal representations '+a,()=>assert.equal(canonicalCuratedNumber(a),canonicalCuratedNumber(b)));
test('decimal token cannot be impersonated by a JSON object or rounded before comparison',()=>{
 assert.notEqual(stableCuratedValue(parse('1.25')),stableCuratedValue({canonical:'125e-2'}));
 assert.throws(()=>stableCuratedValue(1.25),{code:'GRH_CURATED_REVIEW_UNSAFE_NUMBER'});
 assert.notEqual(stableCuratedValue(parse('9007199254740991.0001')),stableCuratedValue(9007199254740991));
});
for(const token of ['NaN','Infinity','01','1.','1e999999','x'.repeat(4097)])test('rejects malformed/unbounded numeric lexeme',()=>assert.throws(()=>canonicalCuratedNumber(token),{code:'GRH_CURATED_REVIEW_NUMBER_INVALID'}));
test('parser refuses malformed UTF8 without reflecting source text',()=>{
 for(const b of [Buffer.from([255]),Buffer.from('{PRIVATE_VALUE')])assert.throws(()=>parseCuratedJson(b,{losslessNumbers:true}),{code:'GRH_CURATED_REVIEW_JSON_INVALID'});
});
test('rejects duplicate source keys on either side even with changed field content',()=>{
 for(const [a,b]of [[[record('1'),record('1','different')],[]],[[],[record('1'),record('1')]]])assert.throws(()=>compareCuratedArtifact('sectors',a,b),{code:'GRH_CURATED_REVIEW_DUPLICATE_KEY'});
});
test('unknown entity and fields, unsafe IDs and nested structures fail closed',()=>{
 assert.throws(()=>compareCuratedArtifact('__proto__',[],[]),{code:'GRH_CURATED_REVIEW_ENTITY_INVALID'});
 for(const row of [{sourceKey:{id:'1'},unknown:'PRIVATE'},record(null),{sourceKey:{id:1.5}}, {sourceKey:[]},{sourceKey:{}}])assert.throws(()=>compareCuratedArtifact('sectors',[],[row]),e=>e.code.startsWith('GRH_CURATED_REVIEW_'));
 let v={};for(let i=0;i<42;i++)v={next:v};assert.throws(()=>stableCuratedValue(v),{code:'GRH_CURATED_REVIEW_DEPTH_LIMIT'});
});
