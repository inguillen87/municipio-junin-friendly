// Real SQL144 reconstruction and adoption over fictional predecessor adapters.
// The separate SQL144 suite tests the original predecessor implementations.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {buildInactiveJurisdictionQa} from './adoption-inactive-jurisdiction-qa.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {identityProfileValidatorQaDefinitions} from '../../tests/fixtures/final-identity-profile-synthetic.js';

export function buildFinalAdoptionQa(major,{contractCount=57,activeCount=2,paddingBytes=0,invalidInactive=false}={}){
 assert.ok(Number.isSafeInteger(contractCount)&&contractCount>=57&&contractCount<=10000);
 assert.ok(Number.isSafeInteger(activeCount)&&activeCount>=2&&activeCount<contractCount);
 assert.ok(Number.isSafeInteger(paddingBytes)&&paddingBytes>=0&&paddingBytes<=8192);assert.equal(typeof invalidInactive,'boolean');
 const qa=buildInactiveJurisdictionQa(major),source=fs.readFileSync(new URL('../migrations/144-final-grh-source-revision.sql',import.meta.url),'utf8');
 const fixtureAnchor='FOR fixture_n IN 1..54 LOOP';assert.equal(qa.sql.split(fixtureAnchor).length,2);
 qa.sql=qa.sql.replace(fixtureAnchor,`FOR fixture_n IN 1..${contractCount-3} LOOP`);
 // The final-source fixture must follow the existing canonical CUIL validator.
 // Unknown synthetic tax IDs are NULL; never clone a fabricated invalid CUIL.
 const invalidCuil="'cuil','20'||(99110000+fixture_n)::text||'0'";
 assert.equal(qa.sql.split(invalidCuil).length,2);
 qa.sql=qa.sql.replace(invalidCuil,"'cuil',NULL");
 const invalidOriginalCuil="cuil='20'||(99008000+x.n)::text||'0'";
 assert.equal(qa.sql.split(invalidOriginalCuil).length,2);
 qa.sql=qa.sql.replace(invalidOriginalCuil,'cuil=NULL');
 const definitions=splitPostgresStatements(source),find=name=>{const d=definitions.find(s=>s.includes('CREATE FUNCTION public.'+name+'('));assert.ok(d);return d;};
 const entities=find('grh_final_source_entities_v1');
 const revision='64000000-6400-4400-8400-000000000001',packageSha='6'.repeat(64);
 const anchor='CREATE TRIGGER grh_effective_baseline_rows';assert.equal(qa.sql.split(anchor).length,2);
 qa.sql=qa.sql.replace(anchor,()=>`UPDATE employment_contract SET status='active',end_date=NULL WHERE id=${q(qa.ids.targetContract)}::uuid;\n`+anchor);
 const ordinal=`CASE WHEN c.legacy_legajo~'^H/QA-[0-9]+$' THEN substring(c.legacy_legajo from 6)::integer END`;
 const active=`(c.id IN(${q(qa.ids.makerContract)}::uuid,${q(qa.ids.checkerContract)}::uuid) OR coalesce(${ordinal}<=${activeCount-2},false))`;
 const seed=`SET LOCAL search_path=${qa.schema},pg_catalog,public,pg_temp;
 ${identityProfileValidatorQaDefinitions().join(';\n')};
 CREATE TABLE source_xref(source_system text,source_entity text,source_id text,source_batch_id uuid,canonical_entity text,canonical_id uuid,valid_to timestamptz);
 INSERT INTO source_xref SELECT 'GRH','persona',c.person_id::text,c.source_batch_id,'person_identity',c.person_id,NULL FROM employment_contract c WHERE c.source_system='GRH' AND c.legacy_company_id=101;
 CREATE TABLE qa_final_rows(revision_id uuid,entity text,row_key text,record jsonb,PRIMARY KEY(revision_id,entity,row_key));
 ${entities};
 -- Existing identities and natural keys are copied explicitly, never manufactured by the application.
 INSERT INTO qa_final_rows SELECT ${q(revision)}::uuid,'curated/grh_employees',encode(public.digest(c.id::text,'sha256'),'hex'),jsonb_build_object(
 'company_id','101','legajo',c.legacy_legajo,'person_id',c.person_id::text,'nombre',p.full_name,'dni',p.dni,'cuil',p.cuil,'fecha_nacimiento',p.birth_date,'sexo',p.sex_code,
 'fecha_ingreso','2001-02-03','fecha_egreso',CASE WHEN ${active} THEN NULL ${invalidInactive?`WHEN c.id=${q(qa.ids.targetContract)}::uuid THEN '1999-12-31'`:''} ELSE '2019-12-31' END,
 'activo',${active},'convenio_code','1','categoria_code','1','cargo_code','QA_POSITION','sector_code','20',
 'source_payload',jsonb_build_object('personId',c.person_id::text,'identity',jsonb_build_object('fullName',p.full_name,'documentNumber',p.dni,'cuil',p.cuil,'birthDate',p.birth_date,'sexCode',p.sex_code,'sexLabel',NULL),
 'sourceKey',jsonb_build_object('companyCode','101','employeeNumber',c.legacy_legajo),
 'employment',jsonb_build_object('activeProxy',${active},'organizationId','10'),
 'sourceFields',jsonb_build_object('iddepartamento',CASE WHEN ${active} THEN '1' ELSE NULL END,'SUEL_12',9007199254740993.0000001::numeric,'NOLI_12','0'${paddingBytes?`, 'QA_SYNTHETIC_PADDING',repeat('x',${paddingBytes})`:''}),
 'sourceProvenance',jsonb_build_object('table','legajo','primaryKey',jsonb_build_object('CODI_01','101','LEGA_12',c.legacy_legajo)),
 'sourceReferences',CASE WHEN ${active} THEN jsonb_build_object('department',jsonb_build_object('table','departamento','primaryKey',jsonb_build_object('iddepartamento','1'),'sourceFields',jsonb_build_object('nombre','042'))) ELSE '{}'::jsonb END))
 FROM employment_contract c JOIN person_identity p ON p.id=c.person_id WHERE c.source_system='GRH' AND c.legacy_company_id=101;
 INSERT INTO qa_final_rows SELECT revision_id,'core/employmentReconciliation',row_key,jsonb_build_object('company_source_id',record->'company_id','employee_number',record->'legajo','administrative_active',record->'activo') FROM qa_final_rows WHERE entity='curated/grh_employees';
 -- Other eight domains have explicit synthetic rows so a missing domain cannot pass unnoticed.
 INSERT INTO qa_final_rows SELECT ${q(revision)}::uuid,e,encode(public.digest(e,'sha256'),'hex'),jsonb_build_object('synthetic','predecessor adapter')||CASE WHEN e LIKE 'core/%' THEN jsonb_build_object('company_source_id','101') ELSE jsonb_build_object('company_id','101') END FROM unnest(grh_final_source_entities_v1()) e WHERE e NOT IN('curated/grh_employees','core/employmentReconciliation');
 `;
 const predecessor=`SET LOCAL search_path=${qa.schema},pg_catalog,public,pg_temp;
 ALTER TABLE grh_core_source_version ADD COLUMN source_database text;
 UPDATE grh_core_source_version c SET source_database=b.source_database FROM platform_tenant_source_binding b WHERE b.id=c.source_binding_id;
 UPDATE grh_core_source_version SET source_sha256='5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7';
 ALTER TABLE grh_curated_source_version ADD COLUMN source_sha256 text DEFAULT '5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7',ADD COLUMN source_cutoff timestamp DEFAULT timestamp '2026-09-10 15:17:30',ADD UNIQUE(id);
 CREATE TABLE grh_core_source_version_seal(version_id uuid PRIMARY KEY,entity_fingerprints jsonb);
 ALTER TABLE grh_curated_source_version_seal ADD COLUMN version_id uuid UNIQUE,ADD COLUMN entity_fingerprints jsonb;
 CREATE TABLE qa_base_rows AS SELECT * FROM qa_final_rows;
 UPDATE qa_base_rows b SET record=b.record||jsonb_build_object('fecha_ingreso','2000-01-01') WHERE entity='curated/grh_employees';
 -- Explicit fictional predecessor adapters; SQL144's readers and guards are real.
 CREATE FUNCTION grh_core_source_unsealed_rows_v1(p_version uuid,p_entity text) RETURNS TABLE(source_id text,record jsonb) LANGUAGE sql AS $qa$ SELECT b.row_key,b.record FROM qa_base_rows b WHERE entity='core/'||p_entity AND EXISTS(SELECT 1 FROM grh_core_source_version WHERE id=p_version) $qa$;
 CREATE FUNCTION grh_curated_source_unsealed_rows_v1(p_version uuid,p_entity text) RETURNS TABLE(row_key text,record jsonb) LANGUAGE sql AS $qa$ SELECT b.row_key,b.record FROM qa_base_rows b WHERE entity='curated/'||p_entity AND EXISTS(SELECT 1 FROM grh_curated_source_version WHERE id=p_version) $qa$;
 CREATE FUNCTION grh_core_source_version_assert_v1(p_version uuid,p_entity text) RETURNS void LANGUAGE plpgsql AS $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM grh_core_source_version_seal WHERE version_id=p_version AND entity_fingerprints ? p_entity) THEN RAISE EXCEPTION 'QA_PREDECESSOR_CORE_UNSEALED';END IF;END $qa$;
 CREATE FUNCTION grh_curated_source_version_assert_v1(p_version uuid,p_entity text) RETURNS void LANGUAGE plpgsql AS $qa$ BEGIN IF NOT EXISTS(SELECT 1 FROM grh_curated_source_version_seal WHERE version_id=p_version AND entity_fingerprints ? p_entity) THEN RAISE EXCEPTION 'QA_PREDECESSOR_CURATED_UNSEALED';END IF;END $qa$;
 INSERT INTO grh_core_source_version_seal SELECT id,(SELECT jsonb_object_agg(split_part(e,'/',2),f) FROM(SELECT entity e,jsonb_build_object('rows',count(*),'md5',md5(string_agg(md5(row_key||record::text),'' ORDER BY row_key))) f FROM qa_base_rows WHERE entity LIKE 'core/%' GROUP BY entity) x) FROM grh_core_source_version;
 INSERT INTO grh_curated_source_version_seal(version_id,entity_fingerprints) SELECT id,(SELECT jsonb_object_agg(split_part(e,'/',2),f) FROM(SELECT entity e,jsonb_build_object('rows',count(*),'md5',md5(string_agg(md5(row_key||record::text),'' ORDER BY row_key))) f FROM qa_base_rows WHERE entity LIKE 'curated/%' GROUP BY entity) x) FROM grh_curated_source_version;
 DROP FUNCTION grh_final_source_entities_v1();
 `;
 const revisionSeed=`INSERT INTO grh_final_source_revision(id,tenant_id,source_binding_id,parent_core_version_id,parent_curated_version_id,parent_publication_sha256,source_profile,source_sha256,source_cutoff,core_manifest_sha256,curated_manifest_sha256,package_sha256,evidence)
 SELECT ${q(revision)}::uuid,s.tenant_id,s.source_binding_id,s.source_version_id,v.id,s.publication_sha256,'grh-junin-2026-10-01','50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f',timestamp '2026-10-01 15:17:29',repeat('f',64),repeat('5',64),${q(packageSha)},'{}'::jsonb FROM grh_effective_source_binding s JOIN grh_curated_source_version v ON v.core_version_id=s.source_version_id AND v.source_batch_id=s.source_batch_id WHERE s.tenant_id=${q(qa.ids.tenant)}::uuid;
 INSERT INTO grh_final_source_delta(revision_id,entity,row_key,operation,previous_record,record,source_payload)
 SELECT f.revision_id,f.entity,f.row_key,'replace',b.record,f.record,CASE WHEN f.entity LIKE 'core/%' THEN jsonb_build_object('synthetic',true) END FROM qa_final_rows f JOIN qa_base_rows b USING(revision_id,entity,row_key) WHERE f.record<>b.record;
 INSERT INTO grh_final_source_seal SELECT ${q(revision)}::uuid,jsonb_object_agg(e,grh_final_source_fingerprint_v1(${q(revision)}::uuid,e,false)) FROM unnest(grh_final_source_entities_v1()) e;
 `;
 // Evidence must be in the immutable initial INSERT, not patched afterwards.
 const evidence=`(SELECT jsonb_object_agg(e,jsonb_build_object('baseline',(SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(row_key||record::text),'' ORDER BY row_key),''))) FROM qa_base_rows WHERE entity=e),'candidate',(SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(row_key||record::text),'' ORDER BY row_key),''))) FROM qa_final_rows WHERE entity=e),'changes',jsonb_build_object('add',0,'remove',0,'replace',(SELECT count(*) FROM qa_base_rows b JOIN qa_final_rows f USING(revision_id,entity,row_key) WHERE f.entity=e AND b.record<>f.record)))) FROM unnest(grh_final_source_entities_v1()) e)`;
 assert.equal(revisionSeed.split(`${q(packageSha)},'{}'::jsonb`).length,2);
 return {...qa,revision,packageSha,contractCount,activeCount,paddingBytes,sourceFixture:qa.normalized(seed+predecessor+source+';\n'+revisionSeed.replace(`${q(packageSha)},'{}'::jsonb`,`${q(packageSha)},${evidence}`))};
}

export function relocateFinalAdoption(batch,qa,previous){
 const n=qa.normalized,checks=batch.readyChecks;
 const readySource=batch.afterDefinitions.at(-1),ready=n(readySource.slice(0,readySource.indexOf(' BEGIN ')))+' BEGIN '+checks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=n(batch.sourcePrerequisite.check)+';'+n(pinsCheck(batch.beforePins.slice(0,-1),'FINAL_ADOPTION_BEFORE_METADATA'))+';'+pinsCheck([previous.readyPin],'FINAL_ADOPTION_BEFORE_METADATA');
 const after=n(batch.sourcePrerequisite.check)+';'+n(pinsCheck([...batch.afterPins.slice(0,-1),...batch.newPins],'FINAL_ADOPTION_AFTER_METADATA'))+';'+pinsCheck([readyPin],'FINAL_ADOPTION_AFTER_METADATA');
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_final_adoption.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const definitions=[...batch.newDefinitions.map(n),...batch.afterDefinitions.slice(0,-1).map(d=>n(d.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')];
 const permissions=batch.migration.slice(-2).map(n);
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_final_adoption.mode')='first' THEN ${[...definitions,...permissions].map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,readyPin,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
