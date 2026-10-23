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
  const result=await discoverPrivatePages(discoveryInput({audience:'Car buyers',industry:'Used cars',location:'Lagos',limit:30}),{key:'test',maxQueries:2,transport});
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
  assert.equal(searchConfiguration({SERPER_API_KEY:'test',PULL_SEARCH_MAX_QUERIES:'99'}).maxQueries,8);
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
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA',source:'LinkedIn'}),{key:'fixture',provider:'serper',queryMode:'auto',maxQueries:2,transport});
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
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA',source:'LinkedIn'}),{key:'fixture',provider:'serper',queryMode:'auto',maxQueries:2,transport});
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
  await assert.rejects(discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York'}),{key:'secret-fixture-key',provider:'serper',queryMode:'auto',maxQueries:2,transport}),error=>{assert.equal(error.code,'QUERY_RESTRICTED');assert.match(error.message,/free plan/);assert.equal(error.message.includes('secret-fixture-key'),false);return true;});
  assert.equal(calls,2);
});

test('Serper tries source-restricted simple queries and includes real subtitle evidence',async()=>{
  const requests=[];
  const transport=async(url,options)=>{
    requests.push(JSON.parse(options.body));
    return Response.json({organic:[{title:'Ada Okafor — CEO at Green Soft Ltd | LinkedIn',subtitle:'New York, United States · Chief Executive Officer · Green Soft Ltd',link:'https://www.linkedin.com/in/ada-okafor',snippet:'Software company founder building commercial products.'}]});
  };
  const result=await discoverPrivatePages(discoveryInput({audience:'CEO',industry:'Software',location:'New York, USA'}),{key:'fixture',provider:'serper',queryMode:'auto',maxQueries:2,transport});
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].country,'United States');
  assert.equal(result.people[0].location,'New York, United States');
  assert.deepEqual(requests.map(request=>request.q),['New York USA Software CEO site:linkedin.com/in/','New York USA Software CEO leadership site:linkedin.com/in/']);
  assert.ok(requests.every(request=>!/\bOR\b|[()"]/.test(request.q)));
  assert.ok(requests.every(request=>request.q.includes('site:linkedin.com/in/')));
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
  assert.ok(result.diagnostics.excludedSectorOrSource>=4);
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
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SERPER_API_KEY:'private-test-key',PULL_SEARCH_MAX_QUERIES:'2'};
  for(const [budget,expected] of [[{data:true,error:null},200],[{data:false,error:null},429],[{data:null,error:{message:'offline'}},503]]){
    let searches=0,claims=0;
    const clientFactory=()=>({auth:{getUser:async()=>({data:{user:{id:'owner',is_anonymous:false}},error:null})},rpc:async(name,args)=>{assert.equal(name,'claim_pull_search_requests');assert.deepEqual(args,{p_requests:1});claims++;return budget;}});
    const backend=createBackend({env,clientFactory,transport:async()=>{searches++;return Response.json({organic:[]});}});
    const request=account=>new Request('https://pull.example/api/discovery',{method:'POST',headers:{'content-type':'application/json',origin:'https://pull.example',cookie:'__Host-pull-access=test','x-pull-account':account},body:JSON.stringify(input)});
    assert.equal((await backend.discovery(request('wrong-account'))).status,409);
    assert.equal(claims,0);
    assert.equal((await backend.discovery(request('owner'))).status,expected);
    assert.equal(claims,expected===200?2:1);
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

test('an empty selected-source query tries equivalent vocabulary before reporting exhaustion',async()=>{
  let calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:8,transport:async()=>{calls++;return Response.json({organic:[]});}});
  assert.equal(calls,6,'equivalent titles and industries each get a bounded turn');
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
  assert.match(requests[1].q,/\bX\b/i);
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

test('Brave exhaustion metadata ends the query page while equivalent source queries still get a turn',async()=>{
  let calls=0;
  const row=goalRow(0);
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'brave',maxQueries:3,transport:async()=>{calls++;return Response.json({query:{more_results_available:false},web:{results:[{title:row.title,url:row.link,description:row.snippet}]}});}});
  assert.equal(calls,3);
  assert.equal(result.target.reason,'request_budget_reached');
  assert.equal(result.target.canContinue,true);
  assert.equal(result.target.remaining,2);
});

test('a rejected source query followed by an empty fallback does not claim the selected source was exhausted',async()=>{
  let calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:3,transport:async()=>++calls===1?Response.json({message:'Query pattern not allowed for free accounts.'},{status:400}):Response.json({organic:[]})});
  assert.equal(calls,3);
  assert.equal(result.target.status,'empty');
  assert.equal(result.target.reason,'request_budget_reached');
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


test('discovery uses shared public-employer and source exclusions before commercial or private claims',()=>{
  for(const [company,url] of [
    ['NNPC Limited','https://linkedin.com/in/ada-okafor'],
    ['Central Bank of Nigeria','https://linkedin.com/in/ada-okafor'],
    ['Green Soft Ltd','https://nnpcgroup.com/team/ada'],
    ['Green Soft Ltd','https://agency.gob.mx/team/ada'],
    ['Green Soft Ltd','https://un.org/team/ada'],
    ['Green Soft Ltd','https://127.0.0.1/team/ada']
  ])assert.equal(privateSourcePage({title:`Ada Okafor - CEO at ${company}`,url,description:'Private software and energy company · Location: Lagos, Nigeria'}),null,company+' '+url);
});

test('selected audiences are explored separately when the first audience query is empty',async()=>{
  const requests=[];
  const result=await discoverPrivatePages(goalInput({audience:'CEO, Founder',limit:1}),{key:'fixture',provider:'serper',maxQueries:8,transport:async(url,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    return Response.json({organic:/\bFounder\b/.test(request.q)?[goalRow(0,{title:'Ada Okafor - Founder at Green Soft Ltd | LinkedIn'})]:[]});
  }});
  assert.equal(result.returned,1);
  assert.equal(requests.length,2);
  assert.match(requests[0].q,/CEO/);assert.match(requests[1].q,/Founder/);
  assert.equal(result.target.reason,'target_reached');
});

test('low-yield selected-source pages switch vocabulary and can fill a 30-person target',async()=>{
  const requests=[];
  const row=index=>goalRow(0,{title:`Ada${String.fromCharCode(97+Math.floor(index/26))}${String.fromCharCode(97+index%26)} Okafor - Chief Executive Officer at Green Soft Ltd | LinkedIn`,link:`https://linkedin.com/in/complete-${index}`});
  const result=await discoverPrivatePages(goalInput({limit:30}),{key:'fixture',provider:'serper',maxQueries:8,transport:async(url,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    if(requests.length<=2)return Response.json({organic:[row(0)]});
    return Response.json({organic:Array.from({length:15},(_,index)=>row((requests.length-3)*15+index+1))});
  }});
  assert.equal(result.returned,30);assert.equal(result.target.reason,'target_reached');
  assert.equal(requests.length,4);
  assert.equal(requests[1].q,requests[0].q);assert.equal(requests[1].page,2);
  assert.notEqual(requests[2].q,requests[0].q,'a duplicate page switches to an equivalent title');
  assert.match(requests[2].q,/chief executive officer/i);
  assert.equal(new Set(result.people.map(person=>person.profile_url)).size,30);
});

test('one exact employer evidence query can supply missing industry for several matching profiles',async()=>{
  const requests=[];
  const profiles=[goalRow(0,{snippet:'Chief Executive Officer · Location: Lagos, Nigeria'}),goalRow(1,{snippet:'Chief Executive Officer · Location: Lagos, Nigeria'})];
  const result=await discoverPrivatePages(goalInput({limit:2}),{key:'fixture',provider:'serper',maxQueries:8,transport:async(url,options)=>{
    requests.push(JSON.parse(options.body));
    return Response.json({organic:requests.length===1?profiles:[{title:'Green Soft Ltd | About our business',link:'https://greensoft.example/about',snippet:'Green Soft Ltd is a privately owned software company in Lagos, Nigeria.'}]});
  }});
  assert.equal(requests.length,2);assert.equal(result.returned,2);
  assert.equal(result.diagnostics.corroborationRequests,1);assert.equal(result.diagnostics.corroboratedPeople,2);
  assert.match(requests[1].q,/Green Soft Ltd/);
  for(const person of result.people){
    assert.equal(person.industry.toLowerCase(),'software');
    assert.equal(person.source_excerpt,'Chief Executive Officer · Location: Lagos, Nigeria');
    assert.equal(person.private_sector_basis,'corroborated-commercial-business-context');
    assert.equal(person.supporting_sources[0].url,'https://greensoft.example/about');
    assert.ok(person.supporting_sources[0].supports.includes('Industry or need'));
    assert.equal(person.private_verified,undefined);
  }
});

test('company corroboration never supplies a missing personal location, role, or conflicting employer',async()=>{
  for(const profile of [
    goalRow(0,{snippet:'Chief Executive Officer · Location: Abuja, Nigeria'}),
    goalRow(0,{title:'Ada Okafor - CFO at Green Soft Ltd | LinkedIn',snippet:'Location: Lagos, Nigeria'}),
    goalRow(0,{snippet:'Chief Executive Officer · Location: Lagos, Nigeria'})
  ]){
    const requests=[];
    const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',maxQueries:2,transport:async(url,options)=>{
      requests.push(JSON.parse(options.body));
      return Response.json({organic:requests.length===1?[profile]:[{title:'Green Other Ltd | About',link:'https://other.example/',snippet:'Private software company in Lagos, Nigeria. Clients include Green Soft Ltd.'}]});
    }});
    assert.equal(result.returned,0);
    if(!/Abuja|CFO/.test(profile.title+' '+profile.snippet))assert.equal(result.diagnostics.corroborationRequests,1);
    else assert.equal(result.diagnostics.corroborationRequests,0);
  }
});

