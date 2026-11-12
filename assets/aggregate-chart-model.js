// Presentation only: exact totals are supplied by the already validated report.
// No request, payroll formula, missing-value replacement or nominal identifier.
const numberFormat = new Intl.NumberFormat('es-AR', {maximumFractionDigits: 2});
export function exactChartMoney(value) {
 if (value === null || value === undefined) return 'Sin dato';
 if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,8})?$/.test(value)) throw Error('Importe del gráfico inválido.');
 const [whole, fraction = ''] = value.split('.'), negative = whole.startsWith('-');
 const integer = (negative ? whole.slice(1) : whole).replace(/^0+(?=\d)/, '');
 return (negative ? '-$ ' : '$ ') + integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction.padEnd(2, '0');
}
export function chartNumber(value, unit = 'number') {
 if (value === null) return null;
 if (unit === 'money') {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,8})?$/.test(value)) throw Error('Importe del gráfico inválido.');
  // Coordinates may be approximate; refuse magnitudes whose integer part cannot
  // be represented safely. Exact strings remain in every tooltip and table.
  const whole = BigInt(value.split('.')[0]);
  if (whole > BigInt(Number.MAX_SAFE_INTEGER) || whole < -BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
 }
 if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw Error('Cantidad del gráfico inválida.');
 return value;
}
export const chartValue = (value, unit) => value === null ? 'Sin dato' : unit === 'money' ? exactChartMoney(value) : numberFormat.format(value);

export function aggregateOption(m, spec) {
 if (!spec || !['bar', 'line'].includes(spec.kind) || !['money', 'number'].includes(spec.unit)
  || !Array.isArray(spec.labels) || !spec.labels.length || spec.labels.length > 100
  || !spec.labels.every(v => typeof v === 'string') || !Array.isArray(spec.series) || !spec.series.length
  || spec.series.length > 6 || spec.series.some(s => typeof s.name !== 'string' || !Array.isArray(s.values) || s.values.length !== spec.labels.length)) throw Error('Serie del gráfico inválida.');
 const money = spec.unit === 'money', formatAxis = money ? m.formatCompactMoney : m.formatNumber;
 const option = spec.kind === 'line'
  ? m.trendOption({points: spec.labels.map(v => [v, null]), area: false, format: formatAxis})
  : m.barOption({categories: spec.labels, values: [], horizontal: spec.horizontal === true, format: formatAxis});
 option.legend = {top: 0, left: 0, data: spec.series.map(s => s.name)};
 option.grid = {left: 12, right: 16, top: 44, bottom: 12, containLabel: true};
 if (spec.horizontal) {
  option.yAxis.axisLabel = {width: 140, overflow: 'truncate', lineHeight: 16};
  option.xAxis.splitNumber = 3;
  option.xAxis.axisLabel = {...option.xAxis.axisLabel, hideOverlap: true};
  // A fixed category-label width can consume almost the whole plot on phones.
  // ECharts re-evaluates these media options when its ResizeObserver resizes it.
  option.media = [
   {query: {maxWidth: 360}, option: {
    grid: {left: 8, right: 12, top: 44, bottom: 12, containLabel: true},
    yAxis: {axisLabel: {width: 72, overflow: 'truncate', lineHeight: 16}},
    xAxis: {splitNumber: 2, axisLabel: {hideOverlap: true}},
   }},
   {option: {grid: {...option.grid}, yAxis: {axisLabel: {...option.yAxis.axisLabel}},
    xAxis: {splitNumber: 3, axisLabel: {hideOverlap: true}}}},
  ];
 }
 // Rich text is rendered on canvas: labels are never interpolated into HTML.
 option.tooltip = {trigger: 'axis', renderMode: 'richText', confine: true,
  axisPointer: {type: spec.kind === 'bar' ? 'shadow' : 'line'},
  formatter: params => {
   const index = Array.isArray(params) ? params[0]?.dataIndex : params?.dataIndex;
   if (!Number.isInteger(index) || index < 0 || index >= spec.labels.length) return '';
   return [spec.labels[index], ...spec.series.map(s => s.name + ': ' + chartValue(s.values[index], spec.unit)), spec.context?.[index] || ''].filter(Boolean).join('\n');
  }};
 option.series = spec.series.map((s, index) => ({type: spec.kind, name: s.name,
  data: s.values.map(value => chartNumber(value, spec.unit)),
  color: m.MC_PALETTE[index % m.MC_PALETTE.length], colorBy: 'series',
  ...(spec.kind === 'line' ? {smooth: false, connectNulls: false, symbolSize: 6, showSymbol: true}
   : {barMaxWidth: 28, itemStyle: {borderRadius: spec.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}}),
  emphasis: {focus: 'series'}}));
 if (spec.kind === 'line') option.yAxis.scale = false;
 return option;
}

