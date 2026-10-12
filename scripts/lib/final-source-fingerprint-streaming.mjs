// Exact published row projection, with both delta layers in one SQL pipeline.
// Generates SELECTs/definitions only; never opens a connection or changes data.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const STREAMED_FINAL_ENTITIES=Object.freeze(['core/movements','core/payrollMonthly']);
const sourcePath='scripts/migrations/061-grh-core-source-version.sql';
const quote=value=>"'"+value.replaceAll("'","''")+"'";

export function publishedCoreProjection(read,entity){
 assert.ok(STREAMED_FINAL_ENTITIES.includes(entity),'STREAMED_ENTITY_INVALID');
 const source=read(sourcePath).replace(/\r\n?/g,'\n'),key=entity.slice(5);
 const marker=` ELSIF p_entity='${key}' THEN RETURN QUERY\n`;
 assert.equal(source.split(marker).length,2,'STREAMED_PROJECTION_ANCHOR_CHANGED');
 const start=source.indexOf(marker)+marker.length,end=source.indexOf('\n ELSIF ',start);
 assert.ok(end>start,'STREAMED_PROJECTION_ANCHOR_CHANGED');
 const sql=source.slice(start,end).trim();
 assert.ok(sql.endsWith(';')&&sql.split('p_batch').length===2,'STREAMED_PROJECTION_ANCHOR_CHANGED');
 assert.ok(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i.test(sql),'STREAMED_PROJECTION_NOT_READ_ONLY');
 return sql.slice(0,-1).replaceAll('p_batch','(SELECT baseline_batch_id FROM selected)')
  .replaceAll('FROM payroll_monthly_fact ','FROM public.payroll_monthly_fact ')
  .replaceAll('FROM employment_movement ','FROM public.employment_movement ')
  .replaceAll('JOIN employment_contract ','JOIN public.employment_contract ');
}

export function streamedFinalFingerprintQuery(read,entity){
 const base=publishedCoreProjection(read,entity),key=entity.slice(5);
 return `WITH selected AS MATERIALIZED (
 SELECT r.id,r.parent_core_version_id,v.baseline_batch_id
 FROM public.grh_final_source_revision r
 LEFT JOIN public.grh_core_source_version v ON v.id=r.parent_core_version_id
 WHERE r.id=$1::uuid
 ), rows_value AS (
 SELECT b.row_key,b.record FROM (${base}) b(row_key,record)
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_core_source_delta d
  WHERE d.version_id=(SELECT parent_core_version_id FROM selected)
   AND d.entity=${quote(key)} AND d.source_id=b.row_key)
 AND NOT EXISTS(SELECT 1 FROM public.grh_final_source_delta d
  WHERE d.revision_id=$1::uuid AND d.entity=${quote(entity)} AND d.row_key=b.row_key)
 UNION ALL
 SELECT d.source_id,d.record FROM public.grh_core_source_delta d
 WHERE d.version_id=(SELECT parent_core_version_id FROM selected)
  AND d.entity=${quote(key)} AND d.operation IN('add','replace')
  AND NOT EXISTS(SELECT 1 FROM public.grh_final_source_delta final_delta
   WHERE final_delta.revision_id=$1::uuid AND final_delta.entity=${quote(entity)}
    AND final_delta.row_key=d.source_id)
 UNION ALL
 SELECT d.row_key,d.record FROM public.grh_final_source_delta d
 WHERE d.revision_id=$1::uuid AND d.entity=${quote(entity)} AND d.operation IN('add','replace')
 ) SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(
 string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),''))) AS fingerprint
 FROM rows_value r`;
}

export function finalSourceStreamingFingerprintDefinition(read){
 const branches=STREAMED_FINAL_ENTITIES.map((entity,index)=>`${index?'ELSIF':'IF'} p_entity=${quote(entity)} THEN
 ${streamedFinalFingerprintQuery(read,entity).replaceAll('$1::uuid','p_revision').replace(' AS fingerprint','')} INTO result;`);
 // SELECT ... INTO must precede its FROM clause in PL/pgSQL.
 const normalized=branches.map(sql=>sql.replace(')))\n FROM rows_value r INTO result;', '))) INTO result\n FROM rows_value r;'));
 return `CREATE FUNCTION public.adoption_source_streaming_fingerprint_v1(p_revision uuid,p_entity text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $streamed$
 DECLARE selected_revision public.grh_final_source_revision%ROWTYPE;result jsonb;
 BEGIN
 IF p_entity IN(${STREAMED_FINAL_ENTITIES.map(quote).join(',')}) THEN
  SELECT * INTO STRICT selected_revision FROM public.grh_final_source_revision WHERE id=p_revision;
 END IF;
 ${normalized.join('\n')}
 ELSE RETURN public.grh_final_source_fingerprint_v1(p_revision,p_entity,false);
 END IF;
 RETURN result;
 END $streamed$`;
}

export function finalSourceStreamingDependencies(read){
 return Object.fromEntries([sourcePath,'scripts/lib/final-source-fingerprint-streaming.mjs'].map(path=>
  [path,createHash('sha256').update(read(path).replace(/\r\n?/g,'\n')).digest('hex')]));
}
