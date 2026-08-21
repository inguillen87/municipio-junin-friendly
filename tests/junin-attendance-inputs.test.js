import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contractUrl = new URL('../contracts/junin-attendance-inputs.v1.json', import.meta.url);

test('contrato de marcacion conserva solo evidencia agregada y estado no homologado', async () => {
  const raw = await readFile(contractUrl, 'utf8');
  const contract = JSON.parse(raw);
  assert.equal(contract.evidenceStatus, 'discovered_not_homologated');
  assert.equal(contract.minimumSchemaMigration, '011-versioned-time-catalog');
  assert.equal(contract.privacy.containsPersonalDataInSource, true);
  assert.equal(contract.privacy.repositoryContainsRowValues, false);
  assert.deepEqual(contract.sources.map((source) => source.rows), [387, 13, 49]);
  assert.doesNotMatch(raw, /\b\d{8}\b/);
  assert.doesNotMatch(raw, /-\d{2}\.\d+\s*,\s*-\d{2}\.\d+/);
  assert.doesNotMatch(raw, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test('inventario refleja modelos, canales y vacios observados sin inventar cobertura', async () => {
  const contract = JSON.parse(await readFile(contractUrl, 'utf8'));
  const roster = contract.sources.find((source) => source.sourceKey === 'employee_area_roster');
  const points = contract.sources.find((source) => source.sourceKey === 'marking_points');
  const organization = contract.sources.find((source) => source.sourceKey === 'organization_chart');
  assert.equal(roster.facts.uniqueIdentifiers, 387);
  assert.equal(roster.facts.identifierSemantics, 'candidate_national_document_pending_municipal_confirmation');
  assert.deepEqual(points.facts.deviceModels, { K20: 11, SF300: 1, MB360: 1 });
  assert.deepEqual(points.facts.extractionChannels, { local_network: 7, offline_media: 6 });
  assert.equal(points.facts.agentCountPresent, 0);
  assert.equal(points.facts.localResponsiblePresent, 0);
  assert.equal(organization.facts.rotatingOrGuardAnswerPresent, 0);
  assert.equal(organization.facts.numericAgentPartialSum, 220);
});

test('fases cierran identidad, captura, privacidad y calculo antes de payroll', async () => {
  const contract = JSON.parse(await readFile(contractUrl, 'utf8'));
  assert.deepEqual(contract.phases.map((phase) => phase.phase), [
    'S006-C1', 'S006-C2', 'S006-C3', 'S006-C4', 'S006-C5', 'S006-C6',
  ]);
  assert.equal(contract.homologationGates.length, 10);
  assert.equal(new Set(contract.homologationGates).size, 10);
  assert.ok(contract.securityAndPrivacyRules.some((rule) => rule.includes('continuous tracking is disabled')));
  assert.ok(contract.securityAndPrivacyRules.some((rule) => rule.includes('never the source of employment identity')));
  assert.ok(contract.securityAndPrivacyRules.some((rule) => rule.includes('Biometric templates remain on the device')));
  assert.ok(contract.phases.find((phase) => phase.phase === 'S006-C5').outcome.includes('payroll export preview'));
  assert.ok(contract.phases.every((phase) => phase.status === 'planned'));
});
