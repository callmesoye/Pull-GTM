import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {configuration} from './config.js';
import {createClient} from './supabase-rest.js';

const BODY_BYTES = 2048;
const LINK_SECONDS = 3600;
const RECOVERY_SECONDS = 600;
const validToken = value => typeof value === 'string' && value && encodeURIComponent(value).length <= 3800;
const validUser = user => user && typeof user.id === 'string' && user.id && !user.is_anonymous;

export function emailConfiguration(env) {
  const supabase = configuration(env);
  try {
    const app = new URL(env.PULL_APP_URL);
    const local = app.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(app.hostname) && env.NODE_ENV !== 'production';
    if (!supabase || typeof env.PULL_OAUTH_COOKIE_SECRET !== 'string' || env.PULL_OAUTH_COOKIE_SECRET.length < 32 || (!local && app.protocol !== 'https:') || app.username || app.password || app.pathname !== '/' || app.search || app.hash) return null;
    return {...supabase, appOrigin:app.origin, cookieSecret:env.PULL_OAUTH_COOKIE_SECRET};
  } catch { return null; }
}

export async function readAccountJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return {status:415};
  if (Number(request.headers.get('content-length')) > BODY_BYTES) return {status:413};
  if (!request.body) return {status:400};
  const reader=request.body.getReader(), chunks=[]; let length=0;
  try {
    while (true) {
      const next=await reader.read(); if (next.done) break;
      length+=next.value.byteLength;
      if (length>BODY_BYTES) { await reader.cancel(); return {status:413}; }
      chunks.push(next.value);
    }
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {status:400};
    return {body};
  } catch { return {status:400}; } finally { reader.releaseLock(); }
}

function cookieValue(request,name) {
  const values=(request.headers.get('cookie')||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));
  if (values.length!==1) return null;
  try { return decodeURIComponent(values[0].slice(name.length+1)); } catch { return null; }
}