test('each actual request claims one budget unit and a later denial preserves partial people',async()=>{
  let claims=0,calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:8,beforeRequest:async()=>++claims<3,transport:async()=>Response.json({organic:[goalRow(calls++)]})});
  assert.equal(claims,3);assert.equal(calls,2);assert.equal(result.requestsUsed,2);
  assert.equal(result.returned,2);assert.equal(result.target.reason,'daily_budget_reached');
  assert.equal(result.target.remaining,1);assert.match(result.notice,/daily source-search budget/);
  const denied=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',beforeRequest:async()=>false,transport:async()=>{throw new Error('must not spend');}});
  assert.equal(denied.requestsUsed,0);assert.equal(denied.target.reason,'daily_budget_reached');
});

test('search stops at its total time bound and preserves already found people',async t=>{
  let calls=0,clock=0;
  // Source parsing can legitimately consume the original 10 ms fixture under
  // concurrent test load. Control the clock, not the production deadline.
  t.mock.method(Date,'now',()=>clock);
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',maxQueries:8,maxDurationMs:10,transport:async(url,options)=>{
    if(++calls===1)return Response.json({organic:[goalRow(0)]});
    clock=11;
    return await new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});setTimeout(()=>resolve(Response.json({organic:[]})),30);});
  }});
  assert.equal(result.returned,1);assert.equal(result.target.reason,'time_budget_reached');
  assert.equal(calls,2);assert.equal(result.target.remaining,2);assert.match(result.notice,/time limit/);
});

