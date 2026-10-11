import assert from 'node:assert/strict';
import { verifyOwnFiscalFacts } from './verify-own-fiscal-facts.mjs';
import { verifyOwnPeriodReadDelay } from './lib/own-period-read-delay-qa.mjs';
const args={};
for(const arg of process.argv.slice(2)) {
 const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(arg);
 assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];
}
assert.equal(args.browser,'chromium');
try {
 const major=Number(args.major),sourceCommit=args['source-commit'];
 const r=await verifyOwnFiscalFacts({major,transport:args.transport,sourceCommit,output:args.output,browser:args.browser,continuation:h=>verifyOwnPeriodReadDelay(h,{major,sourceCommit})});
 console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true,productiveBusinessWrites:0}));
} catch(e) {console.error(e.stack);process.exitCode=1;}
