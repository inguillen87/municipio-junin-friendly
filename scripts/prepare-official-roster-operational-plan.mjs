// Opt-in local file preparation. No API, SQL, environment credentials or uploads.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareOfficialRosterOperationalPlan} from './lib/official-roster-operational-plan.mjs';

export function prepareOperationalPlanFile({input, output, sourceSha256, companyCode, deferredPolicy, root}) {
  const destination = path.resolve(output), privateRoot = fs.realpathSync(path.join(root, '.handoff'));
  const parent = fs.realpathSync(path.dirname(destination));
  if (!destination.endsWith('.json') || parent !== privateRoot || fs.existsSync(destination)) throw new Error('PRIVATE_NEW_OUTPUT_REQUIRED');
  const bytes = fs.readFileSync(input);
  if (createHash('sha256').update(bytes).digest('hex') !== sourceSha256) throw new Error('SOURCE_BYTES_CHANGED');
  const plan = prepareOfficialRosterOperationalPlan({rows: JSON.parse(bytes.toString('utf8')), sourceSha256, companyCode, deferredPolicy});
  fs.writeFileSync(destination, JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  return {version: plan.version, sourceSha256, selectionSha256: plan.selectionSha256, counts: plan.counts, effects: plan.effects};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}, allowed = ['input', 'output', 'sourceSha256', 'companyCode', 'deferredPolicy'];
    for (const argument of process.argv.slice(2)) {
      const match = /^--([^=]+)=(.+)$/.exec(argument);
      if (!match || !allowed.includes(match[1]) || Object.hasOwn(options, match[1])) throw new Error('EXACT_ARGUMENTS_REQUIRED');
      options[match[1]] = match[2];
    }
    if (Object.keys(options).length !== allowed.length) throw new Error('EXACT_ARGUMENTS_REQUIRED');
    console.log(JSON.stringify(prepareOperationalPlanFile({...options, root: path.resolve(import.meta.dirname, '..')})));
  } catch (error) { console.error(JSON.stringify({passed: false, message: error.message})); process.exitCode = 1; }
}
