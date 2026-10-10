export async function cloudRequest(path,body,accountId,{timeoutMs=path==='discovery'?60000:25000}={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
  const response=await fetch('/api/'+path,{
    method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(accountId?{'X-Pull-Account':accountId}:{})},
    body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal
  });
  let result;try{result=await response.json();}catch{throw new Error('Cloud service is unavailable. Your local work is safe.');}
  if(!response.ok){const error=new Error(result.error||'Cloud request failed. Your local work is safe.');error.code=result.code;error.status=response.status;throw error;}
  return result;
  }catch(error){if(controller.signal.aborted)throw new Error(path==='discovery'?'The prospect search timed out. Your previous list is kept. Try the search again.':'The connection timed out. Your local work is kept.');throw error;}
  finally{clearTimeout(timer);}
}
export class AccountGuard {
  constructor(){this.user=null;this.epoch=0;this.transition=0;}
  set(user){const changed=this.user?.id!==user?.id;if(changed){this.epoch++;this.transition++;}this.user=user;return changed;}
  invalidate(){this.epoch++;this.transition++;this.user=null;}
  suspend(){this.epoch++;}
  ticket(){if(!this.user)throw new Error('Sign in to use your cloud workspace.');return {id:this.user.id,epoch:this.epoch,transition:this.transition};}
  current(ticket){return this.user?.id===ticket?.id&&this.epoch===ticket?.epoch;}
  sameAccount(ticket){return this.user?.id===ticket?.id&&this.transition===ticket?.transition;}
}
