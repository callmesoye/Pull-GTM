import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTests} from '../scripts/quality.mjs';

test('Quality evidence requires one complete runner summary and preserves failure, skip and cancellation counts',()=>{
  const tap='# tests 8\n# pass 4\n# fail 1\n# cancelled 1\n# skipped 1\n# todo 1\n';
  assert.deepEqual(summarizeTests(tap),{tests:8,pass:4,fail:1,cancelled:1,skipped:1,todo:1});
  assert.equal(summarizeTests(tap.replace('# cancelled 1\n','')),null);
  assert.equal(summarizeTests(tap+'# tests 8\n'),null);
  assert.equal(summarizeTests('Process stopped before summary'),null);
});
