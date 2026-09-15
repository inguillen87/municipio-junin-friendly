import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { monthlySummaryData, mutualRetentionsView } from '../../assets/payroll-monthly-summary-model.js';
import { mutualRetentionsPdf } from '../../assets/payroll-monthly-summary-export.js';
import { mutualFixture } from './fixture.mjs';

test('PDF maximum-width source labels, descriptions, decimals and totals fit inside every page without footer overlap', async () => {
  const codes = Array.from({ length: 1000 }, (_, index) => String(index + 10000)), payload = mutualFixture(codes);
  payload.data.rows.forEach(row => { row.description = 'W'.repeat(240); row.amount = '9999999999999999999999.99'; });
  payload.data.sources.forEach(source => source.sourceLabel = 'W'.repeat(240));
  const data = monthlySummaryData(payload, { resource: 'summary', period: '2026-08', datasetIds: payload.data.sources.map(source => source.datasetId) });
  const loading = getDocument({ data: mutualRetentionsPdf(data, mutualRetentionsView(data, codes), '2026-09-14T16:00:00Z'), useSystemFonts: true }), pdf = await loading.promise;
  let bodyLines = 0;
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index), text = await page.getTextContent({ disableNormalization: true });
      for (const item of text.items.filter(item => item.str?.trim())) {
        const [,,,,x,y] = item.transform;
        assert.ok(x >= 31 && x + item.width <= 811, 'PDF text outside horizontal page margins: ' + item.str);
        // Header baselines sit above 510pt and the two footer lines below 30pt.
        if (y > 30 && y < 510) { bodyLines++; assert.ok(y >= 49, 'PDF body overlaps footer: ' + item.str); }
      }
    }
    assert.ok(bodyLines > 1000, 'stress document retains all report rows across pages');
  } finally { await loading.destroy(); }
});
