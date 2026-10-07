// All actors and contracts are invented; only existing loopback QA is allowed.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildAdoptedConsumersInstallationQa} from './adopted-consumers-installation-qa.mjs';
import {createOwnReceiptPsqlQa} from './own-payroll-receipt-qa.mjs';import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {relocateMunicipalAdoptionOperator} from './municipal-adoption-operator-qa.mjs';import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';import {pinsCheck} from './native-leave-installation.mjs';
export function buildNoeliaCircuitQa(major){const qa=buildAdoptedConsumersInstallationQa(major),anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 const caps=['employee.record.propose','employee.record.approve','workforce.employee.read','workforce.structure.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare','payroll.calculation.approve','payroll.calculation.close','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare','payroll.novelty.approve','payroll.novelty.export','payroll.receipt.prepare','payroll.receipt.approve'];
 qa.sql=qa.sql.replace(anchor,()=>`INSERT INTO capabilities SELECT a.id,c FROM unnest(ARRAY[${q(qa.ids.maker)}::uuid,${q(qa.ids.checker)}::uuid]) a(id) CROSS JOIN unnest(ARRAY[${caps.map(q).join(',')}]) c WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id=a.id AND old.capability_key=c);\n`+anchor);return {...qa,caps};
}
export function createNoeliaCircuitPsqlQa(options){const expected=new URL('../../verification/postgresql-qa-20261004/pg'+options.major+'/pgsql/bin/psql.exe',import.meta.url);assert.equal(fs.realpathSync(options.executable).toLowerCase(),fs.realpathSync(expected).toLowerCase());const db=createOwnReceiptPsqlQa(options);return {...db,query:async(query,values)=>{
 if(!/^SELECT public\.(?:municipal_adoption_|employment_adoption_|own_novelty_|native_employment_catalog_)/.test(query))return db.query(query,values);
 assert.match(query,/^SELECT public\.(?:municipal_adoption_(?:queue|review|attempt|command)_v1|employment_adoption_(?:bootstrap|attempt|propose)_v1|own_novelty_(?:bootstrap|detail|attempt|command)_v1|native_employment_catalog_bootstrap_v1)\([\s\S]+\) AS result$/);
 const sql=query.replaceAll('public.',options.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return[{result:await db.run(sql,true)}];
 }};}
export function relocateNoeliaNoveltyInstallation(batch,qa){
 const n=qa.normalized,operator=relocateMunicipalAdoptionOperator(batch.operator,qa),ready=n(batch.ready.slice(0,batch.ready.indexOf(' BEGIN ')))+' BEGIN '+batch.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.readyPin.signature.replace('public.',qa.schema+'.'),runtime:false};
 const opPins=operator.pins.map((p,i)=>i?p:readyPin),others=batch.finalPins.filter(p=>!p.name.startsWith('municipal_adoption_'));
 const map=s=>{
  if(s.includes('ADOPTED_NOVELTY_OPERATOR_PREREQUISITE'))return pinsCheck(operator.pins,'ADOPTED_NOVELTY_OPERATOR_PREREQUISITE');
  if(s.includes('ADOPTED_NOVELTY_FUNCTION_METADATA'))return n(pinsCheck(others,'ADOPTED_NOVELTY_FUNCTION_METADATA'))+';'+pinsCheck(opPins,'ADOPTED_NOVELTY_FUNCTION_METADATA');
  if(s.startsWith('CREATE OR REPLACE FUNCTION public.municipal_adoption_ready_v1'))return ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
  return n(s.replaceAll(batch.readyPin.sha256,readyPin.sha256));
 };
 return {...batch,readyPin,operator,installation:batch.installation.map(map),durableVerification:batch.durableVerification.map(map)};
}
