import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const BASE='scripts/lib/own-m7-native-test-connected-pg.mjs';
const PIN='500e7ca7a27e29054d16c03b8e1b9a597c05eb068f15ca42258266170b9ba249';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function composeOwnM5M7ConnectedTransportSource({readRaw}){
 assert.equal(typeof readRaw,'function');const observed=readRaw(BASE);assert.ok(Buffer.isBuffer(observed));const raw=Buffer.from(observed);assert.equal(sha(raw),PIN);const original=raw.toString('utf8');assert.ok(Buffer.from(original).equals(raw));
 const oldImport="import {OWN_M7_NATIVE_TEST_RPC_STATEMENTS,OWN_M7_NATIVE_TEST_POLICY_SQL} from './own-m7-native-test-business-pg.mjs';";
 const newImport="import {OWN_M7_NATIVE_TEST_RPC_STATEMENTS as BASE_RPC,OWN_M7_NATIVE_TEST_POLICY_SQL} from './own-m7-native-test-business-pg.mjs';\nimport {OWN_M5_M7_NOVELTY_RPC} from './own-m5-m7-novelty-positive-profile.mjs';\nconst OWN_M7_NATIVE_TEST_RPC_STATEMENTS=Object.freeze({...Object.fromEntries(Object.entries(BASE_RPC).filter(([,row])=>!/^own_run_(?:capture_fixed|complete_fixed)/.test(row.name))),...OWN_M5_M7_NOVELTY_RPC});";
 const ops=[
  {before:oldImport,after:newImport,count:1},
  {before:'OWN_M7_NATIVE_TEST_CONNECTED_PG_VERSION',after:'OWN_M5_M7_NATIVE_TEST_CONNECTED_PG_VERSION',count:4},
  {before:"'own-m7-native-test-connected-pg.v1'",after:"'own-m5-m7-native-test-connected-pg.v1'",count:1},
  {before:'ownM7NativeTestConnectedFailureObservation',after:'ownM5M7NativeTestConnectedFailureObservation',count:2},
  {before:'assertOwnM7NativeTestConnectedBusiness',after:'assertOwnM5M7NativeTestConnectedBusiness',count:1},
  {before:'createOwnM7NativeTestConnectedSessions',after:'createOwnM5M7NativeTestConnectedSessions',count:1}
 ];
 let source=original;for(const op of ops){assert.equal(source.split(op.before).length,op.count+1,'M5_M7_TRANSPORT_FINITE_ANCHOR');source=source.replaceAll(op.before,()=>op.after);}
 let inverse=source;for(const op of [...ops].reverse()){assert.equal(inverse.split(op.after).length,op.count+1);inverse=inverse.replaceAll(op.after,()=>op.before);}assert.equal(inverse,original);
 const sourceBookend=()=>{const after=readRaw(BASE);assert.ok(Buffer.isBuffer(after)&&raw.equals(after));return true;};
 return Object.freeze({version:'own-m5-m7-connected-transport-source.v1',source,sourceSha256:sha(source),baseSha256:PIN,wholeInverseVerified:true,operators:Object.freeze(ops.map(Object.freeze)),sourceBookend,executes:false,connects:false,executionAdmitted:false});
}
