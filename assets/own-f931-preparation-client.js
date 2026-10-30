import {ownF931Params} from './own-f931-contract.js';
import {prepareOwnF931,prepareOwnF931Historical} from './own-f931-preparation-model.js';
import {verifiedOwnReportCensus} from './own-payroll-report-census-model.js';
import {ownReportBundle} from './own-payroll-report-model.js';
import {verifiedOwnLiquidationDetail} from './own-payroll-liquidation-model.js';
import {verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from './own-payroll-close-model.js';
import {verifiedFiscalFactsCensus} from './own-fiscal-facts-model.js';
// GET-only adapter to the existing own-close authority. No fiscal/nominal
// writes, pagination-derived population or current-roster substitutions.
export async function loadOwnF931Preparation(value,{read,readFiscal=null,session,valid=()=>true}){
 const params=ownF931Params(value),details=[],receipts=[];
 const current=()=>{if(!valid())throw Object.assign(Error('La consulta fue retirada.'),{name:'AbortError'});};
 await session();current();
 for(const type of params.types){
  const detail=await verifiedOwnCloseDetail(await read({resource:'detail',period:params.period,liquidationType:type}));current();details.push(detail);
  for(const group of detail.groups.filter(g=>g.state==='closed')){
   receipts.push(await verifiedOwnCloseReceipt(await read({resource:'group',id:group.id})));current();
  }
 }
 const fiscal=readFiscal?await verifiedFiscalFactsCensus(await readFiscal({resource:'census',period:params.period}),params.period):null;current();
 const result=await prepareOwnF931(params,details,receipts,fiscal);current();
 // Reject a changing census even when every individual response is valid.
 for(const detail of details){
  const fresh=await verifiedOwnCloseDetail(await read({resource:'detail',period:detail.period,liquidationType:detail.liquidationType}));current();
  if(fresh.stateVersion!==detail.stateVersion||fresh.scopeVersion!==detail.scopeVersion||JSON.stringify(fresh.groups)!==JSON.stringify(detail.groups))throw Error('Cambió el histórico durante la revisión. Consultá de nuevo el conjunto completo.');
 }
 if(fiscal){const fresh=await verifiedFiscalFactsCensus(await readFiscal({resource:'census',period:params.period}),params.period);current();if(fresh.scopeVersion!==fiscal.scopeVersion||fresh.stateVersion!==fiscal.stateVersion)throw Error('Cambió el registro fiscal durante la revisión. Consultá de nuevo el conjunto completo.');}
 await session();current();return result;
}

// Explicit historical v2 reader. This never falls back to operational detail or
// current roster/rules; unavailable original sources keep their original failure.
export async function loadOwnF931HistoricalPreparation(value,{read,readCapture,readFiscal=null,session,valid=()=>true}){
 const params=ownF931Params(value),censuses=[],receipts=[],captures=[];
 const current=()=>{if(!valid())throw Object.assign(Error('La consulta fue retirada.'),{name:'AbortError'});};
 await session();current();
 for(const type of params.types){
  const census=await verifiedOwnReportCensus(await read({resource:'report-census',period:params.period,liquidationType:type}));current();censuses.push(census);
  for(const group of census.groups.filter(g=>g.state==='closed')){receipts.push(await verifiedOwnCloseReceipt(await read({resource:'group',id:group.id})));current();}
 }
 const bundle=ownReportBundle({from:params.period,to:params.period,types:params.types},censuses,receipts);
 const ids=[...new Set(bundle.employees.map(r=>r.employee.runId))].sort();
 if(ids.length&&typeof readCapture!=='function')throw Error('Falta la lectura completa de las capturas originales.');
 for(const id of ids){const original=await verifiedOwnLiquidationDetail(await readCapture({resource:'detail',id}));current();if(original.id!==id||original.capture.id!==id)throw Error('La captura original pertenece a otra liquidación.');captures.push(original.capture);}
 const fiscal=readFiscal?await verifiedFiscalFactsCensus(await readFiscal({resource:'census',period:params.period}),params.period):null;current();
 const result=await prepareOwnF931Historical(params,censuses,receipts,captures,fiscal);current();
 for(const census of censuses){const fresh=await verifiedOwnReportCensus(await read({resource:'report-census',period:census.period,liquidationType:census.liquidationType}));current();if(fresh.sourceVersion!==census.sourceVersion||fresh.scopeVersion!==census.scopeVersion)throw Error('Cambió el histórico durante la revisión. Consultá de nuevo el conjunto completo.');}
 if(fiscal){const fresh=await verifiedFiscalFactsCensus(await readFiscal({resource:'census',period:params.period}),params.period);current();if(fresh.scopeVersion!==fiscal.scopeVersion||fresh.stateVersion!==fiscal.stateVersion)throw Error('Cambió el registro fiscal durante la revisión. Consultá de nuevo el conjunto completo.');}
 await session();current();return result;
}
