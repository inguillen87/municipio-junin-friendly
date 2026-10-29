import {civilDate} from './civil-date.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,sha=/^[a-f0-9]{64}$/;
const safeCount=n=>Number.isSafeInteger(n)&&n>=0;
// Labels transcribed from Noelia's GRH report form (module 8, pp. 4 and 9).
// Presentation only: these do not change the governed canonical payroll mapping.
export function sourceReportTypeLabel(code) {
 return ({F:'Final',M:'Mes',O:'Otros conceptos',P:'Primera quincena',S:'SAC',V:'Vacaciones'})[code] || 'Tipo de origen '+code;
}
export function sourceReportCatalog(raw, {month='all',type='all'}={}) {
 const catalog=payrollSourceReport(raw);
 if(catalog.mode!=='catalog')throw Error('Consultá las liquidaciones disponibles');
 if(month!=='all'&&(!/^\d{4}-\d{2}$/.test(month)||civilDate(month+'-01').slice(0,7)!==month))throw Error('Mes inválido');
 if(type!=='all'&&!/^[A-Z]$/.test(type))throw Error('Tipo inválido');
 return {
  months:[...new Set(catalog.items.map(item=>civilDate(item.date).slice(0,7)))].sort().reverse(),
  types:[...new Set(catalog.items.map(item=>item.type))].sort(),
  items:catalog.items.filter(item=>(month==='all'||civilDate(item.date).slice(0,7)===month)&&(type==='all'||item.type===type)),
  total:catalog.total,truncated:catalog.truncated,
 };
}
export function payrollSourceReport(data){
 if(data?.version!=='payroll-source-report.v1'||data.official!==false)throw Error('Respuesta de reportes inválida');
 if(data.mode==='catalog'){
  if(!Array.isArray(data.items)||data.items.length>240||!safeCount(data.total)||typeof data.truncated!=='boolean'||(!data.truncated&&data.total!==data.items.length))throw Error('Catálogo incompleto');
  const seen=new Set();for(const x of data.items){if(!uuid.test(x.datasetId)||seen.has(x.datasetId)||!sha.test(x.payloadHash)||!['closed','open','unknown'].includes(x.closureStatus)||!safeCount(x.statementCount)||x.statementCount<1||!safeCount(x.lineCount)||! /^[A-Z]$/.test(x.type)||typeof x.sourceLabel!=='string'||x.sourceLabel.length>240)throw Error('Liquidación inválida');civilDate(x.date);seen.add(x.datasetId)}return data;
 }
 if(data.mode!=='report'||typeof data.found!=='boolean')throw Error('Reporte inválido');if(!data.found)return data;
 if(!uuid.test(data.datasetId)||!sha.test(data.reportHash)||!sha.test(data.payloadHash)||!['closed','open','unknown'].includes(data.closureStatus)||!safeCount(data.statementCount)||data.statementCount<1||!safeCount(data.lineCount)||!Array.isArray(data.rows)||data.rows.length>1000||! /^[A-Z]$/.test(data.type)||typeof data.sourceLabel!=='string'||data.sourceLabel.length>240)throw Error('Detalle inválido');civilDate(data.date);
 let n=0;const codes=new Set();for(const row of data.rows){if(!/^\d{1,6}$/.test(row.code)||codes.has(row.code)||typeof row.description!=='string'||!row.description.trim()||row.description.length>240||!safeCount(row.sourceRows)||row.sourceRows>data.statementCount||!safeCount(row.missingAmounts)||row.missingAmounts>row.sourceRows||!/^-?\d{1,13}\.\d{2}$/.test(row.amount??'')&&row.amount!==null||row.missingAmounts>0&&row.amount!==null||row.missingAmounts===0&&row.amount===null)throw Error('Concepto inválido');codes.add(row.code);n+=row.sourceRows}if(n!==data.lineCount)throw Error('El detalle no está completo');return data;
}
export function sourceReportDocument(raw,filter={}){
 const d=payrollSourceReport(raw);if(d.mode!=='report'||!d.found)throw Error('Consultá una liquidación');const group=filter.group||'all',q=String(filter.search||'').trim();if(!['all','discounts','contributions','totals'].includes(group)||q.length>100)throw Error('Filtro inválido');
 const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const category=r=>Number(r.code)>=990&&Number(r.code)<=999?'Total de control':r.totalGroup==='996'?'Descuento':r.totalGroup==='990'?'Aporte patronal':r.totalGroup==='995'?'Asignación familiar':r.totalGroup==='994'?'Haber no remunerativo':r.totalGroup==='993'?'Haber remunerativo':'Concepto de origen';
 const rows=d.rows.filter(r=>(group==='all'||group==='discounts'&&r.totalGroup==='996'&&Number(r.code)<990||group==='contributions'&&['701','703'].includes(r.code)||group==='totals'&&Number(r.code)>=990&&Number(r.code)<=999)&&(!q||fold(r.code+' '+r.description).includes(fold(q))));
 return{salaryCost:sourceSalaryCost(d),layout:'compact-concepts.v1',title:'Conceptos de liquidación',columns:[{label:'Código',type:'text',width:11},{label:'Descripción',type:'text',width:48},{label:'Categoría',type:'text',width:25},{label:'Legajos con concepto',type:'integer',width:23},{label:'Importe informado',type:'money',width:24}],rows:rows.map(r=>[r.code,r.description,category(r),r.sourceRows,r.amount]),totals:[],notes:['Conceptos conservados en MuniControl. No es un cálculo nuevo, archivo de pago ni presentación fiscal.','Filtro: '+({all:'Todos',discounts:'Descuentos',contributions:'Aportes 701 y 703',totals:'Totalizadores'})[group]+(q?' · '+q:'')+'. No se suman totalizadores otra vez. La ausencia de un concepto no se presume importe cero.'],metadata:[['Fecha de liquidación',civilDate(d.date)],['Tipo',sourceReportTypeLabel(d.type)+' ('+d.type+')'],['Estado',({closed:'Cierre informado por la fuente',open:'Abierta / preliquidación',unknown:'Cierre no informado'})[d.closureStatus]],['Fuente',d.sourceLabel],['Legajos de la corrida',d.statementCount],['SHA-256',d.reportHash],['Huella de conjunto',d.payloadHash],['Filas del filtro',rows.length]],filename:'municontrol_conceptos_'+d.date+'_'+d.type.toLowerCase()};
}


