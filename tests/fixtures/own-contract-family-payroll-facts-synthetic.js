// Datos exclusivamente sintéticos para la propuesta de hechos familiares de liquidación.
import { FAMILY_PAYROLL_FACTS_VERSION, FAMILY_PAYROLL_FACT_QUANTITIES, familyPayrollFactsHash } from '../../assets/own-contract-family-payroll-facts-model.js';
export const familyId = n => '30000000-0000-4000-8000-' + n.toString(16).padStart(12,'0');
export const familyHash = 'c'.repeat(64);
export const familyReason = 'Declaración exclusivamente sintética del conjunto completo';
export const syntheticFamilyDefinition = () => ({quantities:Object.fromEntries(FAMILY_PAYROLL_FACT_QUANTITIES.map(k=>[k,null])),prenatalAdjustmentMonths:null,tariffSelection:{region:null,semesterAverage:null},asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA'});
export const syntheticFamilyItems = (count=1) => Array.from({length:count},(_,i)=>({contractId:familyId(i+1),identityToken:familyHash,definition:syntheticFamilyDefinition()}));
export const syntheticFamilySource = (count=1) => ({version:familyHash,subjects:Array.from({length:count},(_,i)=>({contractId:familyId(i+1),registrationId:'40000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0'),legajo:'QA-'+(i+1),employeeName:'Agente exclusivamente sintético',identityToken:familyHash,sourceCutoff:null,origin:'MUNICONTROL',registeredAt:'2026-09-01T12:00:00Z'}))});
export const syntheticFamilyBootstrap = (count=1) => ({version:FAMILY_PAYROLL_FACTS_VERSION,period:'2026-10',scopeVersion:familyHash,source:syntheticFamilySource(count),configuration:{version:familyHash,revision:0,items:[],proposalId:null,approvalId:null},proposals:[],permissions:{canPropose:true,canReview:false},complete:true,payrollCalculated:false,payrollPosted:false});
export const syntheticFamilyCommand = (count=1) => ({command:'propose',period:'2026-10',scopeVersion:familyHash,baseVersion:familyHash,sourceVersion:familyHash,proposalId:null,proposalSha256:null,items:syntheticFamilyItems(count),reason:familyReason,reviewConfirmed:false});
export async function syntheticFamilyDetail(count=1) {
 const body=syntheticFamilyCommand(count);
 return {version:FAMILY_PAYROLL_FACTS_VERSION,period:'2026-10',scopeVersion:familyHash,body,baseItems:[],source:syntheticFamilySource(count),current:true,proposal:{id:familyId(10001),requestSha256:await familyPayrollFactsHash(body),baseVersion:familyHash,sourceVersion:familyHash,itemCount:count,reason:body.reason,createdAt:'2026-10-10T12:00:00Z',authorLabel:'Preparador exclusivamente sintético',canReview:true,status:'pending',decision:null}};
}
