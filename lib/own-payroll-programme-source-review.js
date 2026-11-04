// Inert source review only: no source parser, interpreter, producer or command.
import {createHash} from 'node:crypto';
import {parseScopedPrivateJson} from './private-json-body.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {prepareOwnPayrollProgrammeSource,OWN_PROGRAMME_SOURCE_VERSION} from './own-payroll-programme-source-preparation.js';
import {OWN_SOURCE_EVIDENCE_VERSION,OWN_SOURCE_EVIDENCE_AGREEMENTS} from './own-payroll-source-evidence-inventory-v2.js';
export const OWN_PROGRAMME_SOURCE_REVIEW_VERSION='own-payroll-programme-source-review.v2';
export const OWN_PROGRAMME_SOURCE_PROVENANCE_VERSION='own-payroll-source-provenance-index.v1';
export const OWN_PROGRAMME_SOURCE_REVIEW_LIMITS=Object.freeze({evidenceBytes:128*1024*1024,controlBytes:12*1024*1024,preparationBytes:12*1024*1024,outputBytes:16*1024*1024});
const sha=v=>createHash('sha256').update(v).digest('hex'),hash=v=>sha(salarySerialized(v));
export const ownProgrammeSourceReviewHash=hash;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),reason=v=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=180&&!/[<>\x00-\x1f\x7f]/.test(v);
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
function inert(v,depth=0,seen=new Set(),budget={n:0}){
 need(depth<=48&&++budget.n<=(budget.maxNodes??250000),'SOURCE_REVIEW_CONTROL_LIMIT');
 const account=n=>{if(budget.maxBytes!==undefined){budget.bytes+=n;need(budget.bytes<=budget.maxBytes,'SOURCE_REVIEW_OUTPUT_LIMIT');}};
 if(v===null||typeof v==='string'||typeof v==='boolean'){account(Buffer.byteLength(JSON.stringify(v)));return v;}
 if(typeof v==='number'){need(Number.isSafeInteger(v),'SOURCE_REVIEW_CONTROL_INVALID');account(Buffer.byteLength(JSON.stringify(v)));return v;}
 need(v&&typeof v==='object'&&!seen.has(v),'SOURCE_REVIEW_CONTROL_INVALID');
 const array=Array.isArray(v),keys=Reflect.ownKeys(v),ds=Object.getOwnPropertyDescriptors(v);
 need(Object.getPrototypeOf(v)===(array?Array.prototype:Object.prototype)&&keys.every(k=>typeof k==='string'&&Object.hasOwn(ds[k],'value')&&(array&&k==='length'||ds[k].enumerable)),'SOURCE_REVIEW_CONTROL_INVALID');
 if(array)need(keys.length===v.length+1&&Array.from({length:v.length},(_,i)=>String(i)).every(k=>ds[k]),'SOURCE_REVIEW_CONTROL_INVALID');
 account(2+Math.max(0,(array?v.length:keys.length)-1));
 if(!array)keys.forEach(k=>account(Buffer.byteLength(JSON.stringify(k))+1));
 seen.add(v);const out=array?Array.from({length:v.length},(_,i)=>inert(ds[String(i)].value,depth+1,seen,budget)):Object.fromEntries(keys.map(k=>[k,inert(ds[k].value,depth+1,seen,budget)]));seen.delete(v);return out;
}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const fields={codliq:['FOVM_27','UNIM_27','CONM_27','FOVJ_27','UNIJ_27','CONJ_27','FOFM_27','FOFJ_27','FORMULA_PRE','FORMULA_POST'],auxical:['ALGV_77','ALGF_77','COND_77','NPIF_77','NPIV_77','CNPI_77'],concepto:[],calauxi:[]};
const identity=d=>`${d.kind}:${d.agreementCode}:${d.code}`,comparisonId=c=>`${c.rowId}/${c.infixField}/${c.postfixField}`,fieldId=e=>`${e.rowId}/${e.field}`;

