import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryInput,privateSourcePage,discoverPrivatePages,searchConfiguration} from '../server/discovery.js';
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

test('source search returns only live source candidates, with no invented people',async()=>{
  let count=0;
  const transport=async()=>{count++;return new Response(JSON.stringify({web:{results:[{title:'Private car dealership',url:'https://dealer.example.com/cars',description:'Used cars in Lagos'},{title:'Federal agency',url:'https://agency.gov.ng',description:'Vehicle registry'}]}}),{status:200});};
  const result=await discoverPrivatePages(discoveryInput({audience:'Car buyers',industry:'Used cars',location:'Lagos',limit:30}),{key:'test',transport});
  assert.equal(count,2);
  assert.equal(result.candidates.length,1);
  assert.match(result.notice,/not verified customers/i);
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
