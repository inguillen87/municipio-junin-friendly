import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {canonicalRestorationExpression as canonical} from '../scripts/lib/grh-restoration-expression.mjs';
import {definitionMaterialSql,portableDefinitionMaterial,attestDefinitionRows,verifyDefinitionAttestation,portableDefinitionEquivalence} from '../scripts/lib/grh-restoration-definitions.mjs';
const original="(ARRAY['draft'::character varying, 'approved'::character varying, NULL::character varying])::text[]";
const restored="ARRAY[('draft'::character varying)::text, ('approved'::character varying)::text, (NULL::character varying)::text]";
test('the same literal-array cast is recognized without changing values, order or null',()=>{
 assert.equal(canonical(original).sql,canonical(restored).sql);assert.equal(canonical(original).sql,"ARRAY['draft'::text, 'approved'::text, NULL::text]");assert.equal(canonical(original).replacements,1);
});
for(const literal of ["''","'O''Brien'","'áñ日本'","'ARRAY[(x)] AND (y)'","'12'","'NULL'"])test('literal contents preserved '+literal,()=>{
 const a='(ARRAY['+literal+'::character varying])::text[]',b='ARRAY[('+literal+'::character varying)::text]';assert.equal(canonical(a).sql,canonical(b).sql);assert.ok(canonical(a).sql.includes(literal));
});
for(const value of ["(ARRAY['abc'::character varying(2)])::text[]","(ARRAY[col::character varying])::text[]","(ARRAY['abc'::character])::text[]","(ARRAY['abc'::custom_type])::text[]","(ARRAY['abc'::character varying])::integer[]","ARRAY[('abc'::character varying(2))::text]","(ARRAY['abc' COLLATE \"C\"::character varying])::text[]"])test('non-allowlisted conversion remains exact '+value,()=>assert.equal(canonical(value).sql,value));
for(const wrap of [s=>"'"+s.replaceAll("'","''")+"'",s=>'$$'+s+'$$',s=>'$body$'+s+'$body$',s=>'-- '+s,s=>'/* '+s+' */',s=>'"'+s+'"'])test('casts inside quoted text, identifiers or comments are untouched',()=>{
 const value=wrap(original);assert.equal(canonical(value).sql,value);assert.equal(canonical(value).replacements,0);
});
for(const op of ['AND','OR'])test('homogeneous '+op+' grouping is associative but never reorders operands',()=>{
 const a='((a) '+op+' ((b) '+op+' (c)))',b='(((a) '+op+' (b)) '+op+' (c))';assert.equal(canonical(a).sql,canonical(b).sql);assert.equal(canonical(a).sql,'((a) '+op+' (b) '+op+' (c))');assert.notEqual(canonical(a).sql,canonical('((c) '+op+' (b) '+op+' (a))').sql);
});
test('mixed boolean operators, BETWEEN, arithmetic and casts are not flattened as homogeneous logic',()=>{
 assert.notEqual(canonical('(((a) OR (b)) AND (c))').sql,canonical('((a) OR ((b) AND (c)))').sql);
 for(const sql of ['(x BETWEEN 1 AND 2)','((a) + (b))','((a) AND (b))::text','((a)::integer)','((a) AND /* review */ (b))']){
  const r=canonical(sql);if(sql!=='((a) AND (b))::text')assert.equal(r.sql,sql);else assert.ok(r.sql.endsWith('::text'));
 }
});
test('normalization is idempotent and preserves malformed or quoted text',()=>{
 const sql='CHECK (((x = ANY ('+original+')) AND ((a) AND (b))))',once=canonical(sql).sql;assert.equal(canonical(once).sql,once);
 for(const value of ['((a) AND (b)','((a) AND (b)))',"'unterminated ((a) AND (b))",'/* ((a) AND (b))','$$ ((a) AND (b))'])assert.equal(canonical(value).sql,value);
 assert.throws(()=>canonical(null));assert.throws(()=>canonical('x'.repeat(1024*1024+1)));assert.throws(()=>canonical('('.repeat(131)+'a'+')'.repeat(131)),/TOO_DEEP/);
});
test('nested nonboolean parentheses are processed once rather than recursively duplicated',()=>{const text='('.repeat(100)+'a'+')'.repeat(100);assert.equal(canonical(text).sql,text);});
const sha=v=>createHash('sha256').update(v).digest('hex');
function evidence(sql){const groups={tables:[],routines:[],views:[],indexes:[{schema:'public',name:'ix',definition_sha256:sha(sql),definition_source:sql}]};const image={imageSha256:'a'.repeat(64),...Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.map(({definition_source,...row})=>row)]))};return {image,groups,attestation:attestDefinitionRows(image,groups)};}
test('portable evidence remains anchored to the original captured raw definition',()=>{
 const a=evidence('CREATE INDEX ix ON t (v) WHERE x = ANY ('+original+')'),b=evidence('CREATE INDEX ix ON t (v) WHERE x = ANY ('+restored+')');
 verifyDefinitionAttestation(a.attestation,a.image);assert.equal(portableDefinitionEquivalence('indexes','public.ix',a.attestation,b.attestation),true);
 const changed=evidence('CREATE INDEX ix ON t (different) WHERE x = ANY ('+restored+')');assert.equal(portableDefinitionEquivalence('indexes','public.ix',a.attestation,changed.attestation),false);
 a.groups.indexes[0].definition_source+=' ';assert.throws(()=>attestDefinitionRows(a.image,a.groups),/CAPTURED_DEFINITION_CHANGED/);
});
test('scalar defaults, ACLs and constraints are included in the portable material',()=>{
 const a={owner:'one',columns:[{name:'v',default:original}],constraints:[{definition:'CHECK (((a) AND ((b) AND (c))))'}]};const b={...a,columns:[{name:'v',default:restored}],constraints:[{definition:'CHECK (((a) AND (b) AND (c)))'}]};
 assert.equal(portableDefinitionMaterial('tables',JSON.stringify(a)).comparisonSha256,portableDefinitionMaterial('tables',JSON.stringify(b)).comparisonSha256);
 b.owner='two';assert.notEqual(portableDefinitionMaterial('tables',JSON.stringify(a)).comparisonSha256,portableDefinitionMaterial('tables',JSON.stringify(b)).comparisonSha256);
});
