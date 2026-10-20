import {configuration} from './config.js';
import {createClient} from './supabase-rest.js';

export function readProductCookie(request,name) {
  const prefix=new URL(request.url).protocol==='https:'?'__Host-pull-':'pull-';
  const matches=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(prefix+name+'='));
  if(matches.length!==1)return null;
  try {return decodeURIComponent(matches[0].slice((prefix+name+'=').length));}catch{return null;}
}
export async function verifiedProductUser(request,{env=process.env,transport=fetch,clientFactory=createClient}={}) {
  const config=configuration(env);
  if(!config)return null;
  const token=readProductCookie(request,'access');
  if(!token||token.length>4000)return null;
  const client=clientFactory(config.url,config.key,{
    global:{headers:{Authorization:'Bearer '+token},fetch:(url,options={})=>transport(url,{...options,redirect:'error',signal:options.signal||AbortSignal.timeout(8000)})}
  });
  const {data,error}=await client.auth.getUser(token);
  if(error||!data?.user?.id||data.user.is_anonymous)return null;
  return {user:data.user,db:client};
}
export async function verifiedProductAdmin(request,deps={}) {
  const identity=await verifiedProductUser(request,deps);
  if(!identity)return null;
  const {data,error}=await identity.db.from('pull_admin_members').select('role').eq('user_id',identity.user.id).maybeSingle();
  if(error||!data||!['owner','analyst'].includes(data.role))return null;
  return {...identity,role:data.role};
}
export function productJson(status,body) {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
export function productOriginOk(request) {
  const url=new URL(request.url);
  return request.headers.get('origin')===url.origin&&request.headers.get('sec-fetch-site')!=='cross-site';
}
export async function readProductJSON(request,limit=1600) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return null;
  const text=await request.text();
  if(text.length>limit)return null;
  try{const body=JSON.parse(text);return body&&typeof body==='object'&&!Array.isArray(body)?body:null;}catch{return null;}
}
