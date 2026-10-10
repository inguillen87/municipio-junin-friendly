import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PROFILE_ADDITIONS,PROFILE_POLICY_FILE,PROFILE_MIGRATION_FILE,readProfilePolicy,buildProfileCapabilityInstallation,assertProfileCapabilityDurability} from '../scripts/lib/own-payroll-profile-capabilities.mjs';
import {prepareProfileCapabilityInstallation} from '../scripts/prepare-own-payroll-profile-installation.mjs';
import {RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {OWN_LIQ_REVIEW} from '../lib/internal-own-payroll-liquidation.js';
import {IMPUTATION_READ} from '../assets/own-payroll-imputation-workspace-model.js';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);
test('cuatro perfiles permiten consultar contabilidad, calcular o revisar según su responsabilidad',()=>{
 const p=readProfilePolicy(read);assert.equal(PROFILE_ADDITIONS.length,15);
 for(const role of p.roles){const caps=new Set([...role.capabilities,...PROFILE_ADDITIONS.filter(a=>a.role===role.role_key).map(a=>a.capability)]);
  assert.ok(IMPUTATION_READ.every(c=>caps.has(c)),role.role_key+' consulta completa');
  assert.equal(RUN_CALCULATE.every(c=>caps.has(c)),role.role_key!=='HUGO_APROBADOR_INTEGRAL');
  assert.equal(OWN_LIQ_REVIEW.every(c=>caps.has(c)),role.role_key!=='NOMINA_GESTION_INTEGRAL');
 }
 assert.ok(!PROFILE_ADDITIONS.some(a=>a.capability==='payroll.calculation.close'||a.capability==='platform.admin'));
});
test('el lote sólo añade quince asociaciones; valida catálogo completo, conflicto e instalación parcial',()=>{
 const b=buildProfileCapabilityInstallation({read,sourceCommit});assert.equal(b.migration.length,1);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.match(b.preflight,/OWN_PROFILE_PARTIAL_STATE/);assert.match(b.preflight,/OWN_PROFILE_ROLE_BASELINE_CHANGED/);assert.match(b.preflight,/OWN_PROFILE_CAPABILITY_BASELINE_CHANGED/);assert.match(b.preflight,/OWN_PROFILE_NEW_CONFLICT/);
 assert.match(b.migration[0],/SHARE ROW EXCLUSIVE/);assert.match(b.migration[0],/OWN_PROFILE_ISOLATION_REQUIRED/);
 assert.ok(!/\b(?:CREATE|ALTER|DELETE|UPDATE|GRANT|REVOKE)\b/.test(b.migration[0]));
 assert.ok(!b.before.includes("proname LIKE 'native_leave_%'"));assert.ok(!b.before.includes("oid IS DISTINCT FROM to_regclass('public.native_leave_event')"));
 assert.match(b.before,/NOT EXISTS\(SELECT 1 FROM jsonb_array_elements/);assert.match(b.before,/to_regclass\('public.iam_role_capability'\)/);assert.match(b.before,/to_jsonb\(p\)::text/);
});
test('rechaza ampliar la matriz, una migración distinta o un catálogo con permisos ya agregados',()=>{
 for(const change of [p=>p.additions.push({role:'HUGO_APROBADOR_INTEGRAL',capability:'payroll.calculation.prepare'}),p=>p.roles[0].scope_kind='platform',p=>p.roles[0].capabilities.push('payroll.calculation.read'),p=>p.capabilities[0].sensitivity='standard']){
  const p=JSON.parse(read(PROFILE_POLICY_FILE));change(p);assert.throws(()=>buildProfileCapabilityInstallation({sourceCommit,read:f=>f===PROFILE_POLICY_FILE?JSON.stringify(p):read(f)}));
 }
 assert.throws(()=>buildProfileCapabilityInstallation({sourceCommit,read:f=>read(f)+(f===PROFILE_MIGRATION_FILE?'-- cambio\n':'')}),/UNREVIEWED_MIGRATION/);
});
test('destinos existentes fijados, copia primero, preflight y durabilidad de sólo lectura',()=>{
 const b=prepareProfileCapabilityInstallation({read,sourceCommit});assert.deepEqual(b.targets.map(t=>t.major),[18,17]);
 for(const t of b.targets){assert.equal(t.preflight[0],'SET TRANSACTION READ ONLY');assert.equal(t.durableVerification[0],'SET TRANSACTION READ ONLY');assert.match(t.installation.join('\n'),/neon.project_id/);assert.match(t.installation.join('\n'),/neon.branch_id/);assert.match(t.installation.join('\n'),/neon.endpoint_id/);assert.match(t.installation.join('\n'),/OWN_PROFILE_PRIOR_STATE_CHANGED/);}
});
test('el build conserva la migración revisada y el contrato de perfiles sin fuentes privadas',()=>{
 const lines=read('.vercelignore').split(/\r?\n/);assert.ok(lines.lastIndexOf('!'+PROFILE_MIGRATION_FILE)>lines.lastIndexOf('*.sql'));
 const p=JSON.parse(read(PROFILE_POLICY_FILE));assert.ok(!JSON.stringify(p).includes('created_at'));assert.ok(!/@|password|token|person_id|membership_id/.test(JSON.stringify(p)));assert.equal(p.newMembershipAssignments,0);
});
test('durabilidad conserva filas, asignaciones, denegaciones, funciones y el mismo lote',()=>{
 const b=buildProfileCapabilityInstallation({read,sourceCommit}),installed={version:b.version,sourceCommit,sourceHashes:b.sourceHashes,profileCount:4,mappingCount:15,newTables:0,changedFunctions:0,changedMembershipAssignments:0,businessWrites:0,nominalRowsReturned:0,preservationSha256:'b'.repeat(64),beforeFingerprint:'b'.repeat(64),mode:'first'}, {beforeFingerprint,mode,...durable}=installed;
 const verify=(i=installed,d=durable)=>assertProfileCapabilityDurability({installed:i,durable:d,sourceCommit,sourceHashes:b.sourceHashes});assert.equal(verify().passed,true);assert.equal(verify({...installed,mode:'repeat'}).passed,true);
 for(const change of [{mappingCount:16},{changedFunctions:1},{changedMembershipAssignments:1},{businessWrites:1},{preservationSha256:'c'.repeat(64)},{sourceCommit:'d'.repeat(40)},{sourceHashes:{}}])assert.throws(()=>verify(installed,{...durable,...change}));
});
