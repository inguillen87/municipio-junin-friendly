// Pure preparation on the existing monthly190 host. No second foundation or DB.
import assert from 'node:assert/strict';
import {prepareOwnMonthlyFullCapacity} from '../verify-own-monthly-payroll-full-capacity.mjs';
import {prepareMonthlyWithFamily195} from './native-family-self-service-195-same190-qa.mjs';
import {composePositions210Same190} from './positions210-same190-installation.mjs';
import {composePositions211212Same190,POSITIONS211212_ENTRIES} from './positions211212-same190-installation.mjs';
import {composePositions210SidecarPlan,POSITIONS210_SIDECAR_SOURCE_ENTRIES} from './positions210-same190-sidecar.mjs';
import {POSITIONS210_ACTOR_ENTRIES} from './positions210-same190-actors.mjs';

export const POSITIONS210_QA_ENTRIES=Object.freeze([
 'scripts/verify-positions210-same190.mjs',
 'scripts/lib/positions210-same190-composition.mjs',
 'scripts/lib/positions210-same190-installation.mjs',
 'scripts/lib/positions210-same190-native-continuation.mjs',
 'tests/positions210-same190-source.test.js',
 'tests/positions210-same190-actors.test.js',
 'tests/positions210-same190-sidecar.test.js',
 'tests/positions210-same190-driver.test.js',
 ...POSITIONS210_ACTOR_ENTRIES,...POSITIONS211212_ENTRIES,...POSITIONS210_SIDECAR_SOURCE_ENTRIES
]);

export function prepareMonthlyWithPositions210(h,settings={}){
 assert.ok(settings&&typeof settings==='object'&&!Array.isArray(settings)&&(Object.getPrototypeOf(settings)===Object.prototype||Object.getPrototypeOf(settings)===null));
 assert.ok(Reflect.ownKeys(settings).every(key=>key==='family195'),'POSITIONS210_PREPARE_SETTINGS_CLOSED');
 const family195=Object.hasOwn(settings,'family195')?settings.family195:false;assert.equal(typeof family195,'boolean');
 const monthly=family195?prepareMonthlyWithFamily195(h):prepareOwnMonthlyFullCapacity(h);assert.strictEqual(monthly.foundation,h.qa);
 const options={qa:h.qa,major:h.major,sourceCommit:h.sourceCommit,read:h.read};
 const positions210=composePositions210Same190(options);
 const positions211212=composePositions211212Same190(options);
 const positions210Sidecar=composePositions210SidecarPlan({...options,positions210Plan:positions210});
 assert.strictEqual(positions210.foundation,h.qa);assert.strictEqual(positions211212.foundation,h.qa);
 return {foundation:h.qa,context:{...monthly.context,positions210,positions211212,positions210Sidecar},
  // The reviewed root API remains in E's explicit continuationEntries through
  // POSITIONS210_QA_ENTRIES; this preparation tier admits non-root sources only.
  sourceEntries:[...new Set([...monthly.sourceEntries,...positions210.sourceEntries,...positions211212.sourceEntries,...positions210Sidecar.sourceEntries,...POSITIONS210_QA_ENTRIES])].filter(file=>file!=='api/internal-own-art-report.js')};
}
