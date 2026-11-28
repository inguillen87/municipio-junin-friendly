import {readFile, open, unlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {composeAgreement, AgreementCompositionError} from '../assets/own-program-agreement-composer.js';

const usage = 'node scripts/compose-agreement.mjs --definition <json> --overrides <json> [--coverage-decisions <json>] --output <json> --report <json>';
const cliError = (code, message) => new AgreementCompositionError(code, message);
function parse(args) {
  const allowed = ['definition', 'overrides', 'coverage-decisions', 'output', 'report'], flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2), value = args[i + 1];
    if (!args[i]?.startsWith('--') || !allowed.includes(key) || Object.hasOwn(flags, key) || !value || value.startsWith('--'))
      throw cliError('COMPOSER_CLI_USAGE', usage);
    flags[key] = path.resolve(value);
  }
  if (!['definition', 'overrides', 'output', 'report'].every(k => flags[k])) throw cliError('COMPOSER_CLI_USAGE', usage);
  const paths = Object.values(flags).map(p => process.platform === 'win32' ? p.toLowerCase() : p);
  if (new Set(paths).size !== paths.length) throw cliError('COMPOSER_CLI_PATH_CONFLICT', 'Usá archivos distintos para las entradas, el resultado y el reporte.');
  return flags;
}
async function json(file) {
  try { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw cliError('COMPOSER_CLI_INPUT_INVALID', 'No se pudo leer una entrada JSON válida. No se muestra su contenido ni su ruta.'); }
}
// Exclusive creation: never overwrite a source, symlink, or an existing result.
// Both handles must be acquired before writing either artifact.
async function writePair(files) {
  const acquired = [];
  try {
    for (const [file, contents] of files) acquired.push({file, contents, handle: await open(file, 'wx')});
    for (const entry of acquired) { await entry.handle.writeFile(entry.contents, 'utf8'); await entry.handle.sync(); }
  } catch (error) {
    for (const entry of acquired) {
      await entry.handle.close().catch(() => {});
      await unlink(entry.file).catch(() => {});
    }
    throw cliError('COMPOSER_CLI_OUTPUT_FAILED', error.code === 'EEXIST' ? 'Una salida ya existe; no se sobrescribió.' : 'No se pudieron escribir ambos archivos de salida.');
  }
  for (const entry of acquired) await entry.handle.close();
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  const flags = parse(args);
  const [definition, overrides, coverageDecisions] = await Promise.all([
    json(flags.definition), json(flags.overrides), flags['coverage-decisions'] ? json(flags['coverage-decisions']) : [],
  ]);
  if (!overrides || typeof overrides !== 'object') throw cliError('COMPOSER_CLI_INPUT_INVALID', 'El archivo de diferencias debe ser un objeto.');
  const result = composeAgreement(definition, {source: overrides.source, target: overrides.target, period: overrides.period, overrides, coverageDecisions});
  await writePair([[flags.output, JSON.stringify(result.definition, null, 2) + '\n'], [flags.report, JSON.stringify(result.report, null, 2) + '\n']]);
  console.log(JSON.stringify({counts: result.report.counts, removedBindings: result.report.removedBindings.length,
    addedBindings: result.report.addedBindings.length, renamedPolicies: result.report.renamedPolicies.length,
    generatedPolicies: result.report.generatedPolicies.length, appliedOverrides: result.report.appliedOverrides.length,
    unresolvedOverrides: result.report.unresolvedOverrides.length, coverageDecisions: result.report.coverageDecisions.length}));
  // An incomplete draft is written with its report, but is never a successful CLI run.
  if (!result.report.complete) process.exitCode = 2;
  return result;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    if (error instanceof AgreementCompositionError) {
      console.error(`${error.code}: ${error.message}`);
      if (error.details.overrideId) console.error(`Diferencia: ${error.details.overrideId}; coincidencias: ${error.details.matches ?? 0}.`);
    } else console.error('COMPOSER_CLI_FAILED: La composición falló; no se imprime contenido de la definición.');
    process.exitCode = 1;
  });
}
