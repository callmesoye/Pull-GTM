export async function cloudRequest(path,body,accountId) {
  const response=await fetch('/api/'+path,{
    method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(accountId?{'X-Pull-Account':accountId}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let result;try{result=await response.json();}catch{throw new Error('Cloud service is unavailable. Your local work is safe.');}
  if(!response.ok){const error=new Error(result.error||'Cloud request failed. Your local work is safe.');error.code=result.code;error.status=response.status;throw error;}
  return result;
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
