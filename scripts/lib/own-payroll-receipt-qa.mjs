import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildOwnCloseQa,createOwnClosePsqlQa} from './own-payroll-close-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildOwnReceiptQa(major,{types=['monthly'],...options}={}){
 assert.ok(Array.isArray(types)&&types.length&&types.every(t=>['monthly','first_fortnight','sac','vacation','supplementary','final','other'].includes(t))&&new Set(types).size===types.length);
 const qa=buildOwnCloseQa(major,options),source=fs.readFileSync(new URL('../migrations/126-own-payroll-receipts.sql',import.meta.url),'utf8');
 // These are the invented arithmetic rules in the existing synthetic program,
 // explicitly enabled for this test's five types; never municipal formulas.
 assert.equal(qa.sql.split('"liquidationTypes":["monthly"]').length,7);
 qa.sql=qa.sql.replaceAll('"liquidationTypes":["monthly"]','"liquidationTypes":'+JSON.stringify([...types].sort()));
 const relocated=source.replaceAll('public.',qa.schema+'.').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${qa.schema},public,pg_temp`),anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 return {...qa,sql:qa.sql.replace(anchor,()=>`EXECUTE ${q(relocated)}; INSERT INTO capabilities VALUES(${q(qa.ids.maker)}::uuid,'payroll.calculation.approve'); INSERT INTO capabilities SELECT a.id,c.key FROM unnest(ARRAY[${q(qa.ids.checker)}::uuid,${q(qa.ids.maker)}::uuid,${q(qa.ids.samePerson)}::uuid]) a(id) CROSS JOIN unnest(ARRAY['payroll.receipt.prepare','payroll.receipt.approve']) c(key);\n`+anchor)};
}
export function createOwnReceiptPsqlQa(options){const db=createOwnClosePsqlQa(options);return {...db,query:async(query,values)=>{
 if(!/^SELECT public\.own_receipt_/.test(query))return db.query(query,values);
 assert.match(query,/^SELECT public\.own_receipt_(?:preview|list|batch|attempt|command|self)_v1\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.own_receipt_',options.schema+'.own_receipt_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return [{result:await db.run(rendered,true)}];
}};}
