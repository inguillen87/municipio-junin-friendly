import {finalAdoptionRaw} from './final-contract-adoption-synthetic.js';

// Explicit synthetic server response, not a client-side filter of a real roster.
export function activeAdoptionRaw(count=57){
 const raw=finalAdoptionRaw(count);
 raw.source.operationalCohort={version:'active-contracts.v1',sourceTotal:count+23,archivedTotal:23};
 raw.rows=raw.rows.map((row,n)=>({...row,status:'active',endDate:null,jurisdictionCode:n%2?'55':'42',sourceRowNumber:n+24}));
 return raw;
}
