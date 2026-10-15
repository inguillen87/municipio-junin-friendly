// Canonical read dependencies for older, own-hire-only UI fixtures. No municipal
// connection, fictional directory rows, catalogue approval or business writer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {noeliaCircuitRosterRead} from './noelia-payroll-circuit-qa.mjs';

const readerNames=['native_employee_read_projection_v1','native_employee_directory_snapshot_v1'];
const tables=['employment_adoption_proposal','employment_adoption_seal','employment_adoption_decision','employment_adoption_application'];
const read=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
function requireQa(qa){assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(qa.pins.includes("current_database()<>'own_payroll_run_qa'")&&qa.pins.includes("current_setting('neon.project_id',true)"));}
const relocate=(s,qa)=>s.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+qa.schema+',public,pg_temp');
const preserve=qa=>`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace=${q(qa.schema)}::regnamespace AND p.proname NOT IN(${readerNames.map(q).join(',')})),'contracts',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM employment_contract c),'identities',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM person_identity p),'registrations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM native_employee_registration r),'capabilities',(SELECT jsonb_agg(to_jsonb(c) ORDER BY to_jsonb(c)::text COLLATE "C") FROM capabilities c))`;
export async function installOwnPayrollReadinessUiQa(db,qa){
 requireQa(qa);const source=read('135-native-employee-read-projection.sql'),statements=splitPostgresStatements(source),definitions=readerNames.map(name=>{const s=statements.find(v=>v.includes('CREATE FUNCTION public.'+name+'('));assert.ok(s);return relocate(s,qa);});
 assert.equal(statements.length,4,'Canonical135 reader statement shape changed');
 const pins=definitions.map(s=>{const p=ownInstallationFunctionPin(s.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.'));return {...p,signature:p.signature.replace('public.',qa.schema+'.'),runtime:true};});
 const present=await db.run(`SELECT jsonb_build_object('count',(SELECT count(*) FROM pg_proc WHERE pronamespace=${q(qa.schema)}::regnamespace AND proname IN(${readerNames.map(q).join(',')})))`);
 assert.ok([0,2].includes(present.count),'QA_READINESS_PARTIAL_READER_INSTALLATION');
 if(present.count===2){await db.run(pinsCheck(pins,'QA_READINESS_EXISTING_READER_CHANGED'));return {installed:false,canonicalReadersVerified:true,sourceSha256:createHash('sha256').update(source).digest('hex')};}
 const before=await db.run(preserve(qa)),emptyDependencies=[];
 for(const file of ['132-employment-adoption-preparation.sql','133-employment-adoption-application.sql'])for(const s of splitPostgresStatements(read(file))){
  const match=/^(?:CREATE TABLE|ALTER TABLE) public\.(employment_adoption_[a-z]+)\b/.exec(s);
  if(match&&tables.includes(match[1])||s.startsWith('REVOKE ALL ON public.employment_adoption_'))emptyDependencies.push(relocate(s,qa));
 }
 assert.equal(emptyDependencies.filter(s=>s.startsWith('CREATE TABLE')).length,4,'Canonical read row-type dependencies changed');
 // Complete canonical DDL is used only when the older fixture lacks these types.
 // No adoption function or baseline patch from132/133 is installed or invoked.
 const missing=await db.run(`SELECT jsonb_build_object('count',(SELECT count(*) FROM pg_class WHERE relnamespace=${q(qa.schema)}::regnamespace AND relname IN(${tables.map(q).join(',')})))`);
 assert.ok([0,4].includes(missing.count),'QA_READINESS_PARTIAL_TYPE_INSTALLATION');
 await db.run((missing.count===0?emptyDependencies:[]).concat(statements.map(s=>relocate(s,qa)),pinsCheck(pins,'QA_READINESS_READER_CHANGED')).join(';')+";SELECT '{}'::jsonb");
 assert.deepEqual(await db.run(preserve(qa)),before,'Canonical readiness readers changed an existing function, identity, contract, registration or capability');
 if(missing.count===0){const counts=await db.run('SELECT jsonb_build_object('+tables.map(name=>q(name)+',(SELECT count(*) FROM '+name+')').join(',')+')');assert.ok(Object.values(counts).every(n=>n===0),'Read row-type dependencies must remain empty');}
 return {installed:true,canonicalReadersVerified:true,existingSourcesPreserved:true,sourceSha256:createHash('sha256').update(source).digest('hex')};
}
export function createOwnPayrollReadinessSql(db,qa){
 requireQa(qa);return {query:async(query,values)=>{
  const roster=noeliaCircuitRosterRead(query,values,qa.schema);if(roster)return await db.run(roster);
  assert.ok(['SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result','SELECT public.own_program_bootstrap_v1($1::jsonb) AS result'].includes(query),'QA_READINESS_QUERY_NOT_CANONICAL');
  assert.ok(Array.isArray(values)&&values.length===1&&typeof values[0]==='string');
  const statement=query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.equal(Number(n),1);return q(values[0]);});
  return [{result:await db.run(statement,true)}];
 }};
}
