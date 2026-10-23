// Supabase Auth and PostgREST calls stay on the server. Tokens never reach app.js.
export function createClient(url,key,options={}) {
  const transport=options.global?.fetch||fetch;
  let session=null;
  async function request(path,{method='GET',body,token,prefer,signal}={}) {
    const headers={apikey:key,...options.global?.headers};
    if(token)headers.Authorization='Bearer '+token;
    if(body!==undefined)headers['Content-Type']='application/json';
    if(prefer)headers.Prefer=prefer;
    const response=await transport(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),...(signal?{signal}:{})});
    const text=await response.text();
    let data;try{data=text?JSON.parse(text):{};}catch{return {data:null,error:{status:502}};}
    return response.ok?{data,error:null}:{data:null,error:{status:response.status,code:data.code||data.error_code}};
  }
  const authResult=result=>result.error?{data:{user:null,session:null},error:result.error}:{data:{user:result.data.user||result.data,session:result.data.access_token?result.data:null},error:null};
  const redirectQuery=value=>value?'?'+new URLSearchParams({redirect_to:value}):'';
  return {
    rpc:(name,body,{signal}={})=>request('/rest/v1/rpc/'+encodeURIComponent(name),{method:'POST',body,signal}),
    auth:{
      getUser:async token=>{const r=await request('/auth/v1/user',{token});return {data:{user:r.data},error:r.error};},
      refreshSession:async body=>authResult(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body})),
      signInWithPassword:async body=>authResult(await request('/auth/v1/token?grant_type=password',{method:'POST',body})),
      signUp:async ({options,...body})=>authResult(await request('/auth/v1/signup'+redirectQuery(options?.emailRedirectTo),{method:'POST',body})),
      resend:async ({options,...body})=>request('/auth/v1/resend'+redirectQuery(options?.emailRedirectTo),{method:'POST',body}),
      resetPasswordForEmail:async (email,options={})=>request('/auth/v1/recover'+redirectQuery(options.redirectTo),{method:'POST',body:{email,code_challenge:options.codeChallenge,code_challenge_method:options.codeChallengeMethod}}),
      exchangeCodeForSession:async (auth_code,code_verifier)=>authResult(await request('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code,code_verifier}})),
      verifyOtp:async body=>authResult(await request('/auth/v1/verify',{method:'POST',body})),
      updateUser:async (body,token)=>{const r=await request('/auth/v1/user',{method:'PUT',body,token:token||session?.access_token});return {data:{user:r.data},error:r.error};},
      setSession:async value=>{session=value;return {data:{session},error:null};},
      signOut:async()=>request('/auth/v1/logout?scope=local',{method:'POST',token:session?.access_token})
    },
    from:table=>{
      const params=new URLSearchParams();let method='GET',body;
      const query={
        select:fields=>{params.set('select',fields);return query;},
        eq:(field,value)=>{params.set(field,'eq.'+value);return query;},
        order:(field,{ascending=true}={})=>{params.set('order',field+(ascending?'.asc':'.desc'));return query;},
        limit:count=>{params.set('limit',String(count));return query;},
        insert:value=>{method='POST';body=value;return query;},
        update:value=>{method='PATCH';body=value;return query;},
        all:async()=>{
          const r=await request('/rest/v1/'+encodeURIComponent(table)+'?'+params,{method,body,prefer:method==='GET'?undefined:'return=representation'});
          if(r.error)return r;
          if(!Array.isArray(r.data))return {data:null,error:{status:502}};
          return r;
        },
        maybeSingle:async()=>{
          const r=await query.all();
          if(r.error)return r;
          if(r.data.length>1)return {data:null,error:{status:502}};
          return {data:r.data[0]||null,error:null};
        },
        single:async()=>query.maybeSingle()
      };
      return query;
    }
  };
}
