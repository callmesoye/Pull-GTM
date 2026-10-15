import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryInput,privateSourcePage,discoverPrivatePages,searchConfiguration,assessSourceRelevance,discoveryQueries} from '../server/discovery.js';
import {personFromSource} from '../server/person-evidence.js';
import {createBackend} from '../server/backend.js';

test('discovery accepts distinct goals and limits results to 50',()=>{
  assert.equal(discoveryInput({audience:'School teachers',industry:'Yam',location:'Ikeja',limit:50}).limit,50);
  assert.equal(discoveryInput({audience:'Founders',industry:'Agriculture',location:'Lagos',source:'Private websites'}).audience,'Founders');
  assert.throws(()=>discoveryInput({audience:'Buyers',industry:'Cars',location:'Lagos',limit:51}));
  assert.throws(()=>discoveryInput({audience:'Government officials',industry:'Cars',location:'Lagos'}));
  assert.throws(()=>discoveryInput({audience:'Buyers',industry:'Cars',location:'Lagos',source:'https://example.gov.ng'}));
});

test('public and government pages are excluded even if search returns them',()=>{
  assert.equal(privateSourcePage({title:'Ministry directory',url:'https://business.gov.ng/list',description:'Companies'}),null);
  assert.equal(privateSourcePage({title:'Public university jobs',url:'https://jobs.example.com',description:'Hiring'}),null);
  assert.equal(privateSourcePage({title:'Teachers in Lagos',url:'https://directory.example.com',description:'Teachers directory'}),null);
  assert.equal(privateSourcePage({title:'Private car dealership',url:'https://dealer.example.com',description:'Used cars in Lagos'}).source,'dealer.example.com');
});

test('source-backed people require an explicit name, role, company, and private-sector evidence',()=>{
  const input=discoveryInput({audience:'Founders',industry:'Agriculture',location:'Lagos'});
  const page=privateSourcePage({title:'Ada Okafor — Founder at Green Acre',url:'https://greenacre.example/team/ada',description:'Ada Okafor leads Green Acre, a private company in Lagos agriculture.'});
  const relevance=assessSourceRelevance(page,input);
  assert.equal(relevance.eligible,true);
  const person=personFromSource(page,relevance);
  assert.equal(person.name,'Ada Okafor');
  assert.equal(person.company,'Green Acre');
  assert.equal(person.identity_status,'source-asserted');
  assert.equal(person.contact_status,'unknown');
  assert.equal(person.source_url,page.url);
  assert.equal(personFromSource({...page,title:'Ada Okafor | Founder | Green Acre'},relevance).company,'Green Acre');
  assert.equal(personFromSource({...page,title:'Ada Okafor | Founder | LinkedIn'},relevance),null);
  assert.equal(personFromSource({...page,source:'linkedin.com'},relevance),null);
  assert.equal(personFromSource({...page,title:'Green Acre agriculture in Lagos'},relevance),null);
  assert.equal(privateSourcePage({title:'Ada Okafor — Founder at Green Acre',url:'https://greenacre.example/team/ada',description:'Agriculture in Lagos'}).private_sector_basis,'commercial-business-context');
});

test('relevance requires a complete industry phrase and reports unproven location',()=>{
  const input=discoveryInput({audience:'Founder',industry:'Real estate',location:'Ikeja, Lagos'});
  const unrelated={title:'Private company real-time founder tools',description:'Based in Lagos',source:'example.com'};
  assert.equal(assessSourceRelevance(unrelated,input).matched.some(item=>item.label==='Industry or need'),false);
  const matching={title:'Private real estate company founder',description:'Based in Lagos',source:'example.com'};
  const assessment=assessSourceRelevance(matching,input);
  assert.equal(assessment.eligible,true);
  assert.ok(assessment.missing.includes('Location'),'Lagos alone does not prove the more specific requested Ikeja location');
  assert.ok(assessment.reason.includes('real, estate'));
});

test('live search ranks topical private sources and returns only explicitly sourced people',async()=>{
  const transport=async()=>Response.json({organic:[
    {title:'Private car dealership',link:'https://cars.example/showroom',snippet:'Used cars in Lagos'},
    {title:'Ada Okafor — Founder at Green Acre',link:'https://greenacre.example/team/ada',snippet:'Ada Okafor leads Green Acre, a private company in Lagos agriculture.'},
    {title:'Federal car registry',link:'https://cars.gov.ng',snippet:'Government registry'}
  ]});
  const result=await discoverPrivatePages(discoveryInput({audience:'Founders',industry:'Agriculture',location:'Lagos'}),{key:'fixture',provider:'serper',maxQueries:1,transport});
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].name,'Ada Okafor');
  assert.equal(result.candidates.length,1);
});

