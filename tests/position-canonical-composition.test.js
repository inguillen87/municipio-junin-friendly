import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {canonicalPositionContext137,composeCanonicalPositionPrerequisites,canonicalPositionProjection,buildCanonicalPositionComparisonInstallation,assertCanonicalPositionStageDurability} from '../scripts/lib/position-canonical-composition-qa.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const context=()=>canonicalPositionContext137({source104:read('scripts/migrations/104-native-employment-changes.sql'),source137:read('scripts/migrations/137-adopted-operator-context.sql')});
test('explicit canonical profile derives only137 from exact104 source with a byte inverse',()=>{
 const c=context();assert.equal(c.inverseExact,true);assert.notEqual(c.before,c.after);
 const old=ownInstallationFunctionPin(c.before),next=ownInstallationFunctionPin(c.after);
 assert.equal(old.sha256,'b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d');
 assert.equal(next.sha256,'2e333bd185ce509f3f4715d83f48ce6a37341dfd32ef3e56e21942ff6995fe7b');
 const pins=[{...old,runtime:false}],copy=structuredClone(pins);
 const actual=composeCanonicalPositionPrerequisites({pins,definitions:[c.after],context137:c});assert.deepEqual(pins,copy);assert.deepEqual(actual,[{...next,runtime:false}]);
 assert.throws(()=>composeCanonicalPositionPrerequisites({pins,definitions:[c.before],context137:c}),/M10_PROFILE_SOURCE_PREREQUISITE_CHANGED/);
 assert.throws(()=>composeCanonicalPositionPrerequisites({pins,definitions:[c.after,c.after],context137:c}),/M10_PROFILE_DUPLICATE_SOURCE/);
 assert.throws(()=>buildCanonicalPositionComparisonInstallation({profile:'native104'}),/M10_PROFILE_EXPLICIT_SELECTION_REQUIRED/);
});
test('all37 original/new versions receive their own source-derived QA body pin',()=>{
 const defs=[127,128,129,199,198].flatMap(n=>{const f=fs.readdirSync(path.join(root,'scripts/migrations')).filter(f=>f.startsWith(n+'-'));assert.equal(f.length,1);return splitPostgresStatements(read('scripts/migrations/'+f[0])).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(s));});
 assert.equal(defs.length,37);const schema='mc_qa_fixed_092_'+'a'.repeat(32);
 const normalized=s=>s.replaceAll('public.',schema+'.').replaceAll('pg_catalog,public,pg_temp','pg_catalog,'+schema+',public,pg_temp');
 const p=canonicalPositionProjection({definitions:defs,normalized,schema});assert.equal(p.ledger.length,37);assert.equal(p.observedMetadataUsed,false);
 for(const d of defs){const old=ownInstallationFunctionPin(d),local=p.localPin(d,false);assert.equal(local.sha256,p.hashes[old.sha256]);assert.ok(local.signature.startsWith(schema+'.'));}
 assert.throws(()=>canonicalPositionProjection({definitions:defs.slice(1),normalized,schema}),/M10_PROFILE_ALL37_SOURCE_VERSIONS_REQUIRED/);
});
test('199 and198 durability rejects altered prior state, source binding or new metadata',()=>{
 const stage={number:199,sourceCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64)};
 const installed={version:'m10-canonical-composition-proof.v1',sourceCommit:stage.sourceCommit,phase:199,sourceSha256:stage.sourceSha256,allChecksPassed:true,beforeFingerprint:'c'.repeat(64),afterFingerprint:'c'.repeat(64),metadataFingerprint:'d'.repeat(64),rowsWritten:0,identityAssignmentsAdded:0};
 const {beforeFingerprint,...durable}=installed;assert.deepEqual(assertCanonicalPositionStageDurability({stage,installed,durable}),{priorStatePreserved:true,independentDurableMetadataVerified:true});
 for(const changed of [{...installed,afterFingerprint:'e'.repeat(64)},{...installed,sourceCommit:'f'.repeat(40)},{...installed,rowsWritten:1}])assert.throws(()=>assertCanonicalPositionStageDurability({stage,installed:changed,durable}));
 assert.throws(()=>assertCanonicalPositionStageDurability({stage,installed,durable:{...durable,metadataFingerprint:'e'.repeat(64)}}));
});
test('source profile keeps default installers and requires observable transaction/string mode',()=>{
 const source=read('scripts/lib/position-canonical-composition-qa.mjs');
 assert.ok(source.includes("current_setting('standard_conforming_strings')<>'on'"));
 assert.ok(source.includes("current_setting('transaction_isolation')<>'repeatable read'"));
 assert.ok(source.includes('beforeB0Required:true'));assert.ok(source.includes('legacy104BuildersChanged:false'));
 assert.ok(source.includes('executionAdmitted:false'));assert.ok(source.includes('M10_PROFILE_FIXTURE006_LINK_UNIQUENESS'));
 assert.ok(source.includes('M10_PROFILE_REPLACEMENT_METADATA_CHANGED'));assert.ok(source.includes('M10_PROFILE_REVERSAL_HISTORY_EXISTS'));
 assert.ok(source.includes("proname LIKE 'position_comparison_%')<>8"));
});

