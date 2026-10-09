import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, sep, extname} from 'node:path';
import {createBackend} from '../server/backend.js';
import {curlFetch} from './curl-fetch.mjs';
import {createGoogleAuth} from '../server/auth.js';
import {createAutomationsBackend} from '../server/automations.js';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.csv':'text/csv; charset=utf-8','.json':'application/json'};
const server = http.createServer(async(req,res)=>{
  try {
    const requestUrl=new URL(req.url,'http://'+(req.headers.host||'127.0.0.1:4173'));
    if(['/api/session','/api/workspace','/api/profile','/api/auth','/api/automations','/api/ai','/api/agents','/api/agent-chat','/api/discovery'].includes(requestUrl.pathname)){
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>3*1024*1024){res.writeHead(413);return res.end('{"error":"Request is too large."}');}}
      const request=new Request(requestUrl,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});
      const options={transport:curlFetch},backend=createBackend(options),route=requestUrl.pathname.split('/').pop();
      const response=route==='auth'?await createGoogleAuth(options)(request):route==='automations'?await createAutomationsBackend(options)(request):await backend[route==='agent-chat'?'agentChat':route](request);
      res.statusCode=response.status;for(const [key,value] of response.headers){if(key!=='set-cookie')res.setHeader(key,value);}const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);return res.end(await response.text());
    }
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root.slice(0,-1) && !path.startsWith(root)) {res.writeHead(403);return res.end('Forbidden');}
    const target = path===root.slice(0,-1) ? resolve(root,'index.html') : path;
    const data=await readFile(target);
    res.writeHead(200, {'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Pull GTM preview: http://127.0.0.1:'+server.address().port));
