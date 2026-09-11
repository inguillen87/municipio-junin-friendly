-- The signed source location is private database metadata, not part of the repo/CI.
CREATE TABLE IF NOT EXISTS payroll_detail_delivery_remote (
 job_id uuid PRIMARY KEY REFERENCES payroll_detail_delivery_job(id),
 source_url text NOT NULL CHECK(length(source_url) BETWEEN 30 AND 4096),
 cipher_bytes integer NOT NULL CHECK(cipher_bytes BETWEEN 32 AND 1048576),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON payroll_detail_delivery_remote FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION payroll_detail_delivery_remote_v1(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j payroll_detail_delivery_job%ROWTYPE;r payroll_detail_delivery_remote%ROWTYPE;
BEGIN
 SELECT * INTO j FROM payroll_detail_delivery_job WHERE id=p_job;
 IF NOT FOUND OR j.expires_at<clock_timestamp() OR j.state='revoked' THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_tenant_source_binding sb JOIN tenant_identity_policy p ON p.tenant_id=sb.tenant_id AND p.certified_source_binding_id=sb.id AND p.tenant_data_plane_ready WHERE sb.id=j.source_binding_id AND sb.tenant_id=j.tenant_id AND sb.verified)
 OR NOT EXISTS(SELECT 1 FROM tenant_membership WHERE id=j.requested_by AND tenant_id=j.tenant_id AND status='active') THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 IF j.state='applied' THEN RETURN jsonb_build_object('state','applied','receipt',j.receipt);END IF;
 SELECT * INTO r FROM payroll_detail_delivery_remote WHERE job_id=j.id;
 IF NOT FOUND OR r.source_url !~ '^https://sdmntprbrazilsouth[.]oaiusercontent[.]com/files/[a-f0-9-]+/raw[?]' THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 RETURN jsonb_build_object('state','authorized','sourceUrl',r.source_url,'cipherSha256',j.cipher_sha256,'cipherBytes',r.cipher_bytes);
END $$;
REVOKE ALL ON FUNCTION payroll_detail_delivery_remote_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_detail_delivery_remote_v1(uuid) TO municontrol_actions_runtime_app;
