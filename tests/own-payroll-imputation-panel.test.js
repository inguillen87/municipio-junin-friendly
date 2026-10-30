import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {mountOwnPayrollImputation} from '../assets/own-payroll-imputation-panel.js';
import {IMPUTATION_READ} from '../assets/own-payroll-imputation-workspace-model.js';
import {IMPUTATION_ISSUES,verifiedImputation} from '../assets/own-payroll-imputation-model.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
import {imputationWorkspaceFixture,rehashImputationFixture} from './fixtures/own-payroll-imputation-synthetic.js';
import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './fixtures/native-leave-panel-dom.js';

// Actual component, synthetic responses and memory-only downloads. No server,
// SQL, durable approval, physical browser or municipal accounting is exercised.
async function revisedPreview(preview,configure){
 const next=structuredClone(preview);configure(next.source);await rehashImputationFixture(next.source);
 next.allocation=await verifiedImputation(next.source);next.allocationSha256=await accountingHash(next.allocation);return next;
}
async function harness(t,{mode='approved',configure=null}={}){
 const f=await imputationWorkspaceFixture(31),d=f.detail;
 if(configure)f.preview=await revisedPreview(f.preview,configure);
 d.proposal.status='approved';d.proposal.decision={command:'approve',reason:'Decisión independiente exclusivamente sintética',actorLabel:'Revisora sintética',recordedAt:'2026-10-09T15:00:00Z',revision:1};
 const env=nativeLeavePanelEnvironment(t),container=new NativeLeavePanelElement(),downloads=[],blobs=[],calls=[];
 const keys=['setInterval','clearInterval','setTimeout','clearTimeout'],before=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const urlBefore=Object.fromEntries(['createObjectURL','revokeObjectURL'].map(k=>[k,Object.getOwnPropertyDescriptor(URL,k)]));
 t.after(()=>{try{env.win.dispatch('pagehide');}finally{for(const k of keys)if(before[k])Object.defineProperty(globalThis,k,before[k]);else delete globalThis[k];for(const [k,desc]of Object.entries(urlBefore))Object.defineProperty(URL,k,desc);env.restore();}});
 Object.assign(globalThis,{setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}});
 env.document.head=new NativeLeavePanelElement('head');env.document.querySelector=()=>null;
 env.document.createElement=tag=>{const e=new NativeLeavePanelElement(tag);if(tag==='a')e.click=()=>downloads.push({href:e.href,name:e.download});return e;};
 URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:imputation-memory-'+blobs.length;};URL.revokeObjectURL=()=>{};
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:'aaaaaaaa-0000-4000-8000-000000000030',email:'imputation@example.test'},access:{context:'tenant',tenant:{id:'aaaaaaaa-0000-4000-8000-000000000031',roleKey:'QA'},tenantCapabilities:[...IMPUTATION_READ]},expiresAt:new Date(Date.now()+3600000).toISOString()};
 const state={detail:d,detailReads:0,preview:f.preview,sourceReads:0,sourceFailure:null,authFailure:null,afterDetail:null,afterSource:null,onFinalAuth:null};
 globalThis.fetch=async(url,options={})=>{
  assert.equal(options.method??'GET','GET','The download must not write');calls.push(url);let status=200,payload;
  if(url==='/api/internal-auth'){
   if((mode==='approved'?state.detailReads:state.sourceReads)>=3)await state.onFinalAuth?.();
   if(state.authFailure){status=state.authFailure;payload={ok:false,error:'Acceso sintético retirado'};}else payload=auth;
  }else if(url.includes('resource=bootstrap'))payload={ok:true,data:f.boot};
  else if(url.includes('resource=detail')){
   assert.equal(new URL(url,'https://synthetic.invalid').searchParams.get('id'),d.proposal.id);
   state.detailReads++;payload={ok:true,data:structuredClone(state.detail)};await state.afterDetail?.(state.detailReads);
  }else if(url.includes('resource=source')){
   const params=new URL(url,'https://synthetic.invalid').searchParams;
   assert.equal(params.get('id'),f.preview.source.group.groupId);assert.equal(params.get('fiscalYear'),f.preview.source.fiscalYear);
   state.sourceReads++;
   if(state.sourceFailure){status=state.sourceFailure;payload={ok:false,error:'No se verificó la fuente sintética'};}else payload={ok:true,data:structuredClone(state.preview)};
   await state.afterSource?.(state.sourceReads);
  }else assert.fail('Unexpected synthetic request '+url);
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 const mounted=mountOwnPayrollImputation(container),host=container.children[0],q=k=>{const e=host.querySelector('[data-imputation-'+k+']');assert.ok(e,k);return e;};
 q('year').validity={valid:true};
 const idle=async()=>{for(let i=0;i<1000&&host.getAttribute('aria-busy')!=='false';i++)await turn();assert.equal(host.getAttribute('aria-busy'),'false',q('status').textContent);};
 env.events.dispatch('taskchange',{id:'imputacion'});await idle();
 q('period').value=f.boot.period;q('type').value=f.boot.liquidationType;await q('consult').emit('click');
 if(mode==='approved'){q('proposal').value=d.proposal.id;await q('open').emit('click');assert.equal(q('export-csv').disabled,false);assert.equal(state.detailReads,1);}
 else{q('group').value=f.preview.source.group.groupId;await q('group').emit('change');q('year').value=f.preview.source.fiscalYear;await q('year').emit('change');await q('preview').emit('click');assert.equal(q('csv').disabled,false,q('status').textContent);assert.equal(state.sourceReads,1);}
 return {state,downloads,blobs,calls,q,env,host,mounted,download:()=>q(mode==='approved'?'export-csv':'csv').emit('click')};
}

