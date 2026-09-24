// Exact, read-revision-bound context. Never correlate people by name or combine contracts/devices.
import {createHash} from 'node:crypto';
export const PERSON_CONTEXT_VERSION='clock-person-context.v1';
export function personContextOptions(options={}){
 if(options.context!==undefined&&typeof options.context!=='string'||options.personRef!==undefined&&typeof options.personRef!=='string')throw Error('ATTENDANCE_PERSON_CONTEXT_INVALID');
 const context=options.context===undefined?'':String(options.context),personRef=options.personRef===undefined?'':String(options.personRef);
 if(context!==''&&context!=='person'||personRef&&!/^[a-f0-9]{64}$/.test(personRef)||personRef&&(context!=='person'||!options.snapshot))throw Error('ATTENDANCE_PERSON_CONTEXT_INVALID');
 return {includePersonContext:context==='person',personRef:personRef||null};
}
export function workdayPersonReference({tenantId,siteKey,revision},row){
 if(typeof tenantId!=='string'||typeof siteKey!=='string'||typeof revision!=='string'||!row||!/^([a-f0-9]{64}):\d{4}-\d{2}-\d{2}$/.test(row.key||''))throw Error('ATTENDANCE_PERSON_CONTEXT_INVALID');
 return createHash('sha256').update(JSON.stringify([PERSON_CONTEXT_VERSION,tenantId,siteKey,revision,row.key.slice(0,64)])).digest('hex');
}
