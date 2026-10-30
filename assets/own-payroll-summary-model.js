import {ownLiquidationBootstrap} from './own-payroll-liquidation-model.js';
import {ownRunWorkspaceAccess,OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {salarySerialized,salaryUuid,salaryHash} from './native-salary-catalog-model.js';
import {requestedOwnAnnulPreparation} from './own-payroll-annulment-preparation-link.js';

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

// Closed task profiles share the native service and verified handoff, not the
// historical GRH endpoint. Prefixes are closed source strings, never user HTML.
const taskProfiles=Object.freeze({
 resumen:Object.freeze({id:'resumen',domPrefix:'ownSummary',title:'Tu trabajo de liquidación, en un lugar',description:'Consultá los cálculos guardados en MuniControl y abrí su resultado para continuar el circuito.',preparation:false}),
 historial:Object.freeze({id:'historial',domPrefix:'ownNativeHistory',title:'Historial de liquidaciones propias',description:'Consultá cada cálculo guardado en MuniControl y abrí sus fuentes, estados y decisiones. Las versiones anteriores se conservan.',preparation:false}),
 correcciones:Object.freeze({id:'correcciones',domPrefix:'ownNativeCorrections',title:'Corregir una liquidación propia',description:'Abrí el resultado propio para revisar la anulación necesaria y preparar otro cálculo con doble control. El cálculo anterior permanece como antecedente.',preparation:true})
});
export function ownSummaryTaskProfile(taskId='resumen'){
 if(typeof taskId!=='string'||!Object.hasOwn(taskProfiles,taskId))throw Error('La tarea no admite una consulta propia de liquidaciones.');
 return taskProfiles[taskId];
}
// A copied209 link is only a reference. Calcular must reread209 under its
// current user before offering any dates/contracts; no consent/key travels.
export function ownSummaryPreparationReference(value,origin){
 const fail=()=>{throw Error('Pegá el enlace de preparación copiado desde la anulación de este mismo sitio.');};
 if(typeof value!=='string'||!value||value!==value.trim()||value.length>2048||/[\u0000-\u001f\u007f]/u.test(value)||typeof origin!=='string')fail();
 let base,url;try{base=new URL(origin);url=new URL(value,base);}catch{fail();}
 if(!['http:','https:'].includes(base.protocol)||base.origin!==origin||url.origin!==origin||url.username||url.password||url.pathname!=='/nomina'||url.hash!=='#calculo')fail();
 const reference=requestedOwnAnnulPreparation(url.search);
 if(reference?.kind!=='projected_annulment')fail();
 return reference;
}
