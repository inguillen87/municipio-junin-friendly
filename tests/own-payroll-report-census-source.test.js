// Pure proof/metadata parsing only. Never call the SQL200 installation builder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {OWN_REPORT_CENSUS_MIGRATION,OWN_REPORT_CENSUS_SQL_SHA256,OWN_REPORT_CENSUS_SIGNATURE,assertOwnReportCensusDurability} from '../scripts/lib/own-payroll-report-census-installation.mjs';

const sourceCommit='d'.repeat(40),batch={sourceCommit,sourceHashes:{[OWN_REPORT_CENSUS_MIGRATION]:OWN_REPORT_CENSUS_SQL_SHA256}};
const proof=()=>({version:'own-report-census-installation.v1',sourceCommit,sourceHashes:structuredClone(batch.sourceHashes),mode:'install',newTables:0,newFunctions:1,runtimeFacades:1,adaptedFunctions:0,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,eventRows:42,preservationSha256:'a'.repeat(64),objectFingerprint:'b'.repeat(64),beforeFingerprint:'a'.repeat(64)});
const durable=value=>{const {beforeFingerprint,...rest}=structuredClone(value);rest.mode='verify';return rest;};

test('la durabilidad permite historia poblada y exige conservar exactamente datos y objeto',()=>{
 const installed=proof(),later=durable(installed),before=JSON.stringify([installed,later]);
 assert.deepEqual(assertOwnReportCensusDurability({installed,durable:later,batch}),{passed:true,sourceCommit,priorStatePreserved:true,metadataVerified:true,businessWrites:0,nominalRowsReturned:0});
 assert.equal(JSON.stringify([installed,later]),before);
});
test('no admite desaparición de filas, cambios de ACL/función ni prueba de datos distintos',()=>{
 const installed=proof();
 for(const patch of[{eventRows:0},{eventRows:-1},{objectFingerprint:'c'.repeat(64)},{preservationSha256:'c'.repeat(64)},{existingAclChanges:1},{adaptedFunctions:1},{businessWrites:1},{roleAssignmentsAdded:1},{nominalRowsReturned:1},{newTables:1},{runtimeFacades:2},{mode:'install'}]){
  assert.throws(()=>assertOwnReportCensusDurability({installed,durable:{...durable(installed),...patch},batch}));
 }
 const changed=proof();changed.beforeFingerprint='e'.repeat(64);assert.throws(()=>assertOwnReportCensusDurability({installed:changed,durable:durable(changed),batch}),/PRIOR_STATE_CHANGED/);
});
test('SHA exacto y todas las fuentes son obligatorias, sin transferir la prueba a otro commit',()=>{
 const installed=proof();
 for(const patch of[{sourceCommit:'e'.repeat(40)},{sourceHashes:{}},{sourceHashes:{...batch.sourceHashes,unknown:'e'.repeat(64)}},{sourceHashes:{[OWN_REPORT_CENSUS_MIGRATION]:'e'.repeat(64)}}])assert.throws(()=>assertOwnReportCensusDurability({installed,durable:{...durable(installed),...patch},batch}));
});
test('una verificación previa compatible conserva el mismo objeto, sin simular una instalación nueva',()=>{
 const installed=proof();installed.mode='verify';assert.equal(assertOwnReportCensusDurability({installed,durable:durable(installed),batch}).passed,true);
 for(const mode of['unknown',null,''])assert.throws(()=>assertOwnReportCensusDurability({installed:{...installed,mode},durable:durable(installed),batch}));
});
test('la fuente200 tiene una sola función y sólo sus dos declaraciones de privilegios',()=>{
 const source=fs.readFileSync(new URL('../'+OWN_REPORT_CENSUS_MIGRATION,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
 assert.equal(createHash('sha256').update(source).digest('hex'),OWN_REPORT_CENSUS_SQL_SHA256);
 const statements=splitPostgresStatements(source).map(value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());
 assert.equal(statements.length,3);assert.match(statements[0],/^CREATE FUNCTION public\.own_close_report_census_v1\(/);
 assert.equal(statements[1],'REVOKE ALL ON FUNCTION '+OWN_REPORT_CENSUS_SIGNATURE+' FROM PUBLIC,municontrol_actions_runtime_app');
 assert.equal(statements[2],'GRANT EXECUTE ON FUNCTION '+OWN_REPORT_CENSUS_SIGNATURE+' TO municontrol_actions_runtime_app');
 const pin=ownInstallationFunctionPin(statements[0]);
 assert.equal(pin.signature,OWN_REPORT_CENSUS_SIGNATURE);assert.equal(pin.sha256,'16b0b8faa8016cac5d70d8c34d5e303567ec84686af2f63fbc3cef51a1216f2c');
 assert.deepEqual(pin.argNames,['p','period_value','type_value']);assert.deepEqual(pin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);assert.equal(pin.definer,true);assert.equal(pin.resultType,'jsonb');
});
