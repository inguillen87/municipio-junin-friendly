import {need,safePart} from './own-cajas-zip-core.js';
const M='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P='http://schemas.openxmlformats.org/package/2006/relationships';
const CT='http://schemas.openxmlformats.org/package/2006/content-types';
const nsChildren=(node,name,ns=M)=>[...node.children].filter(c=>c.namespaceURI===ns&&c.localName===name);
const one=(node,name,ns=M,required=true)=>{const found=nsChildren(node,name,ns);need(found.length<2&&(!required||found.length===1),'XML_STRUCTURE');return found[0]??null;};
const textOf=node=>node?.textContent??'';
export function reference(value){
  const match=/^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value??'');need(match,'CELL_REFERENCE');
  let index=0;for(const ch of match[1])index=index*26+ch.charCodeAt(0)-64;
  const row=Number(match[2]);need(index<=16384&&row<=1048576,'CELL_REFERENCE');
  return {column:match[1],row,index};
}
function resolvePart(base,target){
  need(typeof target==='string'&&target.length>0&&!/[\\:%?#\u0000-\u001f]/.test(target)
    &&!target.startsWith('/'),'INTERNAL_RELATIONSHIP_PROTOCOL');
  const result=base.split('/').slice(0,-1);
  for(const part of target.split('/')){if(part==='.')continue;
    if(part==='..'){need(result.length,'RELATIONSHIP_PATH');result.pop();}
    else{need(part,'RELATIONSHIP_PATH');result.push(part);}}
  return safePart(result.join('/'));
}
function parseXml(part){
  need(part.bytes<=4*1024*1024,'XML_LIMIT');
  let value;try{value=new TextDecoder('utf-8',{fatal:true}).decode(part.data);}catch{need(false,'XML_UTF8');}
  need(!/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(value),'XML_DTD_OR_ENTITY');
  need(typeof DOMParser==='function','MAIN_DOMPARSER_REQUIRED');
  const doc=new DOMParser().parseFromString(value,'application/xml');
  need(!doc.getElementsByTagName('parsererror').length&&doc.documentElement,'XML_INVALID');
  return doc;
}
function relationshipBase(name){
  if(name==='_rels/.rels')return '';
  const match=/^(.*)\/_rels\/([^/]+)\.rels$/.exec(name);
  need(match,'RELATIONSHIP_PATH');return match[1]+'/'+match[2];
}
const structural=new Set(['worksheet','workbook','sheetData','row','c','f','v','is','t','sheets','sheet','mergeCells','mergeCell']);
function rejectForeignFinancialNamespaces(doc){
  for(const node of doc.getElementsByTagName('*'))
    if(structural.has(node.localName))need(node.namespaceURI===M,'XML_FINANCIAL_NAMESPACE');
}
function stylesFrom(doc){
  const root=doc.documentElement;need(root.namespaceURI===M&&root.localName==='styleSheet','STYLE_NAMESPACE');
  const custom=new Map(),formats=one(root,'numFmts',M,false);
  for(const node of formats?nsChildren(formats,'numFmt'):[]){
    const id=Number(node.getAttribute('numFmtId'));need(Number.isInteger(id)&&!custom.has(id),'STYLE_DUPLICATE');
    custom.set(id,node.getAttribute('formatCode'));
  }
  const xfs=one(root,'cellXfs'),styles=nsChildren(xfs,'xf').map(node=>{
    const id=Number(node.getAttribute('numFmtId')??0),formatCode=custom.get(id)??null;
    const cleaned=(formatCode??'').replace(/"[^"]*"|\\.|_.|\*./g,'').replace(/\[(?!h+\]|m+\]|s+\])[^]]*\]/gi,'');
    return {numFmtId:id,formatCode,dateLike:(id>=14&&id<=22)||[27,30,36,45,46,47,50,57].includes(id)||/[ymdhs]/i.test(cleaned)};
  });
  need(styles.length>0&&styles.length<=10000,'STYLE_LIMIT');return styles;
}
function cellFrom(node,strings,styles,budget){
  const ref=node.getAttribute('r');reference(ref);
  const originalType=node.getAttribute('t')??'n',styleReference=node.getAttribute('s');
  const styleIndex=styleReference===null?0:Number(styleReference);
  need(Number.isInteger(styleIndex)&&styleIndex>=0&&styleIndex<styles.length,'STYLE_REFERENCE');
  const formula=one(node,'f',M,false),v=one(node,'v',M,false),inline=one(node,'is',M,false);
  const result={reference:ref,sourceType:originalType,styleReference,styleIndex,
    numberFormat:styles[styleIndex],kind:'blank',raw:null,
    formula:{present:!!formula},cache:{present:false,raw:null,sourceType:null},
    mergeRange:null,mergedContinuation:false};
  if(formula){
    // No formula textContent, v.textContent, external target or formula evaluation.
    result.kind='formula';result.formula={present:true,text:null,textWithheld:true,
      type:formula.getAttribute('t'),sharedIndex:formula.getAttribute('si'),
      range:formula.getAttribute('ref'),resolution:'unknown'};
    result.cache={present:!!v,sourceType:originalType,raw:null,withheld:!!v};return result;
  }
  if(!v&&!inline)return result;
  const raw=v?textOf(v):null;
  if(originalType==='s'){
    need(raw!==null&&/^(0|[1-9][0-9]*)$/.test(raw)&&Number(raw)<strings.length,'SHARED_STRING_REFERENCE');
    result.kind='text';result.raw=strings[Number(raw)];
  }else if(originalType==='inlineStr'){
    result.kind='text';result.raw=inline?[...inline.getElementsByTagNameNS(M,'t')].map(textOf).join(''):'';
  }else if(originalType==='str'){result.kind='text';result.raw=raw??'';}
  else if(originalType==='n'){result.kind=styles[styleIndex].dateLike?'date':'number';result.raw=raw;}
  else{result.kind=({b:'boolean',e:'error',d:'date'})[originalType]??'unverified';result.raw=raw;}
  need(result.raw===null||result.raw.length<=32767,'CELL_TEXT_LIMIT');
  budget.text+=result.raw?.length??0;need(budget.text<=8*1024*1024,'CELL_TEXT_LIMIT');
  return result;
}
export const getCell=(row,column)=>row.cells[column]??{reference:column+row.rowNumber,
  kind:'blank',raw:null,sourceType:'absent',styleReference:null};
function sheetFrom(doc,name,part,strings,styles,budget){
  const root=doc.documentElement;need(root.namespaceURI===M&&root.localName==='worksheet','SHEET_NAMESPACE');
  rejectForeignFinancialNamespaces(doc);
  const data=one(root,'sheetData'),rows=[];let previous=0;
  for(const node of nsChildren(data,'row')){
    const rowNumber=Number(node.getAttribute('r'));need(Number.isSafeInteger(rowNumber)&&rowNumber>previous&&rowNumber<=1048576,'ROW_ORDER');
    previous=rowNumber;const cells={};
    for(const c of nsChildren(node,'c')){
      const cell=cellFrom(c,strings,styles,budget),ref=reference(cell.reference);
      need(ref.row===rowNumber&&!Object.hasOwn(cells,ref.column),'CELL_DUPLICATE_OR_ROW');
      cells[ref.column]=cell;budget.cells++;need(budget.cells<=250000,'CELL_LIMIT');
    }
    budget.rows++;need(budget.rows<=50000,'ROW_LIMIT');
    rows.push({rowNumber,hidden:['1','true'].includes(node.getAttribute('hidden')),cells});
  }
  const mergeRoot=one(root,'mergeCells',M,false),merges=[];
  for(const node of mergeRoot?nsChildren(mergeRoot,'mergeCell'):[]){
    const range=node.getAttribute('ref'),ends=range?.split(':');need(ends?.length===2,'MERGE_REFERENCE');
    const a=reference(ends[0]),b=reference(ends[1]);
    need(a.row<=b.row&&a.index<=b.index&&(b.row-a.row+1)*(b.index-a.index+1)<=250000,'MERGE_REFERENCE');
    for(const prior of merges)need(b.row<prior.a.row||a.row>prior.b.row||b.index<prior.a.index||a.index>prior.b.index,'MERGE_OVERLAP');
    merges.push({range,a,b});
    for(const row of rows)if(row.rowNumber>=a.row&&row.rowNumber<=b.row)
      for(const cell of Object.values(row.cells)){const ref=reference(cell.reference);
        if(ref.index>=a.index&&ref.index<=b.index){cell.mergeRange=range;cell.mergedContinuation=cell.reference!==ends[0];}}
  }
  return {name,part,declaredDimension:one(root,'dimension',M,false)?.getAttribute('ref')??null,
    rows,merges:merges.map(v=>v.range),physicalCellCount:rows.reduce((n,r)=>n+Object.keys(r.cells).length,0),
    formulaCount:rows.reduce((n,r)=>n+Object.values(r.cells).filter(c=>c.kind==='formula').length,0)};
}
function isBlank(row){return Object.values(row.cells).every(c=>c.kind==='blank'||c.kind==='text'&&(c.raw===null||c.raw===''));}
export function classifyRows(sheet,profile,selection,annotate=false){
  const issues=[],financialRows=[],controlRows=[];
  for(const row of sheet.rows){
    const n=row.rowNumber,code=getCell(row,'B');
    const selectedAmount=getCell(row,selection.amountColumn);
    const potential=code.kind==='formula'||typeof code.raw==='string'&&/[0-9]/.test(code.raw)
      ||selection.conceptMappings.some(item=>item.kind===code.kind&&item.raw===code.raw)
      ||n>5&&typeof code.raw==='string'&&code.raw!==''&&selectedAmount.kind!=='blank';
    const role=n<=5?'header':n===profile.total?'total':profile.controls.includes(n)?'control'
      :profile.notes.includes(n)?'note':n>=profile.body[0]&&n<=profile.body[1]?'body':'unclassified';
    const declared=selection.declaredRoles[String(n)]??null;
    if(declared==='blank')need(isBlank(row),'EXCLUSION_NONEMPTY_BLANK');
    const conflict=potential&&(role!=='body'||declared!==null);
    const effective=conflict?'financial_role_conflict':isBlank(row)?'blank':role;
    if(conflict)issues.push({rowNumber:n,code:'financial_exclusion_not_admitted'});
    else if(declared!==null&&declared!=='blank')issues.push({rowNumber:n,code:'declared_role_not_verified'});
    if(conflict||role==='body'&&!isBlank(row))financialRows.push(n);
    else if(!isBlank(row)&&['total','control'].includes(role))controlRows.push(n);
    else if(!isBlank(row)&&role==='unclassified'){financialRows.push(n);issues.push({rowNumber:n,code:'unclassified_content'});}
    if(annotate){row.profileRole=role;row.role=effective;row.declaredRole=declared;}
  }
  need(Object.keys(selection.declaredRoles).every(n=>sheet.rows.some(r=>r.rowNumber===Number(n))),'DECLARED_ROLE_ROW_MISSING');
  return {issues,financialRows,controlRows};
}
export function readArchive(archive,selection,profiles){
  const parts=new Map(archive.parts.map(part=>[part.name,part]));need(parts.size===archive.parts.length,'ZIP_DUPLICATE_PATH');
  const docs=new Map();
  // DTD/entity checks apply to every XML part, including unselected sheets.
  for(const part of archive.parts)if(/\.(?:xml|rels)$/i.test(part.name))docs.set(part.name,parseXml(part));
  need(docs.has('[Content_Types].xml')&&docs.get('[Content_Types].xml').documentElement.namespaceURI===CT,'CONTENT_TYPES');
  let externalRelationships=0;const relationshipsByPart=new Map();
  for(const [name,doc]of docs)if(name.endsWith('.rels')){
    need(doc.documentElement.namespaceURI===P&&doc.documentElement.localName==='Relationships','RELATIONSHIP_NAMESPACE');
    const base=relationshipBase(name),rels=new Map();
    for(const node of nsChildren(doc.documentElement,'Relationship',P)){
      const id=node.getAttribute('Id');need(id&&!rels.has(id),'RELATIONSHIP_DUPLICATE');
      const external=node.getAttribute('TargetMode')==='External',type=node.getAttribute('Type')??'';
      if(external){externalRelationships++;rels.set(id,{external:true,type:type.split('/').at(-1),target:null});}
      else{const target=resolvePart(base,node.getAttribute('Target'));need(parts.has(target),'RELATIONSHIP_MISSING_PART');
        rels.set(id,{external:false,type:type.split('/').at(-1),target});}
    }
    relationshipsByPart.set(base,rels);
  }
  const rootRels=relationshipsByPart.get('');
  const office=rootRels?[...rootRels.values()].filter(r=>r.type==='officeDocument'):[];
  need(office.length===1&&!office[0].external&&office[0].target==='xl/workbook.xml','WORKBOOK_RELATIONSHIP');
  const wb=docs.get('xl/workbook.xml');need(wb&&wb.documentElement.namespaceURI===M&&wb.documentElement.localName==='workbook','WORKBOOK_NAMESPACE');
  rejectForeignFinancialNamespaces(wb);
  const styles=stylesFrom(docs.get('xl/styles.xml')??{documentElement:{}}),strings=[];
  const shared=docs.get('xl/sharedStrings.xml');
  if(shared){need(shared.documentElement.namespaceURI===M,'SHARED_STRING_NAMESPACE');
    for(const si of nsChildren(shared.documentElement,'si')){
      const value=[...si.getElementsByTagNameNS(M,'t')].map(textOf).join('');
      need(value.length<=32767&&strings.length<80000,'SHARED_STRING_LIMIT');strings.push(value);}}
  const rels=relationshipsByPart.get('xl/workbook.xml');need(rels,'WORKBOOK_RELATIONSHIPS');
  const names=new Set(),targets=new Set(),sheets=[],budget={cells:0,rows:0,text:0};
  for(const node of nsChildren(one(wb.documentElement,'sheets'),'sheet')){
    const name=node.getAttribute('name'),id=node.getAttributeNS(R,'id'),rel=rels.get(id);
    need(name&&!names.has(name)&&rel&&!rel.external&&rel.type==='worksheet','SHEET_RELATIONSHIP');
    need(/^xl\/worksheets\/[^/]+\.xml$/.test(rel.target)&&!targets.has(rel.target),'SHEET_TARGET');
    const doc=docs.get(rel.target);need(doc,'SHEET_MISSING');names.add(name);targets.add(rel.target);
    const sheet=sheetFrom(doc,name,rel.target,strings,styles,budget);
    sheet.state=node.getAttribute('state')??'visible';sheets.push(sheet);
  }
  const orphan=[...parts.keys()].filter(n=>/^xl\/worksheets\/[^/]+\.xml$/.test(n)&&!targets.has(n));
  need(!orphan.length,'ORPHAN_WORKSHEET');
  const profile=profiles[selection.profileId],sheet=sheets.find(s=>s.name===profile.sheet);need(sheet,'PROFILE_SHEET_MISSING');
  const byRow=new Map(sheet.rows.map(r=>[r.rowNumber,r]));
  for(const [ref,label]of Object.entries(profile.headers)){
    const {row,column}=reference(ref),c=getCell(byRow.get(row)??{rowNumber:row,cells:{}},column);
    need(c.kind==='text'&&c.raw===label,'PROFILE_HEADER_MISMATCH');
  }
  for(const ref of profile.formulaHeaders){
    const {row,column}=reference(ref);need(getCell(byRow.get(row)??{rowNumber:row,cells:{}},column).kind==='formula','PROFILE_HEADER_MISMATCH');
  }
  need(profile.merges.every(range=>sheet.merges.includes(range)),'PROFILE_MERGE_MISMATCH');
  const classified=classifyRows(sheet,profile,selection,true);
  const warnings=[];
  const externalLinkParts=[...parts.keys()].filter(n=>/^xl\/externalLinks\/externalLink[0-9]+\.xml$/.test(n));
  if(externalRelationships||externalLinkParts.length)warnings.push({code:'external_dependencies_unresolved',relationships:externalRelationships,parts:externalLinkParts.length});
  for(const other of sheets)if(!Object.values(profiles).some(p=>p.sheet===other.name))warnings.push({code:'unprofiled_sheet_preserved',sheet:other.name});
  return {version:'private-cajas-browser-preview.r4',source:{sha256:archive.sourceSha256,bytes:archive.compressedBytes},
    inventory:archive.parts.map(({name,bytes,compressedBytes,sha256})=>({part:name,bytes,compressedBytes,sha256})),
    sheets,selectedSheet:sheet.name,selection,financialRows:classified.financialRows,controlRows:classified.controlRows,
    mappingValid:selection.conceptMappings.length>0&&classified.issues.length===0,
    comparisonReadiness:selection.conceptMappings.length?'scope_unverified':'mapping_required',
    issues:classified.issues,warnings,
    structureScanned:true,profileHeadersMatched:true,completeFormulaEvidence:false,
    fullyMatched:false,matched:false,externalScopeVerified:false,workbookFormatVerified:false,
    admission:{state:'not_admitted',reasons:['external_scope_not_verified','workbook_format_not_admitted']},
    formulaExpressionsExposed:false,cacheLiteralsExposed:false,networkPerformed:false};
}
