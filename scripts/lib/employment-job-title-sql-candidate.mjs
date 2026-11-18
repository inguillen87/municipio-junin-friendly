// Pure, byte-pinned derivation of a source proposal. This module never connects,
// executes SQL, changes originals, or synthesizes an installed-state attestation.
import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const need=(condition,message)=>{if(!condition)throw Error(message);};
export const JOB_TITLE_SQL_BASE='c9f3396940e44b7e96f81ad1b4624c65de34336a';
export const JOB_TITLE_SQL_INPUTS=Object.freeze({
 contract:{path:'assets/employment-job-title-contract.js',sha256:'d44e3297d85b9a921830fdbf80cd93a90c0df8a2e9c99f17aa8dd725f5568eec'},
 registration067:{path:'scripts/migrations/067-native-employee-registration.sql',sha256:'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749'},
 registration095:{path:'scripts/migrations/095-native-employee-jurisdiction.sql',sha256:'48aecdd294bf11ec7f2a956b30eb455f2acc5be7d8825669249fed8ada7d90b5'},
 consumers099:{path:'scripts/migrations/099-grh-curated-consumers.sql',sha256:'208ae997983d506d2761c6db6eaf272f367dec1483a9b4cd4d2140d972d1a95d'},
 catalog103:{path:'scripts/migrations/103-native-employment-catalog.sql',sha256:'759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6'},
 changes104:{path:'scripts/migrations/104-native-employment-changes.sql',sha256:'0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a'},
 lifecycle110:{path:'scripts/migrations/110-native-employment-lifecycle.sql',sha256:'e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219'},
 adoption133:{path:'scripts/migrations/133-employment-adoption-application.sql',sha256:'36230ca788dc8afc3312c9bbb25ecf45029bf84a1a2373669a48245cca798ea9'},
 classification167:{path:'scripts/migrations/167-classification-registration-use.sql',sha256:'8eef9142231b660bdac357312cc1c9ee29ab79a65e04422c5bd5bfab77189c38'},
 void224:{path:'scripts/migrations/224-native-employment-void.sql',sha256:'ad708d03348188a09d26ebb22980133e6be96cc5ef9cc3e156f90601362ce384'},
});

export const JOB_TITLE_SQL_ORIGINALS=Object.freeze({
 registration067Body:'43c323e6e5e4b7495cf2178a0bb8ae82c0db54ea348efa69124b6ebb0d80cea1',
 registration095Body:'3ac060547845052e8466262025400bebd7267f680c41c962627dc45d384f4632',
 registration095Definition:'f45660c7408c698d426b8609b280f8295680a2d4988d5a28d6710ae406f7248c',
 registration095Header:'19c8f7a90f2e58111cfd49e0dc632ec7f368f708c2402cd59d3ade8027d170f8',
 registration099Body:'d9605cd9a60364798856e78a91be946f441232244c073bf19d1bacbbc8444744',
 registration103Body:'8fac07fa37367cd2c4a2aa25dccb7b145fc4eafe934c6cd86e12f5081dec7261',
 registration167Body:'6cf784e1b026c158548692c84c000592919a26f6aa42109807c0687f943158d6',
 proposal104Body:'e9713e6bbbef41b51c59441a0e114eeb8b0b520a5a6cc3b9701f34c8ba08a8f4',
 review104Body:'3dfb86e3eedd801acb02588d7c6b7c3f9eb39211cafe26fe585a549df1784c64',
 values104Body:'705c367398b8d9a8ccb4be797226c739c8c713932349f43f6470a81305d83b57',
 display104Body:'cf9cb09aad9abe31261c07589b27e6f148c53cdb86d190f53283c82f990143af',
 after104Body:'5294a12071cd8d16ad9ff623be787ef510719b6dfb44c047e0ee0d59f43228ea',
 proposal224Body:'9af561b138bcad9a511ced80d8b2dfc24ab0df59a6fa8db9419ecbcd433c5b9e',
 proposal224Definition:'ecf89ebd8a7659c5a7241cd8a73bc00f1da425154ee5158b83ef9502715e58b3',
 review224Body:'d0acb96d0e19dfc67f2cd7e6ce8d494bc73b1b273c1101d34e9df11a4fc61d44',
 review224Definition:'fb1a6bc71193e9aca06b7fe7192e4b736115366725aed9270632566bebaa17f7',
});

