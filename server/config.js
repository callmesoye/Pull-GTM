export function configuration(env) {
  try {
    const url = new URL(env.SUPABASE_URL);
    const key = env.SUPABASE_PUBLISHABLE_KEY || '';
    if (url.protocol !== 'https:' || !key || key.startsWith('sb_secret_')) return null;
    if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role === 'service_role') return null;
    return {url:url.origin,key};
  } catch {return null;}
}

