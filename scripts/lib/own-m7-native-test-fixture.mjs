// Pure TEST fixture data and a reviewable plan. No connection, SDK, SQL runner,
// authentication handler, clock substitution or production admission lives here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {draft as canonicalEmployeeDraft,catalog as canonicalEmployeeCatalog} from '../../tests/fixtures/native-employee-synthetic.js';
import {programOwnerQaItems,programOwnerQaDefinition} from '../../tests/fixtures/municipal-owner-program-synthetic.js';
import {employeeDraft,validCuil} from '../../assets/native-employee-contract.js';
import {employeeCreationBootstrap} from '../../assets/native-employee-confirmation-model.js';
import {catalogItems} from '../../assets/native-employment-catalog-model.js';

export const OWN_M7_NATIVE_TEST_FIXTURE_VERSION='own-m7-native-test-fixture.v1';
export const OWN_M7_NATIVE_TEST_FIXTURE_SOURCE_PINS=Object.freeze({
 'assets/employment-adoption-mixed-cohort.js':'3993a99c00d57c552744d60171a949183002e5d7f3b0fdad2a20051cd4c3572c',
 'assets/employment-adoption-operational-cohort.js':'f366762a32892895a2fd67885372b4abe7592028cec057951e2271eb2fa286cd',
 'assets/employment-adoption-review-model.js':'574ccab7293082b88306c64aa9930e6792660245b27260629056ca2253ef3d88',
 'assets/employment-source-declarations.js':'e9afd849b099c0235955e1d9675364f134342dd63efc5b7797b07c96d466405b',
 'assets/municipal-owner-program-model.js':'c6d964520deda4a7a1e2e3f45804a3208b978ae27b209a75363944bc1447d8f7',
 'assets/native-employee-confirmation-model.js':'625c8eb8a4ed2c660fdb70bf3ea0189313490d0a6fb67198c54a1e8464295829',
 'assets/native-employee-contract.js':'cfc986253c3d1a59f091d1a2926ac483068a2ffc5521a8dc5ed228f0eb6f95a7',
 'assets/native-employment-catalog-model.js':'40a8989a232e7b7919f97fb457a739797383c9e46eb80c452f9f72d386a670ca',
 'assets/native-employment-lifecycle-model.js':'5fd92064504995b9f71a0ebf1a50ea26be0977c04ae5d0b4a26cf10d027d9393',
 'assets/native-salary-catalog-model.js':'0277d8e93a362e4bdfd3f2b698d84b6903ef2bb7f774d932423e2088dcfea908',
 'assets/own-agreement-working-time-program.js':'649579614470a337cba017a199e2c5c4a853858eb08bcc556f4a3fa6d2c6bc6f',
 'assets/own-monthly-day-declaration-model.js':'f425f3beb553df8366d8fdbc32d89f5bea1b6280ef45835643b629d5b0134864',
 'assets/own-monthly-day-declaration-program.js':'d38b09d6e3ab48dec108f9a1976bb948291893cc42f2150c876736fcc5ab0982',
 'assets/own-monthly-day-policy-model.js':'7c51746f680aafa3d14d183ed1cef6914aa9669e4a931719a4bd3b1734d1bb7f',
 'assets/own-monthly-day-policy-program.js':'e947a12108128052f9900eb9777eadfe5387a1227671b2f770c646dc186d3d5c',
 'assets/own-payroll-conditions.js':'3c490719bc233827e7847d0b39906c1519528b9a2c3a4b38652055382d013f11',
 'assets/own-payroll-engine.js':'0be7bac4ca657d609d5b6145d7f66ac3bcd69cf99df1243274c117bc9d73e262',
 'assets/own-payroll-exact.js':'975d7192e2b407ba149bff185fae6bd60ed85f085ac48e788c432e97d1855666',
 'assets/own-payroll-monetary-manifest.js':'70f67119f767586c050fe200303528d1f4a3f18e195326d2312e25d25b005b3b',
 'assets/own-payroll-monetary-policy.js':'a4979613ccb5f21cfa5aff49cfe07fda593f657cb112587f1d0f712eca09c09c',
 'assets/own-payroll-period-context.js':'147926a853a63ee73b75b191f56638c98698823a903bf1d19d2b1ad4ee3af4e5',
 'assets/own-payroll-program-model.js':'f4b3101fb8cf050dbe8f11fb61b46065706c7a7e231a52cf126019f04d9701a8',
 'assets/own-period-participation-model.js':'d5995e857438f66ed9923c844c211f99fe752b91dd5cea90888196eda501a441',
 'assets/own-period-participation-program.js':'f85ea1fb0dd2d0c6f908f54defa8778f928477c313783c2b056afb81ba255a05',
 'assets/payroll-native-monthly-model.js':'c91a5bc981eb43a750af2f774829ddb8f865dbdc63cd9db024872474787c6522',
 'lib/internal-employment-catalog.js':'dcc8a9585c3bb52e77d3a7929b527c5330d2768b29080458ecb2cf5bf01d9d58',
 'lib/internal-native-employees.js':'0f044bb371566fe2225ae875ca0383657c05f27fc876019b08ba779d80e121d8',
 'lib/internal-native-salary.js':'f9c66548004e722820e1a3b500775156f8ad9c4ca0ebbc7f97f18564016a3aca',
 'lib/internal-own-payroll-annulment.js':'5215b0a612ee850a652b1fc8df1664693bca8534f73a50cdb280e7939733132f',
 'lib/internal-own-payroll-close.js':'f1e06d826ec6532568272e751fbc4ec9b4d739a3937c724f673513481f1d62c3',
 'lib/internal-own-payroll-liquidation.js':'f69b3f0650802754da2c739cb05295fdc1bf1973c982b818e49992801a6e141c',
 'lib/internal-own-payroll-program.js':'311d94add3940a69b5e7e4f2f3e606137cad7686b1507bd40267af85a3de8b5a',
 'lib/internal-own-payroll-receipts.js':'3dfabfd0f9c30a9441e5cd0eff235444976cb6c016f885d9789e43e5c8a54554',
 'lib/internal-own-payroll-run.js':'5ae996ad4bb48d35136fa5fc45d2c434ec4b8c8a064c1e80ec325a05033201ad',
 'scripts/internal-schema.sql':'01361fcc19a1cd3bcb76eed457bc507c7db33079b713db043a6fb284cd097c3d',
 'scripts/lib/municipal-owner-adoption-decision-qa.mjs':'e6d9d39d1dee48d24f01148d07997d85e51d8ca62ff5eefb4a6dc00679d99624',
 'scripts/lib/own-payroll-release-target.mjs':'85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448',
 'scripts/migrations/002-canonical-integration.sql':'56e91a93d39901a7fc937ee1666ba7987ebc17852de3d14477da68ca68f9541d',
 'scripts/migrations/004-tenant-iam-control-plane.sql':'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195',
 'scripts/migrations/005-tenant-identity-gateway.sql':'dca8ae5d6dd0c5481bd4b0b8ec9799048e813df8f2248d5533e6d34b49fb7392',
 'scripts/migrations/006-tenant-action-authority.sql':'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a',
 'scripts/migrations/009-tenant-lifecycle-hardening.sql':'d2152fe1df92ac646ada498b6140523a8bc3f13901ac49a95da13744dc72dfe4',
 'scripts/migrations/067-native-employee-registration.sql':'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749',
 'scripts/migrations/095-native-employee-jurisdiction.sql':'48aecdd294bf11ec7f2a956b30eb455f2acc5be7d8825669249fed8ada7d90b5',
 'scripts/migrations/103-native-employment-catalog.sql':'759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6',
 'scripts/migrations/113-native-employee-self-access.sql':'9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7',
 'scripts/migrations/167-classification-registration-use.sql':'8eef9142231b660bdac357312cc1c9ee29ab79a65e04422c5bd5bfab77189c38',
 'tests/fixtures/municipal-owner-program-synthetic.js':'0106a48f1034c1b617333dd4dead4dab6f40912a8a086a3fb97a5f6c67f090b1',
 'tests/fixtures/native-employee-synthetic.js':'61b3042745d93acf64e86a02e5709a33a82c30cadf93f5bda7637af7954a7b1c',
});

