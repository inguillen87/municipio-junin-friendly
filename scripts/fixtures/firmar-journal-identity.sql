-- Disposable PostgreSQL CI ONLY. Minimal identity contract, never install in a municipality.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE municontrol_actions_runtime_app NOLOGIN;
CREATE TABLE public.platform_tenant(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.internal_users(email text PRIMARY KEY,active boolean NOT NULL,auth_mode text NOT NULL,identity_version int NOT NULL);
CREATE TABLE public.tenant_membership(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),user_email text NOT NULL REFERENCES public.internal_users(email),status text NOT NULL,UNIQUE(id,tenant_id));
CREATE TABLE public.tenant_identity_session(id uuid PRIMARY KEY,user_email text NOT NULL,active_tenant_id uuid,session_version int NOT NULL,identity_version int NOT NULL,source text NOT NULL,auth_level text NOT NULL,status text NOT NULL,expires_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL);
-- Production has its own existing SoD validator. The CI fixture models identity/session states only.
CREATE FUNCTION public.tenant_iam_assert_no_sod_conflict(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN;END $$;
CREATE FUNCTION public.reject_immutable_source_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only';END $$;
INSERT INTO public.platform_tenant VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active');
INSERT INTO public.internal_users VALUES ('fd-one@example.invalid',true,'managed',1),('fd-two@example.invalid',true,'managed',1),('fd-other-tenant@example.invalid',true,'managed',1);
INSERT INTO public.tenant_membership VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fd-one@example.invalid','active'),('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fd-two@example.invalid','active'),('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fd-other-tenant@example.invalid','active');
INSERT INTO public.tenant_identity_session SELECT id,user_email,tenant_id,1,1,'membership','mfa','active',clock_timestamp()+interval '1 hour',clock_timestamp() FROM public.tenant_membership;
