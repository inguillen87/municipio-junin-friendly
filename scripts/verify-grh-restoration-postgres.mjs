// Genera pruebas sintéticas reversibles para PostgreSQL. No recibe una URL de conexión.
import fs from 'node:fs';import {parseArgs} from 'node:util';import {canonicalRestorationExpression as canonical} from './lib/grh-restoration-expression.mjs';import {restorationRowsSql} from './lib/grh-restoration-proof.mjs';
const {values}=parseArgs({options:{'write-sql':{type:'string'},'expected-major':{type:'string',default:'17'}},strict:true});
if(!values['write-sql']||!['17','18'].includes(values['expected-major']))throw Error('RESTORATION_QA_ARGUMENT');
const booleanValues="(VALUES(TRUE),(FALSE),(NULL::boolean))";
const expressions=[
 ['boolean_and','(((a.v) AND (b.v)) AND (c.v))',`${booleanValues} a(v) CROSS JOIN ${booleanValues} b(v) CROSS JOIN ${booleanValues} c(v)`],
 ['boolean_or','((a.v) OR ((b.v) OR (c.v)))',`${booleanValues} a(v) CROSS JOIN ${booleanValues} b(v) CROSS JOIN ${booleanValues} c(v)`],
 ['mixed_boolean','(((a.v) OR (b.v)) AND ((c.v) AND (a.v)))',`${booleanValues} a(v) CROSS JOIN ${booleanValues} b(v) CROSS JOIN ${booleanValues} c(v)`],
 ['nullable_array',"x.v = ANY ((ARRAY['approved'::character varying, 'O''Brien'::character varying, 'ñ日本'::character varying,NULL::character varying])::text[])","(VALUES('approved'::text),('O''Brien'),('ñ日本'),('other'),(NULL)) x(v)"],
 ['cast_per_element',"x.v <> ALL (ARRAY[('approved'::character varying)::text, ('other'::character varying)::text,(NULL::character varying)::text])","(VALUES('approved'::text),('other'),('else'),(NULL)) x(v)"],
 ['nested_range','(((x.v >= 1) AND (x.v <= 4)) AND (x.v IS NOT NULL))','(VALUES(NULL::integer),(0),(1),(2),(4),(5)) x(v)']
];
let sql=`BEGIN; SET LOCAL statement_timeout='15s';
DO $guard$ BEGIN
 IF current_setting('server_version_num')::int/10000<>${values['expected-major']} OR current_setting('neon.project_id',true) IS NOT NULL AND current_setting('neon.project_id',true)<>''
 OR current_database() NOT IN ('restoration_expression_qa','municontrol_recovery_qa')
 OR (current_database()='municontrol_recovery_qa' AND (host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55472)) THEN RAISE EXCEPTION 'RESTORATION_DISPOSABLE_QA_ONLY'; END IF;
END $guard$;
`;
for(const [name,expression,scope]of expressions){const normalized=canonical(expression).sql;sql+=`DO $check$ BEGIN IF EXISTS(SELECT 1 FROM ${scope} WHERE (${expression}) IS DISTINCT FROM (${normalized})) THEN RAISE EXCEPTION 'RESTORATION_QA_${name}'; END IF; END $check$;\n`;}
sql+=`CREATE TEMP TABLE restoration_hash_qa(id integer,value text) ON COMMIT DROP;
INSERT INTO restoration_hash_qa VALUES(1,'uno'),(2,'O''Brien'),(3,NULL);
CREATE TEMP TABLE restoration_digest_before ON COMMIT DROP AS ${restorationRowsSql('pg_temp','restoration_hash_qa')};
DELETE FROM restoration_hash_qa; INSERT INTO restoration_hash_qa VALUES(3,NULL),(2,'O''Brien'),(1,'uno');
DO $check$ DECLARE actual record; expected record; BEGIN SELECT * INTO expected FROM restoration_digest_before; SELECT * INTO actual FROM (${restorationRowsSql('pg_temp','restoration_hash_qa')}) r; IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'RESTORATION_ORDER_CHANGED'; END IF; END $check$;
UPDATE restoration_hash_qa SET value='alterado' WHERE id=1;
DO $check$ DECLARE actual record; expected record; BEGIN SELECT * INTO expected FROM restoration_digest_before; SELECT * INTO actual FROM (${restorationRowsSql('pg_temp','restoration_hash_qa')}) r; IF actual IS NOT DISTINCT FROM expected THEN RAISE EXCEPTION 'RESTORATION_VALUE_NOT_DETECTED'; END IF; END $check$;
ROLLBACK;
SELECT 'RESTORATION_QA: 8 checks passed; all temporary changes rolled back' AS result;
`;
fs.writeFileSync(values['write-sql'],sql);console.log(JSON.stringify({generated:true,checks:8,postgresMajor:Number(values['expected-major']),synthetic:true,rollback:true,sqlExecuted:false}));
