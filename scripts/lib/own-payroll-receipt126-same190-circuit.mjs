// PRIVATE SOURCE ONLY. No author import/execution or native admission.
// Same canonical190 schema, existing closed855 and sole existing reopen.
// All application functions/installation authority are explicitly injected.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable,Writable} from 'node:stream';
import {employeeContext} from '../../lib/internal-native-employees.js';

const VERSION='own-receipt126-same190-circuit-source.v1',FULL=32*1024*1024;
const FULL_JSON='application/vnd.municontrol.payroll-full.v1+json';
const SOURCE_PINS=Object.freeze([
 ["scripts/lib/own-payroll-full-capacity-190-continuation.mjs",46062,"995f1f701f4c96f5ca85f7f3e787b5939c0074ea8ab4066b8bdfcc19e6dd185b"],
 ["scripts/lib/own-payroll-full-capacity-190-rpc.mjs",3957,"2743c3f4a9069a119500839ceb18e97a931b2a1feee8a27c1c363eb595e21d4f"],
 ["scripts/lib/own-payroll-full-capacity-190-installation.mjs",11610,"f88d5a1979201c17572ae3c6932675dc991641cb736b9480895fd2ff761153eb"],
 ["scripts/lib/own-payroll-report-census-190-iam-fixture.mjs",9508,"c70429d6151bcd3dd94487a1643f196163e7e8be1e08bfc196f81fef9d8041b1"],
 ["scripts/lib/own-annulment-preparation-209-actors-fixture.mjs",23392,"c508f61f7a130585be36d4ff9298befb6d3897cce525f8315739a0dd63b65f9d"],
 ["scripts/lib/own-monthly-day-engine-circuit-fixture.mjs",12739,"0c989e0f9e69b6b2a41ca51fcf4c590b531c7bba7d2d36e4f4037c2991205e89"],
 ["scripts/lib/own-payroll-receipt-installation.mjs",9261,"0ac32b323abbe47661f1d2f29609829c05afd945e3b168be64ebc39ebf77dff6"],
 ["scripts/lib/own-payroll-receipt126-same190-inventory.mjs",7020,"ebd438ac7a791dec61a46223acece55b0b6d2599f901fb18f0a7406b4f2297cc"],
 ["scripts/lib/own-payroll-receipt126-inventory-model.mjs",7906,"3fb1ac17aea553ef37b5b832057482fdd3011c3bae26d9420a28675ece43232c"],
 ["scripts/lib/municipal-owner-adoption-decision-qa.mjs",56906,"3818ada20ee500085c8045e683b29c9bb55a4eaa03fc2137f7d817228f72136a"],
 ["scripts/lib/salary-auxiliary-namespace-installation.mjs",16071,"6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9"],
 ["scripts/migrations/126-own-payroll-receipts.sql",28950,"9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc"],
 ["scripts/migrations/142-adopted-own-payroll-receipts.sql",19945,"c92e086f7aa3c43e4662ead5ded70709092a03d9d6612bd81cdc7ba302deb294"],
 ["scripts/migrations/201-own-full-payroll-decision-capacity.sql",83125,"46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b"],
 ["assets/own-payroll-run-workspace-model.js",10822,"ed4636cfe779c7f4ba911514294c73e073180bb6b0b8274155f64f99a8620edb"],
 ["assets/own-payroll-receipt-model.js",21752,"991a76fc3912a0a92fcff88f686c0c4ebeaa4266ae7a65e84c58b6327d6e9eb3"],
 ["assets/own-payroll-receipt-panel.js",39777,"9d095af84e3f8771b0e9ee19f49988799c061bd85499d53400ed8a350474b06c"],
 ["assets/own-payroll-receipt-pdf.js",8420,"288175ecd065f0bacfa4c8e342aa0c45fbbf199a60a7b8c42e53f85b784b3622"],
 ["lib/internal-own-payroll-receipts.js",5269,"3dfabfd0f9c30a9441e5cd0eff235444976cb6c016f885d9789e43e5c8a54554"],
 ["api/internal-own-payroll-receipts.js",5965,"a63cebe4544288e9960e83c3e13630f75bff388a1f2b09d3038cf399c61d7558"],
 ["lib/municipal-document-issuer.js",3527,"39163725cf7a5e739e90a45b24466fe19e7893d6d0b1ce163dfb964b96d22019"],
 ["scripts/lib/own-payroll-canonical190-browser-host-qa.mjs",10962,"8216140ad4794caf733b44fe75d9f9bfedeabffd9331e8b569030dcd92277dd0"],
 ["scripts/verify-own-payroll-annulment-v2-full-capacity.mjs",65148,"ec522d09421692183bb1ce28d89d75c1ace1a31736882cf391480454dac0b2dc"],
 ["assets/own-payroll-receipt-self.js",6183,"da05891711deb73d172c8639131aca867b34320f2ea7858a653852e1dbf3a5a2"],
 ["assets/payroll-detail-export.js",14037,"318bb8d5e698c1fa2baef59e6fee180001cea07bd707c00c14e3c884e0b7c6db"],
 ["assets/own-payroll-close-model.js",17340,"a761bcf5fcfc8d160200799d9ac729efb8af535cea9e4aa3df760bc5836a3264"],
 ["assets/own-payroll-report-model.js",24510,"2f7ddb3989c55f0435fbb998ebf605353e818fcf13cb44369eb457114dcf3a98"],
 ["scripts/migrations/112-native-salary-definitions.sql",25276,"da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3"],
 ["centro-acciones.html",235783,"fea6d0ef13f9aa0c4dabe4ca0a1a574fb89685b602a4217a572f7cf9ec21b449"],
 ["lib/internal-native-employees.js",5272,"0f044bb371566fe2225ae875ca0383657c05f27fc876019b08ba779d80e121d8"],
 ["lib/private-json-body.js",3950,"fab88ee69c88ba5357df6e2184c03db6106f6f533a84f166c01c0c563e7de7f5"],
 ["lib/own-payroll-response.js",1332,"e8b56a78052f21e06fe49420dd1089e2cea728e178f2580fd987bafc363cf768"],
 ["assets/own-payroll-response.js",1613,"8c3f755274e79a7a1bafe849d05ec105ca2974dd3d34c39e56dcbdbb1aa02688"],
 ["scripts/lib/own-payroll-receipt126-same190-actors.mjs",40174,"531902fa7bcee051a22346917c97a51b2c05780642319e846a42c698bd00d113"],
 ["scripts/lib/own-payroll-receipt126-same190-support.mjs",18178,"b931d8967924d13102efc77460e853457ba2a5cc1aa85fba626b5ce3130a4729"],
 ["scripts/lib/own-payroll-receipt126-same190-shape.mjs",25768,"41d845018cf6df361f82ffd6674a8a4ada944d2ae126ea36ff7d74c1c264b460"],
]);
const RPC=new Map([
 ['SELECT public.own_receipt_preview_v1($1::jsonb,$2::jsonb) AS result',2],
 ['SELECT public.own_receipt_list_v1($1::jsonb,$2::text) AS result',2],
 ['SELECT public.own_receipt_batch_v1($1::jsonb,$2::uuid) AS result',2],
 ['SELECT public.own_receipt_attempt_v1($1::jsonb,$2::uuid) AS result',2],
 ['SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',3],
 ['SELECT public.own_receipt_self_v1($1::jsonb) AS result',1]
]);
const ACTOR_KEYS=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'];
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const sorted=v=>[...v].sort(),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const dto=raw=>Object.fromEntries(ACTOR_KEYS.map(key=>[key,raw[key]]));
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(sorted(Reflect.ownKeys(value)))===JSON.stringify(sorted(keys));