test('Brave pagination never exceeds the documented offset ceiling',async()=>{
  const requests=[];
  const result=await discoverPrivatePages(goalInput({limit:30}),{key:'fixture',provider:'brave',maxQueries:12,transport:async url=>{
    const parsed=new URL(url);requests.push(parsed);
    const index=requests.length-1,row=goalRow(index,{title:`Ada${String.fromCharCode(97+index)} Okafor - CEO at Green Soft Ltd | LinkedIn`,link:`https://linkedin.com/in/offset-${index}`});
    return Response.json({query:{more_results_available:true},web:{results:[{title:row.title,url:row.link,description:row.snippet}]}});
  }});
  assert.equal(requests.length,12);assert.equal(result.returned,12);
  assert.ok(requests.every(url=>Number(url.searchParams.get('offset')||0)<=9));
  assert.notEqual(requests[10].searchParams.get('q'),requests[0].searchParams.get('q'));
});


test('profiles missing an employer remain incomplete even when their other filters match',async()=>{
  const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:[goalRow(0,{title:'Ada Okafor - CEO | LinkedIn',snippet:'Private company building software · Location: Lagos, Nigeria'})]})});
  assert.equal(result.returned,0);assert.equal(result.diagnostics.missingIdentity,1);
});

test('same-name employer evidence from a conflicting geography cannot complete a profile',async()=>{
  let calls=0;
  const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',maxQueries:2,transport:async()=>Response.json({organic:++calls===1?[goalRow(0,{snippet:'Location: Lagos, Nigeria'})]:[{title:'Green Soft Ltd | About',link:'https://same-name.example/',snippet:'Privately owned software company · Location: London, UK'}]})});
  assert.equal(result.returned,0);assert.equal(result.diagnostics.corroborationRequests,1);
});


