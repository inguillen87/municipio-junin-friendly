import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceAreaHttpQuery} from '../api/internal-attendance-area.js';
import {areaQuery} from './fixtures/attendance-area-synthetic.js';

const query = () => {
  const value = areaQuery();
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)
    .map(([key, value]) => [key, key === 'area' ? JSON.stringify(value) : value]));
};

test('area facade rejects an oversized raw query before parsing or authorizing', () => {
  assert.throws(() => attendanceAreaHttpQuery({query: query(), url: '/' + 'x'.repeat(8192)}),
    error => error.status === 413 && error.code === 'ATTENDANCE_AREA_LIMIT');
});

test('area facade bounds every variable-length query field before SQL access', () => {
  for (const [field, value] of [['area', 'x'.repeat(257)], ['day', '2'.repeat(11)],
    ['site', 'a'.repeat(97)], ['snapshot', 'a'.repeat(37)]]) {
    const q = query(); q[field] = value;
    assert.throws(() => attendanceAreaHttpQuery({query: q, url: '/' + new URLSearchParams(q)}),
      error => error.status === 400 && error.code === 'ATTENDANCE_AREA_QUERY_INVALID', field);
  }
});
