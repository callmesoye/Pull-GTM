const blockHost=/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i;
const blockWords=/\b(government|ministry|public university|state university|federal university|public school|public institution|state-owned|government-owned|civil service|regulator|commission|registry|parliament|municipal|council|national assembly)\b/i;
const privateEvidence=/\b(privately[- ]owned|private[- ]sector|private (business|company|companies|school|schools|clinic|hospital|practice|car dealership|dealership|agency)|independent (business|professional|consultant|trader)|self[- ]employed|sole proprietor)\b/i;
const strip=value=>String(value??'').trim().replace(/\s+/g,' ');

export function searchConfiguration(env=process.env) {
  const provider=env.PULL_SEARCH_PROVIDER||(env.SERPER_API_KEY?'serper':'brave');
  if(!['serper','brave'].includes(provider))return null;
  const key=strip(provider==='serper'?env.SERPER_API_KEY:env.BRAVE_SEARCH_API_KEY);
  if(!key)return null;
  const requested=Number(env.PULL_SEARCH_MAX_QUERIES||2);
  return {provider,key,maxQueries:Number.isInteger(requested)&&requested>=1&&requested<=3?requested:2};
}

export function discoveryInput(body) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Enter a search goal.');
  const allowed=['audience','industry','location','source','limit'];
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw new Error('Use the audience, industry, location, and private source fields.');
  const input=Object.fromEntries(allowed.map(key=>[key,strip(body[key])]));
  for(const key of ['audience','industry','location'])if(!input[key]||input[key].length>120)throw new Error('Enter a concise audience, industry, and location.');
  if(input.source.length>120)throw new Error('Keep the source name short.');
  if(blockWords.test([input.audience,input.source].join(' '))||/(^|[/.])(gov|gouv|mil|edu)(\.|\/|$)/i.test(input.source))throw new Error('Choose a private business, independent professional, or private-sector opportunity.');
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
    if(!privateEvidence.test(title+' '+description))return null;
    return {title,url:url.href,description,source:url.hostname};
  }catch{return null;}
}

export async function discoverPrivatePages(input,{key,provider='brave',maxQueries=2,transport=fetch}={}) {
  if(!key)return {configured:false,candidates:[],notice:'Live source search needs a search-provider key. Your imported list and local audience review still work.'};
  if(!['brave','serper'].includes(provider))throw new Error('Choose a supported search provider in the server settings.');
  if(!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>3)throw new Error('Choose a request budget between 1 and 3.');
  const queries=[
    [input.audience,input.industry,input.location,input.source,'private business'].filter(Boolean).join(' '),
    [input.audience,input.industry,input.location,'private company'].filter(Boolean).join(' '),
    [input.industry,input.location,input.audience,'independent business'].filter(Boolean).join(' ')
  ];
  const seen=new Set(),candidates=[];
  let requestsUsed=0;
  for(const q of queries.slice(0,maxQueries)) {
    if(candidates.length>=input.limit)break;
    const endpoint=new URL(provider==='serper'?'https://google.serper.dev/search':'https://api.search.brave.com/res/v1/web/search');
    endpoint.searchParams.set('q',q.slice(0,500));
    endpoint.searchParams.set(provider==='serper'?'num':'count',String(Math.min(input.limit,20)));
    if(provider==='brave')endpoint.searchParams.set('safesearch','strict');
    const headers=provider==='serper'?{'X-API-KEY':key,'Content-Type':'application/json','Accept':'application/json'}:{'X-Subscription-Token':key,'Accept':'application/json'};
    requestsUsed++;
    const response=await transport(endpoint,{method:provider==='serper'?'POST':'GET',headers,signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw new Error(response.status===429?'Search limit reached. Try again later.':'Source search is temporarily unavailable.');
    const data=await response.json();
    const rawRows=provider==='serper'?data?.organic:data?.web?.results;
    if(rawRows!==undefined&&!Array.isArray(rawRows))throw new Error('The search provider returned an unexpected result.');
    const rows=provider==='serper'?(rawRows||[]).map(row=>({title:row?.title,url:row?.link,description:row?.snippet})):rawRows||[];
    for(const row of rows) {
      const candidate=privateSourcePage(row);
      if(candidate&&!seen.has(candidate.url)){seen.add(candidate.url);candidates.push(candidate);}
      if(candidates.length>=input.limit)break;
    }
  }
  return {configured:true,provider,requestsUsed,candidates,notice:'These are source pages to review, not verified customers or contact details. Pull does not infer buying intent or invent people. Pages without explicit private-sector wording are excluded pending verification. Check the source and entity before adding it to your list. A smaller list is returned when the request budget or eligible evidence is exhausted.'};
}
