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
