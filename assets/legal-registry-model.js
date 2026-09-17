// Shared form validation. No legal status, permission or salary is inferred here.
export const LEGAL_KINDS=Object.freeze({ordenanza:'Ordenanza',decreto:'Decreto',resolucion:'Resolución',disposicion:'Disposición',declaracion:'Declaración'});
export const LEGAL_ISSUERS=Object.freeze({HCD:'Honorable Concejo Deliberante',EJECUTIVO:'Departamento Ejecutivo'});
export const LEGAL_MAX_FILE=2097152;
export class LegalInputError extends Error{constructor(message,field=''){super(message);this.field=field;this.name='LegalInputError';}}
export const legalUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const fail=(message,field)=>{throw new LegalInputError(message,field);};
export function exactLegalObject(value,keys){if(!value||Array.isArray(value)||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail('El formulario contiene campos no admitidos.');}
export function legalText(value,min,max,field){if(typeof value!=='string')fail('Completá este campo.',field);const s=value.normalize('NFC').trim();if(s.length<min||s.length>max||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))fail('Revisá el campo: tamaño o caracteres no admitidos.',field);return s;}
const day=(value,field)=>{const s=legalText(value,0,10,field);if(!s)return s;const d=new Date(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s||s<'1700-01-01'||s>'2200-12-31')fail('La fecha no es válida.',field);return s;};
export function normalizeLegalDraft(value){
 exactLegalObject(value,['id','expectedVersion','identity','metadata','document','reason']);const ident=value.identity,m=value.metadata;
 exactLegalObject(ident,['kind','issuer','number','year']);exactLegalObject(m,['title','summary','topics','sourceReference','stage','issueDate','publicationDate','effectiveDate','articles']);
 if(!Object.hasOwn(LEGAL_KINDS,ident.kind)||!Object.hasOwn(LEGAL_ISSUERS,ident.issuer))fail('Elegí tipo y órgano emisor.');
 const number=legalText(ident.number,1,30,'number').toUpperCase();if(!/^[A-Z0-9][A-Z0-9./-]*$/.test(number))fail('Usá un número o identificador sin espacios.','number');
 if(!Number.isInteger(ident.year)||ident.year<1700||ident.year>2200)fail('Ingresá un año de cuatro cifras.','year');
 if(value.id!==null&&!legalUuid(value.id)||!Number.isInteger(value.expectedVersion)||value.expectedVersion<0||value.expectedVersion>999||value.id===null&&value.expectedVersion!==0||value.id!==null&&value.expectedVersion<1)fail('La versión de trabajo no es válida.');
 if(!['proyecto','acto_registrado'].includes(m.stage))fail('Indicá si es un proyecto o un acto registrado.','stage');
 if(!Array.isArray(m.articles)||m.articles.length>150)fail('Se admiten hasta 150 artículos en esta etapa.');
 const labels=new Set();const articles=m.articles.map((a,i)=>{exactLegalObject(a,['label','text','page']);const label=legalText(a.label,1,60,'articleLabel'+i),text=legalText(a.text,1,12000,'articleText'+i);if(!Number.isInteger(a.page)||a.page<1||a.page>30)fail('Indicá la página del PDF para cada artículo.','articlePage'+i);if(labels.has(label.toLowerCase()))fail('Hay etiquetas de artículo repetidas.','articleLabel'+i);labels.add(label.toLowerCase());return{label,text,page:a.page};});
 const metadata={title:legalText(m.title,3,240,'title'),summary:legalText(m.summary,0,4000,'summary'),topics:legalText(m.topics,0,300,'topics'),sourceReference:legalText(m.sourceReference,3,500,'sourceReference'),stage:m.stage,issueDate:day(m.issueDate,'issueDate'),publicationDate:day(m.publicationDate,'publicationDate'),effectiveDate:day(m.effectiveDate,'effectiveDate'),articles};
 if(new TextEncoder().encode(JSON.stringify(metadata)).length>180000)fail('Los textos superan el límite de este registro.');
 const reason=legalText(value.reason,5,500,'reason');if(/[\r\n\t]/.test(reason))fail('El motivo debe ocupar una sola línea.','reason');
 if(value.document===null&&value.id===null)fail('Adjuntá el PDF fuente para registrar la norma.','pdf');
 return{id:value.id,expectedVersion:value.expectedVersion,identity:{kind:ident.kind,issuer:ident.issuer,number,year:ident.year},metadata,document:value.document,reason};
}
export const blankLegalDraft=()=>({id:null,expectedVersion:0,identity:{kind:'ordenanza',issuer:'HCD',number:'',year:new Date().getFullYear()},metadata:{title:'',summary:'',topics:'',sourceReference:'',stage:'acto_registrado',issueDate:'',publicationDate:'',effectiveDate:'',articles:[]},document:null,reason:''});

