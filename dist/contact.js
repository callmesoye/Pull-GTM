const socialFields=[
  ['profile_url','Profile'],['linkedin_url','LinkedIn'],['x_url','X'],
  ['instagram_url','Instagram'],['facebook_url','Facebook'],['jiji_url','Jiji'],
  ['website_url','Website']
];
const blockedHost=/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i;

function externalUrl(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:'||url.username||url.password||blockedHost.test(url.hostname)||/\.(gov|mil|edu)(\.|$)/i.test(url.hostname))return '';
    return url.href;
  }catch{return '';}
}
const allowedHosts={linkedin_url:['linkedin.com'],x_url:['x.com','twitter.com'],instagram_url:['instagram.com'],facebook_url:['facebook.com','fb.com'],jiji_url:['jiji.ng']};
export function validContactUrl(field,value){
  const url=externalUrl(value);if(!url)return '';
  const allowed=allowedHosts[field];
  if(allowed&&!allowed.some(host=>new URL(url).hostname===host||new URL(url).hostname.endsWith('.'+host)))return '';
  return url;
}
function platform(url,hint){
  const host=new URL(url).hostname.replace(/^www\./,'');
  if(host==='linkedin.com')return 'LinkedIn';
  if(host==='x.com'||host==='twitter.com')return 'X';
  if(host==='instagram.com')return 'Instagram';
  if(host==='facebook.com'||host==='fb.com')return 'Facebook';
  if(host==='jiji.ng')return 'Jiji';
  return hint;
}
export function displayIdentity(prospect){
  if(prospect.name?.trim())return prospect.name.trim();
  if(prospect.company?.trim())return prospect.company.trim();
  if(prospect.email?.trim())return prospect.email.trim();
  for(const [field,hint] of socialFields){
    const url=validContactUrl(field,prospect[field]);if(!url)continue;
    const label=platform(url,hint),part=new URL(url).pathname.split('/').filter(Boolean).at(-1);
    return part&&part.length<=40?`${label}: ${part}`:`${label} profile`;
  }
  return 'Identity missing';
}
export function contactOptions(prospect){
  if(prospect.suppressed||prospect.origin==='example')return [];
  const options=[],seen=new Set();
  const email=String(prospect.email||'').trim();
  if(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))options.push({label:'Write email',url:`mailto:${email}`,channel:'email'});
  for(const [field,hint] of socialFields){
    const url=validContactUrl(field,prospect[field]);if(!url||seen.has(url))continue;
    seen.add(url);
    const label=platform(url,hint);
    options.push({label:label==='Website'?'Open business website':label==='Jiji'?'Open Jiji listing':`Open ${label} profile`,url,channel:label.toLowerCase()});
  }
  return options;
}