function definition(source,name){
 const starts=[...source.matchAll(new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\(','gm'))];
 need(starts.length===1,'Exactly one original definition required: '+name);
 const start=starts[0].index,tail=source.slice(start),opener=/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/.exec(tail);
 need(opener,'Dollar-quoted original body required: '+name);
 const bodyStart=start+opener.index+opener[0].length,tag=opener[1],end=source.indexOf(tag+';',bodyStart);
 need(end>=bodyStart,'Complete original definition required: '+name);
 const body=source.slice(bodyStart,end),header=source.slice(start,bodyStart),sql=source.slice(start,end+tag.length+1);
 return {name,body,header,tag,sql,bodySha256:digest(body),definitionSha256:digest(sql),headerSha256:digest(header)};
}
function once(source,before,after){
 need(source.split(before).length===2,'Exactly one reviewed insertion anchor required.');
 return source.replace(before,after);
}
function original(source,name,bodyPin,definitionPin){
 const found=definition(source,name);
 need(found.bodySha256===bodyPin,'Original body pin mismatch: '+name);
 if(definitionPin)need(found.definitionSha256===definitionPin,'Original definition pin mismatch: '+name);
 return found;
}

function registration167(source,header095){
 const matches=[...source.matchAll(/WHEN 'native_employee_create_v1' THEN after_body:=(\$[A-Za-z_][A-Za-z0-9_]*\$)/g)];
 need(matches.length===1,'Exactly one original 167 registration body literal required.');
 const start=matches[0].index+matches[0][0].length,tag=matches[0][1],end=source.indexOf(tag+';',start);
 need(end>=start,'Complete original 167 registration body required.');
 const body=source.slice(start,end);
 need(digest(body)===JOB_TITLE_SQL_ORIGINALS.registration167Body,'Original 167 registration body pin mismatch.');
 const literals=[...source.matchAll(/FOR x IN SELECT value FROM jsonb_array_elements\('([^']+)'::jsonb\) LOOP/g)];
 need(literals.length===1,'Exact 167 metadata literal required.');
 const entries=JSON.parse(literals[0][1]).filter(row=>row.name==='native_employee_create_v1');
 need(entries.length===1,'Exactly one 167 registration metadata entry required.');
 const metadata={name:'native_employee_create_v1',signature:'public.native_employee_create_v1(jsonb,jsonb,text,uuid)',
  sha256:JOB_TITLE_SQL_ORIGINALS.registration103Body,argNames:['p','d','catalog_version','k'],defaults:'',resultType:'jsonb',
  language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=public, pg_temp'],runtime:true,
  after:JOB_TITLE_SQL_ORIGINALS.registration167Body};
 need(JSON.stringify(entries[0])===JSON.stringify(metadata),'Original 167 registration metadata changed.');
 need(header095.headerSha256===JOB_TITLE_SQL_ORIGINALS.registration095Header,'Original 095 header pin mismatch.');
 need(!body.includes(header095.tag),'Original 167 body conflicts with the reviewed 095 header delimiter.');
 // 167 preserves the installed header through pg_get_functiondef. It contains
 // only an exact body literal and metadata, not a complete CREATE definition.
 // The source proposal combines that body with the exact 095 header; do not
 // describe the combination as a recovered/observed historical definition.
 return {name:metadata.name,body,bodySha256:digest(body),header:header095.header,tag:header095.tag,
  headerSha256:header095.headerSha256,definitionSha256:null,metadata};
}

function titleBlock({id,expression,error,allowNull=false,allowEmpty=false,indent=' '}){
 const lines=[
  '-- BEGIN employment-job-title-contract.v1: '+id,
  'DECLARE job_title_json jsonb:='+expression+';',
  ' job_title_value text;job_title_points integer;job_title_units bigint;job_title_forbidden boolean;job_title_edge_space boolean;',
  'BEGIN',
 ];
 if(allowNull)lines.push(" IF job_title_json IS DISTINCT FROM 'null'::jsonb THEN");
 const pad=allowNull?'  ':' ';
 lines.push(
  pad+"IF jsonb_typeof(job_title_json) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION '"+error+"';END IF;",
  pad+"job_title_value:=job_title_json#>>'{}';job_title_points:=char_length(job_title_value);",
  pad+'IF job_title_points NOT BETWEEN '+(allowEmpty?0:1)+" AND 120 THEN RAISE EXCEPTION '"+error+"';END IF;",
  pad+'IF job_title_points>0 THEN',
  pad+' SELECT coalesce(sum(CASE WHEN cp>65535 THEN 2 ELSE 1 END),0),',
  pad+'  coalesce(bool_or(cp BETWEEN 0 AND 31 OR cp BETWEEN 127 AND 159 OR cp IN(60,62)',
  pad+'   OR cp BETWEEN 8234 AND 8238 OR cp BETWEEN 8294 AND 8297 OR cp BETWEEN 55296 AND 57343),false),',
  pad+'  coalesce(bool_or((ordinal_value=1 OR ordinal_value=job_title_points) AND',
  pad+'   (cp IN(9,10,11,12,13,32,160,5760,8232,8233,8239,8287,12288,65279) OR cp BETWEEN 8192 AND 8202)),false)',
  pad+' INTO job_title_units,job_title_forbidden,job_title_edge_space',
  pad+' FROM(SELECT i AS ordinal_value,ascii(substr(job_title_value,i,1)) AS cp',
  pad+'  FROM generate_series(1,job_title_points) i) characters;',
  pad+' IF job_title_units NOT BETWEEN 1 AND 120 OR job_title_forbidden OR job_title_edge_space',
  pad+'  OR normalize(job_title_value,NFC) IS DISTINCT FROM job_title_value',
  pad+" THEN RAISE EXCEPTION '"+error+"';END IF;",
  pad+'END IF;',
 );
 if(allowNull)lines.push(' END IF;');
 lines.push('END;','-- END employment-job-title-contract.v1: '+id);
 return lines.map(line=>indent+line).join('\n')+'\n';
}

function derived(reference,{signature,sourceKey,headerSourceKey,anchor,guard,point}){
 const body=once(reference.body,anchor,guard+anchor),sql=reference.header+body+reference.tag+';';
 return {name:reference.name,signature,kind:'derived_existing_body',source:JOB_TITLE_SQL_INPUTS[sourceKey].path,
  beforeBodySha256:reference.bodySha256,beforeDefinitionSha256:reference.definitionSha256,
  headerSource:JOB_TITLE_SQL_INPUTS[headerSourceKey??sourceKey].path,headerSha256:reference.headerSha256,
  historicalCompleteDefinitionAvailable:reference.definitionSha256!==null,
  bodySha256:digest(body),definitionSha256:digest(sql),insertedBlockSha256:digest(guard),insertionPoint:point,body,sql};
}

export function buildEmploymentJobTitleSqlCandidate(input){
 need(input&&typeof input==='object','Pinned source texts required.');
 need(JSON.stringify(Object.keys(input).sort())===JSON.stringify(Object.keys(JOB_TITLE_SQL_INPUTS).sort()),'Exactly the reviewed source inputs are required.');
 for(const [key,{sha256}]of Object.entries(JOB_TITLE_SQL_INPUTS)){
  need(typeof input[key]==='string'&&digest(input[key])===sha256,'Original source file pin mismatch: '+key);
 }
 const pins=JOB_TITLE_SQL_ORIGINALS;
 const old067=original(input.registration067,'native_employee_create_v1',pins.registration067Body);
 const old095=original(input.registration095,'native_employee_create_v1',pins.registration095Body,pins.registration095Definition);
 const create=registration167(input.classification167,old095);
 const oldPropose=original(input.changes104,'native_employment_change_propose_v1',pins.proposal104Body);
 const oldReview=original(input.changes104,'native_employment_change_review_v1',pins.review104Body);
 const propose=original(input.void224,'native_employment_change_propose_v1',pins.proposal224Body,pins.proposal224Definition);
 const review=original(input.void224,'native_employment_change_review_v1',pins.review224Body,pins.review224Definition);
 const untouchedHelpers=[['values',pins.values104Body],['display',pins.display104Body],['after',pins.after104Body]].map(([part,pin])=>{
  const found=original(input.changes104,'native_employment_change_'+part+'_v1',pin);
  return {name:found.name,source:JOB_TITLE_SQL_INPUTS.changes104.path,bodySha256:found.bodySha256,definitionSha256:found.definitionSha256};
 });
 const functions=[
  derived(create,{signature:create.metadata.signature,sourceKey:'classification167',headerSourceKey:'registration095',
   anchor:' INSERT INTO person_identity(id,cuil,dni,full_name,birth_date,sex_code,identity_state)\n',
   guard:titleBlock({id:'registration',expression:"d->'jobTitle'",error:'NATIVE_EMPLOYEE_INPUT_INVALID',allowEmpty:true}),
   point:'After authority, input, replay, catalog, identity and number checks; before the first INSERT.'}),
  derived(propose,{signature:'public.native_employment_change_propose_v1(jsonb,jsonb,uuid)',sourceKey:'void224',
   anchor:" receipt_value:=jsonb_build_object('version','native-employment-change.v1','operation','propose'",
   guard:titleBlock({id:'proposal',expression:"values_value->'jobTitle'",error:'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID',allowEmpty:true}),
   point:'After existing normalization, replay, withdrawn/identity/scope/base/catalog/after/no-change/capacity checks; before receipt and INSERT.'}),
  derived(review,{signature:'public.native_employment_change_review_v1(jsonb,jsonb,uuid)',sourceKey:'void224',
   anchor:'  revision_value:=revision_value+1; version_value:=public.native_employment_change_version_v1(p.after_contract,subject,revision_value);\n',
   guard:titleBlock({id:'approval',expression:"p.after_contract#>'{source_payload,employment,cargoName}'",error:'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID',allowNull:true,indent:'  '}),
   point:'Inside approve only, after replay, withdrawn, authority/maker-checker, base/catalog/after consistency and revision checks; before review INSERT or contract UPDATE.'}),
 ];
 need(new Set(functions.map(fn=>fn.signature)).size===3,'Candidate signatures must be unique.');
 const lineage={
  registration:[
   {source:JOB_TITLE_SQL_INPUTS.registration067.path,kind:'original_definition',bodySha256:old067.bodySha256,definitionSha256:old067.definitionSha256,currentInRepository:false},
   {source:JOB_TITLE_SQL_INPUTS.registration095.path,kind:'replacement_definition',bodySha256:old095.bodySha256,definitionSha256:old095.definitionSha256,currentInRepository:false},
   {source:JOB_TITLE_SQL_INPUTS.consumers099.path,kind:'declared_exact_body_patch',bodySha256:pins.registration099Body,currentInRepository:false},
   {source:JOB_TITLE_SQL_INPUTS.catalog103.path,kind:'declared_exact_body_patch',bodySha256:pins.registration103Body,currentInRepository:false},
   {source:JOB_TITLE_SQL_INPUTS.classification167.path,kind:'exact_after_body_literal',bodySha256:create.bodySha256,definitionSha256:null,currentInRepository:true},
  ],
  registrationGuardOnlySources:[JOB_TITLE_SQL_INPUTS.changes104.path,JOB_TITLE_SQL_INPUTS.lifecycle110.path],
  rectification:[
   {source:JOB_TITLE_SQL_INPUTS.changes104.path,proposalBodySha256:oldPropose.bodySha256,reviewBodySha256:oldReview.bodySha256,currentInRepository:false},
   {source:JOB_TITLE_SQL_INPUTS.void224.path,proposalBodySha256:propose.bodySha256,reviewBodySha256:review.bodySha256,currentInRepository:true},
  ],
 };
 const sql='-- SOURCE PROPOSAL ONLY. NOT AN INSTALLER. EXACT ORIGINALS AND METADATA REQUIRE REVIEWED COMPOSITION.\n'
  +'BEGIN;\nDO $source_only$ BEGIN RAISE EXCEPTION \'EMPLOYMENT_JOB_TITLE_SOURCE_REQUIRES_REVIEWED_COMPOSITION\';END $source_only$;\n\n'
  +'-- Exactly three existing signatures: current create167 / propose224 / review224. No new helper or ACL statement.\n'
  +'-- The create header is copied from 095; its unchanged metadata is declared by 167. This is a new source composition, not an observed historical full definition.\n\n'
  +functions.map(fn=>fn.sql).join('\n\n')+'\n\nROLLBACK;\n';
 need(!/\b(?:GRANT|REVOKE|ALTER\s+FUNCTION|COMMIT)\b/.test(sql),'Source proposal must not change access or commit.');
 return {version:'employment-job-title-writers-source-proposal.v1',sourceBase:JOB_TITLE_SQL_BASE,
  installable:false,connects:false,executesSql:false,postgresExecuted:false,noeliaReady:false,newFunctions:0,
  requiresReviewedComposition:true,requiresMetadataPreservingComposition:true,installedStateObserved:false,
  originals:pins,inputs:JOB_TITLE_SQL_INPUTS,lineage,registrationMetadataLiteral:create.metadata,untouchedHelpers,
  preserved:{authorization:true,identity:true,replay:true,rejection:true,withdrawnGuard:true,inputNormalization:true,
   originalValidationOrder:true,legacyReaders:true,historicalTitles:true,originalPins:true,providers:true,guards:true,acl:true},
  pendingStoredDocument:{approvalRechecksFinalCargoName:true,priorSuccessfulReplayRevalidated:false,
   legacyAdoption:{source:JOB_TITLE_SQL_INPUTS.adoption133.path,modified:false,reason:'Adoption preserves source_payload exactly except native provenance; it does not accept a new jobTitle.'}},
  unresolvedGates:[
   'Codex must identify the exact target/source candidate and attest its installed bodies and all metadata. Repository-current is not proof of installed state.',
   'No installer, preimage gate, family/provider pin or original guard is rewritten here. Composition and attestation must be separately reviewed.',
   'The 167 source has an exact body and metadata literal, not a historical full CREATE definition; preserve the observed metadata during composition.',
   'Only pure derivation/logic tests are supplied. PostgreSQL parsing, UTF8/normalization parity, locks, replay, triggers and rollback still need the separately authorized sandbox.',
  ],functions,sql};
}
