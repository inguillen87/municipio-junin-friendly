import { familyPreparationInputPins } from '../../lib/adopted-family-preparation.js';
export const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const hex = digit => digit.repeat(64);
export function reseal(input) {
  input.manifest={cohortCount:input.cohort.length,rowCount:input.rows.length,...familyPreparationInputPins(input)};
  return input;
}
export function subject(n, scope, source) {
  return {contractId:id(100+n),personId:id(1000+n),registrationId:id(2000+n),decisionId:id(3000+n),decision:'approve',
    applicationXid:'9001',decisionXid:'9001',tenantId:scope.tenantId,sourceBindingId:scope.sourceBindingId,
    beforeContractId:id(100+n),beforePersonId:id(1000+n),beforeSourceSystem:'GRH',beforeTenantId:null,beforeSourceBatchId:source.batchId,
    companyId:source.companyId,legajo:String(1000+n),currentSourceSystem:'MUNICONTROL',currentSourceBatchId:null,currentNativeRegistrationId:id(2000+n),
    registeredContractId:id(100+n),registeredPersonId:id(1000+n),registeredTenantId:scope.tenantId,registeredSourceBindingId:scope.sourceBindingId,
    afterContractSha256:hex('c'),currentContractSha256:hex('c')};
}
export function sourceRow(n, source, legajo) {
  return {familyId:String(n),importRunId:source.importRunId,companyId:source.companyId,legajo,relationshipCode:'2',
    familyName:`Hijo exclusivamente sintético ${n}`,birthDate:'2015-03-04',dni:String(91000000+n),endDate:null,
    identityNameKey:`hijo exclusivamente sintetico ${n}`,sourceRowSha256:hex('d'),sourcePayloadSha256:hex('e')};
}
export function inputFixture() {
  const scope={tenantId:id(1),sourceBindingId:id(2)};
  const source={system:'GRH',database:'grh_synthetic_only',companyId:'101',batchId:id(3),importRunId:'99',
    cutoff:'2026-09-10T18:17:30Z',sourceSha256:hex('a'),relationship:{id:'2',code:'H',name:'HIJO',label:'HIJO',evidenceSha256:hex('b')}};
  const cohort=[subject(1,scope,source),subject(2,scope,source)];
  const rows=[sourceRow(1,source,'1001'),sourceRow(2,source,'1001'),sourceRow(3,source,'1001'),sourceRow(4,source,'1002')];
  rows[0].dni='91.000.001';rows[1].endDate='2020-02-03';rows[2].relationshipCode='1';
  rows[3].birthDate=null;rows[3].dni=null;
  return reseal({version:'adopted-family-preparation-input.v1',scope,source,asOfDate:'2026-11-05',cohort,rows,ownMembers:[],sourceLinks:[],manifest:{}});
}
export function currentContext(row) {
  return {version:'employee-family-context.v2',canDeclare:true,subject:{contractId:row.contractId,legajo:'1001',
    employeeName:'Persona exclusivamente sintética QA',sourceCutoff:null,identityToken:hex('f'),origin:'MUNICONTROL',
    registrationId:row.registrationId,registeredAt:'2026-10-01T12:00:00Z'}};
}
export function reviewFor(plan,row) {
  return {planSha256:plan.planSha256,sourceKey:row.sourceKey,sourceRowSha256:row.sourceRowSha256,
    action:'prepare_declaration',acknowledgeHistoricalEnd:row.historicalEndDatePresent};
}
export function memberAndLink(input,row) {
  const member={id:id(7001),tenantId:input.scope.tenantId,sourceBindingId:input.scope.sourceBindingId,contractId:row.contractId,
    personId:row.personId,registrationId:row.registrationId,identityToken:hex('9'),identityNameKey:row.identityNameKey,
    birthDate:row.values.birthDate,dni:row.values.dni};
  const link={sourceKey:row.sourceKey,tenantId:input.scope.tenantId,sourceBindingId:input.scope.sourceBindingId,contractId:row.contractId,
    registrationId:row.registrationId,sourceRowSha256:row.sourceRowSha256,sourceProjectionSha256:row.sourceProjectionSha256,
    memberId:member.id,memberIdentityToken:member.identityToken};
  return {member,link};
}
