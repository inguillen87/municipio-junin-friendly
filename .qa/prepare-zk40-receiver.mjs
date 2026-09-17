// Build a scoped additive receiver on the pinned production tree. No DB or clock access.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const base='505c06762ad69c371ce39603beedab3c3dcd476b',repo='inguillen87/municipio-junin-friendly';
const meta=path.resolve('../meta'),git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),base);
const hash=s=>createHash('sha256').update(s).digest('hex');
const replace=(s,a,b)=>{assert.equal(s.split(a).length-1,1,a);return s.replace(a,()=>b);};
const rename=s=>s.replaceAll('PM10','ZK40').replaceAll('Pm10','Zk40').replaceAll('pm10','zk40');
const files=['api/attendance-zk40.js','lib/internal-zk40-reception.js','tests/zk40-reception.test.js','tests/zk40-receiver-api.test.js','scripts/migrations/070-zk40-multiclock-reception.sql','.vercelignore','docs/CLOCK_FLEET_RECEIVER_20260917.md'];
function put(file,value){assert.ok(!fs.existsSync(file),file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
if(process.argv[2]==='apply'){
 let s=rename(fs.readFileSync('lib/internal-pm10-reception.js','utf8'));
 s=replace(s,"value.serial!=='CQTU225360168'","(typeof value.serial!=='string'||!/^[A-Za-z0-9-]{6,64}$/.test(value.serial))");
 s=replace(s,"const keys=['version','receiptId'","const keys=['version','serial','receiptId'");
 s=replace(s,"for(const k of ['batchId','partStart','partSha256','snapshotSha256'])","for(const k of ['serial','batchId','partStart','partSha256','snapshotSha256'])");
 put(files[1],'// Device identity and enrollment are checked again in PostgreSQL. PM10 unchanged.\n'+s);
 s=rename(fs.readFileSync('api/attendance-pm10.js','utf8')).replaceAll("'x-zk40-connector'","'x-clock-connector'");
 s=replace(s,"function header(req,k){const v=req?.headers?.[k];return typeof v==='string'?v:'';}","function header(req,k){const matches=Object.entries(req.headers||{}).filter(([name])=>name.toLowerCase()===k);if(matches.length>1||matches.some(([,v])=>typeof v!=='string')||Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((v,i)=>i%2===0&&String(v).toLowerCase()===k).length>1)zk40Fail('ZK40_PAYLOAD_INVALID');return matches[0]?.[1]||'';}");
 put(files[0],'export const config={api:{bodyParser:false}};\n'+s);
 s=rename(fs.readFileSync('tests/pm10-reception.test.js','utf8')).replaceAll("'x-zk40-connector'","'x-clock-connector'");
 s=replace(s,"import {assertZk40Status,getZk40Status} from '../lib/internal-zk40-status.js';\n",'');
 assert.equal(s.split('function status(){').length,2);s=s.slice(0,s.indexOf('function status(){'));
 s=replace(s,"version:'zk40-receipt.v1',","version:'zk40-receipt.v1',serial:p.serial,");
 s+="\ntest('receipt from another serial is refused',()=>{const p=payload();assert.throws(()=>assertZk40Receipt({...receipt(p),serial:'OTHER-DEVICE'},p));});\ntest('new enrollment migration is opt-in and leaves the original receiver intact',()=>{const s=fs.readFileSync('scripts/migrations/070-zk40-multiclock-reception.sql','utf8');assert.match(s,/ZK40_PREREQUISITE_DRIFT/);assert.match(s,/attendance_zk40_enrollment ENABLE ROW LEVEL SECURITY/);assert.doesNotMatch(s,/UPDATE.*attendance_connector|SET status='active'/);assert.match(s,/e.connector_id=c.id/);assert.match(s,/e.serial_number=d.serial_number/);});\n";
 put(files[2],s);
 s=rename(fs.readFileSync('tests/pm10-receiver-api.test.js','utf8')).replaceAll("'x-zk40-connector'","'x-clock-connector'");
 s=s.split('\n').filter(line=>!line.startsWith("test('status ")).join('\n');put(files[3],s+'\n');
 put(files[4],fs.readFileSync(path.join(meta,files[4])));
 const ignore=fs.readFileSync('.vercelignore','utf8');assert.ok(!ignore.includes('070-zk40-multiclock-reception.sql'));fs.writeFileSync('.vercelignore',ignore+'\n!scripts/migrations/070-zk40-multiclock-reception.sql\n');
 put(files[6],fs.readFileSync(path.join(meta,files[6])));
 console.log('Only the additional receiver, its tests, migration and runbook were applied. Original endpoints unchanged.');
}else if(process.argv[2]==='candidate'){
 async function api(resource,body){const response=await fetch(`https://api.github.com/repos/${repo}/${resource}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await response.json();assert.ok(response.ok,`${response.status}: ${result.message||resource}`);return result;}
 assert.equal((await api('git/ref/heads/master')).object.sha,base,'Production advanced; reconcile');
 const tree=await api('git/trees',{base_tree:git('rev-parse','HEAD^{tree}'),tree:files.map(file=>({path:file,mode:'100644',type:'blob',content:fs.readFileSync(file,'utf8')}))});
 const commit=await api('git/commits',{tree:tree.sha,parents:[base],message:'feat(asistencia): receptor adicional vinculado a cada reloj autorizado\n\nRecepción ZK40 opt-in con token por conector, serie, sitio y municipio verificados. Conserva checksums, idempotencia, fuente, aislamiento y revisión de identidades del receptor PM10 sin cambiarlo. Instalación local de nuevos colectores pendiente; no se configura ni activa un dispositivo desde este commit.'});
 console.log('VALIDATED_CANDIDATE='+commit.sha);console.log('MIGRATION_SHA256='+hash(fs.readFileSync(files[4])));console.log('No production refs or databases changed by this workflow.');
}else throw Error('Invalid preparation step');
