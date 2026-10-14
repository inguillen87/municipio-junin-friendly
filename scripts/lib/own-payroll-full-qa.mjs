// Admit the real response facade into an older disposable UI foundation.
// It delegates small receipts to that foundation's real installed finalizer.
// Never replace an existing guard or mock completion/authorization.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
export function ownPayrollFullQaInstallation(schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const source=fs.readFileSync(new URL('../migrations/173-own-full-payroll-response.sql',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
 assert.equal(createHash('sha256').update(source).digest('hex'),'53edda88ffd719d2322cddc9caad477d63262023475c8084328d7f97e7ecd084');
 return source.replaceAll('public.',schema+'.').replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,'+schema+',public,pg_temp');
}
