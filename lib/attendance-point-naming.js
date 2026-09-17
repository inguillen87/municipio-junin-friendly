import { getReportedAttendanceInventory } from './internal-attendance-reported-inventory.js';
// Use the tenant's reported workbook and an exact point key, never fuzzy names,
// serials or the numbering of a vendor application. No device identity is changed.
export function canonicalFleetPointNames(data, principal) {
  const inventory = getReportedAttendanceInventory(principal);
  if (!inventory) return data;
  const names = new Map(inventory.data.map(site => [site.code.toLowerCase(), site.name]));
  return { ...data, devices: data.devices.map(device => names.has(device.siteKey)
    ? { ...device, label: names.get(device.siteKey) }
    : { ...device }) };
}

export function canonicalClockOperationPointNames(data, principal) {
  const inventory = getReportedAttendanceInventory(principal);
  if (!inventory) return data;
  const names = new Map(inventory.data.map(site => [site.code.toLowerCase(), site.name]));
  const namePoint = site => site && names.has(site.key)
    ? { ...site, label: names.get(site.key) }
    : site;
  return { ...data, site: namePoint(data.site), sites: data.sites.map(namePoint) };
}
