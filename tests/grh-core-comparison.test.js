import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCoreRows, compareGrhCoreArtifacts } from '../scripts/compare-grh-core-artifacts.mjs';
import { streamDeterministicJsonArray } from '../scripts/lib/canonical-import.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

const row = (id, amount = '1.00') => ({ sourceKey: { companyCode: '1', employeeNumber: id }, amount });

test('comparison detects unchanged, changed, added and removed source records without returning nominal values', async () => {
  const result = await compareCoreRows([row('private-a'), row('private-b'), row('private-c')],
    [row('private-a'), row('private-b', '2.00'), row('private-d')]);
  assert.deepEqual([result.unchanged, result.changed, result.added, result.removed], [1, 1, 1, 1]);
  assert.equal(result.baselineRows, 3);
  assert.equal(result.candidateRows, 3);
  assert.ok(result.changedPreviousLogicalPayloadBytes > 0);
  assert.equal(result.changedPreviousLogicalPayloadBytes, result.addedLogicalPayloadBytes);
  assert.doesNotMatch(JSON.stringify(result), /private-|amount|employeeNumber/);
});

test('comparison retains exact decimal strings, null values, absence and source key types', async () => {
  const before = [row('1', '1.00'), { sourceKey: { id: 2 }, field: null }, { sourceKey: { id: 3 }, field: '' }];
  const after = [row('1', '1.0'), { sourceKey: { id: 2 } }, { sourceKey: { id: '3' }, field: '' }];
  const result = await compareCoreRows(before, after);
  assert.deepEqual([result.unchanged, result.changed, result.added, result.removed], [0, 2, 1, 1]);
});

test('comparison is order independent including nested key order and accepts asynchronous iterables', async () => {
  async function* rows() { yield { amount: '1.00', sourceKey: { employeeNumber: '1', companyCode: '1' } }; }
  const result = await compareCoreRows([row('1')], rows());
  assert.equal(result.unchanged, 1);
});

test('duplicate or missing keys fail closed even when duplicate payloads agree', async () => {
  await assert.rejects(compareCoreRows([row('1'), row('1')], []), { code: 'GRH_CORE_COMPARISON_DUPLICATE_BASELINE_KEY' });
  await assert.rejects(compareCoreRows([], [row('1'), row('1')]), { code: 'GRH_CORE_COMPARISON_DUPLICATE_CANDIDATE_KEY' });
  for (const sourceKey of [undefined, null, [], {}, 'private']) {
    await assert.rejects(compareCoreRows([{ sourceKey }], []), { code: 'GRH_CORE_COMPARISON_SOURCE_KEY_REQUIRED' });
  }
});

test('bundle comparison requires explicit forward profiles before reading private files', async () => {
  await assert.rejects(compareGrhCoreArtifacts(), { code: 'GRH_CORE_COMPARISON_EXPLICIT_PROFILES_REQUIRED' });
  await assert.rejects(compareGrhCoreArtifacts({ baseline: { profileId: 'grh-junin-2026-09-10' },
    candidate: { profileId: 'grh-junin-2026-08-06' } }), { code: 'GRH_CORE_COMPARISON_FORWARD_SAME_SOURCE_REQUIRED' });
});

test('the compared stream verifies its own bytes even if a separate earlier hash matched',async(t)=>{
  const directory=await mkdtemp(path.join(tmpdir(),'core-stream-unit-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    assert.match(path.basename(directory),/^core-stream-unit-/);await rm(directory,{recursive:true,force:true});});
  const file=path.join(directory,'artifact.json');
  const original='[\n'+JSON.stringify(row('1','1.00'))+'\n]\n';
  const altered=original.replace('1.00','2.00');
  const descriptor={bytes:Buffer.byteLength(original),records:1,sha256:createHash('sha256').update(original).digest('hex')};
  await writeFile(file,altered);
  await assert.rejects(compareCoreRows(streamDeterministicJsonArray(file,descriptor),[]),{code:'GRH_CORE_STREAM_CONTENT_CHANGED'});
  await writeFile(file,original);
  const result=await compareCoreRows(streamDeterministicJsonArray(file,descriptor),[row('1')]);
  assert.equal(result.unchanged,1);
});
