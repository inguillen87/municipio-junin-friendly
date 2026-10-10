import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildImputationQa,createImputationPsqlQa} from './own-payroll-imputation-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildJournalQa(major){
 const qa=buildImputationQa(major),read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
 return {...qa,journalMigration:splitPostgresStatements(read('scripts/migrations/148-own-payroll-imputation.sql')+'\n'+read('scripts/migrations/152-own-payroll-journal.sql')).map(qa.normalized)};
}
export function createJournalPsqlQa(options){const db=createImputationPsqlQa(options);return {...db,query:async(query,values)=>{
 if(!query.startsWith('SELECT public.own_journal_'))return db.query(query,values);
 assert.match(query,/^SELECT public\.own_journal_(?:bootstrap|source|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.',options.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return[{result:await db.run(rendered,true)}];
}};}
