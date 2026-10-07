// Relocate only the already-reviewed batches into the synthetic QA schema.
import {adoptedConsumersConditional as conditional} from './adopted-consumers-installation.mjs';
import {relocateAdoptedConsumersInstallation} from './adopted-consumers-installation-qa.mjs';
import {relocateMunicipalAdoptionOperator} from './municipal-adoption-operator-qa.mjs';
import {relocateNoeliaNoveltyInstallation} from './noelia-payroll-circuit-qa.mjs';
import {publishedAdoptionAtomicConditional} from './published-novelty-adoption-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
export function relocatePublishedNoveltyAdoption(batch,qa){
 const n=qa.normalized,c=batch.consumers,consumers=relocateAdoptedConsumersInstallation(c,qa),operator=relocateMunicipalAdoptionOperator(batch.operator,qa),bulk=relocateNoeliaNoveltyInstallation(batch.bulk,qa);
 const initial="current_setting('municontrol_published_adoption.mode')='first'";
 const initialChecks=batch.initialChecks.map(n);
 const stages=[...consumers.statements.slice(0,-1).map((s,i)=>i===1?conditional([initialChecks[0],n(c.initialCheckStatements[1])],"current_setting('municontrol_adopted_consumers_install.mode') IN('first','upgrade')"):s),...operator.statements.slice(0,-1),...batch.upgrades.map(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.municipal_adoption_ready_v1')?bulk.installation.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION '+qa.schema+'.municipal_adoption_ready_v1')):n(s))];
 const finalOperatorPins=bulk.operator.pins.map(p=>p.name===bulk.readyPin.name?bulk.readyPin:p);
 const finalChecks=batch.finalChecks.map(s=>s.includes('PUBLISHED_ADOPTION_AFTER_METADATA')
  ?n(pinsCheck(batch.bulk.finalPins.filter(p=>!p.name.startsWith('municipal_adoption_')),'PUBLISHED_ADOPTION_AFTER_METADATA'))+';'+pinsCheck(finalOperatorPins,'PUBLISHED_ADOPTION_AFTER_METADATA')
  :n(s));
 const map=s=>s===batch.apply?publishedAdoptionAtomicConditional(stages,initial):s===batch.check?conditional(initialChecks,initial):batch.finalChecks.includes(s)?finalChecks[batch.finalChecks.indexOf(s)]:n(s);
 const preflight=[n(batch.state),conditional(batch.preflightChecks.map(n),initial),conditional(finalChecks,`NOT(${initial})`),n(batch.preflight.at(-1))];
 return {...batch,preflight,installation:batch.installation.map(map),durableVerification:batch.durableVerification.map(map)};
}
