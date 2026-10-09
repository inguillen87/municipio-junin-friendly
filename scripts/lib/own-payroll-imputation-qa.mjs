// Synthetic native employees, actual original writers; loopback QA only.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildOwnCloseQa} from './own-payroll-close-qa.mjs';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
import {buildOwnJurisdictionInstallation} from './own-payroll-jurisdiction-installation.mjs';
import {declaredDateCapture,declaredDateReceipt} from './own-payroll-run-date-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {createOwnPayrollPsqlQa} from './own-payroll-psql-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {IMPUTATION_READ,IMPUTATION_CAPS} from '../../assets/own-payroll-imputation-workspace-model.js';
import {randomUUID} from 'node:crypto';
import {ownRunOperation} from '../../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation} from '../../lib/internal-own-payroll-liquidation.js';
import {ownCloseOperation} from '../../lib/internal-own-payroll-close.js';
import {accountingOperation} from '../../lib/internal-own-payroll-accounting.js';
import {accountingDefinition} from '../../assets/own-payroll-accounting-model.js';
import {prepareAccounting} from '../../assets/own-payroll-accounting-workspace-model.js';
export function buildImputationQa(major){
 const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n'),qa=buildOwnCloseQa(major,{employees:2}),close=buildOwnCloseSql(read),jur=buildOwnJurisdictionInstallation({read,sourceCommit:'02bd45930297a755b61103d2c5063c1d6b8b3922'});
 const capture=jur.migration.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1('));
 const inventory=/inventory:=inventory\|\|jsonb_build_object\('jurisdictions'[\s\S]+?(?=\n\s*payload_value:=jsonb_build_object\()/.exec(capture)?.[0];assert.ok(inventory,'original declared jurisdiction capture');
 assert.equal(close.adapted[0].split('payload_value:=jsonb_build_object(').length,2);
 const nativeCapture=declaredDateCapture(close.adapted[0].replace('payload_value:=jsonb_build_object(',inventory+'\n payload_value:=jsonb_build_object('));
 const receipt=splitPostgresStatements(read('scripts/migrations/123-own-payroll-runs.sql')).find(s=>s.startsWith('CREATE FUNCTION public.own_run_receipt_v1('));
 const statements=[...jur.migration.filter(s=>s.includes('CREATE FUNCTION public.own_run_jurisdictions_v1(')||s.startsWith('REVOKE ALL ON FUNCTION public.own_run_jurisdictions_v1(')||/^CREATE OR REPLACE FUNCTION public\.own_close_(?:detail|snapshot)_v1\(/.test(s)),nativeCapture,declaredDateReceipt(receipt),read('scripts/migrations/147-own-payroll-accounting-mappings.sql')];
 const normalized=s=>s.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+qa.schema+',public,pg_temp');
 const caps=[...new Set([...IMPUTATION_READ,...Object.values(IMPUTATION_CAPS).flat(),'payroll.calculation.close','payroll.calculation.prepare'])];
 const anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 let hires='';for(let i=0;i<28;i++){const dni=String(99000500+i),weights=[5,4,3,2,7,6,5,4,3,2],digit=prefix=>11-[...(prefix+dni)].reduce((sum,d,index)=>sum+Number(d)*weights[index],0)%11;const prefix=digit('20')===10?'27':'20',check=digit(prefix);assert.notEqual(check,10);const data={agreementCode:'1',birthDate:'1990-01-01',categoryCode:'1',cuil:prefix+dni+(check===11?'0':String(check)),dni,fullName:'Persona exclusivamente sintética imputación '+i,jobTitle:'Administración QA',legajo:String(20500+i),legalReference:'Resolución exclusivamente sintética QA',organizationId:'10',sectorCode:'20',sexCode:'X',startDate:'2026-10-01',jurisdictionCode:i%2?'55':'42'};hires+='hire:=native_employee_create_v1(maker,'+q(JSON.stringify(data))+"::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());\n";}
 const sql=qa.sql.replace(anchor,()=>statements.map(s=>'EXECUTE '+q(normalized(s))+';').join('\n')+hires+`\n INSERT INTO capabilities SELECT a.id,c FROM unnest(ARRAY[${q(qa.ids.maker)}::uuid,${q(qa.ids.checker)}::uuid,${q(qa.ids.samePerson)}::uuid]) a(id) CROSS JOIN unnest(ARRAY[${caps.map(q).join(',')}]) c WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id=a.id AND old.capability_key=c);\n`+anchor);
 return {...qa,sql,normalized,caps,employeeCount:30};
}
export function createImputationPsqlQa(options){const db=createOwnPayrollPsqlQa(options);return {...db,query:async(query,values)=>{
 assert.match(query,/^SELECT public\.(?:own_run_(?:(?:bootstrap|attempt|capture|complete)_v1|bootstrap_v2)|own_liquidation_(?:detail|command)_v1|own_close_(?:detail|group|command)_v1|own_accounting_(?:bootstrap|command|detail)_v1|own_imputation_(?:bootstrap|source|detail|attempt|command)_v1)\([\s\S]+\) AS result$/);
 const rendered=query.replaceAll('public.',options.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});return[{result:await db.run(rendered,true)}];
}};}
export function imputationQaIdentity(qa,key){const a=qa.actors[key];return{principal:{user:{email:a.actorEmail},tenant:{source:'membership',id:a.tenantId,membershipId:a.membershipId,effectiveCapabilities:qa.caps}},session:{email:a.actorEmail,id:a.actorSessionId,version:a.actorSessionVersion,releaseSha:a.releaseSha}};}
export async function seedImputationScenario(db,qa){
 const maker=imputationQaIdentity(qa,'maker'),checker=imputationQaIdentity(qa,'checker'),operation=(fn,a,op,input)=>fn(db,a.principal,a.session,op,input),period=await db.run("SELECT to_jsonb(greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')))");
 const boot=await operation(ownRunOperation,maker,'bootstrap'),capture=await operation(ownRunOperation,maker,'calculate',{key:randomUUID(),body:{version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31',period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'}}),d=await operation(ownLiquidationOperation,checker,'detail',{id:capture.id});
 await operation(ownLiquidationOperation,checker,'command',{key:randomUUID(),body:{runId:capture.id,resultSha256:capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason:'Confirmación exclusivamente sintética QA',reviewConfirmed:true}});
 const cd=await operation(ownCloseOperation,checker,'detail',{period,liquidationType:'monthly'}),closed=await operation(ownCloseOperation,checker,'command',{key:randomUUID(),body:{period,liquidationType:'monthly',scopeVersion:cd.scopeVersion,stateVersion:cd.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre exclusivamente sintético para interfaz',reviewConfirmed:true}});
 const employees=new Map(closed.snapshot.employees.map(e=>[e.contractId,e])),mappings=new Map();for(const r of closed.snapshot.concepts){if(r.nature==='auxiliary')continue;const jurisdictionCode=employees.get(r.contractId).jurisdiction.code,key=[jurisdictionCode,r.agreementCode,r.departmentCode,r.conceptCode].join(':');mappings.set(key,{fiscalYear:'2026',jurisdictionCode,agreementCode:r.agreementCode,departmentCode:r.departmentCode,conceptCode:r.conceptCode,nature:r.nature,budgetItemReference:'PARTIDA-QA-'+r.conceptCode,supplierReference:null,creditorReference:null,accountingAccountReference:null,bankAccountReference:null,bankReference:null,validFrom:'2026-10-01',validUntil:'2026-12-31',ruleReference:'Documento exclusivamente sintético QA'});}
 const definition=accountingDefinition({mappings:[...mappings.values()],assignments:closed.snapshot.employees.map(e=>({contractId:e.contractId,conceptCode:null,institutionalReference:'INSTITUCION-QA',functionReference:'FUNCION-QA',validFrom:'2026-01-01',validUntil:null,ruleReference:'Documento exclusivamente sintético QA'}))});
 async function configure(definition){const ab=await operation(accountingOperation,maker,'bootstrap'),p=await operation(accountingOperation,maker,'command',{key:randomUUID(),body:prepareAccounting(ab,accountingDefinition(definition),'Destinos exclusivamente sintéticos para QA')}),cb=await operation(accountingOperation,checker,'bootstrap');return operation(accountingOperation,checker,'command',{key:randomUUID(),body:{...p.body,command:'approve',scopeVersion:cb.scopeVersion,proposalId:p.proposalId,proposalSha256:p.requestSha256,definition:null,reason:'Revisión independiente exclusivamente sintética QA',reviewConfirmed:true}});}
 return{maker,checker,period,closed,definition,configure};
}
