// PROPOSED by Claude (source only; never run by Claude). Target: scripts/verify-payroll-detail-october28-lot.mjs
// CLI for the offline lot review. Reads ONLY the confined private directory, the admission and (optionally) the
// core acceptance receipt; prints counts and hashes, never a legajo or an amount. No SQL, network or writes.
import {readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {getGrhSourceProfile} from './lib/grh-source-profile.mjs';
import {verifyOctober28DetailLot,OCT28_DETAIL_PROFILE_ID,OCT28_DETAIL_EXTRACTOR} from './lib/payroll-detail-october28-lot.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code});};
export function parseOctober28DetailLotArgs(args){
 let values;try{({values}=parseArgs({args,strict:true,allowPositionals:false,options:{directory:{type:'string'},admission:{type:'string'},'admission-sha256':{type:'string'},'core-acceptance':{type:'string'}}}));}catch{fail('OCT28_DETAIL_USAGE');}
 if(!values.directory||!values.admission||!/^[a-f0-9]{64}$/.test(values['admission-sha256']??''))fail('OCT28_DETAIL_USAGE');
 return values;
}
export function main(args=process.argv.slice(2)){
 const a=parseOctober28DetailLotArgs(args);
 const root=fileURLToPath(new URL('../',import.meta.url)),extractor=readFileSync(path.join(root,OCT28_DETAIL_EXTRACTOR.path));
 if(createHash('sha256').update(extractor).digest('hex')!==OCT28_DETAIL_EXTRACTOR.sha256)fail('OCT28_DETAIL_EXTRACTOR_CHANGED');
 const directory=realpathSync(a.directory);if(!statSync(directory).isDirectory())fail('OCT28_DETAIL_DIRECTORY');
 const directoryFiles=readdirSync(directory,{withFileTypes:true}).filter(d=>d.isFile()).map(d=>d.name);
 const read=name=>{const file=realpathSync(path.join(directory,name));if(path.dirname(file)!==directory)fail('OCT28_DETAIL_FILE_OUTSIDE_DIRECTORY');return new Uint8Array(readFileSync(file));};
 const admissionBytes=readFileSync(a.admission);if(createHash('sha256').update(admissionBytes).digest('hex')!==a['admission-sha256'])fail('OCT28_DETAIL_ADMISSION_CHANGED');
 const coreAcceptance=a['core-acceptance']?JSON.parse(readFileSync(a['core-acceptance'],'utf8')):undefined;
 const review=verifyOctober28DetailLot({directoryFiles,read,profile:getGrhSourceProfile(OCT28_DETAIL_PROFILE_ID,{allowCandidateRead:true}),admission:JSON.parse(admissionBytes.toString('utf8')),coreAcceptance});
 return review;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(main(),null,2));}catch(e){console.error(/^OCT28_DETAIL_[A-Z_]+(?::.*)?$/.test(e?.message??'')?e.message:'OCT28_DETAIL_REVIEW_FAILED');process.exitCode=1;}
}
