import test from 'node:test';
import assert from 'node:assert/strict';
import {readOwnReceiptJson} from '../assets/own-payroll-receipt-self.js';

test('receipt overflow wipes the rejected chunk, cancels and releases without reading a suffix',async()=>{
 const accepted=new TextEncoder().encode('{}');
 const overflow=Uint8Array.from([0xa5,0x7e,0x63]);
 const suffix=Uint8Array.from([0x44,0x55]);
 const chunks=[accepted,overflow,suffix];let pulls=0,cancelled=0;
 const body=new ReadableStream({
  pull(controller){controller.enqueue(chunks[pulls++]);},
  cancel(){cancelled++;}
 },{highWaterMark:0});
 await assert.rejects(readOwnReceiptJson(new Response(body),accepted.byteLength),/El conjunto completo supera la capacidad/);
 assert.equal(pulls,2,'The body must not read or parse the suffix after overflow');
 assert.equal(cancelled,1,'Overflow must cancel the open body');
 assert.equal(body.locked,false,'The reader lock must be released');
 assert.deepEqual([...accepted],[0,0]);
 assert.deepEqual([...suffix],[0x44,0x55],'An unread chunk is not owned by the helper');
 assert.deepEqual([...overflow],[0,0,0],'The chunk that exceeded the limit also contains sensitive bytes');
});
