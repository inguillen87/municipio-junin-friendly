import {readFile, writeFile} from 'node:fs/promises';
import {ATTENDANCE_AREA_WORKDAYS_ORIGINAL, ATTENDANCE_AREA_WORKDAYS_CANDIDATE,
  deriveAttendanceAreaWorkdaysCandidate, attendanceAreaWorkdaysCandidateManifest} from './lib/attendance-area-workdays-candidate.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check') || args.length > 1) throw new Error('Usage: node scripts/build-attendance-area-workdays-candidate.mjs [--check]');
const sql = deriveAttendanceAreaWorkdaysCandidate(await readFile(ATTENDANCE_AREA_WORKDAYS_ORIGINAL, 'utf8'));
const manifestPath = 'scripts/candidates/attendance-area-workdays-v1.source.manifest.json';
const manifest = attendanceAreaWorkdaysCandidateManifest(sql);
const bytes = JSON.stringify(manifest, null, 2) + '\n';
if (args.includes('--check')) {
  if (await readFile(ATTENDANCE_AREA_WORKDAYS_CANDIDATE, 'utf8') !== sql || await readFile(manifestPath, 'utf8') !== bytes) throw new Error('ATTENDANCE_AREA_DERIVED_SOURCE_DRIFT');
} else {
  await writeFile(ATTENDANCE_AREA_WORKDAYS_CANDIDATE, sql);
  await writeFile(manifestPath, bytes);
}
console.log(JSON.stringify({candidate:ATTENDANCE_AREA_WORKDAYS_CANDIDATE, sha256:manifest.candidate.sha256,
  operation:args.includes('--check') ? 'checked_source_files' : 'wrote_source_files', sqlExecuted:false}));
