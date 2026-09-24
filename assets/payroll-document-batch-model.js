// Preparation of source details, not receipt issuance, signature or payroll payment.
export const batchUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export const batchHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const batchNumber=v=>typeof v==='string'&&/^[0-9]{1,12}$/.test(v);
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>isObject(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=2000;
const text=(v,n)=>typeof v==='string'&&v.length<=n&&!/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function batchFailure(code='PAYROLL_BATCH_CONTRACT_INVALID'){throw Object.assign(new Error(code),{code});}
export function normalizeBatchQuery(q){
 const allowed=['resource','datasetId','fromNumber','toNumber','fromSector','toSector','page','limit','selectionHash'];
 if(!isObject(q)||Object.keys(q).some(k=>!allowed.includes(k))||!batchUuid(q.datasetId))batchFailure('PAYROLL_BATCH_QUERY_INVALID');
 const result={datasetId:q.datasetId.toLowerCase()};
 for(const key of ['fromNumber','toNumber','fromSector','toSector']){const v=q[key]??'';if(typeof v!=='string'||v!==''&&!batchNumber(v))batchFailure('PAYROLL_BATCH_QUERY_INVALID');result[key]=v;}
 for(const [a,b]of [['fromNumber','toNumber'],['fromSector','toSector']])if(result[a]&&result[b]&&BigInt(result[a])>BigInt(result[b]))batchFailure('PAYROLL_BATCH_RANGE_INVERTED');
 for(const [key,def,values]of [['page','1',null],['limit','25',['25','50']]]){const v=q[key]??def;if(typeof v!=='string'||!(/^[1-9]\d{0,3}$/).test(v)||values&&!values.includes(v)||key==='page'&&Number(v)>80)batchFailure('PAYROLL_BATCH_QUERY_INVALID');result[key]=Number(v);}
 result.selectionHash=q.selectionHash??null;if(result.selectionHash!==null&&!batchHash(result.selectionHash))batchFailure('PAYROLL_BATCH_QUERY_INVALID');return result;
}
export function withinBatchRange(value,from,to){return (!from&&!to)||batchNumber(value)&&(!from||BigInt(value)>=BigInt(from))&&(!to||BigInt(value)<=BigInt(to));}
export function stableBatchValue(v){if(Array.isArray(v))return '['+v.map(stableBatchValue).join(',')+']';if(isObject(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableBatchValue(v[k])).join(',')+'}';return JSON.stringify(v);}
export function verifyBatchPreview(d){
 const fields=['version','tenantId','dataset','directory','filters','selectionHash','counts','sectors','rows','pagination','groups','officialReceipt','signatureApplied','paymentDate','departmentBasis'];
 if(!exact(d,fields)||d.version!=='payroll-document-batch.v1'||!batchUuid(d.tenantId)||!batchHash(d.selectionHash)||d.officialReceipt!==false||d.signatureApplied!==false||d.paymentDate!==null||d.departmentBasis!=='certified_directory_cutoff')batchFailure();
 const p=d.dataset;if(!exact(p,['id','date','period','month','type','closureStatus','payloadHash','sourceHash','rosterHash','sourceLabel'])||!batchUuid(p.id)||!day(p.date)||!Number.isInteger(p.period)||p.period<1900||p.period>2099||!Number.isInteger(p.month)||p.month<1||p.month>12||!/^[A-Z]$/.test(p.type)||!['open','closed','unknown'].includes(p.closureStatus)||![p.payloadHash,p.sourceHash,p.rosterHash].every(batchHash)||!text(p.sourceLabel,300))batchFailure();
 if(!exact(d.directory,['snapshot','cutoff'])||!batchHash(d.directory.snapshot)||!text(d.directory.cutoff,40)||!day(d.directory.cutoff.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(d.directory.cutoff))batchFailure();
 if(!exact(d.filters,['fromNumber','toNumber','fromSector','toSector']))batchFailure();normalizeBatchQuery({...d.filters,datasetId:p.id});
 const c=d.counts;if(!exact(c,['dataset','selected','eligible','review','unclassifiedSector'])||!Object.values(c).every(count)||c.selected!==c.eligible+c.review||c.selected>c.dataset||c.unclassifiedSector>c.dataset)batchFailure();
 const pg=d.pagination;if(!exact(pg,['page','limit','total','pages'])||!Number.isInteger(pg.page)||pg.page<1||![25,50].includes(pg.limit)||pg.total!==c.selected||pg.pages!==Math.max(1,Math.ceil(pg.total/pg.limit))||pg.page>pg.pages||!Array.isArray(d.rows)||d.rows.length!==Math.max(0,Math.min(pg.limit,pg.total-(pg.page-1)*pg.limit)))batchFailure();
 const seen=new Set();for(const r of d.rows){if(!exact(r,['number','contractId','name','sectorCode','sectorLabel','state'])||!batchNumber(r.number)||seen.has(r.number)||!['ready','unmapped','ambiguous','identity_incomplete'].includes(r.state)||r.name!==null&&!text(r.name,240)||r.sectorCode!==null&&!text(r.sectorCode,40)||r.sectorLabel!==null&&!text(r.sectorLabel,240))batchFailure();seen.add(r.number);
  if(r.state==='ready'&&(!batchUuid(r.contractId)||!r.name?.trim())||r.state!=='ready'&&r.contractId!==null)batchFailure();if(!withinBatchRange(r.number,d.filters.fromNumber,d.filters.toNumber)||!withinBatchRange(r.sectorCode,d.filters.fromSector,d.filters.toSector))batchFailure();}
 if(!Array.isArray(d.sectors)||d.sectors.length>2000)batchFailure();const keys=new Set();for(const s of d.sectors){if(!exact(s,['code','label','records'])||!text(s.code,40)||!s.code||!text(s.label,240)||!count(s.records)||keys.has(s.code))batchFailure();keys.add(s.code);}if(!Array.isArray(d.groups)||d.groups.length>2001)batchFailure();const codes=new Set();let total=0,ready=0;for(const g of d.groups){if(!exact(g,['code','label','selected','eligible','review'])||g.code!==null&&!text(g.code,40)||!text(g.label,240)||![g.selected,g.eligible,g.review].every(count)||g.selected!==g.eligible+g.review||codes.has(g.code))batchFailure();codes.add(g.code);total+=g.selected;ready+=g.eligible;}if(total!==c.selected||ready!==c.eligible)batchFailure();return d;
}
