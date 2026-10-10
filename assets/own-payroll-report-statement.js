import {decimal, rational, exactAdd, exactSubtract, quantize} from './own-payroll-exact.js';
import {ownClosedJurisdiction, ownJurisdictionLabel} from './own-payroll-jurisdiction-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {salarySerialized} from './native-salary-catalog-model.js';

const keys = ['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
const labels = ['Remunerativo','No remunerativo','Retenciones','Aportes patronales','Bruto','Neto'];
const empty = () => Object.fromEntries(keys.map(key => [key,rational(0n)]));
const addTotals = items => {
  const totals = empty();
  for (const {employee} of items) for (const key of keys) totals[key] = exactAdd(totals[key],decimal(employee.totals[key]));
  return totals;
};

// The caller first verifies the complete closed census with ownReportBundle.
// Original concepts and dimensions only; no current roster or legacy service.
export function ownReportStatement(chosen, sources, details, grouping) {
  const precision = chosen.reduce((n,item) => Math.max(n,item.employee.precision),0);
  const original = addTotals(chosen), concepts = empty(), selectedByGroup = new Map();
  for (const {source,employee} of chosen) {
    const ids = selectedByGroup.get(source.groupId) ?? new Set();
    ids.add(employee.contractId); selectedByGroup.set(source.groupId,ids);
  }
  for (const source of sources) for (const concept of source.snapshot.concepts) {
    if (!selectedByGroup.get(source.groupId)?.has(concept.contractId) || concept.nature === 'auxiliary') continue;
    concepts[concept.nature] = exactAdd(concepts[concept.nature],decimal(concept.amount));
  }
  concepts.gross = exactAdd(concepts.remuneration,concepts.non_remuneration);
  concepts.net = exactSubtract(concepts.gross,concepts.deduction);
  const exact = value => quantize(value,{precision,mode:'exact'}).amount;
  const reconciliation = keys.map((key,i) => [labels[i],chosen.length?exact(original[key]):null,
    chosen.length?exact(concepts[key]):null,chosen.length?exact(exactSubtract(concepts[key],original[key])):null]);
  if (chosen.length && reconciliation.some(row => decimal(row[3]).n !== 0n)) throw Error('El informe no concilia con los conceptos originales. No se generó un expediente parcial.');
  const groups = new Map();
  for (const item of chosen) {
    const e = item.employee, jurisdiction = ownJurisdictionLabel(ownClosedJurisdiction(e,item.source.snapshot.version));
    const dimension = grouping === 'agreement_department' ? `Convenio ${e.agreementCode} / repartición ${e.departmentCode}`
      : grouping === 'agreement' ? `Convenio ${e.agreementCode}` : grouping === 'department' ? `Repartición ${e.departmentCode}`
      : grouping === 'jurisdiction' ? 'Jurisdicción' : 'Todos los seleccionados';
    const id = salarySerialized([item.period,item.type,dimension,jurisdiction]);
    const group = groups.get(id) ?? {label:dimension+' / '+jurisdiction,period:item.period,type:item.type,items:[]};
    group.items.push(item); groups.set(id,group);
  }
  const rows = [...groups.values()].sort((a,b)=>a.period.localeCompare(b.period)||a.type.localeCompare(b.type)||a.label.localeCompare(b.label)).map(group => {
    const totals = addTotals(group.items), p = group.items.reduce((n,item)=>Math.max(n,item.employee.precision),0);
    return [group.period+' / '+OWN_RUN_TYPES[group.type],group.label,group.items.length,
      ...['remuneration','non_remuneration','deduction','gross','net','employer_contribution'].map(key=>quantize(totals[key],{precision:p,mode:'exact'}).amount)];
  });
  const selectedSources = sources.filter(source=>selectedByGroup.has(source.groupId));
  const partialGroups = selectedSources.filter(source=>!source.snapshot.populationComplete).length;
  const cutGroups = selectedSources.filter(source=>selectedByGroup.get(source.groupId).size!==source.snapshot.employeeCount).length;
  const missingClosures = details.filter(detail=>!detail.groups.some(group=>group.state==='closed')).length;
  return {rows,cover:{version:'own-payroll-statement.v1',
    totals:reconciliation.map(row=>[row[0],row[1]]),reconciliation,
    coverage:[['Grupos aportando al alcance',selectedSources.length],['Grupos con cierre original parcial',partialGroups],
      ['Grupos reducidos por filtros explícitos',cutGroups],['Períodos / tipos sin grupo cerrado',missingClosures]],
    status:chosen.length?'Conceptos y totales originales conciliados exactamente':'Sin participaciones para el alcance elegido; no se presume cero',
    populationNotice:partialGroups||cutGroups||missingClosures
      ? 'El alcance contiene cobertura parcial o períodos sin cierre. Este informe no certifica el cierre de toda la nómina municipal.'
      : 'La conciliación corresponde al alcance elegido y a sus fuentes cerradas. No certifica por sí sola la cobertura de toda la nómina municipal.'}};
}
