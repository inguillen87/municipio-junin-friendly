import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const html=readFileSync(fileURLToPath(new URL('../administracion-plataforma.html',import.meta.url)),'utf8');
const block=html.slice(html.indexOf('    function reviewedSodBaseline('),html.indexOf('    function capabilityKeysFrom('));
const a='employee.record.approve',b='employee.record.propose',c='payroll.novelty.prepare',d='payroll.novelty.approve';
const ctx=vm.createContext({state:{sodRules:[{left:a,right:b,reason:'Personal'},{left:d,right:c,reason:'Novedades'}]},capabilityByKey:k=>({conflictsWith:({[a]:[b],[b]:[a],[c]:[d],[d]:[c]})[k]||[]})});vm.runInContext(block,ctx);
const baseline={schema:'iam.current-pairs.v1',tenantId:'junin',membershipId:'operator',membershipVersion:4,roleKey:'owner-op',pairs:[[d,c]]};
const row={tenantId:'junin',membershipId:'operator',status:'active',version:4,roleKey:'owner-op',capabilities:[b,c,d],sodEditBaseline:baseline};
const conflicts=(s,u=row,role='owner-op',tenant='junin')=>ctx.sodConflicts(s,ctx.reviewedSodBaseline(u,role,tenant));
test('only an already validated pair for this exact row can survive an independent extra capability',()=>{
 assert.equal(conflicts([b,c,d,'payroll.calculation.close']).length,0);
 assert(conflicts([a,b,c,d]).length>0); // real new incompatibility
 assert(ctx.sodConflicts([c,d]).length>0); // invitation/new membership unchanged
});
test('no proof from a previous revision, tenant, role or membership may be used',()=>{
 for(const u of [{...row,version:5},{...row,tenantId:'other'},{...row,membershipId:'other'},{...row,roleKey:'other'},{...row,status:'suspended'},{...row,sodEditBaseline:null}])assert(conflicts([c,d],u).length>0);
 assert(conflicts([c,d],row,'other').length>0);assert(conflicts([c,d],row,'owner-op','other').length>0);
});
test('an incomplete, malformed or unsubstantiated baseline defaults to blocking',()=>{
 for(const pairs of [[d,c],[[d,c],['inventada',a]],[[d,d]],null])assert(conflicts([c,d],{...row,sodEditBaseline:{...baseline,pairs}}).length>0);
 assert(conflicts([c,d],{...row,capabilities:[c]}).length>0);
});

// 12/11: con el filtro «Plataforma completa» el directorio llega sin constancia y la ficha marcaba como conflicto nuevo
// el par que el rol ya trae. La constancia se pide para la membresía que se abre; si no corresponde, sigue bloqueando.
const loader=html.slice(html.indexOf('    async function loadSodBaselineFor('),html.indexOf('    function openUserDetail('));
function harness(response,{contextTenant='',selected=true}={}){
 const calls=[],user={id:'operator',membershipId:'operator',tenantId:'junin',roleKey:'owner-op',status:'active',version:4,capabilities:[b,c,d],sodEditBaseline:null};
 const state={context:{tenantId:contextTenant},selectedUser:selected?user:null};let gates=0;
 const h=vm.createContext({state,contextQuery:(resource,tenant)=>resource+'@'+tenant,requestJson:async url=>{calls.push(url);if(response instanceof Error)throw response;return response;},
  findArray:(payload,keys)=>keys.map(k=>payload[k]).find(Array.isArray)||[],normalizeUser:r=>r,updateUserAccessGate:()=>{gates++;}});
 vm.runInContext(loader,h);return {run:()=>h.loadSodBaselineFor(user),user,calls,gates:()=>gates};
}
test('with the platform-wide filter the baseline is requested for the membership tenant and attached only to the same row, role and version',async()=>{
 const same={id:'operator',membershipId:'operator',tenantId:'junin',roleKey:'owner-op',version:4,sodEditBaseline:baseline};
 const ok=harness({users:[{...same,id:'other',membershipId:'other'},same]});await ok.run();
 assert.deepEqual(ok.calls,['users@junin']);assert.equal(ok.user.sodEditBaseline,baseline);assert.equal(ok.gates(),1);
 assert.equal(conflicts([b,c,d,'payroll.calculation.close'],{...row,sodEditBaseline:ok.user.sodEditBaseline}).length,0);
 for(const other of [{...same,version:5},{...same,roleKey:'other'},{...same,tenantId:'other'},{...same,membershipId:'other'},{...same,sodEditBaseline:null}]){
  const h=harness({users:[other]});await h.run();assert.equal(h.user.sodEditBaseline,null);assert.equal(h.gates(),0);}
});
test('a failed lookup, a ficha already closed or a tenant-scoped directory never fabricate a baseline',async()=>{
 const same={id:'operator',membershipId:'operator',tenantId:'junin',roleKey:'owner-op',version:4,sodEditBaseline:baseline};
 const failed=harness(new Error('sin respuesta'));await failed.run();assert.equal(failed.user.sodEditBaseline,null);assert.equal(failed.gates(),0);
 const closed=harness({users:[same]},{selected:false});await closed.run();assert.equal(closed.user.sodEditBaseline,null);
 const scoped=harness({users:[same]},{contextTenant:'junin'});await scoped.run();assert.deepEqual(scoped.calls,[],'el directorio del municipio ya trae la constancia');
});
test('the access gate evaluates the baseline against the membership tenant when no administrative filter is set',()=>{
 assert.equal(html.split('reviewedSodBaseline(user, el.userAccessRole.value, state.context.tenantId || user.tenantId)').length-1,1);
 assert.equal(html.split('loadSodBaselineFor(user);').length-1,1);
 assert.match(html,/tenantKeys\.has\(capability\.key\) \|\| \(!platformKeys\.has\(capability\.key\) && capability\.key\.indexOf\('platform\.'\) !== 0\)/);
});
