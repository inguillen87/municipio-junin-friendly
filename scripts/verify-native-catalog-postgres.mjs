// Prueba de metadatos exclusivamente en la base desechable native_catalog_qa.
import fs from 'node:fs';import {parseArgs} from 'node:util';import assert from 'node:assert/strict';
import {CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL} from './lib/grh-successor-continuity.mjs';
const {values}=parseArgs({strict:true,options:{'write-sql':{type:'string'},'expected-major':{type:'string'}}});
assert.ok(values['write-sql']);assert.ok(['17','18'].includes(values['expected-major']));
const sql=`BEGIN;
DO $guard$ BEGIN IF current_database()<>'native_catalog_qa' OR current_setting('server_version_num')::int/10000<>${values['expected-major']} THEN RAISE EXCEPTION 'ISOLATED_NATIVE_CATALOG_REQUIRED'; END IF; END $guard$;
CREATE TABLE public.mc_catalog_parent(id uuid,tenant_id uuid,binding_id uuid,PRIMARY KEY(tenant_id,binding_id,id));
CREATE TABLE public.mc_catalog_child(id uuid PRIMARY KEY,tenant_id uuid,binding_id uuid,parent_id uuid,previous_id uuid,
 CONSTRAINT mc_catalog_parent_fk FOREIGN KEY(tenant_id,binding_id,parent_id) REFERENCES public.mc_catalog_parent(tenant_id,binding_id,id),
 CONSTRAINT mc_catalog_self_fk FOREIGN KEY(previous_id) REFERENCES public.mc_catalog_child(id));
CREATE TEMP VIEW inspected_tables AS ${CONTINUITY_TABLES_SQL};
CREATE TEMP VIEW inspected_links AS ${CONTINUITY_FOREIGN_KEYS_SQL};
DO $checks$ DECLARE observed record; BEGIN
 SELECT * INTO STRICT observed FROM inspected_links WHERE name='mc_catalog_parent_fk';
 IF observed.child_columns<>ARRAY['tenant_id','binding_id','parent_id']::text[] THEN RAISE EXCEPTION 'CHILD_COLUMN_ORDER'; END IF;
 IF observed.parent_columns<>ARRAY['tenant_id','binding_id','id']::text[] THEN RAISE EXCEPTION 'PARENT_COLUMN_ORDER'; END IF;
 IF NOT observed.validated OR observed.child_schema<>'public' OR observed.parent_schema<>'public' THEN RAISE EXCEPTION 'CONSTRAINT_METADATA'; END IF;
 IF NOT EXISTS(SELECT 1 FROM inspected_links WHERE name='mc_catalog_self_fk' AND child=parent) THEN RAISE EXCEPTION 'SELF_REFERENCE_MISSING'; END IF;
 SELECT * INTO STRICT observed FROM inspected_tables WHERE name='mc_catalog_child';
 IF observed.kind<>'r' OR observed.columns<>ARRAY['id','tenant_id','binding_id','parent_id','previous_id']::text[] THEN RAISE EXCEPTION 'TABLE_METADATA'; END IF;
 IF EXISTS(SELECT 1 FROM public.mc_catalog_child) THEN RAISE EXCEPTION 'TEST_ROWS_UNEXPECTED'; END IF;
 RAISE NOTICE 'NATIVE_CATALOG_QA: 6 checks passed; metadata only'; END $checks$;
ROLLBACK;
`;
fs.writeFileSync(values['write-sql'],sql);console.log(JSON.stringify({generated:true,checks:6,rollback:true,businessRowsUsed:false}));