function sourceBookend(readRaw){
 assert.equal(typeof readRaw,'function');
 for(const [file,size,sha256] of SOURCE_PINS){const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'RECEIPT126_RAW_BUFFER_REQUIRED:'+file);assert.equal(raw.length,size,file);assert.equal(hash(raw),sha256,'RECEIPT126_SOURCE_CHANGED:'+file);}
 return SOURCE_PINS.map(([path,bytes,sha256])=>({path,bytes,sha256}));
}

// Whole current schema rows/security except the ONE intentional receipt ledger.
// Setup/restore are independently guarded transactions, outside this baseline.
function conservation(h){
 const s=q(h.qa.schema);
 return h.json([`DO $receipt126_circuit_keep$ DECLARE rel record;n bigint;fingerprint text;items jsonb:='[]';BEGIN
 FOR rel IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${s}::regnamespace AND c.relkind IN('r','p','m') AND c.relname<>'own_payroll_receipt_event' ORDER BY c.oid LOOP
 EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${s},rel.relname) INTO n,fingerprint;
 items:=items||jsonb_build_array(jsonb_build_object('oid',rel.oid,'table',rel.relname,'count',n,'sha256',fingerprint));END LOOP;
 PERFORM set_config('municontrol_receipt126.circuit_keep',jsonb_build_object('rows',items,
 'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_class c WHERE c.relnamespace=${s}::regnamespace),
 'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${s}::regnamespace),
 'attributeDefaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid WHERE c.relnamespace=${s}::regnamespace),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_constraint c WHERE c.connamespace=${s}::regnamespace),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${s}::regnamespace),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=${s}::regnamespace),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=${s}::regnamespace),
 'functions',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${s}::regnamespace),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
 'roleMemberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m),
 'defaultAcl',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d),
 'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid=${s}::regnamespace))::text,true);
 END $receipt126_circuit_keep$;SELECT current_setting('municontrol_receipt126.circuit_keep')::jsonb`],{readOnly:true,fullJson:true});
}
const ledger=h=>h.json([`SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM ${h.qa.schema}.own_payroll_receipt_event e`],{readOnly:true,fullJson:true});

// In-memory HTTP shape, real handler/stream and real existing db.query.
// This exercises API/service/SQL, never claims an actual network/browser trip.
class Response extends Writable{
 constructor(){super();this.statusCode=200;this.headers=new Map();this.parts=[];this.length=0;this.headersSent=false;}
 status(code){this.statusCode=code;return this;}
 setHeader(key,value){assert.equal(this.headersSent,false);this.headers.set(key.toLowerCase(),String(value));}
 _write(chunk,encoding,done){this.headersSent=true;const raw=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,encoding);this.length+=raw.length;if(this.length>FULL)return done(Error('RECEIPT126_HTTP_FULL_LIMIT'));this.parts.push(Buffer.from(raw));done();}
 json(value){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(value));return this;}
}
async function invoke({d,db,actor,method,path,body,key,trace,issuerProfiles}){
 let gets=0,queries=0;const calls=[];
 const sql={query:async(text,values)=>{assert.ok(RPC.has(text),'RECEIPT126_NON_LITERAL_RPC');assert.equal(values.length,RPC.get(text));assert.ok(values.every(v=>typeof v==='string'));const context=JSON.parse(values[0]);assert.ok(exact(context,ACTOR_KEYS));assert.deepEqual(context,actor.raw,'RECEIPT126_FOREIGN_CONTEXT');calls.push(text);queries++;return db.query(text,values);}};
 const origin='http://127.0.0.1:4386',raw=body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body));assert.ok(raw.length<=16384);
 const req=Readable.from(raw.length?[raw]:[]);Object.assign(req,{method,url:path,query:Object.fromEntries(new URL(path,origin).searchParams),headers:{accept:FULL_JSON,origin,...(method==='POST'?{'content-type':'application/json','content-length':String(raw.length)}:{}),...(key?{'idempotency-key':key}:{})}});
 const res=new Response(),closed=new Promise((resolve,reject)=>{res.once('finish',resolve);res.once('error',reject);res.once('close',()=>{if(!res.writableFinished)reject(Error('RECEIPT126_HTTP_PREMATURE_CLOSE'));});});
 closed.catch(()=>{}); // Keep an early stream rejection handled while handler unwinds.
 const handler=d.createOwnReceiptHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:async()=>({mode:'managed',principal:actor.principal}),sessionFor:()=>actor.session,getSql:async()=>{gets++;return sql;},issuerProfiles});
 try{await handler(req,res);await closed;}catch(error){res.destroy();await closed.catch(()=>{});throw error;}
 const output=Buffer.concat(res.parts),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output)),announced=res.headers.get('x-municontrol-json-bytes');if(announced!==undefined)assert.equal(Number(announced),output.length);
 const row={actor:actor.name,method,path,status:res.statusCode,bytes:output.length,key:key??null,operation:body?.operation??null,command:body?.payload?.command??null,getSqlCalls:gets,rpcCalls:queries,rpcs:calls,replayed:res.headers.get('idempotency-replayed')==='true',code:value.code??null};trace.push(row);return{...row,value};
}

