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

test('nested190 custody recovers the exact b41 fixture before its complete prior source pins',()=>{
 const file='tests/fixtures/own-payroll-full-capacity-190-source-projection.js';
 let source=read(file);
 const accounting=read('tests/fixtures/own-accounting-imputation-190-source-projection.js');
 const projection=JSON.parse(accounting.slice(accounting.indexOf('=')+1).trim().replace(/;$/,''));
 const target=projection.targets.find(value=>value.path===file);
 assert.equal(hash(source),target.afterSha256);
 assert.equal(target.beforeSha256,'dd370b3c4a0e0e33a2c537d643d3e121f1805e7e1843958e59f7356202ebc95c');
 const changes=[
  ['e1529caa5e7e91e3524ec9c7c991855c57fbfda6416acb4ccd66e47bd183f932','0147441a25ef432e31ff376edde154fbd30a63c28de6f0a6fc1170c26c286b67'],
  ['fdd49abc260b5ca278958771611f9e84fa089631644cad9069d107d1cce26e3f','5705172114c625dd2ad657ed3ba32c714e869866e230c83389910378a7d358ed'],
  ['e5673a20f7547cc7bb6060715920b4dccfc1713f3ef9f6844f1a86840f921fd8','d3e1ebbf9cc587a2611f59706df8b2e6a8259438976e11053070420ec2fe69a4'],
  ['a81fd29b59897191fca9c5dd4f7c2a9b0cd3ca02c5315ba6ec07d0a5fc5997b8','3550621b23b5c524e386b5c3099903a6204fd6b0aa80424672e26bddfcbdb612'],
  ['3301a251da59ed655f4d2e8c61df0868070568418cba3282cd64e61d5821f36e','ef7e4e54311f0d5df80f0a93f769834fc46a1c85da01071c01462428ce18ca43'],
  ['39ec1b309ab17d174030f42370a0b5cfc2274724fd01ec391176f2be227eff94','02d0239ba2f0bb101985257021710c7f1bd31a26181ca87caca4635eb5364726'],
  ['3294c34a39816b9868e2052179ecddfaf9f146cf8411313ac4e2ddc6896368be','e1529caa5e7e91e3524ec9c7c991855c57fbfda6416acb4ccd66e47bd183f932'],
  ['a00d19a57d3774767bbc62de0d148a7adc705d0bb27b01c2f524a05f7bc440f4','fdd49abc260b5ca278958771611f9e84fa089631644cad9069d107d1cce26e3f'],
  ['627f1dd8b4628d4b1f992561d4a8c8f3a97739841d5e9ea252e3da2e0048fec8','4a58f3bc5e49d18644ae6575bbbd3b7f40747bb9543b0e664256a1480e675cb0'],
  ['feb82ec69cf2f1c1bc16b6999a6c5621d42caa376bfe99661115ff10fb1687e5','cadab6e28e5a664f119d3d590efb1cbeff33686a103982d7b9bb9d830d410c99'],
  ['0deb7c1a52c65b437e982bb7daa3b79c58c53962e05e23a16ead4484bde7ce1d','fae1416085d1b49bda6fca2039962a9f4e8f05dd0ec575eb50260454c51d912d'],
  ['3d3a6469ba39ad4fa8c9b23f4e9544cb846b538d4d30eca5997e7134de60d007','d76253308c06713f86e75ea186368ba0ea63fdd50e9f72dd9be2a518e3b90cf7'],
  ['2f076464e1a0aefedb240ab6826fd145a39155c6357e6e3c9fe50c7f521bbfe5','b62c6ee7daa6aa1c69cc0b310e5e216d655b9754432d18cdef4b174aa0681e95'],
  ['97905cc2c71f5c44d1ce5085823fcdd9387e3530837ad17ede543962c77a4d07','3294c34a39816b9868e2052179ecddfaf9f146cf8411313ac4e2ddc6896368be'],
  ['bba93c75b0b8095cd97acfd90a66387a70bab7c6dba8fade3c81381abb49a472','ab12aa395f712400843a0a70fcd6db2d6b45c0188acd3703f03c4f4c545af24e'],
  ['5ac17d7261e45010c9851b8fb962fe8e5b6e03af1523a190e26765723565f122','909dc8084015ec937b94eeb7e031d113a92bda26767bdf7e88cbd483482fecd9'],
  ['02b647310505bed55695a4b4aae2de328215cf26c0400e347bddb0cd5ebdd355','2f076464e1a0aefedb240ab6826fd145a39155c6357e6e3c9fe50c7f521bbfe5'],
  ['1c70f6b6d0d2b69d815b2138c695b63b6309426ef2cd7463e70d1dc4706302c5','97905cc2c71f5c44d1ce5085823fcdd9387e3530837ad17ede543962c77a4d07'],
  ['7971eea8333e9835adc58e03c4d977837763509b3dd280d89ddf3f27e997f781','bba93c75b0b8095cd97acfd90a66387a70bab7c6dba8fade3c81381abb49a472'],
  ['d1256108192967f6c1cbaaf9264d8a8b36e58d11bf87c81f57a56071df7b063e','5ac17d7261e45010c9851b8fb962fe8e5b6e03af1523a190e26765723565f122'],
  ['6c76b32d52fe8e2465dc1390257db996b188f2bd03c047d306353f74789a37bd','3301a251da59ed655f4d2e8c61df0868070568418cba3282cd64e61d5821f36e'],
  ['39612895ad26772e411c3f27043d3df64c696097ec31010b30b99b7a53d9f3d2','43fb1609653705d24a62433a8e4a2e28afcd90916e59f583bbd9461933d5d9fe'],
  ['e33e1d341fa76e6a9508876cb687bd055d4999aa86971baf798ce600968ee965','02b647310505bed55695a4b4aae2de328215cf26c0400e347bddb0cd5ebdd355'],
  ['ab92d02c75716873b8d53972b7c786ec4718a6f02a24aecfeaf420af47381d75','1c70f6b6d0d2b69d815b2138c695b63b6309426ef2cd7463e70d1dc4706302c5'],
  ["86f57a555d5c53539a41a481fffcb1206792b97703b066c6335cb697cb97fbd4","92bcf4f71d93ccad9943a671811c1986e6d0b7172f1d414158937b8f0d0e0e00"],
  ["ff73b91aa144c9a39fc77d9b380974c1870473e3ee01330e478fd7a5a78886a6","4271a0ecb062848c8635b5e65ffaea6deb95aad5b30172a9cce021e17b53f6d3"],
  ["7bc54fa600f47b0e7c56e99810b92914d2dd50ec5cf5cca889a72d120c58ea36","e7e7b754d80cab939973511128067ee4e8202715ba8513a396c504bc9e349f3c"],
  ["07ab75acbf555249c1cbe3437a8372a461e9881132c98aa3da8c274435269eda","a8e7b14c452aab5b91618547e5b431681e294a7e6e8ff5ae7379b2cb8cae73b0"],
  ["26805c78cfd66035552a59e84c59464c947eeadd769ea5e3049187692e54d45b","e33e1d341fa76e6a9508876cb687bd055d4999aa86971baf798ce600968ee965"],
  ["346c25eb9d55b14916492e63eb9e5e1a9e7d5127f3e8c35dce95e1031aa480fd","ab92d02c75716873b8d53972b7c786ec4718a6f02a24aecfeaf420af47381d75"],
  [",\"scripts/lib/own-payroll-close-native-browser.mjs\":\"1c32672ef8f973b82be6cdd7c2a4935bbf8a320aab6a996d3d4d57a442ef77fc\",\"assets/own-payroll-close-panel.css\":\"25457df604fa7371e6012c074a0d62b3bb44d98cd0b274c211ab5c8161a55a0f\"",""],
  ["cbd2793901881665fb910c8ee31b68f27ea411652a7151884427787ce889e311","6c76b32d52fe8e2465dc1390257db996b188f2bd03c047d306353f74789a37bd"],
  ["1dcba348fc90e1fac6dc2960a1931e1508b8ae5694dfa3896e9002c4498ab177","26805c78cfd66035552a59e84c59464c947eeadd769ea5e3049187692e54d45b"],
  ["37b9347c01a7e43dbdf4e32b6e20d865cf2887d207ac72dd588e6967bce3b7fe","346c25eb9d55b14916492e63eb9e5e1a9e7d5127f3e8c35dce95e1031aa480fd"]
 ];
 assert.equal(target.inverse.length,68+changes.length);
 assert.deepEqual(target.inverse.slice(68).map(op=>[
  Buffer.from(op.afterBase64,'base64').toString(),Buffer.from(op.beforeBase64,'base64').toString()
 ]),changes);
 const undo=([current,previous])=>{
  assert.equal(source.split(current).length,2,'one reviewed pin '+current);
  source=source.replace(current,previous);
 };
 // Appended operations are chronological: restore b41 before its six earlier
 // pin transitions. The complete accounting projection still restores dd370.
 for(const pair of changes.slice(31).reverse())undo(pair);
 assert.equal(hash(source),'be10ee6669cdbfe2c7f3cab73cfd22e6d41d937ee96e02ebfdfe6b5ae2e4d500','R2 consumer custody recovers the complete unexecuted R1 close source fixture before its99 prior operations');
 for(const pair of changes.slice(24,31).reverse())undo(pair);
 assert.equal(hash(source),'f182d0e9bbb64574ad1c347919f924f9877faeb8e24096fd4dfabbea3e935b1d','close presentation source pins and two new entries recover the exact separate29 fixture before its92 ancestral operations');
 for(const pair of changes.slice(18,24).reverse())undo(pair);
 assert.equal(hash(source),'f2a6e6e6ffc6b2b19ef31324ce6868eb2236ac398420cbb6c5c636adbd70ec27','the six separate29 source custody pins recover the exact80b99 fixture before all86 prior operations');
 for(const pair of changes.slice(14,18).reverse())undo(pair);
 assert.equal(hash(source),'8a065fe803bfb7e6a077feebcf3c5f88a1d61122e050c1001e67dc143fc41b6c','the four reviewed208 source custody pins recover the exact0eaa product fixture');
 for(const pair of changes.slice(9,14).reverse())undo(pair);
 assert.equal(hash(source),'34d1f48384c582bc39acab6281533c223140c74deb759c88ed036cb962f3489f','the five registered-outcome pins recover the exact05031ab fixture');
 for(const pair of changes.slice(8,9).reverse())undo(pair);
 assert.equal(hash(source),'02856ee899461ccfa548803d49204a637cc9e46bad5fc03381e19e02dc21e667','the complete presentation transport pin recovers the exact P1bc fixture');
 for(const pair of changes.slice(6,8).reverse())undo(pair);
 assert.equal(hash(source),'9cdc9df2920581dab7179ea7541d77d316b823350a8361c3afb9a1763b332bcd','the two presentation-derived pins recover the exact b41 fixture');
 for(const pair of changes.slice(0,6))undo(pair);
 assert.equal(hash(source),'b4d90a930518e029678511774bfafb85ed65d98cbcfa83f835174f21ccef60e7','all other fixture bytes remain unchanged');
});
