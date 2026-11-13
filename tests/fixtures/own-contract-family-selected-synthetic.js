import {syntheticFamilySource,syntheticFamilyItems,familyId,familyHash,familyReason} from './own-contract-family-payroll-facts-synthetic.js';
import {FAMILY_SELECTED_VERSION} from '../../assets/own-contract-family-payroll-facts-selection.js';
import {familyPayrollFactsHash} from '../../assets/own-contract-family-payroll-facts-model.js';
export {familyId,familyHash,familyReason};
export const selectedIds=()=>[familyId(1),familyId(2)];
export const selectedBootstrap=()=>({version:FAMILY_SELECTED_VERSION,period:'2026-10',contractIds:selectedIds(),scopeVersion:familyHash,source:syntheticFamilySource(2),configuration:{version:familyHash,items:[],records:[]},proposals:[],legacyPendingProposals:[],permissions:{canPropose:true,canReview:false},complete:true,payrollCalculated:false,payrollPosted:false});
export const selectedCommand=()=>({version:FAMILY_SELECTED_VERSION,contractIds:selectedIds(),command:'propose',period:'2026-10',scopeVersion:familyHash,baseVersion:familyHash,sourceVersion:familyHash,proposalId:null,proposalSha256:null,items:syntheticFamilyItems(2),reason:familyReason,reviewConfirmed:false});
export const selectedHistory=()=>({version:FAMILY_SELECTED_VERSION,period:'2026-10',proposals:[],permissions:{canPropose:true,canReview:false},complete:true,payrollCalculated:false,payrollPosted:false});
export async function selectedDetail(){
 const body=selectedCommand();return{version:FAMILY_SELECTED_VERSION,period:body.period,contractIds:body.contractIds,scopeVersion:'b'.repeat(64),body,baseItems:[],source:syntheticFamilySource(2),current:true,permissions:{canPropose:false,canReview:true},proposal:{id:familyId(10001),requestSha256:await familyPayrollFactsHash(body),baseVersion:familyHash,sourceVersion:familyHash,itemCount:2,reason:familyReason,createdAt:'2026-10-12T12:00:00Z',authorLabel:'Preparador exclusivamente sintético',canReview:true,status:'pending',decision:null,contractIds:body.contractIds}};
}
export async function selectedReceipt(){
 const body=selectedCommand();return{version:FAMILY_SELECTED_VERSION,eventId:familyId(10001),proposalId:familyId(10001),requestKey:familyId(10002),requestSha256:await familyPayrollFactsHash(body),body,status:'pending',revision:0,configurationVersion:familyHash,replayed:false,payrollCalculated:false,payrollPosted:false};
}
