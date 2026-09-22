import { listAttendanceResources } from './internal-attendance-gateway.js';
import { sourceFail, sourceHash, sourceUuid } from './clock-source-contract.js';

// The existing facade authorizes attendance.read. Its optional administrator
// network/serial fields are deliberately discarded at this boundary.
export async function sourceCoreInventory(sql,principal,session,fleet,readDevices = listAttendanceResources) {
  if (!fleet || !Array.isArray(fleet.devices) || fleet.devices.length > 200) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
  const all = new Map(); let expectedTotal;
  for (let page = 1; page <= 2; page++) {
    const result = await readDevices(sql,principal,{resource:'device',page,pageSize:100},session);
    const p = result?.pagination;
    if (result?.resource !== 'device' || !Array.isArray(result.data) || !p || p.page !== page || p.pageSize !== 100
      || !Number.isSafeInteger(p.total) || p.total < 0 || p.total > 200 || p.pages !== Math.ceil(p.total / 100)
      || expectedTotal !== undefined && p.total !== expectedTotal || result.data.length !== Math.min(100,Math.max(0,p.total-(page-1)*100))) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
    expectedTotal = p.total;
    for (const row of result.data) {
      if (!sourceUuid(row?.id) || !sourceUuid(row.siteId) || !Number.isSafeInteger(row.version) || row.version < 1 || all.has(row.id)) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
      all.set(row.id,{coreSiteId:row.siteId,coreVersion:row.version,driverKey:row.driverKey,model:row.model,status:row.status});
    }
    if (page >= p.pages) break;
  }
  if (all.size !== expectedTotal) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
  const devices = fleet.devices.map(({deviceId,siteKey,label,model,deviceState}) => {
    const current = all.get(deviceId);
    if (!current || current.driverKey !== 'zk40-snapshot.v1' || current.model !== model || current.status !== deviceState) sourceFail('CLOCK_SOURCE_SNAPSHOT_CHANGED');
    return {deviceId,siteKey,label,model,deviceState,coreSiteId:current.coreSiteId,coreVersion:current.coreVersion};
  }).sort((a,b) => a.deviceId.localeCompare(b.deviceId));
  if (devices.some(device => !sourceUuid(device.deviceId)) || new Set(devices.map(device => device.deviceId)).size !== devices.length) sourceFail('CLOCK_SOURCE_RESPONSE_INVALID');
  return {devices,fingerprint:sourceHash(JSON.stringify(devices))};
}
