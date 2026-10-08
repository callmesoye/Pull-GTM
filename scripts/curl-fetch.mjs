import {spawn} from 'node:child_process';

// Development fallback for this host's Node DNS failure. Production uses fetch.
const quote=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\r','\\r').replaceAll('\n','\\n')+'"';
export function curlConfiguration(url,options={}) {
  const target=new URL(url);
  if(target.protocol!=='https:')throw new Error('Cloud requests require HTTPS.');
  const lines=['url = '+quote(target.href),'request = '+quote(options.method||'GET'),'max-time = 15'];
  for(const [name,value] of Object.entries(options.headers||{})){
    if(/[\r\n]/.test(name+value))throw new Error('Invalid cloud header.');
    lines.push('header = '+quote(name+': '+value));
  }
  if(options.body!==undefined)lines.push('data-binary = '+quote(options.body));
  return lines.join('\n')+'\n';
}
export function curlFetch(url,options={}) {
  const config=curlConfiguration(url,options);
  return new Promise((resolve,reject)=>{
    if(options.signal?.aborted){reject(new DOMException('Request aborted','AbortError'));return;}
    const child=spawn('curl',['--silent','--show-error','--config','-','--write-out','\n%{http_code}'],{stdio:['pipe','pipe','pipe']});
    let output='',failed=false;
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>output+=chunk);
    child.stderr.resume();
    const abort=()=>{failed=true;child.kill();reject(new DOMException('Request aborted','AbortError'));};
    options.signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>{failed=true;options.signal?.removeEventListener('abort',abort);reject(new Error('Local cloud transport failed.'));});
    child.on('close',code=>{
      options.signal?.removeEventListener('abort',abort);if(failed)return;
      const match=output.match(/\n(\d{3})$/),status=Number(match?.[1]);
      if(code!==0||!status){reject(new Error('Local cloud transport failed.'));return;}
      resolve(new Response([204,304].includes(status)?null:output.slice(0,match.index),{status,headers:{'Content-Type':'application/json'}}));
    });
    child.stdin.on('error',()=>{});child.stdin.end(config);
  });
}
