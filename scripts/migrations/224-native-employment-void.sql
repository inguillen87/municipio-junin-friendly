-- Migration 224: explicit correction of erroneously adopted employment.
-- Base product: e48fdd5e163d921c7bebed887cdb63f3b0881bc7.
-- Reviewed core SHA256: be9d398dda2843b292883158d79d7ae83105718be075c912b3ec4d67d44dfec3.
-- One atomic PostgreSQL statement. No municipal DML and no generated decision.
-- New books must be absent and remain empty. Do not retry on an installed schema.
-- Rollback is code-only and refuses any approved correction; see separate artifact.
DO $migration_224$
DECLARE
 item jsonb; proc_oid oid; runtime_oid oid; row_value record;
 critical_pins constant jsonb := '[{"name":"action_center_assert_tenant_read_session_v2","signature":"action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)","sha256":"bf81920a85a23641206615f9aa2691c4029a9bec0459a9c3d6477e00bb6cd43c","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"bf81920a85a23641206615f9aa2691c4029a9bec0459a9c3d6477e00bb6cd43c"},{"name":"action_center_context_has_capability","signature":"action_center_context_has_capability(jsonb,text)","sha256":"5bc603ea4b01cbee1d972a9caaba0577f9489725ae92ed1985c6cf478fe2fa2a","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"5bc603ea4b01cbee1d972a9caaba0577f9489725ae92ed1985c6cf478fe2fa2a"},{"name":"grh_curated_source_read_lock_v1","signature":"grh_curated_source_read_lock_v1()","sha256":"62ce9b4756d534c2f503b323b9dad445e3b74d916368771b28dd718c35894980","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"62ce9b4756d534c2f503b323b9dad445e3b74d916368771b28dd718c35894980"},{"name":"grh_effective_baseline_guard_v1","signature":"grh_effective_baseline_guard_v1()","sha256":"e86f56ae0f117538a4cfa1588d6d63df0b00bcadda7c76c24f197394e1474912","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"e86f56ae0f117538a4cfa1588d6d63df0b00bcadda7c76c24f197394e1474912"},{"name":"native_account_contract_v1","signature":"native_account_contract_v1(uuid,uuid,uuid,boolean)","sha256":"ecc55f48a85dd0b0a4d9f73847237b02283d71abb88f3c635ac4e6d3b85190ec","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"ecc55f48a85dd0b0a4d9f73847237b02283d71abb88f3c635ac4e6d3b85190ec"},{"name":"native_employee_context_v1","signature":"native_employee_context_v1(jsonb,boolean)","sha256":"04a02477eba7cf97c3f76d8a875c8e049af6bc5703ff4375daede77ac0860513","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"04a02477eba7cf97c3f76d8a875c8e049af6bc5703ff4375daede77ac0860513"},{"name":"native_employee_contract_guard_v1","signature":"native_employee_contract_guard_v1()","sha256":"47653945a90c5b56798977b1c1d9b259040440573aa3caffbbe1f364fa0456a1","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"209411418c4ee49fae2ba47a2d8cf91d20cd9b6a33bc4157b6698520d47565a4"},{"name":"native_employee_mixed_status_by_ids_v1","signature":"native_employee_mixed_status_by_ids_v1(jsonb,uuid[])","sha256":"f48500b0019223eb491b80cd54e0c998d3266f69e179c7fd9540d1cbf3283a45","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}","afterSha256":"f48500b0019223eb491b80cd54e0c998d3266f69e179c7fd9540d1cbf3283a45"},{"name":"native_employee_read_projection_v1","signature":"native_employee_read_projection_v1(jsonb,uuid)","sha256":"0b6c63d17ddf5b20e19febd9f96f094424eadf0d523cefbe90dfaa9a19a4cc7f","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}","afterSha256":"0b6c63d17ddf5b20e19febd9f96f094424eadf0d523cefbe90dfaa9a19a4cc7f"},{"name":"native_employee_roster_projection_batch_v1","signature":"native_employee_roster_projection_batch_v1(jsonb)","sha256":"3b27f0b7be40a279f9b63009f9a50cafdf2921aadaddf18a7ab839bec79a843e","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}","afterSha256":"3b27f0b7be40a279f9b63009f9a50cafdf2921aadaddf18a7ab839bec79a843e"},{"name":"native_employment_catalog_capacity_v1","signature":"native_employment_catalog_capacity_v1(integer)","sha256":"8af55319aaa4f44d3a80b411777a278b1490b235a484d11a4638cfaf74eb66c6","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"8af55319aaa4f44d3a80b411777a278b1490b235a484d11a4638cfaf74eb66c6"},{"name":"native_employment_catalog_lock_v1","signature":"native_employment_catalog_lock_v1(jsonb)","sha256":"cb993a236f9bcce83a074c64ee0e5afa1cae9d57b880ab0664863d71bb296e37","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"cb993a236f9bcce83a074c64ee0e5afa1cae9d57b880ab0664863d71bb296e37"},{"name":"native_employment_change_lock_v1","signature":"native_employment_change_lock_v1(jsonb,uuid)","sha256":"8d99ccc5a235dd06dccac6b8f138eec851529e882314690a2eb585414093d763","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"8d99ccc5a235dd06dccac6b8f138eec851529e882314690a2eb585414093d763"},{"name":"native_employment_change_propose_v1","signature":"native_employment_change_propose_v1(jsonb,jsonb,uuid)","sha256":"114fc7f2658981b332d13fb334c9a7c4ecba9c56025f07a84d675ce60ac4e83d","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}","afterSha256":"62a18717d5d2d1b9b5b19c087644066f57d63a9086dada37a2d8754b6d04affa"},{"name":"native_employment_change_review_v1","signature":"native_employment_change_review_v1(jsonb,jsonb,uuid)","sha256":"7ed87b6fa1bc7d05c7b2392618dd1eae0e1ec6153af99fad699566b49a652fc0","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}","afterSha256":"7976e607165946c326512a386035a35105a5a1d7af164c5c813530e9f1b78460"},{"name":"native_employment_change_update_allowed_v1","signature":"native_employment_change_update_allowed_v1(employment_contract,employment_contract)","sha256":"aa22d2d9c8514fb55ad4812b474ed4d56454c0eb324aae712181ad62c9823589","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"aa22d2d9c8514fb55ad4812b474ed4d56454c0eb324aae712181ad62c9823589"},{"name":"native_employment_lifecycle_adopted_activity_v2","signature":"native_employment_lifecycle_adopted_activity_v2(jsonb,date)","sha256":"5a787ace60d8aa39fc1d4f956c1339024d182bc51a86e809800893933dd60972","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"5a787ace60d8aa39fc1d4f956c1339024d182bc51a86e809800893933dd60972"},{"name":"native_employment_lifecycle_adopted_context_v2","signature":"native_employment_lifecycle_adopted_context_v2(jsonb,text)","sha256":"4c6dc21cdd7fab0e2f5cb6f0b75cda92a7864e13c36b10053b5a41b9e7757999","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"4c6dc21cdd7fab0e2f5cb6f0b75cda92a7864e13c36b10053b5a41b9e7757999"},{"name":"native_employment_lifecycle_adopted_date_v2","signature":"native_employment_lifecycle_adopted_date_v2(text)","sha256":"7dad060635e5e641ec11058f9e8e404b38a3564ee8d41451286641aaeb6fe467","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"7dad060635e5e641ec11058f9e8e404b38a3564ee8d41451286641aaeb6fe467"},{"name":"native_employment_lifecycle_adopted_intervals_v2","signature":"native_employment_lifecycle_adopted_intervals_v2(jsonb)","sha256":"c2d71eb55f5aa8e6803d252390d380b3cd815f4beba7d83ffd741b012af2dc18","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"c2d71eb55f5aa8e6803d252390d380b3cd815f4beba7d83ffd741b012af2dc18"},{"name":"native_employment_lifecycle_adopted_propose_v2","signature":"native_employment_lifecycle_adopted_propose_v2(jsonb,jsonb,uuid)","sha256":"835a97c88369cd92dced879a2ced022d03086ef21f8bd7f8449b0dd8cd1ecc96","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"490bf4ac5f645bfcd6d0ed739155070a9d2d2b5e1bfe63da0baf03fe7392fc2f"},{"name":"native_employment_lifecycle_adopted_review_v2","signature":"native_employment_lifecycle_adopted_review_v2(jsonb,jsonb,uuid)","sha256":"702bad882ab1ee675561af76eb9c16c0f5ed1597ae53617cb5cca11e462db87e","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"e182eb0979f0096b821c81c8400fd2c7e7886461cc417e997590e25ec418b296"},{"name":"native_employment_lifecycle_capacity_v1","signature":"native_employment_lifecycle_capacity_v1(integer)","sha256":"8d4f7545b24413a8ad5d373deb5b0f1752ced11a9154368b49f064a8fd43095b","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"8d4f7545b24413a8ad5d373deb5b0f1752ced11a9154368b49f064a8fd43095b"},{"name":"native_employment_lifecycle_lock_v1","signature":"native_employment_lifecycle_lock_v1(jsonb,uuid)","sha256":"3b52945d6b9edcce164b0559d39774821ddf30bef06cf76c73431e38618478b9","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"3b52945d6b9edcce164b0559d39774821ddf30bef06cf76c73431e38618478b9"},{"name":"own_close_roster_v1","signature":"own_close_roster_v1(jsonb,text)","sha256":"ae04476de7ef896119438d342a0ece931f6dc73f1617aa97b8038e93f266eb0b","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"ae04476de7ef896119438d342a0ece931f6dc73f1617aa97b8038e93f266eb0b"},{"name":"own_period_classification_lifecycle_subject_v1","signature":"own_period_classification_lifecycle_subject_v1(jsonb,uuid,boolean)","sha256":"60a7d0cf3b27a6f59fce3afdcc1cfa2cbc2171da1c58ebfa1755570185551ad5","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"60a7d0cf3b27a6f59fce3afdcc1cfa2cbc2171da1c58ebfa1755570185551ad5"},{"name":"own_period_classification_resolve_v1","signature":"own_period_classification_resolve_v1(jsonb,uuid,text)","sha256":"5627ea9367d6708b3dec36648bd49f67b8ecfb9048799f75c74a81f2dffdec22","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"5627ea9367d6708b3dec36648bd49f67b8ecfb9048799f75c74a81f2dffdec22"},{"name":"own_period_classification_source_v1","signature":"own_period_classification_source_v1(jsonb,uuid,text)","sha256":"e161334bf33ac06b1dd669d7779ab8434d4235c147243436a464339597d003be","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"7386bcb6b0c567b82b3aad94411f1b2ddf29f314f7de5d8a3fe8447501ce5e69"},{"name":"payroll_fixed_registry_adopted_subject_v1","signature":"payroll_fixed_registry_adopted_subject_v1(jsonb,uuid,boolean)","sha256":"c765136a6c0199030887df1246d9ae7b9f13b34ae25ac1a2e896e3dcfa8b8864","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"c765136a6c0199030887df1246d9ae7b9f13b34ae25ac1a2e896e3dcfa8b8864"},{"name":"payroll_fixed_registry_range_v2","signature":"payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)","sha256":"d039ef408c0d98ba8a785254df57132f27b8c3af584be9807f63d3c9e88ea7f3","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"6877720de132c06bcf83d554327bed673a593dd566da80b868214b82cb139ee9"},{"name":"payroll_fixed_registry_subject_by_contract_v1","signature":"payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)","sha256":"d12fc9233ad16e4293427bd4a9121ae14c9ee30321930f2872d95994841de625","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"d12fc9233ad16e4293427bd4a9121ae14c9ee30321930f2872d95994841de625"},{"name":"payroll_fixed_registry_subject_v2","signature":"payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)","sha256":"a3845c81089cf69e87edf89f5fea073bea5aa6c0f688a3394a607cdf88630523","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"0aa12309fef1a709f3a08452be48cc25ee625d8bb556f441b63c5d9756bfed69"},{"name":"tenant_iam_assert_no_sod_conflict","signature":"tenant_iam_assert_no_sod_conflict(uuid)","sha256":"60e5a0b4cd6dc1d70621b260ebaaa9077bd42fb36548c36bc69704ed844671e9","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"60e5a0b4cd6dc1d70621b260ebaaa9077bd42fb36548c36bc69704ed844671e9"},{"name":"tenant_iam_effective_capabilities","signature":"tenant_iam_effective_capabilities(uuid)","sha256":"99ee66d44722ffbaa27a274adfc8cb85ddb77eef4db9f3d511292bd32de25b39","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"99ee66d44722ffbaa27a274adfc8cb85ddb77eef4db9f3d511292bd32de25b39"},{"name":"tenant_iam_reviewed_operational_pair_v1","signature":"tenant_iam_reviewed_operational_pair_v1(text,text,text)","sha256":"8cdc67b2e9615bdff5799fdabb86af57df59a692f7d196ed1203933b32a2fecc","owner":"neondb_owner","acl":"{neondb_owner=X/neondb_owner}","afterSha256":"8cdc67b2e9615bdff5799fdabb86af57df59a692f7d196ed1203933b32a2fecc"}]'::jsonb;
 core_pins constant jsonb := '[{"name":"native_employment_void_attempt_v1","signature":"native_employment_void_attempt_v1(jsonb,uuid,uuid)","sha256":"d4f88326860f01774e3391d1da27430e9795f40e2d8707934f022cd0f6a38007"},{"name":"native_employment_void_base_v1","signature":"native_employment_void_base_v1(jsonb,jsonb,jsonb)","sha256":"fe64f263bc14752f028b66b4eab2fdec244e8b22d11b9eb002d12128ae1188ba"},{"name":"native_employment_void_bootstrap_v1","signature":"native_employment_void_bootstrap_v1(jsonb,uuid)","sha256":"36ec77780138003fe5a0c38e197c9c6e37e2fd45123f1aea13292ab20b4b316d"},{"name":"native_employment_void_can_review_v1","signature":"native_employment_void_can_review_v1(jsonb,native_employment_void_proposal)","sha256":"37224af2aa088c50dee26567731fe4d3f340274c1ffd1c2368d2fbbd57d69bd8"},{"name":"native_employment_void_context_v1","signature":"native_employment_void_context_v1(jsonb,text)","sha256":"d87f00011ac2a5760455a8932dd34ce7907bb65f3c30fd72cc3afbd38cb1cf07"},{"name":"native_employment_void_dependencies_v1","signature":"native_employment_void_dependencies_v1(jsonb,uuid,boolean)","sha256":"2ab202d539d03cf5a784cd48271ca6a41ca8e6429878df425bfde8fd593c6803"},{"name":"native_employment_void_hash_v1","signature":"native_employment_void_hash_v1(jsonb)","sha256":"4290c83e79afaa11e3d9a57b4af1b1481cc0041f4df766f7e9705e4271b8e1dd"},{"name":"native_employment_void_immutable_v1","signature":"native_employment_void_immutable_v1()","sha256":"ec709051bf0abe55d4910ba2aceaffa3f225a0faaa4e570760901f424b0d29bc"},{"name":"native_employment_void_lock_v1","signature":"native_employment_void_lock_v1(jsonb,uuid,uuid)","sha256":"ab701e3487479921cf159d25348c61b581a03862146f26e6f56f431e440b8c76"},{"name":"native_employment_void_pending_v1","signature":"native_employment_void_pending_v1(jsonb,uuid)","sha256":"6238ab3003275aa30812dd54e2109a190a8a74e083d36e4f4cacffb70dbbe29c"},{"name":"native_employment_void_proposal_hash_v1","signature":"native_employment_void_proposal_hash_v1(native_employment_void_proposal)","sha256":"5080dd80e8a6c22ffa0e22b18d2aa229938c19fcb8b7d25aa76ba7f19ba1b95d"},{"name":"native_employment_void_proposal_v1","signature":"native_employment_void_proposal_v1(jsonb,uuid,uuid)","sha256":"7399e1ad2d842c16b8b200f0a6bb31d7103335e60e016e0ddb12bda97451349b"},{"name":"native_employment_void_propose_v1","signature":"native_employment_void_propose_v1(jsonb,jsonb,uuid)","sha256":"999620e05c36b918b2fdb4fa98b644a80ae712d0e76cee4cfe86a9132ae2e94d"},{"name":"native_employment_void_replay_v1","signature":"native_employment_void_replay_v1(jsonb,uuid,uuid,text,text)","sha256":"8cf49756b24b1cbb80bd448fd87916f737a92c3414c011af2ca67af6eb1d8bdb"},{"name":"native_employment_void_review_hash_v1","signature":"native_employment_void_review_hash_v1(native_employment_void_review)","sha256":"f1667618f75547c45a395501e86264100b70cd596d904f82e80a5e80ccdca728"},{"name":"native_employment_void_review_v1","signature":"native_employment_void_review_v1(jsonb,jsonb,uuid)","sha256":"fa684640c3b74aed2e3cc5328ca2b53161a8b307ba91743549347481b1d50b3b"},{"name":"native_employment_void_scope_v1","signature":"native_employment_void_scope_v1(jsonb,uuid)","sha256":"9c645bae8fefbb0234ff18c4271e6286853852b0b3304dd968b032143ff9c14d"},{"name":"native_employment_void_state_v1","signature":"native_employment_void_state_v1(jsonb,uuid)","sha256":"4f3eb5ea6614175db09d57a251fa9778e7f9e0212e212229bfcf58c527374b34"},{"name":"native_employment_void_subject_v1","signature":"native_employment_void_subject_v1(jsonb,jsonb,uuid,boolean)","sha256":"1d00a094642f2c0c38256ea9a30d71b9246a2d92a16eb111262dac9a470a2cbc"},{"name":"native_employment_void_summary_v1","signature":"native_employment_void_summary_v1(jsonb,native_employment_void_proposal)","sha256":"c5b59332cf8d5a17545f22689b4ac1bbd436325b44dcd871995bd5a99a9c54fe"},{"name":"native_employment_void_update_allowed_v1","signature":"native_employment_void_update_allowed_v1(employment_contract,employment_contract)","sha256":"486635079a99741c10849b92d2bbe5aab77c11032c0dd66a74e746450f01a3d9"}]'::jsonb;
 facades constant text[] := ARRAY['native_employment_void_bootstrap_v1(jsonb,uuid)','native_employment_void_proposal_v1(jsonb,uuid,uuid)','native_employment_void_attempt_v1(jsonb,uuid,uuid)','native_employment_void_propose_v1(jsonb,jsonb,uuid)','native_employment_void_review_v1(jsonb,jsonb,uuid)'];
