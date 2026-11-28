import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { payrollOperatorIdentity } from '../assets/payroll-operator-identity.js';
import { fixedBootstrap, fixedActorReady, fixedCapability } from '../assets/payroll-fixed-novelties-model.js';
import { validateFixedResponse } from '../lib/internal-payroll-fixed-novelties.js';
import { verifyMonthlyBootstrap } from '../assets/payroll-native-monthly-model.js';
import { createInternalPayrollFixedNoveltiesHandler } from '../api/internal-payroll-fixed-novelties.js';
import { fixedFixture, fixedUuid as id } from './fixtures/payroll-fixed-novelties-synthetic.js';

// Contract-level responses are synthetic. Real authentication SQL, native
// proposal/review, person separation and revocation are tested in PG17/18.
const boot = (basis = 'certified_platform_owner') => {
  const value = fixedFixture().bootstrap();value.version='payroll-fixed-bootstrap.v2';
  value.principal={...value.principal,employmentLinked:basis==='active_employment',actorIdentityVerified:basis!==null,actorIdentityBasis:basis,
    capabilities:['payroll.novelty.read','payroll.novelty.nominal.read','payroll.fixed.approve']};return value;
};
const wrap = data => ({ok:true,data});
const expected = data => ({tenantId:data.principal.tenantId,membershipId:data.principal.membershipId});
const monthly = principal => ({feature:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only'},limits:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only',maxRows:500,sourceModes:['individual','bulk'],payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other'],native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']},grhMutation:false,payrollCalculated:false,payrollPosted:false},principal,batches:[]});

for(const basis of ['certified_platform_owner','active_employment',null])test('server and browser preserve explicit operator evidence: '+basis,()=>{
  const value=boot(basis),before=structuredClone(value);validateFixedResponse(value,'bootstrap',expected(value));
  const verified=fixedBootstrap(wrap(value));assert.deepEqual(verified,before);assert.deepEqual(value,before);
  assert.equal(fixedActorReady(verified),basis!==null);assert.equal(verified.principal.employmentLinked,basis==='active_employment');
  assert.deepEqual(payrollOperatorIdentity(verified.principal,{required:true}),{verified:basis!==null,basis});
  assert.equal(verifyMonthlyBootstrap(monthly(structuredClone(value.principal))).principal.actorIdentityBasis,basis);
});

test('operator identity never substitutes for dedicated capability or nominal visibility',()=>{
  const value=boot(),outer=new Set(['payroll.novelty.read','payroll.novelty.nominal.read']);
  assert.equal(fixedActorReady(value),true);assert.equal(fixedCapability(value,outer,'payroll.fixed.approve'),true);
  assert.equal(fixedCapability(value,outer,'payroll.fixed.prepare'),false);
  value.principal.capabilities=value.principal.capabilities.filter(c=>c!=='payroll.fixed.approve');
  assert.equal(fixedActorReady(value),true);assert.equal(fixedCapability(value,outer,'payroll.fixed.approve'),false);
  assert.equal(fixedCapability(boot(),new Set(['payroll.novelty.read']),'payroll.fixed.approve'),false);
  assert.equal(value.principal.employmentLinked,false);
});

const malformed=[
 ['missing verified',p=>delete p.actorIdentityVerified],['missing basis',p=>delete p.actorIdentityBasis],
 ['text verified',p=>p.actorIdentityVerified='true'],['numeric verified',p=>p.actorIdentityVerified=1],
 ['unknown basis',p=>p.actorIdentityBasis='role_name_only'],['owner is not employment',p=>p.employmentLinked=true],
 ['employment claim without employment',p=>p.actorIdentityBasis='active_employment'],['verified without basis',p=>p.actorIdentityBasis=null],
 ['unverified with owner basis',p=>p.actorIdentityVerified=false],['missing employment',p=>delete p.employmentLinked],
 ['string employment',p=>p.employmentLinked='false'],['basis object',p=>p.actorIdentityBasis={role:'PLATFORM_OWNER'}],
];
for(const [label,change] of malformed)test('contradictory or incomplete identity evidence fails closed: '+label,()=>{
  const value=boot();change(value.principal);
  assert.throws(()=>validateFixedResponse(value,'bootstrap',expected(value)),{code:'PAYROLL_FIXED_CONTRACT_DRIFT'});
  assert.throws(()=>fixedBootstrap(wrap(value)));assert.equal(fixedActorReady(value),false);
  assert.throws(()=>verifyMonthlyBootstrap(monthly(value.principal)));
});

