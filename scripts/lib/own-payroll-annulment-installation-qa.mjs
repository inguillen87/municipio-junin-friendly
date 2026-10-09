import {pinsCheck} from './native-leave-installation.mjs';import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function relocateOwnAnnulInstallation(batch,qa,date){
 const n=qa.normalized,previousCheck=n(pinsCheck(batch.prerequisitePins.filter(p=>p.name!=='municipal_adoption_ready_v1'),'ANNUL_PREREQUISITE_CHANGED'))+';'+pinsCheck([date.readyPin],'ANNUL_PREREQUISITE_CHANGED');
 const migration=batch.migration.map(n),apply=`DO $apply$ BEGIN IF current_setting('municontrol_annul_install.mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,installation:batch.installation.map((s,i)=>i===1||i===8?previousCheck:i===3?apply:n(s)),durableVerification:batch.durableVerification.map((s,i)=>i===0?previousCheck:n(s))};
}
