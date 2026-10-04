// Independently reconstruct and pin every exact existing function adaptation.
// Pure source review: no connection, execution, credentials or municipal data.
import assert from 'node:assert/strict';
import {splitPostgresStatements} from './sql-statements.mjs';
import {functionPin} from './native-leave-installation.mjs';

export const MONTHLY_CORRECTION_CHANGED_CONSTRAINTS=Object.freeze(['payroll_novelty_batch_reason_ck','payroll_novelty_event_command_ck','payroll_novelty_event_decider_person_ck','payroll_novelty_event_authority_ck']);
const names=['payroll_novelty_batch_guard_v1','payroll_novelty_event_guard_v1','payroll_novelty_row_guard_v1','payroll_novelty_issue_guard_v1','payroll_novelty_snapshot_v1','payroll_novelty_event_snapshot_v1','payroll_novelty_event_snapshot_v2','payroll_novelty_prepare_v1','payroll_novelty_prepare_v2'];
const beforeHashes=['c84068e1f00cf66dcb66c2715130992debde3537d1387a32d844457a2594d7c0','3417116ae720b4eee61cf40b1a997d442e328ce6447c0b05eb026ef05dc4407a','3ccc695b5e2df3420f8d24f63ffd2cfe0ad4731245b955f0be0ace7293e96769','fbfc320c6a4a954267cc47ae69faba178c2fcb922075da5180afd31a7809da08','6469405c512f3c5b7e8319eeda443561dbabe7b789865f8d23709adca9bd70fd','3557d92e282e4d48a820c2e6f40043d7b7e554d5e4e81653b8618b49e7d239fc','4981da91247b56661fe50f2d785343bd709fa65432d6cb319f6beb4f05aa3c61','ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613','1c0af0647c19b7cadcaded6239ec06e97c0463bd26ef5304cc768e9dd557aab8'];
const replaceOnce=(source,needle,value)=>{assert.equal(source.split(needle).length,2,'SQL121_GUARD_NEEDLE_DRIFT');return source.replace(needle,()=>value);};
export function buildMonthlyCorrectionGuardPins(read){
 const base=splitPostgresStatements(read('scripts/migrations/026-governed-payroll-novelties.sql').replace(/\r\n?/g,'\n'));
 const native=splitPostgresStatements(read('scripts/migrations/101-native-monthly-novelties.sql').replace(/\r\n?/g,'\n'));
 let definitions=names.map(name=>{const sources=['payroll_novelty_row_guard_v1','payroll_novelty_event_snapshot_v2','payroll_novelty_prepare_v2'].includes(name)?native:base;
  const matches=sources.filter(s=>s.includes('CREATE OR REPLACE FUNCTION public.'+name+'('));assert.equal(matches.length,1,name);return matches[0];});
 // Reconstruct the already installed SQL120 adaptations, then verify their pins.
 definitions[0]=replaceOnce(definitions[0],'BEGIN\n  IF NEW.grh_mutation',"BEGIN\n  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status = 'cancelled' THEN\n    RETURN public.payroll_monthly_annul_batch_guard_v1(OLD,NEW);\n  END IF;\n  IF NEW.grh_mutation");
 definitions[1]=replaceOnce(definitions[1],'BEGIN\n  SELECT * INTO batch_row',"BEGIN\n  IF NEW.command = 'annul' THEN\n    PERFORM public.payroll_monthly_annul_event_authority_v1(NEW);\n  END IF;\n  SELECT * INTO batch_row");
 definitions[1]=replaceOnce(definitions[1],"    OR (NEW.command = 'cancel'","    OR (NEW.command = 'annul' AND NEW.from_status = 'approved'\n      AND NEW.to_status = 'cancelled')\n    OR (NEW.command = 'cancel'");
 // Exact already-published 029, 032 and 097 adaptations of historical prepare.
 definitions[7]=replaceOnce(definitions[7],"'monthly','sac','vacation','supplementary','final','other'","'monthly','first_fortnight','sac','vacation','supplementary','final','other'");
 definitions[7]=replaceOnce(definitions[7],"AND lower(COALESCE(equal_movement.payroll_type, '')) = p_payroll_type",'AND public.payroll_type_canonical_v1(equal_movement.source_system, equal_movement.payroll_type) = p_payroll_type');
 definitions[7]=replaceOnce(definitions[7],"AND lower(COALESCE(movement.payroll_type, '')) = p_payroll_type",'AND public.payroll_type_canonical_v1(movement.source_system, movement.payroll_type) = p_payroll_type');
 const mapping=read('scripts/migrations/032-payroll-type-mapping-fail-closed.sql').replace(/\r\n?/g,'\n'),unresolved=/unresolved_guard constant text := \$guard\$([\s\S]+?)\$guard\$;/.exec(mapping)?.[1];assert.ok(unresolved);
 definitions[7]=replaceOnce(definitions[7],'  INSERT INTO public.payroll_novelty_event (\n',unresolved+'  INSERT INTO public.payroll_novelty_event (\n');
 definitions[7]=definitions[7].replaceAll('public.employment_movement','public.grh_effective_employment_movement_v1');
 const beforePins=definitions.map(functionPin).map(p=>({...p,runtime:p.name.startsWith('payroll_novelty_prepare_')}));
 beforePins.forEach((p,i)=>assert.equal(p.sha256,beforeHashes[i],'SQL121_PREREQUISITE_SOURCE_DRIFT: '+p.name));
 const after=[...definitions];
 after[0]=replaceOnce(after[0],'BEGIN\n  IF TG_OP',"BEGIN\n  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status = 'approved' AND NEW.reason_code = 'corrected_after_review' THEN\n    RETURN public.payroll_monthly_correction_batch_guard_v1(OLD,NEW);\n  END IF;\n  IF TG_OP");
 after[1]=replaceOnce(after[1],'BEGIN\n  IF NEW.command',"BEGIN\n  IF NEW.command = 'correct' THEN\n    PERFORM public.payroll_monthly_correction_event_authority_v1(NEW);\n  END IF;\n  IF NEW.command");
 after[1]=replaceOnce(after[1],"    OR (NEW.command = 'annul'","    OR (NEW.command = 'correct' AND NEW.from_status = 'approved'\n      AND NEW.to_status = 'approved')\n    OR (NEW.command = 'annul'");
 after[2]=replaceOnce(after[2],'BEGIN\n  IF TG_OP',"BEGIN\n  IF TG_OP = 'UPDATE' THEN\n    RETURN public.payroll_monthly_correction_row_guard_v1(OLD,NEW);\n  END IF;\n  IF TG_OP");
 after[3]=replaceOnce(after[3],'BEGIN\n  IF TG_OP',"BEGIN\n  IF TG_OP = 'INSERT' AND NEW.correction_review_id IS NOT NULL THEN\n    RETURN public.payroll_monthly_correction_issue_guard_v1(NEW);\n  END IF;\n  IF TG_OP");
 for(const needle of ['AND issue.is_blocking IS TRUE','AND issue.is_blocking IS FALSE','AND issue.row_id = row_value.id'])after[4]=replaceOnce(after[4],needle,needle+' AND COALESCE(issue.correction_version,1)=public.payroll_monthly_correction_issue_version_v1(batch.id,batch.tenant_id,batch.version)');
 after[5]=replaceOnce(after[5],'  SELECT public.payroll_novelty_snapshot_v1(\n    event.batch_id, event.tenant_id, p_include_nominal\n  )','  SELECT public.payroll_monthly_correction_event_values_v1(public.payroll_novelty_snapshot_v1(\n    event.batch_id, event.tenant_id, p_include_nominal\n  ),event.batch_id,event.tenant_id,event.resulting_version,p_include_nominal)');
 after[5]=replaceOnce(after[5],"updatedAt', event.occurred_at","updatedAt', event.occurred_at, 'submittedAt', (SELECT min(s.occurred_at) FROM public.payroll_novelty_event s WHERE s.batch_id=event.batch_id AND s.tenant_id=event.tenant_id AND s.command='submit' AND s.resulting_version<=event.resulting_version), 'decidedAt', (SELECT max(d.occurred_at) FROM public.payroll_novelty_event d WHERE d.batch_id=event.batch_id AND d.tenant_id=event.tenant_id AND d.command IN('approve','reject','cancel','annul','correct') AND d.resulting_version<=event.resulting_version)");
 after[6]=replaceOnce(after[6],"'decidedAt',(SELECT min(occurred_at)","'decidedAt',(SELECT max(occurred_at)");
 after[6]=replaceOnce(after[6],"command IN ('approve','reject','cancel')","command IN ('approve','reject','cancel','annul','correct')");
 for(const i of [7,8])after[i]=replaceOnce(after[i],"    IF existing_event.command <> 'prepare'",`    DECLARE original_source jsonb; BEGIN
      original_source:=public.payroll_monthly_correction_prepare_history_v1(existing_batch.id,existing_batch.tenant_id,existing_batch.certified_binding_id);
      IF original_source IS NOT NULL THEN
        existing_batch:=jsonb_populate_record(NULL::public.payroll_novelty_batch,original_source->'batch');
        stored_rows:=original_source->'rows';
      END IF;
    END;
    IF existing_event.command <> 'prepare'`);
 const afterPins=after.map(functionPin).map(p=>({...p,runtime:p.name.startsWith('payroll_novelty_prepare_')}));
 afterPins.forEach((p,i)=>{assert.notEqual(p.sha256,beforePins[i].sha256);assert.deepEqual({...p,sha256:null},{...beforePins[i],sha256:null},'SQL121_FUNCTION_METADATA_CHANGED');});
 return {beforePins,afterPins,definitions,afterDefinitions:after};
}