test('a later budget-control outage preserves evidence without making an unreserved provider request',async()=>{
  let claims=0,calls=0;
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',beforeRequest:async()=>{if(++claims===2)throw new Error('sensitive provider diagnostic');return true;},transport:async()=>{calls++;return Response.json({organic:[goalRow(0)]});}});
  assert.equal(calls,1);assert.equal(claims,2);assert.equal(result.returned,1);
  assert.equal(result.target.reason,'budget_unavailable');assert.equal(result.target.remaining,2);
  assert.equal(JSON.stringify(result).includes('sensitive provider diagnostic'),false);
});


test('government email evidence excludes otherwise matching direct and corroborated private-looking people',async()=>{
  for(const corroborated of [false,true]){
    let calls=0;
    const profile=goalRow(0,{snippet:(corroborated?'Chief Executive Officer':'Private software company')+' · Location: Lagos, Nigeria · Contact: ada@health.gov.ng'});
    const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',maxQueries:corroborated?2:1,transport:async()=>Response.json({organic:++calls===1?[profile]:[{title:'Green Soft Ltd | About',link:'https://greensoft.example/about',snippet:'Privately owned software company in Lagos, Nigeria.'}]})});
    assert.equal(result.returned,0);assert.equal(result.people.length,0);
    assert.ok(result.diagnostics.excludedSectorOrSource>=1);
    assert.equal(result.diagnostics.corroborationRequests,corroborated?1:0);
    assert.equal(result.diagnostics.corroboratedPeople,0);
  }
});

