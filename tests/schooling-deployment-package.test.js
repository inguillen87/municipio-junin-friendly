import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSchoolingSourceQa} from '../scripts/verify-schooling-source-recovery-sql.mjs';

const ignore=fs.readFileSync('.vercelignore','utf8').split(/\r?\n/);
const migrations=['002-canonical-integration.sql','007-action-center-read-facades.sql','057-family-schooling-certificates.sql','064-employee-family-members.sql','091-schooling-administrative-records.sql','094-schooling-source-recovery.sql','102-native-family-schooling.sql'];
for(const name of migrations)test('schooling deployment preserves actual QA SQL dependency '+name,()=>{
 const file='scripts/migrations/'+name;assert.ok(fs.statSync(file).isFile());assert.ok(ignore.lastIndexOf('!'+file)>ignore.lastIndexOf('*.sql'),'Schema dependency excluded from Vercel build: '+file);
});
for(const file of ['scripts/extract_schooling_source.py','scripts/extract_rrhh_curated.py','tests/test_extract_schooling_source.py'])test('schooling deployment retains the exact offline extractor dependency '+file,()=>{
 assert.ok(fs.statSync(file).isFile());assert.ok(ignore.lastIndexOf('!'+file)>ignore.lastIndexOf('*.py'),'Python dependency excluded from release package: '+file);
});
test('schooling package keeps verifier/importer and the source registry without admitting private backups',()=>{
 for(const file of ['scripts/verify-schooling-source-recovery-sql.mjs','scripts/verify-schooling-records-sql.mjs','scripts/import-schooling-source.mjs','scripts/lib/grh-source-profiles.json']){
  assert.ok(fs.statSync(file).isFile());assert.ok(!ignore.includes(file));
 }
 for(const root of ['scripts/','scripts/lib/','tests/'])assert.ok(!ignore.includes(root),'Parent directory excludes schooling dependencies: '+root);
 for(const excluded of ['verification/','.env*','*.dump','*.sql.gz','*.backup*','data-rrhh/'])assert.ok(ignore.includes(excluded));
 for(const unsafe of ['!*.sql','!*.py','!*.sql.gz','!verification/','!.env*'])assert.ok(!ignore.includes(unsafe));
});
for(const major of [17,18])test('packaged 094 verifier resolves its full 091 migration chain for PostgreSQL '+major,()=>{
 const result=buildSchoolingSourceQa({serverMajor:major});assert.equal(result.report.serverMajor,major);assert.ok(result.report.checksPassed>40);assert.deepEqual(result.report.actualMigrations,['007','057','064','091','094']);assert.match(result.sql,/ROLLBACK;/);assert.equal(result.report.municipalRowsWritten,0);
});
test('production checks include anonymous v4 reads while registration probes stay v3',()=>{
 const s=fs.readFileSync('scripts/verify-family-schooling-production.mjs','utf8');
 assert.match(s,/anonymousV4Report:await privateCheck\('\?resource=report&version=4',undefined,401\)/);
 assert.match(s,/anonymousV4Family:await privateCheck\('\?resource=family&version=4&contractId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',undefined,401\)/);
 assert.match(s,/anonymousV3Upload:await privateCheck\('\?version=3',\{method:'POST'/);assert.doesNotMatch(s,/privateCheck\('\?version=4',\{method:'POST'/);
 assert.match(s,/credentials:'omit',cache:'no-store',redirect:'manual'/);
});
