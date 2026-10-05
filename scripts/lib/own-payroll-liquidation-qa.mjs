import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildOwnPayrollDurableQa,qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {createOwnPayrollPsqlQa} from './own-payroll-psql-qa.mjs';
export function buildOwnLiquidationQa(major,{employees=2}={}){
 assert.ok(Number.isSafeInteger(employees)&&employees>=2&&employees<=12);
 const qa=buildOwnPayrollDurableQa(major),{schema,ids}=qa;
 const source=fs.readFileSync(new URL('../migrations/124-own-payroll-liquidation-decisions.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const relocated=source.replaceAll('public.',schema+'.').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`);
 let extra=`EXECUTE ${q(relocated)};
 INSERT INTO capabilities SELECT ${q(ids.checker)}::uuid,c FROM unnest(ARRAY['payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.approve','payroll.novelty.export']) c;
 INSERT INTO capabilities SELECT a.id,c.key FROM unnest(ARRAY[${q(ids.samePerson)}::uuid,${q(ids.outsider)}::uuid,${q(ids.unlinked)}::uuid]) a(id) CROSS JOIN unnest(ARRAY['workforce.employee.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.approve','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']) c(key) WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id=a.id AND old.capability_key=c.key);
 hire:=native_employee_create_v1(maker,'{"agreementCode":"1","birthDate":"1990-01-01","categoryCode":"1","cuil":"20990000434","dni":"99000043","fullName":"Segunda persona sintética propia","jobTitle":"Administración QA","legajo":"19043","legalReference":"Resolución sintética QA","organizationId":"10","sectorCode":"20","sexCode":"X","startDate":"2026-10-01","jurisdictionCode":"42"}'::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());`;
 for(let n=2;n<employees;n++){
  const dni=String(99000060+n),digits='20'+dni,weights=[5,4,3,2,7,6,5,4,3,2],digit=11-[...digits].reduce((s,d,i)=>s+Number(d)*weights[i],0)%11;assert.ok(digit!==10);
  const values={agreementCode:'1',birthDate:'1990-01-01',categoryCode:'1',cuil:digits+(digit===11?'0':String(digit)),dni,fullName:'Persona exclusivamente sintética QA '+n,jobTitle:'Administración QA',legajo:String(19100+n),legalReference:'Resolución sintética QA',organizationId:'10',sectorCode:'20',sexCode:'X',startDate:'2026-10-01',jurisdictionCode:'42'};
  extra+=`\n hire:=native_employee_create_v1(maker,${q(JSON.stringify(values))}::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());`;
 }
 const anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);return {...qa,sql:qa.sql.replace(anchor,()=>extra+'\n'+anchor)};
}
export function createOwnLiquidationPsqlQa(options){
 const db=createOwnPayrollPsqlQa(options);return {...db,query:async(query,values)=>{
  if(/^SELECT public\.own_run_/.test(query))return db.query(query,values);
  assert.match(query,/^SELECT public\.own_liquidation_(?:bootstrap|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
  const rendered=query.replaceAll('public.own_liquidation_',options.schema+'.own_liquidation_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return [{result:await db.run(rendered,true)}];
 }};
}
