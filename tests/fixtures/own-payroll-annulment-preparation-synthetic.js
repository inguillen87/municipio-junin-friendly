// Entirely invented metadata; no municipal identities, amounts, SQL or engine.
// The private-census digest below is a synthetic stand-in, not a SQL proof.
import {createHash} from 'node:crypto';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
export const prepUuid=n=>n.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000';
export const prepHash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
export function sealPreparation(value){const {preparationSha256,...content}=value;value.preparationSha256=prepHash(content);return value;}
export function syntheticAnnulPreparation({receiptVersion='own-annul-receipt.v2'}={}){
 const dates=[null,'2026-10-15','2026-10-20'];
 const runs=dates.map((liquidationDate,n)=>({id:prepUuid(100+n),creatorScopeVersion:prepHash(['Invented historical creator',n]),stateVersion:prepHash(['Invented current197 state',n]),bodySha256:prepHash(['Invented run body',n]),payloadSha256:prepHash(['Invented payload',n]),algorithmSha256:prepHash(['Invented algorithm',n]),inputSha256:prepHash(['Invented saved input',n]),resultSha256:prepHash(['Invented result',n]),liquidationDate,employeeCount:2,conceptRowCount:4}));
 const affected=runs.flatMap((run,n)=>Array.from({length:2},(_,i)=>({runId:run.id,resultSha256:run.resultSha256,contractId:prepUuid(1000+n*2+i),employeeNumber:String(70000+n*2+i),agreementCode:'1',departmentCode:String(30+n),liquidationDate:run.liquidationDate,state:'annulled',version:2,liquidationVersion:1})));
 return sealPreparation({version:'own-annul-preparation.v1',custodyPolicy:'tenant_binding_projected_preparation.v1',scopeVersion:prepHash(['Invented current preparer; distinct from all creators']),source:{id:prepUuid(900),receiptVersion,bodySha256:prepHash(['Invented original body',receiptVersion]),receiptSha256:prepHash(['Invented stored original receipt, replayed false',receiptVersion]),recordedAt:'2026-10-21T06:00:00.000000+00:00'},period:'2026-10',liquidationType:'monthly',populationDomain:'native_registered',runs,affected,confirmedAffectedContractIds:[],dateGroups:dates.map(liquidationDate=>({liquidationDate,count:2})),sourceStateSha256:prepHash(['Invented COMPLETE private census and history commitment']),complete:true,preparationSha256:'0'.repeat(64)});
}
export const preparationExpected=value=>({scopeVersion:value.scopeVersion,sourceId:value.source.id});
