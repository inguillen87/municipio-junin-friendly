// Evolves the installed 011 catalog; it does not enable an attendance evaluator.
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';

export const NATIVE_TIME_PATCHES = Object.freeze([
  ['time_catalog_assert_actor_authority_v1', 'jsonb,text'],
  ['time_catalog_assert_person_sod_v1', 'uuid,uuid,uuid'],
  ['time_catalog_guard_entry_v1', ''],
  ['time_catalog_assert_approvable_v1', 'uuid,uuid,uuid'],
]);
const hash = s => createHash('sha256').update(s).digest('hex');
export function timeFunction(source, name) {
  const matches = splitPostgresStatements(source.replaceAll('\r\n', '\n')).filter(s => new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\(`).test(s));
  if (matches.length !== 1) throw Error('TIME_CATALOG_SOURCE_AMBIGUOUS');
  const definition = matches[0], a = definition.indexOf('$$'), b = definition.lastIndexOf('$$');
  if (a < 0 || b <= a) throw Error('TIME_CATALOG_SOURCE_INVALID');
  return {definition, body: definition.slice(a + 2, b)};
}
const replaceOnce = (source, old, next) => {
  if (source.split(old).length !== 2) throw Error('TIME_CATALOG_PATCH_DRIFT');
  return source.replace(old, next);
};
export function nativeTimeDefinitions(source) {
  const originals = Object.fromEntries(NATIVE_TIME_PATCHES.map(([name]) => [name, timeFunction(source, name)]));
  const definitions = {};
  let d = originals.time_catalog_assert_actor_authority_v1.definition;
  const actorStart = '  SELECT link.employment_contract_id, contract.person_id\n';
  const actorEnd = "  PERFORM time_catalog_assert_person_sod_v1(\n";
  const a = d.indexOf(actorStart), b = d.indexOf(actorEnd, a);
  if (a < 0 || b < 0) throw Error('TIME_CATALOG_PATCH_DRIFT');
  const oldActor = d.slice(a, b);
  d = replaceOnce(d, oldActor, `  IF EXISTS (
    SELECT 1 FROM tenant_action_employment_link link
    JOIN employment_contract contract ON contract.id=link.employment_contract_id
    WHERE link.membership_id=(p_context->>'membershipId')::uuid
      AND link.tenant_id=(p_context->>'tenantId')::uuid
      AND link.source_binding_id=(p_context->>'certifiedBindingId')::uuid
      AND link.active IS TRUE AND contract.source_system='MUNICONTROL'
  ) THEN
    actor_person_id:=public.time_catalog_native_actor_v2(
      (p_context->>'tenantId')::uuid,(p_context->>'certifiedBindingId')::uuid,
      (p_context->>'membershipId')::uuid);
  ELSE
${oldActor}  END IF;

`);
  definitions.time_catalog_assert_actor_authority_v1 = d;

  d = originals.time_catalog_assert_person_sod_v1.definition;
  const installedSodLine="  IF (has_propose AND has_approve AND NOT public.tenant_iam_operational_person_pair_v1(p_tenant_id,p_actor_person_id,p_certified_binding_id,'catalog')) OR (has_approve AND has_overtime_post) THEN";
  const originalSodLine='  IF (has_propose AND has_approve) OR (has_approve AND has_overtime_post) THEN';
  const sodLine=d.includes(installedSodLine)?installedSodLine:originalSodLine;
  const governedSodLine=sodLine===installedSodLine
    ? sodLine.replace('AND NOT public.tenant_iam_operational_person_pair_v1',"AND (capabilities_native<>'[]'::jsonb OR NOT public.tenant_iam_operational_person_pair_v1").replace("'catalog')) OR", "'catalog'))) OR")
    : sodLine;
  d = replaceOnce(d, sodLine, `  -- Merge native accounts with the original GRH result. Neither origin can
  -- split proposal, approval or payroll posting across accounts of one person.
  capabilities_native:=public.time_catalog_native_person_caps_v2(
    p_tenant_id,p_actor_person_id,p_certified_binding_id);
  has_propose:=has_propose OR (capabilities_native ? 'time.catalog.propose');
  has_approve:=has_approve OR (capabilities_native ? 'time.catalog.approve');
  has_overtime_post:=has_overtime_post OR (capabilities_native ? 'time.overtime.post');
${governedSodLine}`);
  d = replaceOnce(d, '  related_membership_id uuid;', '  related_membership_id uuid;\n  capabilities_native jsonb;');
  definitions.time_catalog_assert_person_sod_v1 = d;

  d = originals.time_catalog_guard_entry_v1.definition;
  const insertStart = '    PERFORM 1\n    FROM tenant_membership membership\n';
  const insertEnd = '    RETURN NEW;\n';
  const c = d.indexOf(insertStart), e = d.indexOf(insertEnd, c);
  if (c < 0 || e < 0) throw Error('TIME_CATALOG_PATCH_DRIFT');
  const oldGuard = d.slice(c, e);
  d = replaceOnce(d, oldGuard, `    IF EXISTS (
      SELECT 1 FROM tenant_action_employment_link link
      JOIN employment_contract contract ON contract.id=link.employment_contract_id
      WHERE link.membership_id=NEW.proposer_membership_id
        AND link.tenant_id=NEW.tenant_id
        AND link.source_binding_id=NEW.certified_binding_id
        AND link.active IS TRUE AND contract.source_system='MUNICONTROL'
    ) THEN
      IF public.time_catalog_native_actor_v2(NEW.tenant_id,NEW.certified_binding_id,
        NEW.proposer_membership_id) IS DISTINCT FROM NEW.proposer_person_id THEN
        RAISE EXCEPTION 'TIME_CATALOG_PROPOSER_INVALID' USING ERRCODE='P0001';
      END IF;
    ELSE
${oldGuard}    END IF;
`);
  d = replaceOnce(d, "    IF NOT FOUND THEN\n      RAISE EXCEPTION 'TIME_CATALOG_APPROVER_INVALID' USING ERRCODE = 'P0001';\n    END IF;", `    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_APPROVER_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM tenant_action_employment_link link
      JOIN employment_contract contract ON contract.id=link.employment_contract_id
      WHERE link.membership_id=NEW.approver_membership_id AND link.tenant_id=NEW.tenant_id
        AND link.source_binding_id=NEW.certified_binding_id AND link.active IS TRUE
        AND contract.source_system='MUNICONTROL') THEN
      IF public.time_catalog_native_actor_v2(NEW.tenant_id,NEW.certified_binding_id,
        NEW.approver_membership_id) IS DISTINCT FROM NEW.approver_person_id THEN
        RAISE EXCEPTION 'TIME_CATALOG_APPROVER_INVALID' USING ERRCODE='P0001';
      END IF;
    END IF;`);
  definitions.time_catalog_guard_entry_v1 = d;

  d = originals.time_catalog_assert_approvable_v1.definition;
  const assignmentStart = '    PERFORM 1\n    FROM platform_tenant_source_binding binding\n';
  const assignmentEnd = '    PERFORM 1\n    FROM time_catalog_entry shift_entry\n';
  const f = d.indexOf(assignmentStart), g = d.indexOf(assignmentEnd, f);
  if (f < 0 || g < 0) throw Error('TIME_CATALOG_PATCH_DRIFT');
  const oldAssignment = d.slice(f, g);
  d = replaceOnce(d, oldAssignment, `    IF EXISTS (SELECT 1 FROM employment_contract contract
      WHERE contract.id=assignment_row.employment_contract_id
        AND contract.source_system='MUNICONTROL') THEN
      PERFORM public.time_catalog_native_subject_v2(entry_row.tenant_id,
        entry_row.certified_binding_id,assignment_row.employment_contract_id,
        entry_row.effective_from,entry_row.effective_to);
    ELSE
${oldAssignment}    END IF;
`);
  definitions.time_catalog_assert_approvable_v1 = d;
  return NATIVE_TIME_PATCHES.map(([name, args]) => ({name, args, oldSha: hash(originals[name].body), definition: definitions[name], newSha: hash(timeFunction(definitions[name], name).body)}));
}

export function nativeTimeMigration(source, helpers, dependencies) {
  const patches = nativeTimeDefinitions(source);
  if (!Array.isArray(dependencies) || dependencies.length !== 8 || dependencies.some(p => !p.signature || !/^[a-f0-9]{64}$/.test(p.sha256))) throw Error('TIME_CATALOG_DEPENDENCIES_REQUIRED');
  const pins = [...patches.map(p => ({signature: `${p.name}(${p.args})`, sha256:p.oldSha})), ...dependencies].map(p => ` ('${p.signature}','${p.sha256}')`).join(',\n');
  const prerequisites = `-- SQL116: native actors and subjects in the existing temporal catalog.
-- No new tables, runtime privileges, account grants, punches, rules or payroll writes.
-- Whole transaction only. A second installation or unknown body fails closed.
DO $prerequisite$
DECLARE item record; actual text;
BEGIN
 IF to_regprocedure('public.time_catalog_native_subject_v2(uuid,uuid,uuid,date,date)') IS NOT NULL
   OR to_regprocedure('public.time_catalog_native_actor_v2(uuid,uuid,uuid)') IS NOT NULL
   OR to_regprocedure('public.time_catalog_native_person_caps_v2(uuid,uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'TIME_CATALOG_NATIVE_ALREADY_INSTALLED'; END IF;
 IF to_regprocedure('public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)') IS NULL
   OR to_regprocedure('public.native_employment_lifecycle_range_v1(jsonb,uuid,date,date,boolean)') IS NULL
   OR to_regclass('public.native_employee_registration') IS NULL
   OR to_regclass('public.native_employment_lifecycle_review') IS NULL
 THEN RAISE EXCEPTION 'TIME_CATALOG_NATIVE_PREREQUISITE'; END IF;
 FOR item IN SELECT * FROM (VALUES
${pins}
 ) pin(signature,sha256) LOOP
  SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO actual
  FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||item.signature)
    AND p.prosecdef AND p.proowner=current_user::regrole
    AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS FALSE;
  IF actual IS DISTINCT FROM item.sha256 THEN RAISE EXCEPTION 'TIME_CATALOG_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
END $prerequisite$;
`;
  return prerequisites + '\n' + helpers.replaceAll('\r\n', '\n') + '\n' + patches.map(p => p.definition.trimEnd().replace(/;$/, '')+';').join('\n\n') + '\n';
}
