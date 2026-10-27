// Public source registry for the CLOSED post197→201→213→214→215 epoch.
// No connection, QA seed/graph, normalizer, live catalogue or execution receipt.
// Only real validated208 evidence may later admit209 execution; this registry
// provides source expectations and guards, never a substitute passed receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {ownNoveltySuccessionFunctionPin} from './own-novelty-succession-metadata.mjs';
import {ownNoveltySuccessionHeader,buildOwnNoveltySuccessionInstallation} from './own-novelty-succession-installation.mjs';
import {publicPrerequisiteDefinitions,publicPrerequisiteAclEvidence} from './own-m7-public-schema-batch.mjs';
import {deriveClosedReportAuthorizationSource} from './own-payroll-report-census-authority.mjs';
import {buildMunicipalOwnerAdoptionAuthorityInstallation} from './municipal-owner-adoption-authority-installation.mjs';
import {composeOwnFullCapacity190PublicInstallation} from './own-full-capacity-190-public-installation.mjs';
import {composeOwnCloseSnapshot215Raw} from './own-m7-public-successors213215.mjs';
import {projectOwnFullCapacity190PublicPostflight} from './own-m7-public-successors201-bridge.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
export const OWN_ANNUL209_PUBLIC_REGISTRY_VERSION='own-annul209-public-predecessor-registry.v1';
export const OWN_ANNUL209_PUBLIC_PHASE='post197-post201-post213-post214-post215-before209.v1';
const ROLE='municontrol_actions_runtime_app',DATE='public.payroll_fixed_registry_date_v1(text,boolean)',TABLE='public.tenant_iam_effective_capabilities(uuid)';
const HASH=/^[a-f0-9]{64}$/,q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const SOURCE_PINS=Object.freeze({
 "scripts/lib/own-m7-public-schema-batch.mjs": "cc7c57b5ab83f767736d29922f4cd0959ed8d521582b29163ada491cd7a5b6de",
 "scripts/lib/own-novelty-succession-installation.mjs": "627ffea8e252311f31b87abe46346bd76578e583de34b606a74aa53eacb494d0",
 "scripts/lib/own-novelty-succession-metadata.mjs": "cb9b87bfd695a67f978dee540c3fef3bd3eb0256cfdfdac0adc998c97a56b845",
 "scripts/lib/own-full-capacity-190-public-installation.mjs": "f220a79c990dc7f303fe52c49b3436af9c6b5924a5e1167810d8811127ee5378",
 "scripts/lib/own-m7-public-successors213215.mjs": "3b5e0185975533d7b0752e24ad9f3cb5dac18109a420b4164bd31489fd2db9cb",
 "scripts/lib/own-m7-public-successors201-bridge.mjs": "b8e583dff5ad34d5e54e28cf16b9a23a3a2f963a37d0bd44a92363296abc980c",
 "scripts/lib/municipal-owner-adoption-authority-installation.mjs": "10f5fb42aef999deebb9d43deb0fcc903cb6913a973a93a9ebad95f4f76eb012",
 "scripts/lib/own-payroll-report-census-authority.mjs": "c0e030564bf40762960bc0c08fb7d48d82885dee6fb92a9f193841b73a2277d8",
 "scripts/lib/own-payroll-installation.mjs": "6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0",
 "scripts/lib/native-leave-installation.mjs": "57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef",
 "scripts/lib/sql-statements.mjs": "d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2",
 "scripts/migrations/006-tenant-action-authority.sql": "0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a",
 "scripts/migrations/007-action-center-read-facades.sql": "d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e",
 "scripts/migrations/067-native-employee-registration.sql": "aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749",
 "scripts/migrations/092-payroll-fixed-novelties.sql": "47b30fc484d04f3456e8710b2da04c3cdd19b700ea910ce1ea6a4cd00fa63d49",
 "scripts/migrations/093-native-fixed-novelties.sql": "b77d0d467ae1acac3e0641494ba1c7af316d725a1a58a5f541f3912482b1ad6a",
 "scripts/migrations/095-native-employee-jurisdiction.sql": "48aecdd294bf11ec7f2a956b30eb455f2acc5be7d8825669249fed8ada7d90b5",
 "scripts/migrations/099-grh-curated-consumers.sql": "208ae997983d506d2761c6db6eaf272f367dec1483a9b4cd4d2140d972d1a95d",
 "scripts/migrations/103-native-employment-catalog.sql": "759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6",
 "scripts/migrations/104-native-employment-changes.sql": "0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a",
 "scripts/migrations/110-native-employment-lifecycle.sql": "e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219",
 "scripts/migrations/112-native-salary-definitions.sql": "da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3",
 "scripts/migrations/113-native-employee-self-access.sql": "9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7",
 "scripts/migrations/122-own-payroll-programs.sql": "edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785",
 "scripts/migrations/123-own-payroll-runs.sql": "a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b",
 "scripts/migrations/124-own-payroll-liquidation-decisions.sql": "03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a",
 "scripts/migrations/125-own-payroll-close.sql": "443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5",
 "scripts/migrations/130-own-bulk-novelties.sql": "27bfed41ea1449b964fc8719c4d71a145ba9693b9c86086e2fa5db2fd14a9e4d",
 "scripts/migrations/136-adopted-employment-lifecycle.sql": "577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a",
 "scripts/migrations/137-adopted-operator-context.sql": "b1db803f7d50d6a744cfdf8bf5fcc8af08395ca9b6d67f8704cde4b7eab64d0f",
 "scripts/migrations/146-own-consolidated-annulment.sql": "8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6",
 "scripts/migrations/176-own-payroll-administrative-operator.sql": "f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732",
 "scripts/migrations/184-municipal-owner-adoption-authority.sql": "386088bfb11d620d23957d745530c291bf554f4df5e26b5bc4c3822edaee85e2",
 "scripts/migrations/197-own-novelty-succession.sql": "13ad516bfd653a03b5fae8987486abeef1c13a5d629264b0c680d57c5a5bb43c",
 "scripts/migrations/201-own-full-payroll-decision-capacity.sql": "46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b",
 "scripts/migrations/208-own-annulment-review-index.sql": "2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402",
 "scripts/migrations/209-own-annulment-preparation-projection.sql": "5b0a9896d762f90a25ff84b5d8417d0e178350dd3864b73e47eb5654b2eafd56"
});
const PRIVATE_SCALAR_RULES=Object.freeze([
 {
  "name": "own_run_immutable_v1",
  "signature": "public.own_run_immutable_v1()",
  "file": "scripts/migrations/123-own-payroll-runs.sql",
  "sourceSha256": "a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b",
  "revokeKind": "closed-source-family-do",
  "revokeStatement": "DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_run_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',fn.signature);END LOOP;END $$;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.own_run_bootstrap_v1(jsonb),public.own_run_attempt_v1(jsonb,uuid),public.own_run_capture_v1(jsonb,jsonb,uuid,text),public.own_run_complete_v1(jsonb,uuid,jsonb,jsonb,text) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "own_liquidation_immutable_v1",
  "signature": "public.own_liquidation_immutable_v1()",
  "file": "scripts/migrations/124-own-payroll-liquidation-decisions.sql",
  "sourceSha256": "03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a",
  "revokeKind": "closed-source-family-do",
  "revokeStatement": "DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_liquidation_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',fn.signature);END LOOP;END $$;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.own_liquidation_bootstrap_v1(jsonb),public.own_liquidation_detail_v1(jsonb,uuid),public.own_liquidation_attempt_v1(jsonb,uuid),public.own_liquidation_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "own_close_immutable_v1",
  "signature": "public.own_close_immutable_v1()",
  "file": "scripts/migrations/125-own-payroll-close.sql",
  "sourceSha256": "443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5",
  "revokeKind": "closed-source-family-do",
  "revokeStatement": "DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_close_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',fn.signature);END LOOP;END $$;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.own_close_detail_v1(jsonb,text,text),public.own_close_attempt_v1(jsonb,uuid),public.own_close_group_v1(jsonb,uuid),public.own_close_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "own_annul_immutable_v1",
  "signature": "public.own_annul_immutable_v1()",
  "file": "scripts/migrations/146-own-consolidated-annulment.sql",
  "sourceSha256": "8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6",
  "revokeKind": "closed-source-family-do",
  "revokeStatement": "DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_annul_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',fn.signature);END LOOP;END $$;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.own_annul_detail_v1(jsonb,text,text),public.own_annul_attempt_v1(jsonb,uuid),public.own_annul_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "native_salary_context_v1",
  "signature": "public.native_salary_context_v1(jsonb)",
  "file": "scripts/migrations/112-native-salary-definitions.sql",
  "sourceSha256": "da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.native_salary_immutable_v1(),public.native_salary_serialized_v1(jsonb),public.native_salary_row_key_v1(jsonb),public.native_salary_items_v1(jsonb),public.native_salary_context_v1(jsonb),public.native_salary_scope_v1(jsonb),public.native_salary_lock_v1(jsonb),public.native_salary_catalog_v1(jsonb),public.native_salary_proposal_v1(jsonb,public.native_salary_event),public.native_salary_bootstrap_v1(jsonb),public.native_salary_attempt_v1(jsonb,uuid),public.native_salary_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.native_salary_bootstrap_v1(jsonb),public.native_salary_attempt_v1(jsonb,uuid),public.native_salary_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "payroll_fixed_registry_subject_by_contract_v1",
  "signature": "public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)",
  "file": "scripts/migrations/093-native-fixed-novelties.sql",
  "sourceSha256": "b77d0d467ae1acac3e0641494ba1c7af316d725a1a58a5f541f3912482b1ad6a",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean),public.payroll_fixed_registry_native_dates_v1(jsonb,uuid,jsonb),\n public.payroll_fixed_registry_employee_by_contract_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_employee_by_contract_v1(jsonb,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "payroll_fixed_registry_subject_v1",
  "signature": "public.payroll_fixed_registry_subject_v1(jsonb,text,boolean)",
  "file": "scripts/migrations/092-payroll-fixed-novelties.sql",
  "sourceSha256": "47b30fc484d04f3456e8710b2da04c3cdd19b700ea910ce1ea6a4cd00fa63d49",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.payroll_fixed_registry_immutable_v1(),public.payroll_fixed_registry_context_v1(jsonb,text),public.payroll_fixed_registry_lock_v1(jsonb),public.payroll_fixed_registry_capacity_v1(),\n public.payroll_fixed_registry_effects_v1(),public.payroll_fixed_registry_date_v1(text,boolean),public.payroll_fixed_registry_text_v1(text,integer,integer),public.payroll_fixed_registry_subject_v1(jsonb,text,boolean),\n public.payroll_fixed_registry_identity_current_v1(jsonb,public.payroll_fixed_novelty),public.payroll_fixed_registry_proposal_json_v1(jsonb,public.payroll_fixed_novelty_event,boolean),\n public.payroll_fixed_registry_record_json_v1(jsonb,public.payroll_fixed_novelty),public.payroll_fixed_registry_validate_values_v1(jsonb),public.payroll_fixed_registry_receipt_v1(public.payroll_fixed_novelty_event,boolean),\n public.payroll_fixed_registry_event_identity_v1(jsonb,public.payroll_fixed_novelty_event),public.payroll_fixed_registry_bootstrap_v1(jsonb),public.payroll_fixed_registry_employee_v1(jsonb,text),\n public.payroll_fixed_registry_list_v1(jsonb,date),public.payroll_fixed_registry_detail_v1(jsonb,uuid),public.payroll_fixed_registry_attempt_v1(jsonb,text,uuid),\n public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid),public.payroll_fixed_registry_review_v1(jsonb,jsonb,uuid),public.payroll_fixed_registry_export_v1(jsonb,date,text)\n FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_bootstrap_v1(jsonb),public.payroll_fixed_registry_employee_v1(jsonb,text),public.payroll_fixed_registry_list_v1(jsonb,date),\n public.payroll_fixed_registry_detail_v1(jsonb,uuid),public.payroll_fixed_registry_attempt_v1(jsonb,text,uuid),public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid),\n public.payroll_fixed_registry_review_v1(jsonb,jsonb,uuid),public.payroll_fixed_registry_export_v1(jsonb,date,text) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "native_employment_change_lock_v1",
  "signature": "public.native_employment_change_lock_v1(jsonb,uuid)",
  "file": "scripts/migrations/104-native-employment-changes.sql",
  "sourceSha256": "0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.native_employment_change_immutable_v1(),\n public.native_employment_change_context_v1(jsonb,text),\n public.native_employment_change_lock_v1(jsonb,uuid),\n public.native_employment_change_capacity_v1(integer),\n public.native_employment_change_subject_v1(jsonb,uuid),\n public.native_employment_change_scope_v1(jsonb,jsonb),\n public.native_employment_change_version_v1(jsonb,jsonb,integer),\n public.native_employment_change_values_v1(jsonb),\n public.native_employment_change_display_v1(jsonb),\n public.native_employment_change_after_v1(jsonb,jsonb,jsonb),\n public.native_employment_change_state_v1(jsonb,uuid,jsonb),\n public.native_employment_change_can_review_v1(jsonb,public.native_employment_change_proposal),\n public.native_employment_change_summary_v1(jsonb,public.native_employment_change_proposal),\n public.native_employment_change_replay_v1(jsonb,uuid,uuid,text,text),\n public.native_employment_change_bootstrap_v1(jsonb,uuid),\n public.native_employment_change_proposal_v1(jsonb,uuid,uuid),\n public.native_employment_change_propose_v1(jsonb,jsonb,uuid),\n public.native_employment_change_review_v1(jsonb,jsonb,uuid),\n public.native_employment_change_attempt_v1(jsonb,uuid,uuid),\n public.native_employment_change_update_allowed_v1(public.employment_contract,public.employment_contract),\n public.native_employment_change_application_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.native_employment_change_bootstrap_v1(jsonb,uuid),\n public.native_employment_change_proposal_v1(jsonb,uuid,uuid),\n public.native_employment_change_propose_v1(jsonb,jsonb,uuid),\n public.native_employment_change_review_v1(jsonb,jsonb,uuid),\n public.native_employment_change_attempt_v1(jsonb,uuid,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "native_employment_change_subject_v1",
  "signature": "public.native_employment_change_subject_v1(jsonb,uuid)",
  "file": "scripts/migrations/104-native-employment-changes.sql",
  "sourceSha256": "0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.native_employment_change_immutable_v1(),\n public.native_employment_change_context_v1(jsonb,text),\n public.native_employment_change_lock_v1(jsonb,uuid),\n public.native_employment_change_capacity_v1(integer),\n public.native_employment_change_subject_v1(jsonb,uuid),\n public.native_employment_change_scope_v1(jsonb,jsonb),\n public.native_employment_change_version_v1(jsonb,jsonb,integer),\n public.native_employment_change_values_v1(jsonb),\n public.native_employment_change_display_v1(jsonb),\n public.native_employment_change_after_v1(jsonb,jsonb,jsonb),\n public.native_employment_change_state_v1(jsonb,uuid,jsonb),\n public.native_employment_change_can_review_v1(jsonb,public.native_employment_change_proposal),\n public.native_employment_change_summary_v1(jsonb,public.native_employment_change_proposal),\n public.native_employment_change_replay_v1(jsonb,uuid,uuid,text,text),\n public.native_employment_change_bootstrap_v1(jsonb,uuid),\n public.native_employment_change_proposal_v1(jsonb,uuid,uuid),\n public.native_employment_change_propose_v1(jsonb,jsonb,uuid),\n public.native_employment_change_review_v1(jsonb,jsonb,uuid),\n public.native_employment_change_attempt_v1(jsonb,uuid,uuid),\n public.native_employment_change_update_allowed_v1(public.employment_contract,public.employment_contract),\n public.native_employment_change_application_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.native_employment_change_bootstrap_v1(jsonb,uuid),\n public.native_employment_change_proposal_v1(jsonb,uuid,uuid),\n public.native_employment_change_propose_v1(jsonb,jsonb,uuid),\n public.native_employment_change_review_v1(jsonb,jsonb,uuid),\n public.native_employment_change_attempt_v1(jsonb,uuid,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "native_employment_catalog_lock_v1",
  "signature": "public.native_employment_catalog_lock_v1(jsonb)",
  "file": "scripts/migrations/103-native-employment-catalog.sql",
  "sourceSha256": "759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.native_employment_catalog_immutable_v1(),\n public.native_employment_catalog_context_v1(jsonb,text),\n public.native_employment_catalog_lock_v1(jsonb),\n public.native_employment_catalog_scope_v1(jsonb),\n public.native_employment_catalog_items_v1(jsonb),\n public.native_employment_catalog_capacity_v1(integer),\n public.native_employment_catalog_replay_v1(jsonb,uuid,text,text),\n public.native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal),\n public.native_employment_catalog_bootstrap_v1(jsonb),\n public.native_employment_catalog_proposal_v1(jsonb,uuid),\n public.native_employment_catalog_propose_v1(jsonb,jsonb,uuid),\n public.native_employment_catalog_review_v1(jsonb,jsonb,uuid),\n public.native_employment_catalog_attempt_v1(jsonb,uuid),\n public.native_employment_catalog_grh_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": [
   "GRANT EXECUTE ON FUNCTION public.native_employment_catalog_bootstrap_v1(jsonb),\n public.native_employment_catalog_proposal_v1(jsonb,uuid),\n public.native_employment_catalog_propose_v1(jsonb,jsonb,uuid),\n public.native_employment_catalog_review_v1(jsonb,jsonb,uuid),\n public.native_employment_catalog_attempt_v1(jsonb,uuid) TO municontrol_actions_runtime_app;"
  ]
 },
 {
  "name": "grh_curated_source_read_lock_v1",
  "signature": "public.grh_curated_source_read_lock_v1()",
  "file": "scripts/migrations/099-grh-curated-consumers.sql",
  "sourceSha256": "208ae997983d506d2761c6db6eaf272f367dec1483a9b4cd4d2140d972d1a95d",
  "revokeKind": "static-list",
  "revokeStatement": "REVOKE ALL ON FUNCTION public.grh_curated_source_read_lock_v1() FROM PUBLIC,municontrol_actions_runtime_app;",
  "grantStatements": []
 }
]);
const NATIVE067_BODY_OPERATORS=Object.freeze([
 [
  "\nDECLARE ctx jsonb;",
  " DECLARE ctx jsonb;"
 ],
 [
  "DECLARE ctx jsonb;\nBEGIN\n IF jsonb_ty",
  "DECLARE ctx jsonb; BEGIN\n IF jsonb_ty"
 ],
 [
  "E ctx jsonb; BEGIN\n IF jsonb_typeof(p",
  "E ctx jsonb; BEGIN IF jsonb_typeof(p"
 ],
 [
  "bject_keys(p) key)\n  IS DISTINCT FROM ",
  "bject_keys(p) key) IS DISTINCT FROM "
 ],
 [
  "tenantId']::text[]\n  THEN RAISE EXCEPT",
  "tenantId']::text[] THEN RAISE EXCEPT"
 ],
 [
  "_INVALID'; END IF;\n ctx:=action_cente",
  "_INVALID'; END IF; ctx:=action_cente"
 ],
 [
  "ersion')::integer,\n  p->>'releaseSha',(",
  "ersion')::integer,p->>'releaseSha',("
 ],
 [
  "ershipId')::uuid);\n IF NOT action_cen",
  "ershipId')::uuid); IF NOT action_cen"
 ],
 [
  "employee.read') OR\n  (write_access AND",
  "employee.read') OR (write_access AND"
 ],
 [
  "ORBIDDEN'; END IF;\n IF NOT EXISTS(SEL",
  "ORBIDDEN'; END IF; IF NOT EXISTS(SEL"
 ],
 [
  ">'tenantId')::uuid\n  AND b.verified AN",
  ">'tenantId')::uuid AND b.verified AN"
 ],
 [
  ">'sourceDatabase')\n  THEN RAISE EXCEPT",
  ">'sourceDatabase') THEN RAISE EXCEPT"
 ],
 [
  "_INVALID'; END IF;\n RETURN ctx;\nEND ",
  "_INVALID'; END IF; RETURN ctx;\nEND "
 ],
 [
  "ND IF; RETURN ctx;\nEND ",
  "ND IF; RETURN ctx; END "
 ]
]);
const ROOTS=Object.freeze(['own_run_context_v1','own_run_lock_v1','own_run_hash_v1','own_program_exact_v1','native_salary_scope_v1','action_center_context_has_capability','own_liquidation_current_v1','own_liquidation_rows_v1','own_liquidation_state_v1','own_close_active_v1','own_run_immutable_v1','own_liquidation_immutable_v1','own_close_immutable_v1','own_annul_immutable_v1']);
const NOVELTY_SUPPORT=Object.freeze(['own_run_context_v1','own_run_lock_v1','own_run_hash_v1','own_liquidation_current_v1','own_close_active_v1','own_novelty_current_v1']);
const NOVELTY_ADAPTED=Object.freeze(['own_liquidation_rows_v1','own_liquidation_state_v1']);
const NOVELTY_NEW=Object.freeze(['own_novelty_capture_current_v1','own_novelty_capture_source_state_v1','own_novelty_effective_v1','own_novelty_active_v1']);
const LIFECYCLE110=Object.freeze(['native_employment_lifecycle_context_v1','native_employment_lifecycle_lock_v1','native_employment_lifecycle_subject_v1','native_employment_lifecycle_state_v1','native_employment_lifecycle_intervals_v1','native_employment_lifecycle_version_v1','native_employment_lifecycle_activity_v1','native_employment_lifecycle_read_v1','native_employment_lifecycle_projection_v1']);
const ADOPTED136=Object.freeze(['native_employment_lifecycle_adopted_intervals_v2','native_employment_lifecycle_adopted_activity_v2','native_employment_lifecycle_adopted_date_v2']);
const DIRECT=Object.freeze([['scripts/migrations/122-own-payroll-programs.sql','own_program_exact_v1'],['scripts/migrations/112-native-salary-definitions.sql','native_salary_scope_v1'],['scripts/migrations/112-native-salary-definitions.sql','native_salary_serialized_v1']]);
const minted=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const lf=value=>{assert.equal(typeof value,'string','PUBLIC209_SOURCE_TEXT_REQUIRED');return value.replace(/\r\n?/g,'\n');};
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'PUBLIC209_BODY_REQUIRED');return m[2];};
const once=(source,before,after)=>{assert.equal(source.split(before).length,2,'PUBLIC209_FINITE_ANCHOR_CHANGED');return source.replace(before,()=>after);};
const pinOf=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0,'PUBLIC209_METADATA_HEADER_REQUIRED');
 // Exact public184/census spelling, metadata input only; full source definition
 // stays unchanged. This is not schema relocation or a caller normalizer.
 const header=d.slice(0,at).replace("SET search_path TO 'public', 'pg_temp'",'SET search_path=public,pg_temp');
 return ownNoveltySuccessionFunctionPin(ownNoveltySuccessionHeader(header+d.slice(at)));};
