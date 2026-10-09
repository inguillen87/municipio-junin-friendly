// Review-only, one-function upgrade. No connection, nominal data or execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildOwnAccountingInstallation} from './own-accounting-installation.mjs';
export const SQL150_SHA256='ed047dcb31706a23b3cc305cb7254f57fd8128f07724e5bcdbe8c2375704b609';
const file='scripts/migrations/150-own-accounting-bank-destinations.sql';
const signature='public.own_accounting_definition_v1(jsonb,jsonb,jsonb)';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const hash=v=>createHash('sha256').update(v).digest('hex');
function snapshot(slot){
  return preservationSnapshot(slot)
    .replaceAll('public.native_leave_event','public.own_accounting_bank_no_excluded_table')
    .replace("p.proname LIKE 'native_leave_%'","p.oid=to_regprocedure("+q(signature)+")")
    .replaceAll('municontrol_sql111.','municontrol_sql150.');
}
export function buildOwnAccountingBankInstallation({read,sourceCommit}){
  assert.match(sourceCommit,/^[a-f0-9]{40}$/);
  const prior=buildOwnAccountingInstallation({read,sourceCommit}),source=read(file).replace(/\r\n?/g,'\n');
  assert.equal(hash(source),SQL150_SHA256,'ACCOUNTING_BANK_REVIEWED_SOURCE_CHANGED');
  const migration=splitPostgresStatements(source);assert.equal(migration.length,2);
  assert.match(migration[0].replace(/^(?:--[^\n]*\n)+/,''),/^DO \$guard\$/);assert.match(migration[1],/^CREATE OR REPLACE FUNCTION public\.own_accounting_definition_v1\(/);
  const oldPin=prior.ownPins.find(p=>p.signature===signature),newPin={...ownInstallationFunctionPin(migration[1]),runtime:false};
  assert.ok(oldPin);assert.equal(newPin.signature,signature);
  assert.deepEqual({...oldPin,sha256:null},{...newPin,sha256:null},'ACCOUNTING_BANK_METADATA_CHANGED');
  const currentPins=prior.ownPins.map(p=>p.signature===signature?newPin:p);
  const preflight=[prior.preflight,pinsCheck(prior.ownPins,'ACCOUNTING_BANK_PRIOR_METADATA'),prior.tableCheck];
  const ownCheck=pinsCheck(currentPins,'ACCOUNTING_BANK_FUNCTION_METADATA'),before=snapshot('before'),after=snapshot('after');
  const conservation="DO $conservation$ BEGIN IF current_setting('municontrol_sql150.before')::jsonb IS DISTINCT FROM current_setting('municontrol_sql150.after')::jsonb THEN RAISE EXCEPTION 'ACCOUNTING_BANK_PRIOR_STATE_CHANGED';END IF;END $conservation$";
  const proof=`SELECT jsonb_build_object('version','own-accounting-bank-installation.v1','sourceCommit',${q(sourceCommit)},'migrationSha256',${q(hash(source))},'validatorSha256',${q(newPin.sha256)},'newTables',0,'newFunctions',0,'replacedFunctions',1,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public.own_payroll_accounting_event),'preservationSha256',encode(public.digest(current_setting('municontrol_sql150.after')::jsonb::text,'sha256'),'hex'),'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql150.before')::jsonb::text,'sha256'),'hex')) AS proof`;
  const durableProof=proof.replace(",'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql150.before')::jsonb::text,'sha256'),'hex')",'');
  return {version:'own-accounting-bank-installation.v1',sourceCommit,sourceHashes:{[file]:hash(source)},oldPin,newPin,currentPins,migration,preflight,ownCheck,before,after,conservation,proof,durableProof,
    installation:[...preflight,before,...migration,ownCheck,prior.tableCheck,after,conservation,proof],
    durableVerification:[prior.preflight,ownCheck,prior.tableCheck,after,durableProof],connects:false,executesSql:false};
}
export function assertOwnAccountingBankDurability({installed,durable,sourceCommit,validatorSha256}){
  for(const v of [installed,durable]){
    assert.equal(v.version,'own-accounting-bank-installation.v1');assert.equal(v.sourceCommit,sourceCommit);assert.equal(v.migrationSha256,SQL150_SHA256);assert.equal(v.validatorSha256,validatorSha256);
    for(const [k,w]of Object.entries({newTables:0,newFunctions:0,replacedFunctions:1,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(v[k],w,'ACCOUNTING_BANK_PROOF_INVALID: '+k);
    assert.ok(Number.isSafeInteger(v.eventRows)&&v.eventRows>=0);assert.match(v.preservationSha256,/^[a-f0-9]{64}$/);
  }
  assert.equal(installed.beforeFingerprint,installed.preservationSha256,'ACCOUNTING_BANK_PRIOR_STATE_CHANGED');
  const {beforeFingerprint,...after}=installed;assert.deepEqual(after,durable,'ACCOUNTING_BANK_NOT_DURABLE');
  return {passed:true,priorStatePreserved:true,metadataVerified:true,businessWrites:0,nominalRowsReturned:0};
}
