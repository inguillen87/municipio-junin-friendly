import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildOwnCloseQa,createOwnClosePsqlQa} from './own-payroll-close-qa.mjs';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
import {declaredDateCapture} from './own-payroll-run-date-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildOwnAnnulQa(major,{employees=6}={}){
 assert.ok(Number.isSafeInteger(employees)&&employees>=6&&employees<=41);
 const qa=buildOwnCloseQa(major,{employees:6,declaredDate:true}),n=s=>s.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${qa.schema},public,pg_temp`);
 const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'),old=buildOwnCloseSql(read),dated=declaredDateCapture(old.adapted[0]),source=read('scripts/migrations/146-own-consolidated-annulment.sql').replace(/\r\n?/g,'\n'),anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 let extra='';for(let i=6;i<employees;i++){const dni=String(99001000+i),weights=[5,4,3,2,7,6,5,4,3,2],check=v=>11-[...v].reduce((s,d,j)=>s+Number(d)*weights[j],0)%11;let digits='20'+dni,digit=check(digits);if(digit===10){digits='23'+dni;digit=check(digits);}assert.notEqual(digit,10);
  const person={agreementCode:'1',birthDate:'1990-01-01',categoryCode:'1',cuil:digits+(digit===11?'0':String(digit)),dni,fullName:'Persona sintética para revisión completa '+i,jobTitle:'Administración QA',legajo:String(21000+i),legalReference:'Resolución exclusivamente sintética QA',organizationId:'10',sectorCode:'20',sexCode:'X',startDate:'2026-10-01',jurisdictionCode:'42'};
  extra+=`hire:=native_employee_create_v1(maker,${q(JSON.stringify(person))}::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());\n`;
 }
 return {...qa,normalized:n,migration:source,sql:qa.sql.replace(anchor,()=>`EXECUTE ${q(n(dated))};\n${extra}`+anchor)};
}
export function createOwnAnnulPsqlQa(options){const db=createOwnClosePsqlQa(options);return {...db,query:async(query,values)=>{
 if(!/^SELECT public\.own_annul_/.test(query))return db.query(query,values);
 assert.match(query,/^SELECT public\.own_annul_(?:detail|attempt|command)_v1\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.own_annul_',options.schema+'.own_annul_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return[{result:await db.run(rendered,true)}];
 }};}
