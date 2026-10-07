import {capture,saved} from './own-payroll-run-synthetic.js';
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
export function comparisonSources(count=30){
 const base=capture();base.payload.population=approvedSources(count).population;base.payloadSha256=ownRunHash(base.payload);base.saved=saved(base);
 const target=structuredClone(base);target.id=uid(91);target.key=uid(10);target.createdAt='2026-10-05T11:00:00Z';target.payload.monthly.batches[0].rows[0].amountCents='4000';target.payloadSha256=ownRunHash(target.payload);target.saved=saved(target);target.saved.recordedAt='2026-10-05T11:01:00Z';return {base,target};
}
export function resealComparison(c){c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);return c;}
