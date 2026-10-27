import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildOwnReceipt126Same190Actors} from '../scripts/lib/own-payroll-receipt126-same190-actors.mjs';
import {resolveOwnReceipt126Same190Actor} from '../scripts/lib/own-payroll-receipt126-same190-circuit.mjs';

// Synthetic QA metadata derived from pinned declarations, not a live catalogue.
// Ten definitions come from005/026/041/123/124/126; exactly two inherit190+004.
const EXPECTED=[
  {
    "capability_key": "actions.read",
    "label": "QA",
    "description": "Ficticio",
    "scope_kind": "tenant",
    "sensitivity": "standard"
  },
  {
    "capability_key": "payroll.calculation.approve",
    "label": "Confirmar y anular resultados propios",
    "description": "Revisar un cálculo propio de otra persona; confirmar o anular legajos conservando resultados y decisiones. No cierra, contabiliza ni paga.",
    "scope_kind": "tenant",
    "sensitivity": "privileged"
  },
  {
    "capability_key": "payroll.calculation.nominal.read",
    "label": "Consultar resultados propios",
    "description": "Fuentes y resultados nominales de corridas técnicas propias.",
    "scope_kind": "tenant",
    "sensitivity": "privileged"
  },
  {
    "capability_key": "payroll.calculation.read",
    "label": "Consultar corridas propias",
    "description": "Metadatos de corridas técnicas propias, sin datos nominales.",
    "scope_kind": "tenant",
    "sensitivity": "standard"
  },
  {
    "capability_key": "payroll.novelty.export",
    "label": "Exportar novedades aprobadas",
    "description": "Obtiene un snapshot nominal aprobado para una exportacion controlada.",
    "scope_kind": "tenant",
    "sensitivity": "restricted"
  },
  {
    "capability_key": "payroll.novelty.nominal.read",
    "label": "Consultar detalle nominal de novedades",
    "description": "Consulta filas nominales y observaciones de lotes autorizados del tenant.",
    "scope_kind": "tenant",
    "sensitivity": "restricted"
  },
  {
    "capability_key": "payroll.novelty.read",
    "label": "Consultar lotes de novedades",
    "description": "Consulta lotes, estados y conteos sin exponer legajos ni observaciones.",
    "scope_kind": "tenant",
    "sensitivity": "standard"
  },
  {
    "capability_key": "payroll.parameter.read",
    "label": "Consultar parámetros",
    "description": "Consultar preparaciones municipales de auxiliares",
    "scope_kind": "tenant",
    "sensitivity": "standard"
  },
  {
    "capability_key": "payroll.receipt.approve",
    "label": "Revisar recibos propios",
    "description": "Aprobar o retirar la disponibilidad de recibos propios conservando sus copias y decisiones.",
    "scope_kind": "tenant",
    "sensitivity": "privileged"
  },
  {
    "capability_key": "payroll.receipt.prepare",
    "label": "Preparar recibos propios",
    "description": "Conservar una copia completa de liquidaciones propias cerradas para revisión. No firma ni paga.",
    "scope_kind": "tenant",
    "sensitivity": "privileged"
  },
  {
    "capability_key": "payroll.receipt.self.read",
    "label": "Consultar mis recibos propios",
    "description": "Consultar exclusivamente recibos aprobados del contrato vinculado a la membresía.",
    "scope_kind": "tenant",
    "sensitivity": "standard"
  },
  {
    "capability_key": "workforce.employee.read",
    "label": "QA",
    "description": "Ficticio",
    "scope_kind": "tenant",
    "sensitivity": "standard"
  }
];
const PRODUCER='scripts/verify-municipal-owner-adoption-authority.mjs';
const DEFAULTS='scripts/migrations/004-tenant-iam-control-plane.sql';
const readRaw=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(reader=readRaw){
 const tenantId=id(9001),releaseSha='a'.repeat(40);
 const actor={actorEmail:'actor@example.invalid',actorSessionId:id(9002),actorSessionVersion:3,membershipId:id(9003),releaseSha,tenantId};
 const checker={actorEmail:'checker@example.invalid',actorSessionId:id(9004),actorSessionVersion:1,membershipId:id(9005),releaseSha,tenantId};
 const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),major:17,sourceCommit:'b'.repeat(40),operationalPairBaseline:'published107',actor,checker,ids:{binding:id(9006)}};
 let generated=0;
 return{args:{qa,contracts:Array.from({length:855},(_,n)=>id(n+1)),readRaw:reader,dependencies:{randomUUID:()=>id(20000+(++generated))}},generated:()=>generated};
}
function guardDefinitions(plan){
 const matches=[...plan.statements[0].matchAll(/FOR definition IN SELECT value FROM jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g)];
 assert.equal(matches.length,1);return JSON.parse(matches[0][1].replaceAll("''","'"));
}

test('receipt126 uses the exact twelve source-derived QA190 definitions, including two inherited seed rows',()=>{
 const f=fixture(),plan=buildOwnReceipt126Same190Actors(f.args),actual=guardDefinitions(plan);
 assert.deepEqual(actual,EXPECTED);
 assert.equal(actual.length,12);
 assert.deepEqual(actual.filter(row=>row.label==='QA').map(row=>row.capability_key),['actions.read','workforce.employee.read']);
 for(const row of actual.filter(row=>row.label==='QA'))assert.deepEqual(row,{capability_key:row.capability_key,label:'QA',description:'Ficticio',scope_kind:'tenant',sensitivity:'standard'});
 assert.equal(actual.some(row=>row.capability_key==='employee.record.propose'),false);
});

