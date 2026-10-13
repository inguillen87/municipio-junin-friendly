import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {buildClassificationRegistrationUseInstallation,CLASSIFICATION_USE_SQL_SHA256,assertClassificationUseDurability} from '../scripts/lib/classification-registration-use-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),commit='a'.repeat(40);
test('the immutable protocol adapts only five exact functions and preserves all data and ACL',()=>{
 const b=buildClassificationRegistrationUseInstallation({read,sourceCommit:commit});assert.equal(b.beforePins.length,5);assert.equal(b.afterPins.length,5);assert.equal(b.sourceHashes['scripts/migrations/167-classification-registration-use.sql'],CLASSIFICATION_USE_SQL_SHA256);
 assert.match(b.prerequisite,/employment_adoption_administrative_context_v1/);assert.match(b.statements.join('\n'),/repeatable read/);assert.match(b.conservation,/IS DISTINCT FROM/);assert.match(b.proof,/'businessWrites',0/);assert.match(b.proof,/'existingAclChanges',0/);
 // Function definitions contain the existing registration INSERT statements;
 // installing their bodies must not execute those statements as data commands.
 const sql=b.mutations.join('\n'),bodies=[...sql.matchAll(/\$(body[0-4])\$([\s\S]*?)\$\1\$/g)];assert.equal(bodies.length,5);
 for(const [n,body]of bodies.entries())assert.equal(createHash('sha256').update(body[2]).digest('hex'),b.afterPins[n].sha256);
 const operative=sql.replace(/\$(body[0-4])\$[\s\S]*?\$\1\$/g,'<stored function body>');
 assert.doesNotMatch(operative,/CREATE TABLE|INSERT INTO|DELETE FROM|UPDATE public\.|GRANT |REVOKE /);assert.ok(b.verification.includes('SET TRANSACTION READ ONLY'));assert.equal(b.connects,false);
 for(const p of b.beforePins){assert.equal(b.afterPins.find(x=>x.name===p.name).runtime,p.runtime);assert.notEqual(b.afterPins.find(x=>x.name===p.name).sha256,p.sha256);}
});
test('a changed SQL file cannot acquire the reviewed hash and partial state cannot be repaired silently',()=>{
 assert.throws(()=>buildClassificationRegistrationUseInstallation({read:f=>read(f)+(f.endsWith('.sql')?'\n-- changed':''),sourceCommit:commit}));
 const b=buildClassificationRegistrationUseInstallation({read,sourceCommit:commit});assert.match(b.state,/CLASSIFICATION_USE_PARTIAL_STATE/);assert.match(b.mutations[0],/mode_count NOT IN\(0,5\)/);
 assert.match(b.mutations[0],/item->'registrationAllowed'='false'::jsonb/);assert.match(b.mutations[0],/catalogActorVerified/);assert.match(b.mutations[0],/p.actor_person_id<>/);
});
test('durability requires the same commit, sources, data, counts and zero permission changes',()=>{
 const b=buildClassificationRegistrationUseInstallation({read,sourceCommit:commit});const a={version:'classification-registration-use-installation.v1',sourceCommit:commit,sourceHashes:b.sourceHashes,mode:'install',adaptedFunctions:5,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,roleAssignmentsAdded:0,nominalRowsReturned:0,preservationSha256:'b'.repeat(64)},d={...a,mode:'verify'};assert.doesNotThrow(()=>assertClassificationUseDurability(a,d));
 for(const patch of[{sourceCommit:'c'.repeat(40)},{sourceHashes:{}},{preservationSha256:'c'.repeat(64)},{existingAclChanges:1},{businessWrites:1},{mode:'install'}])assert.throws(()=>assertClassificationUseDurability(a,{...d,...patch}));
});