test('source search returns only live source candidates, with no invented people',async()=>{
  let count=0;
  const transport=async()=>{count++;return new Response(JSON.stringify({web:{results:[{title:'Private car dealership',url:'https://dealer.example.com/cars',description:'Used cars in Lagos'},{title:'Federal agency',url:'https://agency.gov.ng',description:'Vehicle registry'}]}}),{status:200});};
  const result=await discoverPrivatePages(discoveryInput({audience:'Car buyers',industry:'Used cars',location:'Lagos',limit:30}),{key:'test',transport});
  assert.equal(count,2);
  assert.equal(result.candidates.length,1);
  assert.match(result.notice,/no named private-sector prospects/i);
  assert.equal(result.diagnostics.providerResults,4);
  assert.equal(result.candidates[0].url,'https://dealer.example.com/cars');
  const unconfigured=await discoverPrivatePages(discoveryInput({audience:'Car buyers',industry:'Used cars',location:'Lagos'}),{transport});
  assert.equal(unconfigured.configured,false);
});

test('cheaper provider selection is explicit and never silently spends a second key',()=>{
  assert.equal(searchConfiguration({SERPER_API_KEY:'serper-test',BRAVE_SEARCH_API_KEY:'brave-test'}).provider,'serper');
  assert.equal(searchConfiguration({PULL_SEARCH_PROVIDER:'brave',SERPER_API_KEY:'serper-test'}),null);
  assert.equal(searchConfiguration({PULL_SEARCH_PROVIDER:'unknown',BRAVE_SEARCH_API_KEY:'test'}),null);
  assert.equal(searchConfiguration({SERPER_API_KEY:'test',PULL_SEARCH_MAX_QUERIES:'99'}).maxQueries,2);
});

test('Serper requests use fixed endpoint and private key header with a strict request budget',async()=>{
  const requests=[];
  const transport=async(url,options)=>{
    requests.push({url:String(url),options});
    return new Response(JSON.stringify({organic:[{title:'Private car dealership',link:'https://dealer.example.com/cars',snippet:'Used cars in Lagos'},{title:'Teachers directory',link:'https://directory.example.com',snippet:'School teachers'}]}));
  };
  const result=await discoverPrivatePages(discoveryInput({audience:'Car buyers',industry:'Used cars',location:'Lagos'}),{key:'secret-example',provider:'serper',maxQueries:1,transport});
  assert.equal(requests.length,1);
  assert.equal(new URL(requests[0].url).origin,'https://google.serper.dev');
  assert.equal(requests[0].options.method,'POST');
  assert.equal(requests[0].options.headers['X-API-KEY'],'secret-example');
  assert.deepEqual(JSON.parse(requests[0].options.body),{q:'Lagos Used cars Car buyers LinkedIn',num:50});
  assert.equal(new URL(requests[0].url).search,'');
  assert.equal(requests[0].options.redirect,'error');
  assert.equal(result.requestsUsed,1);
  assert.equal(result.candidates.length,1);
  assert.equal(JSON.stringify(result).includes('secret-example'),false);
});

test('provider errors do not trigger paid fallback requests',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return new Response('',{status:429});};
  await assert.rejects(discoverPrivatePages(discoveryInput({audience:'Founders',industry:'Agriculture',location:'Lagos'}),{key:'test',provider:'serper',transport}),/limit reached/);
  assert.equal(calls,1);
});

test('a later provider failure preserves already-retrieved people and exposes partial completion',async()=>{
  let calls=0;
  const transport=async()=>++calls===1?Response.json({organic:[{title:'Ada Okafor — Founder at Green Acre',link:'https://greenacre.example/team/ada',snippet:'Agriculture in Lagos'}]}):new Response('',{status:429});
  const result=await discoverPrivatePages(discoveryInput({audience:'Founder',industry:'Agriculture',location:'Lagos'}),{key:'fixture',provider:'serper',transport});
  assert.equal(result.people.length,1);
  assert.equal(result.diagnostics.partial,true);
  assert.equal(result.requestsUsed,2);
  assert.match(result.notice,/available results are shown/);
  assert.equal(calls,2);
});

