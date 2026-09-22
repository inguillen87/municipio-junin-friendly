import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { getActionCenterSql, actionMutationSession } from './internal-actions.js';
import { getClockFleet } from '../lib/internal-clock-fleet.js';
import { assertClockSourceDashboard } from '../assets/clock-source-model.js';
import { getClockSourceSql, readClockSourceFleet } from '../lib/clock-source-store.js';
import { sourceCoreInventory } from '../lib/clock-source-core.js';
import { sourceHeaders, sourceRequestShape } from '../lib/clock-source-http.js';
import { assertSourceFleet, safeSourceError, sourceBindingCoordinates, sourceFail, sourceHash } from '../lib/clock-source-contract.js';
export const config = {api:{bodyParser:false}};
function authority(access,session) {
  if (access?.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal,['attendance.read'])) sourceFail('CLOCK_SOURCE_FORBIDDEN');
  const p = access.principal, coordinates = sourceBindingCoordinates(p);
  return {coordinates,fingerprint:sourceHash(JSON.stringify({coordinates,email:p.user?.email,identityVersion:p.user?.identityVersion,membershipId:p.tenant.membershipId,session}))};
}
export function createInternalClockSourceHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.authorize ?? requireCompatibleInternalAccess;
  const options = {env,requiredCapabilities:['attendance.read'],requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false};
  return async (req,res) => {
    sourceHeaders(res);
    try {
      if (req.method !== 'GET') { res.setHeader('Allow','GET'); sourceFail('METHOD_NOT_ALLOWED'); }
      sourceRequestShape(req,'/api/internal-clock-source');
      const first = await authorize(req,res,options); if (!first) return;
      const session = (deps.sessionFor ?? actionMutationSession)(first,env), initial = authority(first,session);
      const coreSql = await (deps.getCoreSql ?? getActionCenterSql)(env);
      const core = await (deps.getFleet ?? getClockFleet)(coreSql,first.principal,session);
      const before = await sourceCoreInventory(coreSql,first.principal,session,core,deps.readDevices);
      const sourceSql = await (deps.getSourceSql ?? getClockSourceSql)(env,'reader');
      const deviceIds = before.devices.map(device => device.deviceId);
      const source = assertSourceFleet(await (deps.readFleet ?? readClockSourceFleet)(sourceSql,initial.coordinates,deviceIds),initial.coordinates,deviceIds);
      const sites = new Map(before.devices.map(device => [device.deviceId,device.coreSiteId]));
      if (source.devices.some(device => device.enrolled && device.siteId !== sites.get(device.deviceId))) sourceFail('CLOCK_SOURCE_BINDING_CHANGED');
      // This is a composed observation across two databases, not a distributed
      // transaction. Revalidate both authority and inventory before disclosing it.
      const current = await authorize(req,res,options); if (!current) return;
      const currentSession = (deps.sessionFor ?? actionMutationSession)(current,env), final = authority(current,currentSession);
      if (final.fingerprint !== initial.fingerprint) sourceFail('CLOCK_SOURCE_BINDING_CHANGED');
      const refreshedCore = await (deps.getFleet ?? getClockFleet)(coreSql,current.principal,currentSession);
      const after = await sourceCoreInventory(coreSql,current.principal,currentSession,refreshedCore,deps.readDevices);
      if (after.fingerprint !== before.fingerprint) sourceFail('CLOCK_SOURCE_SNAPSHOT_CHANGED');
      const byId = new Map(after.devices.map(({coreSiteId,coreVersion,...device}) => [device.deviceId,device]));
      const result = {version:'clock-source-dashboard.v1',checkedAt:new Date().toISOString(),coreCheckedAt:refreshedCore.checkedAt,sourceCheckedAt:source.checkedAt,
        snapshotConsistency:'composed_revalidated',sourceBindingSha256:source.sourceBindingSha256,revision:source.revision,
        devices:source.devices.map(device => ({...device,...byId.get(device.deviceId)})),scope:'source_only',reconciliationState:'pending',payrollModified:false,liveConnectionVerified:false};
      try { assertClockSourceDashboard(result); } catch { sourceFail('CLOCK_SOURCE_RESPONSE_INVALID'); }
      return res.status(200).json({ok:true,...result});
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) { const denied = safeSourceError({message:error.status === 401 ? 'CLOCK_SOURCE_AUTH_DENIED' : 'CLOCK_SOURCE_FORBIDDEN'}); return res.status(denied.status).json({ok:false,code:denied.code,error:denied.message}); }
      const safe = safeSourceError(error); return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
    }
  };
}
export default createInternalClockSourceHandler();
