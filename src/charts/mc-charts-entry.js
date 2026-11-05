// MuniControl charts: Apache ECharts (tree-shaken) with the municipal theme. Loaded on demand by the screens that chart data.
// Only aggregated numbers reach a chart; tooltips use es-AR formatting. Animations respect prefers-reduced-motion.
import * as echarts from 'echarts/core';
import {BarChart, LineChart, PieChart, HeatmapChart, TreemapChart} from 'echarts/charts';
import {GridComponent, TooltipComponent, LegendComponent, VisualMapContinuousComponent, CalendarComponent, TitleComponent, AriaComponent, GraphicComponent} from 'echarts/components';
import {LabelLayout} from 'echarts/features';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, HeatmapChart, TreemapChart, GridComponent, TooltipComponent, LegendComponent,
 VisualMapContinuousComponent, CalendarComponent, TitleComponent, AriaComponent, GraphicComponent, LabelLayout, CanvasRenderer]);

export const MC_PALETTE = Object.freeze(['#0f766e', '#315f82', '#d08c2f', '#c2604f', '#6b5ca5', '#3a8fb7', '#7a9a3a', '#b0577f', '#1b465e', '#4fa38f']);
export const MC_SEQUENTIAL = Object.freeze(['#eef7f4', '#c9e8df', '#8fd0bf', '#45a99a', '#0f766e', '#0b5b55', '#123247']);
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const dark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function theme(isDark) {
 const ink = isDark ? '#e6eef0' : '#18252d', muted = isDark ? '#9fb2b8' : '#5d6f78', line = isDark ? '#2c3e46' : '#e3e9e7', panel = isDark ? '#14232b' : '#ffffff';
 return {
  color: MC_PALETTE, backgroundColor: 'transparent',
  textStyle: {fontFamily: FONT, color: ink},
  title: {textStyle: {fontFamily: FONT, color: ink, fontWeight: 650, fontSize: 15}, subtextStyle: {color: muted}},
  legend: {textStyle: {color: muted, fontSize: 12}, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 16},
  tooltip: {backgroundColor: panel, borderColor: line, borderWidth: 1, padding: [10, 12], textStyle: {color: ink, fontSize: 12},
   extraCssText: 'border-radius:12px;box-shadow:0 12px 32px rgba(18,50,71,.16);'},
  grid: {left: 12, right: 16, top: 40, bottom: 12, containLabel: true},
  categoryAxis: {axisLine: {lineStyle: {color: line}}, axisTick: {show: false}, axisLabel: {color: muted, fontSize: 11}, splitLine: {show: false}},
  valueAxis: {axisLine: {show: false}, axisTick: {show: false}, axisLabel: {color: muted, fontSize: 11}, splitLine: {lineStyle: {color: line, type: [4, 4]}}},
  timeAxis: {axisLine: {lineStyle: {color: line}}, axisLabel: {color: muted, fontSize: 11}, splitLine: {show: false}},
  line: {symbol: 'circle', symbolSize: 6, smooth: 0.35, lineStyle: {width: 2.5}},
  bar: {itemStyle: {borderRadius: [6, 6, 0, 0]}},
  pie: {itemStyle: {borderColor: panel, borderWidth: 2, borderRadius: 6}},
  calendar: {itemStyle: {borderColor: panel, borderWidth: 3, color: isDark ? '#1c2d35' : '#f3f6f5'}, splitLine: {show: false},
   dayLabel: {color: muted, fontSize: 11, nameMap: ['D', 'L', 'M', 'M', 'J', 'V', 'S']}, monthLabel: {color: muted, fontSize: 11, nameMap: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']}, yearLabel: {show: false}},
  visualMap: {textStyle: {color: muted, fontSize: 11}, inRange: {color: MC_SEQUENTIAL}},
 };
}
echarts.registerTheme('municontrol', theme(false));
echarts.registerTheme('municontrol-dark', theme(true));

export const formatNumber = (value, digits = 0) => new Intl.NumberFormat('es-AR', {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(value ?? 0);
export const formatMoney = value => new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0}).format(value ?? 0);
export const formatCompactMoney = value => '$ ' + new Intl.NumberFormat('es-AR', {notation: 'compact', maximumFractionDigits: 1}).format(value ?? 0);

/** Mounts (or updates) a chart in `host`. Returns {chart, update(option), dispose()}. The host needs a height (CSS). */
export function mountChart(host, option, {renderer = 'canvas', ariaLabel = ''} = {}) {
 if (!host) throw Error('mountChart: host requerido');
 let chart = echarts.getInstanceByDom(host);
 if (!chart) chart = echarts.init(host, dark() ? 'municontrol-dark' : 'municontrol', {renderer});
 const animated = !reduced();
 const base = {animation: animated, animationDuration: 900, animationEasing: 'cubicOut', animationDurationUpdate: 600, animationEasingUpdate: 'cubicInOut',
  aria: {enabled: true, label: {description: ariaLabel || undefined}}};
 chart.setOption({...base, ...option}, {notMerge: true, lazyUpdate: true});
 if (!host.__mcObserved && typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(() => chart && !chart.isDisposed() && chart.resize({animation: {duration: animated ? 300 : 0}}));
  observer.observe(host); host.__mcObserved = observer;
 }
 return {chart, update: next => chart.setOption({...base, ...next}, {notMerge: true}), dispose() { host.__mcObserved?.disconnect(); delete host.__mcObserved; chart.dispose(); }};
}

/** Donut with the total in the centre. items: [{name, value}] */
export function donutOption({items, total, totalLabel = 'Total', format = formatNumber, title}) {
 return {
  title: title ? {text: title, left: 0, top: 0} : undefined,
  tooltip: {trigger: 'item', formatter: p => `<b>${p.name}</b><br>${format(p.value)} · ${formatNumber(p.percent, 1)} %`},
  legend: {bottom: 0, left: 'center'},
  graphic: [{type: 'text', left: 'center', top: '38%', style: {text: totalLabel, fill: '#5d6f78', fontSize: 12, fontFamily: FONT, align: 'center'}},
   {type: 'text', left: 'center', top: '46%', style: {text: format(total ?? items.reduce((s, i) => s + (i.value || 0), 0)), fill: dark() ? '#e6eef0' : '#123247', fontSize: 18, fontWeight: 700, fontFamily: FONT, align: 'center'}}],
  series: [{type: 'pie', radius: ['56%', '78%'], center: ['50%', '45%'], avoidLabelOverlap: true, label: {show: false}, labelLine: {show: false},
   emphasis: {scale: true, scaleSize: 6, itemStyle: {shadowBlur: 18, shadowColor: 'rgba(18,50,71,.25)'}}, data: items,
   animationType: 'scale', animationEasing: 'elasticOut', animationDelay: i => i * 90}],
 };
}

/** Horizontal or vertical bars. categories: [label], values: [number] */
export function barOption({categories, values, format = formatNumber, horizontal = false, color, title, name = ''}) {
 const cat = {type: 'category', data: categories}, val = {type: 'value', splitNumber: horizontal ? 3 : 5, axisLabel: {formatter: v => format(v), hideOverlap: true}};
 return {
  title: title ? {text: title, left: 0, top: 0} : undefined,
  tooltip: {trigger: 'axis', axisPointer: {type: 'shadow'}, valueFormatter: v => format(v)},
  xAxis: horizontal ? val : cat, yAxis: horizontal ? {...cat, inverse: true} : val,
  series: [{type: 'bar', name, data: values, barMaxWidth: 34, colorBy: color ? 'series' : 'data', itemStyle: {borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0], ...(color ? {color} : {})},
   label: {show: categories.length <= 8, position: horizontal ? 'right' : 'top', formatter: p => format(p.value), color: '#5d6f78', fontSize: 11},
   emphasis: {focus: 'series'}, animationDelay: i => i * 45}],
 };
}

/** Calendar heatmap. days: [['YYYY-MM-DD', value]], range: 'YYYY' or ['from','to'] */
export function calendarHeatmapOption({days, range, max, label = 'eventos', title}) {
 const peak = max ?? Math.max(1, ...days.map(d => d[1] || 0));
 return {
  title: title ? {text: title, left: 0, top: 0} : undefined,
  tooltip: {formatter: p => `<b>${new Intl.DateTimeFormat('es-AR', {weekday: 'long', day: 'numeric', month: 'long'}).format(new Date(p.value[0] + 'T12:00:00'))}</b><br>${formatNumber(p.value[1])} ${label}`},
  visualMap: {min: 0, max: peak, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 140, text: ['más', 'menos']},
  calendar: {range, top: 48, left: 34, right: 12, bottom: 44, cellSize: ['auto', 16], dayLabel: {firstDay: 1}},
  series: [{type: 'heatmap', coordinateSystem: 'calendar', data: days, emphasis: {itemStyle: {borderColor: '#123247', borderWidth: 2}},
   animationDelay: i => Math.min(i * 6, 900)}],
 };
}

/** Sweeps a series in, oldest cell first (heatmaps have no entrance animation). No-op with reduced motion. */
export function revealSeries(chart, data, {steps = 16, interval = 50} = {}) {
 if (reduced() || !chart || chart.isDisposed() || !Array.isArray(data) || data.length < steps) return;
 const size = Math.ceil(data.length / steps); let shown = size;
 chart.setOption({series: [{data: data.slice(0, shown)}]});
 const tick = () => {
  if (chart.isDisposed()) return;
  shown = Math.min(data.length, shown + size); chart.setOption({series: [{data: data.slice(0, shown)}]});
  if (shown < data.length) setTimeout(tick, interval);
 };
 setTimeout(tick, interval);
}

/** Hour × weekday heatmap. cells: [[hour 0-23, weekday 0-6 (lunes=0), value]] */
export function weekHourHeatmapOption({cells, label = 'marcaciones', title}) {
 const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], peak = Math.max(1, ...cells.map(c => c[2] || 0));
 return {
  title: title ? {text: title, left: 0, top: 0} : undefined,
  tooltip: {position: 'top', formatter: p => `<b>${days[p.value[1]]} ${String(p.value[0]).padStart(2, '0')}:00</b><br>${formatNumber(p.value[2])} ${label}`},
  grid: {left: 8, right: 8, top: 40, bottom: 48, containLabel: true},
  xAxis: {type: 'category', data: Array.from({length: 24}, (_, h) => String(h).padStart(2, '0')), splitArea: {show: false}},
  yAxis: {type: 'category', data: days, inverse: true},
  visualMap: {min: 0, max: peak, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 140, text: ['más', 'menos']},
  series: [{type: 'heatmap', data: cells, itemStyle: {borderRadius: 4, borderColor: dark() ? '#14232b' : '#ffffff', borderWidth: 2},
   emphasis: {itemStyle: {shadowBlur: 12, shadowColor: 'rgba(18,50,71,.3)'}}, animationDelay: i => Math.min(i * 4, 900)}],
 };
}

