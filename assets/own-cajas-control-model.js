import {salaryExact,salarySerialized,SALARY_UNITS,SALARY_NATURES} from './native-salary-catalog-model.js';
import {verifiedOwnReportBundle,ownReportQuery,OWN_REPORT_MAX_BYTES} from './own-payroll-report-model.js';
import {ownJurisdictionSelect} from './own-payroll-jurisdiction-model.js';
import {decimal,rational,exactAdd,exactSubtract,exactCompare,quantize} from './own-payroll-exact.js';
import {need,inspectZip,sha256} from './own-cajas-zip-core.js';
import {profiles} from './own-cajas-profiles.js';
import {readArchive,classifyRows,getCell} from './own-cajas-xml-reader.js';
function deepFreeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(deepFreeze);Object.freeze(v);}return v;}
function canonicalScope(value){
  need(salaryExact(value,['period','types','jurisdiction','unit','nature','population','conceptCodes']),'SCOPE_REQUIRED');
  const query=ownReportQuery({from:value.period,to:value.period,types:value.types});
  need(['all','42','55'].includes(value.jurisdiction)&&Object.hasOwn(SALARY_UNITS,value.unit)
    &&['all',...Object.keys(SALARY_NATURES).filter(n=>n!=='auxiliary')].includes(value.nature)
    &&value.population==='complete_closed_participations','SCOPE_REQUIRED');
  need(Array.isArray(value.conceptCodes)&&value.conceptCodes.length<=10000
    &&Reflect.ownKeys(value.conceptCodes).length===value.conceptCodes.length+1
    &&value.conceptCodes.every(code=>typeof code==='string'&&/^[0-9]{1,9}$/.test(code))
    &&new Set(value.conceptCodes).size===value.conceptCodes.length,'CONCEPT_SCOPE_REQUIRED');
  return {period:query.from,types:query.types,jurisdiction:value.jurisdiction,
    unit:value.unit,nature:value.nature,population:value.population,
    conceptCodes:[...value.conceptCodes].sort()};
}
function canonicalSelection(input,profiles){
  need(salaryExact(input,['profileId','scope','amountColumn','conceptMappings','declaredRoles']),'SELECTION_REQUIRED');
  need(typeof input.profileId==='string'&&Object.hasOwn(profiles,input.profileId),'PROFILE_REQUIRED');
  const profile=profiles[input.profileId],scope=canonicalScope(input.scope);
  need(scope.period===profile.period,'PERIOD_PROFILE_MISMATCH');
  need(typeof input.amountColumn==='string'&&Object.hasOwn(profile.amountColumns,input.amountColumn)
    &&profile.amountColumns[input.amountColumn]===scope.jurisdiction,'COLUMN_JURISDICTION_MISMATCH');
  need(Array.isArray(input.conceptMappings)&&input.conceptMappings.length<=10000,'CONCEPT_MAPPING_REQUIRED');
  const seen=new Set(),mappings=input.conceptMappings.map(item=>{
    const validRaw=typeof item?.raw==='string'&&/^[0-9]{1,9}$/.test(item.raw);
    const key=item?.kind+':'+item?.raw;
    need(salaryExact(item,['kind','raw','conceptCode'])&&['text','number'].includes(item.kind)
      &&validRaw&&(item.kind!=='number'||/^(0|[1-9][0-9]{0,8})$/.test(item.raw))
      &&typeof item.conceptCode==='string'&&/^[0-9]{1,9}$/.test(item.conceptCode)
      &&!seen.has(key),'CONCEPT_MAPPING_REQUIRED');
    seen.add(key);return {kind:item.kind,raw:item.raw,conceptCode:item.conceptCode};
  }).sort((a,b)=>(a.kind+':'+a.raw).localeCompare(b.kind+':'+b.raw));
  need(input.declaredRoles&&Object.getPrototypeOf(input.declaredRoles)===Object.prototype
    &&Object.entries(input.declaredRoles).every(([n,role])=>/^[1-9][0-9]{0,6}$/.test(n)
      &&['header','title','subtotal','total','control','blank'].includes(role)),'DECLARED_ROLES');
  return {profileId:input.profileId,scope,amountColumn:input.amountColumn,
    conceptMappings:mappings,declaredRoles:{...input.declaredRoles}};
}
const places=v=>v?.split('.')[1]?.length??0;
function sum(values){
  const known=values.filter(v=>v!==null),precision=known.reduce((n,v)=>Math.max(n,places(v)),0);
  const knownTotal=known.length?quantize(known.reduce((n,v)=>exactAdd(n,decimal(v)),rational(0n)),{precision,mode:'exact'}).amount:null;
  return {rows:values.length,knownRows:known.length,unknownRows:values.length-known.length,knownTotal,
    total:values.length&&values.length===known.length?knownTotal:null};
}
function difference(a,b){return a===null||b===null?null:quantize(exactSubtract(decimal(a),decimal(b)),
  {precision:Math.max(places(a),places(b)),mode:'exact'}).amount;}
