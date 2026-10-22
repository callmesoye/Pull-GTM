// Local-only visual QA. No Supabase, model, source-provider or delivery calls.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@pull.example'};
let saved=null,revision=0;
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const reply=(status,data,cookie)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(data));};
 try{
  if(url.pathname.startsWith('/api/')){
   let text='';for await(const chunk of req){text+=chunk;if(text.length>3e6)return reply(413,{error:'Fixture request too large.'});}
   const body=text?JSON.parse(text):{},signedIn=(req.headers.cookie||'').includes('pull_ui_fixture=owner');
   if(url.pathname==='/api/session'){
    if(req.method==='GET')return reply(200,{configured:true,providers:{google:false},user:signedIn?user:null});
    if(body.action==='logout')return reply(200,{user:null,revocationConfirmed:true},'pull_ui_fixture=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    if(body.action==='signup')return reply(200,{user:null,confirmationRequired:true});
    if(body.email==='owner@pull.example'&&body.password==='fixture-only')return reply(200,{user,confirmationRequired:false},'pull_ui_fixture=owner; Path=/; HttpOnly; SameSite=Strict');
    return reply(400,{error:'Local fixture: use owner@pull.example with fixture-only. No real account is contacted.'});
   }
   if(url.pathname==='/api/auth')return reply(200,{ok:true});
   if(!signedIn)return reply(401,{error:'Sign in to the local UI fixture.'});
   if(url.pathname==='/api/profile')return reply(200,{profile:{display_name:'Fictional QA owner'}});
   if(url.pathname==='/api/workspace'){if(req.method==='POST'){saved=body.workspace;revision++;return reply(200,{revision,updated_at:new Date().toISOString()});}return reply(200,{workspace:saved?{payload:saved,revision,updated_at:new Date().toISOString()}:null});}
   if(url.pathname==='/api/ai'){
    if(req.method==='GET')return reply(200,{configured:true,model:'Local fixture'});
    return reply(200,{reply:'Fictional QA result: one source record is ready for evidence review. Nothing has been added or sent.',research:[{people:[{id:'qa-prospect',name:'Amara Example',title:'Founder',company:'Example Studio (fictional)',industry:'Software',location:'Lagos, Nigeria',source_url:'https://studio.example/team',source_excerpt:'Fictional private software studio for interface QA.',search_match:'Matches the requested role and sector in this fixture.'}],input:{audience:'Founder',industry:'Software',location:'Lagos',limit:1},target:{requested:1,returned:1,remaining:0},notice:'Explicitly fictional UI test data. This is not a live search.'}]});
   }
   if(url.pathname==='/api/automations')return reply(200,{configured:true,schedulingAvailable:false,workflows:[],runs:[],schedules:[]});
   if(url.pathname==='/api/discovery')return reply(200,{configured:false,people:[],notice:'Live search is disabled in this local fixture.'});
   return reply(200,{configured:false,tokens:[],connections:[],deliveries:[],messages:[]});
  }
  const target=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!target.startsWith(root))return reply(403,{error:'Forbidden'});
  let data=await readFile(target);
  if(target.endsWith('index.html'))data=Buffer.from(data.toString().replace('<body>','<body><div style="position:fixed;bottom:8px;left:8px;z-index:99999;background:#20364c;color:white;padding:6px 10px;border-radius:6px;font:11px system-ui;pointer-events:none">Local UI fixture · fictional account and results · no external actions</div>'));
  res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{reply(404,{error:'Fixture route unavailable.'});}
}).listen(Number(process.env.PORT||4193),'127.0.0.1',()=>console.log('Labelled local UI fixture: http://127.0.0.1:'+(process.env.PORT||4193)));
