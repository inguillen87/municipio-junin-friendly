import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ownerGenerationCandidate,installPm10OwnerGeneration} from '../scripts/install-pm10-owner-generation.mjs';
const source=fs.readFileSync(new URL('../local-agents/pm10/store.mjs',import.meta.url)),marker=Buffer.from('async function boundedFile('),tail=source.subarray(source.indexOf(marker));
const priorPrefix=fs.readFileSync(new URL('../local-agents/pm10/tests/fixtures/lock-before-generation.txt',import.meta.url));
test('known old module receives only lock prefix and retains capture bytes exactly',()=>{
 const before=Buffer.concat([priorPrefix,tail]),candidate=ownerGenerationCandidate(before,source);
 assert.equal(candidate.changed,true);assert.deepEqual(candidate.bytes.subarray(candidate.bytes.indexOf(marker)),tail);assert.deepEqual(candidate.bytes,source);
 assert.equal(ownerGenerationCandidate(candidate.bytes,source).changed,false);
});
test('unrecognized installed changes and untested source stop before any installation',()=>{
 for(const changed of [Buffer.concat([priorPrefix,tail,Buffer.from('// drift')]),Buffer.concat([Buffer.from('// drift'),priorPrefix,tail])])assert.throws(()=>ownerGenerationCandidate(changed,source),/INSTALLED_DRIFT/);
 assert.throws(()=>ownerGenerationCandidate(source,Buffer.concat([source,Buffer.from('// drift')])),/SOURCE_MISMATCH/);
 assert.throws(()=>ownerGenerationCandidate('not bytes',source),/SOURCE_MISMATCH/);
});
test('installer refuses an unrelated project or root before reading configuration',async()=>{
 for(const base of [process.cwd(),process.platform==='win32'?'C:\\':'/', 'relative'])await assert.rejects(installPm10OwnerGeneration(['--base',base,'--apply','yes']),/PM10_UPDATE_(?:ARGUMENTS|PATH_INVALID)/);
});
