import {ownLiquidationBootstrap} from './own-payroll-liquidation-model.js';
import {ownRunWorkspaceAccess,OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {salarySerialized,salaryUuid,salaryHash} from './native-salary-catalog-model.js';

export function ownSummaryAccess(payload,now=Date.now()){
 const access=ownRunWorkspaceAccess(payload,now),scope=payload.access;
 return {...access,authorityKey:access.key,key:salarySerialized([access.key,payload.sessionVersion,payload.expiresAt,scope.membershipId??null,scope.bindingId??null,scope.bindingVersion??null,scope.tenant.membershipId??null,scope.tenant.version??null])};
}

export function ownSummaryRows(value,{period='',liquidationType='',page=1,pageSize=20}={}){
 const boot=ownLiquidationBootstrap(value);
 if(typeof period!=='string'||period&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period)||typeof liquidationType!=='string'||liquidationType&&!Object.hasOwn(OWN_RUN_TYPES,liquidationType)||!Number.isSafeInteger(page)||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)throw Error('Elegí un período y un tipo de liquidación válidos.');
 const all=boot.runs.filter(r=>(!period||r.period===period)&&(!liquidationType||r.liquidationType===liquidationType)).toSorted((a,b)=>b.period.localeCompare(a.period)||Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(all.length/pageSize)),current=Math.max(1,Math.min(page,pages));
 return {total:boot.runs.length,filtered:all.length,page:current,pages,rows:all.slice((current-1)*pageSize,current*pageSize)};
}

export function ownSummaryReviewContext(value,{row,accessKey}){
 const boot=ownLiquidationBootstrap(value);
 if(!salaryUuid(row?.id)||!salaryHash(row?.resultSha256)||typeof accessKey!=='string'||!accessKey)throw Error('Actualizá la consulta antes de abrir el resultado.');
 ownLiquidationBootstrap({...boot,runs:[row]});
 const current=boot.runs.find(r=>r.id===row.id);
 if(!current||salarySerialized(current)!==salarySerialized(row)||current.canConsult!==true)throw Error('Cambió el resultado o su autorización. Actualizá las corridas antes de revisarlo.');
 return Object.freeze({runId:current.id,resultSha256:current.resultSha256,contractId:null,accessKey});
}