test('receipt126 preserves complete metadata equality, private context, SoD and the existing bounded actor additions',()=>{
 const plan=buildOwnReceipt126Same190Actors(fixture().args);
 assert.match(plan.statements[0],/to_jsonb\(c\)-'created_at'=definition/);
 assert.match(plan.statements[0],/RECEIPT126_CONTEXT_SOURCE_OR_PRIVATE_ACL_CHANGED/);
 assert.match(plan.statements[0],/tenant_iam_assert_no_sod_conflict/);
 assert.equal(plan.additions.capabilities,0);assert.equal(plan.additions.people,0);assert.equal(plan.additions.contracts,0);
 assert.equal(plan.additions.roleCapabilities,12);assert.equal(plan.additions.overrides,1);
 const sql=plan.statements.join('\n');
 assert.doesNotMatch(sql,/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[a-z0-9_]+\.iam_capability\b/i);
 assert.doesNotMatch(sql,/\bGRANT\b/i);
 assert.match(sql,/RECEIPT126_PRIOR_MULTISET_CHANGED/);
 assert.match(sql,/RECEIPT126_PRIOR_EFFECTIVE_CHANGED/);
});

test('receipt126 bookends the complete actual190 producer and the existing DEFAULT004 source',()=>{
 const plan=buildOwnReceipt126Same190Actors(fixture().args);
 assert.deepEqual(plan.sourcePins.find(row=>row.path===PRODUCER),{path:PRODUCER,bytes:43441,sha256:'6194ab3f20092277c7b30c8a3c1fd7cb2bae3041ce8a3a63df107ea3b628cfeb'});
 assert.deepEqual(plan.sourcePins.find(row=>row.path===DEFAULTS),{path:DEFAULTS,bytes:44500,sha256:'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195'});
});

test('receipt126 refuses changed seed metadata or DEFAULT before generating any new actor identity',()=>{
 const mutations=[
  [PRODUCER,"'QA','Ficticio','tenant'","'QA','Ficticio alterado','tenant'"],
  [PRODUCER,"'QA','Ficticio','tenant'","'QA','Ficticio','platform'"],
  [PRODUCER,"const caps=['actions.read'","const caps=['actions.changed'"],
  [DEFAULTS,"sensitivity varchar(16) NOT NULL DEFAULT 'standard'","sensitivity varchar(16) NOT NULL DEFAULT 'restricted'"]
 ];
 for(const[file,oldText,newText]of mutations){
  const original=readRaw(file).toString('utf8');assert.ok(original.includes(oldText));
  const f=fixture(path=>path===file?Buffer.from(original.replace(oldText,newText),'utf8'):readRaw(path));
  assert.throws(()=>buildOwnReceipt126Same190Actors(f.args),/RECEIPT126_RAW_(?:BYTES|HASH)_CHANGED/);
  assert.equal(f.generated(),0);
 }
});

// Transport boundary only: synthetic access DTOs are not native IAM evidence.
// Uses the actual resolver; reverting to db.run(...,true) throws42501 below.
test('receipt126 fixture identity requires owner RR/RW and rejects a runtime private-helper call',async()=>{
 const plan=buildOwnReceipt126Same190Actors(fixture().args),actorsProof={checkerCapabilitiesBefore:['actions.read']},checked={checkerRoleKey:'synthetic-existing-checker-role'};
 for(const descriptor of plan.accessDescriptors){
  const raw=descriptor.raw,caps=descriptor.name==='preparer'?[...actorsProof.checkerCapabilitiesBefore,'payroll.receipt.prepare']:descriptor.expectedCapabilities;
  const native={membershipId:raw.membershipId,actorEmail:raw.actorEmail,actorPersonId:id(30001),employmentContractId:id(30002)},packet={};
  const access={principal:{authorized:true,session:{mfa:true},tenant:{membershipId:raw.membershipId,effectiveCapabilities:[...caps]}},session:{id:raw.actorSessionId,version:raw.actorSessionVersion}};
  const calls=[],runtimeCalls=[];
  const db={run(sql,runtime){runtimeCalls.push({sql,runtime});throw Object.assign(Error('permission denied for function own_receipt_context_v1'),{code:'42501'});},query(){assert.fail('fixture identity must not use a business RPC transport');}};
  const h={json(statements,options){
   calls.push({statements,options});
   if(statements[0]===descriptor.accessSql){assert.deepEqual(statements,[descriptor.accessSql]);assert.deepEqual(options,{readOnly:true});return packet;}
   assert.deepEqual(statements,[descriptor.contextSql]);assert.deepEqual(options,{readOnly:false,fullJson:true},'FOR_SHARE_REQUIRES_OWNER_WRITABLE_RR');return native;
  }};
  const ownerProgramQaAccess=(value,actor)=>{assert.strictEqual(value,packet);assert.deepEqual(actor,raw);return access;};
  const result=await resolveOwnReceipt126Same190Actor({descriptor,h,db,actorsProof,checked,ownerProgramQaAccess});
  assert.strictEqual(result.native,native);assert.strictEqual(result.principal,access.principal);assert.deepEqual(result.raw,raw);
  assert.deepEqual(runtimeCalls,[]);assert.equal(calls.length,2);assert.equal(result.roleKey,descriptor.name==='preparer'?checked.checkerRoleKey:descriptor.roleKey);
 }
});
