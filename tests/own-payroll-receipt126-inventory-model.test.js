import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReceipt126Inventory,validateReceipt126Inventory} from '../scripts/lib/own-payroll-receipt126-inventory-model.mjs';

// Synthetic catalog metadata only. No SQL source, file IO, runtime or installer.
const schema='mc_qa_fixed_092_0123456789abcdef0123456789abcdef';
const digest='a'.repeat(64);
const names=['own_receipt_attempt_v1','own_receipt_batch_v1','own_receipt_batch_value_v1','own_receipt_command_v1','own_receipt_context_v1','own_receipt_event_v1','own_receipt_immutable_v1','own_receipt_list_v1','own_receipt_params_v1','own_receipt_preview_v1','own_receipt_self_v1','own_receipt_snapshot_v1','own_receipt_source_version_v1','own_receipt_text_v1'];
const keys=['payroll.receipt.approve','payroll.receipt.prepare','payroll.receipt.self.read'];
function empty(){return {version:'own-receipt126-catalog-inventory.v1',schema:{name:schema,oid:40,ownerOid:41},table:null,functions:[],capabilityDefinitions:[],bodyHashBasis:'pg_proc.prosrc_utf8_lf'};}
function fn(name,oid){return {oid,name,identityArguments:'p jsonb',resultType:'jsonb',language:'plpgsql',kind:'f',securityDefiner:true,leakproof:false,strict:false,returnsSet:false,volatility:'v',parallel:'u',config:['search_path=pg_catalog'],ownerOid:41,ownerMatchesSchema:true,acl:null,bodySha256:digest};}
function table(){return {oid:50,kind:'r',persistence:'p',ownerOid:41,ownerMatchesSchema:true,rlsEnabled:true,forceRls:true,acl:null,columns:[{position:1,name:'event_id',type:'uuid',notNull:true,dropped:false,identityKind:'',generatedKind:'',defaultSha256:null,acl:null}],constraints:[{oid:60,name:'event_pk',type:'p',validated:true,deferrable:false,initiallyDeferred:false,keyPositions:[1],referencedTableOid:0,definitionSha256:digest}],triggers:[{oid:61,name:'immutable',internal:false,enabled:'O',eventMask:23,functionOid:110,functionSchema:schema,functionName:'own_receipt_immutable_v1',definitionSha256:digest}],indexes:[{oid:62,name:'event_pk',unique:true,primary:true,valid:true,ready:true,keyPositions:[1],definitionSha256:digest}],policies:[{oid:63,name:'deny_direct',permissive:true,command:'*',roleOids:[0],usingSha256:digest,checkSha256:null}]};}
function complete(){return {...empty(),table:table(),functions:names.map((name,index)=>fn(name,100+index)),capabilityDefinitions:keys.map(key=>({key,label:'Synthetic capability',description:'Catalog definition',scopeKind:'tenant',sensitivity:'high'}))};}
function invalid(value,expected=schema){assert.throws(()=>classifyReceipt126Inventory(value,expected),{code:'RECEIPT126_INVENTORY_INVALID'});}

