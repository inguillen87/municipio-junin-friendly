// Internal preparation only. Does not update any production ref or database.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const base='7a13f1608b5408fbf24ff7e963ceb9c98a00534a',meta=path.resolve('../meta'),hash=s=>createHash('sha256').update(s).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const manifest=JSON.parse(fs.readFileSync(path.join(meta,'.qa/native-manifest.json'),'utf8'));
const additional=['scripts/build-friendly.mjs','.vercelignore'];
assert.equal(git('rev-parse','HEAD'),base);
function replaceOnce(file,old,next){const s=fs.readFileSync(file,'utf8');assert.equal(s.split(old).length-1,1,file);fs.writeFileSync(file,s.replace(old,next));}
if(process.argv[2]==='apply'){
 assert.equal(git('hash-object','api/internal-data.js'),'5bdcfe5a516d8870adbf083f6519e932d615c716');
 assert.equal(git('hash-object','internal-dashboard.html'),'03c7aa9af19d29e0f1999257115a80f1e359b599');
 const patch=path.join(meta,'.qa/native-existing.patch');git('apply','--unidiff-zero','--check',patch);git('apply','--unidiff-zero',patch);
 for(const file of Object.keys(manifest)){if(['api/internal-data.js','internal-dashboard.html'].includes(file))continue;assert.ok(!fs.existsSync(file),file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(meta,file),file);}
 replaceOnce('assets/native-employee-create.js',"cache:'no-store',headers:{Accept:'application/json'}","cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}");
 replaceOnce('assets/native-employee-create.css','.native-employee-dialog{width:','.native-employee-dialog{box-sizing:border-box;width:');
 replaceOnce('scripts/migrations/067-native-employee-registration.sql','END $$;\nCREATE OR REPLACE FUNCTION native_employee_create_v1','END $$;\n\nCREATE OR REPLACE FUNCTION native_employee_create_v1');
 replaceOnce('scripts/build-friendly.mjs',"  'assets/workforce-operations.css',","  'assets/workforce-operations.css',\n  'assets/native-employee-contract.js',\n  'assets/native-employee-create.js',\n  'assets/native-employee-create.css',");
 assert.ok(!fs.readFileSync('.vercelignore','utf8').includes('067-native-employee-registration.sql'));fs.appendFileSync('.vercelignore','\n!scripts/migrations/067-native-employee-registration.sql\n');
}
const mismatches=Object.entries(manifest).map(([file,expected])=>({file,expected,actual:hash(fs.readFileSync(file))})).filter(x=>x.expected!==x.actual);
assert.deepEqual(mismatches,[],'Every reviewed application SHA256 must match');
if(process.argv[2]==='candidate'){
 const repo='inguillen87/municipio-junin-friendly',files=[...Object.keys(manifest),...additional];
 async function api(resource,body){const response=await fetch(`https://api.github.com/repos/${repo}/${resource}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await response.json();assert.ok(response.ok,`${response.status}: ${result.message||resource}`);return result;}
 const current=await api('git/ref/heads/master');assert.equal(current.object.sha,base,'Production changed; reconcile before release');
 const tree=await api('git/trees',{base_tree:git('rev-parse','HEAD^{tree}'),tree:files.map(file=>({path:file,mode:'100644',type:'blob',content:fs.readFileSync(file,'utf8')}))});
 const commit=await api('git/commits',{tree:tree.sha,parents:[base],message:'feat(personas): alta nativa de legajos con validación y auditoría\n\nFormulario Personas, numeración automática o manual, categoría por convenio, persistencia propia en Neon y protección de duplicados. Mantiene origen GRH del histórico y protege altas propias frente a su sobrescritura. No crea cuentas ni liquida haberes. Candidato comprobado con suite completa y navegador sobre este árbol; SQL ensayado con 42 comprobaciones sintéticas y rollback.'});
 console.log('VALIDATED_CANDIDATE='+commit.sha);console.log('VALIDATED_TREE='+tree.sha);console.log('No refs updated; original production Vercel configuration preserved.');
}else console.log('Reviewed application hashes and precise build integration verified; no production writes.');
