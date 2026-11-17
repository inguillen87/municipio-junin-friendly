import {attendanceAreaRead} from './internal-attendance-area.js';
import {attendanceDailyDigest, validateAttendanceDailySource} from './attendance-daily-incidents.js';

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(new Error('ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'), {code:'ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'}); };

/**
 * Compose the first safe T4 input slice from the existing area-scoped, single-cut
 * SQL reader. Workdays and population are from that same read. Catalog,
 * coverage and justifications remain explicitly incomplete until their
 * authoritative SQL projections can be joined into that statement.
 *
 * This is intentionally not a notice evaluator or HTTP handler. B injects this
 * function into its own authenticated reader.
 */
export async function produceAttendanceDailySource(sql, principal, session, q) {
  const areaSource = await attendanceAreaRead(sql, principal, session, q);
  if (!exact(areaSource, ['version','principal','area','areaLabel','day','site','population','expectedDevices','workdays','sourceCut','blockerCodes','coverageCertified','installationReady','payrollPosted','NoeliaReady']) ||
      areaSource.version !== 'attendance-area-workdays.v1' ||
      areaSource.sourceCut?.consistency !== 'single_snapshot' ||
      areaSource.sourceCut?.id !== areaSource.workdays?.revision ||
      areaSource.sourceCut?.generatedAt !== areaSource.workdays?.generatedAt ||
      !Array.isArray(areaSource.population?.contracts)) fail();

  const generatedAt = areaSource.workdays.generatedAt;
  const members = areaSource.population.contracts.map(contract => ({
    contractId: contract.id,
    area: areaSource.area,
    identityBinding: null,
    expectedDeviceKeys: null,
  }));
  const workdays = areaSource.workdays;
  const population = {
    complete: areaSource.population.complete === true,
    evidence: null,
    members,
  };
  // The approved-assignment projection is not yet joined into this statement. An empty
  // catalog is not treated as a valid schedule and the evaluator must block.
  const catalog = {complete:false, assignments:[]};
  const coverage = {
    status:'a_confirmar', evidence:null, sourceRevision:workdays.revision,
    fromAt:generatedAt, throughAt:generatedAt, contractIds:[], deviceKeys:[],
  };
  const justifications = {complete:false, evidence:null, entries:[]};
  const input = {
    version:'attendance-daily-source.v1',
    scope:{
      tenantId:areaSource.principal.tenantId,
      sourceBindingId:areaSource.principal.sourceBindingId,
      area:areaSource.area,
      site:areaSource.site,
      day:areaSource.day,
      timezone:workdays.timezone,
    },
    cut:{
      id:areaSource.sourceCut.id,
      generatedAt,
      consistency:'unconfirmed',
      evidence:null,
      componentSha256:{
        workdays:attendanceDailyDigest(workdays),
        population:attendanceDailyDigest(population),
        catalog:attendanceDailyDigest(catalog),
        coverage:attendanceDailyDigest(coverage),
        justifications:attendanceDailyDigest(justifications),
      },
    },
    workdays,population,catalog,coverage,justifications,
  };
  return validateAttendanceDailySource(input);
}
