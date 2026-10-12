import path from 'node:path';import {fileURLToPath} from 'node:url';
import {verifyRegistryOriginalFacts} from './verify-registry-original-facts.mjs';
import {operationalAdoptionQaScenario} from './lib/operational-contract-adoption-qa.mjs';
import {adoptionAdministrativeIdentityQaScenario} from './lib/adoption-administrative-identity-qa.mjs';
import {adoptionSourceStreamingQaScenario} from './lib/adoption-source-streaming-qa.mjs';
import {noeliaCircuitOptions} from './lib/noelia-circuit-runtime.mjs';
// Inspect preparation while the source still awaits its independent decision.
// Then finish the original synthetic adoption and all conservation assertions.
export const verifyAdoptionSourceStreaming=options=>verifyRegistryOriginalFacts({...options,coreProjectionFixture:true,registryScenario:args=>operationalAdoptionQaScenario({...args,afterProposalScenario:ctx=>adoptionAdministrativeIdentityQaScenario({...ctx,browser:options.browser,output:options.output,afterAdministrativeScenario:adoptionSourceStreamingQaScenario})})});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyAdoptionSourceStreaming(noeliaCircuitOptions(process.argv.slice(2))).then(r=>console.log(JSON.stringify({major:r.major,passed:r.passed,checksPassed:r.checksPassed,syntheticSchemaRemoved:r.syntheticSchemaRemoved,priorDatabasePreserved:r.priorDatabasePreserved}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
