// Lectores de la pantalla Calcular para un resultado guardado de cualquier versión. Cada resultado elige su lector por la
// versión que declara: V1/V2, el validador histórico de la pantalla; V4/V5 (total oficial y política de emisión), el validador
// oficial, que comprueba la captura original y vuelve a calcularla entera. Para mostrar no se recalcula ni se corrige nada.
import {salarySerialized} from './native-salary-catalog-model.js';
import {verifiedWorkspaceCapture,ownRunWorkspaceRows,ownRunWorkspaceCsv} from './own-payroll-run-workspace-model.js';
import {ownHistoricalOfficialInput,ownHistoricalRunResult} from './own-payroll-historical-result-model.js';
import {verifiedOwnOfficialCapture} from './own-payroll-official-snapshot-model.js';

// Reading a V4/V5 result recalculates it completely. The screen asks for it on every page and every search, so the reading of a
// capture is kept while that capture cannot change: only the deep-frozen private copy that `verifiedRunCapture` returns is
// remembered. Any other object is read (and recalculated) every time.
const frozen=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(frozen);Object.freeze(v);}return v;};
const read=new WeakMap();
export function ownRunResult(capture){
 if(!ownHistoricalOfficialInput(capture?.saved?.input)||!read.has(capture))return ownHistoricalRunResult(capture);
 return read.get(capture);
}
// The official verifier validates and returns a private copy taken before its first await. The attempt (key and body the person
// sent) is compared on that copy, as the historical verifier does on its own.
export async function verifiedRunCapture(value,attempt=null){
 if(!ownHistoricalOfficialInput(value?.saved?.input))return verifiedWorkspaceCapture(value,attempt);
 const capture=await verifiedOwnOfficialCapture(value);
 if(attempt&&(capture.key!==attempt.key||salarySerialized(capture.body)!==salarySerialized(attempt.body)))throw Error('La captura cambió el cuerpo o la clave originales.');
 frozen(capture);read.set(capture,ownHistoricalRunResult(capture));
 return capture;
}
// Para una pantalla que recibe la captura por otro camino (el detalle de una liquidación). La lectura que se recuerda sale de
// validar y recalcular la captura entera después de congelarla: no depende de que quien llama la haya verificado antes.
export function rememberedRunCapture(capture){
 if(ownHistoricalOfficialInput(capture?.saved?.input)&&!read.has(capture)){frozen(capture);read.set(capture,ownHistoricalRunResult(capture));}
 return capture;
}
export const ownRunRows=(capture,search='',page=1,pageSize=25)=>ownRunWorkspaceRows(capture,search,page,pageSize,ownRunResult);
export const ownRunCsv=capture=>ownRunWorkspaceCsv(capture,ownRunResult);
/**
 * Lo propio de un resultado con total oficial, para decirlo en pantalla: en cuántos legajos el neto oficial difiere de la suma de
 * sus renglones (la diferencia queda en la conciliación; no existe un concepto de ajuste) y cuántos renglones el recibo no
 * imprime por una decisión de emisión conservada. `null` para un resultado histórico.
 */
export function ownRunOfficialSummary(capture){
 if(!ownHistoricalOfficialInput(capture?.saved?.input))return null;
 const {result}=ownRunResult(capture),lines=new Map(result.lineEmployeeTotals.map(t=>[t.contractId,t]));
 return {reconciled:result.employeeTotals.filter(t=>t.net!==lines.get(t.contractId).net).length,employees:result.employeeCount,
  omitted:(result.rowEmissions??[]).filter(d=>d.decision==='omit').length};
}
export function ownRunOfficialText(summary){
 if(!summary)return '';
 const parts=['Los totales son los oficiales de la liquidación.'];
 parts.push(summary.reconciled===0?'En todos los legajos coinciden con la suma de sus renglones.':(summary.reconciled===1?'En 1 legajo el neto oficial difiere':'En '+summary.reconciled+' legajos el neto oficial difiere')+' de la suma de sus renglones por el redondeo del total: la diferencia queda registrada en la conciliación y no se agrega ningún concepto de ajuste.');
 if(summary.omitted>0)parts.push(summary.omitted===1?'1 renglón en cero no se imprime en el recibo; sigue en el resultado.':summary.omitted+' renglones en cero no se imprimen en el recibo; siguen en el resultado.');
 return parts.join(' ');
}
