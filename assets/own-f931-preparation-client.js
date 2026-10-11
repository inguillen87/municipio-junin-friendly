import {ownF931Params} from './own-f931-contract.js';
import {prepareOwnF931} from './own-f931-preparation-model.js';
import {verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from './own-payroll-close-model.js';
// GET-only adapter to the existing own-close authority. No fiscal/nominal
// writes, pagination-derived population or current-roster substitutions.
export async function loadOwnF931Preparation(value,{read,session,valid=()=>true}){
 const params=ownF931Params(value),details=[],receipts=[];
 const current=()=>{if(!valid())throw Object.assign(Error('La consulta fue retirada.'),{name:'AbortError'});};
 await session();current();
 for(const type of params.types){
  const detail=await verifiedOwnCloseDetail(await read({resource:'detail',period:params.period,liquidationType:type}));current();details.push(detail);
  for(const group of detail.groups.filter(g=>g.state==='closed')){
   receipts.push(await verifiedOwnCloseReceipt(await read({resource:'group',id:group.id})));current();
  }
 }
 const result=await prepareOwnF931(params,details,receipts);current();
 // Reject a changing census even when every individual response is valid.
 for(const detail of details){
  const fresh=await verifiedOwnCloseDetail(await read({resource:'detail',period:detail.period,liquidationType:detail.liquidationType}));current();
  if(fresh.stateVersion!==detail.stateVersion||fresh.scopeVersion!==detail.scopeVersion||JSON.stringify(fresh.groups)!==JSON.stringify(detail.groups))throw Error('Cambió el histórico durante la revisión. Consultá de nuevo el conjunto completo.');
 }
 await session();current();return result;
}
