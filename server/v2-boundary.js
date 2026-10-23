const v1DatabaseHost = 'cyakphnpljeesotbjerz.supabase.co';
const v1AppHost = 'pull-gtm.vercel.app';

export function v2Boundary(env = {}, { requireDeployment = false } = {}) {
  const deployed = requireDeployment || env.VERCEL === '1' || Boolean(env.VERCEL_ENV) || Boolean(env.VERCEL_PROJECT_ID);
  if (!deployed) return { ok: true, mode: 'local' };

  try {
    const database = new URL(env.SUPABASE_URL);
    const app = new URL(env.PULL_APP_URL);
    const productionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.toLowerCase();
    const valid = Boolean(env.VERCEL_PROJECT_ID) &&
      Boolean(env.PULL_V2_PROJECT_ID) &&
      env.VERCEL_PROJECT_ID === env.PULL_V2_PROJECT_ID &&
      Boolean(env.PULL_V2_SUPABASE_HOST) &&
      database.protocol === 'https:' &&
      database.hostname === env.PULL_V2_SUPABASE_HOST &&
      database.hostname !== v1DatabaseHost &&
      app.protocol === 'https:' &&
      app.hostname !== v1AppHost &&
      productionHost !== v1AppHost;
    return { ok: valid, mode: 'v2' };
  } catch {
    return { ok: false, mode: 'v2' };
  }
}