BEGIN
 PERFORM set_config('lock_timeout','2s',true);
 PERFORM set_config('statement_timeout','60s',true);
 PERFORM set_config('idle_in_transaction_session_timeout','60s',true);
 PERFORM set_config('search_path','pg_catalog,public,pg_temp',true);
 PERFORM set_config('TimeZone','UTC',true);
 IF current_database()<>'neondb' OR current_user<>'neondb_owner' OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'VOID224_INSTALL_CONTEXT_INVALID';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('municontrol:migration:224:native-employment-void',0)) THEN RAISE EXCEPTION 'VOID224_INSTALL_BUSY';END IF;
 SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolcreaterole;
 IF runtime_oid IS NULL OR pg_has_role(runtime_oid,current_user,'MEMBER') THEN RAISE EXCEPTION 'VOID224_RUNTIME_ROLE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'native_employment_void_%')
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_employment_void_%')
 OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace AND typname LIKE 'native_employment_void_%') THEN
  RAISE EXCEPTION 'VOID224_ALREADY_PRESENT_REVIEW_REQUIRED';
 END IF;
 -- PostgreSQL default PUBLIC EXECUTE is revoked by the core. Any additional
 -- non-owner default grant requires explicit review, never silent inheritance.
 IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND d.defaclnamespace IN(0,'public'::regnamespace)
   AND d.defaclobjtype IN('r','f') AND a.grantee<>d.defaclrole AND a.grantee<>0) THEN
  RAISE EXCEPTION 'VOID224_DEFAULT_PRIVILEGES_REVIEW_REQUIRED';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(critical_pins) LOOP
  proc_oid:=to_regprocedure('public.'||(item->>'signature'));
  IF proc_oid IS NULL THEN RAISE EXCEPTION 'VOID224_SOURCE_MISSING: %',item->>'signature';END IF;
  SELECT p.*,pg_get_userbyid(p.proowner) AS owner_name INTO row_value FROM pg_proc p WHERE oid=proc_oid;
  IF encode(sha256(convert_to(pg_get_functiondef(proc_oid),'UTF8')),'hex') IS DISTINCT FROM item->>'sha256'
    OR row_value.owner_name IS DISTINCT FROM item->>'owner' OR row_value.proacl::text IS DISTINCT FROM item->>'acl' THEN
   RAISE EXCEPTION 'VOID224_SOURCE_CHANGED: %',item->>'signature';
  END IF;
 END LOOP;

 EXECUTE $void_224_definitions$
