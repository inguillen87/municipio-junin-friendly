import {createHash} from 'node:crypto';
import {normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
const hash=value=>createHash('sha256').update(salarySerialized(value),'utf8').digest('hex');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
/** Pure V4 path. Not wired into current HTTP or a SQL finalizer. */
export function createOwnPayrollOfficialSnapshot(raw){
 const input=normalizeOwnPayrollOfficialInput(raw),result=calculateOwnPayrollWithOfficialTotals(input);
 return freeze({version:'own-payroll-snapshot.v3',inputSha256:hash(input),resultSha256:hash(result),input,result});
}
