// New pure regression of the REAL validator. No handler, SQL or browser call.
import test from 'node:test';import assert from 'node:assert/strict';
import {validateNativeEmployeeUiPositiveCommand} from '../scripts/lib/native-employee-payroll-circuit-qa.mjs';

test('a V2 monthly command retains exact version/date while both common-body projections agree',()=>{
 const target={contractId:'10000000-0000-4000-8000-000000000001',legajo:'99001'},key='10000000-0000-4000-8000-000000000002';
 const body={period:'2026-10',liquidationType:'monthly',selection:{kind:'contracts',values:[target.contractId]},scopeVersion:'a'.repeat(64),programVersion:'b'.repeat(64),populationDomain:'native_registered',version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31'};
 const packet=body=>{const receipt={body:structuredClone(body),key,replayed:false};return{receipt,recovered:{...structuredClone(receipt),replayed:true},key,body:structuredClone(body),bodyText:JSON.stringify({operation:'calculate',payload:body}),browserPosts:1,recoveryGets:1,ackLostAfterCommit:true,committedStatus:201,postStatus:503,sameServer:true,authenticationFixture:true};};
 const verified=validateNativeEmployeeUiPositiveCommand(packet(body),{kind:'run',body,target});assert.equal(verified.commandVersion,body.version);assert.equal(verified.liquidationDate,body.liquidationDate);
 // This positive case fails in frozen R1: only the received body was stripped.
 assert.throws(()=>validateNativeEmployeeUiPositiveCommand(packet({...body,liquidationDate:'2026-10-30'}),{kind:'run',body,target}),/QA_NATIVE_UI_COMMAND_DATE_CHANGED/);
 assert.throws(()=>validateNativeEmployeeUiPositiveCommand(packet({...body,version:'own-payroll-run-command.v1'}),{kind:'run',body,target}));
 assert.throws(()=>validateNativeEmployeeUiPositiveCommand(packet({...body,programVersion:'c'.repeat(64)}),{kind:'run',body,target}),/QA_NATIVE_UI_COMMAND_BODY_CHANGED/);
 const {version,liquidationDate,...oldExpected}=body;assert.equal(validateNativeEmployeeUiPositiveCommand(packet(body),{kind:'run',body:oldExpected,target}).liquidationDate,liquidationDate);
});
