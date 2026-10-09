import fs from 'node:fs';import path from 'node:path';import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('native bank workbench is included and connected without a legacy source reader or new writer',()=>{
 const nav=read('assets/payroll-navigation.js'),build=read('scripts/build-friendly.mjs'),panel=read('assets/own-bank-output-panel.js');assert.ok(nav.includes("{id:'banco',label:'Salida bancaria',nodes:[bankOutput]}"));
 for(const file of ['assets/own-bank-output-model.js','assets/own-bank-output-panel.js','assets/own-bank-output-panel.css'])assert.ok(build.includes("'"+file+"'"));
 assert.ok(panel.includes('/api/internal-own-payroll-receipts?'));assert.ok(panel.includes('/api/internal-own-bank-accounts?resource=bootstrap'));assert.doesNotMatch(panel,/localStorage|sessionStorage|method\s*:\s*['"]POST|internal-payroll-bank-source|release-info\.json/);
});
test('QA rejects database, executable and partial-scope overrides before any synthetic work',()=>{
 for(const option of ['--psql=another-executor','--database=production','--port=5432','--rows=1','--url=https://example.invalid','--major=18 --major=17']){const r=spawnSync(process.execPath,['scripts/verify-own-bank-output-ui.mjs',...option.split(' ')],{cwd:root,encoding:'utf8',windowsHide:true});assert.notEqual(r.status,0);assert.match(r.stderr,/BANK_OUTPUT_QA_OPTION/);}
 const workflow=read('.github/workflows/own-bank-output.yml');assert.match(workflow,/pg: \[17, 18\]/);assert.ok(workflow.includes('--transport=ci'));assert.ok(workflow.includes('--source-commit=${{ github.sha }}'));assert.doesNotMatch(workflow,/secrets\.|release-info\.json|continue-on-error/);
});