test('free-plan query restriction uses a different supported query within the original request budget',async()=>{
  const requests=[];
  const transport=async(url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    return requests.length===1?Response.json({message:'Query pattern not allowed for free accounts.',statusCode:400},{status:400}):Response.json({organic:[{title:'Ada Okafor — CEO at Green Soft Ltd | LinkedIn',link:'https://www.linkedin.com/in/ada-okafor',snippet:'Software · Location: New York, USA'}]});
  };
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA',source:'LinkedIn'}),{key:'fixture',provider:'serper',maxQueries:2,transport});
  assert.equal(requests.length,2);
  assert.notEqual(requests[0].q,requests[1].q);
  assert.doesNotMatch(requests[1].q,/site:|\bOR\b|[()"]|private business/);
  assert.equal(requests[1].page,undefined);
  assert.equal(result.people.length,1);
  assert.equal(result.requestsUsed,2);
  assert.equal(result.diagnostics.partial,true);
  assert.deepEqual(result.diagnostics.failedRequests,[{code:'QUERY_RESTRICTED',status:400}]);
});

test('restricted-query fallback preserves the selected-source filter rather than silently expanding targets',async()=>{
  let calls=0;
  const transport=async()=>++calls===1?Response.json({message:'Query pattern not allowed for free accounts.'},{status:400}):Response.json({organic:[{title:'Ada Okafor — CEO at Green Soft Ltd',link:'https://greensoft.example/team/ada',snippet:'Software · Location: New York, USA'}]});
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA',source:'LinkedIn'}),{key:'fixture',provider:'serper',maxQueries:2,transport});
  assert.equal(calls,2);
  assert.equal(result.people.length,0);
  assert.equal(result.diagnostics.missingTargetEvidence,1);
});

test('provider account failures have useful fixed messages, do not leak provider text, and never spend fallback credits',async()=>{
  for(const [status,expected] of [[401,/key was rejected/],[403,/key was rejected/],[402,/no search credits/],[400,/rejected this query/],[429,/limit reached/],[500,/temporarily unavailable/]]){
    let calls=0;
    const transport=async()=>{calls++;return Response.json({message:'secret-fixture-key account specific debug text'},{status});};
    await assert.rejects(discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York'}),{key:'secret-fixture-key',provider:'serper',transport}),error=>{assert.match(error.message,expected);assert.equal(error.message.includes('secret-fixture-key'),false);return true;});
    assert.equal(calls,1);
  }
});

test('when all bounded query alternatives are restricted, the free-plan reason is explicit',async()=>{
  let calls=0;
  const transport=async()=>{calls++;return Response.json({message:'Query pattern not allowed for free accounts. secret-fixture-key'},{status:400});};
  await assert.rejects(discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York'}),{key:'secret-fixture-key',provider:'serper',maxQueries:2,transport}),error=>{assert.equal(error.code,'QUERY_RESTRICTED');assert.match(error.message,/free plan/);assert.equal(error.message.includes('secret-fixture-key'),false);return true;});
  assert.equal(calls,2);
});

test('Serper uses free-account-supported plain queries first and includes real subtitle evidence',async()=>{
  const requests=[];
  const transport=async(url,options)=>{
    requests.push(JSON.parse(options.body));
    return Response.json({organic:[{title:'Ada Okafor — CEO at Green Soft Ltd | LinkedIn',subtitle:'New York, United States · Chief Executive Officer · Green Soft Ltd',link:'https://www.linkedin.com/in/ada-okafor',snippet:'Software company founder building commercial products.'}]});
  };
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA'}),{key:'fixture',provider:'serper',maxQueries:2,transport});
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].country,'United States');
  assert.equal(result.people[0].location,'New York, United States');
  assert.deepEqual(requests.map(request=>request.q),['New York USA Software CEO LinkedIn','New York USA Software CEO leadership']);
  assert.ok(requests.every(request=>!/\bOR\b|site:|[()"]/.test(request.q)));
});

test('CEO queries expand equivalent titles and honor a selected source without forced private keywords',()=>{
  const input=discoveryInput({audience:'CEO, Founder',industry:'Real estate',location:'Lagos',source:'LinkedIn',limit:30});
  const queries=discoveryQueries(input);
  assert.match(queries[0],/"CEO"|"ceo"/i);
  assert.match(queries[0],/chief executive officer/i);
  assert.match(queries[0],/co-founder/);
  assert.match(queries[0],/site:linkedin\.com\/in\//);
  assert.doesNotMatch(queries[0],/private business|private company/);
  assert.throws(()=>discoveryInput({...input,industry:'Government agency'}),/private business/);
  assert.throws(()=>discoveryInput({...input,source:'https://list.ac.uk'}),/private business/);
});

test('realistic indexed LinkedIn evidence becomes a named private-sector prospect without scraping the profile',async()=>{
  const requests=[];
  const transport=async(url,options)=>{
    requests.push({url:String(url),body:JSON.parse(options.body)});
    return Response.json({organic:[
      {title:'Ada Okafor - Chief Executive Officer - Green Acre Ltd | LinkedIn',link:'https://ng.linkedin.com/in/ada-okafor?trk=google',snippet:'Agribusiness executive · Experience: Green Acre Ltd · Location: Lagos, Nigeria'},
      {title:'Ben Smith - Chief Executive Officer - Public Council | LinkedIn',link:'https://www.linkedin.com/in/ben-smith',snippet:'Agribusiness in Lagos, Nigeria'},
      {title:'Chidi Eze - Chief Executive Officer - Green Acre University | LinkedIn',link:'https://www.linkedin.com/in/chidi-eze',snippet:'Agriculture in Lagos, Nigeria'},
      {title:'Dara Bello - Chief Executive Officer - Harvest Partners | LinkedIn',link:'https://www.linkedin.com/in/dara-bello',snippet:'Agribusiness · Location: Abuja, Nigeria'},
      {title:'Ebele Nwosu - Accountant - Harvest Partners | LinkedIn',link:'https://www.linkedin.com/in/ebele-nwosu',snippet:'Agribusiness · Location: Lagos, Nigeria'},
      {title:'Agriculture founders in Lagos',link:'https://news.example/list',snippet:'Ten executives to watch'},
    ]});
  };
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Agriculture',location:'Lagos',source:'LinkedIn',limit:30}),{key:'fixture',provider:'serper',maxQueries:2,transport});
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].name,'Ada Okafor');
  assert.equal(result.people[0].company,'Green Acre Ltd');
  assert.equal(result.people[0].title.toLowerCase(),'chief executive officer');
  assert.equal(result.people[0].profile_url,'https://ng.linkedin.com/in/ada-okafor');
  assert.equal(result.people[0].private_sector_basis,'commercial-business-context');
  assert.equal(result.people[0].contact_status,'public-profile');
  assert.equal(result.returned,1);
  assert.equal(result.requested,30);
  assert.equal(result.diagnostics.providerResults,12);
  assert.ok(result.diagnostics.excludedSectorOrSource>=6);
  assert.ok(result.diagnostics.missingTargetEvidence>=1);
  assert.equal(requests.length,2);
  assert.equal(requests[0].body.num,50);
  assert.equal(requests[1].body.page,2);
  assert.ok(requests.every(request=>new URL(request.url).hostname==='google.serper.dev'));
});

test('a role alone never establishes private-sector status, and named institutional profiles stay excluded',()=>{
  const row={title:'Ada Okafor - CEO - Harvest Partners | LinkedIn',url:'https://www.linkedin.com/in/ada-okafor',description:'Location: Lagos'};
  assert.equal(privateSourcePage(row),null);
  assert.equal(privateSourcePage({...row,title:'Ada Okafor - Founder - Green Academy | LinkedIn',description:'Software and technology in Lagos'}),null);
  assert.ok(privateSourcePage({...row,title:'Ada Okafor - Founder - Green Academy | LinkedIn',description:'A private school in Lagos'}));
  assert.equal(privateSourcePage({...row,title:'Ada Okafor - CEO - Harvest Partners | LinkedIn',description:'Agribusiness in Lagos; government-owned company'}),null);
});

test('discovery never fabricates a requested result count or buying signals',async()=>{
  const transport=async()=>Response.json({organic:[{title:'Ada Okafor — Founder at Green Acre',link:'https://greenacre.example/team/ada',snippet:'Agriculture in Lagos'}]});
  const result=await discoverPrivatePages(discoveryInput({audience:'Founder',industry:'Agriculture',location:'Lagos',limit:30}),{key:'fixture',provider:'serper',transport});
  assert.equal(result.people.length,1);
  assert.equal(result.returned,1);
  assert.equal(result.people[0].signal,undefined);
  assert.equal(result.people[0].email,undefined);
  assert.equal(result.people[0].identity_status,'source-asserted');
});

test('search supports indexed X, Instagram, Facebook, websites and published email evidence',async()=>{
  const rows=[
    {title:'Ada Okafor (@adaokafor) / X',link:'https://x.com/adaokafor',snippet:'CEO at Green Acre Ltd · Real estate in Lagos · Contact ada@greenacre.example'},
    {title:'Ben Smith (@bensmith) • Instagram photos and videos',link:'https://www.instagram.com/bensmith/',snippet:'CEO at Green Homes Ltd · Real estate in Lagos'},
    {title:'Chidi Eze - CEO at Green Tower Ltd | Facebook',link:'https://www.facebook.com/chidieze',snippet:'Real estate developer in Lagos'},
    {title:'Dara Bello — CEO at Green Lands Ltd',link:'https://greenlands.example/team/dara',snippet:'Dara Bello is CEO at Green Lands Ltd. Real estate in Lagos. Email dara@greenlands.example'},
  ];
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Real estate',location:'Lagos',limit:30}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:rows})});
  assert.equal(result.people.length,4);
  assert.equal(result.people.find(person=>person.name==='Ada Okafor').x_url,'https://x.com/adaokafor');
  assert.equal(result.people.find(person=>person.name==='Ada Okafor').email,'ada@greenacre.example');
  assert.equal(result.people.find(person=>person.name==='Ben Smith').instagram_url,'https://www.instagram.com/bensmith/');
  assert.equal(result.people.find(person=>person.name==='Chidi Eze').facebook_url,'https://www.facebook.com/chidieze');
  assert.equal(result.people.find(person=>person.name==='Dara Bello').email,'dara@greenlands.example');
  for(const [source,domain] of [['X','x.com'],['Instagram','instagram.com'],['Facebook','facebook.com']])assert.ok(discoveryQueries({audience:'CEO',industry:'Real estate',location:'Lagos',source})[0].includes('site:'+domain));
  assert.ok(discoveryQueries({audience:'CEO',industry:'Real estate',location:'Lagos',source:'email'})[0].includes('"email" OR "contact"'));
  assert.equal(discoveryQueries({audience:'CEO',industry:'Real estate',location:'Lagos',source:'business websites'})[0],discoveryQueries({audience:'CEO',industry:'Real estate',location:'Lagos',source:''})[0]);
});

test('city plus country cannot turn a different city into a requested location match',()=>{
  const input=discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA'});
  const page={title:'Ada Okafor — CEO at Green Soft Ltd',description:'Software company in San Francisco, United States',source:'greensoft.example'};
  assert.ok(assessSourceRelevance(page,input).missing.includes('Location'));
  assert.equal(assessSourceRelevance({...page,description:'Software company in NYC'},input).missing.includes('Location'),true,'The requested country must also be present');
  assert.equal(assessSourceRelevance({...page,description:'Software company in NYC, United States'},input).missing.includes('Location'),false);
  assert.equal(assessSourceRelevance({...page,description:'Software company in the United Kingdom'},{...input,location:'UK'}).missing.includes('Location'),false);
});

test('CEO search rejects a CFO whose source excerpt mentions the CEO and retains source-stated geography',async()=>{
  const rows=[
    {title:'Ada Okafor - CFO at Green Soft Ltd | LinkedIn',link:'https://www.linkedin.com/in/ada-okafor',snippet:'Software executive, partnering with the CEO · Location: Lagos, Nigeria'},
    {title:'Ben Smith - CEO at Green Soft Ltd | LinkedIn',link:'https://www.linkedin.com/in/ben-smith',snippet:'Software executive · Location: Lagos, Nigeria'},
    {title:'Chidi Eze - CEO at Green Tower Ltd | LinkedIn',link:'https://www.linkedin.com/in/chidi-eze',snippet:'Software executive · Location: Lagos de Moreno, Mexico'},
    {title:'Dara Bello - CEO at Green Tower Ltd | LinkedIn',link:'https://www.linkedin.com/in/dara-bello',snippet:'Software executive · Location: Lagos de Moreno, Mexico. Does business in Nigeria'},
  ];
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'Lagos, Nigeria'}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:rows})});
  assert.deepEqual(result.people.map(person=>person.name),['Ben Smith']);
  assert.equal(result.people[0].location,'Lagos, Nigeria');
  assert.equal(result.people[0].country,'Nigeria');
  assert.equal(result.people[0].industry,'Software');
  assert.equal(result.people[0].signal,undefined);
  assert.equal(result.diagnostics.missingTargetEvidence,3);
});

