-- Private HTTPS transport: no decryption keys are sent between tools or to the app.
ALTER TABLE payroll_detail_delivery_job ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'openpgp';
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='payroll_detail_delivery_job'::regclass AND conname='payroll_detail_delivery_transport_check') THEN ALTER TABLE payroll_detail_delivery_job ADD CONSTRAINT payroll_detail_delivery_transport_check CHECK(transport IN ('openpgp','https_gzip'));END IF;END $$;
CREATE OR REPLACE FUNCTION payroll_detail_payload_delivery_v1(p_job uuid,p_cipher bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j payroll_detail_delivery_job%ROWTYPE;b platform_tenant_source_binding%ROWTYPE;plain bytea;payload jsonb;count_lines integer;answer jsonb;new_id uuid;
BEGIN
 IF p_job IS NULL OR p_cipher IS NULL OR octet_length(p_cipher) NOT BETWEEN 1 AND 6000000 THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 SELECT * INTO j FROM payroll_detail_delivery_job WHERE id=p_job FOR UPDATE NOWAIT;
 IF NOT FOUND OR j.transport<>'https_gzip' OR j.passphrase IS NOT NULL OR j.payload_sha256<>encode(digest(p_cipher,'sha256'),'hex') OR j.expires_at<clock_timestamp() OR j.state='revoked' THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 SELECT sb.* INTO b FROM platform_tenant_source_binding sb JOIN tenant_identity_policy p ON p.tenant_id=sb.tenant_id AND p.certified_source_binding_id=sb.id AND p.tenant_data_plane_ready WHERE sb.id=j.source_binding_id AND sb.tenant_id=j.tenant_id AND sb.verified FOR SHARE OF sb,p;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM tenant_membership WHERE id=j.requested_by AND tenant_id=j.tenant_id AND status='active') THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 IF j.state='applied' THEN RETURN j.receipt||'{"replayed":true}'::jsonb;END IF;
 plain:=p_cipher;
 IF octet_length(plain)<>j.payload_bytes OR encode(digest(plain,'sha256'),'hex')<>j.payload_sha256 THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 payload:=convert_from(plain,'UTF8')::jsonb;
 IF payload->>'type' IS NULL OR payload->>'sourceLabel' IS NULL OR payload->>'date' IS NULL OR payload->>'period' IS NULL OR payload->>'month' IS NULL OR payload->>'version' IS DISTINCT FROM 'payroll-detail-source.v1' OR payload->>'sourceSha256' IS DISTINCT FROM j.source_sha256 OR payload->>'sourceDatabase' IS DISTINCT FROM b.source_database OR (payload->>'company')::bigint IS DISTINCT FROM b.source_company_id OR jsonb_typeof(payload->'concepts') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'statements') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'statements')<>j.statement_count OR (payload->>'type') !~ '^[A-Z]$' OR length(payload->>'sourceLabel') NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 SELECT sum(jsonb_array_length(st->'lines'))::integer INTO count_lines FROM jsonb_array_elements(payload->'statements') st;
 IF count_lines<>j.line_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st WHERE st->>'legajo' IS NULL OR st->>'legajo' !~ '^[0-9]{1,12}$' OR jsonb_typeof(st->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(st->'lines') NOT BETWEEN 1 AND 1000) THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st CROSS JOIN LATERAL jsonb_array_elements(st->'lines') ln WHERE ln->>'code' IS NULL OR ln->>'code' !~ '^[0-9]{1,6}$' OR (ln->>'amount' IS NOT NULL AND ln->>'amount' !~ '^-?[0-9]{1,13}\.[0-9]{2}$') OR (ln->>'quantity' IS NOT NULL AND ln->>'quantity' !~ '^-?[0-9]{1,13}\.[0-9]{2}$')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st CROSS JOIN LATERAL jsonb_array_elements(st->'lines') ln GROUP BY st->>'legajo',ln->>'code' HAVING count(*)>1) THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st GROUP BY st->>'legajo' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st CROSS JOIN LATERAL jsonb_array_elements(st->'lines') ln WHERE NOT (payload->'concepts' ? (ln->>'code')) OR nullif(btrim(payload->'concepts'->(ln->>'code')->>'description'),'') IS NULL) THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 new_id:=j.id;
 INSERT INTO payroll_detail_dataset(id,tenant_id,source_binding_id,source_sha256,payload_sha256,source_database,source_label,company_id,payroll_date,source_period,source_month,payroll_type,source_closed_flag,concept_catalog,statement_count,line_count) VALUES(new_id,j.tenant_id,j.source_binding_id,j.source_sha256,j.payload_sha256,b.source_database,payload->>'sourceLabel',b.source_company_id,(payload->>'date')::date,(payload->>'period')::integer,(payload->>'month')::integer,payload->>'type',(payload->>'closedFlag')::integer,payload->'concepts',j.statement_count,count_lines);
 INSERT INTO payroll_detail_statement(dataset_id,tenant_id,source_legajo,lines,statement_sha256) SELECT new_id,j.tenant_id,st->>'legajo',st->'lines',encode(digest((st->'lines')::text,'sha256'),'hex') FROM jsonb_array_elements(payload->'statements') st;
 answer:=jsonb_build_object('datasetId',new_id,'statements',j.statement_count,'lines',count_lines,'replayed',false,'payrollModified',false);
 UPDATE payroll_detail_delivery_job SET state='applied',passphrase=NULL,applied_at=clock_timestamp(),receipt=answer WHERE id=j.id;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION payroll_detail_payload_delivery_v1(uuid,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_detail_payload_delivery_v1(uuid,bytea) TO municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION payroll_detail_delivery_remote_v1(p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j payroll_detail_delivery_job%ROWTYPE;r payroll_detail_delivery_remote%ROWTYPE;
BEGIN
 SELECT * INTO j FROM payroll_detail_delivery_job WHERE id=p_job;
 IF NOT FOUND OR j.expires_at<clock_timestamp() OR j.state='revoked' THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_tenant_source_binding sb JOIN tenant_identity_policy p ON p.tenant_id=sb.tenant_id AND p.certified_source_binding_id=sb.id AND p.tenant_data_plane_ready WHERE sb.id=j.source_binding_id AND sb.tenant_id=j.tenant_id AND sb.verified) OR NOT EXISTS(SELECT 1 FROM tenant_membership WHERE id=j.requested_by AND tenant_id=j.tenant_id AND status='active') THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 IF j.state='applied' THEN RETURN jsonb_build_object('state','applied','receipt',j.receipt);END IF;
 SELECT * INTO r FROM payroll_detail_delivery_remote WHERE job_id=j.id;
 IF NOT FOUND OR r.source_url !~ '^https://sdmntprbrazilsouth[.]oaiusercontent[.]com/files/[a-f0-9-]+/raw[?]' THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 RETURN jsonb_build_object('state','authorized','transport',j.transport,'payloadBytes',j.payload_bytes,'payloadSha256',j.payload_sha256,'sourceUrl',r.source_url,'cipherSha256',j.cipher_sha256,'cipherBytes',r.cipher_bytes);
END $$;
REVOKE ALL ON FUNCTION payroll_detail_delivery_remote_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_detail_delivery_remote_v1(uuid) TO municontrol_actions_runtime_app;
