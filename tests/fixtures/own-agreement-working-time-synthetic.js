import { agreementWorkingTimeHash } from '../../assets/own-agreement-working-time-model.js';
export const agreementTimeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const agreementTimeKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const agreementTimeHash = character => character.repeat(64);
export const agreementTimeDefinition = () => ({monthlyHours:'160.25000001', asOfDate:'2026-10-01', documentReference:'Constancia exclusivamente sintética de convenio'});
export function syntheticAgreementTimeBootstrap(count = 3) {
 const agreements = Array.from({length:count}, (_, i) => ({agreementCode:String(i + 1).padStart(4, '0'), agreementToken:agreementTimeHash(i % 2 ? 'b' : 'a'), label:'Convenio sintético ' + (i + 1), registrationAllowed:i % 2 === 0}));
 return {version:'own-agreement-working-time.v1', period:'2026-10', scopeVersion:agreementTimeHash('c'), source:{version:agreementTimeHash('d'), agreements}, configuration:{version:agreementTimeHash('e'), revision:0, items:[], proposalId:null, approvalId:null}, proposals:[], permissions:{canPropose:true, canReview:true}, complete:true, payrollCalculated:false, payrollPosted:false};
}
export const syntheticAgreementTimeItems = bootstrap => bootstrap.source.agreements.map(r => ({agreementCode:r.agreementCode, agreementToken:r.agreementToken, definition:agreementTimeDefinition()}));
export function syntheticAgreementTimeCommand(bootstrap = syntheticAgreementTimeBootstrap()) {
 return {command:'propose', period:bootstrap.period, scopeVersion:bootstrap.scopeVersion, baseVersion:bootstrap.configuration.version, sourceVersion:bootstrap.source.version, proposalId:null, proposalSha256:null, items:syntheticAgreementTimeItems(bootstrap), reason:'Propuesta completa exclusivamente sintética QA', reviewConfirmed:false};
}
export async function syntheticAgreementTimeDetail(bootstrap = syntheticAgreementTimeBootstrap()) {
 const body = syntheticAgreementTimeCommand(bootstrap), proposal = {id:agreementTimeId, requestSha256:await agreementWorkingTimeHash(body), baseVersion:body.baseVersion, sourceVersion:body.sourceVersion, itemCount:body.items.length, reason:body.reason, createdAt:'2026-10-14T10:00:00Z', authorLabel:'Persona sintética QA', canReview:true, status:'pending', decision:null};
 return {version:bootstrap.version, period:bootstrap.period, scopeVersion:bootstrap.scopeVersion, proposal, body, baseItems:[], source:structuredClone(bootstrap.source), current:true};
}
