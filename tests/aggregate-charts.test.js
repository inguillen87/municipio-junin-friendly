import test from 'node:test';
import assert from 'node:assert/strict';
import {exactChartMoney, chartNumber, aggregateOption, executiveCharts, comparisonChart, sourceCostChart, ownPayrollCharts} from '../assets/aggregate-chart-model.js';
import {ownReportBundle, ownReportDocument, emptyOwnReportFilters, emptyOwnStatisticsSelection} from '../assets/own-payroll-report-model.js';
import {reportFixture, historicalReportFixture, rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {sourceSalaryCost} from '../assets/payroll-source-report-model.js';
import {syntheticCostReport} from '../scripts/salary-cost-synthetic.mjs';
const bundle = f => ownReportBundle(f.query, f.details, f.receipts);
const moduleStub = {MC_PALETTE: ['green', 'blue', 'orange'], formatCompactMoney: String, formatNumber: String,
 barOption: ({categories, horizontal}) => ({xAxis: {}, yAxis: {data: horizontal ? categories : undefined}}),
 trendOption: () => ({yAxis: {scale: true}})};

test('monetary labels retain every original decimal; invalid and unsafe coordinates are not coerced', () => {
 assert.equal(exactChartMoney('12345678901234567890.00000001'), '$ 12.345.678.901.234.567.890,00000001');
 assert.equal(exactChartMoney('-0.01'), '-$ 0,01');
 assert.equal(exactChartMoney(null), 'Sin dato');
 assert.equal(chartNumber('9007199254740992.00', 'money'), null);
 assert.equal(chartNumber('-25.05', 'money'), -25.05);
 assert.equal(chartNumber(null), null);
 for (const v of [NaN, Infinity, '12', undefined]) assert.throws(() => chartNumber(v));
});
test('a missing comparison value stays null; tooltip labels are canvas rich text, never HTML', () => {
 const spec = comparisonChart({rows: [{label: '<img src=x onerror=alert(1)>', previous: 0, current: null, comparable: false}], key: 'test', title: 'Prueba'});
 const option = aggregateOption(moduleStub, spec);
 assert.equal(option.series[0].data[0], 0); assert.equal(option.series[1].data[0], null);
 assert.equal(option.tooltip.renderMode, 'richText');
 assert.match(option.tooltip.formatter([{dataIndex: 0}]), /Actual: Sin dato\nNo comparable/);
 assert.equal(option.tooltip.formatter([{dataIndex: -1}]), '');
});
test('the executive source produces counts with partial-year context and never invents salaries or headcount trends', () => {
 const specs = executiveCharts({management: {yearly: [{year: 2026, hires: 3, exits: 1, partial: true}]}, absence: {yearly: [{year: 2026, events: 0, partial: true}]}});
 assert.equal(specs.length, 2); assert.ok(specs.every(s => s.labels[0] === '2026*' && s.unit === 'number'));
 assert.deepEqual(specs[0].series.map(s => s.values), [[3], [1]]);
 assert.deepEqual(specs[1].series[0].values, [0]);
 assert.doesNotMatch(JSON.stringify(specs), /contractId|dni|net|gross|salary/);
});
test('source cost chart uses the five original components; missing and negative values remain distinct', () => {
 const raw = syntheticCostReport();
 raw.rows.find(r => r.code === '994').amount = null; raw.rows.find(r => r.code === '994').missingAmounts = 1;
 raw.rows.find(r => r.code === '703').amount = '-1.00';
 const cost = sourceSalaryCost(raw), spec = sourceCostChart(cost);
 assert.deepEqual(spec.series[0].values, ['1000.00', null, '25.00', '70.00', '-1.00']);
 assert.equal(cost.amount, null); assert.match(spec.subtitle, /incompleta/);
 assert.ok(spec.labels.every(v => !v.includes('undefined')));
});
test('horizontal charts reserve usable mobile plotting space without changing values or full category labels', () => {
 const spec = sourceCostChart(sourceSalaryCost(syntheticCostReport())), before = JSON.stringify(spec);
 const option = aggregateOption(moduleStub, spec);
 assert.equal(option.media[0].query.maxWidth, 360);
 assert.ok(option.media[0].option.yAxis.axisLabel.width <= 80);
 assert.equal(option.media[0].option.xAxis.axisLabel.hideOverlap, true);
 assert.match(option.tooltip.formatter([{dataIndex: 0}]), new RegExp(spec.labels[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
 assert.equal(JSON.stringify(spec), before);
 assert.deepEqual(option.series[0].data, spec.series[0].values.map(Number));
});
test('native report chart shares the exact full selection and sums gross plus employer contributions once', () => {
 const f = reportFixture(2), before = JSON.stringify(f), doc = ownReportDocument(bundle(f));
 assert.equal(doc.chartSummary.participations, 2);
 assert.deepEqual(doc.chartSummary.months.map(({gross, deduction, net}) => ({gross, deduction, net})), [{gross: '245.22', deduction: '7.36', net: '237.86'}]);
 assert.equal(doc.chartSummary.departments[0].cost, '275.26');
 assert.equal(JSON.stringify(f), before);
 assert.doesNotMatch(JSON.stringify(doc.chartSummary), /contractId|employeeNumber|runId|dni|1001|1002/);
 const [trend] = ownPayrollCharts(doc.chartSummary), option = aggregateOption(moduleStub, trend);
 assert.ok(option.series.every(s => s.smooth === false && s.connectNulls === false));
 assert.equal(option.yAxis.scale, false);
});
test('an unclosed month and an empty selected population never become a zero-valued payroll', () => {
 const oct = historicalReportFixture('2026-10', 'monthly'), sep = historicalReportFixture('2026-09', 'monthly');
 sep.details[0].groups = [];
 const b = ownReportBundle({from: '2026-09', to: '2026-10', types: ['monthly']}, [sep.details[0], oct.details[0]], oct.receipts);
 const doc = ownReportDocument(b);
 assert.equal(doc.chartSummary.months[0].gross, null);
 assert.equal(doc.chartSummary.months[1].gross, '245.22');
 const empty = ownReportDocument(b, {...emptyOwnReportFilters(), employeeFrom: '99999999'});
 assert.equal(empty.chartSummary.participations, 0); assert.deepEqual(ownPayrollCharts(empty.chartSummary), []);
});
test('department identities 01 and 1 stay separate, and exact scope controls chart and exported rows together', () => {
 const f = historicalReportFixture('2026-10', 'monthly'), s = f.receipts[0].snapshot;
 s.employees[0].departmentCode = '01';
 for (const c of s.concepts.filter(c => c.contractId === s.employees[0].contractId)) c.departmentCode = '01';
 rehashReportFixture(f); const b = bundle(f), all = ownReportDocument(b);
 assert.deepEqual(all.chartSummary.departments.map(r => r.code).sort(), ['01', '1']);
 const doc = ownReportDocument(b, emptyOwnReportFilters(), 'payroll', 'concept', [], 'all', {...emptyOwnStatisticsSelection(), department: '01'});
 assert.equal(doc.rows.length, 1); assert.equal(doc.rows[0][4], '01');
 assert.equal(doc.chartSummary.participations, 1); assert.equal(doc.chartSummary.months[0].gross, '132.61');
 assert.equal(doc.chartSummary.departments[0].cost, '147.63');
 assert.equal(ownReportDocument(b, emptyOwnReportFilters(), 'statistics').chartSummary, undefined, 'a concept filter must not be relabelled as whole-payroll totals');
});
