import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildOwnPayrollDurableQa,qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {createOwnPayrollPsqlQa} from './own-payroll-psql-qa.mjs';
export const relocatePositionSql=(source,schema)=>source.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`);
export const POSITION_QA_CAPS=['workforce.employee.read','workforce.structure.read','workforce.structure.prepare','workforce.structure.approve','workforce.structure.assignment.prepare','workforce.structure.assignment.approve','payroll.calculation.read'];
export function buildPositionAssignmentQa(major){
 const qa=buildOwnPayrollDurableQa(major),anchor='    END $seed$; COMMIT;',source=fs.readFileSync(new URL('../migrations/127-annual-position-budget.sql',import.meta.url),'utf8');assert.equal(qa.sql.split(anchor).length,2);
 return {...qa,sql:qa.sql.replace(anchor,()=>`EXECUTE ${q(relocatePositionSql(source,qa.schema))};INSERT INTO capabilities SELECT a.id,c.key FROM unnest(ARRAY[${['maker','checker','samePerson','outsider'].map(n=>q(qa.ids[n])+'::uuid').join(',')}]) a(id) CROSS JOIN unnest(ARRAY[${POSITION_QA_CAPS.map(q).join(',')}]) c(key) WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id=a.id AND old.capability_key=c.key);\n`+anchor)};
}
export function createPositionAssignmentPsqlQa(options){const db=createOwnPayrollPsqlQa(options);return {...db,query:async(query,values)=>{
 assert.match(query,/^SELECT public\.(?:position_assignment_(?:bootstrap|attempt|command|capture)|annual_budget_(?:bootstrap|attempt|command)|own_run_(?:bootstrap|attempt|capture|complete))_v1\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.',options.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return [{result:await db.run(rendered,true)}];
 }};}
