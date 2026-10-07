// Private synthetic clones only; production readers, rows and ACL stay intact.
import assert from 'node:assert/strict';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export async function verifyOwnCloseDetail({db,qa,actor,period,batch,ok}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const name=qa.schema+'.own_close_detail_reference_qa',anchor='FUNCTION public.own_close_detail_v1(',clone=s=>{
  assert.equal(s.split(anchor).length,2);return qa.normalized(s.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ').replace(anchor,'FUNCTION public.own_close_detail_reference_qa('));
 },context=q(JSON.stringify(employeeContext(actor.principal,actor.session))),call=`SELECT ${name}(${context}::jsonb,${q(period)},'monthly')`,optimized=batch.migration.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_close_detail_v1('));assert.ok(optimized);
 let referenceMs,optimizedMs;
 try{
  await db.run(clone(batch.referenceCloseDetail)+`;REVOKE ALL ON FUNCTION ${name}(jsonb,text,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION ${name}(jsonb,text,text) TO municontrol_actions_runtime_app`);
  const start=Date.now(),reference=await db.run(call,true);referenceMs=Date.now()-start;
  const fresh=Date.now(),actual=await db.run(`SELECT ${qa.schema}.own_close_detail_v1(${context}::jsonb,${q(period)},'monthly')`,true);optimizedMs=Date.now()-fresh;
  assert.deepEqual(actual,reference);assert.equal(actual.rows.length,29);assert.equal(actual.captures.length,2);ok(true,'optimized close detail equals the original full result for all29 employees sharing two immutable captures');
  for(const [field,invalid]of [['employeeNumber','Identidad sintética incorrecta QA'],['departmentCode','999999']]){
   for(const source of [batch.referenceCloseDetail,optimized]){
    const declaration='independent boolean;',guard='IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.input';assert.equal(source.split(declaration).length,2);assert.equal(source.split(guard).length,2);
    const changed=source.replace(declaration,declaration+"qa_seen uuid[]:='{}';").replace(guard,`IF c.id=ANY(qa_seen) THEN person:=jsonb_set(person,${q('{'+field+'}')},to_jsonb(${q(invalid)}::text));END IF;qa_seen:=array_append(qa_seen,c.id);\n  `+guard);
    await db.run(clone(changed));await assert.rejects(()=>db.run(call,true),/OWN_CLOSE_CONTRACT_INVALID/);
   }
   ok(true,'original and optimized close refuse changed '+field+' on a subsequent employee sharing a validated run');
  }
 }finally{await db.run(`DROP FUNCTION ${name}(jsonb,text,text)`);}
 return {passed:true,originalReaderEquivalent:true,employees:29,captures:2,referenceMs,optimizedMs,identityChecksPreserved:true,privateSyntheticClones:true,productionWrites:false};
}
