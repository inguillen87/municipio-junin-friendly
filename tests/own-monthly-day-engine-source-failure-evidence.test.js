// Pure diagnostic seam. No runner/module/application/transport is imported.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {inspect} from 'node:util';
const location=process.env.QA194_SOURCE_FILE??new URL('../scripts/verify-own-monthly-day-engine-source.mjs',import.meta.url);
const source=fs.readFileSync(location,'utf8');
const start="fs.writeFileSync(path.join(destination,'failure.txt'),",end=");fs.writeFileSync(path.join(destination,'partial-proof.json')";
assert.equal(source.split(start).length-1,1);const from=source.indexOf(start)+start.length,to=source.indexOf(end,from);assert.ok(to>from);
const expression=source.slice(from,to),format=Function('error','inspect','return ('+expression+');');
test('actual failure writer retains a native-shaped fetch TypeError and its original nested cause',()=>{
 const cause=Error('exclusively synthetic underlying transport cause'),error=new TypeError('fetch failed',{cause});
 // Match the exact observed top-level stack shape without guessing its native cause.
 error.stack='TypeError: fetch failed';const recorded=format(error,inspect);
 assert.match(recorded,/TypeError: fetch failed/);assert.match(recorded,/exclusively synthetic underlying transport cause/);assert.ok(recorded.includes('[cause]'));
 assert.equal(error.cause,cause);assert.equal(error.stack,'TypeError: fetch failed');
});
test('actual failure writer preserves primary and secondary aggregate causes in order',()=>{
 const primary=Error('exclusively synthetic primary failure'),secondary=Error('exclusively synthetic secondary failure'),error=new AggregateError([primary,secondary],'synthetic aggregate');
 const recorded=format(error,inspect);assert.ok(recorded.indexOf(primary.message)>=0);assert.ok(recorded.indexOf(secondary.message)>recorded.indexOf(primary.message));assert.deepEqual(error.errors,[primary,secondary]);
});
test('actual failure writer safely records a circular cause without erasing the original stack',()=>{
 const error=Error('exclusively synthetic circular cause');error.cause=error;const recorded=format(error,inspect);assert.match(recorded,/exclusively synthetic circular cause/);assert.match(recorded,/Circular/);assert.equal(error.cause,error);
});
test('actual failure writer does not execute a custom inspection callback',()=>{
 let inspected=0;const error=Error('exclusively synthetic custom-inspect guard');error[inspect.custom]=()=>{inspected++;throw Error('custom inspect must never execute');};
 const recorded=format(error,inspect);assert.match(recorded,/exclusively synthetic custom-inspect guard/);assert.equal(inspected,0);
});
