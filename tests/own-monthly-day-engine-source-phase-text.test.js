import test from 'node:test';
import assert from 'node:assert/strict';
import {mapInstallationPhaseText} from '../scripts/lib/installation-phase-text-map.mjs';

const phases = ['rehearsal', 'installation', 'repetition', 'verification', 'rollback'];
const original = (batch, transform) => Object.fromEntries(
 phases.filter(key => key !== 'rollback' || batch.rollback).map(key => [key, batch[key].map(transform)])
);
const fixture = () => ({
 rehearsal: ['mode', 'install', 'proof'], installation: ['mode', 'install', 'proof'],
 repetition: ['mode', 'verify', 'proof'], verification: ['verify', 'proof'],
 rollback: ['mode', 'restore', 'proof']
});

test('phase text retains every byte, position and phase while transforming each distinct string once', () => {
 const batch = fixture(), before = structuredClone(batch), calls = [];
 const actual = mapInstallationPhaseText(batch, value => {calls.push(value); return '[' + value + ']';});
 assert.deepEqual(actual, original(batch, value => '[' + value + ']'));
 assert.deepEqual(Object.keys(actual), phases);
 assert.deepEqual(calls, ['mode', 'install', 'proof', 'verify', 'restore']);
 assert.deepEqual(batch, before);
 for (const phase of phases) {
  assert.notEqual(actual[phase], batch[phase]);
  for (const other of phases.filter(value => value !== phase)) assert.notEqual(actual[phase], actual[other]);
 }
});

test('empty transformed text is cached, and strings different by one byte stay distinct', () => {
 const literal = "quote'$'$$", same = ['quote', "'$'$$"].join(''), calls = [];
 const batch = {rehearsal: [literal, same, ''], installation: [literal + ' ', ''], repetition: [], verification: [literal]};
 const actual = mapInstallationPhaseText(batch, value => {calls.push(value); return value === '' ? '' : value;});
 assert.deepEqual(actual, original(batch, value => value));
 assert.deepEqual(calls, [literal, '', literal + ' ']);
 assert.equal(Object.hasOwn(actual, 'rollback'), false);
});

test('each invocation uses its current transform and an independent cache', () => {
 const batch = fixture();
 let first = 0, second = 0;
 const a = mapInstallationPhaseText(batch, value => {first++; return 'context A:' + value;});
 const b = mapInstallationPhaseText(batch, value => {second++; return 'context B:' + value;});
 assert.equal(first, 5); assert.equal(second, 5);
 assert.deepEqual(a, original(batch, value => 'context A:' + value));
 assert.deepEqual(b, original(batch, value => 'context B:' + value));
});

test('returned phase arrays remain independent and cannot mutate the input or a later invocation', () => {
 const batch = fixture(), a = mapInstallationPhaseText(batch, value => value);
 a.rehearsal.push('changed'); a.installation[0] = 'changed';
 assert.deepEqual(batch, fixture());
 assert.equal(a.repetition.includes('changed'), false);
 assert.equal(a.verification.includes('changed'), false);
 assert.deepEqual(mapInstallationPhaseText(batch, value => value), fixture());
});

test('empty optional rollback is preserved as a separate new array', () => {
 const batch = {...fixture(), rollback: []}, actual = mapInstallationPhaseText(batch, value => value);
 assert.deepEqual(actual, batch);
 assert.notEqual(actual.rollback, batch.rollback);
});

test('non-string inputs and mutable transformed values are never reused', () => {
 const input = {}, batch = {rehearsal: [input, input, 'text', 'text'], installation: [], repetition: [], verification: []};
 let calls = 0;
 const actual = mapInstallationPhaseText(batch, value => ({value, call: ++calls}));
 assert.equal(calls, 4);
 assert.notEqual(actual.rehearsal[0], actual.rehearsal[1]);
 assert.notEqual(actual.rehearsal[2], actual.rehearsal[3]);
 assert.equal(actual.rehearsal[0].value, input);
});

test('a transform failure propagates the same error and stops before later statements', () => {
 const error = new Error('synthetic transform rejected'), seen = [];
 const batch = {rehearsal: ['reject', 'later'], installation: ['reject'], repetition: [], verification: []};
 assert.throws(() => mapInstallationPhaseText(batch, value => {seen.push(value); throw error;}), value => value === error);
 assert.deepEqual(seen, ['reject']);
 assert.deepEqual(mapInstallationPhaseText(batch, value => value), original(batch, value => value));
});