test('legacy fixed bootstrap retains its original exact shape and employment behavior',()=>{
  for(const linked of [true,false]){
    const value=fixedFixture().bootstrap();value.principal.employmentLinked=linked;
    validateFixedResponse(value,'bootstrap',expected(value));assert.deepEqual(fixedBootstrap(wrap(value)),value);assert.equal(fixedActorReady(value),linked);
    const injected=structuredClone(value);injected.principal.actorIdentityVerified=true;injected.principal.actorIdentityBasis='certified_platform_owner';
    assert.throws(()=>validateFixedResponse(injected,'bootstrap',expected(value)));assert.throws(()=>fixedBootstrap(wrap(injected)));
  }
  const missing=boot();delete missing.principal.actorIdentityVerified;delete missing.principal.actorIdentityBasis;
  assert.throws(()=>validateFixedResponse(missing,'bootstrap',expected(missing)));assert.throws(()=>fixedBootstrap(wrap(missing)));
});

test('version drift and unrelated principal fields remain rejected by both fixed validators',()=>{
  for(const patch of [{version:'payroll-fixed-bootstrap.v3'},{principal:{...boot().principal,platformOwner:true}},{principal:{...boot().principal,actorPersonId:id(99)}}]){
    const value={...boot(),...patch};assert.throws(()=>validateFixedResponse(value,'bootstrap',expected(value)));assert.throws(()=>fixedBootstrap(wrap(value)));
  }
});

test('monthly legacy response remains compatible without inferred operator accreditation',()=>{
  const principal={tenantId:id(1),membershipId:id(2),certifiedBindingId:id(3),capabilities:['payroll.novelty.read','payroll.novelty.nominal.read']};
  const value=monthly(principal);assert.equal(verifyMonthlyBootstrap(value),value);assert.equal(Object.hasOwn(value.principal,'actorIdentityVerified'),false);
});

const session={id:id(900),email:'operator@example.invalid',version:1,releaseSha:'a'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}});
const handler = result => createInternalPayrollFixedNoveltiesHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},
  requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{user:{email:session.email},tenant:{source:'membership',id:id(1),membershipId:id(2),certifiedReleaseSha:session.releaseSha,effectiveCapabilities:['payroll.novelty.read','payroll.novelty.nominal.read']}}}),
  actionMutationSession:()=>session,getInternalSql:async()=>({query:async()=>[{result}]})});
test('actual API handler accepts owner bootstrap without rewriting employment or granting rights',async()=>{
  const value=boot(),res=response();await handler(value)({method:'GET',url:'/api/internal-payroll-fixed-novelties?resource=bootstrap',query:{resource:'bootstrap'},headers:{}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(res.body.data,value);assert.equal(res.body.data.principal.employmentLinked,false);assert.equal(res.body.data.principal.actorIdentityVerified,true);
  assert.match(res.headers['Cache-Control'],/no-store/);
});
test('actual API handler rejects contradictory owner bootstrap as contract drift',async()=>{
  const value=boot();value.principal.employmentLinked=true;const res=response();await handler(value)({method:'GET',url:'/api/internal-payroll-fixed-novelties?resource=bootstrap',query:{resource:'bootstrap'},headers:{}},res);
  assert.equal(res.statusCode,503);assert.equal(res.body.code,'PAYROLL_FIXED_CONTRACT_DRIFT');
});

test('fixed UI retains Claude concept picker and requires identity plus each dedicated permission',()=>{
  const source=fs.readFileSync(new URL('../assets/payroll-fixed-novelties.js',import.meta.url),'utf8');
  assert.match(source,/const allowedPrepare=\(\)=>can\('payroll\.fixed\.prepare'\)&&fixedActorReady\(bootstrap\)/);
  assert.match(source,/const allowedReview=\(\)=>can\('payroll\.fixed\.approve'\)&&fixedActorReady\(bootstrap\)/);
  assert.match(source,/fixedConceptName/);assert.match(source,/fixedDayText/);assert.match(source,/Unidades declaradas/);
  assert.match(source,/otra persona con permiso vigente/);assert.doesNotMatch(source,/bootstrap\.principal\.employmentLinked/);
  assert.match(fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8'),/'assets\/payroll-operator-identity\.js'/);
});
