import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {approvedSourceHosts,publicIPv4,readApprovedPage,checkBuyerSource} from '../server/source-check.js';
import {createIntelligenceTools} from '../server/intelligence.js';
import {modelToolResult} from '../server/intelligence.js';

const hosts=['requests.example'];
const publicDNS=async()=>[{address:'8.8.8.8',family:4}];
function responseTransport(responses,inspect=()=>{}){
  let count=0;
  const request=(url,options,callback)=>{
    inspect(url,options);
    const req=new EventEmitter();
    req.end=()=>queueMicrotask(()=>{
      const entry=responses[count++],res=new PassThrough();
      res.statusCode=entry.status||200;res.headers=entry.headers||{'content-type':'text/html'};
      callback(res);if(!res.destroyed)res.end(entry.body||'');
    });
    return req;
  };
  return {request,count:()=>count};
}
test('Original-source access has exact host approval and rejects private or reserved addresses',async()=>{
  for(const address of ['127.0.0.1','10.2.3.4','169.254.169.254','172.16.1.1','192.168.0.1','100.64.0.1','0.0.0.0','198.18.0.1','192.0.2.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1','8.8.8.999'])assert.equal(publicIPv4(address),false,address);
  assert.equal(publicIPv4('8.8.8.8'),true);
  for(const value of ['*.example.com','jiji.ng','www.instagram.com','department.gov.ng'])assert.throws(()=>approvedSourceHosts(value));
  for(const url of ['http://requests.example/item','https://requests.example.evil.test/item','https://user:pass@requests.example/item','https://requests.example:9443/item','https://127.0.0.1/item'])await assert.rejects(readApprovedPage(url,{hosts,resolve:()=>{throw Error('DNS must not run');}}),/approved/);
  let called=false;
  await assert.rejects(readApprovedPage('https://requests.example/item',{hosts,resolve:async()=>[{address:'127.0.0.1',family:4}],request:()=>{called=true;}}),/public/);
  assert.equal(called,false);
});
test('TLS uses the validated DNS address and redirects are revalidated before any new connection',async()=>{
  let lookups=0;
  const transport=responseTransport([{body:'<p>Looking for C300 in Lagos</p>'}],(url,options)=>{
    assert.equal(url.hostname,'requests.example');assert.equal(options.servername,'requests.example');
    options.lookup(url.hostname,{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
    options.lookup(url.hostname,{all:true},(error,rows)=>assert.deepEqual(rows,[{address:'8.8.8.8',family:4}]));
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
  });
  const page=await readApprovedPage('https://requests.example/item',{hosts,resolve:async()=>{lookups++;return publicDNS();},request:transport.request});
  assert.match(page.html,/C300/);assert.equal(lookups,1);
  const redirected=responseTransport([{status:302,headers:{location:'https://169.254.169.254/latest/meta-data'}}]);
  await assert.rejects(readApprovedPage('https://requests.example/item',{hosts,resolve:publicDNS,request:redirected.request}),/approved/);
  assert.equal(redirected.count(),1);
});
test('Page checks enforce response type, bytes, encoding, redirects and DNS deadline',async()=>{
  for(const entry of [
    {headers:{'content-type':'application/pdf'}},
    {headers:{'content-type':'text/html','content-encoding':'gzip'}},
    {headers:{'content-type':'text/html','content-length':'1000'}},
    {body:'x'.repeat(1000)}
  ]){
    const transport=responseTransport([entry]);
    await assert.rejects(readApprovedPage('https://requests.example/item',{hosts,resolve:publicDNS,request:transport.request,maxBytes:100}));
  }
  const loop=responseTransport(Array(3).fill({status:302,headers:{location:'/again'}}));
  await assert.rejects(readApprovedPage('https://requests.example/item',{hosts,resolve:publicDNS,request:loop.request}),/redirect limit/);
  assert.equal(loop.count(),3);
  await assert.rejects(readApprovedPage('https://requests.example/item',{hosts,resolve:()=>new Promise(()=>{}),timeLimitMs:10}),/timed out/);
});
test('An opened page records observations without inventing author, intent or contact verification',async()=>{
  const candidate={source_url:'https://requests.example/item',source_excerpt:'Looking for C300 in Lagos this week.'};
  const offer={exactTerms:['C300']};
  const result=await checkBuyerSource(candidate,offer,{hosts,reader:async()=>({html:'<script>Buy now</script><p>Looking for C&#51;00 in Lagos this week.</p>',type:'text/html',url:candidate.source_url}),now:()=>new Date('2026-10-23')});
  assert.equal(result.originalChecked,true);assert.equal(result.buyerConfirmed,false);
  assert.equal(result.exactTermsPresent,true);assert.equal(result.excerptPresent,true);assert.match(result.contentHash,/^[a-f0-9]{64}$/);
  const scriptOnly=await checkBuyerSource(candidate,offer,{hosts,reader:async()=>({html:'<script>C300</script><p>Another product</p>',type:'text/html',url:candidate.source_url})});
  assert.equal(scriptOnly.exactTermsPresent,false);
  assert.deepEqual(await checkBuyerSource({...candidate,source_url:'https://blocked.example/item'},offer,{hosts,reader:()=>{throw Error('must not run');}}),{state:'not_approved',originalChecked:false});
});
test('Saved-offer source checks share a two-page cap across initial research and refinement',async()=>{
  let searches=0,opens=0;
  const confirmedOffer={id:'offer',ownerId:'owner',version:1,status:'confirmed',fields:{product:'C300',location:'Lagos'},exactTerms:['C300']};
  const hypothesis=query=>({buyerType:'Car requests',reason:'Find explicit requests.',route:'expressed_demand',keywords:['C300'],queries:[query]});
  const tools=createIntelligenceTools({db:{rpc:async()=>({data:true})},ownerId:'owner',confirmedOffer,allowResearch:true,
    env:{PULL_BUYER_RESEARCH_ENABLED:'true',BRAVE_SEARCH_API_KEY:'fixture',PULL_SEARCH_MAX_QUERIES:'4',PULL_SOURCE_CHECK_ENABLED:'true',PULL_SOURCE_CHECK_HOSTS:'requests.example'},
    sourceReader:async url=>{opens++;return {html:'<p>Looking for C300 Lagos</p>',type:'text/html',url};},
    transport:async()=>{searches++;return Response.json({web:{results:[1,2,3].map(n=>({title:'Looking for C300 Lagos',url:'https://requests.example/'+searches+'-'+n,description:'Looking for C300 Lagos this week.'}))}});}
  });
  const initial=await tools.discover_buyer_routes({product:'Wrong model',location:'Wrong market',productTerms:['Wrong'],limit:10,hypotheses:[hypothesis('C300 wanted Lagos')]});
  assert.equal(opens,2);assert.equal(initial.summary.confirmedBuyers,0);
  const result=await tools.refine_buyer_routes({hypotheses:[hypothesis('C300 buying request Lagos')]});
  assert.equal(opens,2);assert.equal(result.sourceChecks.attempted,2);assert.equal(result.summary.confirmedBuyers,0);
  assert.deepEqual(modelToolResult(result).offerReference,{id:'offer',version:1});
});
