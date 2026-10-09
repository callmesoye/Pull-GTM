const blockHost=/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i;
const blockWords=/\b(government|ministry|public university|state university|federal university|public school|civil service|regulator|commission|registry|parliament|municipal|council|national assembly)\b/i;
const strip=value=>String(value??'').trim().replace(/\s+/g,' ');

export function discoveryInput(body) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Enter a search goal.');
  const allowed=['audience','industry','location','source','limit'];
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw new Error('Use the audience, industry, location, and private source fields.');
  const input=Object.fromEntries(allowed.map(key=>[key,strip(body[key])]));
  for(const key of ['audience','industry','location'])if(!input[key]||input[key].length>120)throw new Error('Enter a concise audience, industry, and location.');
  if(input.source.length>120)throw new Error('Keep the source name short.');
  const limit=Number(body.limit||30);
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Choose between 1 and 50 candidates.');
  return {...input,limit};
}

export function privateSourcePage(row) {
  try {
    const url=new URL(row.url);
    if(url.protocol!=='https:'||url.username||url.password||blockHost.test(url.hostname)||/\.(gov|mil|edu)(\.|$)/i.test(url.hostname))return null;
    const title=strip(row.title).slice(0,180),description=strip(row.description).slice(0,420);
    if(!title||blockWords.test(title+' '+description+' '+url.hostname))return null;
    return {title,url:url.href,description,source:url.hostname};
  }catch{return null;}
}

export async function discoverPrivatePages(input,{key,transport=fetch}={}) {
  if(!key)return {configured:false,candidates:[],notice:'Live source search needs a search-provider key. Your imported list and local audience review still work.'};
  const queries=[
    [input.audience,input.industry,input.location,input.source,'private business'].filter(Boolean).join(' '),
    [input.audience,input.industry,input.location,'private company'].filter(Boolean).join(' '),
    [input.industry,input.location,input.audience,'independent business'].filter(Boolean).join(' ')
  ];
  const seen=new Set(),candidates=[];
  for(const q of queries) {
    if(candidates.length>=input.limit)break;
    const endpoint=new URL('https://api.search.brave.com/res/v1/web/search');
    endpoint.searchParams.set('q',q.slice(0,500));
    endpoint.searchParams.set('count','20');
    endpoint.searchParams.set('safesearch','strict');
    const response=await transport(endpoint,{headers:{'X-Subscription-Token':key,'Accept':'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw new Error(response.status===429?'Search limit reached. Try again later.':'Source search is temporarily unavailable.');
    const data=await response.json();
    for(const row of data.web?.results||[]) {
      const candidate=privateSourcePage(row);
      if(candidate&&!seen.has(candidate.url)){seen.add(candidate.url);candidates.push(candidate);}
      if(candidates.length>=input.limit)break;
    }
  }
  return {configured:true,candidates,notice:'These are source pages to review, not verified customers or contact details. Pull does not infer buying intent or invent people. Only private-sector pages are eligible; verify the entity before adding it to your list.'};
}
