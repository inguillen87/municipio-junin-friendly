// Finite source-custody projection for the explicit Noelia accounting profile.
// Runtime readers execute the current bytes; only historical test custody uses this inverse.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const row=Object.freeze({
  "path": "scripts/verify-noelia-payroll-circuit.mjs",
  "beforeBytes": 50410,
  "beforeSha256": "3a3c4aa48785f33d3627a810afe4bf3577e8e39dcb6f6cdff77e5db07248245c",
  "afterBytes": 50929,
  "afterSha256": "f45c1d8d1b6032afa95952f05cbddce96110bd4b5203d87c732744240f8b89f0",
  "inverse": [
    {
      "from": " const prior=proof();",
      "to": " const accountingStage=({statements,end,readOnly})=>{assert.ok(Array.isArray(statements)&&statements.length>0&&statements.every(s=>typeof s==='string'));assert.ok(['COMMIT','ROLLBACK'].includes(end));assert.equal(typeof readOnly,'boolean');const sql=tx(readOnly?['SET TRANSACTION READ ONLY',...statements]:statements);assert.ok(sql.endsWith(';COMMIT;'));return JSON.parse(run(end==='ROLLBACK'?sql.slice(0,-7)+'ROLLBACK;':sql));};\n const prior=proof();"
    },
    {
      "from": "bankTail:nativeBankTail,transport:browserQa,",
      "to": "bankTail:nativeBankTail,fullAccounting:{fullQa,ready:datedReadyForSuccession,major,executeStage:accountingStage},transport:browserQa,"
    }
  ]
});
const hash=value=>createHash('sha256').update(value).digest('hex');
export const NOELIA_ACCOUNTING_RUNNER_SOURCE_PIN=Object.freeze(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='inverse')));
export function projectNoeliaAccountingRunnerSource(file,value){
 if(file!==row.path)return value;
 assert.equal(typeof value,'string','NOELIA_ACCOUNTING_RUNNER_SOURCE_TEXT_REQUIRED');
 assert.equal(Buffer.byteLength(value),row.afterBytes,'NOELIA_ACCOUNTING_RUNNER_CURRENT_BYTES_CHANGED');
 assert.equal(hash(value),row.afterSha256,'NOELIA_ACCOUNTING_RUNNER_CURRENT_SOURCE_CHANGED');
 let restored=value;for(const span of row.inverse){assert.equal(restored.split(span.to).length,2,'NOELIA_ACCOUNTING_RUNNER_INVERSE_ANCHOR_CHANGED');restored=restored.replace(span.to,()=>span.from);}
 assert.equal(Buffer.byteLength(restored),row.beforeBytes,'NOELIA_ACCOUNTING_RUNNER_PARENT_BYTES_CHANGED');
 assert.equal(hash(restored),row.beforeSha256,'NOELIA_ACCOUNTING_RUNNER_PARENT_SOURCE_CHANGED');return restored;
}
