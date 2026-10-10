import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildJournalQa,createJournalPsqlQa} from './own-payroll-journal-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildReconciliationQa(major){
 const qa=buildJournalQa(major),source=fs.readFileSync(new URL('../migrations/153-own-payroll-reconciliation.sql',import.meta.url),'utf8');
 return{...qa,reconciliationMigration:splitPostgresStatements(source).map(qa.normalized)};
}
export function createReconciliationPsqlQa(options){const db=createJournalPsqlQa(options);return{...db,query:async(query,values)=>{
 if(!query.startsWith('SELECT public.own_reconciliation_'))return db.query(query,values);
 assert.match(query,/^SELECT public\.own_reconciliation_(?:bootstrap|source|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.',options.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return[{result:await db.run(rendered,true)}];
}};}
