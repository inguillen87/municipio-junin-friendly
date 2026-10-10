import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAccountingPreparationInstallation,accountingPreparationDefinitions,assertAccountingPreparationDurability} from '../scripts/lib/accounting-preparation-access.mjs';
import {prepareAccountingPreparationInstallation} from '../scripts/prepare-accounting-preparation-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const sourceCommit='a'.repeat(40);
test('corrección afecta sólo quince consumidores contables y conserva comandos, ACL y revisión independiente',()=>{
  const b=buildAccountingPreparationInstallation({read,sourceCommit});
  assert.equal(b.migration.length,1);assert.equal(b.newPins.length,15);assert.equal(b.newPins.filter(x=>x.runtime).length,13);
  assert.equal(b.connects,false);assert.equal(b.executesSql,false);
  for(const{original,corrected}of accountingPreparationDefinitions(read)){
    assert.notEqual(original.sha256,corrected.sha256);assert.deepEqual({...original,sha256:null},{...corrected,sha256:null});
    assert.ok(/^own_(imputation|journal|reconciliation)_/.test(original.name));
  }
  assert.ok(!/\b(CREATE TABLE|INSERT INTO|GRANT|DELETE FROM|UPDATE public\.)\b/.test(b.migration[0]));
  assert.match(b.preflight,/ACCOUNTING_ACCESS_PREREQUISITE_METADATA/);
  assert.match(b.before,/to_jsonb\(p\)-'prosrc'/);
  assert.ok(!b.before.includes("proname LIKE 'native_leave_%'"));
  assert.ok(!b.before.includes("oid IS DISTINCT FROM to_regclass('public.native_leave_event')"));
});
test('no prepara instalación si cambia la migración o un cuerpo original',()=>{
  for(const[file,change]of [['scripts/migrations/154-accounting-preparation-access.sql',s=>s+'-- otro lote\n'],['scripts/migrations/152-own-payroll-journal.sql',s=>s.replace('ctx:=public.own_close_context_v1(p,true);','ctx:=public.own_close_context_v1(p,false);')]])
    assert.throws(()=>buildAccountingPreparationInstallation({sourceCommit,read:f=>f===file?change(read(f)):read(f)}));
});
test('preparación fija las dos bases existentes y conserva destino, sólo lectura y metadatos',()=>{
  const b=prepareAccountingPreparationInstallation({read,sourceCommit});
  assert.deepEqual(b.targets.map(t=>t.major),[17,18]);
  for(const t of b.targets){
    assert.equal(t.preflight[0],'SET TRANSACTION READ ONLY');assert.equal(t.durableVerification[0],'SET TRANSACTION READ ONLY');
    assert.match(t.installation.join('\n'),/neon.project_id/);assert.match(t.installation.join('\n'),/neon.branch_id/);assert.match(t.installation.join('\n'),/neon.endpoint_id/);
    assert.match(t.installation.join('\n'),/ACCOUNTING_ACCESS_PRIOR_STATE_CHANGED/);
  }
});
test('despliegue conserva los archivos SQL revisados necesarios para verificar la corrección',()=>{
  const ignore=read('.vercelignore').split(/\r?\n/);
  for(const file of ['148-own-payroll-imputation.sql','152-own-payroll-journal.sql','153-own-payroll-reconciliation.sql','154-accounting-preparation-access.sql']){
    const included=ignore.lastIndexOf('!scripts/migrations/'+file);
    assert.ok(included>ignore.indexOf('scripts/migrations/'),'La entrada de build necesita '+file);
  }
});
test('verificación durable exige mismo lote, conservación completa y cero cambios de roles o negocio',()=>{
  const b=buildAccountingPreparationInstallation({read,sourceCommit}),installed={version:b.version,sourceCommit,migrationSha256:Object.values(b.sourceHashes)[0],changedFunctions:15,newTables:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,preservationSha256:'b'.repeat(64),beforeFingerprint:'b'.repeat(64)}, {beforeFingerprint,...durable}=installed;
  const verify=(i=installed,d=durable)=>assertAccountingPreparationDurability({installed:i,durable:d,sourceCommit,migrationSha256:Object.values(b.sourceHashes)[0]});
  assert.equal(verify().passed,true);
  for(const change of [{changedFunctions:14},{roleAssignmentsAdded:1},{businessWrites:1},{preservationSha256:'c'.repeat(64)},{migrationSha256:'d'.repeat(64)},{sourceCommit:'e'.repeat(40)}])assert.throws(()=>verify(installed,{...durable,...change}));
});
