import test from 'node:test';import assert from 'node:assert/strict';
import {salarySeniorityBrowserRoute} from '../scripts/lib/own-salary-seniority-browser.mjs';
import {OWN_PAYROLL_READINESS_ROSTER_URL} from '../assets/own-payroll-readiness-model.js';
test('built seniority browser passes the real complete own roster v2 request to its actual directory handler',()=>{
 assert.equal(salarySeniorityBrowserRoute(OWN_PAYROLL_READINESS_ROSTER_URL),'directory');
 assert.equal(salarySeniorityBrowserRoute('/api/internal-data?resource=employees&view=novelty-selector'),'directory');
 assert.equal(salarySeniorityBrowserRoute('/api/internal-own-salary-seniority?resource=bootstrap'),'seniority');
 assert.equal(salarySeniorityBrowserRoute('/api/internal-own-payroll-program?resource=bootstrap'),'program');
 for(const url of ['/api/internal-data?resource=nativeroster','/api/internal-data?resource=nativeroster&schema=1','/api/internal-data?resource=unknown','/api/unrelated?resource=nativeroster&schema=2'])assert.equal(salarySeniorityBrowserRoute(url),null);
});
