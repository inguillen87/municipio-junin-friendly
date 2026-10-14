import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {municipalDocumentIssuerProfile,INITIAL_MUNICIPAL_ISSUER_PROFILES} from '../lib/municipal-document-issuer.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';

const tenantId='00000000-0000-4000-8000-000000000050',otherTenant='00000000-0000-4000-8000-000000000051';
const invented=()=>({id:'qa-municipal-issuer',revision:1,issuer:{name:'MUNICIPIO INVENTADO QA',taxId:'30000000007',address:'CALLE INVENTADA 1, LOCALIDAD QA'},source:{kind:'municipal_official_backup',label:'Respaldo institucional inventado QA',cutoff:'2026-10-01T15:17:29',validityDeclared:false}});

test('el registro inicial es inmutable y contiene sólo el tenant explícito de Junín',()=>{
 assert.deepEqual(Object.keys(INITIAL_MUNICIPAL_ISSUER_PROFILES),['4daa7815-0816-4506-b497-c7432cb1aa9f']);
 assert.equal(Object.isFrozen(INITIAL_MUNICIPAL_ISSUER_PROFILES),true);
 for(const value of Object.values(INITIAL_MUNICIPAL_ISSUER_PROFILES)){assert.equal(Object.isFrozen(value),true);assert.equal(Object.isFrozen(value.issuer),true);assert.equal(Object.isFrozen(value.source),true);assert.equal(value.source.validityDeclared,false);}
});

test('perfil sintético devuelve contrato exacto y versión SHA de sus propios datos',()=>{
 const source=invented(),result=municipalDocumentIssuerProfile({tenantId},{[tenantId]:source});
 assert.deepEqual(Object.keys(result).sort(),['profile','scope','state','version']);
 assert.deepEqual(result.scope,{tenantId});assert.equal(result.version,'own-receipt-issuer.v1');assert.equal(result.state,'configured');
 assert.deepEqual(Object.keys(result.profile).sort(),['id','issuer','revision','source','version']);
 assert.equal(result.profile.version,createHash('sha256').update(salarySerialized(source)).digest('hex'));
 assert.deepEqual(result.profile.issuer,source.issuer);assert.deepEqual(result.profile.source,source.source);
});

test('normaliza sólo los campos institucionales declarados y conserva la fuente sin zona inferida',()=>{
 const source=invented();source.issuer.name='  MUNICIPIO INVENTADO QA  ';source.issuer.taxId='30-00000000-7';source.issuer.address=' CALLE INVENTADA 1, LOCALIDAD QA   ';source.source.label=' Respaldo institucional inventado QA ';
 const result=municipalDocumentIssuerProfile({tenantId},new Map([[tenantId,source]]));
 assert.deepEqual(result.profile.issuer,invented().issuer);assert.equal(result.profile.source.cutoff,'2026-10-01T15:17:29');assert.equal(result.profile.version,municipalDocumentIssuerProfile({tenantId},{[tenantId]:invented()}).profile.version);
});

test('tenant sin perfil y propiedades heredadas no usan fallback de otro municipio',()=>{
 assert.deepEqual(municipalDocumentIssuerProfile({tenantId:otherTenant},{[tenantId]:invented()}),{version:'own-receipt-issuer.v1',scope:{tenantId:otherTenant},state:'missing',profile:null});
 assert.equal(municipalDocumentIssuerProfile({tenantId},{}).state,'missing');
 assert.throws(()=>municipalDocumentIssuerProfile({tenantId},Object.create({[tenantId]:invented()})),/OWN_RECEIPT_CONTRACT_INVALID/);
});

test('versión cambia con datos o revisión y una respuesta no modifica la configuración ni otras respuestas',()=>{
 const source=invented(),profiles={[tenantId]:source},first=municipalDocumentIssuerProfile({tenantId},profiles);
 first.profile.issuer.name='Cambio sólo en la respuesta';first.profile.source.label='Cambio sólo en la respuesta';assert.deepEqual(source,invented());
 const original=municipalDocumentIssuerProfile({tenantId},profiles);source.revision=2;const next=municipalDocumentIssuerProfile({tenantId},profiles);assert.notEqual(original.profile.version,next.profile.version);
 source.issuer.address='OTRA CALLE INVENTADA 2, LOCALIDAD QA';assert.notEqual(next.profile.version,municipalDocumentIssuerProfile({tenantId},profiles).profile.version);
});

test('un perfil o ámbito inválido falla cerrado sin devolver identificación parcial',()=>{
 assert.throws(()=>municipalDocumentIssuerProfile({tenantId:'invalid'},{}),/OWN_RECEIPT_CONTRACT_INVALID/);
 for(const bad of [null,[], 'configured'])assert.throws(()=>municipalDocumentIssuerProfile({tenantId},bad),/OWN_RECEIPT_CONTRACT_INVALID/);
 const changes=[v=>v.revision=0,v=>v.revision=1.5,v=>v.extra=true,v=>v.issuer.taxId='123',v=>v.issuer.name='<municipio>',v=>v.issuer.address='\nDirección',v=>v.source.kind='legacy_live',v=>v.source.validityDeclared=true,v=>v.source.cutoff='2026-02-30T15:17:29',v=>v.source.cutoff+='Z',v=>v.version='a'.repeat(64)];
 for(const change of changes){const bad=invented();change(bad);assert.throws(()=>municipalDocumentIssuerProfile({tenantId},{[tenantId]:bad}),/OWN_RECEIPT_CONTRACT_INVALID/);}
});
