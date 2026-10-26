// PRIVATE SOURCE CANDIDATE. Finite SQL admission for the ten native-family 195 facades
// on the SAME QA190 schema, delegating every other text to the existing own-payroll
// bridge untouched. Pure: no connection, no execution, no JSON re-normalization.
import assert from 'node:assert/strict';
import {ownFullCapacity190Rpc} from './own-payroll-full-capacity-190-rpc.mjs';

// Same quoting as the existing bridge (own-payroll-full-capacity-190-rpc.mjs:18): the
// only transformation ever applied to a value is doubling single quotes.
const q=v=>"'"+v.replaceAll("'","''")+"'";
const SCHEMA=/^mc_qa_fixed_092_[a-f0-9]{32}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const FAMILY195_STATES=Object.freeze(['all','submitted','correction_requested','accepted','rejected']);
// Per-function, per-position types exactly as lib/internal-native-family-requests.js:34-45
// emits them: bootstrap(ctx jsonb, state text, cursor jsonb-or-'null'), detail(ctx, id uuid),
// attempt(ctx, key uuid), command(ctx, body jsonb, key uuid, document jsonb-or-'null'),
// document(ctx, id uuid, requestVersion integer as a JS number).
const OPERATIONS=Object.freeze({
 bootstrap:Object.freeze({types:Object.freeze(['jsonb','state','jsonb_or_null']),command:false}),
 detail:Object.freeze({types:Object.freeze(['jsonb','uuid']),command:false}),
 attempt:Object.freeze({types:Object.freeze(['jsonb','uuid']),command:false}),
 command:Object.freeze({types:Object.freeze(['jsonb','jsonb','uuid','jsonb_or_null']),command:true}),
 document:Object.freeze({types:Object.freeze(['jsonb','uuid','integer']),command:false}),
});
const SQL_TYPE=Object.freeze({jsonb:'jsonb',jsonb_or_null:'jsonb',uuid:'uuid',state:'text',integer:'integer'});
// Exact statement text → {name,types,command}. Ten entries (2 views × 5 operations), 195:424-433.
export const NATIVE_FAMILY_195_STATEMENTS=new Map();
for(const view of ['self','review'])for(const [operation,{types,command}] of Object.entries(OPERATIONS)){
 const name='native_family_'+view+'_'+operation+'_v1';
 NATIVE_FAMILY_195_STATEMENTS.set('SELECT public.'+name+'('+types.map((t,n)=>'$'+(n+1)+'::'+SQL_TYPE[t]).join(',')+') AS result',Object.freeze({name,types,command}));
}
assert.equal(NATIVE_FAMILY_195_STATEMENTS.size,10);

const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function parsedJson(value,position){try{return JSON.parse(value);}catch{assert.fail('M7_190_RPC_JSON:'+position);}}
// One literal per position. JSON strings are inlined byte for byte (only quote doubling);
// the JSON text 'null' becomes the SQL literal 'null'::jsonb (a jsonb null), which is NOT
// SQL NULL; integers are inlined unquoted after range validation (lib:44: 1..1000).
function literal(type,value,position){
 if(type==='integer'){assert.ok(typeof value==='number'&&Number.isSafeInteger(value)&&value>=1&&value<=1000,'M7_190_RPC_INTEGER:'+position);return String(value);}
 assert.equal(typeof value,'string','M7_190_RPC_STRING:'+position);
 if(type==='uuid')assert.match(value,UUID,'M7_190_RPC_UUID:'+position);
 else if(type==='state')assert.ok(FAMILY195_STATES.includes(value),'M7_190_RPC_STATE:'+position);
 else if(type==='jsonb')assert.ok(isObject(parsedJson(value,position)),'M7_190_RPC_JSONB_OBJECT:'+position);
 else if(type==='jsonb_or_null'){const parsed=parsedJson(value,position);assert.ok(parsed===null?value==='null':isObject(parsed),'M7_190_RPC_JSONB_OBJECT_OR_NULL:'+position);}
 else assert.fail('M7_190_RPC_TYPE:'+type);
 return q(value);
}
// Returns {name,command,statement}. command:true marks the two *_command_v1 writers: the
// transport must run them as municontrol_actions_runtime_app in a READ COMMITTED
// transaction that commits (195:328; 102:388, 102:500 inside accept). The eight readers
// need a READ WRITE transaction too: every facade enters native_family_context_v1, which
// locks rows (195:118 → 007:40-91 FOR SHARE/NOWAIT; 195:130 → 113:18-20 FOR SHARE OF
// s,policy even with hold_lock=false), and PostgreSQL refuses SELECT … FOR SHARE in a
// read-only transaction (SQLSTATE 25006). `command` therefore selects isolation (RC
// mandatory for writers; readers may stay RC or use REPEATABLE READ) and the attempt
// counter; it is NEVER translated into readOnly:true. Whether readers end in COMMIT or
// ROLLBACK is decided by the concrete transport and recorded in its evidence.
export function nativeFamily195Rpc(text,values,schema){
 assert.match(schema,SCHEMA,'M7_190_RPC_SCHEMA');
 const entry=NATIVE_FAMILY_195_STATEMENTS.get(text);assert.ok(entry,'M7_190_RPC_NOT_ALLOWED');
 assert.ok(Array.isArray(values)&&values.length===entry.types.length&&Reflect.ownKeys(values).length===values.length+1,'M7_190_RPC_ARITY');
 const literals=entry.types.map((type,n)=>{assert.ok(Object.hasOwn(values,n),'M7_190_RPC_ARITY');return literal(type,values[n],n+1);});
 // Relocate the identifier BEFORE inlining opaque JSON; the callback form of replace never
 // rescans inserted text, so a "$n" inside a JSON value is never interpreted.
 const statement=text.replace('public.'+entry.name,schema+'.'+entry.name).replace(/\$(\d+)/g,(_,n)=>literals[Number(n)-1]);
 return Object.freeze({name:entry.name,command:entry.command,statement});
}
// Single entry point for the continuation: the ten 195 texts first; everything else goes
// to the existing own-payroll contract unchanged. `command:undefined` means "as today":
// the current call site (own-payroll-full-capacity-190-continuation.mjs:70-73, per the
// independent review) keeps deciding its own options; nothing of the payroll path changes.
export function canonical190Rpc(text,values,schema){
 if(NATIVE_FAMILY_195_STATEMENTS.has(text))return nativeFamily195Rpc(text,values,schema);
 return Object.freeze({name:null,command:undefined,statement:ownFullCapacity190Rpc(text,values,schema)});
}
