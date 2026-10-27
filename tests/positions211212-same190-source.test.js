// Proposed real-source construction focals; no native invocation occurs here.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {composePositions211212Same190} from '../scripts/lib/positions211212-same190-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
let foundation;const qa=()=>foundation??=buildOwnerProgramQa({major:17,sourceCommit,read,schema:'mc_qa_fixed_092_'+'9'.repeat(32),operationalPairBaseline:'published107'});
const build=(reader=read)=>composePositions211212Same190({qa:qa(),major:17,sourceCommit,read:reader});
test('211 is an exact additive post201 upgrade while212 preserves four110/136 predecessors',()=>{
 const hashes=structuredClone(qa().hashes),p=build();assert.strictEqual(p.foundation,qa());assert.deepEqual(qa().hashes,hashes);
 assert.equal(p.art211.provenance.length,28);assert.equal(p.art211.batch.ownPins.length,1);
 assert.equal(p.lifecycle212.predecessors.length,4);assert.equal(p.lifecycle212.ownPin.signature,qa().schema+'.native_employment_lifecycle_history_v2(jsonb,uuid)');
 assert.ok(p.art211.installation.every(s=>!/^SET TRANSACTION\b/.test(s)));assert.ok(p.lifecycle212.verification.every(s=>!/^SET TRANSACTION\b/.test(s)));
 assert.ok(p.art211.installation.some(s=>s.includes('repeatable read')));
 assert.ok(p.lifecycle212.installation[1].includes('NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_PREREQUISITE_MISSING'));
});
test('removing the exact212 predecessor guard or changing110 metadata rejects before SQL',()=>{
 assert.throws(()=>build(file=>file==='scripts/migrations/212-native-employment-lifecycle-history.sql'?read(file).replace(/DO \$history_prerequisites\$[\s\S]*?\$history_prerequisites\$;/,''):read(file)),/LIFECYCLE212_SOURCE_CHANGED/);
 assert.throws(()=>build(file=>read(file)+(file==='scripts/migrations/110-native-employment-lifecycle.sql'?'\n':'')),/ART211_REVIEWED_SOURCE_CHANGED:scripts\/migrations\/110-native-employment-lifecycle\.sql/);
});


test('ART211 consumes the real unqualified007 helper with its complete metadata and private ACL',()=>{
 const p=build(),file='scripts/migrations/007-action-center-read-facades.sql';
 const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
 const definitions=splitPostgresStatements(read(file)).map(clean).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION action_center_context_has_capability\s*\(/.test(s));
 assert.equal(definitions.length,1);
 const expected=p.art211.batch.prerequisitePins.find(pin=>pin.signature==='public.action_center_context_has_capability(jsonb,text)');
 assert.ok(expected);assert.equal(expected.runtime,false);
 assert.deepEqual({...ownInstallationFunctionPin(definitions[0]),runtime:expected.runtime},expected);
 const actual=p.art211.provenance.find(pin=>pin.signature===expected.signature);
 assert.equal(actual.sourceBodySha256,expected.sha256);assert.equal(actual.runtime,false);
 assert.equal(actual.localSignature,qa().normalized(expected.signature));
 assert.equal(p.art211.provenance.length,28);
 // Even an equivalent schema qualification changes an immutable source file.
 assert.throws(()=>build(path=>path===file?read(path).replace('CREATE OR REPLACE FUNCTION action_center_context_has_capability(','CREATE OR REPLACE FUNCTION public.action_center_context_has_capability('):read(path)),/OWN_ART_FULL_SOURCE_CHANGED/);
});
