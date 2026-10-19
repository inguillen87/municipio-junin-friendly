// Pure, finite RPC renderer for the enclosing canonical190/193 native journey.
// It opens no connection, installs nothing and never grants authority.
import assert from 'node:assert/strict';

const schemaPattern=/^mc_qa_fixed_092_[a-f0-9]{32}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const period=/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/;
const types=Object.freeze(['monthly','first_fortnight','sac','vacation','supplementary','final','other']);
const contextKeys=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'].sort();
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const signatures=Object.freeze([
 Object.freeze({name:'annual_budget_bootstrap_v1',types:Object.freeze(['jsonb','integer']),kinds:Object.freeze(['context','year'])}),
 Object.freeze({name:'annual_budget_attempt_v1',types:Object.freeze(['jsonb','uuid']),kinds:Object.freeze(['context','uuid'])}),
 Object.freeze({name:'annual_budget_command_v1',types:Object.freeze(['jsonb','jsonb','uuid']),kinds:Object.freeze(['context','body','uuid'])}),
 Object.freeze({name:'position_assignment_bootstrap_v1',types:Object.freeze(['jsonb','uuid','integer']),kinds:Object.freeze(['context','uuid','year'])}),
 Object.freeze({name:'position_assignment_attempt_v1',types:Object.freeze(['jsonb','uuid']),kinds:Object.freeze(['context','uuid'])}),
 Object.freeze({name:'position_assignment_capture_v1',types:Object.freeze(['jsonb','uuid']),kinds:Object.freeze(['context','uuid'])}),
 Object.freeze({name:'position_assignment_command_v1',types:Object.freeze(['jsonb','jsonb','uuid']),kinds:Object.freeze(['context','body','uuid'])}),
 Object.freeze({name:'position_comparison_annual_v2',types:Object.freeze(['jsonb','integer']),kinds:Object.freeze(['context','year'])}),
 Object.freeze({name:'position_comparison_detail_v2',types:Object.freeze(['jsonb','integer','integer','text','text']),kinds:Object.freeze(['context','year','revision','period','type'])})
]);
const facades=new Map(signatures.map(value=>['SELECT public.'+value.name+'('+value.types.map((type,index)=>'$'+(index+1)+'::'+type).join(',')+') AS result',value]));

export const monthlyNativePositionRpcSignatures=()=>[...facades.keys()];

// null means this is not an M10 statement; the existing finite monthly/novelty
// renderer remains responsible. A recognized M10 statement with bad arguments
// always throws before the enclosing native db.run can be called.
export function monthlyNativePositionRpc(text,values,schema,expectedContext){
 const signature=facades.get(text);if(!signature)return null;
 assert.match(schema,schemaPattern,'JOINT_POSITION_SCHEMA_REQUIRED');
 assert.ok(Array.isArray(values)&&values.length===signature.types.length,'JOINT_POSITION_ARGUMENTS_REQUIRED');
 assert.ok(record(expectedContext)&&Object.keys(expectedContext).sort().join('|')===contextKeys.join('|'),'JOINT_POSITION_CONTEXT_REQUIRED');
 for(const [index,kind]of signature.kinds.entries()){
  const value=values[index];
  if(kind==='context'){
   assert.equal(typeof value,'string','JOINT_POSITION_CONTEXT_STRING_REQUIRED');const actual=JSON.parse(value);
   assert.ok(record(actual)&&Object.keys(actual).sort().join('|')===contextKeys.join('|'),'JOINT_POSITION_CONTEXT_FIELDS_CHANGED');
   assert.deepEqual(actual,expectedContext,'JOINT_POSITION_ACTOR_CONTEXT_CHANGED');
   assert.ok(typeof actual.actorEmail==='string'&&actual.actorEmail===actual.actorEmail.trim().toLowerCase()&&actual.actorEmail.endsWith('.invalid'),'JOINT_POSITION_SYNTHETIC_ACTOR_REQUIRED');
   for(const key of ['actorSessionId','membershipId','tenantId'])assert.match(actual[key],uuid,'JOINT_POSITION_CONTEXT_ID_REQUIRED');
   assert.ok(Number.isSafeInteger(actual.actorSessionVersion)&&actual.actorSessionVersion>=1,'JOINT_POSITION_SESSION_VERSION_REQUIRED');assert.match(actual.releaseSha,/^[a-f0-9]{40}$/,'JOINT_POSITION_RELEASE_REQUIRED');
  }else if(kind==='body'){
   assert.equal(typeof value,'string','JOINT_POSITION_BODY_STRING_REQUIRED');assert.ok(record(JSON.parse(value)),'JOINT_POSITION_BODY_OBJECT_REQUIRED');
  }else if(kind==='uuid')assert.ok(typeof value==='string'&&uuid.test(value),'JOINT_POSITION_UUID_REQUIRED');
  else if(kind==='year')assert.ok(Number.isInteger(value)&&value>=1900&&value<=2099,'JOINT_POSITION_YEAR_REQUIRED');
  else if(kind==='revision')assert.ok(Number.isInteger(value)&&value>=1&&value<=1000,'JOINT_POSITION_REVISION_REQUIRED');
  else if(kind==='period')assert.ok(typeof value==='string'&&period.test(value)&&value.slice(0,4)===String(values[1]),'JOINT_POSITION_PERIOD_REQUIRED');
  else if(kind==='type')assert.ok(typeof value==='string'&&types.includes(value),'JOINT_POSITION_TYPE_REQUIRED');
  else assert.fail('JOINT_POSITION_UNKNOWN_ARGUMENT_KIND');
 }
 return 'SELECT '+schema+'.'+signature.name+'('+signature.types.map((type,index)=>literal(values[index])+'::'+type).join(',')+') AS result';
}
