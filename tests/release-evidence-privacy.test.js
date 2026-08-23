import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

const durableEvidence = [
  'CODEX_HANDOFF_JUNIN_ENTERPRISE.md',
  'docs/COMPETITIVE_PRODUCT_ROADMAP.md',
  'docs/IDENTITY_PRODUCTION_AUDIT_20260821.md',
  'docs/GRH_TIME_SOURCE_DISCOVERY_20260819.md',
  'docs/JUNIN_ATTENDANCE_INPUTS_20260821.md',
  'docs/CIVITAS_ESUELDOS_EVIDENCE_20260821.md',
  'contracts/grh-junin-mariadb-to-canonical.v1.json',
  'contracts/junin-attendance-inputs.v1.json',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('la evidencia durable no versiona la identidad administrativa consultada', () => {
  const text = durableEvidence.map(read).join('\n');
  const identityAudit = read('docs/IDENTITY_PRODUCTION_AUDIT_20260821.md');

  assert.match(identityAudit, /identificador consultado[\s\S]+fuera de Git/i);
  assert.doesNotMatch(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
});

test('los anexos agregados no incluyen coordenadas exactas ni URLs con credenciales', () => {
  const text = durableEvidence.map(read).join('\n');

  assert.doesNotMatch(text, /(?<![A-Za-z0-9])-[0-9]{1,3}\.[0-9]{4,}[,; ]+-[0-9]{1,3}\.[0-9]{4,}(?![A-Za-z0-9])/);
  assert.doesNotMatch(text, /(?:postgres(?:ql)?|mysql|mariadb):\/\/\S+/i);
  assert.doesNotMatch(text, /https?:\/\/\S*@\S+/i);
});