// Closed operation reader for the literal UNCOMPRESSED encoder pinned above.
// Only page/font/size/x/y metadata is numeric. Amounts/totals remain exact text.
// This is source-operation evidence, never rendered typography/layout evidence.
function pdfTexts(raw,pageCount){
 assert.ok(raw instanceof Uint8Array);const text=Buffer.from(raw).toString('latin1');assert.ok(text.startsWith('%PDF-1.4\n')&&text.endsWith('%%EOF\n'));assert.ok(!/\/Filter\b/.test(text));
 assert.equal((text.match(/\/Type \/Page /g)??[]).length,pageCount);assert.equal(Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1]),pageCount);
 const pages=[],number='([+-]?[0-9]+(?:\\.[0-9]+)?(?:e[+-]?[0-9]+)?)',grammar=new RegExp('^BT /(F[12]) '+number+' Tf 0\\.07 0\\.20 0\\.25 rg 1 0 0 1 '+number+' '+number+' Tm <([0-9a-f]+)> Tj ET$');
 for(const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)){
  assert.equal(Buffer.byteLength(match[2],'latin1'),Number(match[1]));const page=pages.length+1,operations=match[2].split('\n').map((line,order)=>{const m=grammar.exec(line);assert.ok(m,'RECEIPT126_PDF_UNKNOWN_OPERATION_GRAMMAR');assert.equal(m[5].length%2,0);const size=Number(m[2]),x=Number(m[3]),y=Number(m[4]);assert.ok([size,x,y].every(Number.isFinite)&&size>0);return{page,order,font:m[1],size,x,y,text:new TextDecoder('windows-1252',{fatal:true}).decode(Buffer.from(m[5],'hex'))};});assert.ok(operations.length);pages.push(operations);
 }
 assert.equal(pages.length,pageCount);return pages;
}
function pdfRole(op,{font,size,x,y,text}={}){assert.ok(op,'RECEIPT126_PDF_OPERATION_MISSING');for(const [key,value]of Object.entries({font,size,x,y,text}))if(value!==undefined)assert.equal(op[key],value,'RECEIPT126_PDF_OPERATION_'+key);}
// ONLY the explicit wrap() projection in pinned receipt-pdf.js normalizes spaces.
// Labels use receiptPdfLines() instead: their description fragments concatenate
// byte-for-text exactly, without this projection.
const pdfWrappedText=value=>String(value).trim().replace(/\s+/g,' ');
function consumePdfParagraph(operations,start,expected,{font='F1',size=9,x=38,label}={}){
 const value=pdfWrappedText(expected);assert.ok(value.length);let position=0,cursor=start;
 while(position<value.length){const op=operations[cursor];pdfRole(op,{font,size,x});assert.equal(op.text,op.text.trim(),'RECEIPT126_PDF_WRAPPED_EDGE_SPACE');assert.ok(op.text.length);if(position>0&&value[position]===' ')position++;assert.equal(value.slice(position,position+op.text.length),op.text,'RECEIPT126_PDF_PARAGRAPH:'+label);position+=op.text.length;cursor++;}
 assert.equal(position,value.length);return cursor;
}
const pdfOperationReference=op=>({page:op.page,order:op.order,font:op.font,size:op.size,x:op.x,y:op.y,text:op.text});
// Pure QA export: callers provide the exact selected records and writer projections.
// It performs no I/O and never infers expected money from rendered amounts.
export function assertOwnReceipt126PdfRecords(input,dependencies){
 assert.ok(exact(input,['bytes','pageCount','recordCount','records','params','sources','batchId']),'RECEIPT126_PDF_EXACT_INPUT_REQUIRED');assert.ok(exact(dependencies,['ownReceiptPresentation']),'RECEIPT126_PDF_EXACT_DEPENDENCIES_REQUIRED');
 const {bytes:raw,pageCount,recordCount,records,params,sources,batchId}=input,{ownReceiptPresentation}=dependencies;assert.equal(typeof ownReceiptPresentation,'function');assert.ok(Array.isArray(records)&&records.length>0);assert.ok(exact(params,['period','issuer','paymentDate','legend'])&&exact(params.issuer,['name','taxId','address']),'RECEIPT126_PDF_EXACT_PARAMS_REQUIRED');assert.ok([params.period,params.issuer.name,params.issuer.taxId,params.issuer.address,params.legend,batchId].every(v=>typeof v==='string'));assert.ok(params.paymentDate===null||typeof params.paymentDate==='string');assert.ok(Array.isArray(sources)&&sources.length>0);
 const sourceById=new Map();for(const source of sources){assert.ok(exact(source,['id','snapshotSha256','period','type']),'RECEIPT126_PDF_EXACT_SOURCE_REQUIRED');assert.ok([source.id,source.snapshotSha256,source.period,source.type].every(v=>typeof v==='string'&&v.length>0));assert.equal(source.period,params.period);assert.ok(!sourceById.has(source.id),'RECEIPT126_PDF_DUPLICATE_SOURCE');sourceById.set(source.id,source);}
 const expectedRecords=records.length,expectedConcepts=records.reduce((n,r)=>n+r.concepts.length,0);assert.equal(recordCount,expectedRecords);assert.ok(Number.isSafeInteger(pageCount)&&pageCount>=expectedRecords&&pageCount<=8000);
 const pages=pdfTexts(raw,pageCount),recordByNumber=new Map(records.map(record=>[record.employeeNumber,record])),byNumber=new Map();assert.equal(recordByNumber.size,expectedRecords);
 // Consume and verify every excluded page-header/footer operation explicitly.
 // Thus page chrome cannot satisfy a concept amount or a total in body blocks.
 for(const operations of pages){
  pdfRole(operations[0],{font:'F2',size:14,x:38,y:796,text:'MuniControl · RECIBO PROPIO PARA REVISIÓN'});const header=operations[1];pdfRole(header,{font:'F2',size:10,x:38,y:774});const number=/ · Legajo (\d+)$/.exec(header.text)?.[1],record=recordByNumber.get(number);assert.ok(record,'RECEIPT126_PDF_FOREIGN_LEGAJO');const source=sourceById.get(record.sourceGroupId);assert.ok(source,'RECEIPT126_PDF_FOREIGN_SOURCE');assert.ok(header.text.startsWith(source.period+' · '),'RECEIPT126_PDF_SOURCE_PERIOD_HEADER');
  let cursor=2,name=[];while(operations[cursor]?.font==='F2'&&operations[cursor]?.size===11&&operations[cursor]?.x===38){pdfRole(operations[cursor],{y:754-name.length*15});name.push(operations[cursor++]);}assert.ok(name.length);assert.equal(consumePdfParagraph(name,0,record.name,{font:'F2',size:11,label:'employee-name'}),name.length);
  const nameEnd=754-name.length*15;pdfRole(operations[cursor++],{font:'F1',size:9,x:38,y:nameEnd,text:'DNI '+record.dni+' · CUIL '+record.cuil});pdfRole(operations[cursor++],{font:'F1',size:9,x:38,y:nameEnd-18,text:'Convenio '+record.agreementCode+' · Repartición '+record.departmentCode+' · Versión '+record.liquidationVersion});
  assert.ok(cursor<operations.length-2);pdfRole(operations.at(-2),{font:'F2',size:8,x:38,y:52,text:'SIN FIRMA DIGITAL · COPIA PARA REVISIÓN'});pdfRole(operations.at(-1),{font:'F1',size:8,x:480,y:38});if(!byNumber.has(number))byNumber.set(number,{pages:[],body:[]});const current=byNumber.get(number);current.pages.push(operations);current.body.push(...operations.slice(cursor,-2));
 }
 assert.equal(byNumber.size,expectedRecords);assert.deepEqual(sorted(byNumber.keys()),sorted(recordByNumber.keys()));const recordEvidence=[];let operationCount=0;
 for(const record of records){
  const current=byNumber.get(record.employeeNumber),body=current.body,presentation=ownReceiptPresentation(record);for(const [i,page]of current.pages.entries()){assert.equal(page.at(-1).text,`${i+1} / ${current.pages.length}`);operationCount+=page.length;}
  let metadataEnd=0;for(const [text,font]of [['Emisor declarado: '+params.issuer.name,'F2'],['CUIT '+params.issuer.taxId+' · '+params.issuer.address,'F1'],['Fecha de pago/acreditación declarada: '+(params.paymentDate??'No informada'),'F1'],['La fecha declarada no acredita pago. Firma digital pendiente.','F1'],['Disponibilidad revisada por otra persona.','F2'],...(params.legend?[[params.legend,'F1']]:[])])metadataEnd=consumePdfParagraph(body,metadataEnd,text,{font,label:'issuer-and-availability'});
  const heading=text=>body.map((op,i)=>({op,i})).filter(({op})=>op.font==='F2'&&op.size===9&&op.x===38&&op.text===text).map(({i})=>i),totals=heading('Totales exactos de la liquidación cerrada'),origin=heading('Origen y estado del documento');assert.equal(totals.length,1);assert.equal(origin.length,1);assert.ok(origin[0]>totals[0]);
  const isCode=op=>op.font==='F2'&&op.size===9&&op.x===38&&/^[0-9]{1,9}$/.test(op.text);assert.equal(body.filter(isCode).length,record.concepts.length,'RECEIPT126_PDF_ALL_CODE_COUNT');const groups=presentation.groups.map(group=>({group,positions:heading(group.title)}));for(const group of groups)assert.equal(group.positions.length,1);assert.equal(groups[0]?.positions[0],metadataEnd,'RECEIPT126_PDF_EXTRA_ISSUER_OPERATION');const amountBindings=[];let previous=-1;
  for(const [groupIndex,{group,positions}]of groups.entries()){
   const start=positions[0],end=groupIndex+1<groups.length?groups[groupIndex+1].positions[0]:totals[0];assert.ok(start>previous&&end>start);previous=start;const markers=[];for(let i=start+1;i<end;i++)if(isCode(body[i]))markers.push(i);assert.equal(markers.length,group.rows.length,'RECEIPT126_PDF_GROUP_CODE_COUNT:'+group.nature);assert.ok(markers[0]>start+1,'RECEIPT126_PDF_GROUP_EXPLANATION_MISSING');const explanationEnd=consumePdfParagraph(body,start+1,group.explanation,{label:'group-explanation:'+group.nature});assert.equal(explanationEnd,markers[0],'RECEIPT126_PDF_EXTRA_GROUP_PREFIX_OPERATION');
   for(const [ordinal,concept]of group.rows.entries()){
    const at=markers[ordinal],limit=ordinal+1<markers.length?markers[ordinal+1]:end,block=body.slice(at,limit),code=block[0];assert.equal(code.text,concept.code,'RECEIPT126_PDF_ORDERED_CODE');const description=block.filter(op=>op.x===92&&op.font==='F1'&&op.size===9),units=block.filter(op=>op.x===92&&op.font==='F1'&&op.size===8),amounts=block.filter(op=>op!==code&&op.font==='F2');assert.ok(description.length&&units.length);assert.equal(amounts.length,1,'RECEIPT126_PDF_ONE_AMOUNT_IN_OWN_BLOCK');const amount=amounts[0];assert.equal(amount.text,concept.displayAmount,'RECEIPT126_PDF_EXACT_AMOUNT_IN_OWN_BLOCK');assert.ok(amount.size>0&&amount.size<=9&&amount.x>=38&&amount.x<=553);assert.equal(description.map(op=>op.text).join(''),concept.label,'RECEIPT126_PDF_EXACT_DESCRIPTION_IN_OWN_BLOCK');assert.equal(consumePdfParagraph(units,0,'Unidad: '+concept.displayUnit,{font:'F1',size:8,x:92,label:'unit:'+group.nature+':'+concept.code}),units.length);
    assert.equal(block.length,2+description.length+units.length,'RECEIPT126_PDF_UNKNOWN_CONCEPT_BLOCK_OPERATION');assert.deepEqual(block,[code,...description,amount,...units]);for(const [i,op]of description.entries()){assert.equal(op.page,code.page);assert.equal(op.y,code.y-i*13);}assert.equal(amount.page,code.page);const below=code.y-description.length*13-4,lateral=amount.y===code.y;if(lateral)assert.equal(amount.size,9);else assert.equal(amount.y,below,'RECEIPT126_PDF_SEPARATE_AMOUNT_POSITION');for(const [i,op]of units.entries()){assert.equal(op.page,code.page);assert.equal(op.y,(lateral?below:below-15)-i*11);}
    amountBindings.push({namespace:group.nature==='auxiliary'?'auxiliary':'concept',nature:group.nature,code:concept.code,ordinal:ordinal+1,operation:pdfOperationReference(amount)});
   }
  }
  // Six label+amount pairs consumed in order ONLY between Totales and Origen.
  // A value belonging to another receipt, concept or section cannot satisfy one.
  const totalOperations=body.slice(totals[0]+1,origin[0]),totalBindings=[];assert.equal(presentation.totals.length,6);assert.deepEqual(presentation.totals.map(t=>t.key),['remuneration','non_remuneration','deduction','employer_contribution','gross','net']);let cursor=0;
  for(const total of presentation.totals){const begin=cursor;cursor=consumePdfParagraph(totalOperations,cursor,total.label+': '+total.displayAmount,{font:total.key==='net'?'F2':'F1',label:'total:'+total.key});totalBindings.push({key:total.key,operations:totalOperations.slice(begin,cursor).map(pdfOperationReference)});}
  cursor=consumePdfParagraph(totalOperations,cursor,presentation.netExplanation,{label:'net-explanation'});assert.equal(cursor,totalOperations.length,'RECEIPT126_PDF_EXTRA_OR_DUPLICATE_TOTAL');assert.equal(amountBindings.length,record.concepts.length);
  const source=sourceById.get(record.sourceGroupId),originOperations=body.slice(origin[0]+1);let originEnd=0;for(const text of ['Identidad del registro municipal verificado. Conceptos del catálogo conservado en el cálculo.','Emisión: '+batchId,'Grupo cerrado: '+source.id,'Huella del cierre: '+source.snapshotSha256,'No acredita firma digital, imputación ni ejecución de pago.'])originEnd=consumePdfParagraph(originOperations,originEnd,text,{label:'conserved-origin'});assert.equal(originEnd,originOperations.length,'RECEIPT126_PDF_EXTRA_ORIGIN_OPERATION');
  recordEvidence.push({employeeNumber:record.employeeNumber,sourceGroupId:record.sourceGroupId,pageNumbers:current.pages.map(ops=>ops[0].page),conceptCount:amountBindings.length,totalCount:totalBindings.length,amountBindingsSha256:hash(JSON.stringify(amountBindings)),totalBindingsSha256:hash(JSON.stringify(totalBindings)),paramsSha256:hash(JSON.stringify(params)),sourceSha256:hash(JSON.stringify(source))});
 }
 return{recordCount:expectedRecords,conceptCount:expectedConcepts,pageCount,bytes:raw.length,sha256:hash(raw),operationCount,recordEvidence,closedUncompressedSourceGrammar:true,amountsBoundToOwnNamespaceCodeOrdinalBlock:true,sixTotalsBoundToEachReceiptSection:true,monetaryNumbersParsed:false,renderedLayoutVerified:false};
}
function verifyPdf(pdf,batch,d,{self=false,index=0}={}){
 let records,params,sources,batchId;if(self){const own=d.ownReceiptSelf(batch);assert.equal(own.items.length,1);assert.equal(index,0);const item=own.items[index];records=[item.record];params=item.params;sources=[item.source];batchId=item.batchId;}else{records=batch.snapshot.records;params=batch.snapshot.params;sources=batch.snapshot.sources;batchId=batch.id;}
 const expectedRecords=self?1:855,expectedConcepts=self?20:17100;assert.equal(records.length,expectedRecords);assert.equal(records.reduce((n,r)=>n+r.concepts.length,0),expectedConcepts);assert.equal(pdf.recordCount,expectedRecords);
 return assertOwnReceipt126PdfRecords({bytes:pdf.bytes,pageCount:pdf.pageCount,recordCount:pdf.recordCount,records,params:{period:params.period,issuer:{name:params.issuer.name,taxId:params.issuer.taxId,address:params.issuer.address},paymentDate:params.paymentDate,legend:params.legend},sources:sources.map(source=>({id:source.id,snapshotSha256:source.snapshotSha256,period:source.period,type:source.type})),batchId},{ownReceiptPresentation:d.ownReceiptPresentation});
}

