// Existing synthetic financial fixture only; never modifies M7's20 rules.
import test from 'node:test';import assert from 'node:assert/strict';
import {ownArtFullSourceFixture} from './fixtures/own-art-full-source-synthetic.js';
import {prepareOwnArtReport,verifiedOwnArtSource} from '../assets/own-art-report-model.js';
import {ownArtCsv,ownArtXlsx} from '../assets/own-art-report-export.js';
test('separate existing ART fixture covers a complete positive export without adding ART rules to M7',async()=>{
 const fixture=ownArtFullSourceFixture(1),report=prepareOwnArtReport(await verifiedOwnArtSource(fixture.source));
 assert.equal(report.canExport,true);assert.equal(report.total,1);assert.ok(ownArtCsv(report).length>0);assert.ok(ownArtXlsx(report).length>0);
 assert.equal(fixture.provenance.municipalRule,false);assert.equal(fixture.provenance.sqlApproval,false);
});
