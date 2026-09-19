// Agenda snapshot is scoped by the server. Filters never infer deadlines or update statuses.
import {exactFields,followupId,targetDate,followupTiming,FOLLOWUP_STATES} from './legal-followups-model.js';
import {LEGAL_KINDS,LEGAL_ISSUERS} from './legal-registry-model.js';
export const AGENDA_BUCKETS=Object.freeze({all:'Todos',overdue:'Fecha pasada',today:'Para hoy',upcoming:'Próximos',undated:'Sin fecha',done:'Resueltos',cancelled:'Cancelados'});
const bad=()=>{throw Error('No se pudo verificar la agenda de seguimientos.');};
const integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const text=(s,min,max)=>typeof s==='string'&&s.length>=min&&s.length<=max&&!/[\x00-\x1f\x7f<>]/.test(s);
const instant=s=>typeof s==='string'&&s.length<=60&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
export function verifyAgenda(data){
 exactFields(data,['version','today','timezone','observedAt','canManage','limit','total','rows','revision']);
 if(data.version!=='legal-followup-agenda.v1'||data.timezone!=='America/Argentina/Mendoza'||!instant(data.observedAt)||typeof data.canManage!=='boolean'||data.limit!==1000||!integer(data.total,0,1000)||!Array.isArray(data.rows)||data.rows.length!==data.total||!(/^[a-f0-9]{64}$/).test(data.revision))bad();
 targetDate(data.today);const ids=new Set();let previous='';
 for(const r of data.rows){
  exactFields(r,['id','normId','normVersion','currentNormVersion','version','title','dueDate','status','recordedAt','norm']);
  exactFields(r.norm,['kind','number','year','issuer','title']);
  if(!followupId(r.id)||ids.has(r.id)||r.id<=previous||!followupId(r.normId)||!integer(r.normVersion,1,1000)||!integer(r.currentNormVersion,r.normVersion,1000)||!integer(r.version,1,100)||!text(r.title,3,160)||!instant(r.recordedAt)||!Object.hasOwn(FOLLOWUP_STATES,r.status))bad();
  if(!Object.hasOwn(LEGAL_KINDS,r.norm.kind)||!Object.hasOwn(LEGAL_ISSUERS,r.norm.issuer)||!text(r.norm.number,1,30)||!/^[A-Z0-9][A-Z0-9./-]*$/.test(r.norm.number)||!integer(r.norm.year,1700,2200)||!text(r.norm.title,3,240))bad();
  targetDate(r.dueDate,true);ids.add(r.id);previous=r.id;
 }
 return data;
}
export function agendaFilters(value={}){
 const {q='',bucket='all',historicalOnly=false}=value;
 if(Object.keys(value).some(k=>!['q','bucket','historicalOnly'].includes(k))||typeof q!=='string'||q.length>120||/[\x00-\x1f\x7f]/.test(q)||!Object.hasOwn(AGENDA_BUCKETS,bucket)||typeof historicalOnly!=='boolean')bad();
 return {q:q.trim(),bucket,historicalOnly};
}
const folded=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const agendaBucket=(r,today)=>r.status==='open'?followupTiming(r,today):r.status;
const rank={overdue:0,today:1,upcoming:2,undated:3,done:4,cancelled:5};
export function agendaView(data,options={},page=1){
 verifyAgenda(data);const filters=agendaFilters(options);if(!integer(page,1,40))bad();
 const query=folded(filters.q),base=data.rows.filter(r=>(!filters.historicalOnly||r.normVersion<r.currentNormVersion)&&(!query||folded([r.title,r.norm.title,LEGAL_KINDS[r.norm.kind],r.norm.number,r.norm.year,r.norm.issuer].join(' ')).includes(query)));
 const counts=Object.fromEntries(Object.keys(AGENDA_BUCKETS).map(k=>[k,k==='all'?base.length:0]));
 for(const r of base)counts[agendaBucket(r,data.today)]++;
 const all=base.filter(r=>filters.bucket==='all'||agendaBucket(r,data.today)===filters.bucket).sort((a,b)=>{
  const ak=agendaBucket(a,data.today),bk=agendaBucket(b,data.today);if(rank[ak]!==rank[bk])return rank[ak]-rank[bk];
  const keyA=a.status==='open'?a.dueDate:a.recordedAt,keyB=b.status==='open'?b.dueDate:b.recordedAt;
  if(keyA!==keyB)return (keyA<keyB?-1:1)*(a.status==='open'?1:-1);return a.id<b.id?-1:1;
 });
 const pages=Math.max(1,Math.ceil(all.length/25)),current=Math.min(page,pages);
 return {filters,counts,all,rows:all.slice((current-1)*25,current*25),total:all.length,page:current,pages,datasetTotal:data.total};
}
export function agendaLink(r){if(!followupId(r?.id)||!followupId(r.normId)||!integer(r.normVersion,1,1000))bad();return '/internal-legal-followups.html?'+new URLSearchParams({norma:r.normId,version:String(r.normVersion),seguimiento:r.id});}
export function sameAgenda(a,b){verifyAgenda(a);verifyAgenda(b);return a.revision===b.revision&&a.today===b.today&&a.canManage===b.canManage&&JSON.stringify(a.rows)===JSON.stringify(b.rows);}
const csvCell=value=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^\d{16,}$/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function agendaCsv(data,options={}){
 const view=agendaView(data,options),f=view.filters;
 const fields=['Seguimiento','Estado','Fecha objetivo interna','Norma','Título de norma de referencia','Versión de norma','Versión actual','Revisión del seguimiento','Referencia interna','Fecha de referencia Mendoza','Consulta UTC','Filtro texto','Categoría','Sólo referencias históricas','Filas exportadas','Total municipal','Alcance'];
 const scope='Filtro completo de la agenda interna. No acredita vigencia, plazo legal, notificación ni aprobación.';
 const rows=view.all.map(r=>[r.title,FOLLOWUP_STATES[r.status],r.dueDate,`${LEGAL_KINDS[r.norm.kind]} ${r.norm.number}/${r.norm.year} · ${r.norm.issuer}`,r.norm.title,r.normVersion,r.currentNormVersion,r.version,agendaLink(r),data.today,data.observedAt,f.q,AGENDA_BUCKETS[f.bucket],f.historicalOnly?'Sí':'No',view.total,data.total,scope]);
 return '\uFEFF'+[fields,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