function buildProjection(raw){
 const input=inert(raw);need(exact(input,['version','evidenceText','evidenceSha256','sourcePins','decisions','preparation'])&&input.version===OWN_PROGRAMME_SOURCE_REVIEW_VERSION,'SOURCE_REVIEW_CONTRACT_INVALID');
 need(typeof input.evidenceText==='string'&&Buffer.byteLength(input.evidenceText)<=OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.evidenceBytes,'SOURCE_REVIEW_EVIDENCE_LIMIT');need(digest(input.evidenceSha256)&&sha(input.evidenceText)===input.evidenceSha256,'SOURCE_REVIEW_EVIDENCE_CHANGED');
 need(Buffer.byteLength(JSON.stringify({...input,evidenceText:null}))<=OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.controlBytes,'SOURCE_REVIEW_CONTROL_LIMIT');
 let evidence;try{evidence=parseScopedPrivateJson(input.evidenceText,{maxDepth:48});}catch{need(false,'SOURCE_REVIEW_EVIDENCE_JSON_INVALID');}
 need(evidence?.version===OWN_SOURCE_EVIDENCE_VERSION&&evidence.payrollExecutionAllowed===false&&evidence.programmePrepared===false&&evidence.approved===false,'SOURCE_REVIEW_EVIDENCE_INVALID');
 need(exact(input.sourcePins,['sourceSha256','configurationSha256','companyId'])&&digest(input.sourcePins.sourceSha256)&&digest(input.sourcePins.configurationSha256)&&input.sourcePins.sourceSha256===evidence.sourceSha256&&input.sourcePins.configurationSha256===evidence.configurationSha256&&input.sourcePins.companyId===evidence.companyId,'SOURCE_REVIEW_CONTEXT_CHANGED');
 need(salarySerialized(evidence.requestedAgreements)===salarySerialized(OWN_SOURCE_EVIDENCE_AGREEMENTS)&&Array.isArray(evidence.rows)&&Array.isArray(evidence.expressions)&&Array.isArray(evidence.representations)&&evidence.summary?.sourceRows===evidence.rows.length&&evidence.summary.expressionCells===evidence.expressions.length,'SOURCE_REVIEW_SOURCE_SET_INCOMPLETE');
 const rowMap=new Map(),expressionMap=new Map(),comparisonMap=new Map();
 for(const row of evidence.rows){need(row&&typeof row.id==='string'&&Object.hasOwn(fields,row.table)&&!rowMap.has(row.id)&&row.sourceMetadata&&Array.isArray(row.sourceMetadata.columns)&&row.sourceMetadata.row&&Object.values(row.sourceMetadata.row).every(v=>v===null||typeof v==='string')&&digest(row.sourceMetadata.rowSha256)&&hash(row.sourceMetadata.row)===row.sourceMetadata.rowSha256&&digest(row.definitionSha256)&&hash({key:row.key,metadata:row.metadata,expressions:row.expressions})===row.definitionSha256,'SOURCE_REVIEW_ROW_INVALID');rowMap.set(row.id,row);}
 need(OWN_SOURCE_EVIDENCE_AGREEMENTS.every(a=>evidence.rows.some(r=>r.table==='codliq'&&r.agreement===a)),'SOURCE_REVIEW_AGREEMENT_SET_INCOMPLETE');
 for(const expression of evidence.expressions){const row=rowMap.get(expression.rowId),key=fieldId(expression);need(row&&fields[row.table].includes(expression.field)&&!expressionMap.has(key),'SOURCE_REVIEW_FIELD_SET_INVALID');const present=Object.hasOwn(row.sourceMetadata.row,expression.field),value=present?row.sourceMetadata.row[expression.field]:null,column=row.sourceMetadata.columns.some(c=>c.name===expression.field);need((!present||value===null||typeof value==='string')&&expression.sourceText===value&&expression.sourceValueJsonSha256===(present?hash(value):null)&&expression.sourceTextSha256===(present&&typeof value==='string'?sha(value):null),'SOURCE_REVIEW_FIELD_CHANGED');const expected=!column?'source_column_missing':!present?'source_value_unprovided':value===null?'source_null':value===''?'source_empty':['FORMULA_PRE','FORMULA_POST'].includes(expression.field)?'special_routine_requires_implementation':null;need(expected?expression.state===expected:['infix_structural_only','postfix_structural_only','infix_unresolved','postfix_unresolved'].includes(expression.state),'SOURCE_REVIEW_FIELD_STATE_CHANGED');expressionMap.set(key,expression);}
 for(const row of rowMap.values())need(fields[row.table].every(field=>expressionMap.has(row.id+'/'+field)),'SOURCE_REVIEW_FIELD_SET_INCOMPLETE');
 for(const c of evidence.representations){need(rowMap.has(c.rowId)&&expressionMap.has(c.rowId+'/'+c.infixField)&&expressionMap.has(c.rowId+'/'+c.postfixField)&&!comparisonMap.has(comparisonId(c))&&c.selectedRuntimeField===null&&c.precedenceProved===false&&['same_normalized_tree','different_tree_requires_review','representation_unavailable'].includes(c.status),'SOURCE_REVIEW_COMPARISON_INVALID');comparisonMap.set(comparisonId(c),c);}
 const sourcePairs=[['ALGV_77','NPIV_77'],['ALGF_77','NPIF_77'],['COND_77','CNPI_77']];for(const row of rowMap.values())if(row.table==='auxical')need(sourcePairs.every(([a,b])=>comparisonMap.has(row.id+'/'+a+'/'+b)),'SOURCE_REVIEW_COMPARISON_SET_INCOMPLETE');need(comparisonMap.size===evidence.rows.filter(r=>r.table==='auxical').length*3,'SOURCE_REVIEW_COMPARISON_SET_INCOMPLETE');
 need(evidence.summary.representationPairs===comparisonMap.size&&evidence.summary.differentTrees===[...comparisonMap.values()].filter(c=>c.status==='different_tree_requires_review').length&&evidence.summary.unavailablePairs===[...comparisonMap.values()].filter(c=>c.status==='representation_unavailable').length,'SOURCE_REVIEW_COMPARISON_SET_INCOMPLETE');
 assertSourceComponents(evidence);
 const decisions=input.decisions,p=input.preparation;need(exact(decisions,['version','period','scope','rows','representations','definitions','bindings','totalsPolicy'])&&decisions.version===OWN_PROGRAMME_SOURCE_REVIEW_VERSION&&exact(decisions.scope,['kind','complete','expectedDefinitions','reason'])&&decisions.scope.kind==='explicit_complete_native_closure'&&typeof decisions.scope.complete==='boolean'&&reason(decisions.scope.reason),'SOURCE_REVIEW_DECISIONS_INVALID');need(Array.isArray(decisions.rows)&&Array.isArray(decisions.representations)&&Array.isArray(decisions.definitions)&&Array.isArray(decisions.bindings)&&p&&p.version===OWN_PROGRAMME_SOURCE_VERSION&&Array.isArray(p.definitions)&&Array.isArray(p.bindings)&&decisions.period===p.period,'SOURCE_REVIEW_DECISIONS_INVALID');
 const incidents=[],incidentKeys=new Set(),add=(code,rowId=null,path=null)=>{const item={code,rowId,path},key=hash(item);if(!incidentKeys.has(key)){incidentKeys.add(key);incidents.push(item);}};
 const rowDecisions=new Map();for(const d of decisions.rows){need(exact(d,['rowId','rowSha256','definitionSha256','disposition','reason'])&&rowMap.has(d.rowId)&&!rowDecisions.has(d.rowId)&&reason(d.reason)&&['native_definition','out_of_scope','metadata_only','blocked'].includes(d.disposition),'SOURCE_REVIEW_ROW_DECISION_INVALID');const row=rowMap.get(d.rowId);need(d.rowSha256===row.sourceMetadata.rowSha256&&d.definitionSha256===row.definitionSha256,'SOURCE_REVIEW_ROW_PIN_CHANGED');need(d.disposition!=='native_definition'||['codliq','auxical'].includes(row.table),'SOURCE_REVIEW_ROW_ROLE_INVALID');rowDecisions.set(d.rowId,d);if(d.disposition==='blocked')add('SOURCE_ROW_DECISION_UNRESOLVED',d.rowId);}
 for(const d of rowDecisions.values())need(d.disposition!=='metadata_only'||['concepto','calauxi'].includes(rowMap.get(d.rowId).table),'SOURCE_REVIEW_ROW_ROLE_INVALID');
 for(const d of rowDecisions.values()){const row=rowMap.get(d.rowId);if(d.disposition==='native_definition'&&row.table==='auxical'&&(row.key.CODI_01!==evidence.companyId||row.sourceMetadata.row.CODI_01!==evidence.companyId))add('SOURCE_AUXILIARY_COMPANY_SCOPE_MISMATCH',row.id,'CODI_01');}
 if(rowDecisions.size!==rowMap.size)add('SOURCE_ROW_DECISIONS_INCOMPLETE');
 const cmpDecisions=new Map();for(const d of decisions.representations){need(exact(d,['id','comparisonSha256','selectedField','reason'])&&comparisonMap.has(d.id)&&!cmpDecisions.has(d.id)&&reason(d.reason),'SOURCE_REVIEW_COMPARISON_DECISION_INVALID');const c=comparisonMap.get(d.id);need(d.comparisonSha256===hash(c),'SOURCE_REVIEW_COMPARISON_PIN_CHANGED');need(d.selectedField===null||[c.infixField,c.postfixField].includes(d.selectedField),'SOURCE_REVIEW_REPRESENTATION_INVALID');cmpDecisions.set(d.id,d);}
 if(cmpDecisions.size!==comparisonMap.size)add('SOURCE_COMPARISON_DECISIONS_INCOMPLETE');
 const nativeMap=new Map();for(const d of p.definitions){need(d&&typeof d.kind==='string'&&typeof d.agreementCode==='string'&&typeof d.code==='string'&&!nativeMap.has(identity(d)),'SOURCE_REVIEW_NATIVE_DEFINITION_INVALID');nativeMap.set(identity(d),d);}
 const definitionDecisions=new Map();for(const d of decisions.definitions){need(exact(d,['rowId','nativeIdentity','nativeDefinitionSha256','fields','reason'])&&rowMap.has(d.rowId)&&!definitionDecisions.has(d.rowId)&&rowDecisions.get(d.rowId)?.disposition==='native_definition'&&reason(d.reason)&&Array.isArray(d.fields),'SOURCE_REVIEW_DEFINITION_DECISION_INVALID');const row=rowMap.get(d.rowId),native=nativeMap.get(d.nativeIdentity),expectedIdentity=`${row.table==='codliq'?'concept':'auxiliary'}:${row.agreement}:${row.key.CODI_27??row.key.ITEM_77}`;need(d.nativeIdentity===expectedIdentity&&native&&d.nativeDefinitionSha256===hash(native)&&native.sourceSha256===row.sourceMetadata.rowSha256,'SOURCE_REVIEW_NATIVE_PIN_CHANGED');const seen=new Set();let amounts=0;for(const f of d.fields){need(exact(f,['field','state','sourceTextSha256','sourceValueJsonSha256','astSha256','role','reason'])&&fields[row.table].includes(f.field)&&!seen.has(f.field)&&reason(f.reason)&&['amount','quantity','condition','alternative','not_used','opaque'].includes(f.role),'SOURCE_REVIEW_FIELD_DECISION_INVALID');seen.add(f.field);const e=expressionMap.get(row.id+'/'+f.field);need(f.state===e.state&&f.sourceTextSha256===e.sourceTextSha256&&f.sourceValueJsonSha256===e.sourceValueJsonSha256&&f.astSha256===hash({rawAst:e.rawAst,normalizedAst:e.normalizedAst}),'SOURCE_REVIEW_FIELD_PIN_CHANGED');if(f.role==='amount')amounts++;if(['amount','quantity','condition'].includes(f.role)&&!['infix_structural_only','postfix_structural_only'].includes(e.state))add('SOURCE_FIELD_NOT_STRUCTURALLY_AVAILABLE',row.id,f.field);if(e.state==='special_routine_requires_implementation')add('SOURCE_ROUTINE_UNIMPLEMENTED',row.id,f.field);for(const c of comparisonMap.values())if(c.rowId===row.id&&['amount','quantity','condition'].includes(f.role)&&[c.infixField,c.postfixField].includes(f.field)&&cmpDecisions.get(comparisonId(c))?.selectedField!==f.field)add('SOURCE_REPRESENTATION_DECISION_CONFLICT',row.id,f.field);}
 if(seen.size!==fields[row.table].length)add('SOURCE_FIELD_DECISIONS_INCOMPLETE',row.id);if(amounts!==1)add('SOURCE_AMOUNT_DECISION_REQUIRED',row.id);definitionDecisions.set(d.rowId,d);}
 const selected=[...rowDecisions.values()].filter(d=>d.disposition==='native_definition');if(selected.length!==p.definitions.length||definitionDecisions.size!==selected.length||decisions.scope.expectedDefinitions!==selected.length||!decisions.scope.complete||p.source?.complete!==true||p.source?.expectedDefinitions!==selected.length||p.source?.sha256!==evidence.sourceSha256)add('SOURCE_SELECTED_CLOSURE_INCOMPLETE');
 const bindingDecisions=new Map();for(const d of decisions.bindings){need(exact(d,['agreementCode','reference','sourceSha256','bindingSha256','reason'])&&reason(d.reason),'SOURCE_REVIEW_BINDING_DECISION_INVALID');const key=d.agreementCode+':'+d.reference;need(!bindingDecisions.has(key),'SOURCE_REVIEW_BINDING_DECISION_DUPLICATE');bindingDecisions.set(key,d);}
 for(const b of p.bindings){const key=b.agreementCode+':'+b.reference,d=bindingDecisions.get(key);if(!d)add('SOURCE_BINDING_DECISION_MISSING',null,key);else need(d.sourceSha256===b.sourceSha256&&d.bindingSha256===hash(b.binding),'SOURCE_REVIEW_BINDING_PIN_CHANGED');}if(bindingDecisions.size!==p.bindings.length)add('SOURCE_BINDING_DECISIONS_INCOMPLETE');
 need(exact(decisions.totalsPolicy,['precision','sourceSha256','reason'])&&digest(decisions.totalsPolicy.sourceSha256)&&reason(decisions.totalsPolicy.reason),'SOURCE_REVIEW_TOTALS_POLICY_INVALID');if(decisions.totalsPolicy.precision===null||decisions.totalsPolicy.precision!==p.totalsPrecision)add('SOURCE_TOTALS_POLICY_UNRESOLVED');
 const preparationBytes=Buffer.byteLength(JSON.stringify(p));need(preparationBytes<=OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.preparationBytes,'SOURCE_REVIEW_PREPARATION_LIMIT');
 let preparation=null;if(incidents.length===0)preparation=prepareOwnPayrollProgrammeSource(p);
 const controlRecord={version:input.version,evidenceSha256:input.evidenceSha256,sourcePins:input.sourcePins,decisions,preparation:p};
 const provenanceIndex=buildProvenanceIndex(evidence,controlRecord);
 const allIncidents=[...incidents.map(i=>({origin:'source_review',...i})),...(preparation?.incidents??[]).map(i=>({origin:'preparation',...i}))];
 const incomplete=new Set(['SOURCE_ROW_DECISIONS_INCOMPLETE','SOURCE_COMPARISON_DECISIONS_INCOMPLETE','SOURCE_FIELD_DECISIONS_INCOMPLETE','SOURCE_SELECTED_CLOSURE_INCOMPLETE','SOURCE_BINDING_DECISION_MISSING','SOURCE_BINDING_DECISIONS_INCOMPLETE']);
 const result={
  version:OWN_PROGRAMME_SOURCE_REVIEW_VERSION,projectionVersion:OWN_PROGRAMME_SOURCE_PROVENANCE_VERSION,
  status:incidents.length?'source_review_blocked':preparation.status,
  approved:false,executable:false,payrollCalculated:false,payrollPosted:false,remoteAuthorization:false,
  sourceHashStatus:'exact_declared_evidence_bytes_not_backup_or_remote_authorization',
  evidenceRef:{sha256:input.evidenceSha256,bytes:Buffer.byteLength(input.evidenceText),version:evidence.version,...input.sourcePins},
  pins:{evidenceSha256:input.evidenceSha256,...input.sourcePins,controlSha256:hash(controlRecord),decisionsSha256:hash(decisions),nativeInputSha256:hash(p)},
  controlRecord,
  completeness:{rows:evidence.rows.length,expressionCells:evidence.expressions.length,comparisons:evidence.representations.length,differentTrees:evidence.summary.differentTrees,unavailablePairs:evidence.summary.unavailablePairs,selectedDefinitions:selected.length,allRowsAccounted:rowDecisions.size===rowMap.size,allComparisonsAccounted:cmpDecisions.size===comparisonMap.size,allControlEntriesAccounted:incidents.every(i=>!incomplete.has(i.code))},
  provenanceIndex,incidents:allIncidents,preparationResult:preparation,
  capacity:{controlBytes:Buffer.byteLength(JSON.stringify({...input,evidenceText:null})),controlLimitBytes:OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.controlBytes,preparationBytes,preparationLimitBytes:OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.preparationBytes,outputLimitBytes:OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.outputBytes}
 };
 const outputBytes=Buffer.byteLength(JSON.stringify(result));
 if(outputBytes>OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.outputBytes)throw Object.assign(Error('SOURCE_REVIEW_OUTPUT_LIMIT'),{code:'SOURCE_REVIEW_OUTPUT_LIMIT',actualBytes:outputBytes,limitBytes:OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.outputBytes,controlBytes:result.capacity.controlBytes,preparationBytes});
 return freeze(result);
}

