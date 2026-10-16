// Real185/186 fictional foundation plus187; pure source relocation, no DB calls.
import assert from 'node:assert/strict';
import {buildMixedContractAdoptionQa} from './mixed-contract-adoption-qa.mjs';
import {buildMunicipalOwnerCatalogInstallation} from './municipal-owner-catalog-installation.mjs';
import {ownerDecisionQaHash as hash,ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'OWNER_CATALOG_QA_BODY_REQUIRED');return m[2];};
export function buildOwnerCatalogQa({major,sourceCommit,read,schema,operationalPairBaseline='pre107'}){
 const foundation=buildMixedContractAdoptionQa({major,sourceCommit,read,...(schema?{schema}:{}),operationalPairBaseline}),batch=buildMunicipalOwnerCatalogInstallation({read,sourceCommit,operationalPairBaseline});
 const hashes={...foundation.hashes};for(const d of[...batch.newDefinitions,batch.adapted])hashes[hash(body(d))]=hash(body(foundation.normalized(d)));
 const normalized=sql=>{let value=foundation.normalized(sql).replace(/\bns\.nspname=('+)public\1/g,(_,quotes)=>'ns.nspname='+quotes+foundation.schema+quotes);for(const[from,to]of Object.entries(hashes))value=value.replaceAll(from,to);return value;};
 const local=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback','rollbackVerification'].map(k=>[k,batch[k].map(normalized)]));
 const catalogSource=splitPostgresStatements(read('scripts/migrations/103-native-employment-catalog.sql')),capability=catalogSource.find(s=>/^INSERT INTO public\.iam_capability\(/.test(s.trim()));assert.ok(capability,'OWNER_CATALOG_QA_CAPABILITY_SOURCE_REQUIRED');
 const runtimeGrant=catalogSource.filter(s=>/^GRANT EXECUTE ON FUNCTION public\.native_employment_catalog_bootstrap_v1\(/.test(s.trim()));assert.equal(runtimeGrant.length,1,'OWNER_CATALOG_QA_CANONICAL_RUNTIME_GRANT_REQUIRED');assert.deepEqual([...runtimeGrant[0].matchAll(/public\.(native_employment_catalog_[a-z]+_v1)\(/g)].map(m=>m[1]).sort(),['attempt','bootstrap','proposal','propose','review'].map(n=>'native_employment_catalog_'+n+'_v1').sort());
 const s=foundation.schema,i=foundation.ids;
 const operatorSeed=normalized(capability)+`;INSERT INTO ${s}.iam_role_capability(role_key,capability_key) SELECT role_key,'employee.catalog.propose' FROM ${s}.tenant_membership WHERE id=${q(i.membership)} ON CONFLICT DO NOTHING;
 INSERT INTO ${s}.iam_role_capability(role_key,capability_key) SELECT role_key,'employee.catalog.approve' FROM ${s}.tenant_membership WHERE id=${q(i.checkerMembership)} ON CONFLICT DO NOTHING;`;
 assert.ok(foundation.owner.rows.some(r=>r.contractId===i.contract&&r.active===false),'OWNER_CATALOG_QA_ADMINISTRATIVE_ACTOR_MUST_BE_INACTIVE');
 return{major,sourceCommit,operationalPairBaseline,schema:s,foundation,batch,hashes,normalized,local,seed:foundation.owner.seed+';\n'+operatorSeed+';\n'+normalized(runtimeGrant[0]),ids:i,actor:foundation.owner.actor,checker:foundation.owner.checker,
 sourceHashes:{...foundation.owner.sourceHashes,...batch.sourceHashes},fixture:{ownerEmploymentActive:false,authority:'actual_184',independentWriter:'same_shared_core',newRoles:0,newIdentities:0,sourceData:'complete_fictional_185_186_parents'},connects:false,executesSql:false};
}
export function ownerCatalogQaQuery(text,args,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const allowed={authority:['jsonb'],preview:['jsonb','uuid'],command:['jsonb','jsonb','uuid'],attempt:['jsonb','uuid']};
 const m=/^SELECT public\.municipal_owner_catalog_(authority|preview|command|attempt)_v1\(([^)]*)\) AS result$/.exec(text);assert.ok(m,'OWNER_CATALOG_QA_RPC_REQUIRED');assert.equal(m[2],allowed[m[1]].map((t,n)=>'$'+(n+1)+'::'+t).join(','));assert.equal(args.length,allowed[m[1]].length);assert.ok(args.every(a=>typeof a==='string'));
 return text.replaceAll('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>q(args[Number(n)-1]));
}
// The existing catalog UI uses only these two read RPCs in this verifier. The
// proposal is created separately through the unmodified canonical SQL writer.
export function ownerCatalogQaExistingRead(text,args,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const allowed=new Map([['SELECT public.native_employment_catalog_bootstrap_v1($1::jsonb) AS result',1],['SELECT public.native_employment_catalog_proposal_v1($1::jsonb,$2::uuid) AS result',2]]);
 assert.ok(allowed.has(text),'OWNER_CATALOG_QA_READ_RPC_REQUIRED');assert.equal(args.length,allowed.get(text));assert.ok(args.every(a=>typeof a==='string'));
 return text.replaceAll('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>q(args[Number(n)-1]));
}
export function ownerCatalogQaUnrelatedSnapshot(schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 return `DO $unrelated$ DECLARE t record;n bigint;h text;rows jsonb:='[]';BEGIN FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname=${q(schema)} AND c.relkind IN('r','p','m') AND c.relname NOT IN('native_employment_catalog_proposal','native_employment_catalog_review','municipal_owner_catalog_provenance') ORDER BY c.relname LOOP EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${q(schema)},t.relname) INTO n,h;rows:=rows||jsonb_build_array(jsonb_build_object('table',t.relname,'rows',n,'sha256',h));END LOOP;PERFORM set_config('municontrol_catalog_qa.unrelated',rows::text,true);END $unrelated$;SELECT jsonb_build_object('tables',jsonb_array_length(current_setting('municontrol_catalog_qa.unrelated')::jsonb),'sha256',encode(public.digest(current_setting('municontrol_catalog_qa.unrelated')::jsonb::text,'sha256'),'hex'))`;
}
export function assertOwnerCatalogQaPublication(catalog,receipt,items){
 assert.equal(catalog?.origin,'MUNICONTROL','OWNER_CATALOG_QA_OWN_PUBLICATION_REQUIRED');assert.equal(catalog.version,receipt.catalogVersion,'OWNER_CATALOG_QA_PUBLICATION_VERSION');assert.equal(catalog.revision,receipt.revision,'OWNER_CATALOG_QA_PUBLICATION_REVISION');assert.deepEqual(catalog.items,items,'OWNER_CATALOG_QA_PUBLICATION_ALL_ITEMS');assert.equal(catalog.items.length,receipt.total);assert.equal(typeof catalog.publishedAt,'string');assert.ok(Number.isFinite(Date.parse(catalog.publishedAt)));return{passed:true,origin:catalog.origin,version:catalog.version,revision:catalog.revision,total:catalog.items.length};
}