function definitions(source){return splitPostgresStatements(source).map(clean).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION /.test(s));}
function one(source,name){const re=new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\('),values=definitions(source).filter(d=>re.test(d));assert.equal(values.length,1,'PUBLIC209_UNIQUE_SOURCE_FUNCTION:'+name);return values[0];}
function embedded(source,tag,count){const values=[...source.matchAll(new RegExp('EXECUTE \\$'+tag+'\\$(CREATE FUNCTION public\\.[\\s\\S]*?)\\$'+tag+'\\$;','g'))].map(m=>m[1]);assert.equal(values.length,count,'PUBLIC209_EMBEDDED_FUNCTION_SET:'+tag);return values;}
function recordSources(read){
 const texts=new Map(),raws=new Map(),sourceHashes={},sourceInputs=[];
 const load=file=>{
  assert.ok(typeof file==='string'&&/^[A-Za-z0-9_.\/-]+$/.test(file)&&!file.split('/').includes('..')&&!file.startsWith('/'),'PUBLIC209_SOURCE_PATH');
  assert.ok(/^(?:scripts|tests|assets|lib|api|src|\.github)\//.test(file)||['package.json','package-lock.json','.vercelignore'].includes(file),'PUBLIC209_SOURCE_SCOPE');
  if(texts.has(file))return texts.get(file);
  const raw=read(file);assert.equal(typeof raw,'string','PUBLIC209_SOURCE_TEXT_REQUIRED:'+file);const text=lf(raw),digest=hash(text);
  if(Object.hasOwn(SOURCE_PINS,file))assert.equal(digest,SOURCE_PINS[file],'PUBLIC209_SOURCE_CHANGED:'+file);
  raws.set(file,raw);texts.set(file,text);sourceHashes[file]=digest;sourceInputs.push({path:file,rawUtf8Bytes:Buffer.byteLength(raw,'utf8'),rawSha256:hash(raw),lfUtf8Bytes:Buffer.byteLength(text,'utf8'),lfSha256:digest});return text;
 };
 const bookend=()=>{for(const[file,raw]of raws)assert.equal(read(file),raw,'PUBLIC209_RAW_SOURCE_BOOKEND_CHANGED:'+file);return{sourceVerified:true,observedMetadataUsed:false,sourceHashes:{...sourceHashes}};};
 for(const file of Object.keys(SOURCE_PINS))load(file);return{load,texts,sourceHashes,sourceInputs,bookend};
}
// The published095 ABI records compact067 as a separate exact epoch. These
// FOURTEEN source-format operators preserve all non-whitespace tokens and SQL
// literals. No generic whitespace normalizer, fixture body or observed code.
export function derivePublishedNativeContext067Source({read}){
 assert.equal(typeof read,'function');const file='scripts/migrations/067-native-employee-registration.sql',contractFile='scripts/migrations/095-native-employee-jurisdiction.sql';
 const source=lf(read(file)),contract=lf(read(contractFile));assert.equal(hash(source),SOURCE_PINS[file]);assert.equal(hash(contract),SOURCE_PINS[contractFile]);
 const original=one(source,'native_employee_context_v1'),before={...pinOf(original),runtime:false};
 assert.equal(before.sha256,'30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed');
 const admitted="('native_employee_context_v1','jsonb,boolean','"+before.sha256+"','"+before.sha256+"','0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c')";assert.equal(contract.split(admitted).length,2,'PUBLIC209_NATIVE095_EPOCH_CHANGED');
 let definition=original;for(const[a,b]of NATIVE067_BODY_OPERATORS){assert.equal(a.replace(/\s/g,''),b.replace(/\s/g,''),'PUBLIC209_NATIVE067_TOKEN_CHANGED');definition=once(definition,a,b);}
 const after={...pinOf(definition),runtime:false};assert.equal(after.sha256,'0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c');assert.deepEqual({...before,sha256:null},{...after,sha256:null});
 assert.deepEqual(body(original).match(/'(?:[^']|'')*'/g),body(definition).match(/'(?:[^']|'')*'/g),'PUBLIC209_NATIVE067_LITERAL_CHANGED');
 let restored=definition;for(const[a,b]of [...NATIVE067_BODY_OPERATORS].reverse())restored=once(restored,b,a);assert.equal(restored,original,'PUBLIC209_NATIVE067_WHOLE_INVERSE');
 return freeze({file,contractFile,sourceSha256:hash(source),contractSha256:hash(contract),original,definition,beforePin:before,pin:after,operators:NATIVE067_BODY_OPERATORS.map(pair=>[...pair]),wholeInverse:true,sqlLiteralsUnchanged:true,observedMetadataUsed:false});
}
function privateScalars(load){
 assert.equal(PRIVATE_SCALAR_RULES.length,11);return PRIVATE_SCALAR_RULES.map(rule=>{
  const source=load(rule.file);assert.equal(hash(source),rule.sourceSha256);assert.equal(source.split(rule.revokeStatement).length,2,'PUBLIC209_PRIVATE_REVOKE_CHANGED:'+rule.signature);
  assert.ok(['static-list','closed-source-family-do'].includes(rule.revokeKind));if(rule.revokeKind==='static-list')assert.ok(rule.revokeStatement.includes(rule.signature));
  const grants=[...source.matchAll(/\bGRANT EXECUTE ON FUNCTION [\s\S]*?;/g)].map(m=>m[0]);assert.deepEqual(grants,rule.grantStatements,'PUBLIC209_PRIVATE_COMPLETE_GRANTS_CHANGED:'+rule.signature);
  for(const grant of grants){assert.equal(source.split(grant).length,2);assert.ok(source.indexOf(rule.revokeStatement)<source.indexOf(grant));assert.ok(!grant.includes(rule.signature),'PUBLIC209_PRIVATE_RUNTIME_CONFLICT:'+rule.signature);}
  const definition=one(source,rule.name),parsed=pinOf(definition);assert.equal(parsed.signature,rule.signature);assert.ok(source.indexOf(definition)<source.indexOf(rule.revokeStatement));
  return{definition,pin:{...parsed,runtime:false},origin:{kind:'private-source-rule',phase:'pre192-preserved',definitionSource:rule.file,sourceSha256:hash(source),acl:{kind:rule.revokeKind,revokeStatement:rule.revokeStatement,grantStatements:[...grants],runtime:false}}};
 });
}
function privateDate(load){
 const file='scripts/migrations/092-payroll-fixed-novelties.sql',source=load(file),definition=one(source,'payroll_fixed_registry_date_v1');
 assert.ok(definition.startsWith('CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_date_v1(value text,required boolean DEFAULT true) RETURNS date\nLANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$'),'PUBLIC209_DATE_HEADER');
 // Metadata input only. The original definition DEFAULTtrue is retained.
 const pin={...ownInstallationFunctionPin(once(definition,'DEFAULT true','DEFAULT false')),defaults:'true',runtime:false};assert.equal(pin.signature,DATE);assert.equal(pin.sha256,'dd36fdd1ed32b385a7d269c461759943db267997449075c19d843beeff3443f9');
 const evidence=publicPrerequisiteAclEvidence([source],[file]).get(DATE);assert.equal(evidence?.PUBLIC?.granted,false);assert.equal(evidence?.[ROLE]?.granted,false);
 return{definition,pin,origin:{kind:'private-date-source',phase:'092-preserved',definitionSource:file,sourceSha256:hash(source),metadataAdapter:'header-input-only-default-true-restored',acl:evidence}};
}
function sourceAcl(load,file,definition,expected){
 const source=load(file),signature=pinOf(definition).signature,evidence=publicPrerequisiteAclEvidence([source],[file]).get(signature);
 assert.equal(evidence?.PUBLIC?.granted,false,'PUBLIC209_EXPLICIT_PUBLIC_REVOKE_REQUIRED:'+signature);assert.equal(typeof evidence?.[ROLE]?.granted,'boolean','PUBLIC209_EXPLICIT_RUNTIME_ACL_REQUIRED:'+signature);
 if(expected!==undefined)assert.equal(evidence[ROLE].granted,expected,'PUBLIC209_RUNTIME_SOURCE_CONFLICT:'+signature);
 return{runtime:evidence[ROLE].granted,evidence};
}
function ledgerTriggers(load){
 const definitions=[];for(const file of['scripts/migrations/123-own-payroll-runs.sql','scripts/migrations/124-own-payroll-liquidation-decisions.sql','scripts/migrations/125-own-payroll-close.sql','scripts/migrations/146-own-consolidated-annulment.sql']){
  for(const m of load(file).matchAll(/CREATE TRIGGER ([a-z0-9_]+) BEFORE (UPDATE OR DELETE|TRUNCATE) ON public\.([a-z0-9_]+) FOR EACH (ROW|STATEMENT) EXECUTE FUNCTION public\.([a-z0-9_]+)\(\);/g)){
   const[,name,events,table,kind,handler]=m;assert.equal(kind,events==='TRUNCATE'?'STATEMENT':'ROW');definitions.push({name,table:'public.'+table,handler:'public.'+handler+'()',type:events==='TRUNCATE'?34:27,sourceFile:file,sourceStatementSha256:hash(m[0])});
  }
 }
 assert.equal(definitions.length,10);assert.equal(new Set(definitions.map(d=>d.table+':'+d.name)).size,10);assert.equal(new Set(definitions.map(d=>d.table)).size,5);
 const guard=`DO $public209_triggers$ DECLARE x jsonb;t pg_trigger;r oid;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(definitions))}::jsonb) LOOP
 r:=to_regclass(x->>'table');SELECT * INTO t FROM pg_trigger WHERE tgrelid=r AND tgname=x->>'name';
 IF r IS NULL OR t.oid IS NULL OR t.tgisinternal OR t.tgtype<>(x->>'type')::integer OR t.tgenabled<>'O' OR t.tgfoid IS DISTINCT FROM to_regprocedure(x->>'handler') OR t.tgqual IS NOT NULL OR t.tgnargs<>0 OR t.tgargs<>''::bytea OR t.tgattr<>''::int2vector OR t.tgconstraint<>0 OR(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>2 THEN RAISE EXCEPTION 'PUBLIC209_IMMUTABLE_TRIGGER_SOURCE_CHANGED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=r AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=r AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'PUBLIC209_LEDGER_SECURITY_CHANGED';END IF;
 END LOOP;END $public209_triggers$`;
 return{definitions,guard};
}
function aclAndOverloads(pins){return `DO $public209_acl$ DECLARE x jsonb;p pg_proc;runtime_oid oid:=to_regrole('${ROLE}');BEGIN
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'PUBLIC209_PREDECESSOR_ACL_CHANGED';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR(SELECT count(*) FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname)<>1
 OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor=p.proowner AND a.grantee=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee=runtime_oid)))
 OR(SELECT count(*) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>(CASE WHEN(x->>'runtime')::boolean THEN 2 ELSE 1 END)
 THEN RAISE EXCEPTION 'PUBLIC209_PREDECESSOR_ACL_CHANGED' USING DETAIL=x->>'signature';END IF;END LOOP;END $public209_acl$`;}
function dependencyClosure(entries,own209,allSources){
 const byName=new Map();for(const entry of entries.values()){const name=entry.pin.name;assert.ok(!byName.has(name),'PUBLIC209_OVERLOAD_SOURCE:'+name);byName.set(name,entry);}
 const knownNames=new Set(byName.keys());for(const source of allSources)for(const m of source.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION (?:public\.)?([a-z_][a-z0-9_]*)\(/g))knownNames.add(m[1]);
 const ownNames=new Set(['own_annul_preparation_core_v1','own_annul_preparation_v1','own_annul_preparation_full_v1']);
 const deps=text=>{
  assert.ok(!/"public"\s*\.\s*"/.test(text),'PUBLIC209_QUOTED_DEPENDENCY_UNRESOLVED');
  const found=new Set([...text.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\s*\(/g)].map(m=>m[1]));
  for(const name of knownNames)if(new RegExp('(?<![A-Za-z0-9_.])'+name+'\\s*\\(').test(text))found.add(name);
  for(const m of text.matchAll(/(?<![A-Za-z0-9_.])((?:own_|native_|payroll_fixed_|grh_curated_|tenant_iam_|action_center_)[a-z0-9_]+)\s*\(/g))found.add(m[1]);
  return[...found].filter(name=>name!=='digest'&&!ownNames.has(name));
 };
 const pending=[...ROOTS,...own209.flatMap(d=>deps(body(d)))],visited=new Set(),edges=[];
 while(pending.length){const name=pending.shift();if(visited.has(name))continue;const entry=byName.get(name);assert.ok(entry,'PUBLIC209_DEPENDENCY_SOURCE_MISSING:'+name);visited.add(name);const text=body(entry.definition);assert.ok(!/\bEXECUTE\s+(?!FUNCTION\b)/i.test(text),'PUBLIC209_DYNAMIC_SQL_UNRESOLVED:'+name);for(const dep of deps(text)){edges.push({from:name,to:dep});pending.push(dep);}}
 const reachable=[...visited].sort(),selected=[...byName.keys()].sort();assert.deepEqual(reachable,selected,'PUBLIC209_SELECTED_CLOSURE_INCOMPLETE_OR_EXTRA');assert.equal(reachable.length,50,'PUBLIC209_SOURCE_CLOSURE_SIZE_CHANGED');
 return{roots:[...ROOTS],memberNames:reachable,edges:edges.sort((a,b)=>(a.from+'|'+a.to).localeCompare(b.from+'|'+b.to,'en')),externalPrimitives:['public.digest'],memberCount:reachable.length,unresolvedMetadata:[],observedMetadataUsed:false};
}
export function composeOwnAnnul209PublicPredecessorRegistry(options){
 exact(options,['read','sourceCommit','operationalPairBaseline'],'PUBLIC209_OPTIONS_EXACT');const{read,sourceCommit,operationalPairBaseline}=options;assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(operationalPairBaseline,'published107','PUBLIC209_PUBLISHED107_REQUIRED');
 const sources=recordSources(read),load=sources.load,entries=new Map(),groups={};
 const add=(definition,pin,origin)=>{
  assert.ok(!/mc_qa_fixed_092_/.test(definition),'PUBLIC209_QA_DEFINITION_FORBIDDEN');assert.ok(pin.signature.startsWith('public.'));assert.match(pin.sha256,HASH);assert.equal(hash(body(definition)),pin.sha256,'PUBLIC209_DEFINITION_SEAL');assert.equal(typeof pin.runtime,'boolean');
  const key=pin.signature+'|'+pin.sha256,previous=entries.get(pin.signature);if(previous){assert.deepEqual(previous.pin,pin,'PUBLIC209_HEADER_OR_ACL_CONFLICT:'+key);assert.equal(body(previous.definition),body(definition),'PUBLIC209_BODY_CONFLICT:'+key);previous.origins.push(origin);return;}
  entries.set(pin.signature,{definition,pin:{...pin},key,sourceDefinitionSha256:hash(definition),sourceBodySha256:pin.sha256,origins:[origin]});
 };
 const privateEntries=privateScalars(load);for(const e of privateEntries)add(e.definition,e.pin,e.origin);groups.privateScalarSignatures=privateEntries.map(e=>e.pin.signature);
 const date=privateDate(load);add(date.definition,date.pin,date.origin);
 const auth=deriveClosedReportAuthorizationSource({read:load,operationalPairBaseline});assert.equal(auth.version,'closed-report-authorization-source.v1');
 for(const definition of auth.definitions){const actual=pinOf(definition),expected=auth.pins.find(p=>p.signature===actual.signature);assert.ok(expected,'PUBLIC209_AUTHORITY_SOURCE_PIN');assert.deepEqual({...actual,runtime:expected.runtime},expected,'PUBLIC209_AUTHORITY_HEADER_CHANGED');add(definition,expected,{kind:'institutional-authorization-producer',phase:'published107-preserved',producer:'scripts/lib/own-payroll-report-census-authority.mjs',sourceHashes:auth.sourceHashes,acl:'exact institutional authorization source contract'});}
 const native=derivePublishedNativeContext067Source({read:load}),nativeExpected=auth.pins.find(p=>p.signature===native.pin.signature);assert.deepEqual(native.pin,nativeExpected,'PUBLIC209_NATIVE_AUTHORITY_CONFLICT');add(native.definition,native.pin,{kind:'finite-published067-format',phase:'published067-accepted095',definitionSource:native.file,contractSource:native.contractFile,sourceSha256:native.sourceSha256,contractSha256:native.contractSha256,wholeInverse:true});
 const table={...auth.capabilitySourcePin,kind:'table',inputArgTypes:['uuid'],inputCount:1,defaultCount:0,declaredOutputColumns:[{name:'capability_key',declaredType:'varchar(96)',catalogType:'varchar'}]};assert.equal(table.signature,TABLE);assert.equal(table.runtime,false);assert.deepEqual(table.argModes,['i','t']);assert.deepEqual(table.allArgTypes,['uuid','varchar']);assert.match(auth.capabilityDefinition,/RETURNS TABLE\s*\(capability_key varchar\(96\)\)/);add(auth.capabilityDefinition,table,{kind:'institutional-table006-184',phase:'006-preserved184',definitionSource:'scripts/migrations/006-tenant-action-authority.sql',metadataSource:'scripts/lib/municipal-owner-adoption-authority-installation.mjs',acl:'owner-only exact TABLE source184 check'});
 const authority=buildMunicipalOwnerAdoptionAuthorityInstallation({read:load,sourceCommit,operationalPairBaseline});assert.equal(authority.version,'municipal-owner-adoption-authority-installation.v1');assert.equal(authority.prerequisitePins.length,6);assert.equal(authority.supportPins.length,2);assert.equal(authority.operationalPairBaseline,operationalPairBaseline);
 const authorityDefinitions=[...authority.prerequisiteDefinitions,...authority.supportDefinitions].map(d=>pinOf(d).name==='native_employee_context_v1'?native.definition:d);
 for(const expected of[...authority.prerequisitePins,...authority.supportPins]){const d=authorityDefinitions.find(d=>pinOf(d).signature===expected.signature);assert.ok(d);assert.deepEqual({...pinOf(d),runtime:expected.runtime},expected,'PUBLIC209_184_SOURCE_HEADER_CONFLICT:'+expected.signature);const selected=entries.get(expected.signature);if(selected)assert.deepEqual(selected.pin,expected,'PUBLIC209_184_SELECTED_CONFLICT:'+expected.signature);}
 const prerequisites=publicPrerequisiteDefinitions(load),novelty=buildOwnNoveltySuccessionInstallation({read:load,sourceCommit,operationalPairBaseline,prerequisiteDefinitions:[...prerequisites.prerequisiteDefinitions],prerequisiteRuntime:[...prerequisites.prerequisiteRuntime]});
 for(const[names,defs,pins,kind]of[[NOVELTY_SUPPORT,novelty.supportDefinitions,novelty.supportPins,'support197'],[NOVELTY_ADAPTED,novelty.adapted,novelty.afterPins,'adapted197'],[NOVELTY_NEW,novelty.newDefinitions,novelty.newPins,'new197']])for(const name of names){const d=defs.find(d=>pinOf(d).name===name);assert.ok(d,'PUBLIC209_197_DEFINITION:'+name);const expected=pins.find(p=>p.name===name);assert.ok(expected);assert.deepEqual({...pinOf(d),runtime:expected.runtime},expected);add(d,expected,{kind,phase:'post197',producer:'scripts/lib/own-novelty-succession-installation.mjs',sourceHashes:novelty.sourceHashes});}
 for(const[file,names]of[['scripts/migrations/110-native-employment-lifecycle.sql',LIFECYCLE110],['scripts/migrations/136-adopted-employment-lifecycle.sql',ADOPTED136]])for(const name of names){const d=one(load(file),name),acl=sourceAcl(load,file,d);add(d,{...pinOf(d),runtime:acl.runtime},{kind:'public-migration',phase:file.includes('/110-')?'110-preserved':'136-preserved',definitionSource:file,sourceSha256:hash(load(file)),acl:acl.evidence});}
 const capacity=composeOwnFullCapacity190PublicInstallation({read:load,sourceCommit});assert.equal(capacity.post.length,27);assert.equal(capacity.pre.length,11);
 for(const[file,name]of DIRECT){const d=one(load(file),name),expected=capacity.census.prerequisitePins.find(p=>p.name===name);assert.ok(expected);const acl=sourceAcl(load,file,d,expected.runtime),pin={...pinOf(d),runtime:acl.runtime};assert.deepEqual(pin,expected);add(d,pin,{kind:'census200-source-predecessor',phase:'preserved-through201',definitionSource:file,sourceSha256:hash(load(file)),acl:acl.evidence});}
 const raw215=composeOwnCloseSnapshot215Raw({major:17,sourceCommit,read:load});const projected=projectOwnFullCapacity190PublicPostflight({capacityPlan:capacity,raw:raw215,postflight:capacity.verification[0],read:load,sourceCommit});assert.equal(projected.stage,215);assert.equal(projected.unchangedOtherRecords,26);assert.equal(projected.wholeGuardInverse,true);
 const own209=embedded(load('scripts/migrations/209-own-annulment-preparation-projection.sql'),'definition_209',3),source208=load('scripts/migrations/208-own-annulment-review-index.sql'),required208=embedded(source208,'definition_208',7);
 const runtime208=new Set(['own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2']);
 const ownPins208=required208.map(d=>{const p=pinOf(d),runtime=runtime208.has(p.name),revoke='REVOKE ALL ON FUNCTION '+p.signature+' FROM PUBLIC,municontrol_actions_runtime_app;',grant='GRANT EXECUTE ON FUNCTION '+p.signature+' TO municontrol_actions_runtime_app;';assert.equal(source208.split(revoke).length,2,'PUBLIC209_208_REVOKE_SOURCE_CHANGED');assert.equal(source208.split(grant).length,runtime?2:1,'PUBLIC209_208_RUNTIME_SOURCE_CHANGED');if(runtime)assert.ok(source208.indexOf(revoke)<source208.indexOf(grant));return{...p,runtime};});
 assert.equal(ownPins208.filter(p=>p.runtime).length,4);assert.equal(ownPins208.filter(p=>!p.runtime).length,3);assert.equal([...source208.matchAll(/\bGRANT EXECUTE ON FUNCTION [\s\S]*?;/g)].length,4,'PUBLIC209_208_COMPLETE_GRANT_SET');
 const closure=dependencyClosure(entries,own209,sources.texts.values()),triggers=ledgerTriggers(load),ordered=[...entries.values()].sort((a,b)=>a.pin.signature<b.pin.signature?-1:a.pin.signature>b.pin.signature?1:0);
 for(const entry of ordered){const pin=entry.pin;if(pin.kind!=='table'&&pin.signature!==DATE)assert.deepEqual({...pinOf(entry.definition),runtime:pin.runtime},pin,'PUBLIC209_FINAL_HEADER_CHANGED');}
 const scalarPins=ordered.filter(e=>e.pin.kind!=='table').map(e=>e.pin),allPins=ordered.map(e=>e.pin);assert.equal(scalarPins.length,49);assert.equal(groups.privateScalarSignatures.length,11);
 const guards={authority184:authority.afterCheck,capacity215:projected.afterPostflight,predecessorMetadata:pinsCheck(scalarPins,'PUBLIC209_PREDECESSOR_METADATA_CHANGED'),predecessorAcl:aclAndOverloads(allPins),ledgerTriggers:triggers.guard,required208Functions:[pinsCheck(ownPins208,'PUBLIC209_208_FUNCTION_SOURCE_CHANGED'),aclAndOverloads(ownPins208)].join(';\n')};
 const value={version:OWN_ANNUL209_PUBLIC_REGISTRY_VERSION,phase:OWN_ANNUL209_PUBLIC_PHASE,schema:'public',sourceCommit,operationalPairBaseline,sourceHashes:sources.sourceHashes,sourceInputs:sources.sourceInputs,entries:ordered,closure,
  privateScalarSignatures:groups.privateScalarSignatures,privateDate:{definition:date.definition,pin:date.pin,origin:date.origin},nativeContextDerivation:native,
  authority184:{version:authority.version,sourceCommit,operationalPairBaseline,sourceHashes:authority.sourceHashes,prerequisitePins:authority.prerequisitePins,supportPins:authority.supportPins,prerequisiteDefinitions:authorityDefinitions.slice(0,6),supportDefinitions:authorityDefinitions.slice(6)},
  capacityEpoch:{phase:'201→213→214→215',originalPostflight:projected.originalPostflight,postflight215:projected.afterPostflight,originalPost:projected.originalPost,post215:projected.afterPost,changedSignature:projected.changedSignature,unchangedOtherRecords:26,wholeGuardInverse:true},guards,triggerSources:triggers.definitions,
  required208:{sourceSqlSha256:SOURCE_PINS['scripts/migrations/208-own-annulment-review-index.sql'],definitions:required208,pins:ownPins208,functions:7,sourceFunctionGuard:guards.required208Functions,publicSourcePlanVersion:'own-annulment-review208-public-source-plan.v1',publicInstalledProofVersion:'own-annulment-review208-installation-proof.v1',realValidatedReceiptRequired:true,epoch208FingerprintBefore209Required:true,receiptIssued:false},
  connects:false,executesSql:false,observedMetadataUsed:false,qaSeedCopied:false,qaGraphUsed:false,normalizerAccepted:false,roleAssignmentsAdded:0,executionAdmitted:false};
 sources.bookend();freeze(value);minted.set(value,{sources,entryMap:entries,sourceCommit,phase:value.phase});return value;
}
export function assertOwnAnnul209PublicPredecessorRegistry(registry,{sourceCommit}={}){
 const seal=minted.get(registry);assert.ok(seal,'PUBLIC209_MINTED_REGISTRY_REQUIRED');assert.equal(registry.version,OWN_ANNUL209_PUBLIC_REGISTRY_VERSION);assert.equal(registry.phase,OWN_ANNUL209_PUBLIC_PHASE);assert.equal(sourceCommit,seal.sourceCommit,'PUBLIC209_REGISTRY_COMMIT_CHANGED');assert.equal(registry.executionAdmitted,false);seal.sources.bookend();return registry;
}
export function ownAnnul209PublicPredecessor(registry,signature){
 const seal=minted.get(registry);assert.ok(seal,'PUBLIC209_MINTED_REGISTRY_REQUIRED');assert.equal(typeof signature,'string');const entry=seal.entryMap.get(signature);assert.ok(entry,'PUBLIC209_SELECTED_SIGNATURE_REQUIRED');return entry;
}
export function bookendOwnAnnul209PublicPredecessorRegistry(registry){const seal=minted.get(registry);assert.ok(seal,'PUBLIC209_MINTED_REGISTRY_REQUIRED');return freeze({version:'own-annul209-public-source-bookend.v1',sourceCommit:seal.sourceCommit,...seal.sources.bookend(),executionAdmitted:false});}
