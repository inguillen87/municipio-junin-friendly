// Pure port-policy protocols with explicit synthetic DI. No Linux/CI/auth,
// service ownership, database, SQL or browser operation is proved here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ownPayrollQaPort,createOwnPayrollPsqlQa} from '../scripts/lib/own-payroll-psql-qa.mjs';
const options=(major=17,port=61317)=>({major,port,ciServicePort:String(port)});
function context(port=61317) {
  return {platform:'linux',root:'/qa',realpath:value=>value,env:{CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'inguillen87/municipio-junin-friendly',GITHUB_JOB:'reports',GITHUB_RUN_ID:'123456',GITHUB_SHA:'1'.repeat(40),GITHUB_WORKSPACE:'/qa',MUNICONTROL_OWN_REPORTS_CI_SERVICE_PORT:String(port),PGPASSWORD:'own-reports-synthetic-qa'}};
}
test('default local policy retains55417/55418 and never reads CI/workspace without opt-in',()=>{
  for(const major of [17,18]) {
    let paths=0;const ctx={platform:'win32',env:{},root:'/qa',realpath:()=>{paths++;throw Error('must not read workspace');}};
    assert.equal(ownPayrollQaPort({major,port:55400+major},ctx),55400+major);assert.equal(paths,0);
    for(const port of [5432,61317,'55417',true,null])assert.throws(()=>ownPayrollQaPort({major,port},ctx));
  }
});
test('an ambient service-port variable alone never changes another consumer default',()=>{
  const ctx=context();
  for(const port of [55417,61317])assert.throws(()=>ownPayrollQaPort({major:17,port},ctx),/QA_CI_SERVICE_PORT_OPT_IN_REQUIRED/);
});
test('explicit reports CI policy accepts both majors with assigned high ports and merge-shaped SHA',()=>{
  for(const [major,port] of [[17,10432],[18,61318]]) {
    const ctx=context(port);assert.equal(ownPayrollQaPort(options(major,port),ctx),port);
    assert.notEqual(ctx.env.GITHUB_SHA,'178c62c259ce45a6e42c82de9e8c04e6f4894176');
  }
});
test('port text and numeric argument must be the same bounded positive integer',()=>{
  for(const patch of [{ciServicePort:null},{ciServicePort:true},{ciServicePort:61317},{ciServicePort:'061317'},{ciServicePort:'61317x'},{port:61317.5},{port:61318},{port:'61317'},{port:1023,ciServicePort:'1023'},{port:65536,ciServicePort:'65536'}])
    assert.throws(()=>ownPayrollQaPort({...options(),...patch},context()));
  for(const major of [16,19,'17',true])assert.throws(()=>ownPayrollQaPort({...options(),major},context()));
});
test('non-CI platform, repository, job, run or SHA context refuses the explicit override',()=>{
  for(const platform of ['win32','darwin'])assert.throws(()=>ownPayrollQaPort(options(),{...context(),platform}));
  for(const [key,value] of [['CI','false'],['GITHUB_ACTIONS','false'],['GITHUB_REPOSITORY','other/repo'],['GITHUB_JOB','close'],['GITHUB_RUN_ID',''],['GITHUB_RUN_ID','0'],['GITHUB_SHA','master'],['GITHUB_SHA','g'.repeat(40)]]) {
    const ctx=context();ctx.env[key]=value;assert.throws(()=>ownPayrollQaPort(options(),ctx));
  }
});
test('explicit port must match exactly the service-port environment of this reports step',()=>{
  for(const value of [undefined,'', '61318', '061317',61317]) {
    const ctx=context();if(value===undefined)delete ctx.env.MUNICONTROL_OWN_REPORTS_CI_SERVICE_PORT;else ctx.env.MUNICONTROL_OWN_REPORTS_CI_SERVICE_PORT=value;
    assert.throws(()=>ownPayrollQaPort(options(),ctx));
  }
});
test('workspace must resolve to the same repository and path errors fail closed',()=>{
  for(const value of [undefined,'','/other']) {const ctx=context();ctx.env.GITHUB_WORKSPACE=value;assert.throws(()=>ownPayrollQaPort(options(),ctx));}
  const ctx=context();ctx.env.GITHUB_WORKSPACE='/alias';ctx.realpath=value=>value==='/alias'?'/qa':value;
  assert.equal(ownPayrollQaPort(options(),ctx),61317);
  ctx.realpath=()=>{throw Error('synthetic path unavailable');};assert.throws(()=>ownPayrollQaPort(options(),ctx));
});
test('ambient libpq routing, service, role options and passfile cannot redirect the new CI mode',()=>{
  for(const key of ['PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSFILE','PGAPPNAME','pghost']) {
    const ctx=context();ctx.env[key]='synthetic-disallowed-setting';assert.throws(()=>ownPayrollQaPort(options(),ctx));
  }
});
test('only the existing public synthetic password and UTF8 setting are allowed in opted-in CI',()=>{
  for(const value of [undefined,'', 'synthetic-wrong-password']) {const ctx=context();ctx.env.PGPASSWORD=value;assert.throws(()=>ownPayrollQaPort(options(),ctx));}
  const ctx=context();ctx.env.PGCLIENTENCODING='UTF8';assert.equal(ownPayrollQaPort(options(),ctx),61317);
  ctx.env.PGCLIENTENCODING='LATIN1';assert.throws(()=>ownPayrollQaPort(options(),ctx));
});
test('policy does not mutate caller environment, context or port options',()=>{
  const ctx=context(),opts=options(),envBefore={...ctx.env},optsBefore={...opts};
  Object.freeze(ctx.env);Object.freeze(ctx);Object.freeze(opts);
  assert.equal(ownPayrollQaPort(opts,ctx),61317);assert.deepEqual(ctx.env,envBefore);assert.deepEqual(opts,optsBefore);
});

test('SQL constructor rejects an ambient CI mapping without explicit opt-in before creating transport',()=>{
  assert.throws(()=>createOwnPayrollPsqlQa({executable:'must-not-execute',major:17,port:55417,
    environment:{MUNICONTROL_OWN_REPORTS_CI_SERVICE_PORT:'61317'}}),/QA_CI_SERVICE_PORT_OPT_IN_REQUIRED/);
});
