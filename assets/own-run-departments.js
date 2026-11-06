// Calcular when some active legajos have no repartición. With «Todos» the engine requires a numeric sectorCode for every
// registered contract; «Reparticiones» skips the ones outside the chosen codes (a NULL code included since migration 222).
// This lists every repartición with active people in the verified own roster. Pure: no requests, no DOM.
const key = value => String(value ?? '').trim().toUpperCase();

export function ownRunDepartmentsForAll(rows, catalogItems) {
  const sectors = (Array.isArray(catalogItems) ? catalogItems : []).filter(item => item && item.kind === 'sectors' && typeof item.code === 'string' && /^[0-9]{1,9}$/.test(item.code));
  const byLabel = new Map();
  for (const item of sectors) byLabel.set(key(item.label), [...(byLabel.get(key(item.label)) ?? []), item.code]);
  const codes = new Set(), unsectored = [], unmatched = new Set(), contracts = [];
  let covered = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'active') continue;
    const name = key(row.sector);
    if (!name) { unsectored.push(String(row.legajo)); continue; }
    if (typeof row.contractId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.contractId)) contracts.push(Object.freeze({ contractId: row.contractId, legajo: String(row.legajo), name: typeof row.name === 'string' ? row.name : null }));
    const match = byLabel.get(name);
    if (match?.length !== 1) { unmatched.add(String(row.sector).trim()); continue; }
    codes.add(match[0]); covered++;
  }
  const sorted = [...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.freeze({
    codes: Object.freeze(sorted),
    contracts: Object.freeze(contracts),
    covered,
    unsectored: Object.freeze(unsectored.sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : 1))),
    unmatched: Object.freeze([...unmatched].sort()),
    usable: contracts.length > 0,
  });
}

export function ownRunUnsectoredText(plan) {
  const list = plan.unsectored, n = list.length;
  if (!n) return '';
  const who = (n === 1 ? 'El legajo ' + list[0] + ' está activo pero no tiene' : 'Los legajos ' + list.slice(0, 8).join(', ') + (n > 8 ? ' y ' + (n - 8) + ' más' : '') + ' están activos pero no tienen') + ' repartición';
  const fix = 'Cargá su repartición en la ficha (Cambio de encuadre, con su resolución) o registrá su baja si ya no trabaja' + (n === 1 ? '' : 'n') + '.';
  if (!plan.codes.length || plan.unmatched.length) return who + ': con «Todos los legajos propios» el motor rechaza la corrida entera. ' + fix;
  return who + ': con «Todos los legajos propios» el motor rechaza la corrida entera. Calculá las ' + plan.codes.length + ' reparticiones con personal activo (' + plan.covered + ' legajos) y, en paralelo, ' + fix.charAt(0).toLowerCase() + fix.slice(1);
}