test('empty family is absent while both authorities remain false',()=>{
 const result=classifyReceipt126Inventory(empty(),schema);
 assert.equal(result.classification,'ausente');assert.equal(result.formValidated,true);
 assert.deepEqual(result.counts,{tables:0,functions:0,capabilityDefinitions:0});
 assert.deepEqual(result.missingFunctionNames,names);assert.deepEqual(result.missingCapabilityKeys,keys);
 assert.equal(result.installationAllowed,false);assert.equal(result.receiptWorkflowExecuted,false);assert.equal(result.metadataOnly,true);
});
test('capability definitions without receipt objects are partial',()=>{
 const value=empty();value.capabilityDefinitions=complete().capabilityDefinitions;
 const result=classifyReceipt126Inventory(value,schema);
 assert.equal(result.classification,'parcial');assert.equal(result.counts.capabilityDefinitions,3);assert.deepEqual(result.missingCapabilityKeys,[]);assert.equal(result.missingFunctionNames.length,14);
});
test('complete named inventory means objects present without admission',()=>{
 const result=classifyReceipt126Inventory(complete(),schema);
 assert.equal(result.classification,'objetos_presentes_sin_admision');assert.deepEqual(result.counts,{tables:1,functions:14,capabilityDefinitions:3});
 assert.deepEqual(result.missingFunctionNames,[]);assert.deepEqual(result.missingCapabilityKeys,[]);
 assert.equal(result.installationAllowed,false);assert.equal(result.receiptWorkflowExecuted,false);
 assert.equal(Object.hasOwn(result,'installed'),false);assert.equal(Object.hasOwn(result,'approved'),false);
});
test('equal function count cannot hide one missing canonical name',()=>{
 const value=complete();value.functions[0].name='own_receipt_extra_v9';
 const result=classifyReceipt126Inventory(value,schema);
 assert.equal(result.classification,'parcial');assert.equal(result.counts.functions,14);assert.deepEqual(result.missingFunctionNames,['own_receipt_attempt_v1']);
});
test('missing table stays partial despite all functions and definitions',()=>{
 const value=complete();value.table=null;assert.equal(classifyReceipt126Inventory(value,schema).classification,'parcial');
});
test('missing capability stays partial despite event table and functions',()=>{
 const value=complete();value.capabilityDefinitions.pop();const result=classifyReceipt126Inventory(value,schema);
 assert.equal(result.classification,'parcial');assert.deepEqual(result.missingCapabilityKeys,['payroll.receipt.self.read']);
});
test('observed unsafe metadata never grants installation or workflow authority',()=>{
 const value=complete();value.table.rlsEnabled=false;value.table.forceRls=false;value.table.ownerMatchesSchema=false;
 value.functions[0].securityDefiner=false;value.functions[0].ownerMatchesSchema=false;value.functions[0].bodySha256='b'.repeat(64);value.functions[0].config=['search_path=public'];
 value.functions[0].acl=[{grantorOid:41,granteeOid:0,privilegeType:'EXECUTE',grantable:true}];
 const result=classifyReceipt126Inventory(value,schema);
 assert.equal(result.classification,'objetos_presentes_sin_admision');assert.equal(result.installationAllowed,false);assert.equal(result.receiptWorkflowExecuted,false);
 assert.equal(result.inventory.functions[0].acl[0].granteeOid,0);assert.equal(result.inventory.table.rlsEnabled,false);
});
test('null catalog metadata remains distinct from empty arrays and zero OID',()=>{
 const value=complete();value.table.constraints[0].keyPositions=null;value.functions[0].config=null;value.functions[1].acl=[];
 const result=classifyReceipt126Inventory(value,schema);
 assert.equal(result.inventory.functions[0].acl,null);assert.deepEqual(result.inventory.functions[1].acl,[]);assert.equal(result.inventory.functions[0].config,null);
 assert.equal(result.inventory.table.columns[0].defaultSha256,null);assert.equal(result.inventory.table.constraints[0].keyPositions,null);assert.equal(result.inventory.table.constraints[0].referencedTableOid,0);
});
test('extra receipt functions are retained without truncation or admission',()=>{
 const value=complete();value.functions.push(fn('own_receipt_diagnostic_v8',900));const result=classifyReceipt126Inventory(value,schema);
 assert.equal(result.counts.functions,15);assert.equal(result.inventory.functions.length,15);assert.equal(result.installationAllowed,false);
});
test('overloads with different identity arguments are retained',()=>{
 const value=complete();const overload=fn(names[0],901);overload.identityArguments='p jsonb, k uuid';value.functions.push(overload);
 assert.equal(classifyReceipt126Inventory(value,schema).inventory.functions.length,15);
});
test('diagnostic procedure result null and empty capability labels are preserved',()=>{
 const value=complete();value.functions[0].kind='p';value.functions[0].resultType=null;value.capabilityDefinitions[0].label='';
 const result=classifyReceipt126Inventory(value,schema);assert.equal(result.inventory.functions[0].resultType,null);assert.equal(result.inventory.capabilityDefinitions[0].label,'');assert.equal(result.installationAllowed,false);
});
test('wrong schema identity and missing schema fail rather than become absent',()=>{
 const value=empty();value.schema.name='mc_qa_fixed_092_ffffffffffffffffffffffffffffffff';invalid(value);value.schema=null;invalid(value);invalid(empty(),'public');
});
test('malformed or sparse collections fail rather than become absent',()=>{
 const value=empty();value.functions=new Array(1);invalid(value);value.functions=[];value.functions.extra='not a row';invalid(value);
});
test('duplicate object OIDs and duplicate function signatures are rejected',()=>{
 const oid=complete();oid.functions[1].oid=oid.functions[0].oid;invalid(oid);
 const signature=complete();signature.functions[1].name=signature.functions[0].name;invalid(signature);
});
test('duplicate capability keys and duplicate ACL grants are rejected',()=>{
 const cap=complete();cap.capabilityDefinitions[1].key=cap.capabilityDefinitions[0].key;invalid(cap);
 const grant=complete();const row={grantorOid:41,granteeOid:0,privilegeType:'EXECUTE',grantable:false};grant.functions[0].acl=[row,{...row}];invalid(grant);
});
test('unknown fields and source bodies are never accepted as inventory metadata',()=>{
 const body=complete();body.functions[0].prosrc='private body';invalid(body);
 const authority=empty();authority.installationAllowed=true;invalid(authority);
});
test('invalid hashes and numeric object identity are rejected',()=>{
 const hash=complete();hash.functions[0].bodySha256='not a digest';invalid(hash);
 const oid=complete();oid.table.oid=0;invalid(oid);
});
test('classification is a detached deeply frozen copy with false authorities',()=>{
 const value=complete();const result=classifyReceipt126Inventory(value,schema);value.functions[0].bodySha256='c'.repeat(64);
 assert.equal(result.inventory.functions[0].bodySha256,digest);assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.inventory.functions[0]),true);
 assert.throws(()=>{result.installationAllowed=true;},TypeError);assert.throws(()=>{result.inventory.functions.push(fn('own_receipt_other_v3',902));},TypeError);
 assert.equal(validateReceipt126Inventory(value,schema),value);
});
