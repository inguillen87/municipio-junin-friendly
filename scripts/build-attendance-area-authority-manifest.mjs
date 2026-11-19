// Local source bytes only. Does not connect to PostgreSQL or grant authority.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expectedDeviceSourceFunctions} from './build-attendance-expected-devices-source-manifest.mjs';
const sourcePath = 'scripts/candidates/attendance-area-authority-v1.source.sql.txt';
const output = new URL('./candidates/attendance-area-authority-v1.source.manifest.json', import.meta.url);
const root = new URL('../', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readFileSync(new URL(sourcePath, root), 'utf8');
const prerequisites = [
  'scripts/migrations/004-tenant-iam-control-plane.sql', 'scripts/migrations/006-tenant-action-authority.sql',
  'scripts/migrations/010-governed-time-source-registry.sql', 'scripts/migrations/022-attendance-device-gateway.sql',
  'scripts/migrations/103-native-employment-catalog.sql', 'scripts/migrations/116-native-time-catalog.sql',
];
const manifest = {
  version: 'attendance-area-authority-source.v1', sourceFile: sourcePath, sourceSha256: digest(source),
  baseCommit: 'ad0d80d989b736dee52a0102ef3200b8905b65b2',
  installed: false, installable: false, sqlExecuted: false, sqlEngineValidated: false, NoeliaReady: false,
  originalSourcePins: prerequisites.map(path => ({path, sha256: digest(readFileSync(new URL(path, root)))})),
  functions: expectedDeviceSourceFunctions(source).map(({body, ...row}) => ({...row, candidateRuntimeFacade: false})),
  newTables: ['public.attendance_area_scope', 'public.attendance_area_scope_event'],
  capabilities: ['attendance.area.read', 'attendance.area.devices.propose', 'attendance.area.devices.approve', 'attendance.area.devices.audit.read'],
  semantics: {
    grants: 'none; explicit per-action grants and effective IAM required together',
    nullSector: 'exact area without a sector, never organization-wide or company-wide',
    areaLabels: 'unique organization/sector selections from native_employee_catalog_v1; no labels supplied by the requester',
    scopeVersion: 'session, verified actor, binding, company, source database, all effective area grants and catalogue version',
    audit: 'versioned scope event; UPDATE/DELETE/TRUNCATE cannot erase event history',
    person: 'read can lack a verified actor link; proposal and decision cannot',
  },
  compositionRequired: ['pin actual prerequisite schema, function settings, ownership, trigger metadata and ACL closure',
    'validate candidate and concurrency in the independently authorized isolated laboratory',
    'provision only explicitly approved grants; no role names or leave scopes confer automatic access'],
};
const bytes = JSON.stringify(manifest, null, 2) + '\n';
if (process.argv.slice(2).join(' ') === '--check') {
  if (readFileSync(output, 'utf8') !== bytes) throw new Error('Authority manifest differs from current exact source bytes.');
  process.stdout.write('Area authority manifest matches exact local source bytes. No SQL executed.\n');
} else if (process.argv.length === 2) {
  writeFileSync(output, bytes); process.stdout.write('Area authority source manifest written. No SQL executed.\n');
} else throw new Error('Usage: node scripts/build-attendance-area-authority-manifest.mjs [--check]');
