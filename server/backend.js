import {createClient} from './supabase-rest.js';
import {createHash,randomBytes} from 'node:crypto';
import {aiConfiguration,prepareAI,generateReply} from './ai.js';

const MAX_BYTES = 3 * 1024 * 1024;
const fields = ['version','prospects','shortlist','drafts','audit','mode','identity','context','website','offer','setup','rules','duplicates'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateWorkspace(value) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.prospects) || !Array.isArray(value.shortlist) || !Array.isArray(value.audit) || !object(value.drafts) || !object(value.rules)) throw new Error('Invalid workspace format.');
  if (!['empty','import','example'].includes(value.mode) || !['company','personal'].includes(value.context) || !['identity','website','offer'].every(k => typeof value[k] === 'string')) throw new Error('Invalid workspace details.');
  const ids = new Set();
  for (const p of value.prospects) {
    if (!object(p) || typeof p.id !== 'string' || !p.id || ids.has(p.id)) throw new Error('Prospects need unique IDs.');
    ids.add(p.id);
  }
  if (!value.shortlist.every(id => typeof id === 'string' && ids.has(id)) || !Object.keys(value.drafts).every(id => ids.has(id))) throw new Error('Workspace contains unknown prospect references.');
  if(new Set(value.shortlist).size!==value.shortlist.length)throw new Error('Shortlist contains duplicate references.');
  if(!Object.values(value.drafts).every(d=>object(d)&&typeof d.body==='string'&&typeof d.subject==='string'&&['email','personal','company'].includes(d.channel)&&typeof d.ready==='boolean'))throw new Error('Invalid outreach draft.');
  if(!value.audit.every(a=>object(a)&&typeof a.action==='string'&&typeof a.detail==='string'&&typeof a.at==='string'&&Number.isFinite(Date.parse(a.at))))throw new Error('Invalid activity record.');
  if(!['roles','industries','countries','min','max','signals','days'].every(k=>typeof value.rules[k]==='string')||typeof value.rules.evidence!=='boolean')throw new Error('Invalid audience criteria.');
  const payload = Object.fromEntries(fields.filter(k => Object.hasOwn(value,k)).map(k => [k,value[k]]));
  payload.remember = false;
  return payload;
}

export function configuration(env) {
  try {
    const url = new URL(env.SUPABASE_URL);
    const key = env.SUPABASE_PUBLISHABLE_KEY || '';
    if (url.protocol !== 'https:' || !key || key.startsWith('sb_secret_')) return null;
    if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role === 'service_role') return null;
    return {url:url.origin,key};
  } catch {return null;}
}

function readCookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').flatMap(part => {
    const i=part.indexOf('='); if(i<0)return [];
    try{return [[part.slice(0,i).trim(),decodeURIComponent(part.slice(i+1))]];}catch{return [];}
  }));
}

