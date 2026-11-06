import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('GRH import and ART report retry the bootstrap read on 409 SESSION_BUSY, never a command', () => {
  const workflow = fs.readFileSync(new URL('../assets/payroll-control-import-workflow.js', import.meta.url), 'utf8');
  assert.match(workflow, /const isRead = !init\?\.method \|\| String\(init\.method\)\.toUpperCase\(\) === 'GET';/);
  assert.match(workflow, /if \(!isRead \|\| response\.status !== 409 \|\| attempt >= 3\) break;/);
  assert.match(workflow, /peek\?\.code !== 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY'/);
  assert.match(workflow, /PAYROLL_CONTROL_IMPORT_SESSION_BUSY: 'El acceso se está actualizando\. Probá de nuevo en unos segundos\.'/);
  const art = fs.readFileSync(new URL('../assets/payroll-art-report-workbench.js', import.meta.url), 'utf8');
  assert.match(art, /if \(response\.status !== 409 \|\| attempt >= 3\) break;/);
  assert.match(art, /peek\?\.code !== 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY'/);
});
