import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {buildOwnCloseSql} from '../scripts/lib/own-payroll-close-sql.mjs';
import {ownNoveltySuccessionFunctionPin,composeOwnNoveltySuccessionPins,composeOwnNoveltySuccessionObjectCounts,composeOwnNoveltySuccessionReadiness} from '../scripts/lib/own-novelty-succession-metadata.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const defs=file=>splitPostgresStatements(read(file)).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());
const find=(items,name)=>{const found=items.filter(d=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(d));assert.equal(found.length,1);return found[0];};
const pin=(d,runtime=false)=>({...ownInstallationFunctionPin(d),runtime});
function fixture(){
 const novelty=defs('scripts/migrations/130-own-bulk-novelties.sql'),operator=defs('scripts/migrations/176-own-payroll-administrative-operator.sql'),liquidation=defs('scripts/migrations/124-own-payroll-liquidation-decisions.sql'),close=buildOwnCloseSql(read).adapted;
 const beforePins=[pin(find(novelty,'own_novelty_command_v1'),true),pin(find(novelty,'own_novelty_conflict_v1')),pin(find(operator,'own_novelty_sources_v1')),pin(find(close,'own_liquidation_rows_v1')),pin(find(liquidation,'own_liquidation_state_v1')),pin(find(close,'own_liquidation_command_v1'),true)];
 const afterPins=beforePins.map((p,i)=>({...p,sha256:String(i+1).repeat(64)}));
 const newNames=['active','effective','affected_state','succession_validate','content_v3','capture_source_state','capture_current','succession_context'].map(s=>'own_novelty_'+(s==='content_v3'?s:s+'_v1'));
 const newPins=newNames.map(name=>pin('CREATE FUNCTION public.'+name+'(ctx jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $p$ SELECT ctx $p$;',name==='own_novelty_succession_context_v1'));
 return{definition:find(defs('scripts/migrations/194-own-monthly-day-engine-source.sql'),'municipal_adoption_ready_v1'),beforePins,afterPins,newPins,indexCheck:"DO $index_security$ BEGIN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INDEX_DRIFT';END $index_security$"};
}

test('actual194 readiness keeps all predecessor guards while extending130 metadata and its one index',()=>{
 const f=fixture(),r=composeOwnNoveltySuccessionReadiness(f);
 for(const pin of f.beforePins.slice(0,3))assert.ok(r.counts[pin.signature]>0);
 assert.equal(r.objectCounts.blocks,1);assert.equal(r.newHelpers,8);assert.equal(r.newRuntimeFacades,1);
 assert.ok(r.definition.includes("proname LIKE ''own_novelty_%'')<>24 THEN"));
 assert.ok(r.definition.includes('indisready AND indislive)<>5'));
 assert.ok(r.definition.includes('NOVELTY197_READINESS_HELPER_METADATA'));
 assert.ok(r.definition.includes('OWN_NOVELTY_SUCCESSION_INDEX_DRIFT'));
 assert.equal(r.connects,false);assert.equal(r.executesSql,false);
});

test('hash drift and changed execute-ACL metadata reject rather than normalizing predecessor evidence',()=>{
 const f=fixture();assert.throws(()=>composeOwnNoveltySuccessionPins(f.definition,f.beforePins,f.afterPins.map((p,i)=>i? p:{...p,runtime:false})),/EXISTING_METADATA_CHANGED/);
 const hash=f.beforePins[0].sha256;assert.throws(()=>composeOwnNoveltySuccessionReadiness({...f,definition:f.definition.replace(hash,'0'.repeat(64))}),/ANCESTOR_METADATA_CHANGED/);
});

test('a changed130 index count or relation guard cannot be silently accepted',()=>{
 const f=fixture();assert.throws(()=>composeOwnNoveltySuccessionReadiness({...f,definition:f.definition.replace('indisready AND indislive)<>4','indisready AND indislive)<>6')}),/PRIOR_INDEX_COUNT_CHANGED/);
 assert.throws(()=>composeOwnNoveltySuccessionObjectCounts("DO $objects$ DECLARE r oid:=to_regclass('public.another_table');BEGIN END $objects$"),/RELATION_GUARD_MISSING/);
});

test('extra runtime helper, missing index guard and altered function tail reject',()=>{
 const f=fixture();
 assert.throws(()=>composeOwnNoveltySuccessionReadiness({...f,newPins:f.newPins.map((p,i)=>i? p:{...p,runtime:true})}));
 assert.throws(()=>composeOwnNoveltySuccessionReadiness({...f,indexCheck:''}),/INDEX_GUARD_REQUIRED/);
 assert.throws(()=>composeOwnNoveltySuccessionReadiness({...f,definition:f.definition+'\n'}),/READINESS_TAIL_CHANGED/);
});

test('array-result metadata keeps uuid[] and the original body without changing scalar predecessor pins',()=>{
 const source="CREATE FUNCTION public.array_example(ctx jsonb, ids uuid[]) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $array$ SELECT ids $array$;";
 assert.throws(()=>ownInstallationFunctionPin(source),/Unsupported function header/);
 const p=ownNoveltySuccessionFunctionPin(source);assert.equal(p.resultType,'uuid[]');assert.equal(p.signature,'public.array_example(jsonb,uuid[])');assert.deepEqual(p.argNames,['ctx','ids']);assert.equal(p.sha256,createHash('sha256').update(' SELECT ids ').digest('hex'));assert.equal(p.volatility,'s');assert.equal(p.definer,true);assert.equal(p.runtime,false);
 const legacy=find(defs('scripts/migrations/130-own-bulk-novelties.sql'),'own_novelty_command_v1');assert.deepEqual(ownNoveltySuccessionFunctionPin(legacy),ownInstallationFunctionPin(legacy));
});