test('country aliases retain the source phrase, while explicit conflicting countries remain excluded',()=>{
  const input=discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA'});
  const page={title:'Ben Smith — CEO at Green Soft Ltd',url:'https://greensoft.example/team/ben',description:'Software · Location: NYC, US · Education: College in Nigeria',source:'greensoft.example'};
  const assessment=assessSourceRelevance(page,input);
  assert.equal(assessment.missing.includes('Location'),false);
  assert.equal(assessment.geography.location,'NYC, US');
  assert.equal(assessment.geography.country,'US');
  assert.equal(assessSourceRelevance({...page,description:'Software · Location: New York, Mexico'},input).missing.includes('Location'),true);
  assert.equal(assessSourceRelevance({...page,description:'Software company works with us in New York'},input).missing.includes('Location'),true,'Lowercase pronoun us does not prove US');
});

test('educational history neither converts a private executive into a public target nor supplies professional geography or industry',async()=>{
  const row={title:'Ada Okafor - CEO at Green Soft Ltd | LinkedIn',link:'https://www.linkedin.com/in/ada-okafor',snippet:'Software · Location: Lagos, Nigeria · Education: Federal University in United States'};
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'Lagos, Nigeria'}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:[row]})});
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].country,'Nigeria');
  const page={title:row.title,url:row.link,description:'Location: New York · Education: Software engineering at a university in United States',source:'www.linkedin.com'};
  const assessment=assessSourceRelevance(page,{audience:'CEO',industry:'Software',location:'New York, USA',source:''});
  assert.ok(assessment.missing.includes('Industry or need'));
  assert.ok(assessment.missing.includes('Location'));
});

