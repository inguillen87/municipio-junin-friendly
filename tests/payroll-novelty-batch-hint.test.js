import test from 'node:test';
import assert from 'node:assert/strict';
import { batchDecisionHint } from '../assets/payroll-novelty-batch-hint.js';

const owner = { capabilities: ['payroll.novelty.read', 'payroll.novelty.approve'], employmentLinked: false };
const checker = { capabilities: ['payroll.novelty.read', 'payroll.novelty.approve'], employmentLinked: true };

test('a submitted batch says who decides, from the commands the server allows', () => {
  assert.match(batchDecisionHint({ status: 'submitted', allowedCommands: ['approve', 'reject'] }, checker).text, /^Podés aprobarlo o rechazarlo/);
  const mine = batchDecisionHint({ status: 'submitted', allowedCommands: ['cancel'] }, owner);
  assert.equal(mine.yours, true); assert.match(mine.text, /Lo preparaste vos: podés cancelarlo/);
  assert.match(batchDecisionHint({ status: 'submitted', allowedCommands: [] }, owner).text, /no está vinculada a un legajo/);
  assert.doesNotMatch(batchDecisionHint({ status: 'submitted', allowedCommands: [] }, checker).text, /vinculada a un legajo/);
  assert.match(batchDecisionHint({ status: 'submitted', allowedCommands: [] }, { capabilities: ['payroll.novelty.read'] }).text, /persona con permiso de aprobación/);
});

test('drafts and closed batches', () => {
  assert.equal(batchDecisionHint({ status: 'draft', allowedCommands: ['submit', 'cancel'] }, owner).yours, true);
  assert.equal(batchDecisionHint({ status: 'approved', allowedCommands: [] }, owner), null);
  assert.equal(batchDecisionHint(null, null), null);
});
