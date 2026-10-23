import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {createHash} from 'node:crypto';
import {observeBuyerRequest} from './buyer-assessment.js';

const blockedPlatforms=['jiji.ng','instagram.com','facebook.com','linkedin.com','twitter.com','x.com','tiktok.com'];
const hostPattern=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export function approvedSourceHosts(value=''){
  const hosts=[...new Set(value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean))];
  if(hosts.length>20||hosts.some(h=>!hostPattern.test(h)||blockedPlatforms.some(p=>h===p||h.endsWith('.'+p))||/(^|\.)(gov|gouv|gc|go|edu|ac|mil)(\.|$)/.test(h)))throw new Error('Invalid approved source hosts.');
  return hosts;
}
export function publicIPv4(address){
  if(typeof address!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(address))return false;
  const [a,b,c,d]=address.split('.').map(Number);
  if([a,b,c,d].some(v=>v>255))return false;
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31
    ||a===100&&b>=64&&b<=127||a===192&&(b===168||b===0||b===88&&c===99)
    ||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
function approvedURL(value,hosts){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!hosts.includes(url.hostname)||!hostPattern.test(url.hostname))throw new Error('Source is not approved for direct access.');
  url.hash='';return url;
}
// The DNS result is pinned into the TLS connection's lookup callback. The
// default transport never resolves the hostname a second time after validation.
export async function readApprovedPage(value,{hosts,resolve=lookup,request=httpsRequest,maxBytes=262144,timeLimitMs=6000}={}){
  if(!Array.isArray(hosts)||!hosts.length)throw new Error('No source has direct-access approval.');
  approvedSourceHosts(hosts.join(','));
  let url=approvedURL(value,hosts);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeLimitMs);
  try{
    for(let redirects=0;redirects<=2;redirects++){
      const records=await Promise.race([
        resolve(url.hostname,{all:true,family:4}),
        new Promise((_,reject)=>{if(controller.signal.aborted)reject(new Error('Source check timed out.'));else controller.signal.addEventListener('abort',()=>reject(new Error('Source check timed out.')),{once:true});})
      ]);
      if(controller.signal.aborted||!Array.isArray(records)||!records.length||records.some(r=>r.family!==4||!publicIPv4(r.address)))throw new Error('Source address is not public.');
      const address=records[0].address;
      const page=await new Promise((resolvePage,reject)=>{
        const req=request(url,{method:'GET',signal:controller.signal,servername:url.hostname,
          lookup:(_host,options,callback)=>{if(typeof options==='function'){callback=options;options={};}callback(null,options?.all?[{address,family:4}]:address,4);},
          headers:{Accept:'text/html,text/plain','Accept-Encoding':'identity','User-Agent':'PullGTM-SourceCheck/1.0'}},res=>{
          if([301,302,303,307,308].includes(res.statusCode)){const location=res.headers.location;res.destroy();resolvePage({redirect:location});return;}
          const type=res.headers['content-type']||'';
          if(res.statusCode!==200||!/^text\/(html|plain)(?:;|$)/i.test(type)||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'||Number(res.headers['content-length'])>maxBytes){res.destroy();reject(new Error('Source cannot be checked.'));return;}
          let bytes=0;const chunks=[];
          res.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){res.destroy();reject(new Error('Source page exceeds the check limit.'));}else chunks.push(chunk);});
          res.on('error',reject);res.on('aborted',()=>reject(new Error('Source response interrupted.')));
          res.on('end',()=>resolvePage({html:Buffer.concat(chunks).toString('utf8'),type,url:url.href}));
        });
        req.on('error',reject);req.end();
      });
      if(!Object.hasOwn(page,'redirect'))return page;
      if(!page.redirect||redirects===2)throw new Error('Source redirect limit reached.');
      url=approvedURL(new URL(page.redirect,url).href,hosts);
    }
    throw new Error('Source unavailable.');
  }finally{clearTimeout(timer);controller.abort();}
}
function pageText(html,type){
  const text=/^text\/html/i.test(type)?html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' '):html;
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,(match,decimal,hex,name)=>{
    if(decimal||hex){const n=parseInt(decimal||hex,hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name.toLowerCase()]||match;
  }).normalize('NFKC').replace(/\s+/g,' ').trim();
}
const words=s=>s.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
export async function checkBuyerSource(candidate,offer,{hosts,reader=readApprovedPage,now=()=>new Date()}={}){
  let url;
  try{url=approvedURL(candidate.source_url,hosts);}
  catch{return {state:'not_approved',originalChecked:false};}
  try{
    const page=await reader(url.href,{hosts}),text=pageText(page.html,page.type);
    if(!text)return {state:'empty_page',originalChecked:false};
    const normalized=' '+words(text)+' ';
    const exactTermsPresent=offer.exactTerms.every(term=>normalized.includes(' '+words(term)+' '));
    const excerpt=words(candidate.source_excerpt||'');
    return {state:'page_opened',originalChecked:true,finalUrl:page.url,checkedAt:now().toISOString(),
      contentHash:createHash('sha256').update(text).digest('hex'),exactTermsPresent,
      excerptPresent:excerpt.length>=20?normalized.includes(' '+excerpt+' '):null,
      assessment:observeBuyerRequest(text,offer),
      buyerConfirmed:false,notice:'Original page opened. Author, current buying need, selling terms and contact permission still need verification.'};
  }catch{return {state:'unavailable',originalChecked:false};}
}
