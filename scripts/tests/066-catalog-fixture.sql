-- Synthetic namespace only. Runner wraps all DDL/tests in one rolled-back transaction.
CREATE SCHEMA mcqa_aux;
CREATE TABLE mcqa_aux.platform_tenant(id uuid PRIMARY KEY);
CREATE TABLE mcqa_aux.platform_tenant_source_binding(id uuid PRIMARY KEY);
CREATE TABLE mcqa_aux.tenant_membership(id uuid PRIMARY KEY);
CREATE TABLE mcqa_aux.person_identity(id uuid PRIMARY KEY);
CREATE TABLE mcqa_aux.payroll_parameter_proposal(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, certified_binding_id uuid NOT NULL, version integer NOT NULL, status text NOT NULL, proposal_approved boolean NOT NULL, draft jsonb NOT NULL, period_month date NOT NULL, prepared_by_membership_id uuid NOT NULL, prepared_by_person_id uuid NOT NULL);
CREATE TABLE mcqa_aux.checks(label text PRIMARY KEY);
CREATE FUNCTION mcqa_aux.payroll_parameter_assert_context_v1(c jsonb, required text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF c->>'syntheticSession' IS DISTINCT FROM 'test-only' OR NOT(c->'capabilities' ? required) THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_CAPABILITY_REQUIRED'; END IF;
 RETURN c;
END $$;
-- Delegate only the immutable documented rule builder, not production identity or data.
CREATE FUNCTION mcqa_aux.payroll_parameter_build_draft_v1(d jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.payroll_parameter_build_draft_v1(d) $$;
CREATE FUNCTION mcqa_aux.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA_ASSERTION: %',label; END IF; INSERT INTO mcqa_aux.checks VALUES(label); END $$;
CREATE FUNCTION mcqa_aux.expect_failure(statement text,wanted text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=MESSAGE_TEXT; END;
 PERFORM mcqa_aux.ok(actual=wanted,label);
END $$;
INSERT INTO mcqa_aux.platform_tenant VALUES('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
INSERT INTO mcqa_aux.platform_tenant_source_binding VALUES('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
INSERT INTO mcqa_aux.tenant_membership VALUES('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002');
INSERT INTO mcqa_aux.person_identity VALUES('40000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002');
