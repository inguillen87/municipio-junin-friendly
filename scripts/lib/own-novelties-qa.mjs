// Synthetic loopback foundation includes the actual published SQL125 guards.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildOwnPayrollDurableQa,qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
export function buildOwnNoveltyQa(major){
 const qa=buildOwnPayrollDurableQa(major),read=f=>fs.readFileSync(new URL('../../'+f,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
 const relocate=s=>s.replaceAll('public.',qa.schema+'.').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+qa.schema+',public,pg_temp');
 const extra=`EXECUTE ${q(relocate(read('scripts/migrations/124-own-payroll-liquidation-decisions.sql')))};EXECUTE ${q(relocate(buildOwnCloseSql(read).sql))};
 INSERT INTO capabilities SELECT ${q(qa.ids.checker)}::uuid,c FROM unnest(ARRAY['payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.approve','payroll.calculation.close','payroll.novelty.export']) c WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id=${q(qa.ids.checker)}::uuid AND old.capability_key=c);`;
 const anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);return {...qa,sql:qa.sql.replace(anchor,()=>extra+'\n'+anchor)};
}
