import assert from 'node:assert/strict';
import {isPromise} from 'node:util/types';

// Exact non-root entries already inherited from the canonical190 foundation.
// Keep their source bytes in custody; this never admits api/, src/ or dotfiles generally.
const fixedFoundationSourceEntries = new Set([
  'package.json', 'package-lock.json',
  'api/internal-municipal-owner-salary.js',
  'src/islands/NativeSalaryCatalog.jsx',
  '.vercelignore',
  'api/internal-municipal-owner-program.js'
]);

// Source preparation only. This helper neither constructs SQL nor executes it.
// Keep live references: the host rotates the actor's MFA session before business.
export function prepareOwnerProgramQaContinuation(prepare, context) {
  assert.ok(prepare === null || typeof prepare === 'function', 'OWNER_PROGRAM_QA_PREPARATION_INVALID');
  if (prepare === null) return {context: null, sourceEntries: []};
  assert.notEqual(Object.prototype.toString.call(prepare), '[object AsyncFunction]', 'OWNER_PROGRAM_QA_PREPARATION_SYNC_REQUIRED');
  const prepared = prepare(context);
  if (isPromise(prepared)) {
    // Observe a rejected native Promise without invoking a custom thenable.
    Promise.prototype.then.call(prepared, undefined, () => {});
    assert.fail('OWNER_PROGRAM_QA_PREPARATION_SYNC_REQUIRED');
  }
  assert.ok(prepared && typeof prepared === 'object' && !Array.isArray(prepared) && typeof prepared.then !== 'function', 'OWNER_PROGRAM_QA_PREPARATION_SYNC_REQUIRED');
  assert.deepEqual(Object.keys(prepared).sort(), ['context', 'foundation', 'sourceEntries']);
  assert.strictEqual(prepared.foundation, context.qa, 'OWNER_PROGRAM_QA_PREPARATION_FOUNDATION_CHANGED');
  assert.ok(prepared.context && typeof prepared.context === 'object' && !Array.isArray(prepared.context), 'OWNER_PROGRAM_QA_PREPARATION_CONTEXT_REQUIRED');
  assert.ok(Array.isArray(prepared.sourceEntries) && prepared.sourceEntries.length > 0, 'OWNER_PROGRAM_QA_PREPARATION_SOURCES_REQUIRED');
  for (const value of prepared.sourceEntries) {
    assert.equal(typeof value, 'string', 'OWNER_PROGRAM_QA_PREPARATION_SOURCE_INVALID');
    assert.ok((/^(?:assets|lib|scripts|tests)\/[A-Za-z0-9_.\/-]+$/.test(value) || fixedFoundationSourceEntries.has(value)) && !value.includes('..') && !value.endsWith('/') && !value.includes('//'), 'OWNER_PROGRAM_QA_PREPARATION_SOURCE_INVALID');
  }
  assert.equal(new Set(prepared.sourceEntries).size, prepared.sourceEntries.length, 'OWNER_PROGRAM_QA_PREPARATION_DUPLICATE_SOURCE');
  return {context: prepared.context, sourceEntries: [...prepared.sourceEntries]};
}
