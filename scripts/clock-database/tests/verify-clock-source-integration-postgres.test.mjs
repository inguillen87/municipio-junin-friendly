import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClockSourceIntegrationQa,parseClockIntegrationArgs} from '../../verify-clock-source-integration-postgres.mjs';

test('phase2 QA only generates explicitly pinned local disposable SQL',()=>{
 for(const serverMajor of [undefined,16,19,'18;SELECT 1'])assert.throws(()=>buildClockSourceIntegrationQa({serverMajor}));
 for(const argv of [[],['--ci'],['--ci','--write-sql=x','--execute'],['--ci','--write-sql=x','--database-url=postgresql://remote/example'],['--ci','--ci','--write-sql=x']])assert.throws(()=>parseClockIntegrationArgs(argv));
 assert.deepEqual(parseClockIntegrationArgs(['--ci','--expected-major=18','--write-sql=verification/qa.sql']),{ci:true,'expected-major':'18','write-sql':'verification/qa.sql'});
});

test('phase2 QA executes both real migrations with LOGIN identities and verifies rollback',()=>{
 for(const serverMajor of [17,18]){
  const {sql,report}=buildClockSourceIntegrationQa({serverMajor});
  assert.equal(report.foundationSha256,'5d87b9daf1ad86353d9cb77dc819264e0b869945606472987c14144bfd526fc3');
  assert.equal(report.effectiveLoginRolesExercised,true);assert.equal(report.productionContacted,false);
  assert.match(sql,/current_database\(\)<>'clock_source_qa'/);assert.match(sql,/inet_server_addr\(\).*127\.0\.0\.1/);
  assert.match(sql,/neon\.project_id/);assert.match(sql,/SET LOCAL SESSION AUTHORIZATION/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION clock_source\.receive_v1/);assert.match(sql,/CREATE OR REPLACE FUNCTION clock_source\.fleet_v1/);
  assert.match(sql,/CLOCK_SOURCE_INTEGRATION_QA_SUCCESS_ROLLBACK/);assert.match(sql,/CLOCK_SOURCE_INTEGRATION_QA_ROLLBACK_FAILED/);
  assert.match(sql,/^\\set ON_ERROR_STOP on/);assert.match(sql,/ROLLBACK;\s*$/);assert.doesNotMatch(sql,/^\s*COMMIT\s*;/mi);
 }
});
