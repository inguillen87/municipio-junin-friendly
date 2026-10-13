import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildWorkingTimeAdoptionReadinessRepair,READINESS_PRIOR,READINESS_FINAL,CAPTURE_FINAL} from '../scripts/lib/working-time-adoption-readiness.mjs';
import {adoptionPreparationError} from '../lib/internal-employment-adoption.js';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);
test('readiness repair retains the full guard and changes only the approved SQL164 capture pin',()=>{
 const b=buildWorkingTimeAdoptionReadinessRepair({read,sourceCommit});assert.equal(b.mutations.length,1);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.match(b.mutations[0],/EXECUTE replace\(definition,prior_capture,final_capture\)/);assert.match(b.mutations[0],/length\(ready_source\).*<>1/);assert.ok(b.beforeCheck.includes(READINESS_PRIOR)&&b.beforeCheck.includes(CAPTURE_FINAL));assert.ok(b.afterCheck.includes(READINESS_FINAL)&&b.afterCheck.includes(CAPTURE_FINAL));assert.match(b.runtime,/PERFORM public\.municipal_adoption_ready_v1\(\)/);assert.match(b.audit,/IS DISTINCT FROM/);assert.match(b.before,/CASE WHEN p\.oid=to_regprocedure/);assert.doesNotMatch(b.mutations[0],/\b(?:GRANT|REVOKE|ALTER TABLE|INSERT INTO|DELETE FROM|TRUNCATE)\b/i);
});
test('repair is repeatable, rejects another capture and keeps read-only durable verification',()=>{
 const b=buildWorkingTimeAdoptionReadinessRepair({read,sourceCommit});assert.match(b.mutations[0],/ready_hash=final_ready THEN RETURN/);assert.match(b.mutations[0],/WORKING_TIME_ADOPTION_CAPTURE_CHANGED/);assert.match(b.mutations[0],/WORKING_TIME_ADOPTION_GUARD_CHANGED/);assert.equal(b.verification[0],'SET TRANSACTION READ ONLY');assert.match(b.apply,/mode'\)='repair'/);assert.match(b.proof,/'businessWrites',0/);assert.match(b.proof,/'existingAclChanges',0/);
});
test('repair cannot be prepared for an uncommitted name or unknown source pin',()=>{
 assert.throws(()=>buildWorkingTimeAdoptionReadinessRepair({read,sourceCommit:'master'}));assert.throws(()=>buildWorkingTimeAdoptionReadinessRepair({sourceCommit,read:f=>read(f).replaceAll(READINESS_PRIOR,'b'.repeat(64))}));
});
test('a failed adoption integration read tells the operator to verify installation without exposing SQL details',()=>{
 const error=adoptionPreparationError({code:'P0001',message:'ADOPTED_CONSUMERS_AFTER_METADATA · detalle nominal privado QA'});
 assert.equal(error.status,503);assert.equal(error.code,'EMPLOYMENT_ADOPTION_NOT_READY');assert.match(error.message,/consultar|consultá|verificar/i);assert.doesNotMatch(error.message,/detalle nominal|P0001|ADOPTED_CONSUMERS|No se confirmó la propuesta/);
});
