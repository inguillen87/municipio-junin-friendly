import test from 'node:test';
import assert from 'node:assert/strict';
import {workdayXlsx} from '../assets/workday-export.js';
test('XLSX contains explicit references, numeric times and counts',()=>{
 const row={day:'2026-09-09',personLabel:'Agente sintético',legajo:'000123',ordinarySeconds:21600,extraSeconds:0,pauseSeconds:0,closedIntervalCount:1,status:'closed',issues:[],intervals:[]};
 const bytes=workdayXlsx({site:{label:'Prueba'},filters:{from:'2026-09-09',to:'2026-09-09',status:'all'},snapshotId:'QA',rules:{version:'QA'}},[row]);
 const content=Buffer.from(bytes).toString('utf8');
 assert.ok(content.includes('<c r="D2" s="2"><v>0.25</v></c>'));
 assert.ok(content.includes('<c r="G2" s="0"><v>1</v></c>'));
 assert.ok(content.includes('<c r="C2" t="inlineStr" s="0"><is><t xml:space="preserve">000123</t></is></c>'));
 assert.equal((content.match(/<c /g)||[]).length,(content.match(/<c r="/g)||[]).length);
});
