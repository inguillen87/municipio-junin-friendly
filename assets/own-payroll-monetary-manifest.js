// Private future-programme envelope. No programme admission, approval or execution.
import {payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {
 OWN_MONETARY_SOURCE_VERSION, verifyOwnMonetaryPolicy, ownMonetaryProtocolHash,
 ownMonetaryPolicyStructure,beginOwnMonetaryPolicyVerification,
} from './own-payroll-monetary-policy.js';

export const OWN_MONETARY_MANIFEST_VERSION='own-program-monetary-manifest.v1';
export const OWN_MONETARY_MANIFEST_MAX_BYTES=4*1024*1024;
const fail=(condition,code='OWN_MONETARY_MANIFEST_INVALID')=>require(condition,code,'No se verificó el anexo monetario completo del programa. Conservá su fuente y revisá la misma versión.');
const envelopeFields=['monetaryPolicyVersion','monetaryPolicy'];

// Only the small outer records are inspected here. R2 synchronously captures
// every nested value of policy and reconstructed source with ONE shared budget
// before yielding. No original input is consulted after that capture.
function record(value,keys=null){
 fail(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);
 const names=Reflect.ownKeys(value);fail(names.length<=32&&names.every(key=>typeof key==='string'));
 const descriptors=Object.getOwnPropertyDescriptors(value);
 fail(names.every(key=>descriptors[key].enumerable&&Object.hasOwn(descriptors[key],'value')));
 if(keys)fail(names.length===keys.length&&keys.every(key=>Object.hasOwn(descriptors,key)));
 return Object.fromEntries(names.map(key=>[key,descriptors[key].value]));
}

function assembly(policy,captured){
 fail(!envelopeFields.some(key=>Object.hasOwn(captured.program,key)));
 const manifest=Object.freeze({sourceReference:captured.sourceReference,sourceSha256:captured.sourceSha256,policy});
 const definition=Object.freeze({...captured.program,monetaryPolicyVersion:OWN_MONETARY_MANIFEST_VERSION,monetaryPolicy:manifest});
 // This is compact canonical JSON UTF8 for the definition, not a claim about
 // the later command/HTTP body. R2 has already bounded its entire source graph.
 const definitionBytes=new TextEncoder().encode(salarySerialized(definition)).byteLength;
 fail(definitionBytes<=OWN_MONETARY_MANIFEST_MAX_BYTES,'OWN_MONETARY_MANIFEST_LIMIT');
 return {definition,definitionBytes};
}
function result(checked,assembled,definitionSha256){
 return Object.freeze({
  version:'own-program-monetary-manifest-check.v1',...assembled,
  sourceProgramSha256:checked.source.programSha256,
  monetaryPolicySha256:checked.policy.policySha256,definitionSha256,
  sourceEvidence:checked.source.sourceEvidence,
  programmeStructureValidated:false,sqlCustodyValidated:false,
  approvalAuthorityValidated:false,legacyReplayImplemented:false,
  presentable:false,approved:false,executable:false,
  payrollCalculated:false,payrollPosted:false,
 });
}
async function envelope(checked){const assembled=assembly(checked.policy,checked.source.source);return result(checked,assembled,await ownMonetaryProtocolHash(assembled.definition));}

export async function prepareOwnMonetaryProgrammeDraft(rawPolicy,rawSource){
 // verifyOwnMonetaryPolicy captures BOTH inputs before its first await.
 const checked=await verifyOwnMonetaryPolicy(rawPolicy,rawSource);
 return envelope(checked);
}

function inputs(rawDefinition){
 const fields=record(rawDefinition);
 fail(envelopeFields.every(key=>Object.hasOwn(fields,key))&&fields.monetaryPolicyVersion===OWN_MONETARY_MANIFEST_VERSION);
 const manifest=record(fields.monetaryPolicy,['sourceReference','sourceSha256','policy']);
 const policy=record(manifest.policy,['version','complete','sourceStateSha256','programSha256','inventorySha256','entries','policySha256']);
 const {monetaryPolicyVersion,monetaryPolicy,...program}=fields;
 const source={version:OWN_MONETARY_SOURCE_VERSION,complete:true,program,
  programSha256:policy.programSha256,sourceReference:manifest.sourceReference,sourceSha256:manifest.sourceSha256};
 return {policy,source};
}
// Only declaration structure is admitted here. The caller's programme normalizer
// must compare the base with its exact canonical output. This is not a hash check.
export function ownMonetaryProgrammeStructure(rawDefinition){
 const input=inputs(rawDefinition),checked=ownMonetaryPolicyStructure(input.policy,input.source),assembled=assembly(checked.policy,checked.source);
 return Object.freeze({version:'own-program-monetary-manifest-structure.v1',...assembled,integrityValidated:false,programmeStructureValidated:false,sqlCustodyValidated:false,approvalAuthorityValidated:false,approved:false,presentable:false,executable:false,payrollCalculated:false,payrollPosted:false});
}
function* manifestSteps(policySteps){
 const checked=yield* policySteps,assembled=assembly(checked.policy,checked.source.source),definitionSha256=yield salarySerialized(assembled.definition);
 fail(typeof definitionSha256==='string'&&/^[a-f0-9]{64}$/.test(definitionSha256));return result(checked,assembled,definitionSha256);
}
export function beginOwnMonetaryProgrammeVerification(rawDefinition){
 const input=inputs(rawDefinition);
 // beginPolicy captures deeply now; neither generator is allowed a raw input.
 return manifestSteps(beginOwnMonetaryPolicyVerification(input.policy,input.source));
}
export async function verifyOwnMonetaryProgrammeManifest(rawDefinition){
 const steps=beginOwnMonetaryProgrammeVerification(rawDefinition);let current=steps.next();
 while(!current.done){const bytes=new TextEncoder().encode(current.value),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');current=steps.next(hash);}
 return current.value;
}
