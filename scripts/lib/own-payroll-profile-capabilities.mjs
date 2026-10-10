// Reviewable catalogue completion only. No connection or municipal operation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';

const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const lf=s=>s.replace(/\r\n?/g,'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
export const PROFILE_POLICY_FILE='contracts/own-payroll-profile-capabilities.v1.json';
export const PROFILE_MIGRATION_FILE='scripts/migrations/155-own-payroll-profile-capabilities.sql';
const prefix='municontrol_sql155.';
const calculation=['payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare','payroll.calculation.approve'];
export const PROFILE_ADDITIONS=Object.freeze([
 ...['PLATFORM_OWNER_OPERATIVO_INTEGRAL','MUNICIPIO_ADMIN_OPERATIVO'].flatMap(role=>calculation.map(capability=>Object.freeze({role,capability}))),
 ...calculation.slice(0,3).map(capability=>Object.freeze({role:'NOMINA_GESTION_INTEGRAL',capability})),
 ...[calculation[0],calculation[1],calculation[3],'payroll.novelty.export'].map(capability=>Object.freeze({role:'HUGO_APROBADOR_INTEGRAL',capability})),
]);
export function readProfilePolicy(read){
 const p=JSON.parse(read(PROFILE_POLICY_FILE));
 assert.equal(p.version,'own-payroll-profile-capabilities.v1');assert.deepEqual(p.additions,PROFILE_ADDITIONS);assert.equal(p.newMembershipAssignments,0);
 assert.deepEqual(p.roles.map(r=>r.role_key).sort(),[...new Set(PROFILE_ADDITIONS.map(x=>x.role))].sort());
 assert.deepEqual(p.capabilities.map(c=>c.capability_key).sort(),[...new Set(PROFILE_ADDITIONS.map(x=>x.capability))].sort());
 for(const r of p.roles){assert.equal(r.scope_kind,'tenant');assert.equal(r.system_managed,true);assert.equal(new Set(r.capabilities).size,r.capabilities.length);assert.deepEqual(r.capabilities,[...r.capabilities].sort());assert.ok(!PROFILE_ADDITIONS.some(a=>a.role===r.role_key&&r.capabilities.includes(a.capability)));}
 for(const c of p.capabilities){assert.equal(c.scope_kind,'tenant');assert.equal(c.sensitivity,c.capability_key==='payroll.calculation.read'?'standard':c.capability_key==='payroll.novelty.export'?'restricted':'privileged');}
 return p;
}
export function profileCapabilityChecks(policy,after=false){
 const roles=policy.roles.map(r=>({...r,capabilities:after?[...r.capabilities,...PROFILE_ADDITIONS.filter(x=>x.role===r.role_key).map(x=>x.capability)].sort():r.capabilities}));
 return `DO $profile_catalogue$ DECLARE x jsonb;actual jsonb; BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(roles))}::jsonb) LOOP
  SELECT jsonb_build_object('role_key',r.role_key,'label',r.label,'description',r.description,'scope_kind',r.scope_kind,'system_managed',r.system_managed,'capabilities',(SELECT jsonb_agg(rc.capability_key ORDER BY rc.capability_key COLLATE "C") FROM public.iam_role_capability rc WHERE rc.role_key=r.role_key)) INTO actual FROM public.iam_role r WHERE r.role_key=x->>'role_key';
  IF actual IS DISTINCT FROM x THEN RAISE EXCEPTION 'OWN_PROFILE_ROLE_BASELINE_CHANGED';END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(policy.capabilities))}::jsonb) LOOP
  SELECT to_jsonb(c)-'created_at' INTO actual FROM public.iam_capability c WHERE c.capability_key=x->>'capability_key';
  IF actual IS DISTINCT FROM x THEN RAISE EXCEPTION 'OWN_PROFILE_CAPABILITY_BASELINE_CHANGED';END IF;
 END LOOP;
 -- Only conflicts introduced by one of these exact additions are checked here.
 -- Existing reviewed operational pairs remain governed by their existing rules.
 IF EXISTS(SELECT 1 FROM public.iam_capability_conflict c
  JOIN jsonb_array_elements(${q(JSON.stringify(PROFILE_ADDITIONS))}::jsonb) a ON a->>'capability' IN(c.capability_key,c.conflicts_with_key)
  JOIN jsonb_array_elements(${q(JSON.stringify(policy.roles))}::jsonb) r ON r->>'role_key'=a->>'role'
  WHERE (c.capability_key IN(SELECT jsonb_array_elements_text(r->'capabilities')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(${q(JSON.stringify(PROFILE_ADDITIONS))}::jsonb) b WHERE b->>'role'=r->>'role_key' AND b->>'capability'=c.capability_key))
   AND (c.conflicts_with_key IN(SELECT jsonb_array_elements_text(r->'capabilities')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(${q(JSON.stringify(PROFILE_ADDITIONS))}::jsonb) b WHERE b->>'role'=r->>'role_key' AND b->>'capability'=c.conflicts_with_key))) THEN RAISE EXCEPTION 'OWN_PROFILE_NEW_CONFLICT';END IF;
END $profile_catalogue$`;
}
export function profileCapabilityState(policy){
 const before=profileCapabilityChecks(policy),after=profileCapabilityChecks(policy,true);
 return `DO $profile_state$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM jsonb_array_elements(${q(JSON.stringify(PROFILE_ADDITIONS))}::jsonb) a JOIN public.iam_role_capability rc ON rc.role_key=a->>'role' AND rc.capability_key=a->>'capability';
 IF n=0 THEN EXECUTE ${q(before)};PERFORM set_config('${prefix}mode','first',true);
 ELSIF n=15 THEN EXECUTE ${q(after)};PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'OWN_PROFILE_PARTIAL_STATE';END IF;
END $profile_state$`;
}
export function profileCapabilityMigration(read){
 const p=readProfilePolicy(read);
 return `-- Complete four existing payroll profiles with fifteen reviewed mappings.
-- No new users, memberships, overrides, capabilities, functions or business writes.
DO $profile_access$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWN_PROFILE_ISOLATION_REQUIRED';END IF;
 LOCK TABLE public.iam_role,public.iam_capability,public.iam_role_capability,public.iam_capability_conflict IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN('public.iam_role'::regclass,'public.iam_capability'::regclass,'public.iam_role_capability'::regclass,'public.iam_capability_conflict'::regclass) AND relowner<>current_user::regrole) THEN RAISE EXCEPTION 'OWN_PROFILE_OWNER_REQUIRED';END IF;
 EXECUTE ${q(profileCapabilityState(p))};
 IF current_setting('${prefix}mode')='first' THEN
  INSERT INTO public.iam_role_capability(role_key,capability_key) VALUES
  ${PROFILE_ADDITIONS.map(a=>'('+q(a.role)+','+q(a.capability)+')').join(',\n  ')};
 END IF;
 EXECUTE ${q(profileCapabilityChecks(p,true))};
END $profile_access$;
`;
}
export function profileCapabilitySnapshot(slot){
 const original=preservationSnapshot(slot);
 const statement=original.split('\n').find(s=>s.includes('EXECUTE format(')&&s.includes('to_jsonb(r)::text'));
 assert.ok(statement);assert.equal(original.split(statement).length,2);
 const filter=`NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${q(JSON.stringify(PROFILE_ADDITIONS))}::jsonb) a WHERE a->>'role'=r.role_key AND a->>'capability'=r.capability_key)`;
 const filtered=statement.replace('FROM %I.%I r) hashed',"FROM %I.%I r WHERE "+filter.replaceAll("'","''")+") hashed");
 assert.notEqual(filtered,statement);
 return original.replace(statement,` IF c.oid=to_regclass('public.iam_role_capability') THEN\n${filtered}\n ELSE\n${statement}\n END IF;`)
  .replaceAll("AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'')
  .replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'')
  .replaceAll('municontrol_sql111.',prefix);
}
export function buildProfileCapabilityInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);const policy=readProfilePolicy(read),source=lf(read(PROFILE_MIGRATION_FILE));
 assert.equal(source,profileCapabilityMigration(read),'OWN_PROFILE_UNREVIEWED_MIGRATION');
 const sourceHashes=Object.fromEntries([PROFILE_POLICY_FILE,PROFILE_MIGRATION_FILE,'scripts/lib/own-payroll-profile-capabilities.mjs','scripts/lib/native-leave-installation.mjs'].map(f=>[f,hash(lf(read(f)))]));
 const preflight=profileCapabilityState(policy),ownCheck=profileCapabilityChecks(policy,true),before=profileCapabilitySnapshot('before'),after=profileCapabilitySnapshot('after');
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OWN_PROFILE_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const base=`'version','own-payroll-profile-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'profileCount',4,'mappingCount',15,'newTables',0,'changedFunctions',0,'changedMembershipAssignments',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')`;
 const proof=`SELECT jsonb_build_object(${base},'beforeFingerprint',encode(public.digest(current_setting('${prefix}before')::jsonb::text,'sha256'),'hex'),'mode',current_setting('${prefix}mode')) AS proof`;
 const durableProof=`SELECT jsonb_build_object(${base}) AS proof`;
 const migration=splitPostgresStatements(source);assert.equal(migration.length,1);
 return{version:'own-payroll-profile-installation.v1',sourceCommit,sourceHashes,policy,preflight,ownCheck,before,after,conservation,proof,durableProof,migration,
 installation:[preflight,before,...migration,ownCheck,after,conservation,proof],durableVerification:[ownCheck,after,durableProof],connects:false,executesSql:false};
}
export function assertProfileCapabilityDurability({installed,durable,sourceCommit,sourceHashes}){
 for(const p of [installed,durable]){
  assert.equal(p.version,'own-payroll-profile-installation.v1');assert.equal(p.sourceCommit,sourceCommit);assert.deepEqual(p.sourceHashes,sourceHashes);
  for(const[k,n]of Object.entries({profileCount:4,mappingCount:15,newTables:0,changedFunctions:0,changedMembershipAssignments:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],n);
  assert.match(p.preservationSha256,/^[a-f0-9]{64}$/);
 }
 assert.ok(['first','repeat'].includes(installed.mode));assert.equal(installed.beforeFingerprint,installed.preservationSha256);
 const{beforeFingerprint,mode,...rest}=installed;assert.deepEqual(rest,durable);
 return{passed:true,priorStatePreserved:true,denialsPreserved:true,memberAssignmentsChanged:0,businessWrites:0};
}