export async function runOwnReceipt126Same190Circuit(context,d){
 let h,db,qa,contracts,second,closed,closedCensus,actorsPlan,actorsProof,installationPlan,installationProof,readRaw;
 // FULL actorsProof remains available for the exact restore; never substitute
 // the abbreviated assertActorsProof return in the restore builder.
 let primary=null,restoreError=null,restoreProof=null,result=null,browser=null;
 const trace=[],events=[],checks=[];const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 try{
  // Capture restoration inputs FIRST, before any operational context guard.
  // Null context provides no committed plan/proof: preserve its TypeError,
  // without inventing a restore transaction. Caller owns finally from setup.
  ({actorsPlan,actorsProof,h,readRaw}=context??{});
  ({db,qa,contracts,second,closed,closedCensus,installationPlan,installationProof}=context);
  assert.strictEqual(h.qa,qa);assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(h.sourceCommit,qa.sourceCommit);assert.equal(h.major,qa.major);assert.equal(context.version,'own-receipt126-after-closed127-context.v1');
  for(const name of ['verifyInstallation','assertActorsProof','buildCheckerRestore','executeCheckerRestore','ownerProgramQaAccess','createOwnReceiptHandler','ownReceiptParams','ownReceiptCommand','verifiedOwnReceiptPreview','ownReceiptBatch','ownReceiptSelf','ownReceiptVisibleRecords','ownReceiptPresentation','createOwnReceiptPdf','ownRunHash','randomUUID','createReceipt126Browser'])assert.equal(typeof d?.[name],'function','RECEIPT126_DEPENDENCY_PENDING:'+name);
  const sourcePins=sourceBookend(readRaw);await d.verifyInstallation({h,plan:installationPlan,proof:installationProof,phase:'before-receipt-circuit'});const checked=d.assertActorsProof(actorsPlan,actorsProof);
  assert.equal(actorsPlan.schema,qa.schema);assert.equal(actorsPlan.sourceCommit,h.sourceCommit);assert.equal(contracts.length,855);assert.deepEqual(sorted(contracts),sorted(second.saved.input.employees.map(r=>r.contractId)));assert.equal(second.saved.result.rowCount,17100);assert.equal(closed.snapshot.employeeCount,855);assert.equal(closed.snapshot.conceptCount,17100);assert.equal(closed.snapshotSha256,d.ownRunHash(closed.snapshot));assert.equal(closedCensus.eventCount,1);assert.equal(closedCensus.groups.length,1);assert.equal(closedCensus.groups[0].id,closed.groupId);assert.equal(closedCensus.groups[0].state,'closed');assert.equal(closedCensus.groups[0].snapshotSha256,closed.snapshotSha256);
  const resolve=async descriptor=>{assert.ok(exact(descriptor.raw,ACTOR_KEYS));const raw=dto(descriptor.raw),access=d.ownerProgramQaAccess(h.json([descriptor.accessSql],{readOnly:true}),raw);assert.equal(access.principal.authorized,true);assert.equal(access.principal.session.mfa,true);const session={id:access.session.id,email:raw.actorEmail,version:access.session.version,releaseSha:raw.releaseSha};assert.equal(session.id,raw.actorSessionId);assert.equal(session.version,raw.actorSessionVersion);assert.equal(access.principal.tenant.membershipId,raw.membershipId);const expected=descriptor.name==='preparer'?sorted([...actorsProof.checkerCapabilitiesBefore,'payroll.receipt.prepare']):sorted(descriptor.expectedCapabilities);assert.deepEqual(sorted(access.principal.tenant.effectiveCapabilities),expected);const native=await db.run(descriptor.contextSql,true);assert.equal(native.membershipId,raw.membershipId);assert.equal(native.actorEmail,raw.actorEmail);return{name:descriptor.name,raw,principal:access.principal,session,roleKey:descriptor.name==='preparer'?checked.checkerRoleKey:descriptor.roleKey,native};};
  const actors=new Map();for(const descriptor of actorsPlan.accessDescriptors)actors.set(descriptor.name,await resolve(descriptor));assert.deepEqual(sorted(actors.keys()),['agent','preparer','reviewer']);const preparer=actors.get('preparer'),reviewer=actors.get('reviewer'),agent=actors.get('agent');for(const key of ['membershipId','actorPersonId','actorEmail'])assert.notEqual(preparer.native[key],reviewer.native[key],'RECEIPT126_INDEPENDENT_NATIVE_IDENTITY');assert.equal(agent.native.actorPersonId,actorsProof.actors.find(r=>r.name==='agent').personId);assert.deepEqual(sorted(agent.raw&&Object.keys(agent.raw)),ACTOR_KEYS);
  const profile={id:'receipt126-synthetic-only',revision:1,issuer:{name:'MUNICIPIO EXCLUSIVAMENTE SINTETICO QA126',taxId:'00000000000',address:'DOMICILIO EXCLUSIVAMENTE FICTICIO QA126'},source:{kind:'municipal_official_backup',label:'FIXTURE SINTETICO: no es respaldo oficial ni validez institucional',cutoff:'2026-10-01T00:00:00',validityDeclared:false}},issuerProfiles=new Map([[qa.actor.tenantId,profile]]);
  const request=(actor,method,path,body,key)=>invoke({d,db,actor,method,path,body,key,trace,issuerProfiles});const get=(actor,resource,values={})=>request(actor,'GET','/api/internal-own-payroll-receipts?'+new URLSearchParams({resource,...values}));const preview=async actor=>{const value=await request(actor,'POST','/api/internal-own-payroll-receipts',{operation:'preview',params});assert.equal(value.status,200);assert.equal(value.value.ok,true);return d.verifiedOwnReceiptPreview(value.value.data);};const command=(actor,body,key)=>request(actor,'POST','/api/internal-own-payroll-receipts',{operation:'command',payload:d.ownReceiptCommand(body)},key);
  const initialRows=ledger(h);assert.deepEqual(initialRows,[]);const baseline=conservation(h);const unchanged=()=>assert.deepEqual(conservation(h),baseline,'RECEIPT126_UNDECLARED_ROW_OR_METADATA_CHANGE');
  const issuer=await get(preparer,'issuer');assert.equal(issuer.status,200);assert.equal(issuer.rpcCalls,0);assert.equal(issuer.value.data.state,'configured');assert.deepEqual(issuer.value.data.profile.issuer,profile.issuer);
  const params=d.ownReceiptParams({period:closed.body.period,types:[closed.body.liquidationType],filters:{employeeFrom:'',employeeTo:'',departmentFrom:'',departmentTo:'',agreementFrom:'',agreementTo:''},issuer:issuer.value.data.profile.issuer,paymentDate:null,legend:'Emisión exclusivamente sintética para revisión QA126; sin firma ni pago'});
  browser=await d.createReceipt126Browser({h,db,qa,actors,issuerProfiles,params,trace});
   assert.equal(context.maker?.session?.id,qa.actor.actorSessionId);const maker={...context.maker,name:'maker',raw:dto(qa.actor)},makerPreview=await request(maker,'POST','/api/internal-own-payroll-receipts',{operation:'preview',params});assert.equal(makerPreview.status,403);assert.equal(makerPreview.value.code,'OWN_RECEIPT_FORBIDDEN');assert.equal(makerPreview.getSqlCalls,0);assert.equal(makerPreview.rpcCalls,0);
  const first=await preview(preparer),again=await preview(preparer);assert.deepEqual(again,first);assert.equal(first.permissions.canPrepare,true);const snapshot=first.snapshot;assert.equal(snapshot.version,'own-receipt-snapshot.v3');assert.equal(snapshot.identityBasis,'owned_registration_verified_at_capture');assert.equal(snapshot.recordCount,855);assert.equal(snapshot.conceptCount,17100);assert.equal(snapshot.sources.length,1);assert.equal(snapshot.sources[0].id,closed.groupId);assert.equal(snapshot.sources[0].snapshotSha256,closed.snapshotSha256);assert.equal(snapshot.sources[0].selectedCount,855);assert.deepEqual(sorted(snapshot.records.map(r=>r.contractId)),sorted(contracts));assert.equal(new Set(snapshot.records.map(r=>r.contractId)).size,855);
  for(const record of snapshot.records){assert.equal(record.concepts.length,20);const employee=closed.snapshot.employees.find(r=>r.contractId===record.contractId);assert.ok(employee);assert.equal(employee.runId,second.id);const {contractId,...totals}=employee.totals;assert.equal(contractId,record.contractId);assert.deepEqual(record.totals,totals);for(const concept of record.concepts){const line=closed.snapshot.concepts.find(r=>r.contractId===record.contractId&&r.conceptCode===concept.code&&r.nature===concept.nature);assert.ok(line);for(const field of ['amount','unit','nature'])assert.equal(concept[field],line[field]);assert.equal(concept.labelSourceSha256,second.payloadSha256);const items=second.payload.programState.salaryCatalog.items.filter(r=>r.kind===(concept.nature==='auxiliary'?'auxiliary':'concept')&&r.agreementCode===record.agreementCode&&r.code===concept.code&&r.active&&r.validFrom<=params.period&&(r.validUntil===null||r.validUntil>=params.period));assert.equal(items.length,1);assert.equal(concept.label,items[0].label);}}
  const filtered=d.ownReceiptVisibleRecords(snapshot,'SIN COINCIDENCIA SINTETICA QA126',1);assert.equal(filtered.rows.length,0);assert.equal(filtered.total,855);assert.equal(snapshot.records.length,855);check(true,'two full previews and no-match presentation preserve855/17100 and captured labels/units/totals');unchanged();
  const prepareBody=d.ownReceiptCommand({command:'prepare',scopeVersion:first.scopeVersion,sourceVersion:snapshot.sourceVersion,params,batchId:null,batchSha256:null,reason:'Preparación exclusivamente sintética de855 recibos completos',reviewConfirmed:false});const prepareUi=await browser.prepare(prepareBody),prepareKey=prepareUi.key,prepared=prepareUi.response;assert.equal(prepared.status,201);assert.equal(prepared.value.data.replayed,false);events.push(prepared.value.data);const batchId=prepared.value.data.batchId;assert.equal(batchId,prepared.value.data.id);
  for(const replay of [await browser.replayPrepared(prepareBody,prepareKey),await browser.preparedAttempt(prepareKey)]){assert.equal(replay.status,200);assert.equal(replay.replayed,true);assert.deepEqual(replay.value.data,{...prepared.value.data,replayed:true});}
  const preparerCtx=JSON.stringify(employeeContext(preparer.principal,preparer.session)),reviewerCtx=JSON.stringify(employeeContext(reviewer.principal,reviewer.session));
  const changedBody={...prepareBody,reason:'Distinto cuerpo exclusivamente sintético de la misma clave'},duplicateKey=d.randomUUID();
  await db.expectQueryError({caseId:'126-prepare-key-changed-body',nativeCode:'OWN_RECEIPT_IDEMPOTENCY_REUSE',text:'SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[preparerCtx,JSON.stringify(d.ownReceiptCommand(changedBody)),prepareKey]},async()=>{
   const changed=await command(preparer,changedBody,prepareKey);assert.equal(changed.status,409);assert.equal(changed.value.code,'OWN_RECEIPT_IDEMPOTENCY_REUSE');assert.equal(ledger(h).length,1);unchanged();
  });
  await db.expectQueryError({caseId:'126-prepare-duplicate-new-key',nativeCode:'OWN_RECEIPT_DUPLICATE',text:'SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',values:[preparerCtx,JSON.stringify(d.ownReceiptCommand(prepareBody)),duplicateKey]},async()=>{
   const duplicate=await command(preparer,prepareBody,duplicateKey);assert.equal(duplicate.status,409);assert.equal(duplicate.value.code,'OWN_RECEIPT_DUPLICATE');assert.equal(ledger(h).length,1);unchanged();
  });
  await db.expectQueryError({caseId:'126-other-reviewer-attempt',nativeCode:'OWN_RECEIPT_NOT_FOUND',text:'SELECT public.own_receipt_attempt_v1($1::jsonb,$2::uuid) AS result',values:[reviewerCtx,prepareKey]},async()=>{
   const foreign=await get(reviewer,'attempt',{key:prepareKey});assert.equal(foreign.status,404);assert.equal(foreign.value.code,'OWN_RECEIPT_NOT_FOUND');assert.equal(ledger(h).length,1);unchanged();
  });
  const preparedBatch=d.ownReceiptBatch((await get(preparer,'batch',{id:batchId})).value.data);assert.equal(preparedBatch.state,'prepared');assert.equal(preparedBatch.sourceCurrent,true);assert.deepEqual(preparedBatch.snapshot,snapshot);assert.equal(preparedBatch.snapshotSha256,first.snapshotSha256);assert.deepEqual(preparedBatch.permissions,{canApprove:false,canWithdraw:false,canDownload:true});
  const decisionBase={scopeVersion:first.scopeVersion,sourceVersion:snapshot.sourceVersion,params:null,batchId,batchSha256:first.snapshotSha256,reason:'Revisión independiente exclusivamente sintética del conjunto completo',reviewConfirmed:true};for(const name of ['approve','withdraw']){const denied=await command(preparer,{...decisionBase,command:name},d.randomUUID());assert.equal(denied.status,403);assert.equal(denied.value.code,'OWN_RECEIPT_FORBIDDEN');assert.equal(denied.getSqlCalls,0);assert.equal(denied.rpcCalls,0);}assert.equal(ledger(h).length,1);unchanged();check(true,'prepare replay/attempt intact; same-key conflict/duplicate/foreign attempt rejected; checker approve/withdraw403 occur BEFORE SQL');
  const reviewerList=await get(reviewer,'list',{period:params.period});assert.equal(reviewerList.status,200);assert.deepEqual(reviewerList.value.data.items.map(r=>r.id),[batchId]);const approvable=d.ownReceiptBatch((await get(reviewer,'batch',{id:batchId})).value.data);assert.equal(approvable.permissions.canApprove,true);assert.notEqual(reviewerList.value.data.scopeVersion,first.scopeVersion);const approvalUi=await browser.approve({...decisionBase,scopeVersion:reviewerList.value.data.scopeVersion,command:'approve'}),approval=approvalUi.response;assert.equal(approval.status,201);events.push(approval.value.data);const approved=d.ownReceiptBatch((await get(reviewer,'batch',{id:batchId})).value.data);assert.equal(approved.state,'approved');assert.equal(approved.sourceCurrent,true);assert.equal(approved.review.id,approval.value.data.id);assert.equal(approved.permissions.canDownload,true);assert.equal(approved.review.by,reviewer.native.actorLabel||'Autoridad municipal');assert.equal(ledger(h).length,2);unchanged();
  const self=d.ownReceiptSelf((await get(agent,'self')).value.data);assert.equal(self.items.length,1);assert.equal(self.items[0].batchId,batchId);assert.equal(self.items[0].record.contractId,actorsPlan.nativeIdentityContracts[1]);assert.equal(self.items[0].record.personId,agent.native.actorPersonId);assert.equal(self.items[0].record.concepts.length,20);assert.deepEqual(self.items[0].record,snapshot.records.find(r=>r.contractId===actorsPlan.nativeIdentityContracts[1]));const selfPreview=await request(agent,'POST','/api/internal-own-payroll-receipts',{operation:'preview',params});assert.equal(selfPreview.status,403);assert.equal(selfPreview.getSqlCalls,0);
  const {pdf,selfPdf}=await browser.downloads({approvedBatch:approved,self}),pdfEvidence=verifyPdf(pdf,approved,d),pdfArchivedHash=hash(pdf.bytes),selfPdfEvidence=verifyPdf(selfPdf,self,d,{self:true,index:0}),selfPdfArchivedHash=hash(selfPdf.bytes);browser.admitPdfOracles({pdfEvidence,selfPdfEvidence});await browser.retirePreparer();unchanged();check(true,'two existing decisions use real panels/HTTP; downloaded full855/17100 and own1/20 PDF bytes pass the complete source-operation oracle');
  result={version:VERSION,sourceCommit:h.sourceCommit,major:h.major,schema:qa.schema,sourcePins,params,previews:[first,again],prepared:prepared.value.data,approved:approval.value.data,approvedBatch:approved,self,pdf,pdfEvidence,selfPdf,selfPdfEvidence,trace,checks,actorsPlan,actorsProof,installationPlan,installationProof,events,browserProven:true,actualNetworkHttp:true,realHandlerInvoked:true,paymentExecuted:false,municipalAcceptance:false,synthetic:true,productionWrites:0};
  let reopenedDone=false,disposed=false;
  result.afterReopen=async reopened=>{
   assert.equal(disposed,false);assert.equal(reopenedDone,false,'RECEIPT126_AFTER_REOPEN_ALREADY_CONSUMED');reopenedDone=true;sourceBookend(readRaw);assert.equal(reopened.body.command,'reopen');assert.equal(reopened.groupId,closed.groupId);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);assert.deepEqual(reopened.snapshot,closed.snapshot);const before=conservation(h),rowsBefore=ledger(h);assert.equal(rowsBefore.length,2);
   const stale=d.ownReceiptBatch((await get(reviewer,'batch',{id:batchId})).value.data);assert.equal(stale.state,'approved');assert.equal(stale.sourceCurrent,false);assert.deepEqual(stale.snapshot,approved.snapshot);assert.equal(stale.permissions.canDownload,false);assert.equal(stale.permissions.canWithdraw,true);await assert.rejects(()=>d.createOwnReceiptPdf(stale));const staleSelf=d.ownReceiptSelf((await get(agent,'self')).value.data);assert.equal(staleSelf.items.length,0);await assert.rejects(()=>d.createOwnReceiptPdf(staleSelf,{self:true,index:0}),{message:'Elegí un recibo propio vigente.'});assert.equal(hash(pdf.bytes),pdfArchivedHash);assert.equal(hash(selfPdf.bytes),selfPdfArchivedHash);assert.deepEqual(ledger(h),rowsBefore);assert.deepEqual(conservation(h),before);check(true,'existing reopen alone makes still-approved batch stale/PDF forbidden/self empty BEFORE withdrawal');
   await browser.unavailable('reopened',batchId);
    const emptyPreview=await preview(reviewer);assert.equal(emptyPreview.snapshot.recordCount,0);assert.notEqual(emptyPreview.snapshot.sourceVersion,snapshot.sourceVersion);const fresh=await get(reviewer,'list',{period:params.period});assert.equal(fresh.status,200);const withdrawalBody={...decisionBase,command:'withdraw',scopeVersion:fresh.value.data.scopeVersion,sourceVersion:snapshot.sourceVersion,reason:'Retiro independiente después de la reapertura existente de la fuente'};assert.equal(withdrawalBody.sourceVersion,approved.snapshot.sourceVersion);const withdrawn=await command(reviewer,withdrawalBody,d.randomUUID());assert.equal(withdrawn.status,201);events.push(withdrawn.value.data);const finalBatch=d.ownReceiptBatch((await get(reviewer,'batch',{id:batchId})).value.data);assert.equal(finalBatch.state,'withdrawn');assert.equal(finalBatch.permissions.canDownload,false);const withdrawnSelf=d.ownReceiptSelf((await get(agent,'self')).value.data);assert.equal(withdrawnSelf.items.length,0);await assert.rejects(()=>d.createOwnReceiptPdf(withdrawnSelf,{self:true,index:0}),{message:'Elegí un recibo propio vigente.'});assert.equal(hash(pdf.bytes),pdfArchivedHash);assert.equal(hash(selfPdf.bytes),selfPdfArchivedHash);const rows=ledger(h);assert.equal(rows.length,3);assert.equal(new Set(rows.map(row=>row.batch_id)).size,1);for(const [commandName,index]of [['prepare',0],['approve',1],['withdraw',2]]){const row=rows.find(row=>row.command===commandName),event=events[index],actor=commandName==='prepare'?preparer:reviewer;assert.ok(row);assert.equal(row.id,event.id);assert.equal(row.batch_id,batchId);assert.equal(row.request_key,event.key);assert.deepEqual(row.body,event.body);assert.equal(row.body_sha256,event.bodySha256);assert.equal(row.actor_membership_id,actor.raw.membershipId);assert.equal(row.actor_person_id,actor.native.actorPersonId);assert.equal(row.actor_email,actor.raw.actorEmail);assert.equal(row.actor_session_id,actor.raw.actorSessionId);assert.equal(row.actor_session_version,actor.raw.actorSessionVersion);assert.equal(row.release_sha,actor.raw.releaseSha);if(commandName==='prepare')assert.deepEqual(row.snapshot,snapshot);else assert.equal(row.snapshot,null);}for(const row of rowsBefore)assert.deepEqual(rows.find(r=>r.id===row.id),row);assert.deepEqual(conservation(h),before);sourceBookend(readRaw);check(true,'withdraw201 conserves original sourceVersion, uses freshly read reviewer scope and leaves exactly3 immutable receipt events/1batch');
   await browser.unavailable('withdrawn',batchId);const browserProof=browser.proof();await browser.close();
    return{...result,browserProof,afterReopen:undefined,dispose:undefined,withdrawn:withdrawn.value.data,staleBatch:stale,finalBatch,receiptRows:rows,receiptEventsTotal:3,receiptBatches:1,additionalCaptures:0,additionalSavedResults:0,additionalLiquidationDecisions:0,additionalAnnulments:0,additionalCloseEvents:0,additionalReopens:0,archivedPdfSha256:pdfArchivedHash,archivedSelfPdfSha256:selfPdfArchivedHash,staleSelf,withdrawnSelf,checkerRestore:restoreProof,actualBrowser:true};
  };
  result.dispose=async()=>{if(disposed)return{closed:true,alreadyDisposed:true};disposed=true;await browser.close();return{closed:true,resourcesCreated:5,browserHostDisposed:true,actorRowsDeleted:0,receiptRowsDeleted:0};};
 }catch(error){primary=error;}
 finally{
  if(actorsPlan!=null&&actorsProof!=null){
  try{const restorePlan=d.buildCheckerRestore(actorsPlan,actorsProof);restoreProof=await d.executeCheckerRestore({h,plan:restorePlan,actorsPlan,actorsProof});assert.equal(restoreProof.version,'own-receipt126-same190-checker-restore.v1');assert.equal(restoreProof.exactOverrideRemoved,true);assert.equal(restoreProof.allMembershipSodChecked,true);assert.equal(restoreProof.actorRowsDeleted,0);assert.equal(restoreProof.receiptRowsChanged,0);assert.deepEqual(restoreProof.before,restoreProof.after);assert.deepEqual(restoreProof.checkerCapabilities,actorsProof.checkerCapabilitiesBefore);sourceBookend(readRaw);if(result&&browser)browser.checkerRestored(restoreProof);}catch(error){restoreError=error;}
  }
  if((primary||restoreError)&&browser){try{await browser.close();}catch(error){primary=new AggregateError([primary,error].filter(Boolean),'RECEIPT126_BROWSER_TEARDOWN_FAILED',{cause:primary??error});}}
 }
 if(restoreError){const failure=new AggregateError([primary,restoreError].filter(Boolean),'RECEIPT126_CHECKER_RESTORE_UNCERTAIN',{cause:primary??restoreError});failure.cleanupUncertain=true;throw failure;}if(primary)throw primary;assert.ok(result);result.checkerRestore=restoreProof;return result;
}