test('paid search requires a verified owner and a successful database budget claim',async()=>{
  const input={audience:'Car buyers',industry:'Used cars',location:'Lagos'};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SERPER_API_KEY:'private-test-key'};
  for(const [budget,expected] of [[{data:true,error:null},200],[{data:false,error:null},429],[{data:null,error:{message:'offline'}},503]]){
    let searches=0,claims=0;
    const clientFactory=()=>({auth:{getUser:async()=>({data:{user:{id:'owner',is_anonymous:false}},error:null})},rpc:async(name,args)=>{assert.equal(name,'claim_pull_search_requests');assert.deepEqual(args,{p_requests:2});claims++;return budget;}});
    const backend=createBackend({env,clientFactory,transport:async()=>{searches++;return Response.json({organic:[]});}});
    const request=account=>new Request('https://pull.example/api/discovery',{method:'POST',headers:{'content-type':'application/json',origin:'https://pull.example',cookie:'__Host-pull-access=test','x-pull-account':account},body:JSON.stringify(input)});
    assert.equal((await backend.discovery(request('wrong-account'))).status,409);
    assert.equal(claims,0);
    assert.equal((await backend.discovery(request('owner'))).status,expected);
    assert.equal(claims,1);
    assert.equal(searches,expected===200?2:0);
    const status=await (await backend.discovery(new Request('https://pull.example/api/discovery'))).text();
    assert.equal(status.includes('private-test-key'),false);
  }
});

