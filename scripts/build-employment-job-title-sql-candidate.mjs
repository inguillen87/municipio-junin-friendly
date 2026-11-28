// Fixed source inputs and text outputs only: no SQL client, shell or network.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEmploymentJobTitleSqlCandidate,JOB_TITLE_SQL_INPUTS} from './lib/employment-job-title-sql-candidate.mjs';

const url=path=>new URL('../'+path,import.meta.url);
const input=Object.fromEntries(Object.entries(JOB_TITLE_SQL_INPUTS).map(([name,{path}])=>[name,readFileSync(url(path),'utf8')]));
const proposal=buildEmploymentJobTitleSqlCandidate(input),{functions,sql,...metadata}=proposal;
const sqlPath='scripts/candidates/employment-job-title-writers-v1.source.sql.txt';
const manifestPath='scripts/candidates/employment-job-title-writers-v1.source.manifest.json';
const manifest={...metadata,functions:functions.map(({body,sql,...value})=>value),
 output:{path:sqlPath,bytes:Buffer.byteLength(sql,'utf8'),sha256:createHash('sha256').update(sql,'utf8').digest('hex')}};
writeFileSync(url(sqlPath),sql,'utf8');
writeFileSync(url(manifestPath),JSON.stringify(manifest,null,2)+'\n','utf8');
process.stdout.write(JSON.stringify({source:manifest.output,manifest:manifestPath,installable:false,executesSql:false})+'\n');
