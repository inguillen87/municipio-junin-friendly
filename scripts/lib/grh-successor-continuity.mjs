// Revisión de continuidad del candidato sellado. Exclusivamente lectura; no autoriza promoción.
import {createHash} from 'node:crypto';
import {NATIVE_READ_DOMAINS} from './grh-successor-operational-read.mjs';
import {stableJson} from './canonical-import.mjs';
export const continuityHash=value=>createHash('sha256').update(stableJson(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const name=value=>typeof value==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(value);
export const CONTINUITY_TABLES_SQL=`SELECT c.relname AS name,c.relkind AS kind,
 array_agg(a.attname::text ORDER BY a.attnum) AS columns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind IN ('r','p','f') GROUP BY c.relname,c.relkind ORDER BY c.relname`;
export const CONTINUITY_FOREIGN_KEYS_SQL=`SELECT c.relname AS child,p.relname AS parent,f.conname AS name,
 n.nspname AS child_schema,np.nspname AS parent_schema,f.convalidated AS validated,
 ARRAY(SELECT a.attname::text FROM unnest(f.conkey) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=x.num ORDER BY x.ord) AS child_columns,
 ARRAY(SELECT a.attname::text FROM unnest(f.confkey) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=f.confrelid AND a.attnum=x.num ORDER BY x.ord) AS parent_columns
 FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_class p ON p.oid=f.confrelid JOIN pg_namespace np ON np.oid=p.relnamespace
 WHERE f.contype='f' AND (n.nspname='public' OR np.nspname='public') ORDER BY n.nspname,c.relname,f.conname`;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function planNativeContinuity(catalog){
 if(!Array.isArray(catalog?.tables)||!Array.isArray(catalog.foreignKeys)||catalog.tables.length>512||catalog.foreignKeys.length>2000)fail('SUCCESSOR_CONTINUITY_CATALOG');
 const tables=new Map();for(const t of catalog.tables){
  if(!name(t.name)||tables.has(t.name)||!Array.isArray(t.columns)||t.columns.some(c=>!name(c))||new Set(t.columns).size!==t.columns.length)fail('SUCCESSOR_CONTINUITY_CATALOG');tables.set(t.name,t);
 }
 const roots=new Map(NATIVE_READ_DOMAINS.map(([t,binding])=>[t,binding]));
 for(const [t,binding]of roots)if(!tables.get(t)?.columns.includes(binding)||!tables.get(t)?.columns.includes('tenant_id'))fail('SUCCESSOR_CONTINUITY_ROOT_MISSING');
 for(const f of catalog.foreignKeys){
  if(f.child_schema==='public'&&!tables.has(f.child))fail('SUCCESSOR_CONTINUITY_CATALOG');
  if(f.parent_schema==='public'&&!tables.has(f.parent))fail('SUCCESSOR_CONTINUITY_CATALOG');
  if(!Array.isArray(f.child_columns)||!Array.isArray(f.parent_columns)||new Set(f.child_columns).size!==f.child_columns.length||new Set(f.parent_columns).size!==f.parent_columns.length)fail('SUCCESSOR_CONTINUITY_CATALOG');
 }
 const selected=new Set(roots.keys()),fkKeys=new Set();
 for(const f of catalog.foreignKeys){
  if(![f.child,f.parent,f.name,f.child_schema,f.parent_schema].every(name)||!Array.isArray(f.child_columns)||!Array.isArray(f.parent_columns)||!f.child_columns.length||f.child_columns.length!==f.parent_columns.length||f.child_columns.length>16||[...f.child_columns,...f.parent_columns].some(c=>!name(c))||typeof f.validated!=='boolean')fail('SUCCESSOR_CONTINUITY_CATALOG');
  const k=f.child_schema+'.'+f.child+'.'+f.name;if(fkKeys.has(k))fail('SUCCESSOR_CONTINUITY_CATALOG');fkKeys.add(k);
 }
 for(let changed=true;changed;){changed=false;for(const f of catalog.foreignKeys){if(f.parent_schema==='public'&&selected.has(f.parent)){if(f.child_schema!=='public')fail('SUCCESSOR_CONTINUITY_EXTERNAL_DEPENDENCY');if(!selected.has(f.child)){selected.add(f.child);changed=true;}}}}
 if(selected.size>100)fail('SUCCESSOR_CONTINUITY_SCOPE_LIMIT');
 const links=catalog.foreignKeys.filter(f=>f.child_schema==='public'&&selected.has(f.child));
 for(const f of links){if(f.parent_schema!=='public'||!f.validated)fail('SUCCESSOR_CONTINUITY_UNVERIFIED_FOREIGN_KEY');
  if(f.child_columns.some(c=>!tables.get(f.child)?.columns.includes(c))||f.parent_columns.some(c=>!tables.get(f.parent)?.columns.includes(c)))fail('SUCCESSOR_CONTINUITY_CATALOG');}
 const scoped=[...selected].sort().map(n=>{const t=tables.get(n);if(t?.kind!=='r'||!t.columns.includes('tenant_id'))fail('SUCCESSOR_CONTINUITY_UNSUPPORTED_TABLE');
  const bindings=['source_binding_id','certified_binding_id'].filter(c=>t.columns.includes(c));if(bindings.length>1)fail('SUCCESSOR_CONTINUITY_AMBIGUOUS_BINDING');return {name:t.name,kind:t.kind,columns:[...t.columns],binding:bindings[0]??null};});
 for(const table of scoped){
  if(table.binding)continue;
  if(!['payroll_novelty_row','payroll_novelty_issue'].includes(table.name))fail('SUCCESSOR_CONTINUITY_UNSCOPED_TABLE');
  const inherited=links.some(f=>f.child===table.name&&f.parent==='payroll_novelty_batch'&&f.child_columns.length===2&&f.child_columns.every((c,i)=>(c==='batch_id'&&f.parent_columns[i]==='id')||(c==='tenant_id'&&f.parent_columns[i]==='tenant_id')));
  if(!inherited)fail('SUCCESSOR_CONTINUITY_PARENT_SCOPE_REQUIRED');
 }
 const plan={version:'grh-native-continuity-plan.v1',roots:[...roots.keys()].sort(),tables:scoped,links:links.toSorted((a,b)=>(a.child+'.'+a.name).localeCompare(b.child+'.'+b.name))};
 return freeze(structuredClone({...plan,planSha256:continuityHash(plan)}));
}