const sourceRootKeys=['version','configurationSha256','sourceSha256','companyId','requestedAgreements','rows','expressions','representations','audit','coverage','metadataSets','summary','programmeCapacity','unresolvedPolicies','payrollExecutionAllowed','programmePrepared','approved','municipalAcceptance'];
const pointerPart=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
function assertSourceComponents(evidence){
 need(evidence.audit&&Object.getPrototypeOf(evidence.audit)===Object.prototype&&evidence.audit.summary&&Array.isArray(evidence.audit.summary.coverage)&&Array.isArray(evidence.coverage)&&Array.isArray(evidence.metadataSets)&&evidence.expressions.every(e=>Array.isArray(e.diagnostics)&&Array.isArray(e.dependencies)&&Array.isArray(e.literals)),'SOURCE_REVIEW_COMPONENT_INVALID');
 need(sourceRootKeys.every(key=>Object.hasOwn(evidence,key)),'SOURCE_REVIEW_COMPONENT_MISSING');
}
function buildProvenanceIndex(evidence,controls){
 const d=controls.decisions,p=controls.preparation,rows=new Map(evidence.rows.map((r,i)=>[r.id,i]));
 const cells=new Map(evidence.expressions.map((e,i)=>[fieldId(e),i]));
 const comparisons=new Map(evidence.representations.map((c,i)=>[comparisonId(c),i]));
 const rowDecisions=new Map(d.rows.map((v,i)=>[v.rowId,i])),comparisonDecisions=new Map(d.representations.map((v,i)=>[v.id,i]));
 const fieldDecisions=new Map();d.definitions.forEach((v,i)=>v.fields.forEach((f,j)=>fieldDecisions.set(v.rowId+'/'+f.field,{definition:i,field:j})));
 const vector=values=>values.map((v,at)=>({at,sha256:hash(v)}));
 const decisionIndex=[];
 const add=(pointer,value,sourceRefs=[])=>decisionIndex.push({pointer,sha256:hash(value),sourceRefs});
 const rowRef=id=>({collection:'rows',at:rows.get(id)}),cellRef=id=>({collection:'cells',at:cells.get(id)});
 for(const key of ['version','period','scope','totalsPolicy'])add('/decisions/'+key,d[key]);
 d.rows.forEach((v,i)=>add('/decisions/rows/'+i,v,[rowRef(v.rowId)]));
 d.representations.forEach((v,i)=>add('/decisions/representations/'+i,v,[{collection:'comparisons',at:comparisons.get(v.id)}]));
 d.definitions.forEach((v,i)=>{add('/decisions/definitions/'+i,v,[rowRef(v.rowId)]);v.fields.forEach((f,j)=>add(`/decisions/definitions/${i}/fields/${j}`,f,[cellRef(v.rowId+'/'+f.field)]));});
 d.bindings.forEach((v,i)=>add('/decisions/bindings/'+i,v));
 // Bind every preparation component, including the unchanged model snapshots.
 // Typed definitions/bindings receive individual references as well.
 Object.keys(p).sort().forEach(key=>add('/preparation/'+pointerPart(key),p[key]));
 p.definitions.forEach((v,i)=>{const selected=d.definitions.find(x=>x.nativeIdentity===identity(v));add('/preparation/definitions/'+i,v,selected?[rowRef(selected.rowId)]:[]);});
 p.bindings.forEach((v,i)=>add('/preparation/bindings/'+i,v));
 const cellDiagnostics=[];evidence.expressions.forEach((e,cell)=>e.diagnostics.forEach((v,at)=>cellDiagnostics.push({cell,at,sha256:hash(v)})));
 const audit=Object.fromEntries(Object.entries(evidence.audit).filter(([,v])=>Array.isArray(v)).map(([key,value])=>[key,vector(value)]));
 return{
  version:OWN_PROGRAMME_SOURCE_PROVENANCE_VERSION,
  componentRoots:Object.fromEntries(sourceRootKeys.map(key=>{need(Object.hasOwn(evidence,key),'SOURCE_REVIEW_COMPONENT_MISSING');return[key,{pointer:'/'+pointerPart(key),sha256:hash(evidence[key])}];})),
  controlRoots:{controlRecord:hash(controls),decisions:hash(d),preparation:hash(p)},
  rows:evidence.rows.map((v,at)=>({at,sha256:hash(v),decision:rowDecisions.get(v.id)??null})),
  cells:evidence.expressions.map((v,at)=>({at,sha256:hash(v),row:rows.get(v.rowId),decision:fieldDecisions.get(fieldId(v))??null})),
  comparisons:evidence.representations.map((v,at)=>({at,sha256:hash(v),row:rows.get(v.rowId),decision:comparisonDecisions.get(comparisonId(v))??null})),
  audit,auditCoverage:vector(evidence.audit.summary.coverage),cellDiagnostics,
  context:{coverage:vector(evidence.coverage),metadataSets:vector(evidence.metadataSets),requestedAgreements:vector(evidence.requestedAgreements)},
  decisions:decisionIndex
 };
}

