// Synthetic-only adapters. Existing loopback databases; no municipal credentials.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildAdoptedConsumersInstallationQa,relocateAdoptedConsumersInstallation} from './adopted-consumers-installation-qa.mjs';
import {adoptedConsumersConditional} from './adopted-consumers-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {createOwnPayrollPsqlQa} from './own-payroll-psql-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function buildMunicipalAdoptionQa(major){
 const qa=buildAdoptedConsumersInstallationQa(major),guard='CREATE TRIGGER grh_effective_baseline_rows';assert.equal(qa.sql.split(guard).length,2);
 const extra=`FOR fixture_n IN 1..54 LOOP
 INSERT INTO person_identity SELECT (jsonb_populate_record(NULL::person_identity,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'full_name','Persona inventada adicional QA '||fixture_n,'dni',(99100000+fixture_n)::text,'cuil','20'||(99100000+fixture_n)::text||'0'))).* FROM person_identity p WHERE id=(SELECT person_id FROM employment_contract WHERE source_system='GRH' AND legacy_company_id=101 ORDER BY id LIMIT 1) RETURNING id INTO fixture_person;
 INSERT INTO employment_contract SELECT (jsonb_populate_record(NULL::employment_contract,to_jsonb(c)||jsonb_build_object('id',gen_random_uuid(),'person_id',fixture_person,'legacy_legajo','A/QA-'||fixture_n))).* FROM employment_contract c WHERE source_system='GRH' AND legacy_company_id=101 ORDER BY id LIMIT 1;
 END LOOP;`;
 qa.sql=qa.sql.replace('DECLARE ',()=> 'DECLARE fixture_n integer;fixture_person uuid;').replace(guard,()=>extra+'\n'+guard);
 const end='    END $seed$; COMMIT;';assert.equal(qa.sql.split(end).length,2);qa.sql=qa.sql.replace(end,()=>`INSERT INTO capabilities SELECT a.id,'employee.record.approve' FROM unnest(ARRAY[${q(qa.ids.maker)}::uuid,${q(qa.ids.samePerson)}::uuid]) a(id) WHERE NOT EXISTS(SELECT 1 FROM capabilities c WHERE c.membership_id=a.id AND c.capability_key='employee.record.approve');\n`+end);
 return qa;
}
export function relocateMunicipalAdoptionOperator(batch,qa){
 const n=qa.normalized,base=relocateAdoptedConsumersInstallation(batch.consumers,qa);
 const definitions=batch.definitions.map((d,i)=>i?n(d):n(d.slice(0,d.indexOf(' BEGIN ')))+' BEGIN '+batch.consumers.postChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$');
 const pins=definitions.map((d,i)=>({...ownInstallationFunctionPin(d.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.pins[i].signature.replaceAll('public.',qa.schema+'.'),runtime:i>0}));
 const migration=[...definitions,`REVOKE ALL ON FUNCTION ${pins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,`GRANT EXECUTE ON FUNCTION ${pins.filter(p=>p.runtime).map(p=>p.signature).join(',')} TO municontrol_actions_runtime_app`];
 const first=adoptedConsumersConditional(migration,"current_setting('municontrol_operator_install.mode')='first'");
 const post=pinsCheck(pins,'MUNICIPAL_ADOPTION_FUNCTION_METADATA');
 const map=s=>s===batch.first?first:s===batch.post?post:s===batch.proof?n(s.replace(q(JSON.stringify(batch.pins)),()=>q(JSON.stringify(pins)))):n(s);
 return {consumers:base,definitions,migration,pins,statements:batch.statements.map(map),verification:batch.verification.map(map)};
}
export function createMunicipalAdoptionPsqlQa(options){
 const expected=new URL('../../verification/postgresql-qa-20261004/pg'+options.major+'/pgsql/bin/psql.exe',import.meta.url);assert.equal(fs.realpathSync(options.executable).toLowerCase(),fs.realpathSync(expected).toLowerCase());
 const db=createOwnPayrollPsqlQa(options);
 return {...db,query:async(query,values)=>{
  assert.match(query,/^SELECT public\.(?:municipal_adoption_(?:queue|review|attempt|command)_v1|employment_adoption_(?:bootstrap|attempt|propose)_v1)\([\s\S]+\) AS result$/);
  const rendered=query.replaceAll('public.municipal_adoption_',options.schema+'.municipal_adoption_').replaceAll('public.employment_adoption_',options.schema+'.employment_adoption_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});try{return[{result:await db.run(rendered,true)}];}catch(e){options.onError?.(e.message);throw e;}
 }};
}