const goalNames=['Ada Okafor','Ben Smith','Chidi Eze','Dara Bello','Ebele Nwosu','Farah Khan','Grace Cole','Hassan Musa','Ifeoma Obi','James Stone','Kemi Adeyemi','Lara Green'];
const goalRow=(index,overrides={})=>({title:`${goalNames[index]} - CEO at Green Soft Ltd | LinkedIn`,link:`https://www.linkedin.com/in/goal-${index}`,snippet:'Private software company · Location: Lagos, Nigeria',...overrides});
const goalInput=overrides=>discoveryInput({audience:'CEO',industry:'Software',location:'Lagos, Nigeria',source:'LinkedIn',limit:3,...overrides});

test('requested lead count drives overfetch and stops requests once enough fully matching people exist',async()=>{
  const requests=[];
  const rows=[
    goalRow(0,{title:'Private software company CEOs in Lagos'}),
    goalRow(1,{snippet:'Private software company · Location: Abuja, Nigeria'}),
    goalRow(2,{title:'Chidi Eze - CFO at Green Soft Ltd | LinkedIn'}),
    goalRow(3),goalRow(4),goalRow(5)
  ];
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:3,transport:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({organic:rows});}});
  assert.equal(requests.length,1,'raw noise does not count toward progress; three matching named people do');
  assert.equal(requests[0].num,10,'small targets still overfetch enough raw results for filtering');
  assert.equal(result.people.length,3);
  assert.deepEqual(result.target,{requested:3,returned:3,remaining:0,status:'complete',reason:'target_reached',canContinue:false});
  assert.deepEqual(new Set(result.people.map(person=>person.name)),new Set(goalNames.slice(3,6)));
});

