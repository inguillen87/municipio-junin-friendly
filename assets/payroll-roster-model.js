import { civilDate, civilMonthLabel } from './civil-date.js';
import { exportSexCode, SEX_ISSUE_LABELS } from './export-sex-code.js';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const MONEY = /^-?(?:0|[1-9]\d{0,12})\.\d{2}$/;
const verified = new WeakSet();
const count = n => Number.isSafeInteger(n) && n >= 0;
const text = (v, max) => typeof v === 'string' && v.length <= max;
const nullableText = (v, max) => v === null || text(v, max);
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const digits = v => typeof v === 'string' && /^[\d .-]+$/.test(v.trim()) ? v.replace(/[ .-]/g, '') : null;
function validCuil(v) {
  if (!/^\d{11}$/.test(v || '')) return false;
  const sum = [5,4,3,2,7,6,5,4,3,2].reduce((n, w, i) => n + w * Number(v[i]), 0);
  const rest = 11 - sum % 11;
  return Number(v[10]) === (rest === 11 ? 0 : rest === 10 ? 9 : rest);
}
function cents(v) { return BigInt(v.replace('.', '')); }
function decimal(v) { const n = v < 0n ? -v : v; return (v < 0n ? '-' : '') + n / 100n + '.' + String(n % 100n).padStart(2, '0'); }
const TYPES = { M: 'Mensual / segunda quincena', O: 'Otras liquidaciones', V: 'Vacaciones', P: 'Primera quincena', S: 'Sueldo anual complementario', F: 'Liquidación final' };

