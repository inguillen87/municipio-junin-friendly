// Relocation exclusively for the existing synthetic Noelia circuit verifier.
import {pinsCheck} from './native-leave-installation.mjs';
export function relocateAdoptionUuidDefaultRepair(batch,qa,jurisdiction){
 const n=s=>qa.normalized(s).replaceAll(qa.schema+'.gen_random_uuid()','public.gen_random_uuid()').replaceAll("'pg_catalog, public, pg_temp'","'pg_catalog, "+qa.schema+", public, pg_temp'");
 const prerequisite=qa.normalized(pinsCheck([...jurisdiction.afterPins.slice(0,4),jurisdiction.newPin],'ADOPTION_UUID_PREREQUISITE_CHANGED'))+';'+pinsCheck([jurisdiction.readyPin],'ADOPTION_UUID_PREREQUISITE_CHANGED');
 const map=s=>s===batch.prerequisite?prerequisite:n(s);
 return {...batch,installation:batch.installation.map(map),durableVerification:batch.durableVerification.map(map),before:n(batch.before),after:n(batch.after),apply:batch.apply.map(n)};
}
