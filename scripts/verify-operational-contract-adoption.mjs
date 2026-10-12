// Reuses the isolated full-source QA harness. No real business data or URLs.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {verifyRegistryOriginalFacts} from './verify-registry-original-facts.mjs';
import {noeliaCircuitOptions} from './lib/noelia-circuit-runtime.mjs';
import {operationalAdoptionQaScenario} from './lib/operational-contract-adoption-qa.mjs';
export const verifyOperationalAdoption=options=>verifyRegistryOriginalFacts({...options,registryScenario:operationalAdoptionQaScenario});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyOperationalAdoption(noeliaCircuitOptions(process.argv.slice(2))).then(r=>console.log(JSON.stringify({major:r.major,passed:r.passed,checksPassed:r.checksPassed,syntheticSchemaRemoved:r.syntheticSchemaRemoved,priorDatabasePreserved:r.priorDatabasePreserved}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
