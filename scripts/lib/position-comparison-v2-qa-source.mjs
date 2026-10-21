// Source projection for the EXISTING disposable comparison fixture only.
// No157 tables, commands, policy publication or programme replacement.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const normalized=text=>{assert.equal(typeof text,'string');return text.replaceAll('\r\n','\n');};
export const comparisonV2LegacySourcePins=Object.freeze({
 participation:'06b5fdcce0c55e5b768d43af0491f1498728bf762febffe81cb6df9763d96548',
 comparison:'3fa22b703826e0835b873bd56b1c3fc249da6322db9ae295447c9cc8c2548e07'
});
const helpers=Object.freeze([
 Object.freeze({name:'own_participation_rule_key_v1',signature:'jsonb'}),
 Object.freeze({name:'own_participation_expression_v1',signature:'jsonb,jsonb'}),
 Object.freeze({name:'own_participation_rules_v1',signature:'jsonb'})
]);

// The exact157 source is read as text; only these three complete definitions
// are emitted, with their original bodies and private execution permissions.
export function comparisonV2LegacyClosure(participationSource,comparisonSource){
 const participation=normalized(participationSource),comparison=normalized(comparisonSource);
 assert.equal(hash(participation),comparisonV2LegacySourcePins.participation,'COMPARISON_LEGACY_157_SOURCE_CHANGED');
 assert.equal(hash(comparison),comparisonV2LegacySourcePins.comparison,'COMPARISON_LEGACY_198_SOURCE_CHANGED');
 const statements=splitPostgresStatements(participation),definitions=helpers.map(({name})=>{
  const matches=statements.filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));
  assert.equal(matches.length,1,'COMPARISON_LEGACY_HELPER_NOT_UNIQUE:'+name);
  assert.match(matches[0],/ IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS \$\$/);
  for(const call of matches[0].matchAll(/\bpublic\.([a-z0-9_]+)\(/g))assert.ok(helpers.some(h=>h.name===call[1]),'COMPARISON_LEGACY_UNCLOSED_HELPER:'+call[1]);
  return matches[0];
 });
 const revokes=helpers.map(({name,signature})=>'REVOKE ALL ON FUNCTION public.'+name+'('+signature+') FROM PUBLIC,municontrol_actions_runtime_app');
 const participationSql=[...definitions,...revokes].map(s=>s+';').join('\n');
 assert.equal(definitions.length,3);assert.ok(!/CREATE (?:TABLE|TRIGGER)|GRANT EXECUTE|own_participation_policy_v1\(/.test(participationSql));
 return Object.freeze({participationSql,comparisonSql:comparison,helpers:helpers.map(h=>h.name),sourceSha256:comparisonV2LegacySourcePins});
}
export function readComparisonV2LegacyClosure(){
 const read=name=>fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
 return comparisonV2LegacyClosure(read('157-own-period-participation.sql'),read('198-own-position-comparison-v2.sql'));
}

const schemaPattern=/^mc_qa_fixed_092_[a-f0-9]{32}$/;
const contextKeys=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'].sort();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const signatures=new Map([
 ['SELECT public.position_comparison_annual_v2($1::jsonb,$2::integer) AS result',['jsonb','integer']],
 ['SELECT public.position_comparison_detail_v2($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result',['jsonb','integer','integer','text','text']]
]);
export const comparisonV2LegacyRpcSignatures=()=>[...signatures.keys()];
// null leaves the existing V1 dispatcher intact. Arguments remain opaque text:
// never replace public. inside JSON or reserialize it to fit a different hash.
export function renderComparisonV2LegacyRpc(query,values,schema){
 const types=signatures.get(query);if(!types)return null;
 assert.match(schema,schemaPattern,'COMPARISON_LEGACY_SCHEMA_REQUIRED');
 assert.ok(Array.isArray(values)&&values.length===types.length,'COMPARISON_LEGACY_ARGUMENTS_REQUIRED');
 assert.equal(typeof values[0],'string','COMPARISON_LEGACY_CONTEXT_STRING_REQUIRED');
 const ctx=JSON.parse(values[0]);assert.ok(ctx&&typeof ctx==='object'&&!Array.isArray(ctx));
 assert.deepEqual(Object.keys(ctx).sort(),contextKeys,'COMPARISON_LEGACY_CONTEXT_FIELDS_CHANGED');
 assert.ok(typeof ctx.actorEmail==='string'&&ctx.actorEmail===ctx.actorEmail.trim().toLowerCase()&&ctx.actorEmail.endsWith('.invalid'),'COMPARISON_LEGACY_SYNTHETIC_ACTOR_REQUIRED');
 for(const key of ['actorSessionId','membershipId','tenantId'])assert.ok(typeof ctx[key]==='string'&&uuid.test(ctx[key]),'COMPARISON_LEGACY_CONTEXT_ID_REQUIRED');
 assert.ok(Number.isSafeInteger(ctx.actorSessionVersion)&&ctx.actorSessionVersion>=1,'COMPARISON_LEGACY_SESSION_REQUIRED');
 assert.ok(typeof ctx.releaseSha==='string'&&/^[a-f0-9]{40}$/.test(ctx.releaseSha),'COMPARISON_LEGACY_RELEASE_REQUIRED');
 assert.ok(Number.isInteger(values[1])&&values[1]>=1900&&values[1]<=2099,'COMPARISON_LEGACY_YEAR_REQUIRED');
 if(types.length===5){
  assert.ok(Number.isInteger(values[2])&&values[2]>=1&&values[2]<=1000,'COMPARISON_LEGACY_REVISION_REQUIRED');
  assert.ok(typeof values[3]==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(values[3])&&values[3].slice(0,4)===String(values[1]),'COMPARISON_LEGACY_PERIOD_REQUIRED');
  assert.ok(['monthly','first_fortnight','sac','vacation','supplementary','final','other'].includes(values[4]),'COMPARISON_LEGACY_TYPE_REQUIRED');
 }
 const name=query.slice('SELECT public.'.length,query.indexOf('('));
 return 'SET LOCAL standard_conforming_strings=on; DO $comparison_v2_strings$ BEGIN IF current_setting(\'standard_conforming_strings\') IS DISTINCT FROM \'on\' THEN RAISE EXCEPTION \'COMPARISON_LEGACY_STANDARD_STRINGS_REQUIRED\';END IF;END $comparison_v2_strings$; SELECT '+schema+'.'+name+'('+types.map((type,index)=>literal(values[index])+'::'+type).join(',')+') AS result';
}
