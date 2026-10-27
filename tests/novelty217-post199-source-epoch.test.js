// Real source constructors and full metadata rows; no PostgreSQL acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {prepareOwnMonthlyFullCapacity} from '../scripts/verify-own-monthly-payroll-full-capacity.mjs';
import {buildNoveltyAdministrative217Qa} from '../scripts/lib/novelty-administrative217-qa.mjs';
import {composeNovelty217Capacity201Bookend} from '../scripts/lib/novelty-administrative217-installation.mjs';
import {pinsCheck} from '../scripts/lib/native-leave-installation.mjs';
import {installNovelty217Joint} from '../scripts/lib/novelty-administrative217-joint.mjs';
const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL(file,root),'utf8').replace(/\r\n?/g,'\n'),sourceCommit='a'.repeat(40),memo=new Map();
function fixture(major=17){if(memo.has(major))return memo.get(major);const qa=buildOwnerProgramQa({major,sourceCommit,read,schema:'mc_qa_fixed_092_'+String(major).repeat(16),operationalPairBaseline:'published107'}),h={qa,major,sourceCommit,read},prepared=prepareOwnMonthlyFullCapacity(h);const value={h,...prepared.context};memo.set(major,value);return value;}
const hash=value=>createHash('sha256').update(value).digest('hex');
function rows(text){const found=[];for(const match of text.matchAll(/jsonb_array_elements\(('+)(\[[^\r\n]*?\])\1::jsonb\)/g)){const quotes=match[1];let value;try{value=JSON.parse(match[2].replaceAll(quotes.repeat(2),"'"));}catch{continue;}if(Array.isArray(value))found.push(...value);}return found;}
for(const major of [17,18])test('same190 PG'+major+'217 guards the complete actual monetary/213 source epoch',()=>{
 const f=fixture(major),p=f.administrative217,m=f.monetary,b=p.batch,localRows=rows(p.local.preflight[1]);
 assert.equal(p.technicalPredecessorEpoch,'post199-post213');assert.strictEqual(p.monetary,m);assert.strictEqual(p.liquidationBootstrap213,f.liquidationBootstrap213);assert.strictEqual(p.baseNormalize,m.monetaryNormalized);
 // This stale197 contract is the causal regression: it still expects both
 // previous monetary bodies after the real runner has reinstalled their successors.
 const stale=rows(f.monthly.normalized(b.predecessor.afterCheck));
 for(const [n,before]of m.expectedQaMonetaryBeforePins.entries()){
  const after=m.expectedQaMonetaryAfterPins[n];assert.ok(stale.some(row=>row.signature===before.signature&&row.sha256===before.sha256));assert.notEqual(before.sha256,after.sha256);
  const actual=localRows.filter(row=>row.signature===after.signature);assert.ok(actual.length>0);for(const row of actual)assert.deepEqual(row,after);assert.equal(actual.some(row=>row.sha256===before.sha256),false);
 }
 for(const pin of m.expectedQaMonetaryNewPins)assert.ok(localRows.some(row=>{try{assert.deepEqual(row,pin);return true;}catch{return false;}}),'complete private monetary helper '+pin.signature);
 assert.ok(p.local.preflight[1].includes("left(proname,22)='own_monetary_manifest_'"));
 const boot=f.liquidationBootstrap213;for(const expected of [...boot.prerequisites,boot.afterPin])assert.ok(localRows.some(row=>{try{assert.deepEqual(row,expected);return true;}catch{return false;}}),'complete213 source guard '+expected.signature);assert.equal(localRows.some(row=>row.signature===boot.beforePin.signature&&row.sha256===boot.beforePin.sha256),false);
 // Whole199 ancestor guards survive;217 changes only its context/readiness rows.
 assert.equal(b.technicalPredecessor.monetary.afterCheck,m.monetaryInstallation.afterCheck);assert.equal(b.beforeCheck,b.technicalPredecessor.bootstrap213.projection.value+';'+pinsCheck([...b.technicalPredecessor.bootstrap213.prerequisites,boot.rawAfter],'NOVELTY217_BOOTSTRAP213_METADATA'));
 for(const phase of ['preflight','rehearsal','installation','verification','repetition'])for(const statement of p.local[phase])assert.equal(statement.includes('public.own_program_definition_v1(jsonb,jsonb)'),false);
 assert.equal(p.historical197ArraysPreserved,true);const post=composeNovelty217Capacity201Bookend({batch:b});assert.equal(post.post201Batch.technicalPredecessorEpoch,b.technicalPredecessorEpoch);assert.equal(post.post201Batch.helper,b.helper);assert.equal(post.post201Batch.context,b.context);assert.equal(post.post201Batch.readiness,b.readiness);
 for(const definition of [b.helper,b.context,b.readiness]){const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(p.normalized(definition));assert.ok(match);assert.equal(p.hashes[hash(/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition)[2])],hash(match[2]));}
});
test('default post197 stays source-identical for public217 and the original monthly engine',()=>{
 const f=fixture(),old=buildNoveltyAdministrative217Qa({qa:f.monthly,read,sourceCommit}),next=f.administrative217;
 assert.equal(old.technicalPredecessorEpoch,'post197');assert.equal(old.batch.beforeCheck,old.batch.predecessor.afterCheck);assert.equal(old.baseNormalize,f.monthly.normalized);assert.equal(old.batch.technicalPredecessor,null);
 for(const key of ['helper','context','readiness','beforePins','afterPins','helperPin','mutations'])assert.deepEqual(next.batch[key],old.batch[key]);
 for(const key of ['local','local193','localFixed','local197'])assert.deepEqual(f.monetary[key],f.monthly[key]);
});
test('one missing or foreign technical predecessor fails before217 plans/SQL exist',()=>{
 const f=fixture(),input={qa:f.monthly,read,sourceCommit};assert.throws(()=>buildNoveltyAdministrative217Qa({...input,monetary:f.monetary}),/COMPLETE_TECHNICAL_PREDECESSORS/);assert.throws(()=>buildNoveltyAdministrative217Qa({...input,liquidationBootstrap213:f.liquidationBootstrap213}),/COMPLETE_TECHNICAL_PREDECESSORS/);
 for(const delta of [{schema:'foreign'},{sourceCommit:'b'.repeat(40)},{monetaryFoundationMode:'standalone'},{observedMetadataUsed:true}])assert.throws(()=>buildNoveltyAdministrative217Qa({...input,monetary:{...f.monetary,...delta},liquidationBootstrap213:f.liquidationBootstrap213}));
});
test('runner retains final monetary then213 then217 order and passes their actual receipts',()=>{
 const source=read('scripts/verify-own-monthly-payroll-full-capacity.mjs');assert.ok(source.includes('prepareNovelty217Joint(h,monthly,monetary,liquidationBootstrap213)'));assert.ok(source.includes('installNovelty217Joint(h,{monetaryTechnical,liquidationBootstrap213})'));
 const a=source.indexOf('const monetaryTechnical = verifyOwnMonetaryProgramTechnicalEpoch('),b=source.indexOf('const liquidationBootstrap213=installOwnLiquidationBootstrap213(h)'),c=source.indexOf('const novelty217=installNovelty217Joint(h,');assert.ok(a>=0&&b>a&&c>b);
});
test('same190 cannot reach217 transport using a passed flag without real predecessor receipt bodies',()=>{
 const f=fixture(),h={...f.h,prepared:{monthly:f.monthly,monetary:f.monetary,liquidationBootstrap213:f.liquidationBootstrap213,administrative217:f.administrative217},json:()=>assert.fail('217 SQL transport must remain untouched')};
 assert.throws(()=>installNovelty217Joint(h,{monetaryTechnical:{version:'own-monetary-program-technical-epoch.v2',passed:true},liquidationBootstrap213:{passed:true}}));
});
test('changed monetary or213 source fails while constructing the post199 predecessor guard',()=>{
 const f=fixture(),options={qa:f.monthly,sourceCommit,monetary:f.monetary,liquidationBootstrap213:f.liquidationBootstrap213};
 for(const file of ['scripts/sql/own-monetary-program-definition.sql','scripts/migrations/213-own-liquidation-bootstrap-administrative-operator.sql','scripts/lib/own-liquidation-bootstrap213-installation.mjs'])assert.throws(()=>buildNoveltyAdministrative217Qa({...options,read:name=>read(name)+(name===file?'\n-- changed source':'')}),/SOURCE_CHANGED/);
});
