import {createMCPHandler} from './handler.js';
import {createAgentStore} from './store.js';

// verify_jwt=false is required because this endpoint validates owner-issued PATs,
// rather than Supabase JWTs. Authentication never depends on browser cookies.
const url=Deno.env.get('SUPABASE_URL');
let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key;}catch{}
const allowedOrigins=['https://pull-gtm.vercel.app',...(Deno.env.get('PULL_MCP_ALLOWED_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean)];
if(!url||!key){
  Deno.serve(()=>Response.json({error:'Agent access is not configured.'},{status:503,headers:{'Cache-Control':'no-store'}}));
}else{
  Deno.serve(createMCPHandler({store:createAgentStore({url,key}),allowedOrigins}));
}
