import test from 'node:test';import assert from 'node:assert/strict';
import {takeFirmarReturnState} from '../assets/firmar-return.js';

test('return query detection uses the original URL even when history changes location live',()=>{const location={hash:'#'+'A'.repeat(43),search:'?state=secret',pathname:'/firmas/retorno'};let stripped=false;assert.throws(()=>takeFirmarReturnState(location,{replaceState(){stripped=true;location.hash='';location.search='';}}));assert.equal(stripped,true);});
