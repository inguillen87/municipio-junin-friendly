import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createInternalAssistantHandler} from '../api/internal-assistant.js';
import {buildGrhCuratedConsumersQa} from '../scripts/verify-grh-curated-consumers-postgres.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('\r\n','\n');
const sha=s=>createHash('sha256').update(s).digest('hex');
const sql=read('scripts/migrations/099-grh-curated-consumers.sql');
const installed=JSON.parse(read('tests/fixtures/grh-curated-consumers-installed.json'));
const patches=[...sql.matchAll(/-- (\w+): exact installed[\s\S]*?IF current_hash='([a-f0-9]{64})'[\s\S]*?IF current_hash<>'([a-f0-9]{64})'[\s\S]*?changes:=\$changes\$([\s\S]*?)\$changes\$/g)].map(([,name,after,before,pairs])=>({name,after,before,pairs:JSON.parse(pairs)}));
for(const patch of patches)test('099 exact guarded body: '+patch.name,()=>{
 const fixture=installed.functions.find(f=>f.name===patch.name);assert.ok(fixture);let body=fixture.definition.match(/AS \$function\$([\s\S]*?)\$function\$/)[1];assert.equal(sha(body),patch.before);assert.equal(fixture.sha256,patch.before);
 for(const [old,next]of patch.pairs){assert.ok(body.includes(old));body=body.replaceAll(old,()=>next);}assert.equal(sha(body),patch.after);
 assert.doesNotMatch(body,/\b(?:FROM|JOIN) grh_(?:employees|family|catalog_rows)\b/);
});
test('099 preserves authority, exact source identity and immutable baselines',()=>{
 assert.equal(patches.length,18);assert.match(sql,/AND prosecdef IS FALSE/);assert.match(sql,/grh_curated_source_version_seal,public.grh_effective_source_binding\s+IN SHARE MODE NOWAIT/);assert.match(sql,/GRH_CURATED_CONSUMER_LOCK_DRIFT/);assert.doesNotMatch(sql,/GRANT |DROP |TRUNCATE |UPDATE public\./);
 const legacy=patches.find(p=>p.name==='school_certificate_register_v1');assert.deepEqual(legacy.pairs.filter(([old])=>old.includes('FOR SHARE')).map(([old])=>old),[' FOR SHARE OF k NOWAIT;',' FOR SHARE OF f NOWAIT;']);
 const importer=patches.find(p=>p.name==='school_certificate_source_import_v4');assert.match(importer.pairs.at(-1)[1],/WITH source_family AS MATERIALIZED/);assert.match(importer.pairs.at(-1)[1],/submitted AS MATERIALIZED/);assert.match(importer.pairs.at(-1)[1],/school_certificate_source_identity_v4\(to_jsonb\(f\)\)/);
 assert.equal(patches.some(p=>p.name==='school_certificate_source_identity_v4'||p.name==='school_certificate_records_v3'),false);
 const native=patches.find(p=>p.name==='native_employee_create_v1');assert.equal(native.pairs.some(([old])=>old.includes('IF FOUND')||old.includes('request_sha256')),false);assert.match(native.pairs.at(-1)[1],/read_lock_v1\(\);\s+catalogs:=/);
});
test('raw API and assistant SQL query selected source views without replacing canonical native identities',()=>{
 for(const file of ['api/internal-data.js','api/internal-assistant.js'])assert.doesNotMatch(read(file),/\b(?:FROM|JOIN) grh_(?:employees|absences|leaves|family|catalog_rows)\b/);
 const data=read('api/internal-data.js');assert.match(data,/LEFT JOIN grh_effective_employees_v1 employee[\s\S]{0,200}AND contract\.source_system = 'GRH'/);assert.match(data,/contract\.jurisdiction_code/);assert.match(data,/contract\.source_system\s*=\s*'MUNICONTROL'/);
});
function response(){return{statusCode:null,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};}
function assistant({rotate=false,revoke=false,denied=false}={}){
 const calls=[];let snapshots=0,load=0;const sql={query:async(query,params)=>{calls.push({query,params});if(!query.includes('effective-source:snapshot'))throw Error('Unexpected source query');snapshots++;if(revoke&&snapshots===2)return[];return[{token:(rotate&&snapshots===2?'b':'a').repeat(64)}];}};
 const handler=createInternalAssistantHandler({env:{FRIENDLY_GRH_SOURCE_DATABASE:'synthetic_grh',FRIENDLY_GRH_COMPANY_ID:'1'},logger:{info(){}},getInternalSql:async()=>sql,
 requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{tenant:{id:'10000000-0000-4000-8000-000000000001',effectiveCapabilities:denied?['assistant.use']:['assistant.use','workforce.summary.read']}}}),
 integrationQuality:async()=>{load++;return{status:'ready',source:{cutoff:'2026-09-10'},workforceControl:{administrative:{value:2},administrativePeople:2,liquidable:{value:1},difference:{value:1},stateBreakdown:{rows:[]}},identityEnrichment:{crosswalk:{total:2,matched:2,ambiguous:0,unmatched:0,coveragePct:100}}};},canonicalScope:async()=>{load++;return{totalContracts:2,totalPeople:2,asOf:'2026-09-10'};}});
 return{handler,calls,get load(){return load;}};
}
for(const [name,options,status,code]of [['stable',{},200,null],['publication changed',{rotate:true},503,'GRH_SOURCE_CHANGED'],['binding revoked',{revoke:true},503,'INTERNAL_ASSISTANT_DATA_UNAVAILABLE'],['capability denied',{denied:true},403,'IDENTITY_CAPABILITY_REQUIRED']])test('assistant publication coherence: '+name,async()=>{
 const f=assistant(options),res=response();await f.handler({method:'POST',headers:{'content-type':'application/json'},body:{intent:'workforce_summary',message:'Cantidad de personal',enhance:false}},res);assert.equal(res.statusCode,status);if(code)assert.equal(res.body.code,code);
 if(options.denied){assert.equal(f.calls.length,0);assert.equal(f.load,0);}else{assert.equal(f.calls.length,2);assert.equal(f.load,2);assert.equal(f.calls[0].params[0],'10000000-0000-4000-8000-000000000001');if(status!==200)assert.equal('data'in res.body,false);}
});
test('099 SQL QA generates real source/manual/native interaction on disposable PG17/18 only',()=>{
 for(const expectedMajor of [17,18]){const generated=buildGrhCuratedConsumersQa({expectedMajor});assert.match(generated,/current_database\(\)<>'curated_consumers_qa'/);assert.match(generated,/EMPTY_DISPOSABLE_DATABASE_REQUIRED/);assert.equal(generated.split(sql).length,3);assert.match(generated,/actual098Pointer/);assert.match(generated,/legacy v1 writer locks physical source/);assert.match(generated,/native55 creation remains available/);assert.match(generated,/same identity preserves manual null expiry/);assert.match(generated,/ROLLBACK;\s+SELECT to_regclass\('public.grh_curated_source_version'\) IS NULL AS rollback_tables_absent/);}
 assert.throws(()=>buildGrhCuratedConsumersQa({expectedMajor:16}),/Invalid QA target/);
});
