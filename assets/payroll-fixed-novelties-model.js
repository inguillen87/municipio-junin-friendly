import { civilDate } from './civil-date.js';

export const FIXED_MAX_ROWS = 500;
export const FIXED_TYPES = Object.freeze({ monthly: 'Mensual', first_fortnight: 'Primera quincena', sac: 'SAC', vacation: 'Vacaciones', supplementary: 'Complementaria', final: 'Liquidación final', other: 'Otra' });
export function fixedCapability(bootstrap, outerCapabilities, capability) {
  const effective = new Set(bootstrap?.principal?.capabilities || []);
  if (!(outerCapabilities instanceof Set) || !['payroll.novelty.read','payroll.novelty.nominal.read'].every(cap => effective.has(cap) && outerCapabilities.has(cap))) return false;
  // The monthly bootstrap filters to novelty.*. Dedicated fixed authority must
  // come from this registry's bootstrap, while its host still gates nominal read.
  return effective.has(capability) && (['payroll.fixed.prepare','payroll.fixed.approve'].includes(capability) || outerCapabilities.has(capability));
}
const fail = () => { throw Error('No se pudo verificar el registro de novedades fijas. Volvé a consultar.'); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const safeText = (value, max, min = 1) => typeof value === 'string' && value.length >= min && value.length <= max && value === value.trim() && value === value.normalize('NFC') && !/[<>\x00-\x1f\x7f]/.test(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const code = value => typeof value === 'string' && /^(?:0|[1-9]\d{0,19})$/.test(value);
const quantity = value => value === null || typeof value === 'string' && /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value) && !/^-0(?:\.0+)?$/.test(value);
const cents = value => value === null || typeof value === 'string' && /^-?(?:0|[1-9]\d{0,17})$/.test(value) && value !== '-0';
function day(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  try { return civilDate(value); } catch { return fail(); }
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail();
  day(value.slice(0, 10)); return value;
}
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const canonical = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (left, right) => canonical(left) === canonical(right);
export function fixedPeriod(value) {
  const period = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value + '-01' : value;
  if (day(period).slice(8) !== '01') fail(); return period;
}
export function fixedMoney(centsValue) {
  if (centsValue === null) return 'Sin importe informado';
  if (!cents(centsValue)) fail();
  const n = BigInt(centsValue), absolute = n < 0n ? -n : n;
  return (n < 0n ? '−' : '') + '$ ' + (absolute / 100n).toLocaleString('es-AR') + ',' + String(absolute % 100n).padStart(2, '0');
}
export function fixedMoneyInput(centsValue) {
  if (centsValue === null) return '';
  if (!cents(centsValue)) fail();
  const n = BigInt(centsValue), absolute = n < 0n ? -n : n;
  return (n < 0n ? '-' : '') + absolute / 100n + ',' + String(absolute % 100n).padStart(2, '0');
}
export function fixedAmount(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,15})(?:[.,]\d{1,2})?$/.test(value.trim())) throw Error('Ingresá el importe sin separador de miles, con hasta dos decimales, o dejalo sin informar.');
  const raw = value.trim(), [whole, decimal = ''] = raw.replace(',', '.').replace(/^-/, '').split('.');
  if (/^-0(?:[.,]0+)?$/.test(raw)) throw Error('Usá cero sin signo negativo.');
  const result = (BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'))) * (raw.startsWith('-') ? -1n : 1n);
  if (!cents(result.toString())) throw Error('El importe supera el límite admitido.'); return result.toString();
}
export function fixedText(value, label, max = 500, min = 5, optional = false) {
  if ((value === undefined || value === null || typeof value === 'string' && !value.trim()) && optional) return null;
  if (typeof value !== 'string' || /[<>\x00-\x1f\x7f]/.test(value)) throw Error('Revisá ' + label + ': usá texto de una sola línea.');
  const normalized = value.normalize('NFC').trim();
  if (!safeText(normalized, max, min)) throw Error('Revisá ' + label + ': entre ' + min + ' y ' + max + ' caracteres.'); return normalized;
}
export function fixedForm(fields) {
  const legajo = fields.legajo?.trim(), conceptSourceId = fields.conceptSourceId?.trim(), costCenterSourceId = fields.costCenterSourceId?.trim() || null;
  if (!code(legajo)) throw Error('Ingresá un legajo exacto, sin separadores ni ceros iniciales.');
  if (!code(conceptSourceId) || costCenterSourceId !== null && !code(costCenterSourceId)) throw Error('Revisá el código del concepto y el centro de costo. No se completan automáticamente.');
  if (!Object.hasOwn(FIXED_TYPES, fields.payrollType)) throw Error('Elegí el tipo de liquidación.');
  const quantityDecimal = typeof fields.quantityDecimal === 'string' && fields.quantityDecimal.trim() ? fields.quantityDecimal.trim().replace(',', '.') : null;
  if (!quantity(quantityDecimal)) throw Error('Revisá las unidades: hasta seis decimales, sin separador de miles, o dejalas sin informar.');
  const amountCents = fixedAmount(fields.amountArs), forced = fields.forced === true;
  const forcedReason = forced ? fixedText(fields.forcedReason, 'el fundamento del modo forzado', 500, 5) : null;
  if (quantityDecimal === null && amountCents === null) throw Error('Informá las unidades o el importe. Un dato ausente no equivale a cero.');
  if (forced && amountCents === null) throw Error('El modo forzado requiere un importe explícito y fundamento.');
  let validFrom, validTo;
  try { validFrom = day(fields.validFrom); validTo = day(fields.validTo || null, true); }
  catch { throw Error('Ingresá una fecha de alta válida. El vencimiento puede quedar sin informar.'); }
  if (validTo !== null && validTo < validFrom) throw Error('El vencimiento no puede ser anterior al alta.');
  return freeze({ legajo, values: { conceptSourceId, costCenterSourceId, payrollType: fields.payrollType, quantityDecimal, amountCents, forced, forcedReason,
    legalInstrument: fixedText(fields.legalInstrument, 'el instrumento que respalda la novedad', 300), validFrom, validTo }, reason: fixedText(fields.reason, 'el motivo de la propuesta') });
}
const valueKeys = ['conceptSourceId','costCenterSourceId','payrollType','quantityDecimal','amountCents','forced','forcedReason','legalInstrument','validFrom','validTo'];
function values(value) {
  if (!exact(value, valueKeys) || !code(value.conceptSourceId) || value.costCenterSourceId !== null && !code(value.costCenterSourceId)
    || !Object.hasOwn(FIXED_TYPES, value.payrollType) || !quantity(value.quantityDecimal) || !cents(value.amountCents)
    || value.quantityDecimal === null && value.amountCents === null || typeof value.forced !== 'boolean' || value.forced && value.amountCents === null
    || (value.forced ? !safeText(value.forcedReason,500,5) : value.forcedReason !== null) || !safeText(value.legalInstrument,300,5)) fail();
  for (const key of ['forcedReason','legalInstrument']) if (value[key] !== null && value[key] !== value[key].normalize('NFC')) fail();
  day(value.validFrom); day(value.validTo,true); if (value.validTo !== null && value.validTo < value.validFrom) fail(); return {...value};
}
function subject(value) {
  if (!exact(value,['contractId','legajo','employeeName','identityToken','sourceCutoff']) || !uuid(value.contractId) || !code(value.legajo)
    || !hash(value.identityToken) || value.employeeName !== null && !safeText(value.employeeName,300)) fail();
  instant(value.sourceCutoff); return {...value};
}
function effects(value) {
  if (!exact(value,['approvalEffect','grhMutation','payrollCalculated','payrollPosted']) || value.approvalEffect !== 'control_export_only'
    || value.grhMutation !== false || value.payrollCalculated !== false || value.payrollPosted !== false) fail(); return {...value};
}
function proposal(value, recordId, recordVersion) {
  if (!exact(value,['id','recordId','version','operation','values','reason','proposedAt','proposedBy','review','canReview'])
    || !uuid(value.id) || value.recordId !== recordId || !integer(value.version,1) || value.version > recordVersion
    || !['set','annul'].includes(value.operation) || !safeText(value.reason,500,5) || !safeText(value.proposedBy,320)
    || !value.proposedBy.includes('@') || typeof value.canReview !== 'boolean') fail();
  const next = {...value, values: value.operation === 'set' ? values(value.values) : null};
  if (value.operation === 'annul' && value.values !== null) fail(); instant(value.proposedAt);
  if (value.review !== null) {
    const r=value.review;
    if (!exact(r,['decision','reason','reviewedAt','reviewedBy','version']) || !['approve','reject'].includes(r.decision)
      || !safeText(r.reason,500,5) || !safeText(r.reviewedBy,320) || !r.reviewedBy.includes('@') || r.reviewedBy.toLowerCase()===value.proposedBy.toLowerCase()
      || r.version!==value.version+1 || r.version>recordVersion || value.canReview) fail();
    instant(r.reviewedAt); next.review={...r};
  }
  return next;
}
function record(value) {
  if (!exact(value,['id','version','subject','identityCurrent','approved','pending','latest','canPropose']) || !uuid(value.id) || !integer(value.version,1)
    || typeof value.identityCurrent!=='boolean' || typeof value.canPropose!=='boolean' || !value.identityCurrent&&value.canPropose) fail();
  const next={...value,subject:subject(value.subject),latest:proposal(value.latest,value.id,value.version)};
  next.approved=value.approved===null?null:proposal(value.approved,value.id,value.version);
  next.pending=value.pending===null?null:proposal(value.pending,value.id,value.version);
  if (next.approved&&next.approved.review?.decision!=='approve' || next.pending&&(next.pending.review!==null||next.pending.id!==next.latest.id||next.canPropose)
    || next.latest.review===null && next.pending?.id!==next.latest.id || next.latest.version < (next.approved?.version??0)) fail();
  if ((next.latest.review?.version??next.latest.version)!==next.version || next.pending&&!same(next.pending,next.latest)
    || next.approved?.id===next.latest.id&&!same(next.approved,next.latest)
    || next.latest.review?.decision==='approve'&&next.approved?.id!==next.latest.id
    || !next.identityCurrent&&[next.latest,next.pending,next.approved].some(p=>p?.canReview)) fail();
  return next;
}
function envelope(payload, version, keys) {
  const d=payload?.data;if(payload?.ok!==true||!exact(d,['version',...keys])||d.version!==version) fail();return d;
}
export function fixedBootstrap(payload) {
  const d=envelope(payload,'payroll-fixed-bootstrap.v1',['principal','limits','payrollTypes','effects']),p=d.principal;
  if (!exact(p,['tenantId','membershipId','certifiedBindingId','capabilities','employmentLinked'])||!uuid(p.tenantId)||!uuid(p.membershipId)||!uuid(p.certifiedBindingId)
    ||!Array.isArray(p.capabilities)||p.capabilities.some(c=>!safeText(c,100))||new Set(p.capabilities).size!==p.capabilities.length||typeof p.employmentLinked!=='boolean'
    ||!exact(d.limits,['maxRecords','maxHistory'])||d.limits.maxRecords!==500||d.limits.maxHistory!==100
    ||!Array.isArray(d.payrollTypes)||d.payrollTypes.length!==Object.keys(FIXED_TYPES).length||new Set(d.payrollTypes).size!==d.payrollTypes.length||d.payrollTypes.some(t=>!Object.hasOwn(FIXED_TYPES,t))) fail();
  return freeze({...d,principal:{...p,capabilities:[...p.capabilities]},limits:{...d.limits},payrollTypes:[...d.payrollTypes],effects:effects(d.effects)});
}
export function fixedEmployee(payload, legajo) {
  const d=envelope(payload,'payroll-fixed-employee.v1',['subject']),next=subject(d.subject);
  if(next.legajo!==legajo)fail();return freeze(next);
}
export function fixedList(payload, periodMonth=null) {
  const d=envelope(payload,'payroll-fixed-list.v1',['periodMonth','rows','total','snapshotToken','effects']);
  if(d.periodMonth!==periodMonth||periodMonth!==null&&fixedPeriod(periodMonth)!==periodMonth||!Array.isArray(d.rows)||d.rows.length>FIXED_MAX_ROWS
    ||d.total!==d.rows.length||!hash(d.snapshotToken))fail();
  const rows=d.rows.map(record);if(new Set(rows.map(r=>r.id)).size!==rows.length)fail();
  if(periodMonth!==null&&rows.some(r=>![r.approved,r.latest].some(p=>p?.values&&fixedCoverage(p.values,periodMonth).intersects)))fail();
  return freeze({...d,rows,effects:effects(d.effects)});
}
export function fixedDetail(payload, recordId) {
  const d=envelope(payload,'payroll-fixed-detail.v1',['record','history']),r=record(d.record);
  if(r.id!==recordId||!Array.isArray(d.history)||d.history.length<1||d.history.length>100)fail();
  const history=d.history.map(p=>proposal(p,r.id,r.version)),ids=new Set(history.map(p=>p.id));
  if(ids.size!==history.length||history[0].id!==r.latest.id||r.approved&&!ids.has(r.approved.id)||r.pending&&!ids.has(r.pending.id)
    ||history.length!==Math.ceil(r.version/2)||history.some((p,i)=>p.version!==(history.length-i)*2-1||i>0&&p.review===null))fail();
  for(let i=1;i<history.length;i++)if(history[i].version>=history[i-1].version)fail();
  for(const p of [r.latest,r.approved,r.pending].filter(Boolean))if(!same(history.find(h=>h.id===p.id),p))fail();
  return freeze({...d,record:r,history});
}
export function fixedReceipt(payload, command, expected = {}) {
  const d=envelope(payload,'payroll-fixed-receipt.v1',['command','recordId','proposalId','recordVersion','duplicate']);
  if(d.command!==command||!uuid(d.recordId)||!uuid(d.proposalId)||!integer(d.recordVersion,1)||typeof d.duplicate!=='boolean'
    ||expected.recordId&&d.recordId!==expected.recordId||expected.proposalId&&d.proposalId!==expected.proposalId
    ||expected.expectedVersion!==undefined&&d.recordVersion!==expected.expectedVersion+1)fail();return freeze({...d});
}
export function fixedCoverage(value, periodMonth) {
  if(!value)return {intersects:false,partial:false,label:'Sin valores aprobados'};
  const first=fixedPeriod(periodMonth),year=Number(first.slice(0,4)),month=Number(first.slice(5,7));
  const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const intersects=value.validFrom<=end&&(value.validTo===null||value.validTo>=first);
  return {intersects,partial:intersects&&(value.validFrom>first||value.validTo!==null&&value.validTo<end),
    label:!intersects?(value.validFrom>end?'Alta posterior al período':'Vencimiento anterior al período'):
      value.validFrom>first||value.validTo!==null&&value.validTo<end?'Vigencia parcial · sin prorrateo':'Vigencia durante todo el período'};
}
export function fixedState(row) {
  if(row.approved?.operation==='annul')return 'Anulada por revisión';
  if(row.approved)return row.pending?'Aprobada · cambio pendiente':'Aprobada para control';
  return row.pending?'Propuesta pendiente':row.latest.review?.decision==='reject'?'Propuesta rechazada':'Sin versión aprobada';
}
export function fixedView(data,{search='',status='all'}={}) {
  if(typeof search!=='string'||search.length>100||!['all','approved','pending','rejected','annulled','partial'].includes(status))fail();
  const fold=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),q=fold(search.trim());
  const rows=data.rows.filter(r=>(!q||fold([r.subject.legajo,r.subject.employeeName||'',r.latest.values?.conceptSourceId||r.approved?.values?.conceptSourceId||''].join(' ')).includes(q))
    &&(status==='all'||status==='approved'&&r.approved?.operation==='set'||status==='pending'&&r.pending||status==='rejected'&&r.latest.review?.decision==='reject'
      ||status==='annulled'&&r.approved?.operation==='annul'||status==='partial'&&data.periodMonth&&fixedCoverage(r.approved?.values,data.periodMonth).partial));
  return {rows,search:search.trim(),status};
}
export function fixedExportData(payload,list) {
  const d=envelope(payload,'payroll-fixed-export.v1',['periodMonth','snapshotToken','rows','total','effects']);
  if(!list.periodMonth||d.periodMonth!==list.periodMonth||d.snapshotToken!==list.snapshotToken||!Array.isArray(d.rows)||d.rows.length>500||d.total!==d.rows.length)fail();
  const expected=list.rows.filter(r=>r.approved?.operation==='set'&&fixedCoverage(r.approved.values,list.periodMonth).intersects);
  if(d.rows.length!==expected.length||new Set(d.rows.map(r=>r.recordId)).size!==d.rows.length)fail();
  const rows=d.rows.map(r=>{
    if(!exact(r,['recordId','version','proposalId','subject','values']))fail();
    const previous=expected.find(e=>e.id===r.recordId);
    if(!previous||!previous.identityCurrent||r.version!==previous.version||r.proposalId!==previous.approved.id
      ||!same(subject(r.subject),previous.subject)||!same(values(r.values),previous.approved.values))fail();
    return {...r,subject:{...r.subject},values:{...r.values}};
  });return freeze({...d,rows,effects:effects(d.effects)});
}
export const fixedPrincipalKey = data => [data.principal.tenantId,data.principal.membershipId,data.principal.certifiedBindingId].join(':');
