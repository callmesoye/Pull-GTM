import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryInput,privateSourcePage,discoverPrivatePages} from '../server/discovery.js';

test('discovery accepts distinct goals and limits results to 50',()=>{
  assert.equal(discoveryInput({audience:'School teachers',industry:'Yam',location:'Ikeja',limit:50}).limit,50);
  assert.equal(discoveryInput({audience:'Founders',industry:'Agriculture',location:'Lagos',source:'Private websites'}).audience,'Founders');
  assert.throws(()=>discoveryInput({audience:'Buyers',industry:'Cars',location:'Lagos',limit:51}));
});

test('public and government pages are excluded even if search returns them',()=>{
  assert.equal(privateSourcePage({title:'Ministry directory',url:'https://business.gov.ng/list',description:'Companies'}),null);
  assert.equal(privateSourcePage({title:'Public university jobs',url:'https://jobs.example.com',description:'Hiring'}),null);
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
