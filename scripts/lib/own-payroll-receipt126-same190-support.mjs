// PRIVATE SOURCE CANDIDATE. Builds text only; no IO, constructor or SQL execution.
// Integrating/calling this module requires a separate closed-source/root decision.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const SOURCE23=Object.freeze([{"path":"scripts/lib/own-payroll-full-capacity-190-continuation.mjs","sha256":"995f1f701f4c96f5ca85f7f3e787b5939c0074ea8ab4066b8bdfcc19e6dd185b","bytes":46062},{"path":"scripts/lib/own-payroll-full-capacity-190-rpc.mjs","sha256":"2743c3f4a9069a119500839ceb18e97a931b2a1feee8a27c1c363eb595e21d4f","bytes":3957},{"path":"scripts/lib/own-payroll-full-capacity-190-installation.mjs","sha256":"f88d5a1979201c17572ae3c6932675dc991641cb736b9480895fd2ff761153eb","bytes":11610},{"path":"scripts/lib/own-payroll-report-census-190-iam-fixture.mjs","sha256":"c70429d6151bcd3dd94487a1643f196163e7e8be1e08bfc196f81fef9d8041b1","bytes":9508},{"path":"scripts/lib/own-annulment-preparation-209-actors-fixture.mjs","sha256":"c508f61f7a130585be36d4ff9298befb6d3897cce525f8315739a0dd63b65f9d","bytes":23392},{"path":"scripts/lib/own-monthly-day-engine-circuit-fixture.mjs","sha256":"0c989e0f9e69b6b2a41ca51fcf4c590b531c7bba7d2d36e4f4037c2991205e89","bytes":12739},{"path":"scripts/lib/own-payroll-receipt-installation.mjs","sha256":"0ac32b323abbe47661f1d2f29609829c05afd945e3b168be64ebc39ebf77dff6","bytes":9261},{"path":"scripts/lib/own-payroll-receipt126-same190-inventory.mjs","sha256":"ebd438ac7a791dec61a46223acece55b0b6d2599f901fb18f0a7406b4f2297cc","bytes":7020},{"path":"scripts/lib/own-payroll-receipt126-inventory-model.mjs","sha256":"3fb1ac17aea553ef37b5b832057482fdd3011c3bae26d9420a28675ece43232c","bytes":7906},{"path":"scripts/lib/municipal-owner-adoption-decision-qa.mjs","sha256":"3818ada20ee500085c8045e683b29c9bb55a4eaa03fc2137f7d817228f72136a","bytes":56906},{"path":"scripts/lib/salary-auxiliary-namespace-installation.mjs","sha256":"6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9","bytes":16071},{"path":"scripts/migrations/126-own-payroll-receipts.sql","sha256":"9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc","bytes":28950},{"path":"scripts/migrations/142-adopted-own-payroll-receipts.sql","sha256":"c92e086f7aa3c43e4662ead5ded70709092a03d9d6612bd81cdc7ba302deb294","bytes":19945},{"path":"scripts/migrations/201-own-full-payroll-decision-capacity.sql","sha256":"46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b","bytes":83125},{"path":"assets/own-payroll-run-workspace-model.js","sha256":"ed4636cfe779c7f4ba911514294c73e073180bb6b0b8274155f64f99a8620edb","bytes":10822},{"path":"assets/own-payroll-receipt-model.js","sha256":"991a76fc3912a0a92fcff88f686c0c4ebeaa4266ae7a65e84c58b6327d6e9eb3","bytes":21752},{"path":"assets/own-payroll-receipt-panel.js","sha256":"9d095af84e3f8771b0e9ee19f49988799c061bd85499d53400ed8a350474b06c","bytes":39777},{"path":"assets/own-payroll-receipt-pdf.js","sha256":"288175ecd065f0bacfa4c8e342aa0c45fbbf199a60a7b8c42e53f85b784b3622","bytes":8420},{"path":"lib/internal-own-payroll-receipts.js","sha256":"3dfabfd0f9c30a9441e5cd0eff235444976cb6c016f885d9789e43e5c8a54554","bytes":5269},{"path":"api/internal-own-payroll-receipts.js","sha256":"a63cebe4544288e9960e83c3e13630f75bff388a1f2b09d3038cf399c61d7558","bytes":5965},{"path":"lib/municipal-document-issuer.js","sha256":"39163725cf7a5e739e90a45b24466fe19e7893d6d0b1ce163dfb964b96d22019","bytes":3527},{"path":"scripts/lib/own-payroll-canonical190-browser-host-qa.mjs","sha256":"8216140ad4794caf733b44fe75d9f9bfedeabffd9331e8b569030dcd92277dd0","bytes":10962},{"path":"scripts/verify-own-payroll-annulment-v2-full-capacity.mjs","sha256":"ec522d09421692183bb1ce28d89d75c1ace1a31736882cf391480454dac0b2dc","bytes":65148}].map(pin=>Object.freeze(pin)));
const SQL126='scripts/migrations/126-own-payroll-receipts.sql';
const MODERN=Object.freeze(['own_receipt_params_v1','own_receipt_self_v1','own_receipt_snapshot_v1']);
const ADDED=Object.freeze(['own_receipt_attempt_v1','own_receipt_batch_v1','own_receipt_batch_value_v1','own_receipt_command_v1','own_receipt_context_v1','own_receipt_event_v1','own_receipt_immutable_v1','own_receipt_list_v1','own_receipt_preview_v1','own_receipt_source_version_v1','own_receipt_text_v1']);
const FACADES=Object.freeze(['own_receipt_preview_v1(jsonb,jsonb)','own_receipt_list_v1(jsonb,text)','own_receipt_batch_v1(jsonb,uuid)','own_receipt_attempt_v1(jsonb,uuid)','own_receipt_command_v1(jsonb,jsonb,uuid)','own_receipt_self_v1(jsonb)']);
const CAPABILITIES=Object.freeze([
 ['payroll.receipt.prepare','Preparar recibos propios','Conservar una copia completa de liquidaciones propias cerradas para revisión. No firma ni paga.','tenant','privileged'],
 ['payroll.receipt.approve','Revisar recibos propios','Aprobar o retirar la disponibilidad de recibos propios conservando sus copias y decisiones.','tenant','privileged'],
 ['payroll.receipt.self.read','Consultar mis recibos propios','Consultar exclusivamente recibos aprobados del contrato vinculado a la membresía.','tenant','standard'],
].map(row=>Object.freeze(row)));
const sha=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>value.replace(/\r\n?/g,'\n');
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const fnName=value=>/^CREATE(?: OR REPLACE)? FUNCTION (?:public|mc_qa_fixed_092_[a-f0-9]{32})\.(own_receipt_[a-z0-9_]+)\(/.exec(clean(value))?.[1];
function body(value){const found=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(value);assert.ok(found,'RECEIPT126_BODY_REQUIRED');return found[2];}
function definitionIdentity(value){const source=clean(value).replace(/;\s*$/,''),at=source.search(/\bAS\s+\$/);assert.ok(at>0);return source.slice(0,at).replace(/^CREATE(?: OR REPLACE)? FUNCTION /,'CREATE FUNCTION ').replace(/\s+/g,' ').trim()+' '+source.slice(at);}
function exactSource23(readRaw){
 assert.equal(typeof readRaw,'function');const sources={};
 for(const pin of SOURCE23){const raw=readRaw(pin.path);assert.ok(Buffer.isBuffer(raw),'RECEIPT126_RAW_BUFFER_REQUIRED:'+pin.path);assert.equal(raw.length,pin.bytes,'RECEIPT126_SOURCE_LENGTH:'+pin.path);assert.equal(sha(raw),pin.sha256,'RECEIPT126_SOURCE_RAW_SHA:'+pin.path);const text=raw.toString('utf8');assert.deepEqual(Buffer.from(text,'utf8'),raw,'RECEIPT126_SOURCE_UTF8:'+pin.path);sources[pin.path]=lf(text);}
 return sources;
}
function graphModernPin(graph,definition,functionPin){
 const actual=functionPin(definition),matches=graph.desired.filter(pin=>pin.signature===actual.signature);
 assert.ok(matches.length<=1,'RECEIPT126_MODERN_DESIRED_AMBIGUOUS:'+actual.signature);
 // EXACT precedence of ownerDecisionQaSeed. No observed pg_proc pin is accepted.
 const sourcePin=matches[0]??graph.pinHints.get(actual.signature+'|'+actual.sha256);
 if(!sourcePin||typeof sourcePin.runtime!=='boolean')throw Error('RECEIPT126_MODERN_ACL_SOURCE_PENDING:'+actual.signature);
 assert.deepEqual({...sourcePin,runtime:false},{...actual,runtime:false},'RECEIPT126_MODERN_SOURCE_METADATA_CHANGED:'+actual.signature);
 if(actual.name!=='own_receipt_self_v1')assert.equal(sourcePin.runtime,false,'RECEIPT126_PRIVATE_MODERN_WOULD_BE_PUBLIC:'+actual.name);
 return{...actual,runtime:sourcePin.runtime,aclProvenance:matches.length?'graph.desired':'graph.pinHints'};
}
function capabilitySupplement(statement){
 const found=/^INSERT INTO public\.iam_capability\(([^)]+)\) VALUES([\s\S]+)$/.exec(statement);assert.ok(found,'RECEIPT126_CANONICAL_CAPABILITY_INSERT');
 assert.equal(found[1],'capability_key,label,description,scope_kind,sensitivity');
 return `INSERT INTO public.iam_capability(${found[1]}) SELECT fixture.capability_key,fixture.label,fixture.description,fixture.scope_kind,fixture.sensitivity FROM (VALUES${found[2]}) fixture(${found[1]}) WHERE NOT EXISTS(SELECT 1 FROM public.iam_capability prior WHERE prior.capability_key=fixture.capability_key)`;
}
export function buildReceipt126Same190Support({readRaw,splitStatements,functionPin,pinsCheck,normalized,schema,foundationSeed,graph}){
 for(const dependency of[splitStatements,functionPin,pinsCheck,normalized])assert.equal(typeof dependency,'function','RECEIPT126_SOURCE_DEPENDENCY_REQUIRED');
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof foundationSeed,'string');
 assert.ok(graph&&Array.isArray(graph.definitions)&&Array.isArray(graph.desired)&&graph.pinHints instanceof Map,'RECEIPT126_SOURCE_GRAPH_REQUIRED');
 const sources=exactSource23(readRaw),canonical=splitStatements(sources[SQL126]).map(clean);
 const definitions=canonical.filter(statement=>fnName(statement));
 assert.deepEqual(definitions.map(fnName).sort(),[...MODERN,...ADDED].sort(),'RECEIPT126_EXACT_FOURTEEN_SOURCE_FUNCTIONS');
 const existing=splitStatements(foundationSeed).map(clean).filter(statement=>fnName(statement));
 assert.deepEqual(existing.map(fnName).sort(),[...MODERN],'RECEIPT126_EXACT_THREE_FOUNDATION_FUNCTIONS');
 assert.ok(!new RegExp('CREATE TABLE(?: IF NOT EXISTS)? '+schema+'\\.own_payroll_receipt_event\\b').test(foundationSeed),'RECEIPT126_TABLE_ALREADY_IN_FOUNDATION');
 const modern=MODERN.map(name=>{
  const candidates=graph.definitions.filter(definition=>fnName(definition)===name);assert.equal(candidates.length,1,'RECEIPT126_MODERN_SOURCE_SINGLE:'+name);
  const definition=candidates[0],pin=graphModernPin(graph,definition,functionPin),projected=normalized(definition),seedDefinition=existing.find(statement=>fnName(statement)===name);
  assert.equal(definitionIdentity(projected),definitionIdentity(seedDefinition),'RECEIPT126_MODERN_FOUNDATION_SOURCE_CHANGED:'+name);
  // The projected body hash is computed from desired source bytes, NEVER read DB.
  const{aclProvenance,...metadata}=pin;return{definition,projected,aclProvenance,before:{...metadata,sha256:sha(body(projected))},after:{...metadata,sha256:sha(body(projected)),runtime:name==='own_receipt_self_v1'}};
 });
 const selected=[],kinds=[],discarded=[];let grant=null,capabilities=null;
 for(const statement of canonical){
  const name=fnName(statement);
  if(name){if(ADDED.includes(name)){selected.push(statement);kinds.push('function');}else discarded.push({kind:'modern-definition-preserved',name});continue;}
  if(statement.startsWith('INSERT INTO public.iam_capability(')){assert.equal(capabilities,null,'RECEIPT126_CAPABILITY_INSERT_DUPLICATE');capabilities=statement;selected.push(capabilitySupplement(statement));kinds.push('missing-capabilities-only');continue;}
  if(/^CREATE TABLE public\.own_payroll_receipt_event\(/.test(statement)||/^ALTER TABLE public\.own_payroll_receipt_event ENABLE ROW LEVEL SECURITY$/.test(statement)||/^REVOKE ALL ON public\.own_payroll_receipt_event FROM PUBLIC,municontrol_actions_runtime_app$/.test(statement)||/^CREATE TRIGGER own_receipt_event_(?:immutable|no_truncate) /.test(statement)){selected.push(statement);kinds.push('table-security');continue;}
  if(statement.startsWith('DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc ')&&statement.includes("proname LIKE 'own_receipt_%'")&&statement.includes("REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app")){selected.push(statement);kinds.push('canonical-private-acl');continue;}
  if(statement.startsWith('GRANT EXECUTE ON FUNCTION ')){
   assert.equal(grant,null,'RECEIPT126_FACADE_GRANT_DUPLICATE');const match=/^GRANT EXECUTE ON FUNCTION ([\s\S]+) TO municontrol_actions_runtime_app$/.exec(statement);assert.ok(match,'RECEIPT126_FACADE_GRANT_SHAPE');assert.deepEqual([...match[1].matchAll(/public\.([a-z0-9_]+\([^)]*\))/g)].map(item=>item[1].replace(/\s+/g,'')),[...FACADES],'RECEIPT126_EXACT_SIX_FACADES');grant=statement;selected.push(statement);kinds.push('canonical-six-facade-acl');continue;
  }
  assert.ok(statement.startsWith('DO $$ BEGIN')&&statement.includes('OWN_RECEIPT_ALREADY_INSTALLED')&&statement.includes('OWN_RECEIPT_CAPABILITY_CONFLICT'),'RECEIPT126_UNEXPECTED_SOURCE_STATEMENT');
  discarded.push({kind:'incompatible-whole-product-install-preflight',sourceSha256:sha(statement)});
 }
 assert.equal(kinds.filter(kind=>kind==='function').length,11);assert.equal(kinds.filter(kind=>kind==='table-security').length,5);assert.equal(kinds.filter(kind=>kind==='missing-capabilities-only').length,1);assert.equal(kinds.filter(kind=>kind==='canonical-private-acl').length,1);assert.equal(kinds.filter(kind=>kind==='canonical-six-facade-acl').length,1);assert.ok(grant&&capabilities);
 const addedPins=selected.filter(statement=>fnName(statement)).map(definition=>{const pin=functionPin(definition);return{...pin,runtime:FACADES.some(signature=>signature.startsWith(pin.name+'('))};});
 const beforePins=modern.map(item=>item.before),afterPins=[...modern.map(item=>item.after),...addedPins.map(pin=>({...pin,sha256:sha(body(normalized(selected.find(statement=>fnName(statement)===pin.name))))}))];
 const table='public.own_payroll_receipt_event',modernNames=MODERN.map(q).join(','),capKeys=CAPABILITIES.map(row=>q(row[0])).join(',');
 const slot='municontrol_receipt126_same190.support';
 const preflight=`DO $receipt126_before$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'RECEIPT126_SUPPORT_TRANSACTION_REQUIRED';END IF;
 IF to_regclass('${table}') IS NOT NULL OR(SELECT array_agg(proname::text ORDER BY proname::text COLLATE "C") FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,12)='own_receipt_') IS DISTINCT FROM ARRAY[${modernNames}]::text[] THEN RAISE EXCEPTION 'RECEIPT126_SUPPORT_PRIOR_SET_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM public.iam_capability c WHERE c.capability_key IN(${capKeys}) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${q(JSON.stringify(CAPABILITIES))}::jsonb) canonical WHERE canonical.value=jsonb_build_array(c.capability_key,c.label,c.description,c.scope_kind,c.sensitivity))) THEN RAISE EXCEPTION 'RECEIPT126_PRIOR_CAPABILITY_NONCANONICAL';END IF;
 PERFORM set_config('${slot}.modern',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'nonAcl',to_jsonb(p)-'proacl') ORDER BY p.oid)::text FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN(${modernNames})),true);
 PERFORM set_config('${slot}.capabilities',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY capability_key),'[]'::jsonb)::text FROM public.iam_capability c),true);
 END $receipt126_before$`;
 const conservation=`DO $receipt126_after$ DECLARE old jsonb;current_value jsonb;row_value jsonb;canonical_caps jsonb:=${q(JSON.stringify(CAPABILITIES))}::jsonb;BEGIN
 SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'nonAcl',to_jsonb(p)-'proacl') ORDER BY p.oid) INTO current_value FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN(${modernNames});
 IF current_value IS DISTINCT FROM current_setting('${slot}.modern')::jsonb THEN RAISE EXCEPTION 'RECEIPT126_MODERN_OID_OR_METADATA_CHANGED';END IF;
 old:=current_setting('${slot}.capabilities')::jsonb;
 FOR row_value IN SELECT value FROM jsonb_array_elements(old) LOOP IF NOT EXISTS(SELECT 1 FROM public.iam_capability c WHERE to_jsonb(c)=row_value) THEN RAISE EXCEPTION 'RECEIPT126_PRIOR_CAPABILITY_CHANGED';END IF;END LOOP;
 FOR row_value IN SELECT to_jsonb(c) FROM public.iam_capability c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old) x WHERE x.value=to_jsonb(c)) LOOP
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(canonical_caps) x WHERE x.value=jsonb_build_array(row_value->>'capability_key',row_value->>'label',row_value->>'description',row_value->>'scope_kind',row_value->>'sensitivity')) THEN RAISE EXCEPTION 'RECEIPT126_UNDECLARED_CAPABILITY_ADDED';END IF;END LOOP;
 IF(SELECT count(*) FROM public.iam_capability WHERE capability_key IN(${capKeys}))<>3 OR(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,12)='own_receipt_')<>14 OR EXISTS(SELECT 1 FROM public.${table.split('.')[1]}) THEN RAISE EXCEPTION 'RECEIPT126_SUPPORT_FINAL_SET_CHANGED';END IF;
 END $receipt126_after$`;
 // No ACL mask: pinsCheck independently verifies the exact owner/runtime-only
 // ACL BEFORE and AFTER. Only self may have a declared false -> true delta.
 const beforeMetadata=normalized(pinsCheck(beforePins,'RECEIPT126_MODERN_BEFORE_CHANGED'));
 const afterMetadata=normalized(pinsCheck(afterPins,'RECEIPT126_ALL_AFTER_CHANGED'));
 const mutations=selected.map(normalized);
 assert.ok(mutations.every(statement=>!/^CREATE(?: OR REPLACE)? FUNCTION [^.]+\.own_receipt_(?:params|self|snapshot)_v1\(/.test(clean(statement))),'RECEIPT126_MODERN_REPLACEMENT_FORBIDDEN');
 return Object.freeze({version:'own-receipt126-same190-support-source.v1',schema,sourceParents:SOURCE23,sourceHashes:Object.fromEntries(SOURCE23.map(pin=>[pin.path,pin.sha256])),modernPinsFromSource:modern.map(({definition,projected,...item})=>item),selfAclDelta:{name:'own_receipt_self_v1',fromRuntime:modern.find(item=>item.before.name==='own_receipt_self_v1').before.runtime,toRuntime:true,onlyAllowedExistingAclChange:true},beforeMetadata,preflight:normalized(preflight),mutations,afterMetadata,conservation:normalized(conservation),statements:[beforeMetadata,normalized(preflight),...mutations,afterMetadata,normalized(conservation)],selection:kinds,discarded,expected:{beforeTables:0,afterTables:1,beforeFunctions:3,afterFunctions:14,newFunctions:11,tableSecurityStatements:5,facades:[...FACADES],canonicalCapabilities:CAPABILITIES,foreignKeys:5,referencedTableInternalTriggerDelta:'Only triggers belonging to these five NEW receipt FK constraints; caller must audit exact FK-derived delta without masking unrelated metadata'},closeDefinitionsReplaced:0,roleCapabilityWrites:0,actorWrites:0,connects:false,executesSql:false,installationAllowed:false,GLOBAL_SQL_STOP:true,limitations:['No caller wiring, installation, fixture construction, functional execution or SQL admission','Caller must provide whole prior-state conservation and exact new-table/FK/index/trigger shape audit plus transactional rollback; this source selection is not a complete installer','Unknown modern ACL source is a hard pending error, never inferred from observed catalog']});
}
