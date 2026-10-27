// Pure contracts for the same190 administrative216 browser continuation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const ADMIN216_BUSINESS_TABLES=Object.freeze(['native_employment_lifecycle_proposal','native_employment_lifecycle_review','annual_position_budget_event','own_position_assignment_event']);
export const ADMIN216_EXPECTED_DELTAS=Object.freeze({
 lifecycle:Object.freeze({native_employment_lifecycle_proposal:1,native_employment_lifecycle_review:1,annual_position_budget_event:0,own_position_assignment_event:0}),
 annualProposal:Object.freeze({native_employment_lifecycle_proposal:1,native_employment_lifecycle_review:1,annual_position_budget_event:1,own_position_assignment_event:0}),
 annualApproved:Object.freeze({native_employment_lifecycle_proposal:1,native_employment_lifecycle_review:1,annual_position_budget_event:2,own_position_assignment_event:0}),
 positionProposal:Object.freeze({native_employment_lifecycle_proposal:1,native_employment_lifecycle_review:1,annual_position_budget_event:2,own_position_assignment_event:1}),
 complete:Object.freeze({native_employment_lifecycle_proposal:1,native_employment_lifecycle_review:1,annual_position_budget_event:2,own_position_assignment_event:2})
});
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const admin216Quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export const admin216Hash=value=>createHash('sha256').update(value).digest('hex');
export function admin216NextSyntheticDefinition(previous,{negative=false}={}){
 assert.ok(previous?.source?.instrument?.includes('sintética'));assert.equal(typeof negative,'boolean');
 const reference=negative?'Revisión negativa sintética administrativa216':'Revisión sintética administrativa216';
 assert.notEqual(previous.source.reference,reference);
 const value=structuredClone(previous);value.source.reference=reference;
 assert.deepEqual(value.rows,previous.rows);assert.deepEqual({...value.source,reference:null},{...previous.source,reference:null});return value;
}
export function admin216WithoutBusinessRows(snapshot,schema){
 const value=structuredClone(snapshot);assert.ok(Array.isArray(value.tables));
 for(const table of ADMIN216_BUSINESS_TABLES){const matches=value.tables.filter(row=>row.schema===schema&&row.name===table);assert.equal(matches.length,1,'ADMIN216_BUSINESS_RELATION:'+table);delete matches[0].rows;delete matches[0].rowsSha256;}
 return value;
}
export function assertAdmin216BusinessDelta(before,after,schema,phase){
 assert.ok(Object.hasOwn(ADMIN216_EXPECTED_DELTAS,phase),'ADMIN216_UNKNOWN_PHASE');
 assert.deepEqual(admin216WithoutBusinessRows(after,schema),admin216WithoutBusinessRows(before,schema),'ADMIN216_OTHER_STATE_CHANGED');
 for(const[table,count]of Object.entries(ADMIN216_EXPECTED_DELTAS[phase])){
  const old=before.tables.find(row=>row.schema===schema&&row.name===table),next=after.tables.find(row=>row.schema===schema&&row.name===table);
  assert.equal(next.rows,old.rows+count,'ADMIN216_ROW_DELTA:'+phase+':'+table);
 }
}
export function assertAdmin216Prefix(before,after){
 assert.equal(before.length,4);assert.equal(after.length,4);
 for(const old of before){const next=after.find(row=>row.name===old.name);assert.ok(next);const counts=new Map(next.rows.map(row=>[row.sha256,row.count]));assert.equal(counts.size,next.rows.length);for(const row of old.rows)assert.ok((counts.get(row.sha256)??0)>=row.count,'ADMIN216_PRIOR_ROW_CHANGED:'+old.name);}
}
export function admin216ProbeMutation({schema,kind,actor,roleKey,contractId,expectedRow}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(['unlinked','capability','session'].includes(kind));
 assert.match(actor.membershipId,UUID);assert.match(actor.actorSessionId,UUID);assert.match(contractId,UUID);
 assert.equal(typeof roleKey,'string');assert.ok(roleKey.startsWith('QA_POSITIONS210_MAKER_'));
 const q=admin216Quote;let relation,where,mutation;
 if(kind==='capability'){
  relation='iam_role_capability';where=`role_key=${q(roleKey)} AND capability_key='workforce.structure.read'`;
  assert.equal(expectedRow.role_key,roleKey);assert.equal(expectedRow.capability_key,'workforce.structure.read');mutation=`DELETE FROM ${schema}.${relation} WHERE ${where}`;
 }else if(kind==='session'){
  relation='tenant_identity_session';where=`id=${q(actor.actorSessionId)}::uuid`;assert.equal(expectedRow.id,actor.actorSessionId);assert.equal(expectedRow.user_email,actor.actorEmail);assert.equal(expectedRow.revoked_at,null);
  mutation=`UPDATE ${schema}.${relation} SET revoked_at=clock_timestamp() WHERE ${where}`;
 }else{
  relation='tenant_action_employment_link';where=`membership_id=${q(actor.membershipId)}::uuid AND tenant_id=${q(actor.tenantId)}::uuid AND employment_contract_id=${q(contractId)}::uuid`;
  assert.equal(expectedRow.membership_id,actor.membershipId);assert.equal(expectedRow.employment_contract_id,contractId);assert.equal(expectedRow.active,true);assert.equal(expectedRow.revoked_at,null);
  mutation=`UPDATE ${schema}.${relation} SET active=false,revoked_at=clock_timestamp() WHERE ${where}`;
 }
 return `DO $admin216_probe$ DECLARE actual jsonb;changed integer;BEGIN
 SELECT to_jsonb(r) INTO actual FROM ${schema}.${relation} r WHERE ${where} FOR UPDATE;
 IF actual IS DISTINCT FROM ${q(JSON.stringify(expectedRow))}::jsonb THEN RAISE EXCEPTION 'ADMIN216_PROBE_PREIMAGE_CHANGED';END IF;
 ${mutation};GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'ADMIN216_PROBE_EXACT_ONE_ROW_REQUIRED';END IF;
 END $admin216_probe$`;
}

