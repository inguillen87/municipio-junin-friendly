import {ownRunCapture} from './own-payroll-run-model.js';

// ownRunCapture validates the exact payload keys from the ORIGINAL programme
// and liquidation type, including the193 monthly/157 distinction. Project only
// after that check: an injected, absent or null fact is never a domain selector.
// Reuse that canonical schema instead of duplicating its feature-flag table.
export function ownRunPopulationPreimage(original){
 ownRunCapture(original);
 const {programState,population,monthly,fixed,period,liquidationType,selection,sourceInventory,...facts}=original.payload;
 return Object.keys(facts).length?{employees:population.employees,...facts}:population.employees;
}