export function createBackend({env=process.env,clientFactory=createClient,now=()=>new Date(),transport=fetch}={}) {
  const config=configuration(env);
  const client = token => clientFactory(config.url,config.key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:token?{Authorization:'Bearer '+token}:{},fetch:(url,options={})=>transport(url,{...options,signal:options.signal||AbortSignal.timeout(15000)})}
  });

  async function handle(request,resource) {
    const url=new URL(request.url),secure=url.protocol==='https:',prefix=secure?'__Host-pull-':'pull-';
    const cookies=readCookies(request),outCookies=[];
    const reply=(status,data)=>{
      const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      for(const c of outCookies)headers.append('Set-Cookie',c);
      return new Response(JSON.stringify(data),{status,headers});
    };
    const cookie=(name,value,age)=>outCookies.push(`${prefix}${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
    const clear=()=>{cookie('access','',0);cookie('refresh','',0);};
    const sessionCookies=s=>{cookie('access',s.access_token,Math.max(60,s.expires_in||3600));cookie('refresh',s.refresh_token,60*60*24*30);};
    if (!['GET','POST'].includes(request.method)) return reply(405,{error:'Method not allowed.'});
    if (request.method==='POST' && (request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site')) return reply(403,{error:'Open Pull GTM directly to continue.'});
    if(resource==='ai'&&request.method==='GET'){const ai=aiConfiguration(env);return reply(200,{configured:Boolean(config&&ai.credential),model:ai.model,requiresSignIn:true});}
    if (!config) {
      if(resource==='session'&&request.method==='GET')return reply(200,{configured:false,user:null});
      if(resource==='session'&&request.method==='POST'&&request.headers.get('content-type')?.startsWith('application/json')){
        const text=await request.text();
        if(Buffer.byteLength(text)>MAX_BYTES)return reply(413,{error:'Request is too large.'});
        try{if(JSON.parse(text)?.action==='logout'){clear();return reply(200,{user:null,revocationConfirmed:false});}}catch{}
      }
      return reply(503,{error:'Cloud storage is not configured yet.'});
    }
    const base=client();
    let body;
    if(request.method==='POST') {
      if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'Send JSON data.'});
      const text=await request.text();
      if(Buffer.byteLength(text)>MAX_BYTES)return reply(413,{error:'This save is too large for one request. Your work remains in this browser; download a backup.'});
      try{body=JSON.parse(text);if(!object(body))throw new Error();}catch{return reply(400,{error:'Invalid request data.'});}
    }
    let access=cookies[prefix+'access'],refresh=cookies[prefix+'refresh'];
    const verified=async()=>{
      let result=access?await base.auth.getUser(access):{data:{user:null},error:{status:401}};
      if(result.error&&[400,401,403].includes(result.error.status)&&refresh) {
        const renewed=await base.auth.refreshSession({refresh_token:refresh});
        if(renewed.error||!renewed.data.session){if(renewed.error?.status>=500)throw new Error('Provider unavailable');clear();return null;}
        access=renewed.data.session.access_token;refresh=renewed.data.session.refresh_token;sessionCookies(renewed.data.session);
        result=await base.auth.getUser(access);
      }
      if(result.error?.status>=500)throw new Error('Provider unavailable');
      if(result.error||!result.data.user||typeof result.data.user.id!=='string'||!result.data.user.id||result.data.user.is_anonymous)return null;
      return result.data.user;
    };
    try {
      if(resource==='session') {
        if(request.method==='GET') {const user=await verified();return reply(200,{configured:true,user:user?{id:user.id,email:user.email}:null});}
        if(body.action==='logout') {
          let revocationConfirmed=true;
          try{
            if(access||refresh){
              const user=await verified();
              if(user&&request.headers.get('x-pull-account')!==user.id)return reply(409,{code:'ACCOUNT_CHANGED',error:'Your account changed in another tab. Open your cloud workspace again.'});
              if(user){const local=client();await local.auth.setSession({access_token:access,refresh_token:refresh});const r=await local.auth.signOut({scope:'local'});revocationConfirmed=!r.error;}
            }
          }catch{revocationConfirmed=false;}
          clear();return reply(200,{user:null,revocationConfirmed});
        }
        if(!['login','signup'].includes(body.action))return reply(400,{error:'Unknown account action.'});
        if(typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||typeof body.password!=='string'||body.password.length<8||body.password.length>256)return reply(400,{error:'Use a valid email and a password of at least 8 characters.'});
        const credentials={email:body.email.trim(),password:body.password};
        const result=body.action==='signup'?await base.auth.signUp(credentials):await base.auth.signInWithPassword(credentials);
        if(result.error?.status>=500)return reply(503,{error:'The account service is temporarily unavailable. Your local work is safe.'});
        if(result.error)return reply(result.error.status===429?429:400,{error:body.action==='login'?'Unable to sign in. Check your details and confirm your email.':'Unable to create an account. Check your details or try signing in.'});
        if(result.data.session)sessionCookies(result.data.session);
        return reply(200,{user:result.data.session?{id:result.data.user.id,email:result.data.user.email}:null,confirmationRequired:!result.data.session});
      }
      const user=await verified();
      if(!user)return reply(401,{error:'Sign in to access your saved workspace.'});
      if(request.headers.get('x-pull-account')!==user.id)return reply(409,{code:'ACCOUNT_CHANGED',error:'Your account changed in another tab. Open your cloud workspace again.'});
      if(resource==='ai'){
        try{prepareAI(body);}catch(e){return reply(400,{error:e.message});}
        if(!aiConfiguration(env).credential)return reply(503,{error:'AI Gateway needs configuration before a model can respond.'});
        const allowed=await client(access).rpc('claim_pull_ai_request',{});
        if(allowed.error)return reply(503,{error:'AI usage controls are unavailable. Your workspace is kept.'});
        if(allowed.data!==true)return reply(429,{error:'The daily AI usage budget is reached. Your prospect list and manual tools remain available.'});
        const result=await generateReply({body,userId:user.id,env,transport});const {status,...data}=result;return reply(status,data);
      }
      if(resource==='agents'){
        const endpoint=config.url+'/functions/v1/pull-mcp';
        if(request.method==='GET'){
          const result=await client(access).from('pull_agent_tokens').select('id,label,scopes,expires_at,created_at,revoked_at').eq('user_id',user.id).order('created_at.desc').all();
          if(result.error)return reply(503,{error:'Agent access setup is unavailable.'});
          return reply(200,{configured:true,endpoint,tokens:(result.data||[]).filter(t=>!t.revoked_at&&new Date(t.expires_at)>now())});
        }
        if(body.action==='create'){
          if(typeof body.label!=='string'||!body.label.trim()||body.label.length>80||!Array.isArray(body.scopes)||!body.scopes.length||!body.scopes.every(s=>['workspace:read','drafts:write'].includes(s)))return reply(400,{error:'Name the agent and choose supported permissions.'});
          const token='pull_agent_'+randomBytes(32).toString('base64url'),scopes=[...new Set(body.scopes)];
          if(scopes.includes('drafts:write')&&!scopes.includes('workspace:read'))scopes.unshift('workspace:read');
          const result=await client(access).from('pull_agent_tokens').insert({user_id:user.id,label:body.label.trim(),scopes,token_hash:createHash('sha256').update(token).digest('hex'),expires_at:new Date(+now()+30*86400000).toISOString()}).select('id').single();
          if(result.error||!result.data)return reply(503,{error:'Could not create agent access. No token was issued.'});
          return reply(200,{token,id:result.data.id,endpoint});
        }
        if(body.action==='revoke'){
          if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))return reply(400,{error:'Choose a valid access token.'});
          const result=await client(access).from('pull_agent_tokens').update({revoked_at:now().toISOString()}).eq('user_id',user.id).eq('id',body.id).select('id').maybeSingle();
          if(result.error)return reply(503,{error:'Could not revoke this token. Try again.'});
          return result.data?reply(200,{revoked:true}):reply(404,{error:'Access token not found.'});
        }
        return reply(400,{error:'Unknown agent access action.'});
      }
      const db=client(access).from('pull_workspaces');
      if(request.method==='GET') {
        const {data,error}=await db.select('payload,revision,updated_at').eq('user_id',user.id).maybeSingle();
        if(error)return reply(503,{error:'Cloud workspace is unavailable. Your local work is safe.'});
        return reply(200,{workspace:data?{...data,payload:validateWorkspace(data.payload)}:null});
      }
      let payload;
      try{payload=validateWorkspace(body.workspace);}catch(e){return reply(400,{error:e.message});}
      const revision=body.revision;
      if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER)return reply(400,{error:'Load your cloud workspace before saving.'});
      const row={user_id:user.id,payload,revision:revision+1,updated_at:now().toISOString()};
      const result=revision===0?await db.insert(row).select('revision,updated_at').single():await db.update(row).eq('user_id',user.id).eq('revision',revision).select('revision,updated_at').maybeSingle();
      if(result.error?.code==='23505'||(!result.error&&!result.data))return reply(409,{error:'A newer cloud save exists. Download a backup, then load that version before saving.'});
      if(result.error)return reply(503,{error:'Could not save to the cloud. Your local work is safe.'});
      return reply(200,result.data);
    } catch {return reply(503,{error:'The cloud service is temporarily unavailable. Your local work is safe.'});}
  }
  return {session:r=>handle(r,'session'),workspace:r=>handle(r,'workspace'),ai:r=>handle(r,'ai'),agents:r=>handle(r,'agents')};
}
