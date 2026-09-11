/** Keep tie-breaking aligned with the existing detail reader. */
import fs from 'node:fs';
const file='scripts/migrations/051-payroll-document-library.sql';
const before=fs.readFileSync(file,'utf8');
const after=before.replace('ORDER BY d.imported_at DESC,d.id DESC) AS revision_rank','ORDER BY d.imported_at DESC,d.id ASC) AS revision_rank');
if(after!==before)fs.writeFileSync(file,after);
const suite='tests/payroll-document-library.test.js';let tests=fs.readFileSync(suite,'utf8');
if(!tests.includes('library revision tie matches the existing detail reader')){
 tests+="\ntest('library revision tie matches the existing detail reader',()=>{assert.match(fs.readFileSync('scripts/migrations/051-payroll-document-library.sql','utf8'),/ORDER BY d.imported_at DESC,d.id ASC\\) AS revision_rank/);assert.match(fs.readFileSync('scripts/migrations/048-payroll-detail-source.sql','utf8'),/ORDER BY d.imported_at DESC,d.id LIMIT 1/)});\n";
 fs.writeFileSync(suite,tests);
}
