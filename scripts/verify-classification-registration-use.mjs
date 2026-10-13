// Real owned SQL and HTTP facades. Only existing disposable QA PG17/18.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifySalaryDayUnits} from './verify-salary-day-units.mjs';
import {buildClassificationRegistrationUseInstallation,assertClassificationUseDurability} from './lib/classification-registration-use-installation.mjs';
import {ADOPTION_ADMINISTRATIVE_CONTEXT} from './lib/adoption-administrative-identity-installation.mjs';
import {createEmploymentCatalogHandler} from '../api/internal-employment-catalog.js';import {createNativeEmployeeHandler} from '../api/internal-native-employees.js';
import {catalogDeclareRegistration,catalogItems} from '../assets/native-employment-catalog-model.js';import {employeeDraft} from '../assets/native-employee-contract.js';import {employeeRegistrationOptions} from '../assets/native-employee-confirmation-model.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {row} from '../tests/fixtures/native-salary-synthetic.js';import {rule,fact,policy} from '../tests/fixtures/own-payroll-synthetic.js';import {participationRuleKey} from '../assets/own-period-participation-program.js';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
const j=v=>q(JSON.stringify(v))+'::jsonb';
export async function verifyClassificationRegistrationUse(options){
 return verifySalaryDayUnits({...options,browser:'none',continuation:async h=>{
  const{qa,db,sql,relocate,adapter,deps,handlers,api,ok,setActor}=h,{period}=h.dayUnits;
  // The published administrative identity helper is a prerequisite, not a new
  // production grant. Reproduce it in this isolated old foundation if absent.
  if(await db.run("SELECT to_jsonb(to_regprocedure("+q(qa.schema+'.employment_adoption_administrative_context_v1(jsonb,text)')+") IS NULL)"))await sql(relocate(ADOPTION_ADMINISTRATIVE_CONTEXT)+';REVOKE ALL ON FUNCTION '+qa.schema+'.employment_adoption_administrative_context_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app');
  const batch=buildClassificationRegistrationUseInstallation(h.options);
  // The isolated schema changes stored bodies. Canonicalize the updated body
  // exactly as the existing QA relocator canonicalizes p.prosrc; retain both
  // record aliases in their independent metadata checks.
  const canonicalHashSource=relocate("replace(p.prosrc,E'\\r\\n',E'\\n')");
  const n=s=>['updated','f'].reduce((v,alias)=>v.replaceAll("replace("+alias+".prosrc,E'\\r\\n',E'\\n')",canonicalHashSource.replaceAll('p.prosrc',alias+'.prosrc')),relocate(s));
  const statements=batch.statements.map(s=>s===batch.choose?`DO $choose$ BEGIN IF current_setting('municontrol_classification_use.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $choose$`:s===batch.apply?`DO $apply$ BEGIN IF current_setting('municontrol_classification_use.mode')='install' THEN EXECUTE ${q(n(batch.mutations[0]))};END IF;END $apply$`:n(s));
  const installed=await sql(statements.join(';')),durable=await sql(batch.verification.map(n).join(';')),repeated=await sql(statements.join(';'));
  assertClassificationUseDurability(installed,durable);assertClassificationUseDurability(installed,repeated);assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');
  ok(true,'five exact adaptations preserve every existing row/ACL/attribute, durable metadata and verify-only repetition');
  // Explicit fixture setup after conservation: the same administrative audit
  // person retains an archived contract. Never part of the production batch.
  const administrativeLinks=await db.run('SELECT jsonb_agg(to_jsonb(l) ORDER BY membership_id) FROM tenant_action_employment_link l WHERE membership_id IN('+q(qa.ids.maker)+'::uuid,'+q(qa.ids.samePerson)+'::uuid)');
  const administrativeContract=randomUUID();
  await sql("ALTER TABLE employment_contract DISABLE TRIGGER grh_effective_baseline_rows;INSERT INTO employment_contract SELECT (jsonb_populate_record(NULL::"+qa.schema+".employment_contract,to_jsonb(c)||jsonb_build_object('id',"+q(administrativeContract)+",'person_id',"+q(qa.ids.makerPerson)+",'legacy_legajo','CLASSIFICATION-ADMIN-QA','source_system','GRH','source_batch_id',"+q(qa.ids.sourceBatch)+",'tenant_id',NULL,'jurisdiction_code',NULL,'source_payload',jsonb_build_object('qa','Archived synthetic administrative identity'),'status','inactive'))).* FROM employment_contract c WHERE c.id=(SELECT employment_contract_id FROM tenant_action_employment_link WHERE membership_id="+q(qa.ids.maker)+"::uuid) LIMIT 1;ALTER TABLE employment_contract ENABLE TRIGGER grh_effective_baseline_rows;UPDATE tenant_action_employment_link SET employment_contract_id="+q(administrativeContract)+"::uuid WHERE membership_id IN("+q(qa.ids.maker)+"::uuid,"+q(qa.ids.samePerson)+"::uuid)");
  const administrativeBefore=await db.run('SELECT to_jsonb(c) FROM employment_contract c WHERE id='+q(administrativeContract)+'::uuid');
  assert.equal(administrativeBefore?.status,'inactive','synthetic archived administrative contract must exist');
  const administrative=await sql('SELECT native_employment_catalog_context_v1('+j(qa.actors.maker)+')');
  assert.equal(administrative.catalogActorVerified,true);assert.equal(administrative.actorPersonId,qa.ids.makerPerson);assert.equal(administrative.employmentContractId,null);
  ok(true,'existing verified administrative identity supplies the same audit person without treating archived employment as active');
  // Explicit synthetic reviewer authority: the negative independence case
  // must fail for the same person, not merely for a missing capability.
  await sql('INSERT INTO capabilities SELECT '+q(qa.ids.samePerson)+'::uuid,v FROM unnest(ARRAY[\'workforce.employee.read\',\'employee.record.approve\',\'employee.catalog.approve\']) v WHERE NOT EXISTS(SELECT 1 FROM capabilities c WHERE c.membership_id='+q(qa.ids.samePerson)+'::uuid AND c.capability_key=v)');
  const catalogAdapter={query:async(query,values)=>{
   if(!/^SELECT public\.(?:native_employment_catalog|native_employee)_/.test(query))return adapter.query(query,values);
   assert.match(query,/^SELECT public\.(?:native_employment_catalog|native_employee)_(?:bootstrap|proposal|propose|review|attempt|create)_v1\([\s\S]+\) AS result$/);
   return[{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,k)=>values[Number(k)-1]===null?'NULL':q(values[Number(k)-1])),true)}];
  }};
  const catalogDeps={...deps,getSql:()=>catalogAdapter,requireAccess:()=>{const access=deps.requireAccess();return{...access,principal:{...access.principal,tenant:{...access.principal.tenant,effectiveCapabilities:[...access.principal.tenant.effectiveCapabilities,'employee.catalog.propose','employee.catalog.approve','employee.record.create']}}};}};
  handlers.catalog=createEmploymentCatalogHandler(catalogDeps);handlers.employee=createNativeEmployeeHandler(catalogDeps);
  async function request(kind,{query={resource:'bootstrap'},body,operation,key=randomUUID(),expected=200}={}){
   const response={setHeader(){},status(v){this.statusCode=v;return this;},json(v){this.value=v;return this;}},posted=!!body;
   await handlers[kind]({method:posted?'POST':'GET',url:'/api/qa-'+kind+(posted?'':'?'+new URLSearchParams(query)),query:posted?{}:query,headers:posted?{origin:h.env.INTERNAL_APP_ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':key}:{},...(posted?{body:JSON.stringify(kind==='employee'?body:{operation,payload:body})}:{})},response);
   assert.equal(response.statusCode,expected,JSON.stringify(response.value));return response.value.data??response.value;
  }
  async function propose(items){setActor(qa.actors.maker);const b=await request('catalog'),key=randomUUID(),body={scopeVersion:b.scopeVersion,baseVersion:b.catalog.version,items:catalogItems(items),reason:'Encadre y habilitación exclusivamente sintéticos QA'};return{key,body,receipt:await request('catalog',{operation:'propose',body,key,expected:201})};}
  async function approve(p){setActor(qa.actors.checker);const b=await request('catalog');const r=await request('catalog',{operation:'review',expected:201,body:{scopeVersion:b.scopeVersion,proposalId:p.receipt.proposalId,decision:'approve',reason:'Revisión independiente exclusivamente sintética QA'}});setActor(qa.actors.maker);return r;}
  setActor(qa.actors.maker);let b=await request('catalog');const items=catalogDeclareRegistration(b.catalog.items);
  items.push({kind:'agreements',key:'qa:9',code:'9',label:'Encuadre existente exclusivamente QA',agreementCode:null,registrationAllowed:true},{kind:'categories',key:'qa:9:6',code:'6',label:'Clase existente exclusivamente QA',agreementCode:'9',registrationAllowed:true});
  items.push(...Array.from({length:60},(_,i)=>({kind:'organizations',key:'qa:organization:'+i,code:String(10000+i),label:i===59?'=SUM(1;2)':'Sector exclusivamente sintético QA '+i,agreementCode:null,registrationAllowed:true})));
  for(const invalid of[items.map((r,i)=>i===0?{...r,registrationAllowed:'true'}:r),items.map((r,i)=>{const v={...r};if(i===0)delete v.registrationAllowed;return v;}),items.map(r=>r.kind==='agreements'&&r.code==='9'?{...r,registrationAllowed:false}:r)])await assert.rejects(()=>sql('SELECT native_employment_catalog_items_v1('+j(invalid)+')'),/NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID/);
  const legacy=b.catalog.items.map(({registrationAllowed,...r})=>r);
  await assert.rejects(()=>sql('SELECT native_employment_catalog_items_v1('+j([...legacy,{kind:'agreements',key:'old:9',code:'9',label:'Legacy forbidden exclusively QA',agreementCode:null}])+')'),/NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID/);
  ok(true,'SQL independently rejects string or missing flags, a category under a closed parent and legacy forbidden encuadres');
  const proposed=await propose(items);setActor(qa.actors.samePerson);const sameBoot=await request('catalog');assert.equal(sameBoot.permissions.canReview,true);
  const same=await request('catalog',{query:{resource:'proposal',id:proposed.receipt.proposalId}});assert.equal(same.proposal.canReview,false);
  await request('catalog',{operation:'review',body:{scopeVersion:sameBoot.scopeVersion,proposalId:proposed.receipt.proposalId,decision:'approve',reason:'Intento de misma persona exclusivamente sintético QA'},expected:403});
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM native_employment_catalog_review WHERE proposal_id='+q(proposed.receipt.proposalId)+'::uuid'),0);await approve(proposed);
  const hire=await request('employee');assert.ok(employeeRegistrationOptions(hire.catalog.items,'agreements').some(x=>x.code==='9'));
  const makeDraft=dni=>{const cuilBase='20'+dni,rem=11-[5,4,3,2,7,6,5,4,3,2].reduce((s,w,i)=>s+w*Number(cuilBase[i]),0)%11;return employeeDraft({legajo:'',fullName:'ENCUADRE EXCLUSIVAMENTE SINTETICO QA '+dni,dni,cuil:cuilBase+(rem===11?'0':rem===10?'9':String(rem)),birthDate:'1990-01-01',sexCode:'X',startDate:period+'-01',agreementCode:'9',categoryCode:'6',organizationId:hire.catalog.items.find(x=>x.kind==='organizations'&&x.registrationAllowed).code,sectorCode:hire.catalog.items.find(x=>x.kind==='sectors'&&x.registrationAllowed).code,jobTitle:'Agente sintético QA',legalReference:'Alta exclusivamente sintética QA',jurisdictionCode:'42'});};
  const draft=makeDraft('97160000'),hireKey=randomUUID(),hireBody={draft,catalogVersion:hire.catalog.version},created=await request('employee',{body:hireBody,key:hireKey,expected:201});assert.equal(created.origin,'MUNICONTROL');
  const contractBefore=await db.run('SELECT to_jsonb(c) FROM employment_contract c WHERE id='+q(created.contractId)+'::uuid');
  b=await request('catalog');const restricted=b.catalog.items.map(r=>(r.kind==='agreements'&&r.code==='9'||r.kind==='categories'&&r.agreementCode==='9')?{...r,registrationAllowed:false}:r);const restrictedProposal=await propose(restricted);await approve(restrictedProposal);
  const after=await request('employee');assert.equal(employeeRegistrationOptions(after.catalog.items,'agreements').some(x=>x.code==='9'),false);assert.equal(after.catalog.items.find(x=>x.kind==='agreements'&&x.code==='9').registrationAllowed,false);
  const count=await db.run('SELECT to_jsonb(count(*)) FROM native_employee_registration');const denial=await request('employee',{body:{draft:makeDraft('97160001'),catalogVersion:after.catalog.version},expected:422});assert.equal(denial.code,'NATIVE_EMPLOYEE_CATALOG_SELECTION_INVALID');assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM native_employee_registration'),count);
  assert.deepEqual(await db.run('SELECT to_jsonb(c) FROM employment_contract c WHERE id='+q(created.contractId)+'::uuid'),contractBefore);const replay=await request('employee',{query:{resource:'attempt',key:hireKey}});assert.equal(replay.contractId,created.contractId);assert.equal(replay.replayed,true);
  ok(true,'actual scoped independent publications restrict new hiring while preserving full existing-contract encuadres and original native hire receipt');
  // The administrative fallback is scoped to catalog decisions. Salary/run
  // checks retain their original fixture authority and are not widened here.
  for(const link of administrativeLinks)await sql('UPDATE tenant_action_employment_link SET employment_contract_id='+q(link.employment_contract_id)+'::uuid WHERE membership_id='+q(link.membership_id)+'::uuid');
  setActor(qa.actors.maker);const sb=await api('salary');assert.equal(sb.classification.items.find(x=>x.kind==='agreements'&&x.code==='9').registrationAllowed,false);
  const salaryBody={command:'propose',scopeVersion:sb.scopeVersion,baseVersion:sb.catalog.version,classificationVersion:sb.classification.version,items:salaryItems([...sb.catalog.items,row({kind:'scale',code:'1',agreementCode:'9',categoryCode:'6',nature:null,unit:'money',value:'123.45000000',precision:8,validFrom:period}),row({code:'9951',agreementCode:'9',precision:8,validFrom:period})]),proposalId:null,proposalSha256:null,reason:'Definiciones existentes exclusivamente sintéticas QA',reviewConfirmed:false},salary=await api('salary',{body:salaryBody,expected:201});setActor(qa.actors.checker);const sr=await api('salary');await api('salary',{expected:201,body:{...salaryBody,command:'approve',scopeVersion:sr.scopeVersion,items:null,proposalId:salary.proposalId,proposalSha256:salary.requestSha256,reviewConfirmed:true}});
  setActor(qa.actors.maker);const pb=await api('program'),program=structuredClone(pb.program.definition),newRule=rule('9951',fact('existingScale','money'),{agreementCode:'9',validFrom:period,rounding:policy('exact',8)});program.rules.push(newRule);program.periodParticipation.treatments.push({ruleKey:participationRuleKey(newRule),treatment:'declared_formula',reference:'Regla sólo para QA; ninguna norma municipal'});program.bindings.push({agreementCode:'9',key:'existingScale',unit:'money',sourceKind:'scale',sourceCode:'1',combine:'single',onMissing:'error',ruleReference:'Escala de contrato existente exclusivamente sintética QA'});
  const programBody={command:'propose',scopeVersion:pb.scopeVersion,baseVersion:pb.program.version,salaryVersion:pb.salaryCatalog.version,program:ownProgramDefinition(program,pb.salaryCatalog.items),proposalId:null,proposalSha256:null,reason:'Programa existente exclusivamente sintético QA',reviewConfirmed:false},pr=await api('program',{body:programBody,expected:201});setActor(qa.actors.checker);const pc=await api('program');await api('program',{expected:201,body:{...programBody,command:'approve',scopeVersion:pc.scopeVersion,program:null,proposalId:pr.proposalId,proposalSha256:pr.requestSha256,reviewConfirmed:true}});
  setActor(qa.actors.maker);const rb=await api('run'),run=await api('run',{body:{...h.oldBody,period,scopeVersion:rb.scopeVersion,programVersion:rb.programVersion,selection:{kind:'contracts',values:[created.contractId]}},expected:201});assert.equal(run.saved.result.rows.find(r=>r.conceptCode==='9951').amount,'123.45000000');
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM grh_employees WHERE legajo='+q(created.legajo)),0);
  assert.deepEqual(await db.run('SELECT to_jsonb(c) FROM employment_contract c WHERE id='+q(administrativeContract)+'::uuid'),administrativeBefore);
  ok(true,'native-only employee in a now-restricted encuadre still receives an exact own salary calculation; no GRH employee is required');
  if(options.browser&&options.browser!=='none'){const{verifyClassificationUseBrowser}=await import('./lib/classification-registration-use-browser.mjs');await verifyClassificationUseBrowser({...h,request,created,browserName:options.browser});}
  const extra=options.afterClassification?await options.afterClassification({...h,request,created}):null;
  const result={version:'classification-registration-use-qa.v1',syntheticOnly:true,productiveBusinessWrites:0,installed,durable,repeated,restrictedNewHireRefused:true,existingNativeSalaryAmount:'123.45000000',nativeHireReceiptPreserved:true,...(extra?{continuation:extra}:{})};fs.writeFileSync(path.join(h.destination,'classification-use-proof.json'),JSON.stringify(result,null,2)+'\n');return result;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
 try{const r=await verifyClassificationRegistrationUse({major:Number(o.major),transport:o.transport,sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
