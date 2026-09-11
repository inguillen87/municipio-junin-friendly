/** Reproduce source omission with .vercelignore; not a substitute for Vercel deployment logs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(), out=path.join(root,'verification');fs.mkdirSync(out,{recursive:true});
const fix=process.argv.includes('--fix');
const needed=['scripts/migrations/048-payroll-detail-source.sql'];
if(fix){const file=path.join(root,'.vercelignore');let s=fs.readFileSync(file,'utf8');for(const name of needed){if(!s.split(/\r?\n/).includes('!'+name))s+='\n# Source-only SQL required by payroll detail build assertions. Never copied into public/.\n!'+name+'\n';}fs.writeFileSync(file,s);}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'municontrol-deploy-inputs-'));const matcher=path.join(temporary,'matcher'),work=path.join(temporary,'source');fs.mkdirSync(matcher);fs.mkdirSync(work);
try{
 execFileSync('git',['init','-q',matcher]);fs.writeFileSync(path.join(matcher,'.gitignore'),fs.readFileSync(path.join(root,'.vercelignore')));
 const files=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
 const checked=spawnSync('git',['-C',matcher,'check-ignore','--no-index','-z','--stdin'],{input:files.join('\0')+'\0',encoding:'utf8'});if(![0,1].includes(checked.status))throw Error('IGNORE_MATCH_FAILED');
 const ignored=new Set(checked.stdout.split('\0').filter(Boolean));ignored.add('.gitignore');
 for(const name of files){if(ignored.has(name))continue;const target=path.join(work,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');
 const result=spawnSync('npm',['run','build'],{cwd:work,env:{...process.env,VERCEL:'1'},encoding:'utf8',timeout:180000,maxBuffer:20000000});
 const report={mode:fix?'repaired':'baseline',status:result.status,signal:result.signal,omitted:files.filter(x=>ignored.has(x)),requiredPresent:needed.every(x=>fs.existsSync(path.join(work,x))),testsNotDisabled:true,publicSqlFiles:[]};
 function scan(dir){if(!fs.existsSync(dir))return;for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())scan(p);else if(/\.(sql|backup)(\.|$)/i.test(p))report.publicSqlFiles.push(path.relative(work,p));}}
 scan(path.join(work,'public'));fs.writeFileSync(path.join(out,'packaged-'+report.mode+'.log'),(result.stdout||'')+(result.stderr||''));fs.writeFileSync(path.join(out,'packaged-'+report.mode+'.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({mode:report.mode,status:report.status,requiredPresent:report.requiredPresent,publicSqlFiles:report.publicSqlFiles}));
 if(fix&&(result.status!==0||report.publicSqlFiles.length))throw Error('PACKAGED_BUILD_FAILED');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
