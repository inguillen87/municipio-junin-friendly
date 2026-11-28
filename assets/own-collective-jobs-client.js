import { salaryUuid, salaryHash } from './native-salary-catalog-model.js';

export const COLLECTIVE_JOBS_ENDPOINT = '/api/internal-own-collective-jobs';
const phases = new Set(['preparing', 'prepared', 'running', 'paused', 'complete', 'cancelled']);
const fail = message => { throw Object.assign(new Error(message), { code: 'COLLECTIVE_RESPONSE_INVALID' }); };
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 10000;

export function collectiveJobSnapshot(value, family, id = null) {
 if (!value || value.version !== 'own-collective-job.v1' || !salaryUuid(value.id) ||
     (id !== null && value.id !== id) || value.family !== family ||
     !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.period) ||
     !['propose', 'approve', 'reject'].includes(value.command) || !phases.has(value.phase) ||
     !Number.isSafeInteger(value.dispatchGeneration) || value.dispatchGeneration < 0 ||
     !count(value.total) || value.total === 0 ||
     !['prepared', 'confirmed', 'unchanged', 'completed'].every(key => count(value[key]) && value[key] <= value.total) ||
     value.confirmed > value.completed || value.unchanged > value.prepared ||
     (value.reviewHash !== null && !salaryHash(value.reviewHash)) ||
     (value.phase === 'prepared' && (value.prepared !== value.total || !salaryHash(value.reviewHash))) ||
     (value.phase === 'complete' && value.completed !== value.total)) {
  fail('No se verificó el estado completo del conjunto. Volvé a consultarlo.');
 }
 return value;
}

// Every page is tied to the same immutable review, never a visible subset.
export async function readCompleteCollectiveComparison(read, initial, family) {
 const pin = collectiveJobSnapshot(initial, family), rows = [], seen = new Set();
 if (!salaryHash(pin.reviewHash) || pin.prepared !== pin.total) fail('El conjunto todavía no terminó de prepararse.');
 let offset = 0, reason = null;
 do {
  const page = collectiveJobSnapshot(await read(offset, 200), family, pin.id);
  if (page.reviewHash !== pin.reviewHash || page.period !== pin.period || page.command !== pin.command ||
      page.total !== pin.total || page.comparisonTotal !== pin.total || !Array.isArray(page.comparisons) ||
      page.comparisons.length < 1 || page.comparisons.length > 200) fail('La comparación cambió o está incompleta. Volvé a consultarla.');
  if (typeof page.reason !== 'string' || page.reason.length < 10 || page.reason.length > 1000 ||
      (reason !== null && page.reason !== reason)) fail('No se verificó el fundamento del conjunto revisado.');
  reason = page.reason;
  for (const row of page.comparisons) {
   if (!row || !salaryUuid(row.contractId) || seen.has(row.contractId.toLowerCase()) ||
       typeof row.legajo !== 'string' || row.legajo.length < 1 || row.legajo.length > 64 ||
       !['unchanged', pin.command].includes(row.action) || typeof row.confirmed !== 'boolean' ||
       (row.before !== null && (typeof row.before !== 'object' || Array.isArray(row.before))) ||
       !row.after || typeof row.after !== 'object' || Array.isArray(row.after)) fail('La comparación repite un contrato o contiene una declaración inválida.');
   seen.add(row.contractId.toLowerCase()); rows.push(row);
  }
  offset += page.comparisons.length;
  if (offset > pin.total || (offset < pin.total && page.nextOffset !== offset) ||
      (offset === pin.total && page.nextOffset !== null)) fail('No se recibió la comparación completa del padrón.');
 } while (offset < pin.total);
 return { rows, reason, reviewHash: pin.reviewHash };
}

export function collectiveJobStatusText(job) {
 const labels = {
  preparing: `Revisando en el servidor: ${job.prepared} de ${job.total} contratos. Podés salir de esta pantalla y volver después.`,
  prepared: `Comparación preparada: ${job.total} contratos. Revisá el conjunto y confirmá para registrarlo.`,
  running: `Registrando en el servidor: ${job.completed} de ${job.total} contratos, ${job.confirmed} comprobantes. Podés cerrar esta pantalla.`,
  paused: `Conjunto pausado: ${job.confirmed} comprobantes conservados. ${collectivePauseText(job.pauseCode)}`,
  complete: `Conjunto recorrido por completo: ${job.total} contratos, ${job.confirmed} comprobantes y ${job.unchanged} sin cambios.`,
  cancelled: `Se detuvieron los pendientes. Los ${job.confirmed} comprobantes ya registrados se conservan.`
 };
 return labels[job.phase];
}

export function collectivePauseText(code) {
 if (/SESSION|FORBIDDEN|AUTHORITY|SOD/.test(code ?? '')) return 'Verificá tu acceso para continuar con la misma cuenta.';
 if (/BASE|SOURCE|POPULATION|SCOPE|PROPOSAL|DECIDED/.test(code ?? '')) return 'Cambió una propuesta, el padrón o su contexto. Volvé a revisar los pendientes.';
 return 'Podés consultar el estado y reanudar desde el último bloque confirmado.';
}
