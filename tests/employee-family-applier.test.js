import test from 'node:test';
import assert from 'node:assert/strict';
import {assertEmployeeFamilySchemaPreserved,employeeFamilyStorageMeasurement,employeeFamilyApplierArgs,employeeFamilyOperationalUrl} from '../scripts/lib/employee-family-schema-evidence.mjs';
const before={certificates:{one:'hash1'},blobs:{one:'hash2'},events:{one:'hash3'},legacy_functions:{one:'hash4'},legacy_table_acl:{one:'hash5'}};
test('064 preservation allows legitimate appended certificates and read events without masking lost or changed prior rows',()=>{
  const after=structuredClone(before);after.certificates.two='new';after.events.two='new';
  assert.doesNotThrow(()=>assertEmployeeFamilySchemaPreserved(before,after));
  for(const group of ['certificates','blobs','events']){
    const deleted=structuredClone(after);delete deleted[group].one;assert.throws(()=>assertEmployeeFamilySchemaPreserved(before,deleted));
    const changed=structuredClone(after);changed[group].one='changed';assert.throws(()=>assertEmployeeFamilySchemaPreserved(before,changed));
  }
});

test('064 applier requires the reviewed SHA and rejects ambiguous/malformed arguments before connecting',()=>{
  const hash='a'.repeat(64), base=['--expected-checksum='+hash];
  assert.equal(employeeFamilyApplierArgs(base)['expected-checksum'],hash);
  for(const args of [[],[...base,...base],[...base,'--apply=true','--apply=false'],[...base,'--apply'],[...base,'apply=true'],[...base,'--other=value'],[...base,'--backup-report=']]) assert.throws(()=>employeeFamilyApplierArgs(args));
});
test('064 applier validates the exact existing endpoint/database/port and TLS instead of rewriting a connection target',()=>{
  const value='postgresql://neondb_owner:synthetic@ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require';
  assert.equal(employeeFamilyOperationalUrl(value).href,value);
  for(const v of [value.replace('ep-shiny-cherry-actlyudg','wrong'),value.replace('/neondb?','/other?'),value.replace(':5432',':5433'),
    value.replace('?sslmode=require',''),value.replace('sslmode=require','sslmode=disable'),value+'&sslmode=require',value+'&options=anything',value.replace('neondb_owner:','other:')]) assert.throws(()=>employeeFamilyOperationalUrl(v));
});
test('064 preservation rejects a change to 057 function definitions or table ACL',()=>{
  for(const group of ['legacy_functions','legacy_table_acl']){const after=structuredClone(before);after[group].one='changed';assert.throws(()=>assertEmployeeFamilySchemaPreserved(before,after));}
});
test('064 storage gate measures actual cluster free bytes above reserve, including physical database size',()=>{
  const row={database_bytes:'100000000',capacity:{clusterBytes:400000000,clusterLimitBytes:536870912,clusterReserveBytes:16777216,
    capacityBytes:8388608,usedBytes:100,remainingBytes:8388508,mode:'database_pilot'}};
  const measured=employeeFamilyStorageMeasurement(row);assert.equal(measured.databaseBytes,100000000);assert.equal(measured.bytesAboveReserve,120093696);
  row.capacity.clusterBytes=536870912-100;assert.throws(()=>employeeFamilyStorageMeasurement(row),/STORAGE_ACTUAL_RESERVE_EXHAUSTED/);
  row.capacity.clusterBytes=null;assert.throws(()=>employeeFamilyStorageMeasurement(row));
});