test('selected-source pagination finds the remaining people and does not count duplicate identities as progress',async()=>{
  const requests=[];
  const pages=[
    [goalRow(0),goalRow(1,{snippet:'Private software company · Location: Abuja, Nigeria'})],
    [goalRow(0,{link:'https://linkedin.com/in/GOAL-0/'}),goalRow(2)],
    [goalRow(3)]
  ];
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:3,transport:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({organic:pages[requests.length-1]});}});
  assert.equal(result.returned,3);
  assert.equal(result.target.status,'complete');
  assert.deepEqual(requests.map(request=>request.page||1),[1,2,3]);
  assert.equal(new Set(requests.map(request=>request.q)).size,1);
  assert.equal(new Set(requests.map(request=>request.num)).size,1,'the provider page size remains stable');
  assert.equal(result.diagnostics.duplicatePeople,1);
  assert.equal(result.diagnostics.missingTargetEvidence,1);
});

test('Brave paginates full noisy result pages within its cap and stops immediately on the target',async()=>{
  const requests=[];
  const noise=Array.from({length:19},(_,index)=>({title:'Private software company',url:`https://software.example/noise-${index}`,description:'Software products in Lagos, Nigeria'}));
  const first=[{...goalRow(0),url:goalRow(0).link,description:goalRow(0).snippet},...noise];
  const second=Array.from({length:9},(_,index)=>({...goalRow(index+1),url:goalRow(index+1).link,description:goalRow(index+1).snippet}));
  const result=await discoverPrivatePages(goalInput({source:'',limit:10}),{key:'fixture',provider:'brave',maxQueries:3,transport:async url=>{const parsed=new URL(url);requests.push(parsed);return Response.json({web:{results:requests.length===1?first:second}});}});
  assert.equal(result.returned,10);
  assert.equal(requests.length,2);
  assert.deepEqual(requests.map(url=>url.searchParams.get('count')),['20','20']);
  assert.deepEqual(requests.map(url=>url.searchParams.get('offset')||'0'),['0','1']);
  assert.equal(requests[0].searchParams.get('q'),requests[1].searchParams.get('q'));
  assert.equal(result.target.reason,'target_reached');
});

test('a large target uses bounded Serper overfetch and reports an honest shortfall at the exact request ceiling',async()=>{
  for(const maxQueries of [1,2,3]){
    const requests=[];
    const result=await discoverPrivatePages(goalInput({limit:30}),{key:'fixture',provider:'serper',maxQueries,transport:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({organic:[goalRow(requests.length-1)]});}});
    assert.equal(requests.length,maxQueries);
    assert.ok(requests.every(request=>request.num===50));
    assert.equal(result.returned,maxQueries);
    assert.deepEqual(result.target,{requested:30,returned:maxQueries,remaining:30-maxQueries,status:'partial',reason:'request_budget_reached',canContinue:true});
    assert.match(result.notice,new RegExp(`${30-maxQueries} still needed with the original filters`));
  }
});

test('empty selected sources stop without spending the rest of the budget and report exhaustion',async()=>{
  let calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:3,transport:async()=>{calls++;return Response.json({organic:[]});}});
  assert.equal(calls,1);
  assert.deepEqual(result.target,{requested:3,returned:0,remaining:3,status:'empty',reason:'source_exhausted',canContinue:false});
  assert.match(result.notice,/no named private-sector prospects/);
});

test('broad searches use distinct alternatives rather than repeating an identical first page',async()=>{
  const requests=[];
  const result=await discoverPrivatePages(goalInput({source:''}),{key:'fixture',provider:'serper',maxQueries:3,transport:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({organic:[goalRow(0)]});}});
  assert.equal(requests.length,3);
  assert.equal(new Set(requests.map(request=>request.q)).size,3);
  assert.ok(requests.every(request=>!request.page));
  assert.equal(result.returned,1);
  assert.equal(result.target.remaining,2);
});

test('each selected source gets its own query and pagination state',async()=>{
  const requests=[];
  const rows=[goalRow(0),goalRow(1,{link:'https://x.com/ben-smith'}),goalRow(2)];
  const result=await discoverPrivatePages(goalInput({source:'LinkedIn, X'}),{key:'fixture',provider:'serper',maxQueries:3,transport:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({organic:[rows[requests.length-1]]});}});
  assert.equal(result.returned,3);
  assert.match(requests[0].q,/linkedin/i);
  assert.match(requests[1].q,/\bX\b/);
  assert.equal(requests[0].page,undefined);
  assert.equal(requests[1].page,undefined);
  assert.equal(requests[2].q,requests[0].q);
  assert.equal(requests[2].page,2);
});

