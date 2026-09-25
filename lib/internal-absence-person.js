// Exact contract and certified source; no name matching, attendance inference or business writes.
import {absenceWindowSql} from './absence-window-sql.js';
import {parseAbsencePersonQuery,verifyAbsencePersonResponse} from '../assets/absence-person-model.js';
const error=(status,code,message)=>({status,payload:{ok:false,code,error:message}});
export async function internalAbsencePerson(sql,req,binding,snapshot,{readEvents}={}){
 let query;try{query=parseAbsencePersonQuery(req.query??{});}catch{return error(400,'ABSENCE_PERSON_QUERY_INVALID','La consulta individual requiere un vínculo, fechas y página válidos.');}
 if(query.snapshot&&query.snapshot!==snapshot)return error(409,'ABSENCE_PERSON_SOURCE_CHANGED','Cambió la fuente. Volvé a consultar antes de continuar.');
 const people=await sql.query(`/* absence-person:contract */
 SELECT c.id AS "contractId",c.legacy_legajo AS number,coalesce(i.full_name,e.nombre) AS name,
 coalesce(nullif(btrim(e.sector),''),'Sin sector informado') AS sector
 FROM employment_contract c LEFT JOIN person_identity i ON i.id=c.person_id
 LEFT JOIN grh_effective_employees_v1 e ON e.company_id=c.legacy_company_id AND e.legajo=c.legacy_legajo
 WHERE c.id=$1::uuid AND c.source_system='GRH' AND c.legacy_company_id=$2::bigint
 AND EXISTS(SELECT 1 FROM grh_effective_source_batch_v1 b WHERE b.id=c.source_batch_id AND b.source_database=$3)
 `,[query.contractId,binding.companyId,binding.database]);
 if(people.length!==1)return error(404,'ABSENCE_PERSON_NOT_AVAILABLE','El vínculo no está disponible en esta fuente municipal.');
 const person=people[0];
 const events=await readEvents(sql,{query:{resource:'absenceevents',contractId:query.contractId,from:query.from,to:query.to,page:String(query.page),limit:String(query.limit)}},{rangeMode:query.rangeMode??'starts'});
 if(events.status!==200)return events;
 const {pagination,range,quality}=events.payload;
 if(!events.payload.data.every(row=>row.contractId===query.contractId&&row.legajo===person.number&&Number(row.companyId)===binding.companyId))throw Error('ABSENCE_PERSON_SCOPE_DRIFT');
 const rows=await sql.query(`/* absence-person:summary */
 SELECT count(*)::int AS events,count(a.dias)::int AS "reportedDaysEvents",
 coalesce(sum(a.dias),0)::float8 AS "reportedDaysSum",
 count(DISTINCT a.motivo_code)::int AS "reasonCount",
 count(*) FILTER(WHERE a.fecha_hasta<a.fecha OR a.fecha_hasta-a.fecha+1>366)::int AS "dateReviewEvents",
 count(*) FILTER(WHERE a.fecha<$3::date)::int AS "beganBeforePeriod",
 count(*) FILTER(WHERE a.fecha_hasta IS NULL)::int AS "endNotReportedEvents"
 FROM grh_effective_absences_v1 a WHERE a.company_id=$1::bigint AND a.legajo=$2 AND ${absenceWindowSql('a',query.rangeMode??'starts','$3','$4')}
 `,[binding.companyId,person.number,range.effective.from,range.effective.to]);
 if(rows.length!==1||Number(rows[0].events)!==pagination.total)return error(409,'ABSENCE_PERSON_SOURCE_CHANGED','Cambió el resultado mientras se consultaba. Reintentá sin mezclar páginas.');
 const raw=rows[0],summary={events:Number(raw.events),reportedDaysEvents:Number(raw.reportedDaysEvents),reportedDaysSum:Number(raw.reportedDaysSum),reasonCount:Number(raw.reasonCount),dateReviewEvents:Number(raw.dateReviewEvents),...(query.rangeMode?{beganBeforePeriod:Number(raw.beganBeforePeriod),endNotReportedEvents:Number(raw.endNotReportedEvents)}:{})};
 const data={version:query.rangeMode?'absence-person.v2':'absence-person.v1',...(query.rangeMode?{rangeMode:query.rangeMode}:{}),tenantId:binding.tenantId,snapshot,person:{contractId:person.contractId,number:person.number,name:person.name??'Nombre no informado',sector:person.sector},range,sourceCutoff:quality.sourceCutoff,summary,pagination,events:events.payload.data.map(row=>({date:row.eventDate,untilDate:row.untilDate,reasonCode:row.reasonCode,reason:row.reason,declaredDays:row.sourceDeclaredDays,quantity:row.sourceQuantity,rangeIntegrity:row.rangeIntegrity})),semantics:'administrative_events_not_workdays_or_payroll',sourceComplete:false};
 verifyAbsencePersonResponse(data,query);return{status:200,payload:{ok:true,data}};
}
