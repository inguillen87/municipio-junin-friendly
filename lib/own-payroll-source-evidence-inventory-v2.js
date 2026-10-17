// Pure configuration evidence only. Never evaluates a formula, writes data,
// selects an authoritative representation, or emits an executable programme.
import {createHash} from 'node:crypto';
import {parseScopedPrivateJson} from './private-json-body.js';
import {analyzeFormula} from '../assets/payroll-formula-linter.js';
import {parsePostfix,canonicalAst,auditInventory} from '../scripts/audit-payroll-formula-inventory.mjs';
import {salaryItems} from '../assets/native-salary-catalog-model.js';
export const OWN_SOURCE_EVIDENCE_VERSION='own-payroll-source-evidence-inventory.v2';
export const OWN_SOURCE_EVIDENCE_AGREEMENTS=Object.freeze(Array.from({length:14},(_,i)=>String(i+1)));
const LIMITS=Object.freeze({bytes:64*1024*1024,rows:50000,text:65536,expression:4096,metadataSets:8,outputBytes:128*1024*1024});
const policies=Object.freeze({
 codliq:{key:['CODI_02','CODI_27'],expressions:['FOVM_27','UNIM_27','CONM_27','FOVJ_27','UNIJ_27','CONJ_27','FOFM_27','FOFJ_27','FORMULA_PRE','FORMULA_POST'],fields:['CODI_02','CODI_27','CALC_27','SEQU_27','CODI_36','TIPO_27','CODI_13','SUMA_27','RELI_27','REAJ_27','ABRE_27','ACTI_27','ALCA_27','UNID_27','RETR_27','FOVM_27','TOTA_27','UNIM_27','CONM_27','LIQU_27','CONJ_27','FOVJ_27','UNIJ_27','ACU1_27','ACU2_27','FOFM_27','FOFJ_27','VALI_27','INDE_27','CLASS_M','CLASS_J','FORMULA_PRE','FORMULA_POST','CUENTACONTABLE']},
 auxical:{key:['CODI_01','CODI_02','ITEM_77'],expressions:['ALGV_77','ALGF_77','COND_77','NPIF_77','NPIV_77','CNPI_77'],fields:['CODI_01','CODI_02','ITEM_77','ALGV_77','QINI_77','QUIN_77','CODI_76','NULO_77','CLAS_77','VALO_77','METO_77','ALCA_77','ABRE_77','ALGF_77','COND_77','NPIF_77','NPIV_77','CNPI_77','CLASS_A']},
 concepto:{key:['CODI_27'],expressions:[],fields:['CODI_27','DETA_15','CALC_15','TIPO_15','CODI_13','RELI_15','ABRE_15','UNID_15','VALI_15','TOTA_15','TIPO']},
 calauxi:{key:['CODI_01','ITEM_77'],expressions:[],fields:['CODI_01','ITEM_77','DETA_77','ABRE_77']},
});
const postfix=new Set(['NPIV_77','NPIF_77','CNPI_77']),hooks=new Set(['FORMULA_PRE','FORMULA_POST']),pairs=[['ALGV_77','NPIV_77'],['ALGF_77','NPIF_77'],['COND_77','CNPI_77']];
const sha=s=>createHash('sha256').update(s).digest('hex');
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const code=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v);
const own=(v,k)=>Object.hasOwn(v,k),need=(ok,c)=>{if(!ok)throw Object.assign(Error(c),{code:c});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(Object.getOwnPropertyDescriptor(v,k),'value'));
const inertArray=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&d.enumerable&&own(d,'value'));
function json(text){need(typeof text==='string'&&Buffer.byteLength(text)<=LIMITS.bytes,'SOURCE_EVIDENCE_INPUT_LIMIT');try{return parseScopedPrivateJson(text,{maxDepth:16});}catch{throw Object.assign(Error('SOURCE_EVIDENCE_JSON_INVALID'),{code:'SOURCE_EVIDENCE_JSON_INVALID'});}}
function sourceAst(ast){
 if(!ast)return null;
 return Object.fromEntries(Object.entries(ast).filter(([k])=>!['value','depth','_depth'].includes(k)).map(([k,v])=>[k,v&&typeof v==='object'?sourceAst(v):v]));
}
function literals(ast,path='$',found=[]){if(!ast)return found;if(ast.type==='NumericLiteral')found.push({path,raw:ast.raw});for(const k of ['left','right','argument'])if(ast[k])literals(ast[k],path+'.'+k,found);return found;}
function differences(a,b,path='$',out=[]){if(stable(a)===stable(b))return out;if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){for(let i=0;i<a.length;i++)differences(a[i],b[i],path+'['+i+']',out);}else out.push({path,infix:a,postfix:b});return out;}
function expression(rowId,field,raw,present,columnPresent){
 const state=!columnPresent?'source_column_missing':!present?'source_value_unprovided':raw===null?'source_null':raw===''?'source_empty':hooks.has(field)?'special_routine_requires_implementation':'structural_candidate';
 const e={rowId,field,state,sourceText:present?raw:null,sourceTextSha256:present&&typeof raw==='string'?sha(raw):null,sourceValueJsonSha256:present?sha(stable(raw)):null,rawAst:null,normalizedAst:null,literals:[],dependencies:[],diagnostics:[],nativeUnit:null,referenceStage:null,roundingPolicy:null,sourcePrecisionIsNotRounding:true};
 if(present&&typeof raw==='string')e.dependencies=[...new Set([...raw.matchAll(/\b([RNIALU])\s*\[\s*([A-Za-z0-9_.-]{1,32})\s*\]/gi)].map(m=>m[1].toUpperCase()+'['+m[2]+']'))].sort();
 if(state!=='structural_candidate')return e;
 need(typeof raw==='string'&&raw.length<=LIMITS.expression,'SOURCE_EVIDENCE_EXPRESSION_LIMIT');
 try{
  if(postfix.has(field)){e.rawAst=sourceAst(parsePostfix(raw));e.normalizedAst=canonicalAst(e.rawAst);e.state='postfix_structural_only';}
  else{const p=analyzeFormula(raw);e.diagnostics=p.diagnostics.map(x=>({severity:x.severity,code:x.code,position:x.position}));if(!p.ast){e.state='infix_unresolved';return e;}e.rawAst=sourceAst(p.ast);e.normalizedAst=canonicalAst(e.rawAst);e.state='infix_structural_only';}
  e.literals=literals(e.rawAst);
 }catch(error){e.state=postfix.has(field)?'postfix_unresolved':'infix_unresolved';e.diagnostics.push({severity:'error',code:/^FORMULA_AUDIT_[A-Z_]+$/.test(error.message)?error.message:'SOURCE_EVIDENCE_AST_UNRESOLVED',position:null});}
 return e;
}
export function inventoryOwnPayrollSourceEvidenceV2(raw){
 need(exact(raw,['configurationText','companyId','metadataSets']),'SOURCE_EVIDENCE_CONTRACT_INVALID');
 const configurationText=Object.getOwnPropertyDescriptor(raw,'configurationText').value,companyId=Object.getOwnPropertyDescriptor(raw,'companyId').value,metadataInput=Object.getOwnPropertyDescriptor(raw,'metadataSets').value;
 need(code(companyId)&&companyId!=='0'&&inertArray(metadataInput)&&metadataInput.length<=LIMITS.metadataSets,'SOURCE_EVIDENCE_CONTEXT_INVALID');
 const cfg=json(configurationText);need(cfg&&cfg.payrollExecutionAllowed===false&&cfg.approved===false&&Array.isArray(cfg.allowlistedTables)&&stable([...cfg.allowlistedTables].sort())===stable(Object.keys(policies).sort())&&Array.isArray(cfg.tables)&&cfg.tables.length===4,'SOURCE_EVIDENCE_ALLOWLIST_INVALID');
 need(cfg.source&&/^[a-f0-9]{64}$/.test(cfg.source.sha256),'SOURCE_EVIDENCE_SOURCE_REQUIRED');
 const metadataSets=metadataInput.map(m=>{need(exact(m,['id','itemsText'])&&/^[a-z][a-z0-9_-]{0,63}$/.test(m.id),'SOURCE_EVIDENCE_METADATA_INVALID');const items=salaryItems(json(m.itemsText));return{id:m.id,sha256:sha(m.itemsText),items};});need(new Set(metadataSets.map(m=>m.id)).size===metadataSets.length,'SOURCE_EVIDENCE_METADATA_DUPLICATE');
 const rows=[],seenTables=new Set(),seenRows=new Set(),parsed=new Map(),representations=[],coverage=OWN_SOURCE_EVIDENCE_AGREEMENTS.map(agreementCode=>({agreementCode,conceptDefinitions:0,auxiliaryDefinitions:0,exactActiveMonthlySourceRoots:0,sourceCaseAmbiguities:0}));let cells=0;
 for(const table of cfg.tables){
  need(own(policies,table.table)&&!seenTables.has(table.table)&&Array.isArray(table.rows)&&table.rows.length===table.rowCount&&table.schema&&Array.isArray(table.schema.columns),'SOURCE_EVIDENCE_TABLE_INVALID');seenTables.add(table.table);
  const p=policies[table.table];need(table.schema.columns.every(c=>c&&typeof c.name==='string'&&typeof c.type==='string'&&c.type.length<=256&&typeof c.nullable==='boolean'),'SOURCE_EVIDENCE_COLUMNS_INVALID');const columns=new Map(table.schema.columns.map(c=>[c.name,c]));need(columns.size===table.schema.columns.length&&[...columns.keys()].every(k=>p.fields.includes(k))&&p.key.every(k=>columns.has(k)),'SOURCE_EVIDENCE_COLUMNS_INVALID');
  for(const sourceRow of table.rows){
   need(sourceRow&&Object.getPrototypeOf(sourceRow)===Object.prototype&&Object.keys(sourceRow).every(k=>p.fields.includes(k)&&columns.has(k))&&Object.values(sourceRow).every(v=>v===null||typeof v==='string'&&v.length<=LIMITS.text),'SOURCE_EVIDENCE_ROW_INVALID');need(p.key.every(k=>code(sourceRow[k])),'SOURCE_EVIDENCE_KEY_INVALID');need(p.expressions.every(k=>!own(sourceRow,k)||sourceRow[k]===null||sourceRow[k].length<=LIMITS.expression),'SOURCE_EVIDENCE_EXPRESSION_LIMIT');
   const key=Object.fromEntries(p.key.map(k=>[k,sourceRow[k]])),id=table.table+':'+p.key.map(k=>key[k]).join(':'),agreement=sourceRow.CODI_02??null;need(!seenRows.has(id),'SOURCE_EVIDENCE_ROW_DUPLICATE');seenRows.add(id);
   need(!agreement||OWN_SOURCE_EVIDENCE_AGREEMENTS.includes(agreement),'SOURCE_EVIDENCE_AGREEMENT_UNDECLARED');need(rows.length<LIMITS.rows,'SOURCE_EVIDENCE_ROW_LIMIT');
   const expressions={},structural=[];for(const field of p.expressions){const present=own(sourceRow,field),e=expression(id,field,sourceRow[field],present,columns.has(field));structural.push(e);if(present)expressions[field]={original:sourceRow[field]};cells++;}parsed.set(id,structural);
   const metadata=Object.fromEntries(Object.entries(sourceRow).filter(([k])=>!p.key.includes(k)&&!p.expressions.includes(k))),sourceMetadata={row:structuredClone(sourceRow),rowSha256:sha(stable(sourceRow)),columns:table.schema.columns.map(c=>({name:c.name,type:c.type,nullable:c.nullable})),effectiveFrom:null,effectiveUntil:null,validityNotEstablishedBySnapshot:true};
   const nativeMetadata=metadataSets.flatMap(set=>set.items.filter(m=>agreement&&m.agreementCode===agreement&&m.code===(sourceRow.CODI_27??sourceRow.ITEM_77)&&m.kind===(table.table==='auxical'?'auxiliary':'concept')).map(m=>({set:set.id,row:structuredClone(m),meaning:'metadata_only_not_rule_or_source_binding_approval',literalUnit:m.unit,operandUnit:null,resultUnit:null,quantityUnit:null,roundingPolicy:null})));
   rows.push({id,table:table.table,key,agreement,requestedOperationalScope:agreement?true:null,metadata,expressions,missingSourceColumns:[...p.expressions,...Object.keys(metadata)].filter(k=>!columns.has(k)),unprovidedSourceColumns:p.expressions.filter(k=>columns.has(k)&&!own(sourceRow,k)),effectiveFrom:null,effectiveTo:null,validityStatus:'not_established_by_snapshot',definitionSha256:sha(stable({key,metadata,expressions})),sourceMetadata,nativeMetadata});
   if(agreement){const c=coverage.find(x=>x.agreementCode===agreement);if(table.table==='codliq'){c.conceptDefinitions++;if(sourceRow.ACTI_27==='A'&&(sourceRow.LIQU_27??'').split(',').map(s=>s.trim()).includes('M'))c.exactActiveMonthlySourceRoots++;if(sourceRow.ACTI_27==='a')c.sourceCaseAmbiguities++;}if(table.table==='auxical'&&sourceRow.CODI_01===companyId)c.auxiliaryDefinitions++;}
   if(table.table==='auxical')for(const[infix,postfixField]of pairs){const a=structural.find(x=>x.field===infix),b=structural.find(x=>x.field===postfixField),available=Boolean(a.normalizedAst&&b.normalizedAst);representations.push({rowId:id,infixField:infix,postfixField,status:available?(stable(a.normalizedAst)===stable(b.normalizedAst)?'same_normalized_tree':'different_tree_requires_review'):'representation_unavailable',differences:available?differences(a.normalizedAst,b.normalizedAst):[],literalSpellingDifferent:available&&stable(a.literals.map(l=>l.raw))!==stable(b.literals.map(l=>l.raw)),selectedRuntimeField:null,precedenceProved:false});}
  }
 }
 need(coverage.every(c=>c.conceptDefinitions>0),'SOURCE_EVIDENCE_AGREEMENT_MISSING');
 const inventory={version:'payroll-formula-inventory.v1',source:{sha256:cfg.source.sha256,configurationSha256:sha(configurationText)},payrollExecutionAllowed:false,rows};
 // Canonical audit is pure; cached ASTs are never trusted by that implementation.
 const audit=auditInventory(inventory,{companyId}),expressions=[...parsed.values()].flat(),potentialRoots=coverage.reduce((n,c)=>n+c.exactActiveMonthlySourceRoots,0),agreementsById=new Map(rows.map(r=>[r.id,r.agreement])),external=new Set(expressions.flatMap(e=>e.dependencies.filter(x=>['L','N','I'].includes(x[0])).map(x=>agreementsById.get(e.rowId)+':'+x)));
 const report={version:OWN_SOURCE_EVIDENCE_VERSION,configurationSha256:sha(configurationText),sourceSha256:cfg.source.sha256,companyId,requestedAgreements:[...OWN_SOURCE_EVIDENCE_AGREEMENTS],rows,expressions,representations,audit,coverage,metadataSets:metadataSets.map(({items,...m})=>({...m,itemCount:items.length})),summary:{sourceRows:rows.length,formulaDefinitionRows:rows.filter(r=>['codliq','auxical'].includes(r.table)).length,expressionCells:cells,states:Object.fromEntries([...new Set(expressions.map(e=>e.state))].sort().map(k=>[k,expressions.filter(e=>e.state===k).length])),potentialMonthlySourceRoots:potentialRoots,representationPairs:representations.length,differentTrees:representations.filter(p=>p.status==='different_tree_requires_review').length,literalSpellingDifferent:representations.filter(p=>p.literalSpellingDifferent).length,unavailablePairs:representations.filter(p=>p.status==='representation_unavailable').length},programmeCapacity:{currentRuleLimit:1000,currentBindingLimit:1000,sourcePotentialMonthlyRoots:potentialRoots,sourcePotentialRootsAboveRuleLimit:potentialRoots>1000,sourceExternalReferenceCandidates:external.size,actualEmittedRules:0,actualEmittedBindings:0,actualRequiredProgrammeRules:null,actualRequiredProgrammeBindings:null,sourceRootsAreNotPayableRules:true,noAutomaticTruncationSplittingOrLimitIncrease:true,required:'Resolve payable/internal/quantity roles, active dates, full closures and binding reuse before measuring the actual complete programme against1000.'},unresolvedPolicies:{nativeUnitsAndRoundingNotInferred:true,ddlPrecisionIsStorageOnly:true,sourceMethodNamesAreNotExecutableAlgorithms:true,sourceActivityIsNotNativeApproval:true,emptyIsNotZero:true,missingIsNotNull:true,allBranchesRetained:true,referenceStages:null,quantityStage:null,roundingMode:null,totalsPrecision:null,sourceRepresentationChoice:null},payrollExecutionAllowed:false,programmePrepared:false,approved:false,municipalAcceptance:null};
 need(Buffer.byteLength(JSON.stringify(report))<=LIMITS.outputBytes,'SOURCE_EVIDENCE_OUTPUT_LIMIT');return report;
}
