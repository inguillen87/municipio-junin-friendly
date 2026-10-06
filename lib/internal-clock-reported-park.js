import {getReportedAttendanceInventory} from './internal-attendance-reported-inventory.js';
import {assertReportedClockPark} from '../assets/clock-fleet-workspace-model.js';

// This is the existing tenant-scoped reported inventory, never a registration
// or proof of device connectivity. Discard coordinates, addresses and networks.
export function getReportedClockPark(principal){
 const inventory=getReportedAttendanceInventory(principal);
 if(!inventory)return null;
 return assertReportedClockPark({version:'clock-reported-park.v1',physicalConnectionVerified:false,pointCount:inventory.data.length,points:inventory.data.map(p=>({siteKey:p.code.toLowerCase(),label:p.name,model:p.model}))});
}
