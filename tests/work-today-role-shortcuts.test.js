import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context={};vm.runInNewContext(fs.readFileSync('assets/internal-work-today.js','utf8'),context);
const build=context.MuniControlWorkToday.buildModel;
const model=(caps,mode)=>build({tenantCapabilities:caps},'Perfil de ensayo',mode);
test('preparer reaches parameters only with destination, read and prepare permissions',()=>{
 const caps=['payroll.read','payroll.parameter.read','payroll.parameter.prepare'];
 assert.equal(model(caps,'prepare').cards.find(c=>c.key==='parameters').href,'nomina-control.html#parametros');
 for(const absent of caps)assert.equal(model(caps.filter(c=>c!==absent),'prepare')?.cards.some(c=>c.key==='parameters')||false,false);
});
test('parameter reviewer remains distinct from the preparer',()=>{
 const result=model(['payroll.read','payroll.parameter.read','payroll.parameter.approve'],'decide');
 assert.ok(result.cards.some(c=>c.key==='parameters'));assert.equal(result.modes.some(m=>m.key==='prepare'),false);
});
test('comparison and approved budget retain their independent read permissions',()=>{
 assert.ok(model(['payroll.read'],'consult').cards.some(c=>c.key==='comparison'));
 assert.equal(model(['payroll.read'],'consult').cards.some(c=>c.key==='budget'),false);
 assert.deepEqual(Array.from(model(['budget.approved.read'],'consult').cards,c=>c.key),['budget']);
});
test('platform administration requires both the owner role and explicit platform capability',()=>{
 const access={tenantCapabilities:[],platformRoles:['PLATFORM_OWNER'],platformCapabilities:['platform.users.manage']};
 assert.deepEqual(Array.from(build(access,'Marce','consult').cards,c=>c.key),['administration']);
 assert.equal(build({...access,platformRoles:[]},'PLATFORM_OWNER'),null);
 assert.equal(build({...access,platformCapabilities:[]},'PLATFORM_OWNER'),null);
 assert.equal(build({tenantCapabilities:['platform.users.manage']},'PLATFORM_OWNER'),null);
});
test('legal-only access does not acquire payroll or global administration',()=>{
 const result=model(['legal.norm.read','legal.norm.register'],'prepare');
 assert.deepEqual(Array.from(result.cards,c=>c.key),['legal']);
});
