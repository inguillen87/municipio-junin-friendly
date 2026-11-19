// Derive reviewable source files only. This program has no SQL client, network
// connection, shell invocation, installation or applied metadata/ACL change.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEmploymentPrintCandidate} from './lib/own-employment-print-candidate.mjs';

const files={
 captureSource:'scripts/migrations/237-own-approved-period-values.sql',
 printFactsSource:'scripts/candidates/originals/own-receipt-print-facts-v6.sql.txt',
 helperSource:'scripts/candidates/own-employment-print-facts-v1.source.sql.txt',
 familyMembersSource:'scripts/candidates/originals/receipt-v6-family-members.json',
};
const url=path=>new URL('../'+path,import.meta.url);
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
const input=Object.fromEntries(Object.entries(files).map(([name,path])=>[name,readFileSync(url(path),'utf8')]));
const proposal=buildEmploymentPrintCandidate(input);
const sqlPath='scripts/candidates/own-employment-print-facts-v1.derived.sql.txt';
const manifestPath='scripts/candidates/own-employment-print-facts-v1.derived.manifest.json';
const {functions,sql,...metadata}=proposal;
const manifest={...metadata,
 inputs:Object.fromEntries(Object.entries(files).map(([name,path])=>[name,{path,sha256:digest(input[name])}])),
 functions:functions.map(({body,sql,...metadata})=>metadata),
 output:{path:sqlPath,bytes:Buffer.byteLength(sql,'utf8'),sha256:digest(sql)},
};
writeFileSync(url(sqlPath),sql,'utf8');
writeFileSync(url(manifestPath),JSON.stringify(manifest,null,2)+'\n','utf8');
process.stdout.write(JSON.stringify({source:manifest.output,manifest:manifestPath,installable:false,executesSql:false})+'\n');