// Parameter binding for the unchanged internal-data handler's trusted SELECTs.
// Normalize identifiers BEFORE calling this: opaque values are never relocated.
// SQL strings, identifiers, comments and dollar strings cannot expand $n values.
export function bindAdmin216ReadParameters(sql,values=[]){
 assert.equal(typeof sql,'string');assert.ok(Array.isArray(values));assert.equal(Reflect.ownKeys(values).length,values.length+1);
 const literal=value=>{if(value===null)return'NULL';if(typeof value==='string')return admin216Quote(value);if(typeof value==='boolean')return String(value);assert.ok(typeof value==='number'&&Number.isFinite(value),'ADMIN216_READ_PARAMETER_TYPE');return String(value);};
 let out='',i=0,state=null,tag=null,depth=0,escapeString=false;const used=new Set();
 while(i<sql.length){const ch=sql[i],next=sql[i+1];
  if(state==='line'){out+=ch;i++;if(ch==='\n')state=null;continue;}
  if(state==='block'){out+=ch;i++;if(ch==='/'&&next==='*'){out+='*';i++;depth++;}else if(ch==='*'&&next==='/'){out+='/';i++;if(--depth===0)state=null;}continue;}
  if(state==='single'||state==='double'){out+=ch;i++;if(state==='single'&&escapeString&&ch==='\\'&&i<sql.length){out+=sql[i++];continue;}const quote=state==='single'?"'":'"';if(ch===quote){if(sql[i]===quote){out+=sql[i++];}else state=null;}continue;}
  if(state==='dollar'){if(sql.startsWith(tag,i)){out+=tag;i+=tag.length;state=null;}else out+=sql[i++];continue;}
  if(ch==='-'&&next==='-'){state='line';out+='--';i+=2;continue;}
  if(ch==='/'&&next==='*'){state='block';depth=1;out+='/*';i+=2;continue;}
  if(ch==="'"||ch==='"'){escapeString=ch==="'"&&/(?:^|[^A-Za-z0-9_$])[eE]$/.test(sql.slice(0,i));state=ch==="'"?'single':'double';out+=ch;i++;continue;}
  if(ch==='$'){
   const dollar=/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));if(dollar){tag=dollar[0];state='dollar';out+=tag;i+=tag.length;continue;}
   const parameter=/^\$([1-9][0-9]*)\b/.exec(sql.slice(i));if(parameter){const n=Number(parameter[1])-1;assert.ok(Object.hasOwn(values,n),'ADMIN216_READ_PARAMETER_MISSING');used.add(n);out+=literal(values[n]);i+=parameter[0].length;continue;}
  }
  out+=ch;i++;
 }
 assert.ok(state===null||state==='line','ADMIN216_READ_SQL_UNTERMINATED');assert.equal(used.size,values.length,'ADMIN216_READ_PARAMETER_UNUSED');return out;
}
