// CI entry point for the synthetic source-browser traversal. No DB or user session.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {verifyCollectiveWorkingTimeBrowser} from './verify-collective-working-time-browser.mjs';

export function collectiveWorkingTimeCiOptions(args,root=fileURLToPath(new URL('../',import.meta.url))){
 assert.ok(Array.isArray(args)&&args.length===1&&typeof args[0]==='string'&&args[0].startsWith('--output='),'Specify exactly one --output=verification/subdirectory.');
 const value=args[0].slice('--output='.length),sourceRoot=path.resolve(root),verification=path.join(sourceRoot,'verification'),output=path.resolve(sourceRoot,value);
 assert.ok(value&&!/[\u0000-\u001f\u007f]/.test(value)&&output.startsWith(verification+path.sep),'Synthetic evidence must stay in a verification subdirectory.');
 return {root:sourceRoot,output};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const options=collectiveWorkingTimeCiOptions(process.argv.slice(2));
 fs.mkdirSync(path.dirname(options.output),{recursive:true});
 const result=await verifyCollectiveWorkingTimeBrowser(options);
 assert.equal(result.errors.length,0);
 console.log(JSON.stringify({checks:result.checks.length,requests:result.requests,secureContext:result.secureContext,usesSyntheticLoopbackOnly:result.usesSyntheticLoopbackOnly,sqlExecuted:result.sqlExecuted,productionVisited:result.productionVisited}));
}