test('selected-source hostname and path checks reject spoofed source URLs',async()=>{
  const input=goalInput(),valid={title:goalRow(0).title,description:goalRow(0).snippet,source:'private.example'};
  for(const url of ['https://linkedin.com.private.example/in/ada','https://notlinkedin.com/in/ada','https://private.example/linkedin.com/in/ada','https://private.example/?next=https://linkedin.com/in/ada','https://www.linkedin.com/inside/ada','https://www.linkedin.com/company/ada?next=linkedin.com/in/ada']){
    assert.ok(assessSourceRelevance({...valid,url},input).missing.includes('Preferred source'),url);
  }
  assert.equal(assessSourceRelevance({...valid,url:'https://ng.linkedin.com/in/ada'},input).missing.includes('Preferred source'),false);
  const result=await discoverPrivatePages(input,{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:[goalRow(0,{link:'https://linkedin.com.private.example/in/ada'})]})});
  assert.equal(result.returned,0);
  assert.equal(result.diagnostics.missingTargetEvidence,1);
});

test('late provider failure reports the actual stop cause while preserving the requested remainder',async()=>{
  let calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:3,transport:async()=>++calls===1?Response.json({organic:[goalRow(0)]}):new Response('',{status:429})});
  assert.equal(calls,2);
  assert.equal(result.target.reason,'provider_unavailable');
  assert.equal(result.target.status,'partial');
  assert.equal(result.target.remaining,2);
  assert.equal(result.target.canContinue,true);
  assert.equal(result.people[0].name,'Ada Okafor');
});

test('Brave explicit exhaustion metadata ends pagination without suggesting more available pages',async()=>{
  let calls=0;
  const row=goalRow(0);
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'brave',maxQueries:3,transport:async()=>{calls++;return Response.json({query:{more_results_available:false},web:{results:[{title:row.title,url:row.link,description:row.snippet}]}});}});
  assert.equal(calls,1);
  assert.equal(result.target.reason,'source_exhausted');
  assert.equal(result.target.canContinue,false);
  assert.equal(result.target.remaining,2);
});

test('a rejected source query followed by an empty fallback does not claim the selected source was exhausted',async()=>{
  let calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:3,transport:async()=>++calls===1?Response.json({message:'Query pattern not allowed for free accounts.'},{status:400}):Response.json({organic:[]})});
  assert.equal(calls,2);
  assert.equal(result.target.status,'empty');
  assert.equal(result.target.reason,'provider_unavailable');
  assert.equal(result.target.canContinue,true);
});

test('same-name coworkers at the same employer with distinct LinkedIn profiles each count toward the target',async()=>{
  let calls=0;
  const rows=[goalRow(0,{link:'https://www.linkedin.com/in/ada-east'}),goalRow(0,{link:'https://www.linkedin.com/in/ada-west'})];
  const result=await discoverPrivatePages(goalInput({limit:2}),{key:'fixture',provider:'serper',maxQueries:3,transport:async()=>{calls++;return Response.json({organic:rows});}});
  assert.equal(calls,1);
  assert.equal(result.returned,2);
  assert.equal(result.target.status,'complete');
  assert.equal(new Set(result.people.map(person=>person.profile_url)).size,2);
  assert.equal(result.diagnostics.duplicatePeople,0);
});

test('a shared canonical profile never inflates the count and registers names from duplicate source evidence',async()=>{
  const rows=[
    goalRow(0),
    goalRow(1,{link:'https://linkedin.com/in/GOAL-0/'}),
    goalRow(1,{link:'https://greensoft.example/team/ben'}),
    goalRow(2)
  ];
  const result=await discoverPrivatePages(goalInput({source:'',limit:2}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:rows})});
  assert.equal(result.returned,2);
  assert.deepEqual(new Set(result.people.map(person=>person.name)),new Set(['Ada Okafor','Chidi Eze']));
  assert.equal(result.diagnostics.duplicatePeople,2);
  assert.equal(result.target.status,'complete');
});

test('no-profile evidence cannot add or choose an identity when multiple same-name coworkers are known',async()=>{
  const rows=[
    goalRow(0,{link:'https://greensoft.example/team/ada'}),
    goalRow(0),
    goalRow(0,{link:'https://www.linkedin.com/in/another-ada'}),
    goalRow(0,{link:'https://greensoft.example/about/ada'})
  ];
  const result=await discoverPrivatePages(goalInput({source:'',limit:3}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:rows})});
  assert.equal(result.returned,2);
  assert.equal(result.target.remaining,1);
  assert.equal(result.diagnostics.duplicatePeople,1,'the first profile enriches the unique earlier name match');
  assert.equal(result.diagnostics.ambiguousIdentity,1,'later profile-free evidence cannot prove a third unique person');
});
