import {createClient} from './supabase-rest.js';
import {createHash,randomBytes} from 'node:crypto';
import {aiConfiguration,prepareAI,generateReply} from './ai.js';
import {testAgentConnection} from './agent-test.js';

const MAX_BYTES = 3 * 1024 * 1024;
import {validateWorkspace} from '../dist/workspace.js';
export {validateWorkspace} from '../dist/workspace.js';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

import {configuration} from './config.js';
export {configuration} from './config.js';
import {googleConfiguration} from './auth.js';
import {discoveryInput,discoverPrivatePages} from './discovery.js';

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
    global:{headers:token?{Authorization:'Bearer '+token}:{},fetch:(url,options={})=>transport(url,{...options,signal:options.signal||AbortSignal.timeout(15000),redirect:'error'})}
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
    const validSession=s=>object(s)&&['access_token','refresh_token'].every(k=>typeof s[k]==='string'&&s[k]&&encodeURIComponent(s[k]).length<=3800)&&Number.isSafeInteger(s.expires_in)&&s.expires_in>0;
    const sessionCookies=s=>{if(!validSession(s))throw new Error('Invalid provider session');cookie('access',s.access_token,Math.max(60,Math.min(s.expires_in,2592000)));cookie('refresh',s.refresh_token,60*60*24*30);};
    if (!['GET','POST'].includes(request.method)) return reply(405,{error:'Method not allowed.'});
    if (request.method==='POST' && (request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site')) return reply(403,{error:'Open Pull GTM directly to continue.'});
    if(resource==='ai'&&request.method==='GET'){const ai=aiConfiguration(env);return reply(200,{configured:Boolean(config&&ai.credential),model:ai.model,requiresSignIn:true});}
    if(resource==='discovery'&&request.method==='GET')return reply(200,{configured:Boolean(config&&env.BRAVE_SEARCH_API_KEY),provider:env.BRAVE_SEARCH_API_KEY?'Brave Search API':null,requiresSignIn:true});
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
      let pendingSession=null;let result=access?await base.auth.getUser(access):{data:{user:null},error:{status:401}};
      if(result.error&&[400,401,403].includes(result.error.status)&&refresh) {
        const renewed=await base.auth.refreshSession({refresh_token:refresh});
        if(!renewed.error&&!renewed.data.session)throw new Error('Invalid provider session');if(renewed.error||!renewed.data.session){if(renewed.error?.status===429||renewed.error?.status>=500)throw new Error('Provider unavailable');clear();return null;}
        if(!validSession(renewed.data.session))throw new Error('Invalid provider session');pendingSession=renewed.data.session;access=pendingSession.access_token;refresh=pendingSession.refresh_token;
        result=await base.auth.getUser(access);
      }
      if(result.error?.status===429||result.error?.status>=500)throw new Error('Provider unavailable');
      if(result.error||!result.data.user||typeof result.data.user.id!=='string'||!result.data.user.id||result.data.user.is_anonymous)return null;
      if(pendingSession){if(pendingSession.user?.id&&pendingSession.user.id!==result.data.user.id)throw new Error('Invalid provider session');sessionCookies(pendingSession);}
      return result.data.user;
    };
    try {
      if(resource==='session') {
        if(request.method==='GET') {const user=await verified();return reply(200,{configured:true,providers:{google:Boolean(googleConfiguration(env))},user:user?{id:user.id,email:user.email}:null});}
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
        if(result.error?.status>=500)throw new Error('Provider unavailable');
        if(result.error?.status===429)return reply(429,{error:'Too many account attempts. Wait a moment, then try again.'});
        if(result.error)return reply(400,{error:body.action==='login'?'Unable to sign in. Check your details and confirm your email.':'Unable to create an account. Check your details or try signing in.'});
        if(result.data.session){if(!validSession(result.data.session))throw new Error('Invalid provider session');const check=await base.auth.getUser(result.data.session.access_token);const u=check.data?.user;if(check.error||!u||typeof u.id!=='string'||!u.id||u.is_anonymous||(result.data.user?.id&&result.data.user.id!==u.id))throw new Error('Invalid provider session');sessionCookies(result.data.session);return reply(200,{user:{id:u.id,email:u.email},confirmationRequired:false});}
        if(body.action==='login'||!result.data?.user||typeof result.data.user.id!=='string'||!result.data.user.id)throw new Error('Invalid provider session');
        return reply(200,{user:null,confirmationRequired:true});
      }
      const user=await verified();
      if(!user)return reply(401,{error:'Sign in to access your saved workspace.'});
      if(request.headers.get('x-pull-account')!==user.id)return reply(409,{code:'ACCOUNT_CHANGED',error:'Your account changed in another tab. Open your cloud workspace again.'});
      if(resource==='discovery'){
        let input;try{input=discoveryInput(body);}catch(error){return reply(400,{error:error.message});}
        try{return reply(200,await discoverPrivatePages(input,{key:env.BRAVE_SEARCH_API_KEY,transport}));}
        catch(error){return reply(503,{error:error.message});}
      }
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
          const result=await client(access).from('pull_agent_tokens').select('id,label,scopes,expires_at,created_at,revoked_at,last_chat_poll_at').eq('user_id',user.id).order('created_at',{ascending:false}).all();
          if(result.error)return reply(503,{error:'Agent access setup is unavailable.'});
          return reply(200,{configured:true,endpoint,tokens:(result.data||[]).filter(t=>!t.revoked_at&&new Date(t.expires_at)>now())});
        }
        if(body.action==='test'){
          if(Object.keys(body).some(k=>!['action','token'].includes(k)))return reply(400,{error:'Use the fixed Pull connection check.'});
          const {status,...result}=await testAgentConnection({endpoint,token:body.token,transport});
          return reply(status,result);
        }
        if(body.action==='create'){
          if(typeof body.label!=='string'||!body.label.trim()||body.label.length>80||!Array.isArray(body.scopes)||!body.scopes.length||!body.scopes.every(s=>['workspace:read','drafts:write','chat:relay'].includes(s)))return reply(400,{error:'Name the agent and choose supported permissions.'});
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
      if(resource==='agent-chat'){
        const db=client(access).from('pull_agent_chat_requests');
        if(request.method==='GET'){
          const result=await db.select('id,question,use_workspace,answer,status,created_at,claimed_at,answered_at,expires_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20).all();
          if(result.error)return reply(503,{error:'Your agent conversation is temporarily unavailable.'});
          return reply(200,{messages:result.data.reverse()});
        }
        if(Object.keys(body).some(key=>!['action','question','use_workspace'].includes(key))||body.action!=='ask'||typeof body.question!=='string'||!body.question.trim()||body.question.length>5000||typeof body.use_workspace!=='boolean')return reply(400,{error:'Write a question of up to 5,000 characters and choose whether your agent may use Pull data.'});
        const accessRows=await client(access).from('pull_agent_tokens').select('scopes,expires_at,revoked_at').eq('user_id',user.id).all();
        if(accessRows.error)return reply(503,{error:'Could not verify conversation access.'});
        if(!accessRows.data.some(token=>!token.revoked_at&&new Date(token.expires_at)>now()&&token.scopes?.includes('chat:relay')))return reply(409,{error:'Create a conversation relay key in Connect your AI first.'});
        const workspace=await client(access).from('pull_workspaces').select('revision').eq('user_id',user.id).maybeSingle();
        if(workspace.error)return reply(503,{error:'Could not verify your saved workspace.'});
        if(!workspace.data)return reply(409,{error:'Save your workspace to the cloud before asking your agent here.'});
        const result=await db.insert({user_id:user.id,question:body.question.trim(),use_workspace:body.use_workspace}).select('id,question,use_workspace,answer,status,created_at,claimed_at,answered_at,expires_at').single();
        if(result.error?.code==='54000')return reply(429,{error:'Wait for your agent to answer, or try again later.'});
        if(result.error||!result.data)return reply(503,{error:'Could not queue your question. Nothing was sent to an agent.'});
        return reply(201,{message:result.data});
      }
      if(resource==='profile'){
        const db=client(access).from('pull_profiles');
        if(request.method==='GET'){const r=await db.select('id,display_name,created_at,updated_at').eq('id',user.id).maybeSingle();if(r.error)return reply(503,{error:'Profile is unavailable. Try again shortly.'});return reply(200,{profile:r.data});}
        if(Object.keys(body).some(k=>k!=='display_name')||typeof body.display_name!=='string'||body.display_name.trim().length>100||/[\u0000-\u001f\u007f]/.test(body.display_name))return reply(400,{error:'Use a display name of at most 100 characters.'});
        const r=await db.update({display_name:body.display_name.trim()}).eq('id',user.id).select('id,display_name,created_at,updated_at').maybeSingle();if(r.error||!r.data)return reply(503,{error:'Could not save your profile. Try again shortly.'});return reply(200,{profile:r.data});
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
  return {session:r=>handle(r,'session'),workspace:r=>handle(r,'workspace'),profile:r=>handle(r,'profile'),ai:r=>handle(r,'ai'),agents:r=>handle(r,'agents'),agentChat:r=>handle(r,'agent-chat'),discovery:r=>handle(r,'discovery')};
}
