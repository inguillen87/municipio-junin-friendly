// Filesystem contracts only: no QA/SQL constructor, parser or installer imports.
// PostgreSQL proves the projected hashes separately in the native workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');

function assertBothEpochs(source){
 for(const token of [
  'ownNoveltySuccessionQaProjection({schema,baseNormalize,definitions,predecessorDefinitions})',
  'predecessorDefinitions:[...batch.originals,batch.oldReady]',
  'definitions:[...batch.adapted,batch.ready,...batch.newDefinitions]',
  'const projectionDefinitions=[...predecessorDefinitions,...definitions]',
  'for(const d of projectionDefinitions)',
  'expectedQaBeforePins=projectPins([...batch.originals,batch.oldReady],batch.beforePins)',
  'const ledger=definitions.map(',
  "predecessorDefinitions.length===7,'NOVELTY197_QA_SEVEN_PREDECESSORS_REQUIRED'",
  'sourcePins.slice(0,7).map(p=>p.signature)',
  "assert.ok(stable,'NOVELTY197_QA_HASH_GRAPH_CYCLE')"
 ])assert.ok(source.includes(token),token);
}

test('197 hash graph includes both source epochs while retaining the posterior ledger',()=>{
 const source=read('scripts/lib/own-novelty-succession-qa.mjs');assertBothEpochs(source);
 for(const[after,before]of [
  ['for(const d of projectionDefinitions)','for(const d of definitions)'],
  ['predecessorDefinitions:[...batch.originals,batch.oldReady]','predecessorDefinitions:[]']
 ]){
  assert.equal(source.split(after).length,2,'one causal source connection');
  assert.throws(()=>assertBothEpochs(source.replace(after,before)),assert.AssertionError);
 }
});

test('native regression checks each predecessor against the actual projected installation mode',()=>{
 const source=read('tests/own-novelty-succession-installation.test.js');
 for(const token of [
  'mode=projected.normalized(batch.mode)',
  'projected.novelty197Hashes[batch.beforePins[n].sha256],before.sha256',
  'mode.includes(before.sha256)',
  'mode.includes(after.sha256)',
  'projected.novelty197ProjectionLedger.length,15'
 ])assert.ok(source.includes(token),token);
});

test('nested190 custody recovers the complete prior fixture through only five reviewed source pins',()=>{
 const file='tests/fixtures/own-payroll-full-capacity-190-source-projection.js';
 let source=read(file);
 const accounting=read('tests/fixtures/own-accounting-imputation-190-source-projection.js');
 const projection=JSON.parse(accounting.slice(accounting.indexOf('=')+1).trim().replace(/;$/,''));
 const target=projection.targets.find(value=>value.path===file);
 assert.equal(hash(source),target.afterSha256);
 assert.equal(target.beforeSha256,'dd370b3c4a0e0e33a2c537d643d3e121f1805e7e1843958e59f7356202ebc95c');
 const changes=[
  ['69a7886465933af91cf3d4b91e5534945cebe376da4092b548f89ef2ded4e72e','0147441a25ef432e31ff376edde154fbd30a63c28de6f0a6fc1170c26c286b67'],
  ['fdd49abc260b5ca278958771611f9e84fa089631644cad9069d107d1cce26e3f','5705172114c625dd2ad657ed3ba32c714e869866e230c83389910378a7d358ed'],
  ['e5673a20f7547cc7bb6060715920b4dccfc1713f3ef9f6844f1a86840f921fd8','d3e1ebbf9cc587a2611f59706df8b2e6a8259438976e11053070420ec2fe69a4'],
  ['a81fd29b59897191fca9c5dd4f7c2a9b0cd3ca02c5315ba6ec07d0a5fc5997b8','3550621b23b5c524e386b5c3099903a6204fd6b0aa80424672e26bddfcbdb612'],
  ['3301a251da59ed655f4d2e8c61df0868070568418cba3282cd64e61d5821f36e','ef7e4e54311f0d5df80f0a93f769834fc46a1c85da01071c01462428ce18ca43']
 ];
 assert.equal(target.inverse.length,68+changes.length);
 assert.deepEqual(target.inverse.slice(68).map(op=>[
  Buffer.from(op.afterBase64,'base64').toString(),Buffer.from(op.beforeBase64,'base64').toString()
 ]),changes);
 for(const[current,previous]of changes){
  assert.equal(source.split(current).length,2,'one reviewed pin '+current);
  source=source.replace(current,previous);
 }
 assert.equal(hash(source),'b4d90a930518e029678511774bfafb85ed65d98cbcfa83f835174f21ccef60e7','all other fixture bytes remain unchanged');
});
