// Documentos que devolvieron las funciones nativas del candidato V5 de Root (NATIVE_V5_CANDIDATE_20261111) en una base
// desechable de PostgreSQL 18.6: captura, resultado guardado y lo que leen liquidación, cierre y recibos. Un contrato
// sintético por versión («v5» con política de emisión, «v4» sólo con total oficial). No hay datos municipales.
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('./own-payroll-native-official-pg18.json', import.meta.url), 'utf8'));
const marker = v => v !== null && typeof v === 'object' && v.$capture === true;
/** Copia nueva en cada llamada. La liquidación y el cierre llevan la misma captura con su resultado, ya repetida. */
export function nativeOfficial(version = 'v5') {
  const set = structuredClone(data[version]), replayed = () => structuredClone({ ...set.capture, saved: set.saved, replayed: true });
  set.liquidationDetail.capture = replayed();
  set.closeDetail.captures = set.closeDetail.captures.map(c => marker(c) ? replayed() : c);
  return set;
}
export const NATIVE_OFFICIAL_VERSIONS = Object.freeze(['v5', 'v4']);
export const NATIVE_OFFICIAL_SOURCE = Object.freeze({ ...data.source });
