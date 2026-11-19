// Pure file metadata only. This script never connects to or executes SQL.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

const sourceUrl = new URL('./candidates/attendance-expected-devices-v1.source.sql.txt', import.meta.url);
const manifestUrl = new URL('./candidates/attendance-expected-devices-v1.source.manifest.json', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');

export function expectedDeviceSourceFunctions(source) {
  const pattern = /CREATE FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\)\s+RETURNS\s+([a-z][a-z0-9_.]*)\s+LANGUAGE\s+(sql|plpgsql)([\s\S]*?)\s+AS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\6;/g;
  const functions = [...source.matchAll(pattern)].map(match => {
    const [declaration, name, args, returns, language, options, , body] = match;
    const parameters = args.trim() ? args.split(',').map(arg => {
      const item = arg.trim().match(/^([a-z_]+)\s+([a-z0-9_.]+(?:\[\])?)(?:\s+DEFAULT\s+(NULL|false))?$/);
      if (!item) throw new Error('Unrecognized source parameter: ' + arg);
      return {name: item[1], type: item[2], default: item[3] ?? null};
    }) : [];
    const settings = [...options.matchAll(/SET\s+([a-z_]+)=([^\s]+)/g)].map(m => m[1] + '=' + m[2]);
    return {
      name, signature: `public.${name}(${parameters.map(p => p.type).join(',')})`, parameters, returns, language,
      volatility: options.match(/\b(IMMUTABLE|STABLE|VOLATILE)\b/)?.[1] ?? 'VOLATILE',
      securityDefiner: /\bSECURITY DEFINER\b/.test(options), settings,
      prosrcSha256: sha(body), declarationSha256: sha(declaration),
      candidateRuntimeFacade: ['attendance_expected_devices_read_v1', 'attendance_expected_devices_command_v1'].includes(name),
      body,
    };
  });
  if (functions.length !== (source.match(/^CREATE FUNCTION /gm) ?? []).length || !functions.length) {
    throw new Error('A SQL function was not covered by the metadata parser. No manifest written.');
  }
  return functions;
}

export function expectedDeviceSourceManifest(source) {
  return {
    version: 'attendance-expected-devices-source.v1',
    sourceFile: 'scripts/candidates/attendance-expected-devices-v1.source.sql.txt', sourceSha256: sha(source),
    baseCommit: 'ad0d80d989b736dee52a0102ef3200b8905b65b2',
    installable: false, installed: false, sqlExecuted: false, sqlEngineValidated: false,
    noeliaReady: false, payrollPosted: false, coverageCertified: false,
    prerequisiteSources: [
      'scripts/candidates/attendance-area-authority-v1.source.sql.txt',
      'scripts/candidates/attendance-area-history-v1.source.sql.txt',
      'scripts/migrations/022-attendance-device-gateway.sql',
      'scripts/migrations/116-native-time-catalog.sql',
    ],
    externalFunctions: [
      'public.attendance_area_context_v1(jsonb,text)',
      'public.attendance_area_assert_scope_v1(jsonb,jsonb)',
      'public.attendance_area_history_v1(jsonb,uuid,date,date)',
      'public.time_catalog_native_actor_v2(uuid,uuid,uuid)',
    ],
    newTables: ['proposal', 'review', 'retirement', 'attempt'].map(x => 'public.attendance_expected_device_' + x),
    functions: expectedDeviceSourceFunctions(source).map(({body, ...metadata}) => metadata),
    technicalLimits: {queryBytes: 8192, commandBytes: 32768, selectedDevices: 100, deviceCatalogue: 1000, populationCandidates: 2000, rangeDayDifference: 366, pageSize: 100},
    semantics: {
      areaNullSector: 'exact, never a wildcard',
      devices: 'explicit, nonempty exhaustive declaration for one contract, not inferred from observations',
      makerChecker: 'different actor person and membership',
      retire: 'independent reviewer, explicit effectiveFrom, append-only; earlier dates retained',
      unknownPopulation: 'known scoped members retained; complete=false blocks whole-area conclusions',
      scopeVersion: 'fresh session, identity, binding, capabilities, all area grants and authorized catalogue labels',
      recovery: 'same actor, membership, binding, session, scope and exact JSON body; stored immutable result',
      deviceNamespace: 'attendance_device.id from inventory022; no inferred clock-store key',
      coverage: 'a declaration never certifies transfer, marks, workday coverage, absence or payroll',
    },
    compositionRequired: [
      'review and pin exact prerequisite schemas, trigger metadata, ACLs and complete dependency closure',
      'validate SQL and race behavior in the independently authorized isolated laboratory',
      'remove source-only barrier only inside an explicitly reviewed composed installer',
      'grant only the two facade signatures after release attestation; helpers and tables remain private',
      'provision explicit area scopes and capabilities through the authorized installation lane',
    ],
  };
}

export function renderExpectedDeviceSourceManifest(source) {
  return JSON.stringify(expectedDeviceSourceManifest(source), null, 2) + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = readFileSync(sourceUrl, 'utf8');
  const expected = renderExpectedDeviceSourceManifest(source);
  if (process.argv.slice(2).join(' ') === '--check') {
    if (readFileSync(manifestUrl, 'utf8') !== expected) throw new Error('Source manifest differs from the exact current bytes.');
    process.stdout.write('Expected-device source manifest matches exact bytes. No SQL executed.\n');
  } else {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/build-attendance-expected-devices-source-manifest.mjs [--check]');
    writeFileSync(manifestUrl, expected);
    process.stdout.write('Wrote ' + fileURLToPath(manifestUrl) + '. No SQL executed.\n');
  }
}
