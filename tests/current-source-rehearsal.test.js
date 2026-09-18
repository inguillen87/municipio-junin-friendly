import test from 'node:test';import assert from 'node:assert/strict';
import {rehearseCurrentGrhSource} from '../scripts/rehearse-current-grh-source.mjs';
for(const target of [
 {database:'neondb',host:'127.0.0.1',port:55441,branch:null},
 {database:'current_rehearsal',host:'192.168.0.1',port:55441,branch:null},
 {database:'current_rehearsal',host:'127.0.0.1',port:5432,branch:null},
 {database:'current_rehearsal',host:'127.0.0.1',port:55441,branch:'br-live'}
])test('current rehearsal rejects an unapproved target before BEGIN '+JSON.stringify(target),async()=>{
 const calls=[];await assert.rejects(rehearseCurrentGrhSource({client:{query:async sql=>{calls.push(sql);return {rows:[target]};}}}),/CURRENT_REHEARSAL_LOCAL_ONLY/);
 assert.equal(calls.length,1);assert.match(calls[0],/host\(inet_server_addr\(\)\)/);assert.ok(!calls[0].includes('BEGIN'));
});
