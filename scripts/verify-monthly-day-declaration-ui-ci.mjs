// CI entry point for the synthetic source UI. No database or municipal session.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {verifyMonthlyDayDeclarationUiBrowser} from './verify-monthly-day-declaration-ui-browser.mjs';

export function monthlyDayDeclarationUiCiOptions(args,root=fileURLToPath(new URL('../',import.meta.url))){
 assert.ok(Array.isArray(args)&&args.length===1&&typeof args[0]==='string'&&args[0].startsWith('--output='),'Specify exactly one --output=verification/subdirectory.');
 const value=args[0].slice('--output='.length),sourceRoot=path.resolve(root),verification=path.join(sourceRoot,'verification'),output=path.resolve(sourceRoot,value);
 assert.ok(value&&!/[\u0000-\u001f\u007f]/.test(value)&&output.startsWith(verification+path.sep),'Synthetic evidence must stay in a verification subdirectory.');
 return {root:sourceRoot,output};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const options=monthlyDayDeclarationUiCiOptions(process.argv.slice(2));
 fs.mkdirSync(path.dirname(options.output),{recursive:true});
 const result=await verifyMonthlyDayDeclarationUiBrowser(options);
 assert.equal(result.errors.length,0);
 assert.equal(result.syntheticHttpOnly,true);
 assert.equal(result.sqlExecuted,false);
 assert.equal(result.productionVisited,false);
 console.log(JSON.stringify({checks:result.checks.length,postCount:result.postCount,syntheticHttpOnly:result.syntheticHttpOnly,sqlExecuted:result.sqlExecuted,productionVisited:result.productionVisited}));
}
