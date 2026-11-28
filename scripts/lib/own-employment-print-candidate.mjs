// Pure source derivation. No connection, SQL execution, installation or attester
// rewrite. Only the two new validators declare owner-only access in the emitted
// source; original definitions/ACLs remain immutable inputs.
import {createHash} from 'node:crypto';

const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
const need=(condition,message)=>{if(!condition)throw Error(message);};
export const EMPLOYMENT_PRINT_ORIGINALS=Object.freeze({
 captureBody:'60a62776902b1c5a0f07f03c99daf97e7565e934801e0be9b34400ef93ef3a03',
 captureDefinition:'006a0083d3a6e6a51cebb9810810316244fb84251ec6fff703666a200c616df3',
 // Original61 returns this historical family identity while independently
 // checking captureBody in its metadata guard. Neither original is rewritten.
 captureFamilyMember:'81e9be18db115cd6d9421118bde5b6f007a95923262e166624bc53b58892feef',
 printFactsBody:'e0f475cdd2b451f1a89380f13b74e74fb7b2135cea911f61b1e459cd10e2bfe0',
 printFactsDefinitionFile:'5a7a469c983d31caf7ed9b644ee6cf72f64d3051ce9e3356705d2d711625e1f6',
 familyMembersFile:'fdb2ed8c470c3cfd08ad9792a51d319683c970b9a01b99bfcff53257e4e4ac7f',
 sourceInstaller:'fbdfa69c916c8c9078f7c19e559a72a9f44d9d9159d51a30a29167c94e5843bb',
});