export function executiveCharts(source) {
 const movements = source.management.yearly, absences = source.absence.yearly;
 return [
  {key: 'executive-movements', title: 'Altas y bajas por año', subtitle: 'Movimientos registrados · * período parcial; no es una serie de dotación.', kind: 'bar', unit: 'number',
   labels: movements.map(r => String(r.year) + (r.partial ? '*' : '')), context: movements.map(r => r.partial ? 'Período parcial; sin proyección.' : 'Período informado por la fuente.'),
   series: [{name: 'Altas', values: movements.map(r => r.hires)}, {name: 'Bajas', values: movements.map(r => r.exits)}]},
  {key: 'executive-absence', title: 'Eventos de ausencia por año', subtitle: 'Cantidad de registros · * período parcial; no representa días ni una tasa.', kind: 'bar', unit: 'number',
   labels: absences.map(r => String(r.year) + (r.partial ? '*' : '')), context: absences.map(r => r.partial ? 'Período parcial; sin proyección.' : 'Período informado por la fuente.'),
   series: [{name: 'Eventos', values: absences.map(r => r.events)}]},
 ];
}

export function comparisonChart({rows, key, title, subtitle, left = 'Anterior', right = 'Actual', horizontal = false}) {
 return {key, title, subtitle, kind: 'bar', unit: 'number', horizontal,
  labels: rows.map(r => r.label), context: rows.map(r => r.note || (r.comparable === false ? 'No comparable' : '')),
  series: [{name: left, values: rows.map(r => r.previous)}, {name: right, values: rows.map(r => r.current)}]};
}

export function sourceCostChart(cost) {
 return {key: 'source-salary-cost', title: 'Componentes del costo salarial',
  subtitle: cost.missingCodes.length === 0 ? 'Importes de la corrida consultada; fórmula 993 + 994 + 995 + 701 + 703.' : 'Cobertura incompleta: los componentes ausentes quedan sin dato.',
  kind: 'bar', unit: 'money', horizontal: true,
  labels: cost.components.map(c => c.code + ' · ' + c.description),
  series: [{name: 'Importe original', values: cost.components.map(c => c.amount)}]};
}

export function ownPayrollCharts(summary) {
 if (!summary || !summary.participations) return [];
 // Una línea necesita dos meses cerrados seguidos: un mes sin cierre corta el trazo (no es cero y no se une). Sin ningún
 // tramo que dibujar quedarían puntos sueltos que casi no se ven; en ese caso van barras, que tampoco inventan el hueco.
 const drawsSegment = summary.months.some((r, i) => i > 0 && r.gross !== null && summary.months[i - 1].gross !== null);
 return [{key: 'own-payroll-months', title: 'Liquidaciones cerradas por mes',
  subtitle: 'Mismo alcance del informe. Suma los tipos elegidos; sin cierre no equivale a cero. Importes en pesos.',
  kind: drawsSegment ? 'line' : 'bar', unit: 'money', labels: summary.months.map(r => r.period), context: summary.months.map(r => r.coverage),
  series: [{name: 'Bruto', values: summary.months.map(r => r.gross)}, {name: 'Retenciones', values: summary.months.map(r => r.deduction)}, {name: 'Neto', values: summary.months.map(r => r.net)}]},
 {key: 'own-payroll-cost', title: 'Costo salarial por repartición',
  subtitle: 'Bruto más contribuciones patronales del alcance cerrado. Repartición conservada en cada cálculo; incluye correcciones negativas.',
  kind: 'bar', unit: 'money', horizontal: true, labels: summary.departments.map(r => r.label),
  series: [{name: 'Bruto + contribuciones', values: summary.departments.map(r => r.cost)}]}];
}