function amount(cell){
  if(cell.kind==='formula')return {amount:null,issue:'formula_not_evaluated'};
  if(cell.kind==='blank'||cell.raw===null||cell.raw==='')return {amount:null,issue:'amount_not_reported'};
  if(!['text','number'].includes(cell.kind))return {amount:null,issue:'amount_type_not_verified'};
  try{decimal(cell.raw);return {amount:cell.raw,issue:null};}catch{return {amount:null,issue:'amount_invalid'};}
}
async function verifiedOwnConceptSource(input,scopeInput){
  need(salaryExact(input,['query','details','receipts']),'COMPLETE_OWN_BUNDLE_REQUIRED');
  need(new TextEncoder().encode(JSON.stringify(input)).length<=OWN_REPORT_MAX_BYTES,'OWN_BUNDLE_LIMIT');
  const full=structuredClone(input);
  // No jurisdiction, nature, unit or concept selection is applied before this.
  const bundle=await verifiedOwnReportBundle(full.query,full.details,full.receipts);
  const scope=canonicalScope(scopeInput);
  need(bundle.query.from===scope.period&&bundle.query.to===scope.period
    &&salarySerialized(bundle.query.types)===salarySerialized(scope.types),'OWN_SCOPE_MISMATCH');
  need(scope.conceptCodes.length>0,'CONCEPT_SCOPE_REQUIRED');
  // Availability is checked against the whole verified bundle, before every selection.
  const availableCodes=new Set(bundle.sources.flatMap(source=>source.snapshot.concepts
    .filter(row=>row.nature!=='auxiliary').map(row=>row.conceptCode)));
  need(scope.conceptCodes.every(code=>availableCodes.has(code)),'CONCEPT_SCOPE_UNAVAILABLE');
  const conceptSet=new Set(scope.conceptCodes);
  const chosen=ownJurisdictionSelect(bundle.employees,scope.jurisdiction);
  const chosenSet=new Set(chosen.map(e=>e.identity)),issues=[],map=new Map();
  for(const source of bundle.sources){
    if(!source.snapshot.populationComplete)issues.push({code:'own_partial_group_coverage'});
    for(const row of source.snapshot.concepts){
      const identity=source.snapshot.period+':'+source.snapshot.liquidationType+':'+row.contractId;
      if(!chosenSet.has(identity)||row.nature==='auxiliary'||!conceptSet.has(row.conceptCode)
        ||scope.nature!=='all'&&row.nature!==scope.nature)continue;
      // Units are read literally from the verified captured snapshot, never guessed.
      if(row.unit!==scope.unit)issues.push({code:'own_unit_mismatch',conceptCode:row.conceptCode});
      const key=row.conceptCode+':'+row.nature+':'+row.unit,entry=map.get(key)??{
        conceptCode:row.conceptCode,nature:row.nature,unit:row.unit,values:[]};
      entry.values.push(row.amount);map.set(key,entry);
    }
  }
  const concepts=[...map.values()].map(({values,...entry})=>({...entry,amount:sum(values).total,participations:values.length}))
    .sort((a,b)=>a.conceptCode<b.conceptCode?-1:a.conceptCode>b.conceptCode?1:a.nature.localeCompare(b.nature));
  if(new Set(concepts.map(c=>c.conceptCode)).size!==concepts.length)issues.push({code:'own_concept_semantics_mixed'});
  for(const code of scope.conceptCodes)if(!concepts.some(row=>row.conceptCode===code))
    issues.push({code:'own_declared_concept_absent_from_selected_scope',conceptCode:code});
  const publicSource={version:'private-cajas-own-verified-source.r4',scope,
    sourceVerified:true,sourceProof:bundle.proof,sourceHashes:bundle.sources.map(s=>s.snapshotSha256).sort(),
    counts:{scopeParticipations:bundle.employees.length,selectedParticipations:chosen.length,
      closedGroups:bundle.sources.length,concepts:concepts.length},
    concepts,issues,externalScopeVerified:false,fullyMatched:false,admission:{state:'not_admitted'}};
  return {publicSource,bundle};
}
function compareTrusted(preview,source,profile){
  need(preview.selection.conceptMappings.length>0,'EXPLICIT_MAPPING_REQUIRED');
  need(source.scope.conceptCodes.length>0,'CONCEPT_SCOPE_REQUIRED');
  need(salarySerialized(preview.selection.scope)===salarySerialized(source.scope),'SCOPE_MISMATCH');
  const sheet=preview.sheets.find(s=>s.name===preview.selectedSheet);
  need(sheet,'PREVIEW_SHEET_MISSING');
  // Derive from every real row, never caller-provided financialRows/mappingValid.
  const derived=classifyRows(sheet,profile,preview.selection);
  const dataSet=new Set(derived.financialRows),mapping=new Map(preview.selection.conceptMappings.map(m=>[m.kind+':'+m.raw,m.conceptCode]));
  const rows=sheet.rows.filter(row=>dataSet.has(row.rowNumber)).map(row=>{
    const cell=getCell(row,'B'),code=['text','number'].includes(cell.kind)?mapping.get(cell.kind+':'+cell.raw)??null:null;
    const read=amount(getCell(row,preview.selection.amountColumn));
    return {rowNumber:row.rowNumber,reference:preview.selection.amountColumn+row.rowNumber,
      conceptCode:code,sourceCodeKind:cell.kind,amount:read.amount,amountIssue:read.issue,
      role:row.role,status:'pending'};
  });
  const grouped=new Map();
  for(const row of rows)if(row.conceptCode!==null){
    const list=grouped.get(row.conceptCode)??[];list.push(row);grouped.set(row.conceptCode,list);}
  const expected=new Map(source.concepts.map(c=>[c.conceptCode,c]));
  const nativeMultiplicity=new Map();for(const c of source.concepts)nativeMultiplicity.set(c.conceptCode,(nativeMultiplicity.get(c.conceptCode)??0)+1);
  const comparisons=source.concepts.map(native=>{
    const found=grouped.get(native.conceptCode)??[],ambiguous=nativeMultiplicity.get(native.conceptCode)>1||native.unit!==source.scope.unit,observed=!ambiguous&&found.length===1?found[0].amount:null;
    const status=ambiguous?'own_semantics_unknown':!found.length?'missing':found.length>1?'duplicate'
      :observed===null?'unknown':native.amount===null?'own_unknown'
      :exactCompare(decimal(observed),decimal(native.amount))===0?'matched':'different';
    return {conceptCode:native.conceptCode,nature:native.nature,unit:native.unit,
      expected:native.amount,observed,difference:difference(observed,native.amount),
      externalRows:found.map(r=>r.rowNumber),status};
  });
  for(const row of rows){
    row.status=row.conceptCode===null?'identity_unknown':!expected.has(row.conceptCode)?'outside_selected_scope'
      :grouped.get(row.conceptCode).length>1?'duplicate'
      :comparisons.find(c=>c.conceptCode===row.conceptCode).status;
  }
  const issues=[...derived.issues,...source.issues];
  const knownMismatch=comparisons.some(c=>c.status==='different');
  const incomplete=issues.length>0||!rows.length||!source.concepts.length
    ||comparisons.some(c=>['missing','duplicate'].includes(c.status))
    ||rows.some(r=>['outside_selected_scope','duplicate'].includes(r.status))
    ||preview.warnings.some(w=>w.code==='unprofiled_sheet_preserved');
  const unknown=rows.some(r=>r.conceptCode===null||r.amount===null)
    ||comparisons.some(c=>['unknown','own_unknown','own_semantics_unknown'].includes(c.status))
    ||preview.warnings.some(w=>w.code==='external_dependencies_unresolved');
  const arithmeticMatched=!knownMismatch&&!unknown&&!incomplete
    &&comparisons.every(c=>c.status==='matched')&&rows.every(r=>r.status==='matched');
  const observed=sum(rows.map(r=>r.amount)),native=source.issues.some(i=>['own_unit_mismatch','own_concept_semantics_mixed'].includes(i.code))
    ?{rows:source.concepts.length,knownRows:0,unknownRows:source.concepts.length,knownTotal:null,total:null,issue:'own_units_or_semantics_unknown'}
    :sum(source.concepts.map(c=>c.amount));
  return deepFreeze({version:'private-cajas-browser-comparison.r4',
    status:knownMismatch?'known_mismatch':incomplete?'incomplete':unknown?'unknown':'scope_unverified',
    knownMismatch,unknown,incomplete,arithmeticMatched,comparisonBasis:'known_financial_rows_of_explicit_declared_scope',globalCoincidence:false,financialCoverageVerified:false,rows,comparisons,issues,
    totals:{expected:native,observed,difference:difference(observed.total,native.total)},
    counts:{suppliedRows:sheet.rows.length,financialRows:rows.length,controls:derived.controlRows.length,
      expectedConcepts:source.concepts.length,allSheets:preview.sheets.length},
    sourceVerified:true,externalScopeVerified:false,workbookFormatVerified:false,
    fullyMatched:false,matched:false,admission:{state:'not_admitted',
      reasons:['external_scope_not_verified','workbook_format_not_admitted',
        ...(!arithmeticMatched?['financial_coverage_not_verified']:[])]},
    workbookSha256:preview.source.sha256,ownProof:source.sourceProof,
    networkPerformed:false,persistencePerformed:false,payrollChanged:false});
}

