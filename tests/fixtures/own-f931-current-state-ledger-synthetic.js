// EXCLUSIVAMENTE SINTÉTICO (R21). Slices de cierre del lector R9 que forman un ledger global de 26 eventos. Sin
// imports de scripts/: lo consumen tanto la prueba de admisión como la del lector/F4. Ningún dato nominal.
import {historicalReportFixture} from './own-payroll-report-synthetic.js';
import {jurisdictionFixture} from './own-payroll-jurisdiction-synthetic.js';
import {retypedJurisdictionFixture} from './own-f931-jurisdiction-synthetic.js';
import {reportCensusFixture,reopenEvent} from './own-payroll-report-census-synthetic.js';

// Ledger sintético global: 25 cierres + 1 reapertura = 26 eventos preexistentes, sin corte por época.
//  · 18 cierres snapshot v1 (historicalReportFixture, períodos 2023-07…2024-12, mensual, ids uid(501…518));
//  · 6 cierres snapshot v2 retipados (retypedJurisdictionFixture, ids uid(701…706));
//  · 1 cierre snapshot v2 completo con capturas originales (jurisdictionFixture, id uid(400));
//  · 1 reapertura del primer cierre v1 (reopenEvent, id uid(777)).
// v3: no existe fixture sintético v3 en R9 (ver HOLD R21); la admisión es agnóstica de versión (sólo cuenta/digest).
export function syntheticLedgerSlices(){
 const slices=[];
 for(let i=0;i<18;i++){const month=6+i,period=(2023+Math.floor(month/12))+'-'+String(month%12+1).padStart(2,'0');slices.push({label:'v1-historical',fixture:historicalReportFixture(period,'monthly',501+i),reopened:[]});}
 ['first_fortnight','sac','vacation','supplementary','final','other'].forEach((type,i)=>slices.push({label:'v2-retyped',fixture:retypedJurisdictionFixture(2,()=>'55',type,701+i),reopened:[]}));
 slices.push({label:'v2-complete',fixture:jurisdictionFixture(4,()=>'42'),reopened:[]});
 slices[0].reopened=[reopenEvent(slices[0].fixture.receipts[0].groupId)];slices[0].label='v1-reopened';
 for(const slice of slices)slice.census=reportCensusFixture(slice.fixture,{reopened:slice.reopened});
 return slices;
}
// ms → µs: el servidor serializa recorded_at con 6 decimales UTC.
const micro=stamp=>{const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})Z$/.exec(stamp);if(!m)throw Error('F931_CURRENT_TEST_STAMP');return m[1]+'.'+m[2]+'000Z';};
export function ledgerRowsOf(slices){return slices.flatMap(s=>s.census.events.map(e=>({id:e.id,groupId:e.groupId,command:e.command,bodySha256:e.bodySha256,snapshotSha256:e.snapshotSha256,recordedAt:micro(e.recordedAt)})));}