/** Line/area trend. points: [[label, value]] */
export function trendOption({points, format = formatNumber, title, name = '', area = true}) {
 return {
  title: title ? {text: title, left: 0, top: 0} : undefined,
  tooltip: {trigger: 'axis', valueFormatter: v => format(v)},
  xAxis: {type: 'category', boundaryGap: false, data: points.map(p => p[0])},
  yAxis: {type: 'value', axisLabel: {formatter: v => format(v)}, scale: true},
  series: [{type: 'line', name, data: points.map(p => p[1]), smooth: 0.35, symbolSize: 7,
   areaStyle: area ? {opacity: 1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{offset: 0, color: 'rgba(15,118,110,.32)'}, {offset: 1, color: 'rgba(15,118,110,0)'}])} : undefined,
   emphasis: {focus: 'series'}, animationDuration: 1200}],
 };
}

/** Treemap. nodes: [{name, value, children?}] */
export function treemapOption({nodes, format = formatNumber, title}) {
 return {
  title: title ? {text: title, left: 0, top: 0} : undefined,
  tooltip: {formatter: p => `<b>${p.name}</b><br>${format(p.value)}`},
  series: [{type: 'treemap', data: nodes, top: title ? 36 : 4, left: 0, right: 0, bottom: 0, roam: false, nodeClick: false, breadcrumb: {show: false},
   label: {show: true, formatter: p => `${p.name}\n${format(p.value)}`, fontSize: 12, lineHeight: 16, color: '#ffffff'},
   itemStyle: {borderColor: dark() ? '#14232b' : '#ffffff', borderWidth: 2, gapWidth: 2, borderRadius: 6}, levels: [{colorSaturation: [0.35, 0.6]}]}],
 };
}

export {echarts};