export function verifyLegalResponse(op,data){
 const invalid=()=>{throw new LegalInputError('La respuesta del registro no pudo verificarse.');};
 const count=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
 const str=(s,max)=>typeof s==='string'&&s.length<=max;
 const instant=s=>str(s,60)&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&Number.isFinite(Date.parse(s));
 if(!data||data.version!=='legal-registry.v1')invalid();
 if(op==='bootstrap'){if(typeof data.canRegister!=='boolean'||!count(data.total,5000)||!count(data.storageBytes,134217728)||data.storageLimitBytes!==134217728)invalid();}
 else if(op==='list'){
  if(!count(data.total,5000)||!count(data.page,200)||data.page<1||data.pageSize!==25||!Array.isArray(data.rows)||data.rows.length>25)invalid();
  const seen=new Set();for(const r of data.rows){if(!legalUuid(r.id)||seen.has(r.id)||!Object.hasOwn(LEGAL_KINDS,r.kind)||!Object.hasOwn(LEGAL_ISSUERS,r.issuer)||!str(r.number,30)||!count(r.year,2200)||r.year<1700||!str(r.title,240)||!r.title||!count(r.current_version,1000)||r.current_version<1||!['proyecto','acto_registrado'].includes(r.stage))invalid();seen.add(r.id);}
 }else if(op==='detail'){
  const r=data.record;if(!r||!legalUuid(r.id)||!count(r.version,1000)||r.version<1||!count(r.currentVersion,1000)||r.currentVersion<r.version||r.legalStatus!=='no_determinada'||!instant(r.recordedAt)||!str(r.recordedBy,254)||!r.document||!str(r.document.filename,180)||!count(r.document.pages,30)||r.document.pages<1||!count(r.document.bytes,LEGAL_MAX_FILE)||r.document.bytes<10||!/^[a-f0-9]{64}$/.test(r.document.sha256||''))invalid();
  normalizeLegalDraft({id:r.id,expectedVersion:1,identity:{kind:r.kind,issuer:r.issuer,number:r.number,year:r.year},metadata:r.metadata,document:null,reason:r.reason});
  if(!Array.isArray(r.history)||r.history.length!==r.currentVersion||r.metadata.articles.some(a=>a.page>r.document.pages))invalid();
  r.history.forEach((h,i)=>{if(h.version!==r.currentVersion-i||!instant(h.recordedAt)||!str(h.recordedBy,254)||!str(h.reason,500))invalid();});
 }else if(['save','attempt'].includes(op)){
  if(!legalUuid(data.id)||!count(data.recordVersion,1000)||data.recordVersion<1||typeof data.replayed!=='boolean')invalid();
 }else if(op==='download'){
  if(!str(data.contentBase64,2900000)||!count(data.bytes,LEGAL_MAX_FILE)||data.bytes<10||!/^[a-f0-9]{64}$/.test(data.sha256||''))invalid();
 }else invalid();return data;
}

// Ephemeral UI comparison only. Never a permission, review certificate or storage layer.
export function legalDraftFingerprint(draft){
 if(!draft)return '';
 return JSON.stringify([draft.id,draft.expectedVersion,
  [draft.identity.kind,draft.identity.issuer,draft.identity.number,draft.identity.year],
  [draft.metadata.title,draft.metadata.summary,draft.metadata.topics,draft.metadata.sourceReference,
   draft.metadata.stage,draft.metadata.issueDate,draft.metadata.publicationDate,draft.metadata.effectiveDate,
   draft.metadata.articles.map(a=>[a.label,a.text,a.page])],
  draft.document?[draft.document.filename,draft.document.sha256]:null,draft.reason]);
}
export function legalDraftChanged(draft,baseline){return !!draft&&legalDraftFingerprint(draft)!==baseline;}