function aborted(){return Object.assign(Error('CAJAS_REVIEW_RETIRED'),{name:'AbortError',code:'CAJAS_REVIEW_RETIRED'});}
export function createCajasControl(){
  let generation=0,previews=new WeakMap(),sources=new WeakMap();
  const current=stamp=>{if(stamp!==generation)throw aborted();};
  function retire(){generation++;previews=new WeakMap();sources=new WeakMap();}
  async function decode(input,selectionInput,{signal}={}){
    const stamp=generation,selection=canonicalSelection(structuredClone(selectionInput),profiles);
    need(input instanceof ArrayBuffer||input instanceof Uint8Array,'FILE_REQUIRED');
    const length=input.byteLength;need(length>0&&length<=8*1024*1024,'ZIP_LIMIT');
    if(signal?.aborted)throw aborted();
    const bytes=input instanceof ArrayBuffer?new Uint8Array(input.slice(0)):input.slice();
    const expected=inspectZip(bytes),digest=await sha256(bytes);current(stamp);
    const archive=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./own-cajas-zip-worker.js',import.meta.url));
      const id=crypto.randomUUID();let settled=false;
      const stop=()=>finish(reject,aborted());
      const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);
        signal?.removeEventListener('abort',stop);worker.terminate();callback(value);};
      const timer=setTimeout(()=>finish(reject,Object.assign(Error('CAJAS_WORKER_TIMEOUT'),{code:'CAJAS_WORKER_TIMEOUT'})),30000);
      signal?.addEventListener('abort',stop,{once:true});
      worker.addEventListener('error',()=>finish(reject,Object.assign(Error('CAJAS_WORKER_FAILED'),{code:'CAJAS_WORKER_FAILED'})),{once:true});
      worker.addEventListener('message',event=>{
        const payload=event.data;
        if(payload?.id!==id)return;
        if(payload.ok)finish(resolve,payload.archive);
        else finish(reject,Object.assign(Error(payload.message??'CAJAS_ZIP_INVALID'),{code:payload.code??'CAJAS_ZIP_INVALID'}));
      });
      worker.postMessage({id,bytes:bytes.buffer},[bytes.buffer]);
      if(signal?.aborted)stop();
    });
    current(stamp);if(signal?.aborted)throw aborted();
    need(archive.sourceSha256===digest&&archive.parts.length===expected.entries.length,'WORKER_SOURCE_MISMATCH');
    archive.parts.forEach((part,index)=>need(part.name===expected.entries[index].name
      &&part.bytes===expected.entries[index].expanded
      &&part.data instanceof ArrayBuffer&&part.data.byteLength===part.bytes,'WORKER_SOURCE_MISMATCH'));
    const preview=deepFreeze(readArchive(archive,selection,profiles));
    current(stamp);previews.set(preview,{profile:profiles[selection.profileId]});return preview;
  }
  async function prepareOwn(input,scope){
    const stamp=generation,value=await verifiedOwnConceptSource(input,scope);current(stamp);
    const source=deepFreeze(value.publicSource);
    sources.set(source,{bundle:deepFreeze(value.bundle)});return source;
  }
  function compare(preview,source){
    need(previews.has(preview),'PRODUCER_PREVIEW_REQUIRED');
    need(sources.has(source),'PRODUCER_OWN_SOURCE_REQUIRED');
    return compareTrusted(preview,source,previews.get(preview).profile);
  }
  return Object.freeze({decode,prepareOwn,compare,retire,
    ownsPreview:value=>previews.has(value),ownsSource:value=>sources.has(value)});
}
