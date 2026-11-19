// Invented identities, declarations and approval references. This fixture does
// not establish the real effective date or approval of the municipal rule.
import {OWN_AREA_PRESENTISMO107_INPUT_VERSION,OWN_AREA_PRESENTISMO107_RULE_VERSION} from '../../lib/own-area-presentismo107.js';
export const area107Uuid = n => '00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
export const area107Hash = n => n.toString(16).padStart(64,'0');
export const area107Reference = n => ({id:area107Uuid(n),sha256:area107Hash(n)});
const refs = (quantity,n) => quantity !== null && BigInt(quantity) > 0n ? [area107Reference(n)] : [];

export function area107Fixture({incidences='0',absenceDays='0',unconvertedTardiness='0'}={}) {
  const area = {organizationUnitSourceId:'synthetic-area',sectorSourceId:'synthetic-sector'};
  return {
    version:OWN_AREA_PRESENTISMO107_INPUT_VERSION,periodMonth:'2026-10-01',
    subject:{tenantId:area107Uuid(1),sourceBindingId:area107Uuid(2),contractId:area107Uuid(3),
      identityToken:area107Hash(4),agreementCode:'1',area:{...area}},
    policy:{id:area107Uuid(5),revision:1,sha256:area107Hash(6),ruleVersion:OWN_AREA_PRESENTISMO107_RULE_VERSION,
      status:'approved',approvalId:area107Uuid(7),scope:{tenantId:area107Uuid(1),sourceBindingId:area107Uuid(2),
        area:{...area},agreementCodes:['1','4','6']},validFrom:'2026-10-01',validUntil:'2026-10-31'},
    cut:{id:area107Uuid(8),sha256:area107Hash(9),from:'2026-10-01',to:'2026-10-31',complete:true},
    incidences107:{quantity:incidences,origin:'additional_declared_107_excluding_101',evidenceRefs:refs(incidences,10)},
    absence101Days:{quantity:absenceDays,origin:'declared_whole_unjustified_days_101',evidenceRefs:refs(absenceDays,11)},
    tardiness:{unconvertedCount:unconvertedTardiness,evidenceRefs:refs(unconvertedTardiness,12)},
  };
}
