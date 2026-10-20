import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildOwnLiquidationQa,createOwnLiquidationPsqlQa} from './own-payroll-liquidation-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
export function buildOwnCloseQa(major,options={}){
 const qa=buildOwnLiquidationQa(major,options),built=buildOwnCloseSql(file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'));
 const relocated=built.sql.replaceAll('public.',qa.schema+'.').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${qa.schema},public,pg_temp`);
 const anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 return {...qa,sql:qa.sql.replace(anchor,()=>`EXECUTE ${q(relocated)}; INSERT INTO capabilities SELECT a.id,'payroll.calculation.close' FROM unnest(ARRAY[${q(qa.ids.checker)}::uuid,${q(qa.ids.samePerson)}::uuid,${q(qa.ids.maker)}::uuid]) a(id);\n`+anchor)};
}
export function createOwnClosePsqlQa(options){const db=createOwnLiquidationPsqlQa(options);return {...db,query:async(query,values)=>{
 if(!/^SELECT public\.own_close_/.test(query))return db.query(query,values);
 assert.match(query,/^SELECT public\.own_close_(?:detail|attempt|group|command)_v1\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.own_close_',options.schema+'.own_close_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return [{result:await db.run(rendered,true)}];
}};}
