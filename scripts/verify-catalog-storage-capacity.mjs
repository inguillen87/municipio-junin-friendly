// Real SQL/HTTP and compiled browser; existing disposable synthetic QA PG17/18.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifyClassificationRegistrationUse} from './verify-classification-registration-use.mjs';
import {buildCatalogStorageCapacityInstallation,assertCatalogStorageCapacityDurability,CATALOG_PROVIDER_BUDGET_BYTES} from './lib/catalog-storage-capacity-installation.mjs';
import {catalogItems} from '../assets/native-employment-catalog-model.js';import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
export async function verifyCatalogStorageCapacity(options){
 return verifyClassificationRegistrationUse({...options,browser:'none',afterClassification:async h=>{
  const{qa,db,sql,relocate,request,ok,setActor}=h;
  const expectCapacity=extra=>`DO $boundary$ BEGIN BEGIN PERFORM native_employment_catalog_capacity_v1(${extra});RAISE EXCEPTION 'QA_CAPACITY_REJECTION_MISSING';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT' THEN RAISE;END IF;END;END $boundary$`;
  await sql(expectCapacity(629145600));ok(true,'original 496 MiB storage ceiling rejects an estimated 600 MiB increment');
  const batch=buildCatalogStorageCapacityInstallation({...h.options,verifiedBudgetBytes:CATALOG_PROVIDER_BUDGET_BYTES});
  const canonical=relocate("replace(p.prosrc,E'\\r\\n',E'\\n')");
  const normalized=s=>{let v=relocate(s);for(const alias of['updated.prosrc','after_body'])v=v.replaceAll("replace("+alias+",E'\\r\\n',E'\\n')",canonical.replaceAll('p.prosrc',alias));return v;};
  await assert.rejects(()=>sql(normalized(batch.mutations[0])),/CATALOG_STORAGE_PROVIDER_BUDGET_REQUIRED/);
  ok(true,'raw migration refuses a missing explicit provider-budget declaration');
  const statements=batch.statements.map(s=>s===batch.choose?`DO $choose$ BEGIN IF current_setting('municontrol_catalog_storage.mode')='install' THEN EXECUTE ${q(normalized(batch.beforeCheck))};ELSE EXECUTE ${q(normalized(batch.afterCheck))};END IF;END $choose$`:s===batch.apply?`DO $apply$ BEGIN IF current_setting('municontrol_catalog_storage.mode')='install' THEN EXECUTE ${q(normalized(batch.mutations[0]))};END IF;END $apply$`:normalized(s));
  const installed=await sql(statements.join(';')),durable=await sql(batch.verification.map(normalized).join(';')),repeated=await sql(statements.join(';'));
  assertCatalogStorageCapacityDurability(installed,durable);assertCatalogStorageCapacityDurability(installed,repeated);assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');
  ok(true,'one exact adaptation preserves all prior rows/ACL/attributes with durable and verify-only repetition');
  await sql('SELECT native_employment_catalog_capacity_v1(629145600)');
  for(const extra of['NULL','-1','1073741824'])await sql(expectCapacity(extra));
  ok(true,'verified 1 GiB budget admits an estimate above the old ceiling and still rejects null, negative and over-budget estimates');
  const privateFunction=await db.run("SELECT to_jsonb(has_function_privilege('municontrol_actions_runtime_app',"+q(qa.schema+'.native_employment_catalog_capacity_v1(integer)')+",'EXECUTE'))");assert.equal(privateFunction,false);
  ok(true,'runtime role cannot call the private capacity helper directly');
  setActor(qa.actors.maker);const b=await request('catalog'),items=structuredClone(b.catalog.items),beforeEmployees=await db.run('SELECT to_jsonb(count(*)) FROM native_employee_registration');
  for(let i=0;items.length<289;i++)items.push({kind:'organizations',key:'organizations::'+String(97000000+i),code:String(97000000+i),label:'Referencia exclusivamente sintética QA '+i,agreementCode:null,registrationAllowed:false});
  assert.equal(items.length,289);const body={scopeVersion:b.scopeVersion,baseVersion:b.catalog.version,items:catalogItems(items),reason:'Catálogo completo exclusivamente sintético QA'},key=randomUUID();
  const p=await request('catalog',{operation:'propose',body,key,expected:201});assert.equal(p.status,'pending');
  const replay=await request('catalog',{operation:'propose',body,key,expected:200});assert.equal(replay.proposalId,p.proposalId);assert.equal(replay.replayed,true);
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM native_employment_catalog_proposal WHERE id='+q(p.proposalId)+'::uuid'),1);
  const retained=await request('catalog',{query:{resource:'proposal',id:p.proposalId}});assert.deepEqual(retained.proposal.items,catalogItems(items));assert.equal(retained.proposal.items.length,289);
  ok(true,'actual HTTP writer stores all 289 synthetic options and idempotent replay keeps one proposal');
  setActor(qa.actors.samePerson);
  const self=await request('catalog',{operation:'review',expected:403,body:{scopeVersion:(await request('catalog')).scopeVersion,proposalId:p.proposalId,decision:'approve',reason:'Independencia exclusivamente sintética QA'}});assert.equal(self.code,'NATIVE_EMPLOYMENT_CATALOG_MAKER_CHECKER_REQUIRED');
  setActor(qa.actors.maker);
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM native_employee_registration'),beforeEmployees);
  ok(true,'the author still cannot approve the catalog and proposing never changes existing employees');
  if(options.browser&&options.browser!=='none'){const{verifyCatalogCapacityBrowser}=await import('./lib/catalog-storage-capacity-browser.mjs');await verifyCatalogCapacityBrowser({...h,browserName:options.browser});}
  const result={version:'catalog-storage-capacity-qa.v1',syntheticOnly:true,productiveBusinessWrites:0,installed,durable,repeated,storedOptions:289,originalCeilingReproduced:true,overBudgetRefused:true,privateHelperPreserved:true,independentDecisionRequired:true};fs.writeFileSync(path.join(h.destination,'catalog-storage-capacity-proof.json'),JSON.stringify(result,null,2)+'\n');return result;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
 try{const r=await verifyCatalogStorageCapacity({major:Number(o.major),transport:o.transport,sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
