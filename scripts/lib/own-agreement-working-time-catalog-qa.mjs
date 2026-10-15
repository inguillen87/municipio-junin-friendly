// Disposable QA prerequisite only. The source builder is canonical167; this
// module does not alter any production installation, actor, role or identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildClassificationRegistrationUseInstallation,assertClassificationUseDurability} from './classification-registration-use-installation.mjs';
import {CLASSIFICATION_USE_ADMINISTRATIVE_PIN} from './classification-registration-use-pins.mjs';
import {ADOPTION_ADMINISTRATIVE_CONTEXT} from './adoption-administrative-identity-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {catalogDeclareRegistration} from '../../assets/native-employment-catalog-model.js';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
const j=v=>q(JSON.stringify(v))+'::jsonb';

export function buildAgreementWorkingTimeCatalogQa({read,sourceCommit,schema,relocate}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof relocate,'function');
 assert.equal(relocate('public.native_employee_create_v1'),schema+'.native_employee_create_v1','AGREEMENT_CATALOG_QA_RELOCATION_REQUIRED');
 const batch=buildClassificationRegistrationUseInstallation({read,sourceCommit});
 assert.deepEqual({...ownInstallationFunctionPin(ADOPTION_ADMINISTRATIVE_CONTEXT),runtime:false},CLASSIFICATION_USE_ADMINISTRATIVE_PIN);
 // Exactly the alias normalization used by verify-classification-registration-
 // use. Both independent body checks survive disposable-schema relocation.
 const canonical=relocate("replace(p.prosrc,E'\\r\\n',E'\\n')");
 const normalize=s=>['updated','f'].reduce((v,alias)=>v.replaceAll("replace("+alias+".prosrc,E'\\r\\n',E'\\n')",canonical.replaceAll('p.prosrc',alias+'.prosrc')),relocate(s));
 const beforeCheck=normalize(batch.beforeCheck),afterCheck=normalize(batch.afterCheck),prerequisite=normalize(batch.prerequisite);
 const statements=batch.statements.map(s=>s===batch.choose?`DO $choose$ BEGIN IF current_setting('municontrol_classification_use.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`:s===batch.apply?`DO $apply$ BEGIN IF current_setting('municontrol_classification_use.mode')='install' THEN EXECUTE ${q(normalize(batch.mutations[0]))};END IF;END $apply$`:normalize(s));
 const signature=schema+'.employment_adoption_administrative_context_v1(jsonb,text)';
 const helper=normalize(`DO $qa_helper$ BEGIN IF to_regprocedure(${q('public.employment_adoption_administrative_context_v1(jsonb,text)')}) IS NULL THEN EXECUTE ${q(ADOPTION_ADMINISTRATIVE_CONTEXT)};REVOKE ALL ON FUNCTION public.employment_adoption_administrative_context_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;END IF;END $qa_helper$`);
 const helperCheck=normalize(pinsCheck([CLASSIFICATION_USE_ADMINISTRATIVE_PIN],'AGREEMENT_CATALOG_QA_HELPER_CHANGED'));
 const guard=`DO $qa_destination$ BEGIN IF current_database()<>'own_payroll_run_qa' OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL OR to_regnamespace(${q(schema)}) IS NULL THEN RAISE EXCEPTION 'AGREEMENT_CATALOG_QA_ONLY';END IF;END $qa_destination$`;
 return{batch,guard,helper,helperCheck,signature,prerequisite,beforeCheck,afterCheck,statements,verification:batch.verification.map(normalize),connects:false,executesSql:false};
}

export async function runAgreementWorkingTimeCatalogQa(h){
 const {qa,db,sql,relocate,ok}=h,fixture=buildAgreementWorkingTimeCatalogQa({...h.options,schema:qa.schema,relocate}),{batch}=fixture;
 const preface='BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL search_path=pg_catalog,'+qa.schema+',public,pg_temp;DO $destination$ BEGIN '+qa.pins+' END $destination$;'+fixture.guard+';';
 const missing=await db.run('SET TRANSACTION READ ONLY;SELECT to_jsonb(to_regprocedure('+q(fixture.signature)+') IS NULL)');
 if(missing){await assert.rejects(()=>sql(preface+fixture.prerequisite+';ROLLBACK;'),/CLASSIFICATION_USE_ADMINISTRATIVE_PREREQUISITE/);ok(true,'canonical167 refuses its absent private administrative prerequisite before fixture setup');}
 // Reproduce this already-published private helper only in the old disposable
 // foundation, without replacing an existing helper or granting runtime access.
 await sql(preface+fixture.helper+';'+fixture.helperCheck+';COMMIT;');
 const before=await db.run("SET TRANSACTION READ ONLY;SELECT jsonb_build_object('contract',to_jsonb(c),'link',to_jsonb(l)) FROM tenant_action_employment_link l JOIN employment_contract c ON c.id=l.employment_contract_id WHERE l.membership_id="+q(qa.actors.maker.membershipId)+'::uuid');
 assert.equal(before.contract.status,'inactive');
 const rehearsal=await sql(preface+fixture.statements.join(';')+';ROLLBACK;');assert.equal(rehearsal.mode,'install');await sql(preface+fixture.beforeCheck+';'+fixture.helperCheck+';ROLLBACK;');
 const installed=await sql(preface+fixture.statements.join(';')+';COMMIT;'),durable=await sql(preface.replace('REPEATABLE READ;','REPEATABLE READ READ ONLY;')+fixture.verification.join(';')+';COMMIT;'),repeated=await sql(preface+fixture.statements.join(';')+';COMMIT;');
 assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');assertClassificationUseDurability(installed,durable);assertClassificationUseDurability(installed,repeated);
 const after=await db.run("SET TRANSACTION READ ONLY;SELECT jsonb_build_object('contract',to_jsonb(c),'link',to_jsonb(l)) FROM tenant_action_employment_link l JOIN employment_contract c ON c.id=l.employment_contract_id WHERE l.membership_id="+q(qa.actors.maker.membershipId)+'::uuid');assert.deepEqual(after,before);
 const context=await db.run('SELECT native_employment_catalog_context_v1('+j(qa.actors.maker)+",'employee.catalog.propose')");assert.equal(context.actorPersonId,qa.ids.makerPerson);assert.equal(context.employmentContractId,null);assert.equal(context.catalogActorVerified,true);
 const bootstrap=await db.run('SELECT native_employment_catalog_bootstrap_v1('+j(qa.actors.maker)+')');assert.equal(bootstrap.permissions.canPropose,true);
 const declared=catalogDeclareRegistration(bootstrap.catalog.items),parsed=await db.run('SELECT native_employment_catalog_items_v1('+j(declared)+')');assert.equal(parsed.length,declared.length);assert.ok(parsed.every(item=>typeof item.registrationAllowed==='boolean'));
 ok(true,'canonical167 preserves the same inactive administrative audit person, actual catalog permissions and complete typed registrationAllowed dictionary');
 const proof={version:'agreement-working-time-catalog-qa.v1',syntheticOnly:true,productionCompatible:false,sourceCommit:batch.sourceCommit,sourceHashes:batch.sourceHashes,missingPrerequisiteRefused:missing,helperPin:CLASSIFICATION_USE_ADMINISTRATIVE_PIN,beforePins:batch.beforePins,afterPins:batch.afterPins,rehearsal,installed,durable,repeated,actorAndEmploymentUnchanged:true,inactiveEmploymentRemainsInactive:true,administrativeAuditPersonPreserved:true,registrationDictionaryParsed:true};
 fs.writeFileSync(path.join(h.destination,'agreement-catalog-prerequisite-proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});return proof;
}
