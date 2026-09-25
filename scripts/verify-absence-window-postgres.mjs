// Generates a synthetic, rollback-only SQL check for the existing disposable CI database.
import fs from 'node:fs';import assert from 'node:assert/strict';import {parseArgs} from 'node:util';
import {absenceWindowSql} from '../lib/absence-window-sql.js';
import {windowSource} from '../tests/fixtures/absence-window-synthetic.js';
const {values}=parseArgs({options:{'write-sql':{type:'string'}},strict:true});assert.ok(values['write-sql']);
const date=v=>v===null?'NULL':`DATE '${v}'`;
const rows=windowSource().map(e=>`(101,'QA1001',${date(e.date)},${date(e.untilDate)},${e.declaredDays??'NULL'})`);
rows.push("(102,'QA1001',DATE '2026-09-01',DATE '2026-09-10',500)","(101,'QA9999',DATE '2026-09-01',DATE '2026-09-10',700)");
let sql=`BEGIN;
SET LOCAL statement_timeout = '15s';
DO $guard$ BEGIN IF current_database() <> 'payroll_selection_qa' THEN RAISE EXCEPTION 'ONLY_DISPOSABLE_SELECTION_QA'; END IF; END $guard$;
CREATE TEMP TABLE absence_window_qa (company_id bigint,legajo text,fecha date,fecha_hasta date,dias numeric) ON COMMIT DROP;
INSERT INTO absence_window_qa VALUES ${rows.join(',\n')};\n`;
for(const mode of ['starts','overlaps'])sql+=`CREATE FUNCTION pg_temp.absence_${mode}(date,date,bigint,text) RETURNS TABLE(fecha date,fecha_hasta date,dias numeric) LANGUAGE sql AS $query$
SELECT a.fecha,a.fecha_hasta,a.dias FROM pg_temp.absence_window_qa a WHERE a.company_id=$3 AND a.legajo=$4 AND ${absenceWindowSql('a',mode)};
$query$;\n`;
sql+=`DO $checks$ DECLARE n integer; total numeric; BEGIN
SELECT count(*) INTO n FROM pg_temp.absence_starts('2026-09-01','2026-09-10',101,'QA1001'); IF n<>10 THEN RAISE EXCEPTION 'START_COUNT'; END IF;
SELECT count(*),sum(dias) INTO n,total FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA1001'); IF n<>40 OR total<>1059 THEN RAISE EXCEPTION 'OVERLAP_COUNT_AND_FULL_DAYS'; END IF;
SELECT count(*) INTO n FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA1001') WHERE fecha<'2026-09-01'; IF n<>30 THEN RAISE EXCEPTION 'BEGAN_BEFORE'; END IF;
SELECT count(*) INTO n FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA1001') WHERE fecha_hasta IS NULL; IF n<>1 THEN RAISE EXCEPTION 'UNKNOWN_END_NOT_INFINITE'; END IF;
SELECT count(*) INTO n FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA1001') WHERE fecha_hasta='2033-08-08'; IF n<>1 THEN RAISE EXCEPTION 'SOURCE_DATE_CHANGED'; END IF;
SELECT count(*) INTO n FROM (SELECT * FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA1001') ORDER BY fecha DESC LIMIT 25 OFFSET 25) page; IF n<>15 THEN RAISE EXCEPTION 'SECOND_PAGE'; END IF;
SELECT count(*) INTO n FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',102,'QA1001'); IF n<>1 THEN RAISE EXCEPTION 'COMPANY_ISOLATION'; END IF;
SELECT count(*) INTO n FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA9999'); IF n<>1 THEN RAISE EXCEPTION 'LEGAJO_ISOLATION'; END IF;
SELECT count(*) INTO n FROM pg_temp.absence_overlaps('2026-09-01','2026-09-10',101,'QA1001') WHERE fecha<'2026-08-01' OR fecha>'2026-09-10'; IF n<>0 THEN RAISE EXCEPTION 'OUTSIDE_OR_INVALID_EARLY_RANGE'; END IF;
RAISE NOTICE 'ABSENCE_WINDOW_QA: 9 checks passed; synthetic rows only';
END $checks$;
ROLLBACK;
`;
fs.writeFileSync(values['write-sql'],sql);console.log(JSON.stringify({generated:true,checks:9,syntheticOnly:true,rollback:true,sqlExecuted:false}));
