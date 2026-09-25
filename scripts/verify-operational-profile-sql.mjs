// Regresión PostgreSQL con identidades sintéticas; ejecuta el contexto real y revierte todo.
import fs from 'node:fs';import {parseArgs} from 'node:util';import assert from 'node:assert/strict';
const {values}=parseArgs({strict:true,options:{'write-sql':{type:'string'},'expected-major':{type:'string'}}});
assert.ok(values['write-sql']);assert.ok(['17','18'].includes(values['expected-major']));
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const pre=`BEGIN; SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN IF current_database()<>'staff_task_qa' OR current_setting('server_version_num')::int/10000<>${values['expected-major']} THEN RAISE EXCEPTION 'ONLY_STAFF_TASK_QA'; END IF; END $guard$;
`;
const reproduce=`DO $before$ BEGIN
 BEGIN
  PERFORM public.school_certificate_context_v1('operator@qa.invalid','44444444-4444-4444-8444-444444444444',1,repeat('a',40),'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
  RAISE EXCEPTION 'QA_OLD_BUG_NOT_REPRODUCED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'SCHOOL_CERTIFICATE_SESSION_INVALID' THEN RAISE; END IF; END;
 BEGIN PERFORM tenant_iam_assert_no_sod_conflict('22222222-2222-4222-8222-222222222222'); RAISE EXCEPTION 'QA_OLD_PROFILE_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'TENANT_IAM_SOD_CONFLICT' THEN RAISE; END IF; END;
 RAISE NOTICE 'OPERATIVE_PROFILE_QA: reproduced catalog conflict and false session expiry';
END $before$;
`;
fs.writeFileSync(values['write-sql'],pre+read('./fixtures/operational-profile-schema.sql')+'\n'+read('./fixtures/operational-profile-before.sql')+'\n'+reproduce+read('./migrations/107-operational-profile-catalog.sql')+'\n'+read('./fixtures/operational-profile-checks.sql')+'\n'+read('./fixtures/operational-profile-negative.sql')+'\nROLLBACK;\n');
console.log(JSON.stringify({generated:true,syntheticIdentities:true,originalSessionFunctions:true,rollback:true,productionWrites:0}));