import {createHash} from 'node:crypto';
import {pinsCheck} from '../scripts/lib/native-leave-installation.mjs';
const replacementNames=new Set(['annual_budget_context_v1','annual_budget_proposal_v1','annual_budget_bootstrap_v1','annual_budget_command_v1','position_assignment_proposal_v1','position_assignment_bootstrap_v1','position_assignment_command_v1']);
const ownedDefinitions=source=>splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(s));
function realAdditiveStageSource(){
 const source=read('scripts/lib/position-canonical-composition-qa.mjs'),start=source.indexOf('function additiveStage('),end=source.indexOf('\n}\n\nexport function buildCanonicalPositionComparisonInstallation',start);
 assert.ok(start>=0&&end>start);return{source,stage:source.slice(start,end+2)};
}
function realInitializer(source,name){
 const lines=source.split(/\r?\n/).filter(line=>line.startsWith('const '+name+'='));assert.equal(lines.length,1);assert.ok(lines[0].endsWith(';'));
 return new Function('assert','return ('+lines[0].slice(('const '+name+'=').length,-1)+');')(assert);
}
test('actual199 reversal selector replaces seven existing headers and preserves every body and metadata',()=>{
 const{source,stage}=realAdditiveStageSource(),line=stage.split(/\r?\n/).filter(s=>s.startsWith(' const reversal='));assert.equal(line.length,1);assert.ok(line[0].endsWith(';'));
 // Evaluate the actual selector consumed by reversalWithoutHistory, rather
 // than a copied header conversion or an unreferenced exported function.
 assert.match(stage,/reversalWithoutHistory:[^\n]*\.\.\.reversal/);
 const expression=line[0].trim().slice('const reversal='.length,-1),select=new Function('number','originals','definitions','ownInstallationFunctionPin','one','return ('+expression+');');
 const originals=[...ownedDefinitions(read('scripts/migrations/127-annual-position-budget.sql')),...ownedDefinitions(read('scripts/migrations/128-own-position-assignments.sql'))].filter(d=>replacementNames.has(ownInstallationFunctionPin(d).name));assert.equal(originals.length,7);
 const before=[...originals],one=realInitializer(source,'one'),actual=select(199,originals,[],ownInstallationFunctionPin,one);assert.equal(actual.length,7);assert.deepEqual(originals,before);
 for(let n=0;n<7;n++){assert.ok(actual[n].startsWith('CREATE OR REPLACE FUNCTION '),'existing199 target must be replaced');assert.equal(actual[n].replace(/^CREATE OR REPLACE FUNCTION /,'CREATE FUNCTION '),originals[n]);assert.deepEqual(ownInstallationFunctionPin(actual[n]),ownInstallationFunctionPin(originals[n]));}
 const defs198=ownedDefinitions(read('scripts/migrations/198-own-position-comparison-v2.sql'));
 assert.deepEqual(select(198,[],defs198,ownInstallationFunctionPin,one),[...defs198].reverse().map(d=>'DROP FUNCTION '+ownInstallationFunctionPin(d).signature+' RESTRICT'));
});
test('actual199 installation emits one proof while both metadata captures remain non-row-producing',()=>{
 const{source,stage}=realAdditiveStageSource(),one=realInitializer(source,'one'),q=realInitializer(source,'q'),hash=s=>createHash('sha256').update(s).digest('hex');
 // Only the unrelated outer snapshot/destination IO guards are inert here.
 // The complete actual additiveStage, its two preserveMeta calls, source SQL
 // splitting and metadata pins remain real pure text producers.
 const inert='DO $source_test_seam$ BEGIN NULL;END $source_test_seam$';
 const build=new Function('assert','ownInstallationFunctionPin','hash','q','pinsCheck','splitPostgresStatements','one','fullSnapshot','transactionGuard','fixtureIdentityGuard','noHistory','return ('+stage+');')(assert,ownInstallationFunctionPin,hash,q,pinsCheck,splitPostgresStatements,one,()=>inert,()=>inert,inert,inert);
 const originals=[...ownedDefinitions(read('scripts/migrations/127-annual-position-budget.sql')),...ownedDefinitions(read('scripts/migrations/128-own-position-assignments.sql'))].filter(d=>replacementNames.has(ownInstallationFunctionPin(d).name));
 const sql199=read('scripts/migrations/199-structure-administrative-operator.sql'),definitions=ownedDefinitions(sql199),oldPins=originals.map(ownInstallationFunctionPin),newPins=definitions.map(ownInstallationFunctionPin);
 const result=build({number:199,source:sql199,originals,definitions,oldPins,newPins,normalize:s=>s,sourceCommit:'a'.repeat(40)});
 const rows=result.installation.filter(s=>/^SELECT\b/.test(s));assert.equal(rows.length,1,'strict native transport needs connection plus exactly one final proof');assert.match(rows[0],/m10-canonical-composition-proof\.v1/);
 const captures=result.installation.filter(s=>s.startsWith('DO $m10_preserve_meta$'));assert.equal(captures.length,2);
 for(const s of captures){assert.match(s,/^DO \$m10_preserve_meta\$ BEGIN PERFORM set_config\(/);assert.match(s,/;END \$m10_preserve_meta\$$/);assert.ok(s.includes("to_jsonb(p)-'prosrc'"));for(const pin of oldPins)assert.ok(s.includes(pin.signature));}
 assert.equal(captures[0].replace('function_before','SLOT'),captures[1].replace('function_after','SLOT'),'both metadata snapshots retain the same complete projection');
 assert.equal(result.durableVerification.filter(s=>/^SELECT\b/.test(s)).length,1);
});


import * as actualProfile from '../scripts/lib/position-canonical-composition-qa.mjs';
test('actual complete rehearsal evaluates five phase proofs but returns exactly one final verification',()=>{
 const source=read('scripts/lib/position-canonical-composition-qa.mjs'),matched=/rehearsal:\{statements:([\s\S]*?),requiredIsolation:/.exec(source);assert.ok(matched);
 const compose=new Function('stages','rehearsalVerification','composeCanonicalPositionRehearsal','return ('+matched[1]+');');
 const stages=[127,128,129,199,198].map((number,n)=>({number,installation:['DO $phase_'+number+'$ BEGIN NULL;END $phase_'+number+'$',"SELECT jsonb_build_object('phase',"+number+",'nested',(SELECT true))"+(n<3?' AS proof':'')]}));
 const final=["DO $final$ BEGIN NULL;END $final$","SELECT jsonb_build_object('version','complete-profile-proof')"],prior=structuredClone({stages,final});
 const run=(s=stages,v=final)=>compose(s,v,actualProfile.composeCanonicalPositionRehearsal),result=run();
 assert.equal(result.filter(s=>/^SELECT\b/.test(s)).length,1,'strict native JSON transport must receive only the final proof');assert.equal(result.at(-1),final.at(-1));
 assert.deepEqual({stages,final},prior);assert.equal(result.length,12);
 for(const stage of stages){assert.ok(result.includes(stage.installation[0]));const expression=stage.installation[1].slice('SELECT '.length).replace(/ AS proof$/,'');assert.ok(result.includes('DO $m10_rehearsal_phase$ BEGIN PERFORM '+expression+';END $m10_rehearsal_phase$'),'complete original phase expression stays evaluated');}
 assert.throws(()=>run(stages.slice(1)),/M10_PROFILE_REHEARSAL_STAGES/);
 assert.throws(()=>run(stages,[...final,'SELECT true']),/M10_PROFILE_REHEARSAL_FINAL_PROOF/);
 const changed=structuredClone(stages);changed[2].installation.unshift('SELECT true');assert.throws(()=>run(changed),/M10_PROFILE_REHEARSAL_PHASE_PROOF/);
});