test('approved distribution downloads every original row even when the current view has no match',async t=>{
 const h=await harness(t);h.q('search').value='NO_MATCH';await h.q('search').emit('input');assert.equal(h.q('rows').children.length,0);
 await h.download();assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,/distribucion-aprobada/);
 const csv=await h.blobs[0].text();assert.equal(csv.trimEnd().split('\r\n').length,h.state.detail.allocation.conceptCount+1);
 assert.ok(h.state.detail.allocation.rows.length>25);for(const r of h.state.detail.allocation.rows)assert.ok(csv.includes("'"+r.employeeNumber+'"'));
});

test('a source that is no longer current after the first read retires the approved copy',async t=>{
 const h=await harness(t);h.state.afterDetail=n=>{if(n===2)h.state.detail={...h.state.detail,sourceCurrent:false};};
 await h.download();assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('export').hidden,true);assert.match(h.q('status').textContent,/cambió|vigente|verific/i);
});

test('a changed complete approval decision after serialization cannot authorize the earlier copy',async t=>{
 const h=await harness(t);h.state.afterDetail=n=>{if(n===2){h.state.detail=structuredClone(h.state.detail);h.state.detail.proposal.decision.reason='Otra decisión documental exclusivamente sintética';}};
 await h.download();assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
});

test('a different proposal returned by the final read does not replace the selected approval',async t=>{
 const h=await harness(t);h.state.afterDetail=n=>{if(n===2){h.state.detail=structuredClone(h.state.detail);h.state.detail.proposal.id='aaaaaaaa-0000-4000-8000-000000000999';}};
 await h.download();assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
});

test('revoked access after preparing the bytes still prevents every download',async t=>{
 const h=await harness(t);h.state.afterDetail=n=>{if(n===2)h.state.authFailure=403;};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('content').hidden,true);
});

for(const event of ['visibilitychange','taskchange'])test('late final detail cannot restore or export a view retired by '+event,async t=>{
 const h=await harness(t);h.state.afterDetail=n=>{if(n!==3)return;if(event==='visibilitychange'){h.env.document.hidden=true;h.env.events.dispatch(event);}else h.env.events.dispatch(event,{id:'otra'});};
 await h.download();assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('content').hidden,true);assert.equal(h.q('rows').children.length,0);
});

test('a final session expiry after the second detail withdraws the copy without a replacement attempt',async t=>{
 const h=await harness(t);h.state.onFinalAuth=()=>{h.state.authFailure=401;};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('content').hidden,true);
});

function incidenceRows(csv){
 assert.ok(csv.endsWith('\r\n'));
 return csv.replace(/^\uFEFF/,'').slice(0,-2).split('\r\n').map(line=>{
  const fields=[],pattern=/"((?:[^"]|"")*)"(?:,|$)/g;let cursor=0,m;
  while((m=pattern.exec(line))){assert.equal(m.index,cursor);fields.push(m[1].replaceAll('""','"'));cursor=pattern.lastIndex;}
  assert.equal(cursor,line.length);assert.equal(fields.length,3);return fields;
 });
}

