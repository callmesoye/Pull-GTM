import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {configuration} from './config.js';

const VERIFIER_SECONDS = 600;
const BODY_BYTES = 2048;
const TOKEN_BYTES = 3800;

export function googleConfiguration(env) {
  const supabase = configuration(env);
  try {
    const app = new URL(env.PULL_APP_URL);
    const local = app.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(app.hostname) && env.NODE_ENV !== 'production';
    if (!supabase || env.GOOGLE_AUTH_ENABLED !== 'true' || typeof env.PULL_OAUTH_COOKIE_SECRET !== 'string' || env.PULL_OAUTH_COOKIE_SECRET.length < 32 || (!local && app.protocol !== 'https:') || app.username || app.password || app.pathname !== '/' || app.search || app.hash) return null;
    return {...supabase, appOrigin:app.origin, cookieSecret:env.PULL_OAUTH_COOKIE_SECRET};
  } catch { return null; }
}

function cookieValue(request, name) {
  const found = (request.headers.get('cookie') || '').split(';').map(p => p.trim()).filter(p => p.startsWith(name+'='));
  if (found.length !== 1) return null;
  try { return decodeURIComponent(found[0].slice(name.length+1)); } catch { return null; }
}

async function smallJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return {status:415};
  if (Number(request.headers.get('content-length')) > BODY_BYTES) return {status:413};
  if (!request.body) return {status:400};
  const reader = request.body.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > BODY_BYTES) { await reader.cancel(); return {status:413}; }
      chunks.push(next.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.action !== 'start' || Object.keys(body).some(k => k !== 'action')) return {status:400};
    return {body};
  } catch { return {status:400}; } finally { reader.releaseLock(); }
}

export function createGoogleAuth({env=process.env, transport=fetch, now=()=>Date.now()}={}) {
  const config = googleConfiguration(env);
  return async function auth(request) {
    const headers = new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    const json = (status, data) => { headers.set('Content-Type','application/json'); return new Response(JSON.stringify(data),{status,headers}); };
    if (!['GET','POST'].includes(request.method)) { headers.set('Allow','GET, POST'); return json(405,{error:'Method not allowed.'}); }
    if (!config) return json(503,{error:'Google sign-in is not configured on this deployment yet.'});
    const url = new URL(request.url), secure = config.appOrigin.startsWith('https:'), prefix = secure ? '__Host-pull-' : 'pull-';
    const cookie = (name,value,age) => headers.append('Set-Cookie',`${prefix}${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
    const redirect = result => { headers.set('Location',config.appOrigin+'/#auth='+result); return new Response(null,{status:303,headers}); };
    if (url.origin !== config.appOrigin) return json(403,{error:'Open Pull GTM directly to sign in.'});
    const sign = encoded => createHmac('sha256',config.cookieSecret).update(encoded).digest('base64url');
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== config.appOrigin || request.headers.get('sec-fetch-site') === 'cross-site') return json(403,{error:'Open Pull GTM directly to sign in.'});
      const parsed = await smallJSON(request);
      if (parsed.status) return json(parsed.status,{error:parsed.status===413?'Account request is too large.':'Send a valid Google sign-in request.'});
      const verifier = randomBytes(48).toString('base64url');
      const encoded = Buffer.from(JSON.stringify({verifier,created:now(),origin:config.appOrigin})).toString('base64url');
      cookie('oauth',encoded+'.'+sign(encoded),VERIFIER_SECONDS);
      const destination = new URL(config.url+'/auth/v1/authorize');
      destination.searchParams.set('provider','google');
      destination.searchParams.set('redirect_to',config.appOrigin+'/api/auth');
      destination.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));
      destination.searchParams.set('code_challenge_method','s256');
      // Supabase owns the upstream Google OAuth state. Only the PKCE challenge leaves this server.
      return json(200,{url:destination.href});
    }
    // Always consume the temporary browser cookie, including cancelled and failed callbacks.
    cookie('oauth','',0);
    if (url.searchParams.has('error') || url.searchParams.has('error_code') || url.searchParams.getAll('code').length !== 1) return redirect('error');
    const code = url.searchParams.get('code');
    if (!code || code.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(code)) return redirect('error');
    const saved = cookieValue(request,prefix+'oauth');
    let state;
    try {
      if (!saved || saved.length > 1024) throw new Error();
      const parts = saved.split('.'); if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw new Error();
      const actual = Buffer.from(parts[1]), expected = Buffer.from(sign(parts[0]));
      if (!timingSafeEqual(actual,expected)) throw new Error();
      state = JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
      const age = now()-state.created;
      if (state.origin !== config.appOrigin || !Number.isSafeInteger(state.created) || age < 0 || age >= VERIFIER_SECONDS*1000 || !/^[A-Za-z0-9_-]{64}$/.test(state.verifier)) throw new Error();
    } catch { return redirect('error'); }
    try {
      const providerRequest = async (path, options={}) => {
        const response = await transport(config.url+path,{...options,headers:{apikey:config.key,...options.headers},signal:AbortSignal.timeout(15000),redirect:'error'});
        if (!response.ok) throw new Error();
        return response.json();
      };
      // Supabase makes auth codes single-use; never retry this mutation after an uncertain result.
      const session = await providerRequest('/auth/v1/token?grant_type=pkce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auth_code:code,code_verifier:state.verifier})});
      if (!session || !['access_token','refresh_token'].every(k => typeof session[k] === 'string' && session[k] && encodeURIComponent(session[k]).length <= TOKEN_BYTES) || !Number.isSafeInteger(session.expires_in) || session.expires_in <= 0) throw new Error();
      const user = await providerRequest('/auth/v1/user',{headers:{Authorization:'Bearer '+session.access_token}});
      if (!user || typeof user.id !== 'string' || !user.id || user.is_anonymous || (session.user?.id && session.user.id !== user.id)) throw new Error();
      cookie('access',session.access_token,Math.max(60,Math.min(session.expires_in,60*60*24*30)));
      cookie('refresh',session.refresh_token,60*60*24*30);
      return redirect('success');
    } catch { return redirect('error'); }
  };
}
