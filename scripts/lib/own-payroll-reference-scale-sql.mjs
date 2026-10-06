// One conservative adaptation of the published program validator. No resolver,
// imported formula, new facade, nominal write, table or capability assignment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin,OWN_INSTALL_SHA} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
export function buildOwnReferenceScaleSql(read){
 const original=read('scripts/migrations/122-own-payroll-programs.sql').replace(/\r\n?/g,'\n');assert.equal(hash(original),OWN_INSTALL_SHA[122]);
 const statements=splitPostgresStatements(original),prior=statements.find(s=>s.startsWith('CREATE FUNCTION public.own_program_definition_v1('));assert.ok(prior);
 let adapted=prior.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 const once=(a,b)=>{assert.equal(adapted.split(a).length,2,'Published validator anchor changed');adapted=adapted.replace(a,()=>b);};
 once("IF NOT public.own_program_exact_v1(b,ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'])", "IF NOT public.own_program_exact_v1(b,CASE WHEN b->>'sourceKind'='scale_reference' THEN ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference','sourceAgreementCode','sourceCategoryCode'] ELSE ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'] END)");
 once("IN('parameter','scale','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount')", "IN('parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount')");
 once("IF b->>'sourceKind' IN('parameter','scale')", "IF b->>'sourceKind'='scale_reference' AND(jsonb_typeof(b->'sourceAgreementCode') IS DISTINCT FROM 'string' OR b->>'sourceAgreementCode'!~'^[0-9]{1,9}$' OR jsonb_typeof(b->'sourceCategoryCode') IS DISTINCT FROM 'string' OR b->>'sourceCategoryCode'!~'^[0-9]{1,9}$') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;\n  IF b->>'sourceKind' IN('parameter','scale','scale_reference')");
 const moneyKinds="IN('scale','monthly_amount','fixed_amount')";assert.equal(adapted.split(moneyKinds).length,3);adapted=adapted.replaceAll(moneyKinds,()=>"IN('scale','scale_reference','monthly_amount','fixed_amount')");
 once("d->>'agreementCode'=b->>'agreementCode'", "d->>'agreementCode'=CASE WHEN b->>'sourceKind'='scale_reference' THEN b->>'sourceAgreementCode' ELSE b->>'agreementCode' END AND(b->>'sourceKind'<>'scale_reference' OR d->>'categoryCode'=b->>'sourceCategoryCode')");
 once("CASE WHEN b->>'sourceKind'='scale' THEN 'scale' ELSE 'concept' END", "CASE WHEN b->>'sourceKind' IN('scale','scale_reference') THEN 'scale' ELSE 'concept' END");
 const oldPin=ownInstallationFunctionPin(prior),newPin=ownInstallationFunctionPin(adapted);
 const guard=pinsCheck([oldPin],'SQL131_PREREQUISITE_CHANGED'),afterPins=pinsCheck([newPin],'SQL131_METADATA_CHANGED');
 const migration='-- SQL131: explicit approved reference scale; only the program validator changes.\n'+guard+';\n'+adapted+';\n';
 return {prior,adapted,oldPin,newPin,migration,guard,afterPins};
}
export function buildOwnReferenceScaleInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);const sql=buildOwnReferenceScaleSql(read),source=read('scripts/migrations/131-own-payroll-reference-scale.sql').replace(/\r\n?/g,'\n');assert.equal(source,sql.migration,'SQL131 is not the reviewed adaptation');
 const snapshot=slot=>preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("s.nspname='public' AND p.proname LIKE 'native_leave_%'","s.nspname='public' AND p.proname='own_program_definition_v1'").replaceAll('municontrol_sql111.','municontrol_sql131.');
 const before=snapshot('before'),after=snapshot('after');
 const audit="DO $audit$ BEGIN IF current_setting('municontrol_sql131.before')::jsonb IS DISTINCT FROM current_setting('municontrol_sql131.after')::jsonb THEN RAISE EXCEPTION 'SQL131_PRIOR_STATE_CHANGED';END IF;END $audit$";
 // CREATE OR REPLACE retains the original OID/owner/ACL; verify that metadata
 // too, excluding only the exact reviewed function body from this comparison.
 const meta=slot=>`SELECT set_config('municontrol_sql131.meta_${slot}',(SELECT(to_jsonb(p)-'prosrc')::text FROM pg_proc p WHERE oid='public.own_program_definition_v1(jsonb,jsonb)'::regprocedure),true)`;
 const metaAudit="DO $meta$ BEGIN IF current_setting('municontrol_sql131.meta_before') IS DISTINCT FROM current_setting('municontrol_sql131.meta_after') THEN RAISE EXCEPTION 'SQL131_FUNCTION_SECURITY_CHANGED';END IF;END $meta$";
 const proof=installed=>`SELECT jsonb_build_object('sourceCommit',${q(sourceCommit)},'sql131Sha256',${q(hash(source))},'allChecksPassed',true,'newTables',0,'newFunctions',0,'validatorsAdapted',1,'roleAssignmentsAdded',0,'nominalRowsReturned',0,${installed?"'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql131.before'),'sha256'),'hex'),":''}'afterFingerprint',encode(public.digest(current_setting('municontrol_sql131.after'),'sha256'),'hex'),'functionSha256',${q(sql.newPin.sha256)}) AS proof`;
 return {...sql,sourceCommit,sql131Sha256:hash(source),installation:[sql.guard,before,meta('before'),sql.adapted,after,meta('after'),audit,metaAudit,sql.afterPins,proof(true)],durableVerification:[after,sql.afterPins,proof(false)]};
}
export function assertOwnReferenceScaleDurability({installed,durable,batch}){
 assert.equal(installed.sourceCommit,batch.sourceCommit);assert.equal(installed.sql131Sha256,batch.sql131Sha256);assert.equal(installed.functionSha256,batch.newPin.sha256);assert.equal(installed.allChecksPassed,true);
 for(const key of ['newTables','newFunctions','roleAssignmentsAdded','nominalRowsReturned'])assert.equal(installed[key],0);assert.equal(installed.validatorsAdapted,1);
 assert.equal(installed.beforeFingerprint,installed.afterFingerprint);assert.deepEqual(durable,Object.fromEntries(Object.entries(installed).filter(([k])=>k!=='beforeFingerprint')));
 return {priorRowsAndSecurityPreserved:true,independentDurabilityVerified:true,roleAssignmentsAdded:0,nominalRowsReturned:0};
}
