import {LEGAL_KINDS,legalUuid} from './legal-registry-model.js';
// A read-only projection: exact source text, stable article positions and document version.
export function articleRecord(record){
 if(!record||!legalUuid(record.id)||!Number.isInteger(record.version)||record.version<1||record.version>1000||!Number.isInteger(record.currentVersion)||record.currentVersion<record.version||!Object.hasOwn(LEGAL_KINDS,record.kind)||typeof record.number!=='string'||!Number.isInteger(record.year)||typeof record.issuer!=='string'||typeof record.metadata?.title!=='string'||!/^[a-f0-9]{64}$/.test(record.document?.sha256)||!Number.isInteger(record.document.pages)||record.document.pages<1||record.document.pages>30||!Array.isArray(record.metadata.articles)||record.metadata.articles.length>150)throw Error('La versión documental no puede verificarse.');
 for(const a of record.metadata.articles)if(!a||typeof a.label!=='string'||!a.label.trim()||a.label.length>60||typeof a.text!=='string'||a.text.length>12000||!Number.isInteger(a.page)||a.page<1||a.page>record.document.pages)throw Error('La transcripción no corresponde a la fuente informada.');
 return record;
}
export function articleQuery(value){
 if(typeof value!=='string'||value.length>160||/[\x00-\x1f\x7f]/.test(value))throw Error('Usá una búsqueda de hasta 160 caracteres.');return value.trim();
}
// Ignore vowel accents and case but keep ñ distinct from n; never alter the quotation.
function folded(value){let text='',starts=[],ends=[];for(const m of value.matchAll(/[^\p{M}]\p{M}*|\p{M}+/gu)){
 const part=m[0].normalize('NFD').replace(/[\u0300-\u0302\u0308]/g,'').normalize('NFC').toLocaleLowerCase('es-AR');
 text+=part;for(let n=0;n<part.length;n++){starts.push(m.index);ends.push(m.index+m[0].length);}
 }return {text,starts,ends};}
export function literalArticleMatches(value,query){
 const q=articleQuery(query);if(typeof value!=='string'||value.length>12000)throw Error('Texto fuera del límite de consulta.');
 if(!q)return {count:0,ranges:[],truncated:false};const haystack=folded(value),needle=folded(q).text;
 if(!needle)return {count:0,ranges:[],truncated:false};let start=0,count=0;const ranges=[];
 for(;;){const at=haystack.text.indexOf(needle,start);if(at<0)break;count++;if(ranges.length<120)ranges.push([haystack.starts[at],haystack.ends[at+needle.length-1]]);start=at+needle.length;}
 return {count,ranges,truncated:count>ranges.length};
}
export function filterArticles(record,query){articleRecord(record);const q=articleQuery(query);return record.metadata.articles.flatMap((article,index)=>{
 const label=literalArticleMatches(article.label,q),body=literalArticleMatches(article.text,q);
 return !q||label.count||body.count?[{article,index,label,body,matches:label.count+body.count}]:[];
 });}
export function articleReference(record,index){
 articleRecord(record);if(!Number.isInteger(index)||!record.metadata.articles[index])throw Error('Artículo no disponible.');const a=record.metadata.articles[index];
 return {text:`${LEGAL_KINDS[record.kind]} ${record.number}/${record.year}, ${record.issuer}, ${a.label}. Versión documental ${record.version}, página ${a.page}.`,path:`/juridica?norma=${record.id}&version=${record.version}#articulo-${index+1}`};
}
export function selectedArticleText(record,indices){
 articleRecord(record);if(!Array.isArray(indices)||!indices.length||indices.length>30||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||!record.metadata.articles[i]))throw Error('Seleccioná entre uno y treinta artículos de esta versión.');
 const parts=['MuniControl · Selección de transcripciones para revisión',record.metadata.title,
  `${LEGAL_KINDS[record.kind]} ${record.number}/${record.year} · ${record.issuer}`,
  `Versión documental seleccionada: ${record.version}. Última versión conocida al consultar: ${record.currentVersion}.`,
  record.version<record.currentVersion?'ATENCIÓN: selección de una versión documental histórica.':'La condición de versión actual no acredita vigencia jurídica.',
  'SHA-256 del PDF fuente: '+record.document.sha256,
  'No es un dictamen, copia certificada ni comprobación de firma. Contrastá las transcripciones con el original.',''];
 for(const index of [...indices].sort((a,b)=>a-b)){const a=record.metadata.articles[index],ref=articleReference(record,index);parts.push(ref.text,a.text,'Referencia en MuniControl: '+ref.path,'');}
 return parts.join('\n');
}
export function sameArticleVersion(expected,received){
 articleRecord(expected);articleRecord(received);
 const pick=r=>({id:r.id,version:r.version,currentVersion:r.currentVersion,kind:r.kind,issuer:r.issuer,number:r.number,year:r.year,title:r.metadata.title,document:r.document,articles:r.metadata.articles});
 return JSON.stringify(pick(expected))===JSON.stringify(pick(received));
}