test('a free-plan restriction switches the entire search to plain queries after one failed precise attempt',async()=>{
  const requests=[];
  const result=await discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',queryMode:'auto',maxQueries:8,transport:async(url,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    return /site:/.test(request.q)?Response.json({message:'Query pattern not allowed for free accounts.'},{status:400}):Response.json({organic:[goalRow(requests.length-2)]});
  }});
  assert.equal(result.returned,3);assert.equal(requests.length,4);
  assert.equal(requests.filter(request=>/site:/.test(request.q)).length,1);
  assert.ok(requests.slice(1).every(request=>!/site:|\bOR\b|[()"]/.test(request.q)));
  assert.equal(result.diagnostics.sourceOperatorsRestricted,true);
});

test('repeated free-plan query restrictions stop after the single fallback rather than spending the full budget',async()=>{
  let calls=0;
  await assert.rejects(discoverPrivatePages(goalInput(),{key:'fixture',provider:'serper',queryMode:'auto',maxQueries:8,transport:async()=>{calls++;return Response.json({message:'Query pattern not allowed for free accounts.'},{status:400});}}),error=>error.code==='QUERY_RESTRICTED');
  assert.equal(calls,2);
});

test('another excerpt on the same personal profile can complete missing personal location with inspectable provenance',async()=>{
  const requests=[];
  const first=goalRow(0,{snippet:'Private software company CEO at Green Soft Ltd'});
  const second=goalRow(0,{link:'https://ng.linkedin.com/in/goal-0',snippet:'Private company · Location: Lagos, Nigeria'});
  const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',maxQueries:3,transport:async(url,options)=>{requests.push(JSON.parse(options.body));return Response.json({organic:requests.length===1?[first]:[second]});}});
  assert.equal(requests.length,2);assert.equal(result.returned,1);
  assert.match(requests[1].q,/Ada Okafor/);assert.match(requests[1].q,/Green Soft Ltd/);
  assert.equal(result.diagnostics.mergedProfileEvidence,1);
  assert.equal(result.people[0].location,'Lagos, Nigeria');
  assert.equal(result.people[0].source_excerpt,second.snippet);
  assert.equal(result.people[0].supporting_sources[0].excerpt,first.snippet);
  assert.equal(result.people[0].supporting_sources[0].url,first.link);
  assert.equal(result.people[0].private_verified,undefined);
});

test('same-profile joins reject name, employer, role, and observed personal-location conflicts',async()=>{
  for(const conflict of ['name','employer','role','location']){
    const first=goalRow(0,{snippet:conflict==='location'?'Private software company · Location: Abuja, Nigeria':'Private software company'});
    const second=goalRow(0,{snippet:'Private company · Location: Lagos, Nigeria',...(conflict==='name'?{title:'Ben Smith - CEO at Green Soft Ltd | LinkedIn'}:conflict==='employer'?{title:'Ada Okafor - CEO at Green Other Ltd | LinkedIn'}:conflict==='role'?{title:'Ada Okafor - CFO at Green Soft Ltd | LinkedIn'}:{})});
    let calls=0;
    const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',maxQueries:2,transport:async()=>Response.json({organic:++calls===1?[first]:[second]})});
    assert.equal(result.returned,0,conflict);assert.equal(result.diagnostics.mergedProfileEvidence||0,0,conflict);
  }
});

test('different personal profiles and company team pages cannot join snippets into a person match',async()=>{
  for(const [firstUrl,secondUrl] of [
    ['https://linkedin.com/in/ada-east','https://linkedin.com/in/ada-west'],
    ['https://greensoft.example/team/ada','https://greensoft.example/team/ada']
  ]){
    const first=goalRow(0,{link:firstUrl,snippet:'Ada Okafor is CEO at Green Soft Ltd, a private software company.'});
    const second=goalRow(0,{link:secondUrl,snippet:'Ada Okafor is CEO at Green Soft Ltd, a private company. Location: Lagos, Nigeria'});
    let calls=0;
    const result=await discoverPrivatePages(goalInput({source:'',limit:1}),{key:'fixture',provider:'serper',maxQueries:2,transport:async()=>Response.json({organic:++calls===1?[first]:[second]})});
    assert.equal(result.returned,0);assert.equal(result.diagnostics.mergedProfileEvidence||0,0);
  }
});


test('same personal profile across country subdomains remains one person after snippet enrichment',async()=>{
  const rows=[goalRow(0),goalRow(0,{link:'https://ng.linkedin.com/in/goal-0',snippet:'Private software company CEO · Location: Lagos, Nigeria · Published professional profile'})];
  const result=await discoverPrivatePages(goalInput({limit:2}),{key:'fixture',provider:'serper',maxQueries:1,transport:async()=>Response.json({organic:rows})});
  assert.equal(result.returned,1);assert.equal(result.diagnostics.duplicatePeople,1);
});


test('Serper defaults to plain queries without spending a request probing known free-plan restrictions',async()=>{
  assert.equal(searchConfiguration({SERPER_API_KEY:'fixture'}).queryMode,'plain');
  assert.equal(searchConfiguration({SERPER_API_KEY:'fixture',PULL_SERPER_QUERY_MODE:'plain'}).queryMode,'plain');
  assert.equal(searchConfiguration({SERPER_API_KEY:'fixture',PULL_SERPER_QUERY_MODE:'invalid'}).queryMode,'plain');
  assert.equal(searchConfiguration({SERPER_API_KEY:'fixture',PULL_SERPER_QUERY_MODE:'auto'}).queryMode,'auto');
  const requests=[];
  const result=await discoverPrivatePages(goalInput({limit:1}),{key:'fixture',provider:'serper',transport:async(url,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    assert.doesNotMatch(request.q,/site:|\bOR\b|[()"]/);
    return Response.json({organic:[goalRow(0)]});
  }});
  assert.equal(requests.length,1);assert.equal(result.returned,1);assert.equal(result.requestsUsed,1);
  assert.match(requests[0].q,/linkedin/i);
  assert.equal(result.diagnostics.sourceOperatorsRestricted,undefined);
});

test('Exa is optional, preferred when keyed, and explicit provider selection never spends a different key',()=>{
  const env={EXA_API_KEY:'exa-fixture',SERPER_API_KEY:'serper-fixture',BRAVE_SEARCH_API_KEY:'brave-fixture'};
  assert.equal(searchConfiguration(env).provider,'exa');assert.equal(searchConfiguration(env).key,'exa-fixture');
  assert.equal(searchConfiguration({...env,PULL_SEARCH_PROVIDER:'serper'}).key,'serper-fixture');
  assert.equal(searchConfiguration({...env,PULL_SEARCH_PROVIDER:'brave'}).key,'brave-fixture');
  assert.equal(searchConfiguration({EXA_API_KEY:'exa-fixture',PULL_SEARCH_PROVIDER:'serper'}),null);
  assert.equal(searchConfiguration({SERPER_API_KEY:'serper-fixture',PULL_SEARCH_PROVIDER:'exa'}),null);
});

const exaRow=(index,overrides={})=>{const row=goalRow(index);return {title:row.title,url:row.link,highlights:[row.snippet],...overrides};};

test('Exa uses one fixed search endpoint with highlights, private server authentication and bounded natural-language retrieval',async()=>{
  const requests=[];
  const result=await discoverPrivatePages(goalInput({limit:1}),{key:'exa-secret-fixture',provider:'exa',transport:async(url,options)=>{
    const payload=JSON.parse(options.body);requests.push({url:String(url),options,payload});return Response.json({results:[exaRow(0)]});
  }});
  assert.equal(result.provider,'exa');assert.equal(result.returned,1);assert.equal(requests.length,1);
  const {url,options,payload}=requests[0];
  assert.equal(url,'https://api.exa.ai/search');assert.equal(options.method,'POST');assert.equal(options.headers['x-api-key'],'exa-secret-fixture');
  assert.equal(options.redirect,'error');assert.equal(options.signal instanceof AbortSignal,true);
  assert.equal(payload.type,'auto');assert.equal(payload.numResults,10);assert.deepEqual(payload.contents,{highlights:true});
  assert.deepEqual(payload.includeDomains,['linkedin.com/in/']);
  assert.match(payload.query,/CEO/);assert.match(payload.query,/Software/);assert.match(payload.query,/Lagos, Nigeria/);assert.match(payload.query,/private-sector/);
  assert.doesNotMatch(payload.query,/site:|\bOR\b/);
  assert.deepEqual(Object.keys(payload).sort(),['contents','includeDomains','numResults','query','type']);
  assert.equal(JSON.stringify(result).includes('exa-secret-fixture'),false);
});

test('Exa diversifies distinct queries without pagination and leaves broad sources unrestricted',async()=>{
  for(const source of ['', 'Private websites']){
    const requests=[];
    const result=await discoverPrivatePages(goalInput({source,limit:50}),{key:'fixture',provider:'exa',maxQueries:3,transport:async(url,options)=>{const payload=JSON.parse(options.body);requests.push(payload);return Response.json({results:[exaRow(0)]});}});
    assert.equal(requests.length,3);assert.equal(new Set(requests.map(request=>request.query)).size,3);
    assert.ok(requests.every(request=>request.numResults===20&&!('includeDomains' in request)&&!('page' in request)&&!('offset' in request)&&!('cursor' in request)));
    assert.equal(result.returned,1);assert.equal(result.target.remaining,49);assert.equal(result.requestsUsed,3);
  }
});

test('Exa highlights pass the same source, role, location, private-sector and identity gates',async()=>{
  const result=await discoverPrivatePages(goalInput({limit:30}),{key:'fixture',provider:'exa',maxQueries:1,transport:async()=>Response.json({results:[
    exaRow(0),
    exaRow(1,{title:'Ben Smith - CFO at Green Soft Ltd | LinkedIn'}),
    exaRow(2,{highlights:['Private software company · Location: Abuja, Nigeria']}),
    exaRow(3,{title:'Dara Bello - CEO at NNPC Limited | LinkedIn'}),
    exaRow(4,{url:'https://linkedin.com.private.example/in/ebele'}),
    exaRow(5,{url:'https://ministry.gov.ng/team/farah'}),
    exaRow(6,{highlights:['Private fashion company · Location: Lagos, Nigeria']}),
    exaRow(7,{highlights:[{text:'Private software company · Location: Lagos, Nigeria'}]})
  ]})});
  assert.deepEqual(result.people.map(person=>person.name),['Ada Okafor']);
  assert.equal(result.people[0].source_excerpt,goalRow(0).snippet);
  assert.equal(result.target.remaining,29);assert.equal(result.target.reason,'request_budget_reached');
});

test('Exa credit exhaustion stops immediately and preserves earlier evidence without provider fallback',async()=>{
  for(const foundBeforeFailure of [false,true]){
    let calls=0;
    const run=()=>discoverPrivatePages(goalInput(),{key:'exa-secret-fixture',provider:'exa',maxQueries:8,transport:async url=>{
      assert.equal(String(url),'https://api.exa.ai/search');calls++;
      return foundBeforeFailure&&calls===1?Response.json({results:[exaRow(0)]}):Response.json({error:'exa-secret-fixture billing detail'},{status:402});
    }});
    if(foundBeforeFailure){const result=await run();assert.equal(result.returned,1);assert.equal(result.target.reason,'provider_credits_exhausted');assert.match(result.notice,/no free search credits/);assert.equal(JSON.stringify(result).includes('exa-secret-fixture'),false);assert.equal(calls,2);}
    else{await assert.rejects(run(),error=>error.code==='CREDITS_EXHAUSTED'&&!error.message.includes('exa-secret-fixture'));assert.equal(calls,1);}
  }
});

test('Exa malformed results fail without falling back or inventing evidence',async()=>{
  let calls=0;
  await assert.rejects(discoverPrivatePages(goalInput(),{key:'fixture',provider:'exa',transport:async()=>{calls++;return Response.json({results:{text:'synthetic result'}});}}),/temporarily unavailable/);
  assert.equal(calls,1);
});


test('Exa employer corroboration can use a private company website while prospect profiles retain the selected source',async()=>{
  const requests=[];
  const profiles=[exaRow(0,{highlights:['Chief Executive Officer · Location: Lagos, Nigeria']}),exaRow(1,{highlights:['Chief Executive Officer · Location: Lagos, Nigeria']}),exaRow(2,{url:'https://greensoft.example/team/chidi'})];
  const result=await discoverPrivatePages(goalInput({limit:2}),{key:'fixture',provider:'exa',maxQueries:8,transport:async(url,options)=>{
    const payload=JSON.parse(options.body);requests.push(payload);
    return Response.json({results:requests.length===1?profiles:[{title:'Green Soft Ltd | About our business',url:'https://greensoft.example/about',highlights:['Green Soft Ltd is a privately owned software company in Lagos, Nigeria.']}]});
  }});
  assert.equal(requests.length,2);assert.equal(result.returned,2);
  assert.deepEqual(requests[0].includeDomains,['linkedin.com/in/']);
  assert.equal('includeDomains' in requests[1],false,'corporate corroboration is not restricted to personal profile paths');
  assert.match(requests[1].query,/Green Soft Ltd/);
  assert.equal(result.diagnostics.corroborationRequests,1);assert.equal(result.diagnostics.corroboratedPeople,2);
  assert.deepEqual(result.people.map(person=>person.name),['Ada Okafor','Ben Smith']);
  for(const person of result.people){assert.match(person.profile_url,/linkedin\.com\/in\//);assert.equal(person.supporting_sources[0].url,'https://greensoft.example/about');assert.equal(person.private_verified,undefined);}
});