test('a current clean preview downloads only incidence headings without claiming an approval',async t=>{
 const h=await harness(t,{mode:'preview'});await h.download();assert.equal(h.downloads.length,1);
 assert.deepEqual(incidenceRows(await h.blobs[0].text()),[['Ordinal del concepto cerrado','Estado','Acción sugerida']]);
 assert.match(h.q('status').textContent,/sin observaciones; CSV con encabezados/);assert.equal(h.state.detailReads,0);
});

test('an unready preview exports every incidence beyond the visible page and search, with only nonpersonal columns',async t=>{
 const h=await harness(t,{mode:'preview',configure:s=>{s.configuration.definition.mappings=[];}}),a=h.state.preview.allocation;
 assert.equal(a.ready,false);assert.ok(a.issues.length>25);assert.equal(h.q('propose').disabled,true);
 h.q('search').value='NO_MATCH';await h.q('search').emit('input');assert.equal(h.q('rows').children.length,0);
 await h.download();assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,/incidencias-imputacion-2026\.csv$/);
 const csv=await h.blobs[0].text(),rows=incidenceRows(csv);assert.equal(rows.length,a.issues.length+a.globalIssues.length+1);
 assert.deepEqual(rows.slice(1).map(r=>r[0]),a.issues.map(i=>String(i.ordinal)));
 for(const [n,issue]of a.issues.entries())assert.deepEqual(rows[n+1].slice(1),IMPUTATION_ISSUES[issue.code]);
 for(const e of h.state.preview.source.group.snapshot.employees)assert.ok(!csv.includes(e.contractId));
 assert.ok(!csv.includes(h.state.preview.source.group.groupId));assert.ok(!csv.includes('PARTIDA-SINTETICA'));assert.ok(!csv.includes('Documento'));
 assert.match(h.q('status').textContent,/Incidencias completas descargadas/);assert.equal(h.state.detailReads,0);
});

test('a preview without any approved accounting configuration can still report its global incidence',async t=>{
 const h=await harness(t,{mode:'preview',configure:s=>{s.configuration={...s.configuration,revision:0,definition:null,proposalId:null,approvalId:null};}});
 assert.equal(h.state.preview.allocation.ready,false);await h.download();assert.equal(h.downloads.length,1);
 assert.deepEqual(incidenceRows(await h.blobs[0].text()).slice(1),[['',...IMPUTATION_ISSUES.configuration_required]]);
});

test('new valid incidences after the first source read prevent a stale clean CSV',async t=>{
 const h=await harness(t,{mode:'preview'}),successor=await revisedPreview(h.state.preview,s=>{s.configuration.definition.mappings=[];});
 assert.equal(h.state.preview.allocation.issues.length,0);assert.ok(successor.allocation.issues.length>25);
 h.state.afterSource=n=>{if(n===2)h.state.preview=successor;};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('review').hidden,true);assert.match(h.q('status').textContent,/Cambió la fuente/);
});

test('a changed preview revision cannot authorize bytes prepared for the earlier revision',async t=>{
 const h=await harness(t,{mode:'preview'});h.state.afterSource=n=>{if(n===2)h.state.preview={...h.state.preview,revision:1};};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('review').hidden,true);
});

test('a failure of the last source lookup prevents downloading its earlier diagnostic',async t=>{
 const h=await harness(t,{mode:'preview'});h.state.afterSource=n=>{if(n===2)h.state.sourceFailure=409;};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('review').hidden,true);
});

test('a final withdrawal of access retires incidence bytes without writing an operation',async t=>{
 const h=await harness(t,{mode:'preview'});h.state.afterSource=n=>{if(n===3)h.state.authFailure=403;};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('content').hidden,true);
});

for(const event of ['visibilitychange','taskchange'])test('a final incidence response cannot revive a preview retired by '+event,async t=>{
 const h=await harness(t,{mode:'preview'});h.state.afterSource=n=>{if(n!==3)return;if(event==='visibilitychange'){h.env.document.hidden=true;h.env.events.dispatch(event);}else h.env.events.dispatch(event,{id:'otra'});};
 await h.download();assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('content').hidden,true);assert.equal(h.q('rows').children.length,0);
});

test('a final session expiry after the last source read prevents the incidence download',async t=>{
 const h=await harness(t,{mode:'preview'});h.state.onFinalAuth=()=>{h.state.authFailure=401;};await h.download();
 assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);assert.equal(h.q('content').hidden,true);
});