export function reviewOwnPayrollProgrammeSource(raw){return buildProjection(raw);}

export function verifyOwnPayrollProgrammeSourceProjection(raw){
 const keys=['evidenceText','expectedEvidencePins','expectedControlSha256','projection'];
 need(raw&&Object.getPrototypeOf(raw)===Object.prototype,'SOURCE_REVIEW_VERIFICATION_CONTRACT_INVALID');
 const descriptors=Object.getOwnPropertyDescriptors(raw);
 need(Reflect.ownKeys(raw).length===keys.length&&keys.every(key=>descriptors[key]?.enumerable&&Object.hasOwn(descriptors[key],'value')),'SOURCE_REVIEW_VERIFICATION_CONTRACT_INVALID');
 const evidenceText=descriptors.evidenceText.value,expectedPins=inert(descriptors.expectedEvidencePins.value),expectedControl=inert(descriptors.expectedControlSha256.value);
 need(typeof evidenceText==='string'&&Buffer.byteLength(evidenceText)<=OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.evidenceBytes,'SOURCE_REVIEW_EVIDENCE_LIMIT');
 need(exact(expectedPins,['sha256','bytes','version','sourceSha256','configurationSha256','companyId'])&&digest(expectedPins.sha256)&&Number.isSafeInteger(expectedPins.bytes)&&expectedPins.bytes>=0&&digest(expectedControl),'SOURCE_REVIEW_VERIFICATION_CONTRACT_INVALID');
 need(Buffer.byteLength(evidenceText)===expectedPins.bytes&&sha(evidenceText)===expectedPins.sha256,'SOURCE_REVIEW_EVIDENCE_CHANGED');
 // This is a bounded output, not a control input: its16MiB byte limit bounds
 // traversal. The existing250000node control budget remains unchanged.
 const projection=inert(descriptors.projection.value,0,new Set(),{n:0,maxNodes:OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.outputBytes,maxBytes:OWN_PROGRAMME_SOURCE_REVIEW_LIMITS.outputBytes,bytes:0});
 const controls=projection?.controlRecord;
 need(exact(controls,['version','evidenceSha256','sourcePins','decisions','preparation'])&&hash(controls)===expectedControl,'SOURCE_REVIEW_CONTROL_CHANGED');
 const expected=buildProjection({...controls,evidenceText});
 need(salarySerialized(expected.evidenceRef)===salarySerialized(expectedPins),'SOURCE_REVIEW_CONTEXT_CHANGED');
 need(expected.completeness.allControlEntriesAccounted,'SOURCE_REVIEW_PROJECTION_INCOMPLETE');
 // The same core recomputes the native result too. No supplied status, flag,
 // incident, capability, reference, result or additional member is trusted.
 need(salarySerialized(projection)===salarySerialized(expected),'SOURCE_REVIEW_PROJECTION_CHANGED');
 return freeze({version:OWN_PROGRAMME_SOURCE_PROVENANCE_VERSION,verified:true,reviewStatus:expected.status,projectionSha256:hash(expected),evidenceSha256:expectedPins.sha256,controlSha256:expectedControl,approved:false,executable:false,payrollCalculated:false,payrollPosted:false,remoteAuthorization:false});
}