export function payrollRoster(raw) {
  if (!raw || raw.version !== 'payroll-export-roster.v1' || raw.official !== false || typeof raw.found !== 'boolean') throw new Error('Respuesta de padrón inválida');
  if (!raw.found) return freeze({ found: false });
  if (!UUID.test(raw.datasetId) || !SHA.test(raw.payloadHash) || !SHA.test(raw.reportHash) || !['closed','open','unknown'].includes(raw.closureStatus)
    || !/^[A-Z]$/.test(raw.type) || !text(raw.sourceLabel, 300) || !count(raw.total) || raw.total > 2000 || !Array.isArray(raw.rows) || raw.rows.length !== raw.total) throw new Error('Padrón incompleto');
  const date = civilDate(raw.date), seen = new Set();
  const rows = raw.rows.map(r => {
    if (!r || !/^\d{1,12}$/.test(r.legajo) || seen.has(r.legajo) || !count(r.contractMatches)
      || !nullableText(r.name, 255) || !nullableText(r.dni, 30) || !nullableText(r.cuil, 30) || !nullableText(r.sex, 40)
      || !nullableText(r.identityCutoff, 60) || !nullableText(r.contractStatus, 50)
      || ![r.concept993, r.concept995].every(n => n === null || typeof n === 'string' && MONEY.test(n))) throw new Error('Fila de padrón inválida');
    seen.add(r.legajo);
    const issues = [], sex = exportSexCode(r.sex, { profile: 'art-fm' });
    const dni = digits(r.dni), cuil = digits(r.cuil);
    if (r.contractMatches !== 1) issues.push(r.contractMatches === 0 ? 'Legajo sin vínculo de origen' : 'Vínculo de legajo ambiguo');
    if (!r.name?.trim()) issues.push('Nombre no informado');
    if (!/^\d{7,9}$/.test(dni || '') || /^0+$/.test(dni || '')) issues.push('DNI pendiente de revisión');
    if (!validCuil(cuil)) issues.push('CUIL pendiente de revisión');
    if (dni && cuil && /^\d{11}$/.test(cuil) && cuil.slice(2,10) !== dni.padStart(8,'0')) issues.push('DNI y CUIL no coinciden');
    if (sex.issue) issues.push(SEX_ISSUE_LABELS[sex.issue]);
    const salary = r.concept993 !== null && r.concept995 !== null ? decimal(cents(r.concept993) + cents(r.concept995)) : null;
    return freeze({ legajo: r.legajo, name: r.name, dni, cuil, sex: sex.code, exportSex: sex.exportValue, sexIssue: sex.issue,
      identityCutoff: r.identityCutoff, contractStatus: r.contractStatus, issues,
      concept993: r.concept993, concept995: r.concept995, salary, workedDays: null });
  });
  const model = freeze({ version: raw.version, found: true, datasetId: raw.datasetId, date, type: raw.type, total: raw.total,
    sourceLabel: raw.sourceLabel, closureStatus: raw.closureStatus, reportHash: raw.reportHash, payloadHash: raw.payloadHash, rows,
    sexReady: rows.filter(r => r.exportSex !== null).length, identitiesToReview: rows.filter(r => r.issues.length).length,
    amountsReady: rows.filter(r => r.salary !== null).length, daysConfirmed: 0 });
  verified.add(model); return model;
}
export function payrollRosterDocument(model, { mode = 'identities', search = '', reviewOnly = false } = {}) {
  if (!verified.has(model) || !['identities','art-base'].includes(mode) || typeof reviewOnly !== 'boolean' || typeof search !== 'string' || search.length > 100) throw new Error('Consultá un padrón válido');
  const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const q = fold(search.trim());
  const rows = model.rows.filter(r => (!q || fold([r.legajo,r.name,r.dni,r.cuil].join(' ')).includes(q)) && (!reviewOnly || r.issues.length));
  const column = (label,type,width) => ({label,type,width});
  const columns = mode === 'identities' ? [column('Legajo','text',12),column('Persona','text',36),column('DNI','text',17),column('CUIL','text',20),column('Sexo F/M','text',13),column('Revisión','text',45)]
    : [column('Legajo','text',12),column('DNI','text',17),column('CUIL','text',20),column('Sexo F/M','text',11),column('Días trabajados','integer',16),column('Concepto 993','money',20),column('Concepto 995','money',20),column('Sueldo 993 + 995','money',22)];
  const data = rows.map(r => mode === 'identities' ? [r.legajo, r.name || 'No informado', r.dni, r.cuil, r.exportSex, r.issues.join(' · ') || 'Identificación completa']
    : [r.legajo,r.dni,r.cuil,r.exportSex,r.workedDays,r.concept993,r.concept995,r.salary]);
  return { title: mode === 'identities' ? 'Agentes de la liquidación · Identificación' : 'Base de trabajo ART · Días pendientes', columns, rows: data, totals: [],
    notes: [
      'Población: legajos de la liquidación seleccionada, no el padrón activo actual. Una liquidación no representa todas las del mes.',
      'F/M se obtiene del dato explícito del legajo. No se deduce por nombre, DNI ni CUIL. X y valores faltantes se conservan para revisión, sin convertirlos a F/M.',
      mode === 'art-base' ? 'Base de trabajo, no planilla lista para presentar. Sueldo = concepto 993 + 995. Días trabajados sin fuente validada: no se completan con 30 ni con cantidad de fichadas.' : 'Identificación desde el legajo disponible; importes desde el conjunto seleccionado. Los cortes de origen pueden ser distintos.',
      'Filtro: ' + (search.trim() || 'Sin búsqueda') + (reviewOnly ? ' · Sólo identificaciones por revisar.' : ' · Todas las identificaciones.')
    ], metadata: [['Período',civilMonthLabel(model.date)],['Tipo',TYPES[model.type] || model.type],['Estado de la fuente',({closed:'Cerrada',open:'Abierta',unknown:'No informado'})[model.closureStatus]],
      ['Fuente de importes',model.sourceLabel],['Cortes de identificación',[...new Set(rows.map(r => r.identityCutoff || 'No informado'))].join(' · ')],['SHA-256',model.reportHash],['Huella de conjunto',model.payloadHash],['Filas del filtro',rows.length],['Firma','No aplicada']],
    filename: 'municontrol_' + (mode === 'identities' ? 'agentes' : 'base_art') + '_' + model.date + '_' + model.type.toLowerCase() };
}
