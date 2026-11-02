// Private QA-only diagnostic. Never executes SQL, reads a source body or logs stderr.
export const REGISTRY_DIAGNOSTIC_LIMITS=Object.freeze({chain:8,characters:65536,lines:256,lineCharacters:512,contexts:8});
const TOKENS=['EMPLOYMENT_ADOPTION_BUSY','NATIVE_EMPLOYMENT_CATALOG_BUSY','ACTION_SESSION_BUSY'];
const STATES=['P0001','55P03','40P01','40001'];
const signatures=Object.freeze({
 employment_adoption_propose_v1:['jsonb','jsonb','uuid'],
 native_employment_catalog_lock_v1:['jsonb'],
 grh_curated_source_read_lock_v1:[],
 native_employment_change_context_v1:['jsonb','text'],
 native_employment_lifecycle_adopted_context_v2:['jsonb','text'],
 native_employee_context_v1:['jsonb','boolean'],
 action_center_assert_tenant_read_session_v2:['text','uuid','integer','text','uuid','uuid'],
});
const ownData=(value,key)=>{
 try{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;}
 catch{return undefined;}
};
const object=value=>value!==null&&typeof value==='object';
function findStderr(error){
 const seen=new WeakSet();let cursor=error,depth=0;
 while(object(cursor)&&depth<REGISTRY_DIAGNOSTIC_LIMITS.chain){
  if(seen.has(cursor))return {reason:'cause_cycle',depth};seen.add(cursor);
  const stderr=ownData(cursor,'stderr');
  if(typeof stderr==='string')return {stderr,depth,reason:null};
  cursor=ownData(cursor,'cause');depth++;
 }
 return {reason:object(cursor)?'cause_depth_limit':'stderr_unavailable',depth};
}
const frozen=value=>Object.freeze({...value,contexts:Object.freeze(value.contexts.map(row=>Object.freeze(row)))});
export function registryBusyDiagnostic(error,schema){
 const result={version:'registry-qa-busy-diagnostic.v1',available:false,source:'error-chain.stderr',
  reason:'stderr_unavailable',errorToken:null,outerSqlstate:null,contexts:[],chainDepth:0,
  truncated:false,contextWithheld:false,innerSqlstate:null,holder:null,causalAttribution:'unresolved'};
 if(typeof schema!=='string'||!/^mc_qa_fixed_092_[a-f0-9]{32}$/.test(schema))
  return frozen({...result,reason:'invalid_qa_schema'});
 const found=findStderr(error);result.chainDepth=found.depth;
 if(found.reason)return frozen({...result,reason:found.reason});
 const limit=REGISTRY_DIAGNOSTIC_LIMITS;
 result.truncated=found.stderr.length>limit.characters;
 const raw=found.stderr.slice(0,limit.characters),allLines=raw.split(/\r?\n/);
 if(allLines.length>limit.lines)result.truncated=true;
 const lines=allLines.slice(0,limit.lines);
 if(lines.some(line=>line.length>limit.lineCharacters))result.truncated=true;
 // Suppress all context after a free-text SQL/DETAIL/HINT block. Such blocks can
 // contain arbitrary newlines that imitate a safe-looking PostgreSQL context.
 result.contextWithheld=result.truncated||lines.some(line=>/\b(?:DETAIL|HINT|QUERY):|SQL statement\s|^\s*STATEMENT:/i.test(line));
 let errorIndex=-1;
 for(let index=0;index<lines.length;index++){
  const line=lines[index];if(line.length>limit.lineCharacters)continue;
  const match=/^(?:psql:<stdin>:[1-9][0-9]{0,8}:\s*)?ERROR:\s+(?:([A-Z0-9]{5}):\s*)?([A-Z_]+)\s*$/.exec(line);
  if(!match)continue;
  if(!TOKENS.includes(match[2])||match[1]!==undefined&&!STATES.includes(match[1]))continue;
  result.errorToken=match[2];result.outerSqlstate=match[1]??null;errorIndex=index;break;
 }
 if(errorIndex===-1)return frozen({...result,reason:'error_not_allowlisted'});
 result.available=true;result.reason=null;
 if(!result.contextWithheld){
  const seen=new Set();
  for(const line of lines.slice(errorIndex+1)){
   if(line.length>limit.lineCharacters)continue;
   const match=/^(?:psql:<stdin>:[1-9][0-9]{0,8}:\s*)?CONTEXT:\s+PL\/pgSQL function (?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\(([^()]*)\) line ([1-9][0-9]{0,5}) at RAISE\s*$/.exec(line);
   if(!match||match[1]!==undefined&&match[1]!==schema||!Object.hasOwn(signatures,match[2]))continue;
   const args=match[3]===''?[]:match[3].split(',').map(value=>value.trim());
   if(args.length!==signatures[match[2]].length||args.some((value,index)=>value!==signatures[match[2]][index]))continue;
   const key=match[2]+':'+match[4];if(seen.has(key))continue;seen.add(key);
   if(result.contexts.length===limit.contexts){result.truncated=true;result.contextWithheld=true;result.contexts=[];break;}
   result.contexts.push({function:match[2],line:Number(match[4]),operation:'RAISE'});
  }
 }
 return frozen(result);
}
