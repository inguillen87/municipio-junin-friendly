// Ensayo de REINDEX concurrente sólo en base desechable; genera datos sintéticos y los retira al terminar.
import fs from 'node:fs';import {parseArgs} from 'node:util';import assert from 'node:assert/strict';
const {values}=parseArgs({strict:true,options:{'write-sql':{type:'string'},'expected-major':{type:'string',default:'17'}}});
assert.ok(values['write-sql']);assert.ok(['17','18'].includes(values['expected-major']));
const sql=`DO $guard$ BEGIN
 IF current_database()<>'index_capacity_qa' OR current_setting('server_version_num')::int/10000<>${values['expected-major']} THEN RAISE EXCEPTION 'ONLY_ISOLATED_INDEX_QA'; END IF;
 IF to_regclass('public.mc_capacity_source') IS NOT NULL THEN RAISE EXCEPTION 'QA_TABLE_ALREADY_PRESENT'; END IF;
END $guard$;
SET statement_timeout='60s'; SET lock_timeout='2s';
CREATE TABLE public.mc_capacity_source(id integer PRIMARY KEY, reference text UNIQUE NOT NULL);
INSERT INTO public.mc_capacity_source SELECT g,'reference-'||lpad(g::text,6,'0')||repeat('x',120) FROM generate_series(1,20000) g;
UPDATE public.mc_capacity_source SET reference=reference||'x';
DELETE FROM public.mc_capacity_source WHERE id>1000;
VACUUM ANALYZE public.mc_capacity_source;
CREATE TEMP TABLE qa_before AS SELECT count(*) AS rows,md5(string_agg(id::text||reference,'' ORDER BY id)) AS row_hash,
 (SELECT pg_get_indexdef('public.mc_capacity_source_reference_key'::regclass)) AS definition,
 (SELECT pg_relation_size('public.mc_capacity_source_reference_key'::regclass)) AS index_bytes FROM public.mc_capacity_source;
REINDEX INDEX CONCURRENTLY public.mc_capacity_source_reference_key;
DO $checks$ DECLARE b record;r record;idx record;BEGIN
 SELECT * INTO b FROM qa_before;SELECT count(*) AS rows,md5(string_agg(id::text||reference,'' ORDER BY id)) AS row_hash INTO r FROM public.mc_capacity_source;
 IF r.rows<>1000 OR r.row_hash<>b.row_hash THEN RAISE EXCEPTION 'ROW_PRESERVATION'; END IF;
 SELECT * INTO idx FROM pg_index WHERE indexrelid='public.mc_capacity_source_reference_key'::regclass;
 IF NOT idx.indisvalid OR NOT idx.indisready OR NOT idx.indisunique THEN RAISE EXCEPTION 'INDEX_VALIDITY'; END IF;
 IF pg_get_indexdef(idx.indexrelid)<>b.definition THEN RAISE EXCEPTION 'DEFINITION_CHANGED'; END IF;
 IF pg_relation_size(idx.indexrelid)>=b.index_bytes THEN RAISE EXCEPTION 'SYNTHETIC_BLOAT_NOT_RECLAIMED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.mc_capacity_source'::regclass AND conindid=idx.indexrelid AND contype='u') THEN RAISE EXCEPTION 'CONSTRAINT_LINK_LOST'; END IF;
 BEGIN INSERT INTO public.mc_capacity_source VALUES(30000,(SELECT reference FROM public.mc_capacity_source WHERE id=1)); RAISE EXCEPTION 'UNIQUE_NOT_ENFORCED'; EXCEPTION WHEN unique_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.mc_capacity_source)<>1000 THEN RAISE EXCEPTION 'DUPLICATE_LEAKED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname~'_cc(new|old)[0-9]*$') THEN RAISE EXCEPTION 'TEMP_INDEX_LEFT'; END IF;
 RAISE NOTICE 'INDEX_CAPACITY_QA: 8 checks passed; synthetic only';
END $checks$;
DROP TABLE public.mc_capacity_source;
`;
fs.writeFileSync(values['write-sql'],sql);console.log(JSON.stringify({generated:true,checks:8,syntheticOnly:true,requiresAutocommit:true,productionCommandsExecuted:0}));