// Sole scoped UPDATE exception: 009 automatically inserts this new policy in
// its unready state. Caller must observe exactly one affected row. No general
// UPDATE or permission-maintenance interface is provided by the fixture.
export const OWN_M7_NATIVE_TEST_POLICY_SQL="UPDATE public.tenant_identity_policy p SET tenant_data_plane_ready=true,invitation_delivery_ready=false,certified_source_binding_id=$2::uuid,certified_release_sha=$3::text,certified_by_user_email=$4::text,certified_at=clock_timestamp(),version=2,updated_at=clock_timestamp() FROM public.platform_tenant t,public.platform_tenant_source_binding b WHERE p.tenant_id=$1::uuid AND t.id=p.tenant_id AND t.slug=$5::text AND t.tenant_kind='sandbox' AND t.status='active' AND t.created_by_user_email=$4::text AND b.id=$2::uuid AND b.tenant_id=t.id AND b.verified AND b.verified_by_user_email=$4::text AND b.source_database=$6::text AND b.source_company_id=$7::bigint AND p.version=1 AND p.tenant_data_plane_ready=false AND p.invitation_delivery_ready=false AND p.certified_source_binding_id IS NULL AND p.certified_release_sha IS NULL AND p.certified_by_user_email IS NULL AND p.certified_at IS NULL AND p.updated_at=transaction_timestamp() AND t.created_at=transaction_timestamp() AND b.created_at=transaction_timestamp()";