// Resends use the confirmation email template documented in docs/AUTH-EMAIL-SETUP.md.
// Recovery uses PKCE, so a default Supabase ConfirmationURL never carries session tokens to app.js.
export function createEmailAuth({env=process.env,transport=fetch,now=()=>Date.now()}={}) {
  const config=emailConfiguration(env);
  return async function emailAuth(request) {
    const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    const json=(status,data)=>{headers.set('Content-Type','application/json');return new Response(JSON.stringify(data),{status,headers});};
    if (!['GET','POST'].includes(request.method)) {headers.set('Allow','GET, POST');return json(405,{error:'Method not allowed.'});}
    if (!config) return json(503,{error:'Email account recovery is not configured on this deployment yet.'});
    const url=new URL(request.url),secure=config.appOrigin.startsWith('https:'),prefix=secure?'__Host-pull-':'pull-';
    const cookie=(name,value,age)=>headers.append('Set-Cookie',`${prefix}${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
    const clearRecovery=()=>{cookie('recovery-access','',0);cookie('recovery-state','',0);};
    const redirect=result=>{headers.set('Location',config.appOrigin+'/#auth='+result);return new Response(null,{status:303,headers});};
    if (url.origin!==config.appOrigin || (request.method==='POST' && (request.headers.get('origin')!==config.appOrigin || request.headers.get('sec-fetch-site')==='cross-site'))) return json(403,{error:'Open Pull GTM directly to continue.'});
    const sign=encoded=>createHmac('sha256',config.cookieSecret).update(encoded).digest('base64url');
    const seal=value=>{const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');return encoded+'.'+sign(encoded);};
    const unseal=(value,purpose,seconds)=>{
      if (typeof value!=='string' || value.length>1024) throw new Error();
      const parts=value.split('.');
      if(parts.length!==2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]) || !timingSafeEqual(Buffer.from(parts[1]),Buffer.from(sign(parts[0])))) throw new Error();
      const state=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')),age=now()-state.created;
      if(state.origin!==config.appOrigin || state.purpose!==purpose || !Number.isSafeInteger(state.created) || age<0 || age>=seconds*1000) throw new Error();
      return state;
    };
    const client=createClient(config.url,config.key,{global:{fetch:(input,options={})=>transport(input,{...options,signal:AbortSignal.timeout(15000),redirect:'error'})}});
    const temporaryFailure=()=>json(503,{error:'The account service is temporarily unavailable. Try again shortly.'});
    const limited=()=>json(429,{error:'Too many account attempts. Wait a moment, then try again.'});
    try {
      if(request.method==='GET') {
        if(url.searchParams.getAll('flow').length!==1 || url.searchParams.has('error') || url.searchParams.has('error_code')) return redirect('error');
        if(url.searchParams.get('flow')==='confirmation') {
          // Confirmation verifies the address but never signs a browser into the link owner's account.
          if([...url.searchParams.keys()].some(k=>!['flow','token_hash','type'].includes(k)) || url.searchParams.getAll('token_hash').length!==1 || url.searchParams.getAll('type').length!==1 || url.searchParams.get('type')!=='email') return redirect('error');
          const token=url.searchParams.get('token_hash');
          if(!token || token.length>512 || !/^[A-Za-z0-9_-]+$/.test(token)) return redirect('error');
          const result=await client.auth.verifyOtp({token_hash:token,type:'email'});
          if(result.error || !validUser(result.data?.user)) return redirect('error');
          // Verification grants a provider session; discard and revoke it before returning to sign-in.
          if(result.data.session?.access_token) {await client.auth.setSession(result.data.session);await client.auth.signOut();}
          return redirect('confirmed');
        }
        cookie('recovery-verifier','',0);
        if(url.searchParams.get('flow')!=='recovery' || [...url.searchParams.keys()].some(k=>!['flow','code'].includes(k)) || url.searchParams.getAll('code').length!==1) return redirect('error');
        const code=url.searchParams.get('code');
        if(!code || code.length>1024 || !/^[A-Za-z0-9_-]+$/.test(code)) return redirect('error');
        let state;
        try {
          state=unseal(cookieValue(request,prefix+'recovery-verifier'),'recovery-link',LINK_SECONDS);
          if(!/^[A-Za-z0-9_-]{64}$/.test(state.verifier)) throw new Error();
        } catch { return redirect('error'); }
        // Auth codes are single-use. Never retry this exchange after an uncertain provider result.
        const result=await client.auth.exchangeCodeForSession(code,state.verifier),session=result.data?.session;
        if(result.error || !session || !validToken(session.access_token) || !validToken(session.refresh_token) || !Number.isSafeInteger(session.expires_in) || session.expires_in<=0) return redirect('error');
        const checked=await client.auth.getUser(session.access_token),user=checked.data?.user;
        if(checked.error || !validUser(user) || (session.user?.id && session.user.id!==user.id)) return redirect('error');
        const lifetime=Math.min(RECOVERY_SECONDS,session.expires_in);
        cookie('recovery-access',session.access_token,lifetime);
        cookie('recovery-state',seal({purpose:'password-update',origin:config.appOrigin,created:now(),userId:user.id,accessHash:createHash('sha256').update(session.access_token).digest('base64url'),expires:now()+lifetime*1000}),lifetime);
        return redirect('recovery');
      }
      const parsed=await readAccountJSON(request);
      if(parsed.status) return json(parsed.status,{error:parsed.status===413?'Account request is too large.':'Send a valid account request.'});
      const body=parsed.body;
      if(['resend-confirmation','recover'].includes(body.action)) {
        if(Object.keys(body).some(k=>!['action','email'].includes(k)) || typeof body.email!=='string' || body.email.trim().length>254 || /[\u0000-\u0020\u007f]/.test(body.email.trim()) || !/^\S+@\S+\.\S+$/.test(body.email.trim())) return json(400,{error:'Use a valid email address.'});
        const email=body.email.trim();let result,recoveryVerifier;
        if(body.action==='resend-confirmation') {
          result=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:config.appOrigin+'/api/auth?flow=confirmation'}});
        } else {
          recoveryVerifier=randomBytes(48).toString('base64url');
          result=await client.auth.resetPasswordForEmail(email,{redirectTo:config.appOrigin+'/api/auth?flow=recovery',codeChallenge:createHash('sha256').update(recoveryVerifier).digest('base64url'),codeChallengeMethod:'s256'});
        }
        if(result.error?.status===429) return limited();
        if(result.error?.status>=500) return temporaryFailure();
        // Keep account existence and confirmation status out of this response.
        if(result.error && ![400,422].includes(result.error.status)) return temporaryFailure();
        if(recoveryVerifier) cookie('recovery-verifier',seal({purpose:'recovery-link',origin:config.appOrigin,created:now(),verifier:recoveryVerifier}),LINK_SECONDS);
        return json(200,{emailRequested:true});
      }
      if(body.action!=='update-password' || Object.keys(body).some(k=>!['action','password'].includes(k))) return json(400,{error:'Unknown account action.'});
      if(typeof body.password!=='string' || body.password.length<8 || body.password.length>256) return json(400,{error:'Use a password of 8 to 256 characters.'});
      const access=cookieValue(request,prefix+'recovery-access');let state;
      try {
        state=unseal(cookieValue(request,prefix+'recovery-state'),'password-update',RECOVERY_SECONDS);
        if(!validToken(access) || typeof state.userId!=='string' || !state.userId || !Number.isSafeInteger(state.expires) || state.expires<=now() || state.accessHash!==createHash('sha256').update(access).digest('base64url')) throw new Error();
      } catch {clearRecovery();return json(401,{error:'Open a new password reset email in the browser where you requested it.'});}
      const checked=await client.auth.getUser(access),user=checked.data?.user;
      if(checked.error?.status===429) return limited();
      if(checked.error?.status>=500) return temporaryFailure();
      if(checked.error || !validUser(user) || user.id!==state.userId) {clearRecovery();return json(401,{error:'This password reset has expired. Request another email.'});}
      const changed=await client.auth.updateUser({password:body.password},access);
      if(changed.error?.status===429) return limited();
      if(changed.error?.status>=500) return temporaryFailure();
      if(changed.error) return json(400,{error:'Unable to update this password. Choose a different password or request another email.'});
      if(!validUser(changed.data?.user) || changed.data.user.id!==user.id) {clearRecovery();return temporaryFailure();}
      clearRecovery();
      // Require a fresh password sign-in and preserve any existing ordinary workspace session.
      try {await client.auth.setSession({access_token:access});await client.auth.signOut();} catch {}
      return json(200,{passwordUpdated:true,user:null});
    } catch { return request.method==='GET'?redirect('error'):temporaryFailure(); }
  };
}
