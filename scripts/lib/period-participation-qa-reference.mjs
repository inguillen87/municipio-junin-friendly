// Independent prior approved result, matched by identical monetary inputs.
// Random UUID ordering must never select an unrelated monthly addition.
import assert from 'node:assert/strict';
const monetary=e=>e.inputs.filter(i=>i.unit==='money').map(({key,unit,value})=>({key,unit,value})).sort((a,b)=>a.key.localeCompare(b.key));
const cents=v=>{assert.match(v,/^[0-9]+\.[0-9]{2}$/);return BigInt(v.replace('.',''));},money=v=>(v/100n)+'.'+String(v%100n).padStart(2,'0');
export function independentParticipationReference(previousRun,nextEmployee){
 const values=JSON.stringify(monetary(nextEmployee));assert.notEqual(values,'[]');
 const baseline=previousRun.saved.input.employees.find(e=>JSON.stringify(monetary(e))===values);assert.ok(baseline,'No prior independently verified result has the same complete monetary inputs');
 const total=previousRun.saved.result.employeeTotals.find(t=>t.contractId===baseline.contractId);assert.ok(total);
 const rows=previousRun.saved.result.rows.filter(r=>r.contractId===baseline.contractId),component=code=>{const found=rows.filter(r=>r.conceptCode===code&&r.nature==='remuneration');assert.equal(found.length,1);return cents(found[0].amount);};
 const selectedCents=component('88')+component('95');assert.equal(selectedCents%3n,0n);
 return {baselineId:baseline.contractId,expectedFull:total.net,expectedThird:money(cents(total.net)-selectedCents*2n/3n),selectedCents:String(selectedCents)};
}
