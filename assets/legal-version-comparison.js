// Exact documentary comparison. Never infers enactment, repeal or legal validity.
import {verifyLegalResponse,LEGAL_KINDS} from './legal-registry-model.js';
export const COMPARISON_FIELDS=Object.freeze([
 ['title','Título o asunto'],['stage','Clase de documento'],['topics','Temas'],
 ['sourceReference','Procedencia'],['issueDate','Emisión o sanción'],
 ['publicationDate','Publicación'],['effectiveDate','Fecha de efectos declarada'],
 ['summary','Resumen documental'],
].map(([key,label])=>Object.freeze({key,label})));
export function comparisonRecord(record,id,version){
 verifyLegalResponse('detail',{version:'legal-registry.v1',record});
 if(record.id!==id||record.version!==version)throw Error('La respuesta no corresponde a la versión solicitada.');
 return record;
}
const labelKey=label=>label.normalize('NFC').trim().toLocaleLowerCase('es-AR');
export function compareLegalVersions(before,after){
 comparisonRecord(before,before?.id,before?.version);comparisonRecord(after,after?.id,after?.version);
 if(before.id!==after.id||['kind','issuer','number','year'].some(k=>before[k]!==after[k]))throw Error('Seleccioná versiones de la misma norma.');
 if(before.version>=after.version)throw Error('La versión inicial debe ser anterior a la versión final.');
 const fields=COMPARISON_FIELDS.map(({key,label})=>({key,label,before:before.metadata[key],after:after.metadata[key],changed:before.metadata[key]!==after.metadata[key]}));
 const old=new Map(before.metadata.articles.map((article,index)=>[labelKey(article.label),{article,index}]));
 const next=new Map(after.metadata.articles.map((article,index)=>[labelKey(article.label),{article,index}]));
 const keys=[...next.keys(),...[...old.keys()].filter(k=>!next.has(k))];
 const articles=keys.map(key=>{
  const a=old.get(key),b=next.get(key),changes=[];
  if(a&&b)for(const field of ['label','text','page'])if(a.article[field]!==b.article[field])changes.push(field);
  return {key,before:a?.article||null,after:b?.article||null,beforeIndex:a?.index??null,afterIndex:b?.index??null,
   status:!a?'added':!b?'removed':changes.length?'changed':'unchanged',changes};
 });
 const counts=Object.fromEntries(['added','removed','changed','unchanged'].map(k=>[k,articles.filter(a=>a.status===k).length]));
 const previousOrder=[...old.keys()].filter(k=>next.has(k)),nextOrder=[...next.keys()].filter(k=>old.has(k));
 const orderChanged=previousOrder.some((key,i)=>key!==nextOrder[i]);
 const document={contentChanged:before.document.sha256!==after.document.sha256,
  filenameChanged:before.document.filename!==after.document.filename,before:before.document,after:after.document};
 if(!document.contentChanged&&(before.document.bytes!==after.document.bytes||before.document.pages!==after.document.pages))throw Error('El documento informa una huella igual con tamaño o páginas distintos.');
 const changedFields=fields.filter(f=>f.changed).length;
 return {before,after,fields,articles,counts,document,orderChanged,changedFields,
  hasChanges:!!(changedFields||counts.added||counts.removed||counts.changed||orderChanged||document.contentChanged||document.filenameChanged)};
}
export function articleReference(record,index){
 comparisonRecord(record,record?.id,record?.version);
 if(!Number.isInteger(index)||index<0||index>=record.metadata.articles.length)throw Error('Artículo no disponible en esa versión.');
 const a=record.metadata.articles[index];
 return {text:`${LEGAL_KINDS[record.kind]} ${record.number}/${record.year}, ${record.issuer}, ${a.label}. Versión documental ${record.version}, página ${a.page}.`,
  href:`/juridica?norma=${record.id}&version=${record.version}#articulo-${index+1}`};
}
// Bounded exact diff. Small inputs use LCS; large inputs retain a shared prefix/suffix.
// Every source character survives on its own side; no normalized or invented text.
export function exactTextDiff(before,after){
 if(typeof before!=='string'||typeof after!=='string'||before.length>12000||after.length>12000)throw Error('Texto fuera del límite de comparación.');
 const split=s=>s.match(/\s+|[\p{L}\p{M}\p{N}_]+|[^\s]/gu)||[];
 const a=split(before),b=split(after),parts=[];
 const add=(kind,text)=>{if(!text)return;const last=parts.at(-1);if(last?.kind===kind)last.text+=text;else parts.push({kind,text});};
 if(before===after)return {mode:'exact',parts:before?[{kind:'same',text:before}]:[]};
 if((a.length+1)*(b.length+1)>80000){
  let start=0,endA=a.length,endB=b.length;
  while(start<endA&&start<endB&&a[start]===b[start])start++;
  while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
  add('same',a.slice(0,start).join(''));add('removed',a.slice(start,endA).join(''));add('added',b.slice(start,endB).join(''));add('same',a.slice(endA).join(''));
  return {mode:'bounded',parts};
 }
 const width=b.length+1,dp=new Uint16Array((a.length+1)*width);
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i*width+j]=a[i]===b[j]?1+dp[(i+1)*width+j+1]:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
 let i=0,j=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){add('same',a[i]);i++;j++;}else if(dp[(i+1)*width+j]>=dp[i*width+j+1])add('removed',a[i++]);else add('added',b[j++]);}
 for(;i<a.length;i++)add('removed',a[i]);for(;j<b.length;j++)add('added',b[j]);
 return {mode:'exact',parts};
}