function definition(source,name){
 need(typeof source==='string','Source text required.');
 const matches=[...source.matchAll(new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(','gm'))];
 need(matches.length===1,'Exactly one original definition required: '+name);
 const start=matches[0].index,tail=source.slice(start),opener=/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/.exec(tail);
 need(opener,'Dollar-quoted original body required: '+name);
 const bodyStart=start+opener.index+opener[0].length,tag=opener[1],end=source.indexOf(tag+';',bodyStart);
 need(end>=bodyStart,'Complete original definition required: '+name);
 const body=source.slice(bodyStart,end),header=source.slice(start,bodyStart),sql=source.slice(start,end+tag.length+1);
 return {name,body,bodySha256:digest(body),sql,definitionSha256:digest(sql),render:next=>header.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ')+next+tag+';'};
}
function once(source,before,after){
 need(source.split(before).length===2,'Unique reviewed source anchor required.');
 return source.replace(before,after);
}

function captureBlock(reference){
 // Turn the reviewed capture-time helper into a nested PL/pgSQL block. Its
 // authentication, locks, resolver and identity checks are retained literally.
 let block=reference.body.replace(/\bemployees\b/g,'print_capture_employees');
 block=once(block,'DECLARE ctx jsonb;',"DECLARE period_value text:=body->>'period';classifications jsonb:=inventory->'periodClassifications';print_capture_employees jsonb:=employees;ctx jsonb;");
 block=once(block,'RETURN component;',"inventory:=inventory||jsonb_build_object('employmentPrintFacts',component);");
 need(block.trimEnd().endsWith('END'),'Capture reference must end with its own block.');
 return block.trim()+';';
}

const PRINT_BLOCK=` IF payload->'sourceInventory' ? 'employmentPrintFacts' THEN
  DECLARE print_component jsonb:=payload#>'{sourceInventory,employmentPrintFacts}';
   print_classifications jsonb:=payload#>'{sourceInventory,periodClassifications}';print_row jsonb;
  BEGIN
   PERFORM public.own_employment_print_component_candidate_v1(print_component,print_classifications,population,payload->>'period');
   SELECT x INTO print_row FROM jsonb_array_elements(print_component->'rows') x WHERE x->'contractId'=record_value->'contractId';
   IF print_row IS NULL OR print_row->'registrationId' IS DISTINCT FROM record_value->'registrationId'
   THEN RAISE EXCEPTION 'OWN_RECEIPT_CONTRACT_INVALID';END IF;
   job_title_value:=print_row->'jobTitle';
   employment_hash:=to_jsonb(public.own_run_hash_v1(jsonb_build_object('version','own-employment-print-evidence.v1',
    'periodClassifications',print_classifications,'employmentPrintFacts',print_component)));
  END;
 END IF;
`;

export function buildEmploymentPrintCandidate({captureSource,printFactsSource,helperSource,familyMembersSource}){
 need(digest(printFactsSource)===EMPLOYMENT_PRINT_ORIGINALS.printFactsDefinitionFile,'Original V6 print definition file changed.');
 need(digest(familyMembersSource)===EMPLOYMENT_PRINT_ORIGINALS.familyMembersFile,'Original family member literal changed.');
 const capture=definition(captureSource,'own_run_capture_v1'),print=definition(printFactsSource,'own_receipt_print_facts_v6_candidate_v1');
 need(capture.bodySha256===EMPLOYMENT_PRINT_ORIGINALS.captureBody,'Original capture prosrc pin mismatch.');
 need(capture.definitionSha256===EMPLOYMENT_PRINT_ORIGINALS.captureDefinition,'Original capture definition pin mismatch.');
 need(print.bodySha256===EMPLOYMENT_PRINT_ORIGINALS.printFactsBody,'Original V6 print prosrc pin mismatch.');
 const provenance=definition(helperSource,'own_employment_print_provenance_candidate_v1'),component=definition(helperSource,'own_employment_print_component_candidate_v1');
 const reference=definition(helperSource,'own_employment_print_capture_candidate_v1');
 const classificationAnchors=[...capture.body.matchAll(/^  inventory:=inventory\|\|jsonb_build_object\('periodClassifications',[^\n]+\);\n/gm)];
 need(classificationAnchors.length===1,'Original period-classification inventory anchor changed.');
 const captureBody=once(capture.body,classificationAnchors[0][0],classificationAnchors[0][0]+captureBlock(reference)+'\n');
 let printBody=once(print.body,"employment_hash jsonb:='null';n integer;","employment_hash jsonb:='null';job_title_value jsonb:='null';n integer;");
 const bankAnchor=" IF public.own_program_exact_v1(bank_fact,ARRAY['paymentDestination','bankConfigurationVersion','bankApprovalId']) IS NOT TRUE";
 printBody=once(printBody,bankAnchor,PRINT_BLOCK+bankAnchor);
 printBody=once(printBody,"'jobTitle',NULL","'jobTitle',job_title_value");
 const functions=[
  {kind:'new',signature:'public.own_employment_print_provenance_candidate_v1(jsonb,jsonb)',...provenance},
  {kind:'new',signature:'public.own_employment_print_component_candidate_v1(jsonb,jsonb,jsonb,text)',...component},
  {kind:'derived_original',signature:'public.own_run_capture_v1(jsonb,jsonb,uuid,text)',name:capture.name,beforeBodySha256:capture.bodySha256,beforeDefinitionSha256:capture.definitionSha256,body:captureBody,bodySha256:digest(captureBody),sql:capture.render(captureBody)},
  {kind:'derived_original',signature:'public.own_receipt_print_facts_v6_candidate_v1(jsonb,jsonb,jsonb,text)',name:print.name,beforeBodySha256:print.bodySha256,beforeDefinitionSha256:print.definitionSha256,body:printBody,bodySha256:digest(printBody),sql:print.render(printBody)},
 ].map(({render,...value})=>({...value,definitionSha256:digest(value.sql)}));
 const members=JSON.parse(familyMembersSource),familyCapacity={};
 for(const [family,prior]of Object.entries(members)){
  need(['quantity','official'].includes(family)&&Array.isArray(prior)&&prior.length===({quantity:29,official:61}[family]),'Unexpected original family.');
  need(new Set(prior.map(row=>row.signature)).size===prior.length,'Duplicate original family member.');
  need(prior.filter(row=>row.signature===functions[2].signature&&row.sha256===EMPLOYMENT_PRINT_ORIGINALS.captureFamilyMember).length===1,'Original historical capture member pin is missing.');
  need(functions.filter(row=>row.kind==='new').every(row=>prior.every(member=>member.signature!==row.signature)),'New helper already belongs to the original family.');
  const after=prior.length+2+1;
  need(after<=64,'Reviewed family capacity would be exceeded.');
  familyCapacity[family]={originalMembers:prior.length,newHelpers:2,attesterMembers:1,proposedTotal:after,unchangedLimit:64,attestationClosed:false};
 }
 need(Object.keys(familyCapacity).length===2,'Both original families are required.');
 const newValidatorAccess=functions.filter(fn=>fn.kind==='new').map(fn=>({
  signature:fn.signature,owner:'neondb_owner',expectedAcl:'{neondb_owner=X/neondb_owner}',
  revokeFrom:['PUBLIC','municontrol_actions_runtime_app'],
  statements:[`ALTER FUNCTION ${fn.signature} OWNER TO neondb_owner;`,
   `REVOKE ALL ON FUNCTION ${fn.signature} FROM PUBLIC,municontrol_actions_runtime_app;`],
 }));
 const sql="-- PURE DERIVED SOURCE. NOT AN INSTALLER. ATTESTATION/METADATA REVIEW REQUIRED.\nBEGIN;\nDO $source_only$ BEGIN RAISE EXCEPTION 'OWN_EMPLOYMENT_PRINT_SOURCE_REQUIRES_REVIEWED_COMPOSITION';END $source_only$;\n\n"
  +functions.map(fn=>fn.sql).join('\n\n')+'\n\n'+newValidatorAccess.flatMap(value=>value.statements).join('\n')+'\n\nROLLBACK;\n';
 need(!/own_employment_print_capture_candidate_v1\(|own_receipt_print_facts_job_title_candidate_v1\(/.test(sql),'A temporary helper leaked into the two-helper proposal.');
 return {version:'own-employment-print-source-proposal.v1',installable:false,connects:false,executesSql:false,
  requiresReviewedAttestation:true,originals:EMPLOYMENT_PRINT_ORIGINALS,familyCapacity,newValidatorAccess,functions,sql};
}