-- Candidate R1; install together with reader/command overlays, after source-pinned QA.
-- No proposal, review, identity, grant or municipal contract is changed by installation.
CREATE TABLE public.native_employment_void_proposal (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id), source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id), registration_id uuid NOT NULL REFERENCES public.native_employee_registration(id),
 body jsonb NOT NULL, before_contract jsonb NOT NULL, registration_snapshot jsonb NOT NULL, pending_operations jsonb NOT NULL CHECK(jsonb_typeof(pending_operations)='array'), base_version text NOT NULL CHECK(base_version~'^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL, actor_session_version integer NOT NULL CHECK(actor_session_version>0), release_sha text NOT NULL,
 actor_label text NOT NULL, request_key uuid NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 proposal_version text NOT NULL CHECK(proposal_version~'^[a-f0-9]{64}$'), receipt jsonb NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(tenant_id,source_binding_id,contract_id,id), UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(source_binding_id,tenant_id) REFERENCES public.platform_tenant_source_binding(id,tenant_id)
);
CREATE TABLE public.native_employment_void_review (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id), source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id), proposal_id uuid NOT NULL UNIQUE,
 decision text NOT NULL CHECK(decision IN('approve','reject')), reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 proposal_version text NOT NULL, before_contract jsonb NOT NULL, after_contract jsonb NOT NULL, applied_xid xid8,
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL, actor_session_version integer NOT NULL CHECK(actor_session_version>0), release_sha text NOT NULL,
 actor_label text NOT NULL, request_key uuid NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 review_version text NOT NULL CHECK(review_version~'^[a-f0-9]{64}$'), receipt jsonb NOT NULL, reviewed_at timestamptz NOT NULL,
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(source_binding_id,tenant_id) REFERENCES public.platform_tenant_source_binding(id,tenant_id),
 CHECK((decision='approve' AND applied_xid IS NOT NULL) OR (decision='reject' AND applied_xid IS NULL)),
 FOREIGN KEY(tenant_id,source_binding_id,contract_id,proposal_id) REFERENCES public.native_employment_void_proposal(tenant_id,source_binding_id,contract_id,id)
);
CREATE UNIQUE INDEX native_employment_void_one_approval ON public.native_employment_void_review(tenant_id,source_binding_id,contract_id) WHERE decision='approve';

CREATE FUNCTION public.native_employment_void_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 BEGIN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_IMMUTABLE'; END $$;
CREATE TRIGGER native_employment_void_proposal_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_employment_void_proposal FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_void_immutable_v1();
CREATE TRIGGER native_employment_void_review_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_employment_void_review FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_void_immutable_v1();