const minted=new WeakMap(),HASH=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function json(value){
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'){assert.ok(Number.isFinite(value),'M7_FIXTURE_FINITE');return value;}
 assert.ok(value&&typeof value==='object'&&(Array.isArray(value)||[Object.prototype,null].includes(Object.getPrototypeOf(value))),'M7_FIXTURE_JSON');
 const result=Array.isArray(value)?[]:{};
 if(Array.isArray(value))assert.deepEqual(Reflect.ownKeys(value).sort(),[...Array.from({length:value.length},(_,i)=>String(i)),'length'].sort(),'M7_FIXTURE_DENSE');
 for(const key of Reflect.ownKeys(value)){
  if(Array.isArray(value)&&key==='length')continue;
  assert.equal(typeof key,'string','M7_FIXTURE_KEYS');const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(d&&Object.hasOwn(d,'value')&&d.enumerable,'M7_FIXTURE_DATA');
  Object.defineProperty(result,key,{value:json(d.value),enumerable:true});
 }return result;
}
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const uuid=(runId,key)=>{const h=sha(OWN_M7_NATIVE_TEST_FIXTURE_VERSION+':'+runId+':'+key);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-'+(8+parseInt(h[16],16)%4).toString(16)+h.slice(17,20)+'-'+h.slice(20,32);};
const baseTargets=freeze([
 {major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech',endpointId:'ep-shiny-cherry-actlyudg'},
 {major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',database:'neondb',role:'neondb_owner',guardOid:24740,host:'ep-falling-rain-aca27ph1.sa-east-1.aws.neon.tech',endpointId:'ep-falling-rain-aca27ph1'},
]);
function testAdmission(input){
 const value=json(input);exact(value,['version','kind','target','parentBranchId','branchCreation'],'M7_FIXTURE_TARGET_ADMISSION');
 assert.equal(value.version,'own-release-annulment-atomic-test-target.v1');assert.equal(value.kind,'test');
 const target=value.target,base=baseTargets.find(t=>t.major===target?.major);assert.ok(base,'M7_FIXTURE_TARGET_MAJOR');exact(target,[...Object.keys(base),'kind','parentBranchId'],'M7_FIXTURE_TARGET_FIELDS');
 assert.equal(target.kind,'test');for(const k of ['major','projectId','database','role','guardOid'])assert.equal(target[k],base[k],'M7_FIXTURE_TARGET_BASE:'+k);
 assert.equal(target.parentBranchId,base.branchId);assert.equal(value.parentBranchId,base.branchId);assert.match(target.branchId,/^br-[a-z0-9-]+$/);assert.match(target.endpointId,/^ep-[a-z0-9-]+$/);
 assert.equal(target.host,target.endpointId+base.host.slice(base.host.indexOf('.')));
 for(const t of baseTargets)for(const k of ['branchId','endpointId','host'])assert.notEqual(target[k],t[k],'M7_FIXTURE_PRODUCTION_FORBIDDEN:'+k);
 exact(value.branchCreation,['bytes','sha256'],'M7_FIXTURE_BRANCH_SOURCE');assert.ok(Number.isSafeInteger(value.branchCreation.bytes)&&value.branchCreation.bytes>0);assert.match(value.branchCreation.sha256,HASH);
 return value;
}
function sourceCustody(readRaw){
 assert.equal(typeof readRaw,'function','M7_FIXTURE_READ_RAW');const raws=new Map(),sources={};
 for(const [file,expected]of Object.entries(OWN_M7_NATIVE_TEST_FIXTURE_SOURCE_PINS)){
  const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'M7_FIXTURE_BUFFER_REQUIRED:'+file);const copy=Buffer.from(raw);assert.equal(sha(copy),expected,'M7_FIXTURE_SOURCE_CHANGED:'+file);
  raws.set(file,copy);sources[file]={bytes:copy.length,sha256:expected};
 }
 const bookend=()=>{for(const[file,before]of raws){const after=readRaw(file);assert.ok(Buffer.isBuffer(after),'M7_FIXTURE_BUFFER_REQUIRED:'+file);assert.equal(Buffer.compare(before,after),0,'M7_FIXTURE_RAW_DRIFT:'+file);}return true;};
 return {sources,bookend};
}
function cuilFor(dni){for(let n=0;n<=9;n++){const candidate='20'+dni+String(n);if(validCuil(candidate))return candidate;}assert.fail('M7_FIXTURE_CUIL');}
const commonCaps=['actions.read','workforce.employee.read','employee.record.create','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'];
const capSets={maker:[...commonCaps,'employee.catalog.propose','payroll.parameter.prepare','payroll.calculation.prepare'],checker:[...commonCaps,'employee.catalog.approve','payroll.parameter.approve','payroll.calculation.approve','payroll.calculation.close']};

/** Seeded operator identities/catalog1 are explicitly preconditions. Only the
 * third subject is scheduled for employeeOperation(create). Nothing executes. */
export function buildOwnM7NativeTestFixturePlan(options){
 exact(options,['readRaw','sourceCommit','testTargetAdmission','runId'],'M7_FIXTURE_OPTIONS');const {readRaw,sourceCommit,runId}=options;
 assert.match(sourceCommit,COMMIT);assert.equal(typeof runId,'string');assert.ok(runId.length>=6&&runId.length<=32&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId),'M7_FIXTURE_RUN_ID');
 const custody=sourceCustody(readRaw),admission=testAdmission(options.testTargetAdmission),id=key=>uuid(runId,key),suffix=sha(runId).slice(0,16).toUpperCase();
 const tenantId=id('tenant'),bindingId=id('binding'),slug='own-m7-test-'+runId,sourceDatabase='own_m7_test_'+runId.replaceAll('-','_'),companyId=700000000+parseInt(sha(runId+':company').slice(0,8),16)%100000000;
 assert.notEqual(tenantId,'4daa7815-0816-4506-b497-c7432cb1aa9f');assert.notEqual(slug,'junin-mendoza');
 const actors={},subjects=[];
 const dniBase=95000000+parseInt(sha(runId+':dni').slice(0,8),16)%4000000;
 for(const [index,key]of ['maker','checker','beneficiary'].entries()){
  const dni=String(dniBase+index),draft=employeeDraft(canonicalEmployeeDraft({fullName:'PERSONA SINTÉTICA '+key.toUpperCase()+' '+runId,dni,cuil:cuilFor(dni),jurisdictionCode:'42'}),'2026-10-31',{requireJurisdiction:true});
  const seeded=key!=='beneficiary',subject={key,creationMode:seeded?'explicit_fixture_seed':'native_employee_api',draft,requestKey:id(key+':create')};
  if(seeded){
   subject.personId=id(key+':person');subject.contractId=id(key+':contract');subject.registrationId=id(key+':registration');subject.legajo=String(index+1);
   const email='own-m7-'+runId+'-'+key+'@example.invalid',membershipId=id(key+':membership'),sessionId=id(key+':session'),roleKey='M7_TEST_'+suffix+'_'+key.toUpperCase(),capabilities=[...capSets[key]].sort();
   actors[key]={email,membershipId,sessionId,roleKey,capabilities,subjectKey:key,principal:{user:{email},tenant:{source:'membership',id:tenantId,membershipId,effectiveCapabilities:capabilities}},session:{id:sessionId,email,version:1,releaseSha:sourceCommit}};
  }subjects.push(subject);
 }
 const selected=canonicalEmployeeCatalog.items.filter(row=>row.kind==='agreements'&&row.code==='1'||row.kind==='categories'&&row.agreementCode==='1'&&row.code==='6'||row.kind==='organizations'&&row.code==='7'||row.kind==='sectors'&&row.code==='2');
 const classification=catalogItems(selected.map(row=>({...row,key:[row.kind,row.kind==='categories'?row.agreementCode:'',row.code].join(':'),agreementCode:row.agreementCode??null})));
 const catalogProposalId=id('catalog:proposal'),catalogReviewId=id('catalog:review'),catalogJson=JSON.stringify(classification),marker={version:OWN_M7_NATIVE_TEST_FIXTURE_VERSION,runId,synthetic:true,seedOnly:true,rpcExecuted:false};
 const statements=[],expectedRowCounts=[],expectedCommands=[],origins=[];
 const add=(text,values,origin,command='INSERT')=>{statements.push({text,values});expectedRowCounts.push(1);expectedCommands.push(command);origins.push(origin);};
 for(const a of Object.values(actors))add('INSERT INTO public.internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES($1::text,$2::text,NULL,true,$3::text,1)',[a.email,'Operador sintético '+a.subjectKey,'managed'],'IAM fixture only; 004/005');
 add('INSERT INTO public.platform_tenant(id,slug,legal_name,short_name,tenant_kind,jurisdiction,status,created_by_user_email) VALUES($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text)',[tenantId,slug,'ENTIDAD FICTICIA TEST '+runId,'TEST '+runId,'sandbox','Escenario exclusivamente sintético','active',actors.maker.email],'004 tenant; 009 creates unready policy');
 add('INSERT INTO public.platform_tenant_source_binding(id,tenant_id,source_system,source_database,source_company_id,verified,verified_by_user_email,verified_at) VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::bigint,true,$6::text,clock_timestamp())',[bindingId,tenantId,'GRH',sourceDatabase,companyId,actors.maker.email],'004 legacy binding metadata only; zero GRH records');
 add(OWN_M7_NATIVE_TEST_POLICY_SQL,[tenantId,bindingId,sourceCommit,actors.maker.email,slug,sourceDatabase,companyId],'009 newly inserted synthetic policy only','UPDATE');
 for(const a of Object.values(actors)){
  add('INSERT INTO public.iam_role(role_key,label,description,scope_kind,system_managed) VALUES($1::text,$2::text,$3::text,$4::text,false)',[a.roleKey,'Operador TEST '+a.subjectKey,'Rol nuevo exclusivamente sintético '+runId,'tenant'],'004 distinct new TEST role');
  for(const capability of a.capabilities)add('INSERT INTO public.iam_role_capability(role_key,capability_key) VALUES($1::text,$2::text)',[a.roleKey,capability],'Existing capability only; no capability definition or SQL GRANT');
  add('INSERT INTO public.tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,clock_timestamp())',[a.membershipId,tenantId,a.email,a.roleKey,'active',actors.maker.email],'004/006 membership trigger creates authority');
  add("INSERT INTO public.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at,device_label) VALUES($1::uuid,$2::text,$3::uuid,$4::text,$5::text,1,1,clock_timestamp()+interval '1 hour',$6::text)",[a.sessionId,a.email,tenantId,'membership','mfa','SYNTHETIC TEST AUTH; no MFA handler executed'],'005 synthetic database session, not real MFA');
 }
 for(const s of subjects.filter(s=>s.creationMode==='explicit_fixture_seed')){
  const a=actors[s.key],d=s.draft;
  add('INSERT INTO public.person_identity(id,cuil,dni,full_name,birth_date,sex_code,identity_state) VALUES($1::uuid,$2::text,$3::text,$4::text,$5::date,NULL,$6::text)',[s.personId,d.cuil,d.dni,d.fullName,d.birthDate,'provisional'],'002/067 explicit operator identity fixture, not employee RPC');
  add('INSERT INTO public.native_employee_registration(id,tenant_id,source_binding_id,contract_id,person_id,actor_membership_id,actor_session_id,release_sha,request_key,request_sha256,catalog_sha256,legal_reference) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::uuid,$10::text,encode(public.digest($11::jsonb::text,$12::text),$13::text),$14::text)',[s.registrationId,tenantId,bindingId,s.contractId,s.personId,a.membershipId,a.sessionId,sourceCommit,s.requestKey,sha(JSON.stringify({...marker,operator:s.key})),catalogJson,'sha256','hex',d.legalReference],'067 registration precedes contract; deferred FK; seed fingerprint');
  const label=kind=>classification.find(x=>x.kind===kind).label;
  const payload={employment:{agreementName:label('agreements'),categoryName:label('categories'),organizationName:label('organizations'),sectorName:label('sectors'),cargoName:null},native:{registrationId:s.registrationId,legalReference:d.legalReference,identityDeclared:true},fixture:marker};
  add("INSERT INTO public.employment_contract(id,person_id,source_system,source_batch_id,tenant_id,legacy_company_id,legacy_legajo,start_date,agreement_code,category_code,organization_unit_source_id,sector_source_id,status,jurisdiction_code,source_payload) SELECT $1::uuid,$2::uuid,$3::text,NULL,$4::uuid,$5::bigint,$6::text,$7::date,$8::text,$9::text,$10::text,$11::text,$12::text,$13::text,jsonb_set($14::jsonb,'{native,createdAt}',to_jsonb(r.created_at)) FROM public.native_employee_registration r WHERE r.id=$15::uuid AND r.contract_id=$1::uuid AND r.person_id=$2::uuid AND r.tenant_id=$4::uuid AND r.source_binding_id=$16::uuid",[s.contractId,s.personId,'MUNICONTROL',tenantId,companyId,s.legajo,d.startDate,d.agreementCode,d.categoryCode,d.organizationId,d.sectorCode,'active',d.jurisdictionCode,JSON.stringify(payload),s.registrationId,bindingId],'067/095/167 synthetic native operator contract; no GRH batch');
  add('INSERT INTO public.tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,active,linked_by_user_email) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,true,$5::text)',[a.membershipId,tenantId,bindingId,s.contractId,actors.maker.email],'006/113 native contract link verified by existing trigger');
 }
 const maker=actors.maker,checker=actors.checker;
 add('INSERT INTO public.native_employment_catalog_proposal(id,tenant_id,source_binding_id,base_version,base_items,items,reason,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt) VALUES($1::uuid,$2::uuid,$3::uuid,encode(public.digest($4::jsonb::text,$5::text),$6::text),$4::jsonb,$7::jsonb,$8::text,$9::uuid,$10::uuid,$11::text,$12::uuid,1,$13::text,$14::text,$15::uuid,$16::text,$17::jsonb)',[catalogProposalId,tenantId,bindingId,'[]','sha256','hex',catalogJson,'Catálogo inicial exclusivamente fixture; no RPC ejecutado',maker.membershipId,subjects[0].personId,maker.email,maker.sessionId,sourceCommit,'Preparador sintético seed',id('catalog:propose:key'),sha(JSON.stringify({...marker,catalog:'proposal'})),'{}'],'Canonical seed QA190:365-368 / 103; empty receipt intentionally not RPC receipt');
 add('INSERT INTO public.native_employment_catalog_review(id,tenant_id,source_binding_id,proposal_id,decision,reason,revision,catalog_version,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,1,encode(public.digest($7::jsonb::text,$8::text),$9::text),$10::uuid,$11::uuid,$12::text,$13::uuid,1,$14::text,$15::text,$16::uuid,$17::text,$18::jsonb)',[catalogReviewId,tenantId,bindingId,catalogProposalId,'approve','Publicación inicial exclusivamente fixture; no RPC ejecutado',catalogJson,'sha256','hex',checker.membershipId,subjects[1].personId,checker.email,checker.sessionId,sourceCommit,'Revisor sintético seed',id('catalog:review:key'),sha(JSON.stringify({...marker,catalog:'review'})),'{}'],'Canonical seed QA190:365-368 / 103; not evidence of approval command');
 const bootstrapOwner={statements,expectedSha256:sha(JSON.stringify(statements)),expectedRowCounts,expectedCommands,origins};
 const steps=[
  {id:'seed-preconditions',role:'owner',batch:'bootstrapOwner',seedOnly:true},
  {id:'beneficiary-bootstrap',actor:'maker',service:'lib/internal-native-employees.js',export:'employeeOperation',operation:'bootstrap',requiresRealResult:true},
  {id:'beneficiary-create',actor:'maker',service:'lib/internal-native-employees.js',export:'employeeOperation',operation:'create',requestKey:id('beneficiary:create'),materializer:'materializeOwnM7NativeTestEmployee',requiresRealResult:true},
  ...['salary','program'].flatMap(kind=>[{id:kind+'-bootstrap',actor:'maker',service:kind==='salary'?'lib/internal-native-salary.js':'lib/internal-own-payroll-program.js',export:kind==='salary'?'salaryOperation':'programOperation',operation:'bootstrap',requiresRealResult:true},{id:kind+'-propose',actor:'maker',operation:'command',command:'propose',requestKey:id(kind+':propose'),requiresRealResult:true},{id:kind+'-review',actor:'checker',operation:'command',command:'approve',requestKey:id(kind+':approve'),requiresRealResult:true}]),
  {id:'calculate',actor:'maker',service:'lib/internal-own-payroll-run.js',export:'ownRunOperation',operation:'calculate',requestKey:id('calculate'),requiresRealResult:true},
  {id:'confirm',actor:'checker',service:'lib/internal-own-payroll-liquidation.js',export:'ownLiquidationOperation',operation:'command',command:'confirm',requestKey:id('confirm'),requiresRealResult:true},
  {id:'annul-v2',actor:'checker',service:'lib/internal-own-payroll-annulment.js',export:'ownAnnulOperation',operation:'command-v2',requestKey:id('annul'),requiresRealResult:true},
  {id:'recalculate',actor:'maker',service:'lib/internal-own-payroll-run.js',export:'ownRunOperation',operation:'calculate',requestKey:id('recalculate'),requiresRealResult:true},
  {id:'confirm-recalculation',actor:'checker',service:'lib/internal-own-payroll-liquidation.js',export:'ownLiquidationOperation',operation:'command',command:'confirm',requestKey:id('reconfirm'),requiresRealResult:true},
  {id:'close',actor:'checker',service:'lib/internal-own-payroll-close.js',export:'ownCloseOperation',operation:'command',command:'close',requestKey:id('close'),requiresRealResult:true},
  {id:'report-census',actor:'checker',service:'lib/internal-own-payroll-close.js',export:'ownCloseOperation',operation:'report-census',requiresRealResult:true},
  {id:'rollback',role:'owner',end:'ROLLBACK',mustBeObserved:true},
 ];
 const plan=freeze({version:OWN_M7_NATIVE_TEST_FIXTURE_VERSION,kind:'test',schema:'public',sourceCommit,runId,target:admission.target,branchCreation:admission.branchCreation,
  scope:{tenantId,bindingId,slug,sourceDatabase,companyId},actors,subjects,canonical:{classification,salaryItems:programOwnerQaItems(),program:programOwnerQaDefinition(),period:'2026-10',liquidationType:'monthly',jurisdictionCode:'42'},
  seededCatalog:{proposalId:catalogProposalId,reviewId:catalogReviewId,revision:1,seedOnly:true,rpcExecuted:false},bootstrapOwner,steps,
  transaction:{isolation:'read committed',readOnly:false,end:'ROLLBACK',observedEndRequired:true,retentionExpected:false},
  expectedCounts:{actors:2,seededNativePersons:2,seededNativeContracts:2,seededNativeRegistrations:2,apiCreatedBeneficiaries:1,totalNativePersonsAfterCreate:3,totalNativeContractsAfterCreate:3,grhEmployees:0,grhCatalogRows:0,sourceImportBatches:0},
  authentication:{businessSyntheticAuth:true,completeAuthenticationHandler:false,realMfaVerified:false,realJwtIssued:false},
  issuer:{kind:'synthetic_test',name:'ENTIDAD FICTICIA TEST '+runId,institutionalIdentity:false,state:'pending_explicit_test_adapter'},
  pending:[{code:'EMPTY_TENANT_ONBOARDING',reason:'Operators and approved initial catalog are seeded preconditions, not commands tested.'},{code:'RECEIPT_PREPARER_ACCESS',reason:'126 requires calculation.approve for receipt preparation; maker intentionally lacks it. No new permission inferred.'},{code:'BENEFICIARY_SELF_RECEIPT',reason:'No third actor, client account or beneficiary link is created in this increment.'},{code:'REAL_AUTHENTICATION',reason:'No authentication handler, MFA ceremony or JWT issuance is tested.'}],
  sourceHashes:Object.fromEntries(Object.entries(custody.sources).map(([file,p])=>[file,p.sha256])),sourceInputs:custody.sources,sourceManifestSha256:sha(JSON.stringify(custody.sources)),
  productionAdmitted:false,executionAdmitted:false,connects:false,executesSql:false});
 minted.set(plan,custody);custody.bookend();return plan;
}

export function assertOwnM7NativeTestFixturePlan(plan){assert.ok(minted.has(plan),'M7_FIXTURE_MINTED_REQUIRED');assert.equal(plan.version,OWN_M7_NATIVE_TEST_FIXTURE_VERSION);minted.get(plan).bookend();return plan;}
export function bookendOwnM7NativeTestFixture(plan){assertOwnM7NativeTestFixturePlan(plan);return true;}

/** Real bootstrap supplies today and catalogVersion. The beneficiary's native
 * person/contract/registration IDs can only be supplied by the service result. */
export function materializeOwnM7NativeTestEmployee(options){
 exact(options,['plan','subject','bootstrap'],'M7_FIXTURE_EMPLOYEE_OPTIONS');const {plan}=options;assertOwnM7NativeTestFixturePlan(plan);assert.equal(options.subject,'beneficiary','M7_FIXTURE_ONLY_API_BENEFICIARY');
 const bootstrap=employeeCreationBootstrap(json(options.bootstrap));assert.equal(bootstrap.canCreate,true);assert.equal(bootstrap.scope.tenantId,plan.scope.tenantId);assert.equal(bootstrap.scope.membershipId,plan.actors.maker.membershipId);assert.equal(bootstrap.today.slice(0,7),plan.canonical.period,'M7_FIXTURE_CANONICAL_PERIOD_EXPIRED');assert.equal(bootstrap.catalog.origin,'MUNICONTROL','M7_FIXTURE_OWN_CATALOG_REQUIRED');
 const subject=plan.subjects.find(s=>s.key==='beneficiary'),draft=employeeDraft(json(subject.draft),bootstrap.today,{requireJurisdiction:true});
 for(const [kind,code]of [['agreements',draft.agreementCode],['categories',draft.categoryCode],['organizations',draft.organizationId],['sectors',draft.sectorCode]])assert.ok(bootstrap.catalog.items.some(row=>row.kind===kind&&row.code===code&&(kind!=='categories'||row.agreementCode===draft.agreementCode)&&row.registrationAllowed!==false),'M7_FIXTURE_CATALOG_SELECTION:'+kind);
 return freeze({key:subject.requestKey,body:{draft,catalogVersion:bootstrap.catalog.version}});
}

/** Structural row-count check only. It is not a native receipt or admission. */
export function assertOwnM7NativeTestSeedObservation(plan,observations){
 assertOwnM7NativeTestFixturePlan(plan);const rows=json(observations);assert.ok(Array.isArray(rows));assert.equal(rows.length,plan.bootstrapOwner.statements.length,'M7_FIXTURE_SEED_OBSERVATION_COUNT');
 rows.forEach((row,index)=>{exact(row,['command','rowCount','rows'],'M7_FIXTURE_SEED_OBSERVATION_FIELDS');assert.equal(row.command,plan.bootstrapOwner.expectedCommands[index]);assert.equal(row.rowCount,plan.bootstrapOwner.expectedRowCounts[index],'M7_FIXTURE_SEED_ROW_COUNT:'+index);assert.deepEqual(row.rows,[]);});return true;
}
