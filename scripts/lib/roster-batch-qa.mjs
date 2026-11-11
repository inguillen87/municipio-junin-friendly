// The roster and the employee pickers read every contract of the municipality in one pass through
// native_employee_roster_projection_batch_v1, a function installed in production outside the numbered migrations. Disposable
// QA schemas built from older fixtures do not have it; this installs the same exact definition (pinned by hash), once.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const ROSTER_BATCH_FUNCTION='native_employee_roster_projection_batch_v1';
export const ROSTER_BATCH_SHA256='3b27f0b7be40a279f9b63009f9a50cafdf2921aadaddf18a7ab839bec79a843e';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";

export function rosterBatchSource(){
 const source=fs.readFileSync(new URL('../../tests/fixtures/own-collective-installed-roster.sql.txt',import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),ROSTER_BATCH_SHA256,'QA_ROSTER_BATCH_SOURCE_CHANGED');
 return source;
}

// `sql` runs a complete script; `relocate` moves the canonical `public.` definition into the disposable schema.
export async function installRosterBatchForQa({sql,schema,relocate}){
 assert.match(schema,/^mc_qa_[a-z0-9_]+$/,'QA_ROSTER_BATCH_DESTINATION');
 const signature=schema+'.'+ROSTER_BATCH_FUNCTION+'(jsonb)';
 await sql('BEGIN;SET LOCAL search_path=pg_catalog,'+schema+',public,pg_temp;DO $roster$ BEGIN IF to_regprocedure('+literal(signature)+') IS NULL THEN EXECUTE '+literal(relocate(rosterBatchSource()))+';EXECUTE '+literal('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC')+';EXECUTE '+literal('GRANT EXECUTE ON FUNCTION '+signature+' TO municontrol_actions_runtime_app')+';END IF;END $roster$;COMMIT');
}
