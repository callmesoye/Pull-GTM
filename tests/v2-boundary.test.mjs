import test from 'node:test';
import assert from 'node:assert/strict';
import { v2Boundary } from '../server/v2-boundary.js';
import { configuration } from '../server/config.js';

const dedicated = {
  VERCEL: '1',
  VERCEL_PROJECT_ID: 'prj_pull_v2',
  PULL_V2_PROJECT_ID: 'prj_pull_v2',
  VERCEL_PROJECT_PRODUCTION_URL: 'pull-v2.vercel.app',
  PULL_V2_SUPABASE_HOST: 'example-v2.supabase.co',
  SUPABASE_URL: 'https://example-v2.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  PULL_APP_URL: 'https://pull-v2.vercel.app'
};

test('V2 deploys only with its explicit project and distinct database and origin', () => {
  assert.equal(v2Boundary(dedicated, { requireDeployment: true }).ok, true);
  for (const override of [
    { VERCEL_PROJECT_ID: 'prj_other' },
    { VERCEL_PROJECT_ID: '' },
    { PULL_V2_PROJECT_ID: '' },
    { PULL_V2_SUPABASE_HOST: '' },
    { SUPABASE_URL: 'https://cyakphnpljeesotbjerz.supabase.co', PULL_V2_SUPABASE_HOST: 'cyakphnpljeesotbjerz.supabase.co' },
    { PULL_APP_URL: 'https://pull-gtm.vercel.app' },
    { VERCEL_PROJECT_PRODUCTION_URL: 'pull-gtm.vercel.app' },
    { PULL_APP_URL: 'http://pull-v2.vercel.app' }
  ]) {
    const env = { ...dedicated, ...override };
    assert.equal(v2Boundary(env, { requireDeployment: true }).ok, false, JSON.stringify(override));
    assert.equal(configuration(env), null, JSON.stringify(override));
  }
});

test('V2 server accepts a correctly configured isolated deployment', () => {
  assert.deepEqual(configuration(dedicated), {
    url: 'https://example-v2.supabase.co', key: 'sb_publishable_test'
  });
});

test('build guard requires deployment variables even outside Vercel', () => {
  assert.equal(v2Boundary({}, { requireDeployment: true }).ok, false);
  assert.equal(v2Boundary({}).mode, 'local');
});
