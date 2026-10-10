// A forward correction of three published accounting consumers. No IAM grants.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';

const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const hash=v=>createHash('sha256').update(v).digest('hex');
const lf=v=>v.replace(/\r\n?/g,'\n');
const oldCall='ctx:=public.own_close_context_v1(p,true);';
const newCall='ctx:=public.own_run_context_v1(p,true,false);';
const resources=['bootstrap','source','detail','attempt','command'];
const inputs=[['148-own-payroll-imputation.sql','imputation'],['152-own-payroll-journal.sql','journal'],['153-own-payroll-reconciliation.sql','reconciliation']];
export function accountingPreparationDefinitions(read){
  const result=[];
  for(const[file,kind]of inputs){
    const statements=splitPostgresStatements(lf(read('scripts/migrations/'+file)));
    const affected=statements.filter(s=>s.startsWith('CREATE FUNCTION public.own_'+kind+'_')&&s.includes(oldCall));
    assert.equal(affected.length,5,kind);
    for(const definition of affected){
      const pin=ownInstallationFunctionPin(definition);
      assert.equal(definition.split(oldCall).length,2,pin.name);
      const runtime=resources.some(r=>pin.name==='own_'+kind+'_'+r+'_v1');
      const original={...pin,runtime};
      const corrected={...ownInstallationFunctionPin(definition.replace(oldCall,newCall)),runtime};
      assert.deepEqual({...original,sha256:null},{...corrected,sha256:null});
      result.push({original,corrected});
    }
  }
  assert.equal(result.length,15);return result;
}
export function accountingPreparationMigration(read){
  const definitions=accountingPreparationDefinitions(read);
  const pins=definitions.map(({original,corrected})=>[original.signature,original.sha256,corrected.sha256]);
  return `-- Correct accounting read/preparation; confirmation and close remain unchanged.
-- No new tables, role grants, business records, calculations or payments.
DO $accounting_access$
DECLARE x jsonb;p pg_proc;definition text;
BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>0);
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') IS DISTINCT FROM x->>1 THEN RAISE EXCEPTION 'ACCOUNTING_ACCESS_BASELINE_CHANGED';END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
  definition:=pg_get_functiondef(to_regprocedure(x->>0));
  IF (length(definition)-length(replace(definition,${q(oldCall)},'')))/length(${q(oldCall)})<>1 THEN RAISE EXCEPTION 'ACCOUNTING_ACCESS_CALL_CHANGED';END IF;
  EXECUTE replace(definition,${q(oldCall)},${q(newCall)});
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>0);
  IF encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') IS DISTINCT FROM x->>2 THEN RAISE EXCEPTION 'ACCOUNTING_ACCESS_RESULT_CHANGED';END IF;
 END LOOP;
END $accounting_access$;
`;
}
export function accountingPreparationSnapshot(slot,signatures){
  const targets=signatures.map(s=>`to_regprocedure(${q(s)})`).join(',');
  const original=preservationSnapshot(slot);
  assert.equal(original.split("AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')").length,3);
  return original
    .replaceAll("AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'')
    .replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'')
    .replace("to_jsonb(p)::text,'sha256'",`(CASE WHEN p.oid IN(${targets}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256'`)
    .replaceAll('municontrol_sql111.','municontrol_sql154.');
}
export function buildAccountingPreparationInstallation({read,sourceCommit}){
  assert.match(sourceCommit,/^[a-f0-9]{40}$/);
  const file='scripts/migrations/154-accounting-preparation-access.sql',source=lf(read(file));
  assert.equal(source,accountingPreparationMigration(read),'ACCOUNTING_ACCESS_UNREVIEWED_MIGRATION');
  const definitions=accountingPreparationDefinitions(read),oldPins=definitions.map(x=>x.original),newPins=definitions.map(x=>x.corrected);
  const preflight=pinsCheck(oldPins,'ACCOUNTING_ACCESS_PREREQUISITE_METADATA');
  const ownCheck=pinsCheck(newPins,'ACCOUNTING_ACCESS_FUNCTION_METADATA');
  const before=accountingPreparationSnapshot('before',oldPins.map(x=>x.signature)),after=accountingPreparationSnapshot('after',oldPins.map(x=>x.signature));
  const conservation="DO $conservation$ BEGIN IF current_setting('municontrol_sql154.before')::jsonb IS DISTINCT FROM current_setting('municontrol_sql154.after')::jsonb THEN RAISE EXCEPTION 'ACCOUNTING_ACCESS_PRIOR_STATE_CHANGED';END IF;END $conservation$";
  const proof=`SELECT jsonb_build_object('version','accounting-preparation-installation.v1','sourceCommit',${q(sourceCommit)},'migrationSha256',${q(hash(source))},'changedFunctions',15,'newTables',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('municontrol_sql154.after')::jsonb::text,'sha256'),'hex'),'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql154.before')::jsonb::text,'sha256'),'hex')) AS proof`;
  const durableProof=proof.replace(",'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql154.before')::jsonb::text,'sha256'),'hex')",'');
  const migration=splitPostgresStatements(source);assert.equal(migration.length,1);
  return{version:'accounting-preparation-installation.v1',sourceCommit,sourceHashes:{[file]:hash(source)},oldPins,newPins,preflight,ownCheck,before,after,conservation,proof,durableProof,migration,
    installation:[preflight,before,...migration,ownCheck,after,conservation,proof],durableVerification:[ownCheck,after,durableProof],connects:false,executesSql:false};
}
export function assertAccountingPreparationDurability({installed,durable,sourceCommit,migrationSha256}){
  for(const v of [installed,durable]){
    assert.equal(v.version,'accounting-preparation-installation.v1');assert.equal(v.sourceCommit,sourceCommit);assert.equal(v.migrationSha256,migrationSha256);
    for(const[k,n]of Object.entries({changedFunctions:15,newTables:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(v[k],n);
    assert.match(v.preservationSha256,/^[a-f0-9]{64}$/);
  }
  assert.equal(installed.beforeFingerprint,installed.preservationSha256);
  const{beforeFingerprint,...rest}=installed;assert.deepEqual(rest,durable);
  return{passed:true,priorStatePreserved:true,rolesPreserved:true,businessWrites:0};
}
