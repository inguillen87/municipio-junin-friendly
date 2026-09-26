// QA sintética del ciclo de Módulo 7; no usa datos ni sesiones municipales.
import fs from 'node:fs';import assert from 'node:assert/strict';import {parseArgs} from 'node:util';
const {values}=parseArgs({strict:true,options:{'write-sql':{type:'string'},'expected-major':{type:'string'}}});
assert.ok(values['write-sql']);assert.ok(['17','18'].includes(values['expected-major']));
const base=fs.readFileSync(new URL('./migrations/038-governed-monthly-close-run.sql',import.meta.url),'utf8');
const next=fs.readFileSync(new URL('./migrations/109-payroll-module7-lifecycle.sql',import.meta.url),'utf8');
function functionSql(signature){
 const marker='CREATE OR REPLACE FUNCTION public.'+signature;const start=base.indexOf(marker);assert.ok(start>=0,signature);
 const end=base.indexOf('\n$$;',start);assert.ok(end>start,signature);return base.slice(start,end+4);
}
const baseline=[functionSql('payroll_monthly_close_guard_run_v1()'),functionSql('payroll_monthly_close_detail_v1('),functionSql('payroll_monthly_close_transition_v1(')].join('\n\n');
const sql=`BEGIN;
DO $guard$ BEGIN IF current_database()<>'module7_qa' OR current_setting('server_version_num')::int/10000<>${values['expected-major']} THEN RAISE EXCEPTION 'ONLY_MODULE7_QA'; END IF; END $guard$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.payroll_monthly_close_run(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,certified_binding_id uuid NOT NULL,period_month date NOT NULL,jurisdiction varchar(2) NOT NULL,
 contract_version varchar(64) NOT NULL DEFAULT 'payroll-monthly-close-run.v1',release_sha char(40) NOT NULL,source_set_sha256 char(64) NOT NULL,source_count smallint NOT NULL DEFAULT 3,
 source_aggregates jsonb NOT NULL,reconciliation jsonb NOT NULL,blocking_issues jsonb NOT NULL DEFAULT '[]',reported_earnings_less_retentions_cents bigint NOT NULL,reported_bank_net_cents bigint NOT NULL,difference_cents bigint NOT NULL,
 mismatch_count integer NOT NULL,blocking_issue_count integer NOT NULL,status varchar(16) NOT NULL DEFAULT 'prepared',version integer NOT NULL DEFAULT 1,reason_code varchar(64) NOT NULL DEFAULT 'sources_prepared',
 reason_reference varchar(128),prepared_by_membership_id uuid NOT NULL,prepared_by_person_id uuid,decided_by_membership_id uuid,decided_by_person_id uuid,close_approved boolean NOT NULL DEFAULT false,
 includes_personal_records boolean NOT NULL DEFAULT false,raw_content_stored boolean NOT NULL DEFAULT false,grh_mutation boolean NOT NULL DEFAULT false,payroll_calculated boolean NOT NULL DEFAULT false,payroll_posted boolean NOT NULL DEFAULT false,
 bank_artifact_generated boolean NOT NULL DEFAULT false,government_artifact_generated boolean NOT NULL DEFAULT false,fiscal_artifact_generated boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,decided_at timestamptz,
 CONSTRAINT payroll_monthly_close_run_status_ck CHECK(status IN('prepared','submitted','approved','rejected','cancelled')),
 CONSTRAINT payroll_monthly_close_run_reason_ck CHECK(reason_code IN('sources_prepared','ready_for_review','approved_by_checker','source_mismatch','evidence_insufficient','period_not_ready','cancelled_by_preparer')),
 CONSTRAINT payroll_monthly_close_run_state_ck CHECK(true)
);
CREATE UNIQUE INDEX payroll_monthly_close_run_active_period_uk ON public.payroll_monthly_close_run(tenant_id,certified_binding_id,period_month,jurisdiction) WHERE status IN('prepared','submitted','approved');
CREATE TABLE public.payroll_monthly_close_event(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL,run_id uuid NOT NULL,certified_binding_id uuid NOT NULL,actor_membership_id uuid NOT NULL,actor_person_id uuid,actor_role_key varchar(64) NOT NULL,
 authority_capability_key varchar(96) NOT NULL,actor_session_id uuid NOT NULL,actor_session_version integer NOT NULL,release_sha char(40) NOT NULL,command varchar(16) NOT NULL,from_status varchar(16),to_status varchar(16) NOT NULL,
 expected_version integer NOT NULL,resulting_version integer NOT NULL,reason_code varchar(64) NOT NULL,reason_reference varchar(128),idempotency_key uuid NOT NULL,command_hash char(64) NOT NULL,event_sha256 char(64) NOT NULL DEFAULT repeat('0',64),
 close_approved boolean NOT NULL DEFAULT false,includes_personal_records boolean NOT NULL DEFAULT false,raw_content_stored boolean NOT NULL DEFAULT false,grh_mutation boolean NOT NULL DEFAULT false,payroll_calculated boolean NOT NULL DEFAULT false,
 payroll_posted boolean NOT NULL DEFAULT false,bank_artifact_generated boolean NOT NULL DEFAULT false,government_artifact_generated boolean NOT NULL DEFAULT false,fiscal_artifact_generated boolean NOT NULL DEFAULT false,occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT payroll_monthly_close_event_actor_idempotency_uk UNIQUE(tenant_id,actor_membership_id,idempotency_key),
 CONSTRAINT payroll_monthly_close_event_command_ck CHECK(command IN('prepare','submit','approve','reject','cancel')),
 CONSTRAINT payroll_monthly_close_event_authority_ck CHECK(true),CONSTRAINT payroll_monthly_close_event_decider_person_ck CHECK(true),CONSTRAINT payroll_monthly_close_event_status_ck CHECK(true),CONSTRAINT payroll_monthly_close_event_approval_ck CHECK(true)
);
CREATE FUNCTION public.payroll_monthly_close_assert_context_v1(p_context jsonb,p_capability text) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_context $$;
CREATE FUNCTION public.payroll_monthly_close_flags_v1(p_close boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('closeApproved',p_close,'includesPersonalRecords',false,'rawContentStored',false,'grhMutation',false,'payrollCalculated',false,'payrollPosted',false,'bankArtifactGenerated',false,'governmentArtifactGenerated',false,'fiscalArtifactGenerated',false) $$;
CREATE FUNCTION public.payroll_monthly_close_snapshot_v1(p_id uuid,p_tenant uuid,p_detail boolean,p_audit boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('id',p_id,'detail',p_detail) $$;
CREATE FUNCTION public.payroll_monthly_close_event_result_v1(p_event bigint,p_tenant uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('eventId',p_event,'replayed',false) $$;
${baseline}
CREATE TRIGGER payroll_monthly_close_run_guard_v1 BEFORE UPDATE OR DELETE ON public.payroll_monthly_close_run FOR EACH ROW EXECUTE FUNCTION public.payroll_monthly_close_guard_run_v1();
${next}
`;
const tail=fs.readFileSync(new URL('../tests/fixtures/payroll-module7-qa-checks.txt',import.meta.url),'utf8');
fs.writeFileSync(values['write-sql'],sql+tail+'\nROLLBACK;\n');
console.log(JSON.stringify({generated:true,expectedMajor:Number(values['expected-major']),usesMunicipalRows:false,rollback:true}));