CREATE FUNCTION public.native_employment_void_hash_v1(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT encode(sha256(convert_to(v::text,'UTF8')),'hex') $$;
CREATE FUNCTION public.native_employment_void_proposal_hash_v1(p public.native_employment_void_proposal) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_employment_void_hash_v1(jsonb_build_object('domain','native-employment-void-proposal.v1','row',to_jsonb(p)-ARRAY['proposal_version','receipt'])) $$;
CREATE FUNCTION public.native_employment_void_review_hash_v1(r public.native_employment_void_review) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_employment_void_hash_v1(jsonb_build_object('domain','native-employment-void-review.v1','row',to_jsonb(r)-ARRAY['review_version','receipt'])) $$;

-- Narrow trigger authorization, valid only inside the transaction that inserted
-- the independently reviewed event. This does not grant direct UPDATE privilege.
CREATE FUNCTION public.native_employment_void_update_allowed_v1(old_row public.employment_contract,new_row public.employment_contract) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE p public.native_employment_void_proposal;r public.native_employment_void_review;
BEGIN
 IF old_row.source_system IS DISTINCT FROM 'MUNICONTROL' OR old_row.status IS DISTINCT FROM 'active' OR new_row.status IS DISTINCT FROM 'inactive'
 OR to_jsonb(old_row)-ARRAY['status','updated_at'] IS DISTINCT FROM to_jsonb(new_row)-ARRAY['status','updated_at'] THEN RETURN false;END IF;
 SELECT * INTO r FROM public.native_employment_void_review WHERE contract_id=old_row.id AND tenant_id=old_row.tenant_id AND decision='approve' AND applied_xid=pg_current_xact_id_if_assigned() AND before_contract=to_jsonb(old_row) AND after_contract=to_jsonb(new_row);
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO p FROM public.native_employment_void_proposal WHERE id=r.proposal_id AND tenant_id=r.tenant_id AND source_binding_id=r.source_binding_id AND contract_id=r.contract_id;
 RETURN FOUND AND r.actor_membership_id<>p.actor_membership_id AND r.actor_person_id<>p.actor_person_id AND r.actor_email<>p.actor_email
 AND r.proposal_version=p.proposal_version AND p.proposal_version=public.native_employment_void_proposal_hash_v1(p) AND r.review_version=public.native_employment_void_review_hash_v1(r)
 AND r.before_contract=p.before_contract AND p.body->>'acknowledgement'='historical_without_current_relationship';
END $$;

-- Audit identity follows the existing administrative operator pattern. It never
-- manufactures an active employment or grants salary/overtime privileges.
CREATE FUNCTION public.native_employment_void_context_v1(p jsonb,required_capability text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; person_value uuid; label_value text;
BEGIN
 ctx:=public.native_employment_lifecycle_adopted_context_v2(p);
 IF required_capability IS NOT NULL AND (required_capability NOT IN('employee.record.propose','employee.record.approve') OR NOT public.action_center_context_has_capability(ctx,required_capability)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_FORBIDDEN'; END IF;
 person_value:=(ctx->>'actorPersonId')::uuid; label_value:=ctx->>'actorLabel';
 IF person_value IS NULL THEN
  BEGIN
   SELECT i.id,i.full_name INTO STRICT person_value,label_value FROM public.tenant_action_employment_link l
   JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
   WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
    AND ((c.source_system='GRH' AND EXISTS(SELECT 1 FROM public.source_import_batch b WHERE b.id=c.source_batch_id AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL))
     OR (c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id AND EXISTS(SELECT 1 FROM public.native_employee_registration n WHERE n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=l.tenant_id AND n.source_binding_id=l.source_binding_id AND n.id::text=c.source_payload#>>'{native,registrationId}')))
   FOR SHARE OF l,c,i;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL; WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_IDENTITY_CHANGED'; END;
 END IF;
 IF person_value IS NOT NULL THEN
  SELECT full_name INTO label_value FROM public.person_identity WHERE id=person_value AND identity_state IN('active','provisional') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_IDENTITY_CHANGED';END IF;
 END IF;
 IF required_capability IS NOT NULL AND person_value IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_ACTOR_REQUIRED'; END IF;
 RETURN ctx||jsonb_build_object('actorPersonId',person_value,'actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce(nullif(btrim(label_value),''),'Responsable municipal'),160),'voidActorVerified',person_value IS NOT NULL);
END $$;

CREATE FUNCTION public.native_employment_void_scope_v1(ctx jsonb,target uuid) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.native_employment_void_hash_v1(jsonb_build_object('domain','native-employment-void-scope.v1','tenant',ctx->>'tenantId','binding',ctx->>'sourceBindingId','membership',ctx->>'membershipId','person',ctx->>'actorPersonId','email',ctx->>'actorEmail','contract',target)) $$;
CREATE FUNCTION public.native_employment_void_base_v1(c jsonb,n jsonb,pending_operations jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.native_employment_void_hash_v1(jsonb_build_object('domain','native-employment-void-base.v1','contract',c,'registration',n,'pendingOperations',pending_operations)) $$;

CREATE FUNCTION public.native_employment_void_lock_v1(ctx jsonb,target uuid,k uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF k IS NULL OR target IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-employment-void-attempt:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId')||':'||(ctx->>'membershipId')||':'||k::text,0)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_BUSY';END IF;
 PERFORM public.native_employment_lifecycle_lock_v1(ctx,target);
END $$;

CREATE FUNCTION public.native_employment_void_pending_v1(ctx jsonb,target uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY kind,id),'[]') FROM (
 SELECT 'change' kind,q.id,jsonb_build_object('kind','change','id',q.id,'version',public.native_employment_void_hash_v1(to_jsonb(q))) item FROM public.native_employment_change_proposal q
 WHERE q.tenant_id=(ctx->>'tenantId')::uuid AND q.source_binding_id=(ctx->>'sourceBindingId')::uuid AND q.contract_id=target AND NOT EXISTS(SELECT 1 FROM public.native_employment_change_review r WHERE r.proposal_id=q.id)
 UNION ALL SELECT 'lifecycle',q.id,jsonb_build_object('kind','lifecycle','id',q.id,'version',public.native_employment_void_hash_v1(to_jsonb(q))) FROM public.native_employment_lifecycle_proposal q
 WHERE q.tenant_id=(ctx->>'tenantId')::uuid AND q.source_binding_id=(ctx->>'sourceBindingId')::uuid AND q.contract_id=target AND NOT EXISTS(SELECT 1 FROM public.native_employment_lifecycle_review r WHERE r.proposal_id=q.id)
 ) pending $$;

-- Private helper used by shared subject/range guards. No runtime EXECUTE grant.
CREATE FUNCTION public.native_employment_void_state_v1(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE p public.native_employment_void_proposal;r public.native_employment_void_review;current_row jsonb;reg jsonb;
BEGIN
 IF ctx->>'tenantId' IS NULL OR ctx->>'sourceBindingId' IS NULL OR target IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_SCOPE_CHANGED'; END IF;
 SELECT * INTO r FROM public.native_employment_void_review WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND decision='approve';
 IF NOT FOUND THEN RETURN jsonb_build_object('voided',false,'version',NULL,'approvalId',NULL,'approvedAt',NULL);END IF;
 SELECT * INTO STRICT p FROM public.native_employment_void_proposal WHERE id=r.proposal_id;
 SELECT to_jsonb(c) INTO current_row FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=p.tenant_id AND c.source_system='MUNICONTROL';
 SELECT to_jsonb(n) INTO reg FROM public.native_employee_registration n WHERE n.id=p.registration_id AND n.contract_id=target AND n.tenant_id=p.tenant_id AND n.source_binding_id=p.source_binding_id;
 IF r.tenant_id<>p.tenant_id OR r.source_binding_id<>p.source_binding_id OR r.contract_id<>p.contract_id
 OR r.actor_membership_id=p.actor_membership_id OR r.actor_person_id=p.actor_person_id OR r.actor_email=p.actor_email
 OR p.proposal_version<>public.native_employment_void_proposal_hash_v1(p) OR r.proposal_version<>p.proposal_version OR r.review_version<>public.native_employment_void_review_hash_v1(r)
 OR p.base_version<>public.native_employment_void_base_v1(p.before_contract,p.registration_snapshot,p.pending_operations)
 OR r.before_contract IS DISTINCT FROM p.before_contract OR reg IS DISTINCT FROM p.registration_snapshot
 OR current_row IS DISTINCT FROM r.after_contract OR r.before_contract->>'status' IS DISTINCT FROM 'active' OR r.after_contract->>'status' IS DISTINCT FROM 'inactive'
 OR r.before_contract-ARRAY['status','updated_at'] IS DISTINCT FROM r.after_contract-ARRAY['status','updated_at']
 OR p.body->>'acknowledgement' IS DISTINCT FROM 'historical_without_current_relationship'
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_CONTRACT_INVALID';END IF;
 RETURN jsonb_build_object('voided',true,'version',r.review_version,'approvalId',r.id,'approvedAt',r.reviewed_at);
END $$;

-- Scope-safe exact UUID scalar lookup also covers frozen arrays of selected IDs.
-- It deliberately refuses prior own use, even if it was later annulled. No history is erased.
CREATE FUNCTION public.native_employment_void_dependencies_v1(ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE spec text;rel text;binding_col text;hit boolean;found_relations jsonb:='[]';review_filter text;
BEGIN
 FOREACH spec IN ARRAY ARRAY[
 'native_employment_change_proposal:source_binding_id','native_employment_lifecycle_proposal:source_binding_id',
 'own_payroll_run_capture:source_binding_id','own_payroll_close_event:source_binding_id','own_payroll_liquidation_event:source_binding_id',
 'own_payroll_novelty_event:source_binding_id','own_working_time_event:source_binding_id','own_seniority_event:source_binding_id',
 'own_period_classification_event:source_binding_id','own_participation_event:source_binding_id','own_monthly_days_event:source_binding_id',
 'own_art_days_event:source_binding_id','own_fiscal_facts_event:source_binding_id','own_salary_conditions_event:source_binding_id',
 'own_position_assignment_event:source_binding_id','own_bank_account_event:source_binding_id','employee_family_member:source_binding_id',
 'native_leave_event:source_binding_id','action_case:source_binding_id','school_certificate_record:source_binding_id','attendance_time_exception_event:source_binding_id',
 'action_case_event:source_binding_id','action_command_context:source_binding_id','school_certificate:source_binding_id',
 'time_catalog_entry:source_contract_certified_binding_id','time_source_governance_event:contract_certified_binding_id',
 'payroll_fixed_novelty:certified_binding_id','payroll_fixed_assignment:certified_binding_id'
 ] LOOP
  rel:=split_part(spec,':',1);binding_col:=split_part(spec,':',2);
  IF hold_lock THEN EXECUTE format('LOCK TABLE public.%I IN SHARE MODE NOWAIT',rel); END IF;
  review_filter:='';
  IF rel IN('native_employment_change_proposal','native_employment_lifecycle_proposal') THEN
   IF hold_lock THEN EXECUTE format('LOCK TABLE public.%I IN SHARE MODE NOWAIT',replace(rel,'_proposal','_review'));END IF;
   review_filter:=CASE WHEN rel='native_employment_change_proposal'
    THEN format(' AND NOT EXISTS(SELECT 1 FROM public.%I v WHERE v.proposal_id=t.id AND v.decision=''reject'')',replace(rel,'_proposal','_review'))
    ELSE format(' AND EXISTS(SELECT 1 FROM public.%I v WHERE v.proposal_id=t.id AND v.decision=''approve'')',replace(rel,'_proposal','_review')) END;
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I t WHERE t.tenant_id=$1 AND t.%I=$2 AND jsonb_path_exists(to_jsonb(t),''strict $.** ? (@ == $id)'',jsonb_build_object(''id'',$3::text))%s)',rel,binding_col,review_filter)
   INTO hit USING (ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,target;
  IF hit THEN found_relations:=found_relations||jsonb_build_array(rel);END IF;
 END LOOP;
 IF hold_lock THEN LOCK TABLE public.own_payroll_run_result IN SHARE MODE NOWAIT;END IF;
 SELECT EXISTS(SELECT 1 FROM public.own_payroll_run_result r JOIN public.own_payroll_run_capture c ON c.id=r.capture_id WHERE c.tenant_id=(ctx->>'tenantId')::uuid AND c.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND (jsonb_path_exists(r.input,'strict $.** ? (@ == $id)',jsonb_build_object('id',target::text)) OR jsonb_path_exists(r.result,'strict $.** ? (@ == $id)',jsonb_build_object('id',target::text)))) INTO hit;
 IF hit THEN found_relations:=found_relations||jsonb_build_array('own_payroll_run_result');END IF;
 IF hold_lock THEN LOCK TABLE public.payroll_novelty_batch,public.payroll_novelty_row IN SHARE MODE NOWAIT;END IF;
 SELECT EXISTS(SELECT 1 FROM public.payroll_novelty_row r JOIN public.payroll_novelty_batch b ON b.id=r.batch_id AND b.tenant_id=r.tenant_id WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND b.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND r.employment_contract_id=target) INTO hit;
 IF hit THEN found_relations:=found_relations||jsonb_build_array('payroll_novelty_row');END IF;
 FOREACH rel IN ARRAY ARRAY['attendance_identity_map','attendance_canonical_punch','attendance_evaluation_result','time_assignment_spec'] LOOP
  IF hold_lock THEN EXECUTE format('LOCK TABLE public.%I IN SHARE MODE NOWAIT',rel);END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I t WHERE t.tenant_id=$1 AND t.employment_contract_id=$2)',rel) INTO hit USING (ctx->>'tenantId')::uuid,target;
  IF hit THEN found_relations:=found_relations||jsonb_build_array(rel);END IF;
 END LOOP;
 IF hold_lock THEN LOCK TABLE public.tenant_action_employment_link,public.internal_user_employment_link IN SHARE MODE NOWAIT;END IF;
 IF EXISTS(SELECT 1 FROM public.tenant_action_employment_link l WHERE l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid AND l.employment_contract_id=target AND l.active AND l.revoked_at IS NULL) THEN found_relations:=found_relations||jsonb_build_array('tenant_action_employment_link');END IF;
 IF EXISTS(SELECT 1 FROM public.internal_user_employment_link l WHERE l.employment_contract_id=target AND l.active) THEN found_relations:=found_relations||jsonb_build_array('internal_user_employment_link');END IF;
 RETURN found_relations;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_BUSY'; END $$;

CREATE FUNCTION public.native_employment_void_subject_v1(p jsonb,ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE proof jsonb;c jsonb;n jsonb;state_value jsonb;employee_name text;pending_ops jsonb;
BEGIN
 IF hold_lock THEN PERFORM public.native_employment_lifecycle_lock_v1(ctx,target);END IF;
 proof:=public.native_employee_read_projection_v1(p,target);
 IF proof#>>'{contract,recordKind}' IS DISTINCT FROM 'adopted' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_ORIGIN_NOT_SUPPORTED';END IF;
 SELECT to_jsonb(ec),to_jsonb(reg) INTO c,n FROM public.employment_contract ec JOIN public.native_employee_registration reg ON reg.contract_id=ec.id AND reg.person_id=ec.person_id AND reg.id::text=ec.source_payload#>>'{native,registrationId}'
 WHERE ec.id=target AND ec.tenant_id=(ctx->>'tenantId')::uuid AND reg.tenant_id=ec.tenant_id AND reg.source_binding_id=(ctx->>'sourceBindingId')::uuid AND ec.source_system='MUNICONTROL';
 IF c IS NULL OR proof#>>'{contract,id}' IS DISTINCT FROM target::text AND proof#>>'{contract,contractId}' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_NOT_FOUND';END IF;
 SELECT full_name INTO employee_name FROM public.person_identity WHERE id=(c->>'person_id')::uuid;
 state_value:=public.native_employment_void_state_v1(ctx,target);pending_ops:=public.native_employment_void_pending_v1(ctx,target);
 RETURN jsonb_build_object('contract',c,'registration',n,'baseVersion',public.native_employment_void_base_v1(c,n,pending_ops),'state',state_value,'pendingOperations',pending_ops,
 'subject',jsonb_build_object('contractId',target,'registrationId',n->>'id','legajo',c->>'legacy_legajo','employeeName',employee_name,'status',c->>'status','startDate',c->>'start_date','endDate',c->>'end_date'));
END $$;

CREATE FUNCTION public.native_employment_void_can_review_v1(ctx jsonb,p public.native_employment_void_proposal) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(public.action_center_context_has_capability(ctx,'employee.record.approve') AND (ctx->>'voidActorVerified')::boolean AND p.actor_membership_id<>(ctx->>'membershipId')::uuid AND p.actor_person_id<>(ctx->>'actorPersonId')::uuid AND p.actor_email<>ctx->>'actorEmail',false) $$;

CREATE FUNCTION public.native_employment_void_summary_v1(ctx jsonb,p public.native_employment_void_proposal) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'contractId',p.contract_id,'status',coalesce((SELECT CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END FROM public.native_employment_void_review WHERE proposal_id=p.id),'pending'),
 'reason',p.body->>'reason','createdAt',p.created_at,'authorLabel',p.actor_label,'proposalVersion',p.proposal_version,'canReview',NOT EXISTS(SELECT 1 FROM public.native_employment_void_review WHERE proposal_id=p.id) AND public.native_employment_void_can_review_v1(ctx,p)) $$;

CREATE FUNCTION public.native_employment_void_bootstrap_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;s jsonb;deps jsonb;proposals jsonb;
BEGIN
 ctx:=public.native_employment_void_context_v1(p);s:=public.native_employment_void_subject_v1(p,ctx,target);
 deps:=CASE WHEN (s#>>'{state,voided}')::boolean THEN '[]'::jsonb ELSE public.native_employment_void_dependencies_v1(ctx,target) END;
 SELECT coalesce(jsonb_agg(public.native_employment_void_summary_v1(ctx,q) ORDER BY q.created_at DESC,q.id),'[]') INTO proposals FROM public.native_employment_void_proposal q WHERE q.tenant_id=(ctx->>'tenantId')::uuid AND q.source_binding_id=(ctx->>'sourceBindingId')::uuid AND q.contract_id=target;
 RETURN jsonb_build_object('version','native-employment-void.v1','scopeVersion',public.native_employment_void_scope_v1(ctx,target),'baseVersion',s->>'baseVersion','subject',s->'subject','state',s->'state','dependencies',deps,'pendingOperations',s->'pendingOperations','proposals',proposals,
 'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'voidActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'employee.record.propose') AND s#>>'{contract,status}'='active' AND deps='[]'::jsonb AND NOT(s#>>'{state,voided}')::boolean,
 'canReview',coalesce((ctx->>'voidActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'employee.record.approve')),'complete',true);
END $$;

CREATE FUNCTION public.native_employment_void_proposal_v1(p jsonb,target uuid,proposal_id_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;q public.native_employment_void_proposal;rv public.native_employment_void_review;
BEGIN
 ctx:=public.native_employment_void_context_v1(p);
 SELECT * INTO q FROM public.native_employment_void_proposal WHERE id=proposal_id_value AND contract_id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_NOT_FOUND';END IF;
 IF q.proposal_version<>public.native_employment_void_proposal_hash_v1(q) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_CONTRACT_INVALID';END IF;
 SELECT * INTO rv FROM public.native_employment_void_review WHERE proposal_id=q.id;
 RETURN jsonb_build_object('version','native-employment-void.v1','scopeVersion',public.native_employment_void_scope_v1(ctx,target),'proposal',public.native_employment_void_summary_v1(ctx,q)||jsonb_build_object('baseVersion',q.base_version,'pendingOperations',q.pending_operations,'before',jsonb_build_object('status',q.before_contract->>'status','startDate',q.before_contract->>'start_date','endDate',q.before_contract->>'end_date'),'after',jsonb_build_object('status','inactive','startDate',q.before_contract->>'start_date','endDate',q.before_contract->>'end_date'),'review',CASE WHEN rv.id IS NULL THEN NULL ELSE jsonb_build_object('id',rv.id,'decision',rv.decision,'reason',rv.reason,'reviewerLabel',rv.actor_label,'reviewedAt',rv.reviewed_at,'version',rv.review_version) END));
END $$;

CREATE FUNCTION public.native_employment_void_replay_v1(ctx jsonb,target uuid,k uuid,op text DEFAULT NULL,fp text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE x record;seen integer:=0;answer jsonb;
BEGIN
 IF k IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID';END IF;
 FOR x IN SELECT 'propose' operation,q.contract_id,q.actor_person_id,q.actor_email,q.request_sha256,q.receipt FROM public.native_employment_void_proposal q WHERE q.tenant_id=(ctx->>'tenantId')::uuid AND q.source_binding_id=(ctx->>'sourceBindingId')::uuid AND q.actor_membership_id=(ctx->>'membershipId')::uuid AND q.request_key=k
 UNION ALL SELECT 'review',r.contract_id,r.actor_person_id,r.actor_email,r.request_sha256,r.receipt FROM public.native_employment_void_review r WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.actor_membership_id=(ctx->>'membershipId')::uuid AND r.request_key=k LOOP
  seen:=seen+1;
  IF x.contract_id<>target OR x.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR x.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_SCOPE_CHANGED';END IF;
  IF op IS NOT NULL AND (x.operation<>op OR x.request_sha256<>fp) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_IDEMPOTENCY_REUSE';END IF;
  answer:=x.receipt||jsonb_build_object('replayed',true);
 END LOOP;
 IF seen>1 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_CONTRACT_INVALID';END IF;
 RETURN answer;
END $$;

CREATE FUNCTION public.native_employment_void_attempt_v1(p jsonb,target uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb;v jsonb;BEGIN c:=public.native_employment_void_context_v1(p);v:=public.native_employment_void_replay_v1(c,target,k);IF v IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_NOT_FOUND';END IF;RETURN v;END $$;

CREATE FUNCTION public.native_employment_void_propose_v1(p jsonb,b jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb;s jsonb;v jsonb;target uuid;fp text;reason_value text;q public.native_employment_void_proposal;
BEGIN
 c:=public.native_employment_void_context_v1(p,'employee.record.propose');
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR octet_length(b::text)>8192 OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(b) x) IS DISTINCT FROM ARRAY['acknowledgement','baseVersion','contractId','reason','scopeVersion']::text[] OR EXISTS(SELECT 1 FROM jsonb_each(b) e WHERE jsonb_typeof(e.value)<>'string') OR b->>'contractId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR b->>'baseVersion'!~'^[a-f0-9]{64}$' OR b->>'scopeVersion'!~'^[a-f0-9]{64}$' OR b->>'acknowledgement'<>'historical_without_current_relationship' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID';END IF;
 target:=(b->>'contractId')::uuid;reason_value:=normalize(btrim(b->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID';END IF;
 b:=b||jsonb_build_object('contractId',target,'reason',reason_value);fp:=public.native_employment_void_hash_v1(jsonb_build_object('version','native-employment-void.v1','operation','propose','body',b));
 PERFORM public.native_employment_void_lock_v1(c,target,k);v:=public.native_employment_void_replay_v1(c,target,k,'propose',fp);IF v IS NOT NULL THEN RETURN v;END IF;
 PERFORM 1 FROM public.employment_contract WHERE id=target AND tenant_id=(c->>'tenantId')::uuid FOR UPDATE NOWAIT;
 IF public.native_employment_void_dependencies_v1(c,target,true)<>'[]'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_IN_USE';END IF;
 s:=public.native_employment_void_subject_v1(p,c,target);
 IF b->>'scopeVersion'<>public.native_employment_void_scope_v1(c,target) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_SCOPE_CHANGED';END IF;
 IF b->>'baseVersion'<>s->>'baseVersion' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_BASE_CHANGED';END IF;
 IF (s#>>'{state,voided}')::boolean OR s#>>'{contract,status}'<>'active' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN';END IF;
 IF (SELECT count(*) FROM public.native_employment_void_proposal WHERE contract_id=target)>=20 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_LIMIT';END IF;
 q.id:=gen_random_uuid();q.tenant_id:=(c->>'tenantId')::uuid;q.source_binding_id:=(c->>'sourceBindingId')::uuid;q.contract_id:=target;q.registration_id:=(s#>>'{registration,id}')::uuid;q.body:=b;q.before_contract:=s->'contract';q.registration_snapshot:=s->'registration';q.pending_operations:=s->'pendingOperations';q.base_version:=s->>'baseVersion';
 q.actor_membership_id:=(c->>'membershipId')::uuid;q.actor_person_id:=(c->>'actorPersonId')::uuid;q.actor_email:=c->>'actorEmail';q.actor_session_id:=(p->>'actorSessionId')::uuid;q.actor_session_version:=(p->>'actorSessionVersion')::integer;q.release_sha:=p->>'releaseSha';q.actor_label:=c->>'actorLabel';q.request_key:=k;q.request_sha256:=fp;q.created_at:=clock_timestamp();q.proposal_version:=public.native_employment_void_proposal_hash_v1(q);
 q.receipt:=jsonb_build_object('version','native-employment-void.v1','operation','propose','contractId',target,'proposalId',q.id,'status','pending','proposalVersion',q.proposal_version,'approvalId',NULL,'reviewVersion',NULL,'supersededProposals','[]'::jsonb,'replayed',false,'payrollModified',false,'datesModified',false);
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(to_jsonb(q)::text)+16384);
 INSERT INTO public.native_employment_void_proposal SELECT (q).*;RETURN q.receipt;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_BUSY'; END $$;

CREATE FUNCTION public.native_employment_void_review_v1(p jsonb,b jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb;s jsonb;v jsonb;target uuid;fp text;reason_value text;q public.native_employment_void_proposal;r public.native_employment_void_review;actual_after jsonb;
BEGIN
 c:=public.native_employment_void_context_v1(p,'employee.record.approve');
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR octet_length(b::text)>8192 OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(b) x) IS DISTINCT FROM ARRAY['contractId','decision','proposalId','proposalVersion','reason','scopeVersion']::text[] OR EXISTS(SELECT 1 FROM jsonb_each(b) e WHERE jsonb_typeof(e.value)<>'string') OR b->>'contractId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR b->>'proposalId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR b->>'proposalVersion'!~'^[a-f0-9]{64}$' OR b->>'scopeVersion'!~'^[a-f0-9]{64}$' OR b->>'decision' NOT IN('approve','reject') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID';END IF;
 target:=(b->>'contractId')::uuid;reason_value:=normalize(btrim(b->>'reason'),NFC);IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_INPUT_INVALID';END IF;
 b:=b||jsonb_build_object('contractId',target,'proposalId',(b->>'proposalId')::uuid,'reason',reason_value);fp:=public.native_employment_void_hash_v1(jsonb_build_object('version','native-employment-void.v1','operation','review','body',b));
 PERFORM public.native_employment_void_lock_v1(c,target,k);v:=public.native_employment_void_replay_v1(c,target,k,'review',fp);IF v IS NOT NULL THEN RETURN v;END IF;
 IF b->>'decision'='approve' THEN LOCK TABLE public.employment_contract IN ROW EXCLUSIVE MODE NOWAIT;END IF;
 PERFORM 1 FROM public.employment_contract WHERE id=target AND tenant_id=(c->>'tenantId')::uuid FOR UPDATE NOWAIT;
 IF b->>'scopeVersion'<>public.native_employment_void_scope_v1(c,target) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_SCOPE_CHANGED';END IF;
 SELECT * INTO q FROM public.native_employment_void_proposal WHERE id=(b->>'proposalId')::uuid AND contract_id=target AND tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_void_review WHERE proposal_id=q.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_DECIDED';END IF;
 IF NOT public.native_employment_void_can_review_v1(c,q) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_MAKER_CHECKER_REQUIRED';END IF;
 IF b->>'proposalVersion'<>q.proposal_version OR q.proposal_version<>public.native_employment_void_proposal_hash_v1(q) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_PROPOSAL_CHANGED';END IF;
 r.id:=gen_random_uuid();r.tenant_id:=q.tenant_id;r.source_binding_id:=q.source_binding_id;r.contract_id:=target;r.proposal_id:=q.id;r.proposal_version:=q.proposal_version;r.decision:=b->>'decision';r.reason:=reason_value;r.before_contract:=q.before_contract;r.after_contract:=q.before_contract;
 IF r.decision='approve' THEN
  IF public.native_employment_void_dependencies_v1(c,target,true)<>'[]'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_IN_USE';END IF;
  s:=public.native_employment_void_subject_v1(p,c,target);
  IF (s#>>'{state,voided}')::boolean OR s#>>'{contract,status}'<>'active' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN';END IF;
  IF s->>'baseVersion'<>q.base_version OR s->'contract'<>q.before_contract OR s->'registration'<>q.registration_snapshot THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_BASE_CHANGED';END IF;
  r.after_contract:=q.before_contract||jsonb_build_object('status','inactive','updated_at',clock_timestamp());r.applied_xid:=pg_current_xact_id();
 END IF;
 r.actor_membership_id:=(c->>'membershipId')::uuid;r.actor_person_id:=(c->>'actorPersonId')::uuid;r.actor_email:=c->>'actorEmail';r.actor_session_id:=(p->>'actorSessionId')::uuid;r.actor_session_version:=(p->>'actorSessionVersion')::integer;r.release_sha:=p->>'releaseSha';r.actor_label:=c->>'actorLabel';r.request_key:=k;r.request_sha256:=fp;r.reviewed_at:=clock_timestamp();r.review_version:=public.native_employment_void_review_hash_v1(r);
 r.receipt:=jsonb_build_object('version','native-employment-void.v1','operation','review','contractId',target,'proposalId',q.id,'status',CASE r.decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'proposalVersion',q.proposal_version,'approvalId',r.id,'reviewVersion',r.review_version,'supersededProposals',CASE r.decision WHEN 'approve' THEN q.pending_operations ELSE '[]'::jsonb END,'replayed',false,'payrollModified',false,'datesModified',false);
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(to_jsonb(r)::text)+16384);
 INSERT INTO public.native_employment_void_review SELECT (r).*;
 IF r.decision='approve' THEN
  UPDATE public.employment_contract SET status='inactive',updated_at=(r.after_contract->>'updated_at')::timestamptz WHERE id=target AND tenant_id=q.tenant_id RETURNING to_jsonb(employment_contract) INTO actual_after;
  IF actual_after IS DISTINCT FROM r.after_contract OR r.after_contract-ARRAY['status','updated_at'] IS DISTINCT FROM q.before_contract-ARRAY['status','updated_at'] THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_CONTRACT_INVALID';END IF;
 END IF;
 RETURN r.receipt;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_BUSY'; END $$;

-- Installation wrapper must additionally pin all existing caller definitions and
-- install the guards atomically. No newly introduced helper is publicly callable.
REVOKE ALL ON public.native_employment_void_proposal,public.native_employment_void_review FROM PUBLIC,municontrol_actions_runtime_app;
DO $acl$ DECLARE x record;BEGIN FOR x IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'native_employment_void_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',x.sig);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION public.native_employment_void_bootstrap_v1(jsonb,uuid),public.native_employment_void_proposal_v1(jsonb,uuid,uuid),public.native_employment_void_attempt_v1(jsonb,uuid,uuid),public.native_employment_void_propose_v1(jsonb,jsonb,uuid),public.native_employment_void_review_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;

DO $preflight$ BEGIN
 IF to_regprocedure('public.native_employment_void_state_v1(jsonb,uuid)') IS NULL OR to_regprocedure('public.native_employment_void_update_allowed_v1(public.employment_contract,public.employment_contract)') IS NULL THEN RAISE EXCEPTION 'VOID_LEDGER_REQUIRED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)'::regprocedure),'UTF8')),'hex') NOT IN('d039ef408c0d98ba8a785254df57132f27b8c3af584be9807f63d3c9e88ea7f3','6877720de132c06bcf83d554327bed673a593dd566da80b868214b82cb139ee9') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: payroll_fixed_registry_range_v2'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)'::regprocedure),'UTF8')),'hex') NOT IN('a3845c81089cf69e87edf89f5fea073bea5aa6c0f688a3394a607cdf88630523','0aa12309fef1a709f3a08452be48cc25ee625d8bb556f441b63c5d9756bfed69') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: payroll_fixed_registry_subject_v2'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.own_period_classification_source_v1(jsonb,uuid,text)'::regprocedure),'UTF8')),'hex') NOT IN('e161334bf33ac06b1dd669d7779ab8434d4235c147243436a464339597d003be','7386bcb6b0c567b82b3aad94411f1b2ddf29f314f7de5d8a3fe8447501ce5e69') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: own_period_classification_source_v1'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employment_change_propose_v1(jsonb,jsonb,uuid)'::regprocedure),'UTF8')),'hex') NOT IN('114fc7f2658981b332d13fb334c9a7c4ecba9c56025f07a84d675ce60ac4e83d','62a18717d5d2d1b9b5b19c087644066f57d63a9086dada37a2d8754b6d04affa') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: native_employment_change_propose_v1'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employment_change_review_v1(jsonb,jsonb,uuid)'::regprocedure),'UTF8')),'hex') NOT IN('7ed87b6fa1bc7d05c7b2392618dd1eae0e1ec6153af99fad699566b49a652fc0','7976e607165946c326512a386035a35105a5a1d7af164c5c813530e9f1b78460') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: native_employment_change_review_v1'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employment_lifecycle_adopted_propose_v2(jsonb,jsonb,uuid)'::regprocedure),'UTF8')),'hex') NOT IN('835a97c88369cd92dced879a2ced022d03086ef21f8bd7f8449b0dd8cd1ecc96','490bf4ac5f645bfcd6d0ed739155070a9d2d2b5e1bfe63da0baf03fe7392fc2f') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: native_employment_lifecycle_adopted_propose_v2'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employment_lifecycle_adopted_review_v2(jsonb,jsonb,uuid)'::regprocedure),'UTF8')),'hex') NOT IN('702bad882ab1ee675561af76eb9c16c0f5ed1597ae53617cb5cca11e462db87e','e182eb0979f0096b821c81c8400fd2c7e7886461cc417e997590e25ec418b296') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: native_employment_lifecycle_adopted_review_v2'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employee_contract_guard_v1()'::regprocedure),'UTF8')),'hex') NOT IN('47653945a90c5b56798977b1c1d9b259040440573aa3caffbbe1f364fa0456a1','209411418c4ee49fae2ba47a2d8cf91d20cd9b6a33bc4157b6698520d47565a4') THEN RAISE EXCEPTION 'VOID_READER_BASE_CHANGED: native_employee_contract_guard_v1'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_range_v2(ctx jsonb, target uuid, first_date date, last_date date, continuous boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE subject jsonb;state_value jsonb;covered boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employment_adoption_application WHERE contract_id=target)
 THEN RETURN public.native_employment_lifecycle_range_v1(ctx,target,first_date,last_date,continuous); END IF;
 IF ctx->>'sourceBindingId' IS NOT NULL AND ctx->>'certifiedBindingId' IS NOT NULL AND ctx->>'sourceBindingId'<>ctx->>'certifiedBindingId' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 ctx:=ctx||jsonb_build_object('sourceBindingId',coalesce(ctx->>'sourceBindingId',ctx->>'certifiedBindingId'));
 -- An approved correction withdraws the erroneous registration; it declares no employment end date.
 IF public.native_employment_void_state_v1(ctx,target)->'voided'='true'::jsonb THEN RETURN false; END IF;
 subject:=public.own_period_classification_lifecycle_subject_v1(ctx,target,true)->'subject';
 state_value:=public.native_employment_lifecycle_adopted_state_v2(ctx,target,subject);
 IF first_date IS NULL OR (last_date IS NOT NULL AND last_date<first_date) THEN RETURN false; END IF;
 IF continuous THEN covered:=EXISTS(SELECT 1 FROM jsonb_array_elements(state_value->'intervals') r
  WHERE (r->>'startDate')::date<=first_date AND (r->>'endDate' IS NULL OR (last_date IS NOT NULL AND (r->>'endDate')::date>=last_date))); ELSE
 covered:=EXISTS(SELECT 1 FROM jsonb_array_elements(state_value->'intervals') r
  WHERE (last_date IS NULL OR (r->>'startDate')::date<=last_date) AND (r->>'endDate' IS NULL OR (r->>'endDate')::date>=first_date));
 END IF;
 IF NOT covered THEN RETURN false; END IF;
 PERFORM public.payroll_fixed_registry_adopted_subject_v1(ctx,target,true);
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_subject_v2(ctx jsonb, target uuid, hold_lock boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM public.employment_contract c WHERE c.id=target AND c.source_system='MUNICONTROL'
  AND (EXISTS(SELECT 1 FROM public.employment_adoption_application a WHERE a.contract_id=c.id)
   OR (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId'))
 THEN
 IF ctx->>'sourceBindingId' IS NOT NULL AND ctx->>'certifiedBindingId' IS NOT NULL AND ctx->>'sourceBindingId'<>ctx->>'certifiedBindingId' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 IF public.native_employment_void_state_v1(ctx||jsonb_build_object('sourceBindingId',coalesce(ctx->>'sourceBindingId',ctx->>'certifiedBindingId')),target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
 RETURN public.payroll_fixed_registry_adopted_subject_v1(ctx,target,hold_lock); END IF;
 RETURN public.payroll_fixed_registry_subject_by_contract_v1(ctx,target,hold_lock);
END $function$;

CREATE OR REPLACE FUNCTION public.own_period_classification_source_v1(ctx jsonb, target uuid, period_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE c public.employment_contract;n public.native_employee_registration;i public.person_identity;a public.employment_adoption_application;review public.employment_adoption_decision;r public.employment_adoption_proposal;seal public.employment_adoption_seal;
 proof jsonb;final_value jsonb;subject jsonb;scope_value jsonb;v jsonb;field text;token text;BEGIN
 IF target IS NULL OR target='00000000-0000-0000-0000-000000000000'::uuid OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 IF public.native_employment_void_state_v1(ctx,target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND source_system='MUNICONTROL' AND source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NOT_FOUND';END IF;
 SELECT reg.* INTO n FROM public.native_employee_registration reg JOIN public.platform_tenant_source_binding b ON b.id=reg.source_binding_id AND b.tenant_id=reg.tenant_id
 WHERE reg.contract_id=c.id AND reg.person_id=c.person_id AND reg.tenant_id=c.tenant_id AND reg.source_binding_id=(ctx->>'sourceBindingId')::uuid AND b.verified AND b.source_system='GRH' AND b.source_company_id=c.legacy_company_id AND b.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id AND identity_state IN('active','provisional');IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
 SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
 IF a.contract_id IS NOT NULL OR (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' OR c.source_payload#>>'{native,origin}'='GRH' THEN
  SELECT * INTO review FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve' AND tenant_id=c.tenant_id AND source_binding_id=n.source_binding_id;
  SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=review.proposal_id AND tenant_id=review.tenant_id AND source_binding_id=review.source_binding_id;
  SELECT * INTO seal FROM public.employment_adoption_seal WHERE proposal_id=r.id;
  IF a.contract_id IS NULL OR review.id IS NULL OR r.id IS NULL OR seal.proposal_id IS NULL OR a.registration_id<>n.id OR coalesce(r.body->>'version' IN('employment-adoption-input.v3','employment-adoption-input.v4','employment-adoption-input.v5','employment-adoption-input.v6','employment-adoption-input.v7'),false) IS NOT TRUE
   OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM review.id::text
   OR a.after_contract->>'person_id' IS DISTINCT FROM c.person_id::text OR a.before_person->>'id' IS DISTINCT FROM c.person_id::text
   OR a.after_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo OR(a.after_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
   OR seal.facts_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(seal.facts)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(seal.facts) f WHERE f->'contract'=a.before_contract AND f->'person'=a.before_person)
  THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  final_value:=r.before_snapshot#>'{source,finalRevision}';
  IF public.own_program_exact_v1(final_value,ARRAY['revisionId','packageSha256','sourceSha256','cutoff','coreManifestSha256','curatedManifestSha256','factsSha256']) IS NOT TRUE
   OR jsonb_typeof(final_value->'revisionId') IS DISTINCT FROM 'string' OR final_value->>'revisionId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   OR final_value->>'revisionId'='00000000-0000-0000-0000-000000000000'
   OR public.own_program_exact_v1(r.body->'finalSource',ARRAY['revisionId','packageSha256']) IS NOT TRUE
   OR r.body#>>'{finalSource,revisionId}' IS DISTINCT FROM final_value->>'revisionId' OR r.body#>>'{finalSource,packageSha256}' IS DISTINCT FROM final_value->>'packageSha256'
   OR a.after_contract#>>'{source_payload,native,registrationId}' IS DISTINCT FROM n.id::text
   OR a.after_contract#>>'{source_payload,native,adoptionProposalId}' IS DISTINCT FROM r.id::text OR a.after_contract#>>'{source_payload,native,adoptionReviewId}' IS DISTINCT FROM review.id::text
   OR a.after_contract#>>'{source_payload,native,finalRevisionId}' IS DISTINCT FROM final_value->>'revisionId' OR a.after_contract#>>'{source_payload,native,finalPackageSha256}' IS DISTINCT FROM final_value->>'packageSha256'
   OR c.source_payload#>>'{native,finalRevisionId}' IS DISTINCT FROM final_value->>'revisionId' OR c.source_payload#>>'{native,finalPackageSha256}' IS DISTINCT FROM final_value->>'packageSha256'
  THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  FOREACH field IN ARRAY ARRAY['packageSha256','sourceSha256','coreManifestSha256','curatedManifestSha256','factsSha256'] LOOP IF jsonb_typeof(final_value->field) IS DISTINCT FROM 'string' OR final_value->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;END LOOP;
  v:=to_jsonb(final_value->>'cutoff');
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' OR left(v#>>'{}',4)='0000' OR NOT pg_input_is_valid(left(v#>>'{}',10),'date') OR to_char(left(v#>>'{}',10)::date,'YYYY-MM-DD')<>left(v#>>'{}',10) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  IF(SELECT count(*) FROM jsonb_array_elements(r.before_snapshot->'rows') x WHERE x->>'contractId'=c.id::text)<>1 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.before_snapshot->'finalContracts') x WHERE x->>'contractId'=c.id::text AND x->>'personId'=c.person_id::text) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  proof:=jsonb_build_object('kind','employment_adoption_final','registrationId',n.id,'requestSha256',n.request_sha256,'adoptionProposalId',r.id,'adoptionReviewId',review.id,'sealSha256',seal.facts_sha256,'finalRevision',final_value);
 ELSE
  proof:=jsonb_build_object('kind','native_registration','registrationId',n.id,'requestSha256',n.request_sha256);
 END IF;
 -- This source token is independent of runtime novelty/payroll tokens. The
 -- registered person and sealed origin are verified again when facts are used.
 token:=encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-classification-identity.v1',c.tenant_id,n.source_binding_id,c.id,c.person_id,c.legacy_legajo,to_jsonb(n),to_jsonb(i)-ARRAY['created_at','updated_at'],proof)),'sha256'),'hex');
 subject:=jsonb_build_object('origin','MUNICONTROL','contractId',c.id,'personId',c.person_id,'registrationId',n.id,'identityToken',token);
 scope_value:=jsonb_build_object('tenantId',ctx->>'tenantId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::bigint);
 -- Proposals must observe the exact current contract until independent review.
 -- Approved historical facts retain the separate immutable identity/provenance.
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-classification-source.v1',scope_value,period_value,subject,proof,to_jsonb(c))),'sha256'),'hex'),'scope',scope_value,'period',period_value,'subject',subject,'provenance',proof);
END $function$;

CREATE OR REPLACE FUNCTION public.native_employment_change_propose_v1(ctx jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 before_row jsonb; after_row jsonb; values_value jsonb; reason_value text; reference_value text; proposal_id uuid:=gen_random_uuid(); receipt_value jsonb;
BEGIN
 c:=public.native_employment_change_context_v1(ctx,'employee.record.propose');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','catalogVersion','contractId','identityToken','legalReference','reason','scopeVersion','values']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE e.key<>'values' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'catalogVersion'!~'^[a-f0-9]{64}$' OR body->>'identityToken'!~'^[a-f0-9]{64}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; values_value:=public.native_employment_change_values_v1(body->'values');
 reason_value:=normalize(btrim(body->>'reason'),NFC); reference_value:=normalize(btrim(body->>'legalReference'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' OR length(reference_value) NOT BETWEEN 3 AND 180 OR reference_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'values',values_value,'reason',reason_value,'legalReference',reference_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-change.v1','operation','propose','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_change_lock_v1(c,target); replay:=public.native_employment_change_replay_v1(c,target,key,'propose',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO before_row FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 IF public.native_employment_void_state_v1(c,target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
 subject:=public.native_employment_change_subject_v1(c,target);
 IF body->>'identityToken' IS DISTINCT FROM subject->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED'; END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_change_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_SCOPE_CHANGED'; END IF;
 current_value:=public.native_employment_change_state_v1(c,target,subject);
 IF body->>'baseVersion' IS DISTINCT FROM current_value->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED'; END IF;
 catalog:=public.native_employee_catalog_v1(c);
 IF body->>'catalogVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_CATALOG_CHANGED'; END IF;
 after_row:=public.native_employment_change_after_v1(before_row,values_value,catalog);
 IF before_row=after_row THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NO_CHANGE'; END IF;
 IF (SELECT count(*) FROM public.native_employment_change_proposal WHERE contract_id=target)>=100 OR (SELECT count(*) FROM public.native_employment_change_proposal WHERE tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_LIMIT'; END IF;
 PERFORM public.native_employment_change_capacity_v1(octet_length(before_row::text)+octet_length(after_row::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-change.v1','operation','propose','contractId',target,'proposalId',proposal_id,'status','pending','employmentVersion',current_value->>'version','revision',(current_value->>'revision')::integer,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_change_proposal(id,tenant_id,source_binding_id,contract_id,registration_id,subject,base_revision,base_version,catalog_version,before_contract,after_contract,reason,legal_reference,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(proposal_id,(c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,(subject->>'registrationId')::uuid,subject,(current_value->>'revision')::integer,current_value->>'version',catalog->>'version',before_row,after_row,reason_value,reference_value,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END $function$;

CREATE OR REPLACE FUNCTION public.native_employment_change_review_v1(ctx jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 p public.native_employment_change_proposal; snapshot jsonb; reason_value text; decision_value text; revision_value integer; version_value text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_change_context_v1(ctx,'employee.record.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['contractId','decision','proposalId','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR body->>'decision' NOT IN ('approve','reject') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; decision_value:=body->>'decision'; reason_value:=normalize(btrim(body->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'proposalId',(body->>'proposalId')::uuid,'reason',reason_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-change.v1','operation','review','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_change_lock_v1(c,target); replay:=public.native_employment_change_replay_v1(c,target,key,'review',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO snapshot FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 IF decision_value='approve' AND public.native_employment_void_state_v1(c,target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
 subject:=public.native_employment_change_subject_v1(c,target);
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_change_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_change_proposal q WHERE q.id=(body->>'proposalId')::uuid AND q.contract_id=target AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_change_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_DECIDED'; END IF;
 IF NOT public.native_employment_change_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_MAKER_CHECKER_REQUIRED'; END IF;
 IF p.subject IS DISTINCT FROM subject THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED'; END IF;
 current_value:=public.native_employment_change_state_v1(c,target,subject); revision_value:=(current_value->>'revision')::integer; version_value:=current_value->>'version';
 IF decision_value='approve' THEN
  IF p.base_version<>version_value OR p.base_revision<>revision_value OR snapshot<>p.before_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED'; END IF;
  catalog:=public.native_employee_catalog_v1(c);
  IF p.catalog_version IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_CATALOG_CHANGED'; END IF;
  IF p.after_contract IS DISTINCT FROM public.native_employment_change_after_v1(snapshot,public.native_employment_change_display_v1(p.after_contract)->'values',catalog) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED'; END IF;
  IF revision_value>=100 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_LIMIT'; END IF;
  IF EXISTS(SELECT 1 FROM public.native_employment_change_review WHERE contract_id=target AND applied_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END IF;
  revision_value:=revision_value+1; version_value:=public.native_employment_change_version_v1(p.after_contract,subject,revision_value);
 END IF;
 PERFORM public.native_employment_change_capacity_v1(octet_length(p.before_contract::text)+octet_length(p.after_contract::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-change.v1','operation','review','contractId',target,'proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'employmentVersion',version_value,'revision',revision_value,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_change_review(tenant_id,source_binding_id,contract_id,proposal_id,decision,reason,revision,employment_version,applied_xid,before_contract,after_contract,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,p.id,decision_value,reason_value,revision_value,version_value,CASE WHEN decision_value='approve' THEN pg_current_xact_id() END,CASE WHEN decision_value='approve' THEN p.before_contract END,CASE WHEN decision_value='approve' THEN p.after_contract END,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 IF decision_value='approve' THEN
  UPDATE public.employment_contract SET agreement_code=p.after_contract->>'agreement_code',category_code=p.after_contract->>'category_code',organization_unit_source_id=p.after_contract->>'organization_unit_source_id',sector_source_id=p.after_contract->>'sector_source_id',source_payload=p.after_contract->'source_payload' WHERE id=target;
  IF NOT FOUND OR (SELECT to_jsonb(ec) FROM public.employment_contract ec WHERE ec.id=target) IS DISTINCT FROM p.after_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_APPLY_FAILED'; END IF;
 END IF;
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END $function$;

CREATE OR REPLACE FUNCTION public.native_employment_lifecycle_adopted_propose_v2(ctx jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 before_row jsonb; after_row jsonb; values_value jsonb; reason_value text; reference_value text; proposal_id uuid:=gen_random_uuid(); receipt_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.propose');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','contractId','date','identityToken','legalReference','movement','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'identityToken'!~'^[a-f0-9]{64}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; IF body->>'movement' NOT IN ('terminate','reenter') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF; BEGIN values_value:=to_jsonb(public.payroll_fixed_registry_date_v1(body->>'date')); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END;
 reason_value:=normalize(btrim(body->>'reason'),NFC); reference_value:=normalize(btrim(body->>'legalReference'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' OR length(reference_value) NOT BETWEEN 3 AND 180 OR reference_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'reason',reason_value,'legalReference',reference_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-lifecycle.v2','operation','propose','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_lifecycle_lock_v1(c,target); replay:=public.native_employment_lifecycle_replay_v1(c,target,key,'propose',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO before_row FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF public.native_employment_void_state_v1(c,target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
 subject:=public.native_employment_lifecycle_adopted_subject_v2(c,target,ctx);
 IF body->>'identityToken' IS DISTINCT FROM subject->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED'; END IF;
 current_value:=public.native_employment_lifecycle_adopted_state_v2(c,target,subject);
 IF NOT (current_value->>'datesVerified')::boolean THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_REQUIRED'; END IF;
 IF body->>'baseVersion' IS DISTINCT FROM current_value->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
 before_row:=jsonb_build_object('contract',before_row,'intervals',current_value->'intervals');
 after_row:=public.native_employment_lifecycle_adopted_after_v2(before_row,body->>'movement',(body->>'date')::date);
 IF before_row=after_row THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NO_CHANGE'; END IF;
 IF (SELECT count(*) FROM public.native_employment_lifecycle_proposal WHERE contract_id=target)>=100 OR (SELECT count(*) FROM public.native_employment_lifecycle_proposal WHERE tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(before_row::text)+octet_length(after_row::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-lifecycle.v2','operation','propose','contractId',target,'proposalId',proposal_id,'status','pending','employmentVersion',current_value->>'version','revision',(current_value->>'revision')::integer,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_lifecycle_proposal(id,tenant_id,source_binding_id,contract_id,registration_id,subject,base_revision,base_version,movement,movement_date,before_contract,after_contract,reason,legal_reference,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(proposal_id,(c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,(subject->>'registrationId')::uuid,subject,(current_value->>'revision')::integer,current_value->>'version',body->>'movement',(body->>'date')::date,before_row,after_row,reason_value,reference_value,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BUSY'; END $function$;

CREATE OR REPLACE FUNCTION public.native_employment_lifecycle_adopted_review_v2(ctx jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 p public.native_employment_lifecycle_proposal; snapshot jsonb; reason_value text; decision_value text; revision_value integer; version_value text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['contractId','decision','proposalId','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR body->>'decision' NOT IN ('approve','reject') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; decision_value:=body->>'decision'; reason_value:=normalize(btrim(body->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'proposalId',(body->>'proposalId')::uuid,'reason',reason_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-lifecycle.v2','operation','review','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_lifecycle_lock_v1(c,target); replay:=public.native_employment_lifecycle_replay_v1(c,target,key,'review',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO snapshot FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF decision_value='approve' AND public.native_employment_void_state_v1(c,target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
 subject:=public.native_employment_lifecycle_adopted_subject_v2(c,target,ctx);
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_lifecycle_proposal q WHERE q.id=(body->>'proposalId')::uuid AND q.contract_id=target AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_lifecycle_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DECIDED'; END IF;
 IF NOT public.native_employment_lifecycle_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_MAKER_CHECKER_REQUIRED'; END IF;
 IF p.subject IS DISTINCT FROM subject THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 current_value:=public.native_employment_lifecycle_adopted_state_v2(c,target,subject); revision_value:=(current_value->>'revision')::integer; version_value:=current_value->>'version';
 snapshot:=jsonb_build_object('contract',snapshot,'intervals',current_value->'intervals');
 IF decision_value='approve' THEN
  IF NOT (current_value->>'datesVerified')::boolean THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_REQUIRED'; END IF;
  IF p.base_version<>version_value OR p.base_revision<>revision_value OR snapshot<>p.before_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
  IF p.after_contract IS DISTINCT FROM public.native_employment_lifecycle_adopted_after_v2(snapshot,p.movement,p.movement_date) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
  IF revision_value>=100 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
  revision_value:=revision_value+1; version_value:=public.native_employment_lifecycle_version_v1(p.after_contract,subject,revision_value);
 END IF;
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(p.before_contract::text)+octet_length(p.after_contract::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-lifecycle.v2','operation','review','contractId',target,'proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'employmentVersion',version_value,'revision',revision_value,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_lifecycle_review(tenant_id,source_binding_id,contract_id,proposal_id,decision,reason,revision,employment_version,applied_xid,before_contract,after_contract,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,p.id,decision_value,reason_value,revision_value,version_value,CASE WHEN decision_value='approve' THEN pg_current_xact_id() END,CASE WHEN decision_value='approve' THEN p.before_contract END,CASE WHEN decision_value='approve' THEN p.after_contract END,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BUSY'; END $function$;

CREATE OR REPLACE FUNCTION public.native_employee_contract_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.source_system='MUNICONTROL' THEN
  IF TG_OP='UPDATE' AND (public.native_employment_change_update_allowed_v1(OLD,NEW) IS TRUE OR public.native_employment_void_update_allowed_v1(OLD,NEW) IS TRUE) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'NATIVE_EMPLOYEE_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.source_system='MUNICONTROL' THEN
  IF NEW.source_batch_id IS NOT NULL OR NOT EXISTS(
   SELECT 1 FROM native_employee_registration r JOIN platform_tenant_source_binding b ON b.id=r.source_binding_id AND b.tenant_id=r.tenant_id
   WHERE r.contract_id=NEW.id AND r.person_id=NEW.person_id AND r.tenant_id=NEW.tenant_id AND b.source_company_id=NEW.legacy_company_id AND b.verified)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ORIGIN_INVALID'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM employment_contract c WHERE c.source_system='MUNICONTROL' AND c.legacy_company_id=NEW.legacy_company_id AND ltrim(c.legacy_legajo,'0')=ltrim(NEW.legacy_legajo,'0')) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_NUMBER_EXISTS'; END IF;
  IF NEW.tenant_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM source_import_batch b WHERE b.id=NEW.source_batch_id AND b.source_system=NEW.source_system)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ORIGIN_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $function$;

$void_224_definitions$;

 -- Canonical pg_get_functiondef pins from real PostgreSQL 17, without trailing
 -- SQL separators. The eight existing definitions retain the exact owner/ACL.
 FOR item IN SELECT value FROM jsonb_array_elements(critical_pins) LOOP
  proc_oid:=to_regprocedure('public.'||(item->>'signature'));
  SELECT p.*,pg_get_userbyid(p.proowner) AS owner_name INTO row_value FROM pg_proc p WHERE oid=proc_oid;
  IF proc_oid IS NULL OR encode(sha256(convert_to(pg_get_functiondef(proc_oid),'UTF8')),'hex') IS DISTINCT FROM item->>'afterSha256'
   OR row_value.owner_name IS DISTINCT FROM item->>'owner' OR row_value.proacl::text IS DISTINCT FROM item->>'acl' THEN
   RAISE EXCEPTION 'VOID224_EXISTING_POSTCHECK_FAILED: %',item->>'signature';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_employment_void_%')<>21 THEN RAISE EXCEPTION 'VOID224_FUNCTION_COUNT_INVALID';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(core_pins) LOOP
  proc_oid:=to_regprocedure('public.'||(item->>'signature'));
  SELECT p.*,pg_get_userbyid(p.proowner) AS owner_name INTO row_value FROM pg_proc p WHERE oid=proc_oid;
  IF proc_oid IS NULL OR encode(sha256(convert_to(pg_get_functiondef(proc_oid),'UTF8')),'hex') IS DISTINCT FROM item->>'sha256'
   OR row_value.owner_name IS DISTINCT FROM current_user OR row_value.prosecdef IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'VOID224_CORE_POSTCHECK_FAILED: %',item->>'signature';
  END IF;
  IF has_function_privilege(runtime_oid,proc_oid,'EXECUTE') IS DISTINCT FROM ((item->>'signature')=ANY(facades)) THEN
   RAISE EXCEPTION 'VOID224_RUNTIME_ACL_INVALID: %',item->>'signature';
  END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(row_value.proacl,acldefault('f',row_value.proowner))) a
   WHERE a.grantee<>row_value.proowner AND NOT(a.grantee=runtime_oid AND (item->>'signature')=ANY(facades) AND a.privilege_type='EXECUTE' AND a.is_grantable=false)) THEN
   RAISE EXCEPTION 'VOID224_EXTRA_FUNCTION_GRANT: %',item->>'signature';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('native_employment_void_proposal','native_employment_void_review') AND relkind='r')<>2 THEN RAISE EXCEPTION 'VOID224_BOOK_COUNT_INVALID';END IF;
 FOR row_value IN SELECT * FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('native_employment_void_proposal','native_employment_void_review') LOOP
  IF pg_get_userbyid(row_value.relowner) IS DISTINCT FROM current_user
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(row_value.relacl,acldefault('r',row_value.relowner))) a WHERE a.grantee<>row_value.relowner)
   OR has_table_privilege(runtime_oid,row_value.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION 'VOID224_BOOK_ACL_INVALID: %',row_value.relname;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.native_employment_void_proposal) OR EXISTS(SELECT 1 FROM public.native_employment_void_review) THEN RAISE EXCEPTION 'VOID224_BOOKS_NOT_EMPTY';END IF;
 IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN('public.native_employment_void_proposal'::regclass,'public.native_employment_void_review'::regclass) AND t.tgfoid='public.native_employment_void_immutable_v1()'::regprocedure AND t.tgenabled='O')<>2 THEN RAISE EXCEPTION 'VOID224_IMMUTABILITY_TRIGGER_MISSING';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.employment_contract'::regclass AND t.tgname='employment_contract_batch_system' AND t.tgfoid='public.native_employee_contract_guard_v1()'::regprocedure AND NOT t.tgisinternal AND t.tgenabled='O') THEN RAISE EXCEPTION 'VOID224_CONTRACT_TRIGGER_MISSING';END IF;
 RAISE NOTICE 'VOID224_INSTALLED_EMPTY_BOOKS; no municipal decision or contract changed';
END $migration_224$;