// Directiva de Noelia: 993 + 994 + 995 + 701 + 703. The filter never changes its scope.
export const SALARY_COST_CODES = Object.freeze(['993', '994', '995', '701', '703']);
const cents = value => value === null ? null : BigInt(value.replace('.', ''));
const decimal = value => value === null ? null : `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
export function sourceSalaryCost(raw) {
  const d = payrollSourceReport(raw);
  if (d.mode !== 'report' || !d.found) throw Error('Consultá una liquidación');
  const byCode = new Map(d.rows.map(row => [row.code, row]));
  const amount = code => byCode.has(code) ? cents(byCode.get(code).amount) : null;
  const sum = codes => {
    const values = codes.map(amount);
    return values.some(v => v === null) ? null : values.reduce((a, b) => a + b, 0n);
  };
  const difference = (a, b) => a === null || b === null ? null : a - b;
  const earnings = sum(['993', '994', '995']);
  const contributions = sum(['701', '703']);
  const netCalculated = difference(earnings, amount('996'));
  return {
    version: 'salary-cost.v1', scope: 'complete-dataset',
    formula: '993 + 994 + 995 + 701 + 703',
    amount: decimal(sum(SALARY_COST_CODES)),
    earnings: decimal(earnings), contributions: decimal(contributions),
    components: SALARY_COST_CODES.map(code => ({
      code, description: byCode.get(code)?.description ?? 'Concepto no incluido en la fuente',
      amount: byCode.get(code)?.amount ?? null,
      sourceRows: byCode.get(code)?.sourceRows ?? null,
      missingAmounts: byCode.get(code)?.missingAmounts ?? null,
    })),
    missingCodes: SALARY_COST_CODES.filter(code => amount(code) === null),
    controls: {
      contributionsReported: decimal(amount('990')),
      contributionsDifference: decimal(difference(amount('990'), contributions)),
      withholdings: decimal(amount('996')), netCalculated: decimal(netCalculated),
      netReported: decimal(amount('999')),
      netDifference: decimal(difference(amount('999'), netCalculated)),
    },
    official: false, payrollModified: false,
  };
}

export function formatSalaryAmount(value) {
  if (value === null) return 'No calculable';
  if (typeof value !== 'string' || !/^-?\d{1,14}\.\d{2}$/.test(value)) throw Error('Importe inválido');
  const [whole, fraction] = value.replace('-', '').split('.');
  return '$ ' + (value.startsWith('-') ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction;
}

// Source-component statistics over a complete, validated report. These are sums of original
// classified concepts, not a new payroll calculation or a change to conserved totalizers.
export const SOURCE_CONCEPT_STATISTICS_GROUPS = Object.freeze(['993', '994', '995', '990', '996']);
const sourceStatisticsLabels = Object.freeze({
  '993': 'Haberes remunerativos', '994': 'Haberes no remunerativos',
  '995': 'Asignaciones familiares', '990': 'Contribuciones patronales', '996': 'Retenciones',
});
const sourceStatisticsControlCode = code => {
  const numericCode = Number(code); // Code identity only; monetary values never pass through Number.
  return numericCode >= 990 && numericCode <= 999;
};

export function sourceConceptStatistics(raw) {
  const d = payrollSourceReport(raw);
  if (d.mode !== 'report' || !d.found) throw Error('Consultá una liquidación');
  const byCode = new Map(d.rows.map(row => [row.code, row]));
  const classified = Object.fromEntries(SOURCE_CONCEPT_STATISTICS_GROUPS.map(code => [code, []]));
  const unclassifiedCodes = [];
  const counts = {
    sourceConceptCount: d.rows.length, sourceOccurrences: d.lineCount, datasetStatementCount: d.statementCount,
    classifiedConceptCount: 0, classifiedOccurrences: 0,
    unclassifiedConceptCount: 0, unclassifiedOccurrences: 0,
    totalizerConceptCount: 0, totalizerOccurrences: 0,
  };
  for (const row of d.rows) {
    if (sourceStatisticsControlCode(row.code)) {
      counts.totalizerConceptCount++; counts.totalizerOccurrences += row.sourceRows;
    } else if (typeof row.totalGroup === 'string' && SOURCE_CONCEPT_STATISTICS_GROUPS.includes(row.totalGroup)) {
      classified[row.totalGroup].push(row);
      counts.classifiedConceptCount++; counts.classifiedOccurrences += row.sourceRows;
    } else {
      unclassifiedCodes.push(row.code);
      counts.unclassifiedConceptCount++; counts.unclassifiedOccurrences += row.sourceRows;
    }
  }
  const stored = code => {
    const row = byCode.get(code);
    return { code, present: Boolean(row), amount: row?.amount ?? null,
      occurrences: row?.sourceRows ?? null, missingAmounts: row?.missingAmounts ?? null };
  };
  const completeStored = item => item.present && item.missingAmounts === 0 ? cents(item.amount) : null;
  const difference = (left, right) => left === null || right === null ? null : left - right;
  const amounts = {};
  const groups = Object.fromEntries(SOURCE_CONCEPT_STATISTICS_GROUPS.map(code => {
    const rows = classified[code], missingAmounts = rows.reduce((sum, row) => sum + row.missingAmounts, 0);
    const status = !rows.length ? 'missing' : missingAmounts || rows.some(row => row.amount === null) ? 'incomplete' : 'available';
    const value = status === 'available' ? rows.reduce((sum, row) => sum + cents(row.amount), 0n) : null;
    amounts[code] = value;
    const totalizer = stored(code);
    return [code, { code, label: sourceStatisticsLabels[code], status, amount: decimal(value),
      conceptCount: rows.length, occurrences: rows.reduce((sum, row) => sum + row.sourceRows, 0), missingAmounts,
      codes: rows.map(row => row.code).sort(), storedTotalizer: totalizer,
      difference: decimal(difference(value, completeStored(totalizer))) }];
  }));
  const sum = codes => codes.some(code => amounts[code] === null) ? null : codes.reduce((value, code) => value + amounts[code], 0n);
  const gross = sum(['993', '994', '995']);
  const cost = gross === null || amounts['990'] === null ? null : gross + amounts['990'];
  const net = difference(gross, amounts['996']);
  const storedNet = stored('999');
  return {
    version: 'source-concept-statistics.v1', scope: 'complete-dataset', basis: 'classified-source-components',
    groupOrder: [...SOURCE_CONCEPT_STATISTICS_GROUPS], groups, counts, unclassifiedCodes: unclassifiedCodes.sort(),
    totals: { gross: decimal(gross), contributions: decimal(amounts['990']), withholdings: decimal(amounts['996']),
      cost: decimal(cost), net: decimal(net), storedNet: storedNet.amount,
      netDifference: decimal(difference(net, completeStored(storedNet))) },
    official: false, payrollModified: false, individualReconciliationProven: false,
  };
}

// Exact presentation with up to 96 integer digits. Input is a decimal string, never a JS
// number. It can therefore format aggregate values beyond Number.MAX_SAFE_INTEGER cents.
export function safeCurrencyExact(value, { signed = false } = {}) {
  if (value === null) return 'No informado';
  if (typeof signed !== 'boolean' || typeof value !== 'string' || !/^-?\d{1,96}\.\d{2}$/.test(value)) throw Error('Importe exacto inválido');
  const negative = value.startsWith('-');
  const [rawWhole, fraction] = (negative ? value.slice(1) : value).split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  const zero = whole === '0' && fraction === '00';
  const sign = zero ? '' : negative ? '-' : signed ? '+' : '';
  return '$ ' + sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction;
}

export function sourceConceptStatisticsDocument(raw) {
  const d = payrollSourceReport(raw), statistics = sourceConceptStatistics(d);
  const notes = [
    'Fecha de liquidación: '+civilDate(d.date)+' · '+d.statementCount+' participaciones · '+statistics.counts.classifiedOccurrences+' ocurrencias componentes. Corrida completa; los filtros del detalle no cambian este alcance.',
    'Las sumas usan el grupo original de cada concepto y excluyen los códigos totalizadores 990 a 999 para no sumarlos otra vez.',
    'Los totalizadores guardados se conservan por separado. Una diferencia no modifica la fuente ni demuestra su causa histórica.',
    'Un grupo ausente o un importe sin informar se muestra como No informado; ausencia no equivale a cero. Los derivados afectados tampoco se calculan.',
    'Las ocurrencias son filas de conceptos, no legajos únicos. La igualdad de sumas no certifica conciliación individual.',
    'Consulta informativa: no crea una liquidación ni acredita firma o pago, y no es una presentación fiscal.',
    'Haberes desde conceptos: '+safeCurrencyExact(statistics.totals.gross)+' · Contribuciones: '+safeCurrencyExact(statistics.totals.contributions)+' · Retenciones: '+safeCurrencyExact(statistics.totals.withholdings)+'.',
    'Costo desde conceptos: '+safeCurrencyExact(statistics.totals.cost)+' · Neto: '+safeCurrencyExact(statistics.totals.net)+' · Neto totalizador 999: '+safeCurrencyExact(statistics.totals.storedNet)+' · Diferencia de neto: '+safeCurrencyExact(statistics.totals.netDifference,{signed:true})+'.',
    'Conjunto: '+d.datasetId+' · Reporte SHA-256: '+d.reportHash+' · Contenido SHA-256: '+d.payloadHash+'.',
  ];
  if (statistics.counts.unclassifiedConceptCount) notes.push('Hay ' + statistics.counts.unclassifiedConceptCount + ' conceptos sin clasificación en estos cinco grupos. No se asignaron por descripción o código.');
  const metadata = [
    ['Fecha de liquidación', civilDate(d.date)], ['Tipo', sourceReportTypeLabel(d.type) + ' (' + d.type + ')'],
    ['SHA-256',d.reportHash], ['Estado',({closed:'Cierre informado por la fuente',open:'Abierta / preliquidación',unknown:'Cierre no informado'})[d.closureStatus]],
    ['Estado de la fuente', ({closed:'Cierre informado por la fuente',open:'Abierta / preliquidación',unknown:'Cierre no informado'})[d.closureStatus]],
    ['Fuente', d.sourceLabel], ['Conjunto', d.datasetId], ['SHA-256 del reporte', d.reportHash], ['Huella de conjunto', d.payloadHash],
    ['Participaciones en la corrida', d.statementCount], ['Conceptos componentes clasificados', statistics.counts.classifiedConceptCount],
    ['Ocurrencias componentes clasificadas', statistics.counts.classifiedOccurrences],
    ['Conceptos sin clasificar', statistics.counts.unclassifiedConceptCount], ['Ocurrencias sin clasificar', statistics.counts.unclassifiedOccurrences],
    ['Conceptos totalizadores excluidos', statistics.counts.totalizerConceptCount], ['Ocurrencias totalizadoras excluidas', statistics.counts.totalizerOccurrences],
    ['Ocurrencias conservadas en la fuente', statistics.counts.sourceOccurrences],
    ['Haberes desde conceptos clasificados', safeCurrencyExact(statistics.totals.gross)],
    ['Contribuciones desde conceptos clasificados', safeCurrencyExact(statistics.totals.contributions)],
    ['Retenciones desde conceptos clasificados', safeCurrencyExact(statistics.totals.withholdings)],
    ['Costo desde conceptos clasificados', safeCurrencyExact(statistics.totals.cost)],
    ['Neto desde conceptos clasificados', safeCurrencyExact(statistics.totals.net)],
    ['Neto totalizador 999 guardado', safeCurrencyExact(statistics.totals.storedNet)],
    ['Diferencia neto conceptos - 999', safeCurrencyExact(statistics.totals.netDifference, {signed:true})],
    ...statistics.groupOrder.map(code => ['Grupo ' + code + ': ocurrencias', statistics.groups[code].conceptCount + ' conceptos; ' + statistics.groups[code].occurrences + ' ocurrencias; ' + statistics.groups[code].missingAmounts + ' importes ausentes']),
  ];
  return {
    title: 'Estadístico de conceptos de liquidación',
    columns: [
      {label:'Grupo de origen',type:'text',width:32}, {label:'Suma de conceptos',type:'text',width:30},
      {label:'Totalizador guardado',type:'text',width:30}, {label:'Diferencia exacta',type:'text',width:28},
    ],
    rows: statistics.groupOrder.map(code => {
      const group = statistics.groups[code];
      return [code + ' - ' + group.label, safeCurrencyExact(group.amount), safeCurrencyExact(group.storedTotalizer.amount), safeCurrencyExact(group.difference, {signed:true})];
    }),
    totals: [], metadata, notes,
    filename: 'municontrol_source_statistics_' + d.date + '_' + d.type.toLowerCase(),
  };
}
