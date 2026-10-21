// Source integration order only. This test neither imports navigation nor
// proves the clipboard, layout, IAM, HTTP or native municipal flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const nav=readFileSync(new URL('../assets/payroll-navigation.js',import.meta.url),'utf8');
test('deep-link reference is queued before synchronous task workspace activation',()=>{
 assert.ok(nav.indexOf('requestedOwnAnnulPreparation(location.search)')>nav.indexOf('calculationPanel=mountOwnPayrollRun'));
 assert.ok(nav.indexOf('calculationPanel.queuePreparation(requestedPreparation)')<nav.indexOf('workspace=taskWorkspace('));assert.ok(nav.includes("initial:requestedPreparation?'calculo':'resumen'"));
});
